from collections import deque

from app.domain.agents import AgentType
from app.simulation.bus import AsyncEventBus
from app.simulation.events import (
    NetworkActivityEvent,
    ObservationEvent,
    ObservationPayload,
    SimulationEvent,
    TelemetryEvent,
)

from .base import BaseAgent
from .utils import event_identity


class MonitoringAgent(BaseAgent):
    def __init__(self, bus: AsyncEventBus, *, activity_limit: int = 200, audit_limit: int = 500):
        super().__init__(
            agent_id="monitoring-agent",
            agent_type=AgentType.MONITORING,
            name="Monitoring Agent",
            role="Observe telemetry and network structure without making ML claims",
            bus=bus,
            subscriptions={"telemetry", "network_activity"},
            audit_limit=audit_limit,
        )
        self.recent_activity: deque[dict[str, object]] = deque(maxlen=activity_limit)
        self.telemetry_events = 0
        self.network_events = 0
        self.structural_anomalies = 0

    async def handle_event(self, event: SimulationEvent) -> None:
        if isinstance(event, TelemetryEvent):
            self.telemetry_events += 1
            device_ids = [event.payload.device_id]
            kind = "telemetry_activity"
            anomaly = False
            summary = f"Telemetry received from {event.payload.device_id}"
            evidence = {"reading_count": len(event.payload.readings)}
        elif isinstance(event, NetworkActivityEvent):
            self.network_events += 1
            device_ids = [event.payload.source_device_id, event.payload.destination_device_id]
            anomaly = not event.payload.success or event.payload.packet_count == 0
            if anomaly:
                self.structural_anomalies += 1
            kind = "structural_anomaly" if anomaly else "network_activity"
            summary = (
                "Structurally invalid or failed network activity"
                if anomaly
                else "Normal network structure observed"
            )
            evidence = {
                "packet_count": event.payload.packet_count,
                "byte_count": event.payload.byte_count,
                "protocol": event.payload.protocol,
                "success": event.payload.success,
            }
        else:
            return
        self.recent_activity.append(
            {"event_type": event.event_type, "correlation_id": str(event.correlation_id)}
        )
        observation = ObservationEvent(
            **event_identity(self.agent_id, event.correlation_id),
            payload=ObservationPayload(
                observation_kind=kind,
                device_ids=list(dict.fromkeys(device_ids)),
                summary=summary,
                anomaly_detected=anomaly,
                evidence=evidence,
            ),
        )
        await self.publish(observation, "published structural observation")

    def public_state(self) -> dict[str, object]:
        return {
            "recent_activity_count": len(self.recent_activity),
            "telemetry_events": self.telemetry_events,
            "network_events": self.network_events,
            "structural_anomalies": self.structural_anomalies,
            "queued_events": self._queue.qsize(),
        }
