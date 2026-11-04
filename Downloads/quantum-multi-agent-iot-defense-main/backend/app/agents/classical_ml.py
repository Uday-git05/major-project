import asyncio

from app.domain.agents import AgentType
from app.inference.service import InferenceService
from app.simulation.bus import AsyncEventBus
from app.simulation.events import (
    ClassicalPredictionEvent,
    ClassicalPredictionPayload,
    FeatureVectorEvent,
    SimulationEvent,
)

from .base import BaseAgent
from .utils import event_identity, prediction_evidence


class ClassicalMLAgent(BaseAgent):
    def __init__(self, bus: AsyncEventBus, inference_service: InferenceService, *, audit_limit=500):
        super().__init__(
            agent_id="classical-ml-agent",
            agent_type=AgentType.CLASSICAL_ML,
            name="Classical ML Agent",
            role="Invoke frozen classical binary and multiclass inference",
            bus=bus,
            subscriptions={"feature_vector"},
            audit_limit=audit_limit,
        )
        self.inference_service = inference_service
        self.inference_count = 0

    async def handle_event(self, event: SimulationEvent) -> None:
        if not isinstance(event, FeatureVectorEvent):
            return
        binary, multiclass = await asyncio.to_thread(
            self._infer, event.payload.features, event.correlation_id
        )
        self.inference_count += 1
        prediction = ClassicalPredictionEvent(
            **event_identity(self.agent_id, event.correlation_id),
            payload=ClassicalPredictionPayload(
                feature_vector_event_id=event.event_id,
                binary=prediction_evidence(binary),
                multiclass=prediction_evidence(multiclass),
                device_ids=[event.payload.source_device_id, event.payload.destination_device_id],
                feature_schema_version=event.payload.feature_schema_version,
                extractor_version=event.payload.extractor_version,
            ),
        )
        await self.publish(prediction, "published classical prediction evidence")

    def _infer(self, features, correlation_id):
        return (
            self.inference_service.predict_classical_binary(features, correlation_id),
            self.inference_service.predict_classical_multiclass(features, correlation_id),
        )

    def dependencies(self) -> dict[str, str]:
        return {"event_bus": "available", "phase8_inference_service": "available"}

    def public_state(self) -> dict[str, object]:
        return {"inference_count": self.inference_count, "queued_events": self._queue.qsize()}
