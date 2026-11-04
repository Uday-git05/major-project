from uuid import uuid4

from app.domain.agents import AgentType
from app.simulation.bus import AsyncEventBus
from app.simulation.events import (
    DefenseActionEvent,
    DefenseActionPayload,
    SimulationEvent,
    ThreatAssessmentEvent,
)

from .base import BaseAgent
from .utils import event_identity

from app.defense.manager import DefenseManager


class DefenseAgent(BaseAgent):
    def __init__(self, bus: AsyncEventBus, *, manager: DefenseManager | None = None,
                 audit_limit: int = 500):
        super().__init__(
            agent_id="defense-agent",
            agent_type=AgentType.DEFENSE,
            name="Defense Agent",
            role="Apply severity policy and execute reversible simulator-only defenses",
            bus=bus,
            subscriptions={"threat_assessment"},
            audit_limit=audit_limit,
        )
        self.planned_actions: list[DefenseActionPayload] = []
        self.manager = manager

    async def handle_event(self, event: SimulationEvent) -> None:
        if not isinstance(event, ThreatAssessmentEvent) or event.payload.detected is not True:
            return
        if self.manager is not None:
            await self.manager.assess(event)
            return
        action_type = "rate_limit" if event.payload.severity in {"high", "critical"} else "review"
        proposal = DefenseActionPayload(
            action_id=str(uuid4()),
            assessment_incident_id=event.payload.incident_id,
            action_type=action_type,
            target_device_ids=event.payload.affected_devices,
            reason=(
                f"Planned only: {event.payload.decision_reason} "
                "Execution is intentionally disabled until Phase 13."
            ),
            reversible=True,
        )
        self.planned_actions.append(proposal)
        output = DefenseActionEvent(
            **event_identity(self.agent_id, event.correlation_id),
            payload=proposal,
        )
        await self.publish(output, "published planned defense proposal without execution")

    def public_state(self) -> dict[str, object]:
        if self.manager is not None:
            actions = self.manager.history()
            return {
                "planned_action_count": sum(a.status == "planned" for a in actions),
                "executed_action_count": sum(a.status in {"completed", "rolled_back"} for a in actions),
                "queued_events": self._queue.qsize(),
            }
        return {
            "planned_action_count": len(self.planned_actions),
            "executed_action_count": 0,
            "queued_events": self._queue.qsize(),
        }
