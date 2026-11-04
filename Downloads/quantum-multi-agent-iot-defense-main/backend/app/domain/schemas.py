from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]


class FeatureVectorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    features: dict[str, FiniteFloat]
    correlation_id: UUID = Field(default_factory=uuid4)


class ClassProbability(BaseModel):
    class_id: int
    class_name: str
    probability: float = Field(ge=0.0, le=1.0)


class InferenceResponse(BaseModel):
    correlation_id: UUID
    model_kind: Literal[
        "classical_binary", "classical_multiclass", "qml_binary", "qml_multiclass"
    ]
    model_name: str
    predicted_class_id: int
    predicted_class_name: str
    confidence: float = Field(ge=0.0, le=1.0)
    probabilities: list[ClassProbability]
    threshold: float | None = None
    latency_ms: float = Field(ge=0.0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="after")
    def binary_threshold_present(self) -> "InferenceResponse":
        if self.model_kind.endswith("binary") and self.threshold is None:
            raise ValueError("binary inference responses require a threshold")
        return self


class CombinedInferenceResponse(BaseModel):
    correlation_id: UUID
    results: list[InferenceResponse]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str


class ModelInfo(BaseModel):
    feature_count: int
    feature_names: list[str]
    qml_device: str
    models: dict[str, str]
    thresholds: dict[str, float]
