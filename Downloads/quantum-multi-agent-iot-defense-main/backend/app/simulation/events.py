from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.simulation import DeviceHealth, DeviceStatus, SimulationState


class EventEnvelope(BaseModel):
    model_config = ConfigDict(frozen=True)

    event_id: UUID
    timestamp: datetime
    event_type: str
    source: str
    correlation_id: UUID


class TelemetryPayload(BaseModel):
    device_id: str
    readings: dict[str, float | str | bool]
    unit_map: dict[str, str]


class TelemetryEvent(EventEnvelope):
    event_type: Literal["telemetry"] = "telemetry"
    payload: TelemetryPayload


class DeviceStatePayload(BaseModel):
    device_id: str
    status: DeviceStatus
    health: DeviceHealth
    reason: str


class DeviceStateEvent(EventEnvelope):
    event_type: Literal["device_state"] = "device_state"
    payload: DeviceStatePayload


class PacketSample(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    relative_timestamp_seconds: float = Field(ge=0.0, allow_inf_nan=False)
    direction: Literal["forward", "backward"]
    header_bytes: int = Field(ge=0)
    payload_bytes: int = Field(ge=0)
    total_bytes: int = Field(ge=0)
    success: bool = True
    missed_bytes: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_total(self) -> "PacketSample":
        if self.total_bytes != self.header_bytes + self.payload_bytes:
            raise ValueError("Packet total_bytes must equal header_bytes + payload_bytes")
        return self


class NetworkActivityPayload(BaseModel):
    source_device_id: str
    destination_device_id: str
    source_address: str
    destination_address: str
    source_port: int = Field(ge=1, le=65535)
    destination_port: int = Field(ge=1, le=65535)
    protocol: Literal["TCP", "UDP", "ICMP", "ARP"]
    service: str
    direction: Literal[
        "device_to_gateway", "gateway_to_device", "device_response", "synthetic_to_target"
    ]
    packet_count: int = Field(ge=0)
    byte_count: int = Field(ge=0)
    payload_bytes: int = Field(ge=0)
    header_bytes: int = Field(ge=0)
    duration_seconds: float = Field(ge=0.0)
    inter_arrival_time_seconds: float = Field(ge=0.0)
    response_packet_count: int = Field(ge=0)
    response_byte_count: int = Field(ge=0)
    success: bool
    packet_samples: list[PacketSample] = Field(default_factory=list)


class NetworkActivityEvent(EventEnvelope):
    event_type: Literal["network_activity"] = "network_activity"
    payload: NetworkActivityPayload


class SimulationTickPayload(BaseModel):
    tick_number: int = Field(ge=0)
    tick_duration_seconds: float = Field(gt=0.0)
    state: SimulationState


class SimulationTickEvent(EventEnvelope):
    event_type: Literal["simulation_tick"] = "simulation_tick"
    payload: SimulationTickPayload


class SystemHealthPayload(BaseModel):
    total_devices: int = Field(ge=0)
    online_devices: int = Field(ge=0)
    degraded_devices: int = Field(ge=0)
    offline_devices: int = Field(ge=0)
    isolated_devices: int = Field(ge=0)
    healthy: bool


class SystemHealthEvent(EventEnvelope):
    event_type: Literal["system_health"] = "system_health"
    payload: SystemHealthPayload


class AgentMessagePayload(BaseModel):
    recipient_agent_id: str | None = None
    message_kind: str
    content: dict[str, str | int | float | bool | None]


class AgentMessageEvent(EventEnvelope):
    event_type: Literal["agent_message"] = "agent_message"
    payload: AgentMessagePayload


class AgentStatusPayload(BaseModel):
    agent_id: str
    agent_type: str
    status: str
    health: str
    processed_event_count: int = Field(ge=0)
    error_count: int = Field(ge=0)


class AgentStatusEvent(EventEnvelope):
    event_type: Literal["agent_status"] = "agent_status"
    payload: AgentStatusPayload


class ObservationPayload(BaseModel):
    observation_kind: Literal["telemetry_activity", "network_activity", "structural_anomaly"]
    device_ids: list[str]
    summary: str
    anomaly_detected: bool
    evidence: dict[str, str | int | float | bool | None]


class ObservationEvent(EventEnvelope):
    event_type: Literal["observation"] = "observation"
    payload: ObservationPayload


class FeatureVectorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feature_schema_version: str
    extractor_version: str
    flow_id: str
    flow_start: datetime
    flow_end: datetime
    packet_count: int = Field(ge=1)
    is_partial_window: bool
    source_device_id: str
    destination_device_id: str
    source_event_ids: list[UUID]
    features: dict[str, float]

    @model_validator(mode="after")
    def validate_contract(self) -> "FeatureVectorPayload":
        from app.features.contract import (
            EXTRACTOR_VERSION,
            feature_contract,
            validate_feature_mapping,
        )

        schema_version, _ = feature_contract()
        if self.feature_schema_version != schema_version:
            raise ValueError(f"Expected feature schema version {schema_version}")
        if self.extractor_version != EXTRACTOR_VERSION:
            raise ValueError(f"Expected extractor version {EXTRACTOR_VERSION}")
        if self.flow_end < self.flow_start:
            raise ValueError("flow_end must not precede flow_start")
        validate_feature_mapping(self.features)
        return self


class FeatureVectorEvent(EventEnvelope):
    event_type: Literal["feature_vector"] = "feature_vector"
    payload: FeatureVectorPayload


class PredictionEvidence(BaseModel):
    predicted_class_id: int
    predicted_class_name: str
    confidence: float = Field(ge=0.0, le=1.0)
    threshold: float | None = None
    model_name: str
    latency_ms: float = Field(ge=0.0)
    created_at: datetime


class ClassicalPredictionPayload(BaseModel):
    feature_vector_event_id: UUID | None = None
    binary: PredictionEvidence
    multiclass: PredictionEvidence
    device_ids: list[str] = Field(default_factory=list)
    feature_schema_version: str
    extractor_version: str


class ClassicalPredictionEvent(EventEnvelope):
    event_type: Literal["classical_prediction"] = "classical_prediction"
    payload: ClassicalPredictionPayload


class QuantumPredictionPayload(BaseModel):
    feature_vector_event_id: UUID | None = None
    binary: PredictionEvidence
    multiclass: PredictionEvidence
    device_ids: list[str] = Field(default_factory=list)
    feature_schema_version: str
    extractor_version: str
    execution_mode: Literal["asynchronous"] = "asynchronous"


class QuantumPredictionEvent(EventEnvelope):
    event_type: Literal["quantum_prediction"] = "quantum_prediction"
    payload: QuantumPredictionPayload


class ThreatEvidence(BaseModel):
    source: str
    category: str
    summary: str
    strength: Literal["context", "supporting", "primary"]


class ThreatAssessmentPayload(BaseModel):
    incident_id: str
    affected_devices: list[str]
    detected: bool | None
    suspected_attack_family: str | None
    severity: Literal["informational", "low", "medium", "high", "critical"]
    evidence_strength: Literal["insufficient", "context_only", "primary", "corroborated"]
    evidence: list[ThreatEvidence]
    disagreement: bool
    decision_reason: str
    status: Literal["provisional"] = "provisional"


class ThreatAssessmentEvent(EventEnvelope):
    event_type: Literal["threat_assessment"] = "threat_assessment"
    payload: ThreatAssessmentPayload


class DefenseActionPayload(BaseModel):
    action_id: str
    assessment_incident_id: str
    action_type: Literal["monitor", "review", "rate_limit", "quarantine"]
    target_device_ids: list[str]
    status: Literal["planned"] = "planned"
    reason: str
    executed: Literal[False] = False
    reversible: bool = True


class DefenseActionEvent(EventEnvelope):
    event_type: Literal["defense_action"] = "defense_action"
    payload: DefenseActionPayload


class RecoveryPayload(BaseModel):
    recovery_id: str
    defense_action_id: str
    state: Literal["awaiting_execution", "not_started"]
    verified: Literal[False] = False
    reason: str


class RecoveryEvent(EventEnvelope):
    event_type: Literal["recovery"] = "recovery"
    payload: RecoveryPayload


DefenseActionType = Literal[
    "isolate_virtual_device",
    "quarantine_synthetic_source",
    "rate_limit_virtual_service",
    "restrict_virtual_port",
    "protect_gateway_mode",
    "restore_normal_policy",
]


class DefenseLifecyclePayload(BaseModel):
    action_id: str
    incident_id: str
    action_type: DefenseActionType
    target: str
    status: str
    reason: str
    reversible: bool = True
    result: dict[str, str | int | float | bool | None] = Field(default_factory=dict)
    rollback_state: str = "not_requested"
    initiated_by: str
    human_override_state: str = "none"


class DefenseActionRequestedEvent(EventEnvelope):
    event_type: Literal["defense_action_requested"] = "defense_action_requested"
    payload: DefenseLifecyclePayload


class DefenseActionStartedEvent(EventEnvelope):
    event_type: Literal["defense_action_started"] = "defense_action_started"
    payload: DefenseLifecyclePayload


class DefenseActionCompletedEvent(EventEnvelope):
    event_type: Literal["defense_action_completed"] = "defense_action_completed"
    payload: DefenseLifecyclePayload


class DefenseActionFailedEvent(EventEnvelope):
    event_type: Literal["defense_action_failed"] = "defense_action_failed"
    payload: DefenseLifecyclePayload


class DefenseRollbackEvent(EventEnvelope):
    event_type: Literal["defense_rollback"] = "defense_rollback"
    payload: DefenseLifecyclePayload


class HumanOverrideEvent(EventEnvelope):
    event_type: Literal["human_override"] = "human_override"
    payload: DefenseLifecyclePayload


class RecoveryLifecyclePayload(BaseModel):
    recovery_id: str
    defense_action_id: str
    state: Literal[
        "pending", "monitoring", "eligible", "recovering", "verifying",
        "recovered", "failed", "manual_review"
    ]
    tick_number: int = Field(ge=0)
    reason: str
    verified: bool = False


class RecoveryStartedEvent(EventEnvelope):
    event_type: Literal["recovery_started"] = "recovery_started"
    payload: RecoveryLifecyclePayload


class RecoveryProgressEvent(EventEnvelope):
    event_type: Literal["recovery_progress"] = "recovery_progress"
    payload: RecoveryLifecyclePayload


class RecoveryVerifiedEvent(EventEnvelope):
    event_type: Literal["recovery_verified"] = "recovery_verified"
    payload: RecoveryLifecyclePayload


class RecoveryFailedEvent(EventEnvelope):
    event_type: Literal["recovery_failed"] = "recovery_failed"
    payload: RecoveryLifecyclePayload


class AttackLifecyclePayload(BaseModel):
    attack_id: str
    attack_type: str
    target_device_id: str
    status: Literal["scheduled", "active", "completed", "cancelled", "failed"]
    start_tick: int = Field(ge=0)
    end_tick: int = Field(ge=0)
    intensity: Literal["low", "medium", "high"]
    severity_hint: Literal["low", "medium", "high", "critical"]


class AttackScheduledEvent(EventEnvelope):
    event_type: Literal["attack_scheduled"] = "attack_scheduled"
    payload: AttackLifecyclePayload


class AttackStartedEvent(EventEnvelope):
    event_type: Literal["attack_started"] = "attack_started"
    payload: AttackLifecyclePayload


class AttackActivityPayload(BaseModel):
    attack_id: str
    attack_type: str
    tick_number: int = Field(ge=0)
    generated_network_event_ids: list[UUID]
    generated_event_count: int = Field(ge=0)


class AttackActivityEvent(EventEnvelope):
    event_type: Literal["attack_activity"] = "attack_activity"
    payload: AttackActivityPayload


class AttackCompletedEvent(EventEnvelope):
    event_type: Literal["attack_completed"] = "attack_completed"
    payload: AttackLifecyclePayload


class AttackCancelledEvent(EventEnvelope):
    event_type: Literal["attack_cancelled"] = "attack_cancelled"
    payload: AttackLifecyclePayload


SimulationEvent = Annotated[
    TelemetryEvent
    | DeviceStateEvent
    | NetworkActivityEvent
    | SimulationTickEvent
    | SystemHealthEvent
    | AgentMessageEvent
    | AgentStatusEvent
    | ObservationEvent
    | FeatureVectorEvent
    | ClassicalPredictionEvent
    | QuantumPredictionEvent
    | ThreatAssessmentEvent
    | DefenseActionEvent
    | RecoveryEvent
    | DefenseActionRequestedEvent
    | DefenseActionStartedEvent
    | DefenseActionCompletedEvent
    | DefenseActionFailedEvent
    | DefenseRollbackEvent
    | HumanOverrideEvent
    | RecoveryStartedEvent
    | RecoveryProgressEvent
    | RecoveryVerifiedEvent
    | RecoveryFailedEvent
    | AttackScheduledEvent
    | AttackStartedEvent
    | AttackActivityEvent
    | AttackCompletedEvent
    | AttackCancelledEvent,
    Field(discriminator="event_type"),
]


EVENT_TYPES = frozenset(
    {
        "telemetry",
        "device_state",
        "network_activity",
        "simulation_tick",
        "system_health",
        "agent_message",
        "agent_status",
        "observation",
        "feature_vector",
        "classical_prediction",
        "quantum_prediction",
        "threat_assessment",
        "defense_action",
        "recovery",
        "defense_action_requested",
        "defense_action_started",
        "defense_action_completed",
        "defense_action_failed",
        "defense_rollback",
        "human_override",
        "recovery_started",
        "recovery_progress",
        "recovery_verified",
        "recovery_failed",
        "attack_scheduled",
        "attack_started",
        "attack_activity",
        "attack_completed",
        "attack_cancelled",
    }
)
