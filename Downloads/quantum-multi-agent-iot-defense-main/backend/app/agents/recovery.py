from uuid import uuid4

from app.domain.agents import AgentType
from app.simulation.bus import AsyncEventBus
from app.simulation.events import (
    DefenseActionEvent,
    RecoveryEvent,
    RecoveryPayload,
    SimulationEvent,
)

from .base import BaseAgent
from .utils import event_identity
from app.recovery.manager import RecoveryManager


class RecoveryAgent(BaseAgent):
    def __init__(self, bus: AsyncEventBus, *, manager: RecoveryManager | None = None,
                 audit_limit: int = 500):
        super().__init__(
            agent_id="recovery-agent",
            agent_type=AgentType.RECOVERY,
            name="Recovery Agent",
            role="Verify stable simulator recovery and roll back defenses safely",
            bus=bus,
            subscriptions=({"defense_action"} if manager is None else {
                "defense_action_completed", "simulation_tick", "attack_completed",
                "attack_cancelled", "network_activity", "telemetry", "threat_assessment"}),
            audit_limit=audit_limit,
        )
        self.recovery_records: list[RecoveryPayload] = []
        self.manager = manager

    async def handle_event(self, event: SimulationEvent) -> None:
        if self.manager is not None:
            await self.manager.handle_event(event)
            return
        if not isinstance(event, DefenseActionEvent):
            return
        record = RecoveryPayload(
            recovery_id=str(uuid4()),
            defense_action_id=event.payload.action_id,
            state="awaiting_execution",
            reason="Defense is planned but not executed; recovery cannot begin before Phase 13.",
        )
        self.recovery_records.append(record)
        output = RecoveryEvent(
            **event_identity(self.agent_id, event.correlation_id),
            payload=record,
        )
        await self.publish(output, "published non-executing recovery interface state")

    def public_state(self) -> dict[str, object]:
        if self.manager is not None:
            records = self.manager.history()
            return {
                "recovery_record_count": len(records),
                "verified_recoveries": sum(r.verified for r in records),
                "queued_events": self._queue.qsize(),
            }
        return {
            "recovery_record_count": len(self.recovery_records),
            "verified_recoveries": 0,
            "queued_events": self._queue.qsize(),
        }
