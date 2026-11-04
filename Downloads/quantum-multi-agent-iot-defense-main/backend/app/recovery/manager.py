from collections import deque
from uuid import uuid4

from app.defense.manager import DefenseActionError, DefenseManager
from app.simulation.bus import AsyncEventBus
from app.simulation.engine import SimulationEngine
from app.simulation.events import (
    AttackCancelledEvent, AttackCompletedEvent, DefenseActionCompletedEvent,
    NetworkActivityEvent, RecoveryFailedEvent, RecoveryLifecyclePayload,
    RecoveryProgressEvent, RecoveryStartedEvent, RecoveryVerifiedEvent,
    SimulationEvent, SimulationTickEvent, TelemetryEvent, ThreatAssessmentEvent,
)

from .schemas import RecoveryRecord, RecoveryState


class RecoveryManager:
    def __init__(self, bus: AsyncEventBus, simulation: SimulationEngine,
                 defense: DefenseManager, *, verification_ticks: int = 2,
                 history_limit: int = 500) -> None:
        self.bus, self.simulation, self.defense = bus, simulation, defense
        self.required_ticks = verification_ticks
        self.records: dict[str, RecoveryRecord] = {}
        self._order: deque[str] = deque(maxlen=history_limit)
        self._completed_attack_correlations: set = set()

    async def handle_event(self, event: SimulationEvent) -> None:
        if isinstance(event, DefenseActionCompletedEvent):
            if any(r.defense_action_id == event.payload.action_id for r in self.records.values()):
                return
            record = RecoveryRecord(
                recovery_id=f"recovery-{uuid4()}", defense_action_id=event.payload.action_id,
                correlation_id=event.correlation_id, state=RecoveryState.PENDING,
                created_tick=self.simulation.clock.tick_number,
                state_tick=self.simulation.clock.tick_number,
                reason="Defense completed; monitoring incident before rollback.")
            self._remember(record)
            await self._emit(RecoveryStartedEvent, record)
        elif isinstance(event, (AttackCompletedEvent, AttackCancelledEvent)):
            self._completed_attack_correlations.add(event.correlation_id)
        elif isinstance(event, ThreatAssessmentEvent) and event.payload.severity in {"high", "critical"}:
            for record in self.records.values():
                if record.correlation_id == event.correlation_id and record.state not in self._terminal:
                    record.high_assessment_seen = True
        elif isinstance(event, (NetworkActivityEvent, TelemetryEvent)):
            for record in self.records.values():
                if record.state is RecoveryState.VERIFYING:
                    record.normal_events_observed += 1
        elif isinstance(event, SimulationTickEvent):
            await self._on_tick(event.payload.tick_number)

    async def _on_tick(self, tick: int) -> None:
        for record in list(self.records.values()):
            if record.state is RecoveryState.PENDING:
                await self._transition(record, RecoveryState.MONITORING, tick,
                                       "Waiting for attack completion or cancellation.")
            if record.state is RecoveryState.MONITORING:
                if (record.correlation_id in self._completed_attack_correlations
                        and self._device_health_acceptable(record.defense_action_id)):
                    record.high_assessment_seen = False
                    await self._transition(record, RecoveryState.ELIGIBLE, tick,
                                           "Attack is inactive and defense is rollback-eligible.")
                elif tick - record.created_tick >= max(10, self.required_ticks * 5):
                    await self._transition(record, RecoveryState.MANUAL_REVIEW, tick,
                                           "Attack did not reach an inactive state in the bounded window.")
            if record.state is RecoveryState.ELIGIBLE:
                await self._transition(record, RecoveryState.RECOVERING, tick,
                                       "Applying idempotent policy rollback.")
                try:
                    await self.defense.rollback(record.defense_action_id)
                    record.normal_events_observed = 0
                    await self._transition(record, RecoveryState.VERIFYING, tick,
                                           "Rollback complete; verifying normal simulated activity.")
                except DefenseActionError as exc:
                    await self._transition(record, RecoveryState.FAILED, tick, str(exc))
            elif record.state is RecoveryState.VERIFYING:
                record.verification_ticks += 1
                if record.high_assessment_seen:
                    await self._transition(record, RecoveryState.MANUAL_REVIEW, tick,
                                           "New high-severity assessment observed during verification.")
                elif (record.verification_ticks >= self.required_ticks
                      and record.normal_events_observed > 0):
                    record.verified = True
                    await self._transition(record, RecoveryState.RECOVERED, tick,
                                           "Normal telemetry/network activity resumed and remained stable.")

    async def _transition(self, record, state, tick, reason):
        record.state, record.state_tick, record.reason = state, tick, reason
        event_class = (RecoveryVerifiedEvent if state is RecoveryState.RECOVERED else
                       RecoveryFailedEvent if state in {RecoveryState.FAILED, RecoveryState.MANUAL_REVIEW}
                       else RecoveryProgressEvent)
        await self._emit(event_class, record)

    async def _emit(self, event_class, record):
        await self.bus.publish(event_class(
            event_id=uuid4(), timestamp=self.simulation.clock.current_time,
            source="recovery-agent", correlation_id=record.correlation_id,
            payload=RecoveryLifecyclePayload(
                recovery_id=record.recovery_id, defense_action_id=record.defense_action_id,
                state=record.state, tick_number=self.simulation.clock.tick_number,
                reason=record.reason, verified=record.verified)))

    def get(self, recovery_id: str) -> RecoveryRecord:
        try: return self.records[recovery_id]
        except KeyError as exc: raise ValueError(f"Unknown recovery record: {recovery_id}") from exc

    def history(self) -> list[RecoveryRecord]: return [self.records[item] for item in self._order]

    def reset(self) -> None:
        self.records.clear()
        self._order.clear()
        self._completed_attack_correlations.clear()

    def _remember(self, record):
        if len(self._order) == self._order.maxlen: self.records.pop(self._order[0], None)
        self.records[record.recovery_id] = record
        self._order.append(record.recovery_id)

    def _device_health_acceptable(self, action_id: str) -> bool:
        action = self.defense.get(action_id)
        device = next((item for item in self.simulation.devices
                       if item.device_id == action.target), None)
        if device is None:  # Synthetic source, service, port, or gateway policy target.
            return True
        return str(device.health) not in {"critical", "unknown"}

    _terminal = {RecoveryState.RECOVERED, RecoveryState.FAILED, RecoveryState.MANUAL_REVIEW}
