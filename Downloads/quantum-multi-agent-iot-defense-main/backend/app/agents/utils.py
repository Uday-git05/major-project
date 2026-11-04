from datetime import datetime, timezone
from uuid import uuid4

from app.domain.schemas import InferenceResponse
from app.simulation.events import PredictionEvidence


def event_identity(agent_id: str, correlation_id):
    return {
        "event_id": uuid4(),
        "timestamp": datetime.now(timezone.utc),
        "source": agent_id,
        "correlation_id": correlation_id,
    }


def prediction_evidence(response: InferenceResponse) -> PredictionEvidence:
    return PredictionEvidence(
        predicted_class_id=response.predicted_class_id,
        predicted_class_name=response.predicted_class_name,
        confidence=response.confidence,
        threshold=response.threshold,
        model_name=response.model_name,
        latency_ms=response.latency_ms,
        created_at=response.created_at,
    )
