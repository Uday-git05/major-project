from collections import deque
from uuid import uuid4

from app.simulation.bus import AsyncEventBus
from app.simulation.engine import SimulationEngine
from app.simulation.events import (
    DefenseActionCompletedEvent, DefenseActionFailedEvent, DefenseActionRequestedEvent,
    DefenseActionStartedEvent, DefenseLifecyclePayload, DefenseRollbackEvent,
    HumanOverrideEvent, ThreatAssessmentEvent,
)

from .policy import VirtualSecurityPolicyStore
from .schemas import ActionStatus, DefenseActionRecord


class DefenseActionError(ValueError):
    pass


class DefenseManager:
    def __init__(self, bus: AsyncEventBus, simulation: SimulationEngine,
                 policy: VirtualSecurityPolicyStore, *, enabled: bool = True,
                 minimum_severity: str = "high", max_concurrent: int = 4,
                 history_limit: int = 500) -> None:
        self.bus, self.simulation, self.policy = bus, simulation, policy
        self.enabled, self.minimum_severity = enabled, minimum_severity
        self.max_concurrent = max_concurrent
        self.actions: dict[str, DefenseActionRecord] = {}
        self._order: deque[str] = deque(maxlen=history_limit)
        self._incident_keys: dict[tuple[str, str, str], str] = {}

    async def assess(self, event: ThreatAssessmentEvent) -> DefenseActionRecord | None:
        p = event.payload
        if p.detected is not True or p.severity in {"informational", "low"}:
            return None
        action_type, target = self._select_action(p.affected_devices, p.suspected_attack_family)
        automatic = (self.enabled and not p.disagreement and p.evidence_strength == "corroborated"
                     and self._severity_value(p.severity) >= self._severity_value(self.minimum_severity))
        record = await self.request(
            incident_id=p.incident_id, action_type=action_type, target=target,
            reason=p.decision_reason,
            evidence=[f"{e.source}:{e.category}:{e.strength}" for e in p.evidence],
            correlation_id=event.correlation_id, initiated_by="defense-agent",
            automatic=automatic,
        )
        return record

    async def request(self, *, incident_id: str, action_type: str, target: str,
                      reason: str, evidence: list[str], correlation_id,
                      initiated_by: str, automatic: bool = False) -> DefenseActionRecord:
        key = (incident_id, action_type, target)
        existing_id = self._incident_keys.get(key)
        if existing_id:
            existing = self.actions[existing_id]
            if automatic and existing.status is ActionStatus.PLANNED:
                existing.reason = reason
                existing.evidence = evidence
                existing.human_override_state = "none"
                await self.execute(existing.action_id)
            return existing
        record = DefenseActionRecord(
            action_id=f"defense-{uuid4()}", correlation_id=correlation_id,
            incident_id=incident_id, action_type=action_type, target=target,
            reason=reason, evidence=evidence, status=ActionStatus.PLANNED,
            requested_at=self.simulation.clock.current_time,
            initiated_by=initiated_by,
            human_override_state="none" if automatic else "pending",
        )
        self._remember(record, key)
        await self._emit(DefenseActionRequestedEvent, record)
        if automatic:
            await self.execute(record.action_id)
        return record

    async def execute(self, action_id: str) -> DefenseActionRecord:
        record = self.get(action_id)
        if record.status is ActionStatus.COMPLETED:
            return record
        if record.status not in {ActionStatus.PLANNED, ActionStatus.APPROVED}:
            raise DefenseActionError(f"Cannot execute action while {record.status}")
        running = sum(a.status is ActionStatus.RUNNING for a in self.actions.values())
        if running >= self.max_concurrent:
            raise DefenseActionError("Maximum concurrent defense actions reached")
        record.status = ActionStatus.RUNNING
        record.started_at = self.simulation.clock.current_time
        await self._emit(DefenseActionStartedEvent, record)
        try:
            record.result = self.policy.apply(record.action_id, record.action_type, record.target)
            record.status = ActionStatus.COMPLETED
            record.completed_at = self.simulation.clock.current_time
            await self._emit(DefenseActionCompletedEvent, record)
        except Exception as exc:
            record.status = ActionStatus.FAILED
            record.result = {"error": str(exc)}
            record.completed_at = self.simulation.clock.current_time
            await self._emit(DefenseActionFailedEvent, record)
            raise DefenseActionError(str(exc)) from exc
        return record

    async def approve(self, action_id: str, actor: str, reason: str) -> DefenseActionRecord:
        record = self.get(action_id)
        if record.status is not ActionStatus.PLANNED:
            raise DefenseActionError(f"Cannot approve action while {record.status}")
        record.status, record.human_override_state = ActionStatus.APPROVED, "approved"
        record.result = {"human_actor": actor, "human_reason": reason}
        await self._emit(HumanOverrideEvent, record)
        return await self.execute(action_id)

    async def reject(self, action_id: str, actor: str, reason: str) -> DefenseActionRecord:
        return await self._terminate(action_id, ActionStatus.REJECTED, "rejected", actor, reason)

    async def cancel(self, action_id: str, actor: str, reason: str) -> DefenseActionRecord:
        return await self._terminate(action_id, ActionStatus.CANCELLED, "cancelled", actor, reason)

    async def rollback(self, action_id: str, initiated_by: str = "recovery-agent",
                       reason: str = "Recovery verification initiated safe rollback") -> DefenseActionRecord:
        record = self.get(action_id)
        if record.status is ActionStatus.ROLLED_BACK:
            return record
        if record.status is not ActionStatus.COMPLETED or not record.reversible:
            raise DefenseActionError(f"Action {action_id} is not rollback-eligible")
        record.result = self.policy.rollback(action_id)
        record.status, record.rollback_state = ActionStatus.ROLLED_BACK, "completed"
        record.human_override_state = "rollback_requested" if initiated_by != "recovery-agent" else record.human_override_state
        record.reason = f"{record.reason} | {reason}"
        await self._emit(DefenseRollbackEvent, record)
        return record

    async def _terminate(self, action_id, status, override, actor, reason):
        record = self.get(action_id)
        if record.status not in {ActionStatus.PLANNED, ActionStatus.APPROVED}:
            raise DefenseActionError(f"Cannot {override} action while {record.status}")
        record.status, record.human_override_state = status, override
        record.result = {"human_actor": actor, "human_reason": reason}
        await self._emit(HumanOverrideEvent, record)
        return record

    def get(self, action_id: str) -> DefenseActionRecord:
        try: return self.actions[action_id]
        except KeyError as exc: raise DefenseActionError(f"Unknown defense action: {action_id}") from exc

    def history(self) -> list[DefenseActionRecord]:
        return [self.actions[item] for item in self._order]

    def reset(self) -> None:
        self.actions.clear()
        self._order.clear()
        self._incident_keys.clear()
        self.policy.reset()

    async def _emit(self, event_class, record):
        payload = DefenseLifecyclePayload(
            action_id=record.action_id, incident_id=record.incident_id,
            action_type=record.action_type, target=record.target, status=record.status,
            reason=record.reason, reversible=record.reversible, result=record.result,
            rollback_state=record.rollback_state, initiated_by=record.initiated_by,
            human_override_state=record.human_override_state,
        )
        await self.bus.publish(event_class(
            event_id=uuid4(), timestamp=self.simulation.clock.current_time,
            source="defense-manager", correlation_id=record.correlation_id, payload=payload))

    def _remember(self, record, key):
        if len(self._order) == self._order.maxlen:
            self.actions.pop(self._order[0], None)
        self.actions[record.action_id] = record
        self._order.append(record.action_id)
        self._incident_keys[key] = record.action_id

    @staticmethod
    def _select_action(devices: list[str], family: str | None) -> tuple[str, str]:
        source = next((d for d in devices if d.startswith("synthetic-source")), None)
        if source: return "quarantine_synthetic_source", source
        target = devices[0] if devices else "gateway-1"
        family_key = (family or "").lower()
        if "port" in family_key: return "protect_gateway_mode", "gateway-1"
        if "http" in family_key: return "rate_limit_virtual_service", "http"
        if "mqtt" in family_key: return "rate_limit_virtual_service", "mqtt"
        return "isolate_virtual_device", target

    @staticmethod
    def _severity_value(value: str) -> int:
        return {"informational": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}.get(value, 3)
