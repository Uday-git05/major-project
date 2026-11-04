import asyncio

from app.domain.agents import AgentType
from app.inference.service import InferenceService
from app.simulation.bus import AsyncEventBus
from app.simulation.events import (
    FeatureVectorEvent,
    QuantumPredictionEvent,
    QuantumPredictionPayload,
    SimulationEvent,
)

from .base import BaseAgent
from .utils import event_identity, prediction_evidence


class QuantumMLAgent(BaseAgent):
    def __init__(self, bus: AsyncEventBus, inference_service: InferenceService, *, audit_limit=500, queue_limit=256):
        super().__init__(
            agent_id="quantum-ml-agent",
            agent_type=AgentType.QUANTUM_ML,
            name="Quantum ML Agent",
            role="Invoke frozen QML inference asynchronously as corroborating evidence",
            bus=bus,
            subscriptions={"feature_vector"},
            audit_limit=audit_limit,
            queue_limit=queue_limit,
        )
        self.inference_service = inference_service
        self.inference_count = 0

    def _enqueue(self, event: SimulationEvent) -> None:
        """Put synthetic scenario vectors before nominal work while preserving both models."""
        if self.status.value not in {"running", "degraded", "paused"}:
            return
        if not isinstance(event, FeatureVectorEvent):
            return
        pending = self._queue._queue
        focused = _is_focused(event)
        if focused:
            retained = [queued for queued in pending if _is_focused(queued)]
            removed = len(pending) - len(retained)
            if removed:
                for _ in range(removed):
                    self._queue.task_done()
                pending.clear()
                pending.extend(retained)
                self.coalesced_background_event_count += removed
            if self._queue.full():
                # Preserve every scenario vector; this only applies if focused traffic
                # itself fills the bounded queue, not when background work causes backlog.
                self.dropped_event_count += 1
                return
            pending.append(event)
            self._queue._wakeup_next(self._queue._getters)
            self._queue._unfinished_tasks += 1
            self._queue._finished.clear()
            return
        if self._queue.full():
            background_index = next((index for index, queued in enumerate(pending) if not _is_focused(queued)), None)
            if background_index is None:
                self.dropped_event_count += 1
                return
            del pending[background_index]
            self._queue.task_done()
            self.coalesced_background_event_count += 1
        self._queue.put_nowait(event)

    async def handle_event(self, event: SimulationEvent) -> None:
        if not isinstance(event, FeatureVectorEvent):
            return
        binary, multiclass = await asyncio.to_thread(
            self._infer, event.payload.features, event.correlation_id
        )
        self.inference_count += 1
        prediction = QuantumPredictionEvent(
            **event_identity(self.agent_id, event.correlation_id),
            payload=QuantumPredictionPayload(
                feature_vector_event_id=event.event_id,
                binary=prediction_evidence(binary),
                multiclass=prediction_evidence(multiclass),
                device_ids=[event.payload.source_device_id, event.payload.destination_device_id],
                feature_schema_version=event.payload.feature_schema_version,
                extractor_version=event.payload.extractor_version,
            ),
        )
        await self.publish(prediction, "published QML corroborating evidence")

    def _infer(self, features, correlation_id):
        return (
            self.inference_service.predict_qml_binary(features, correlation_id),
            self.inference_service.predict_qml_multiclass(features, correlation_id),
        )

    def dependencies(self) -> dict[str, str]:
        return {
            "event_bus": "available",
            "phase8_inference_service": "available",
            "qml_execution": "asynchronous",
        }

    def public_state(self) -> dict[str, object]:
        return {"inference_count": self.inference_count, "queued_events": self._queue.qsize(),
                "coalesced_background_events": self.coalesced_background_event_count}


def _is_focused(event: SimulationEvent) -> bool:
    return isinstance(event, FeatureVectorEvent) and event.payload.source_device_id.startswith("synthetic-source-")
