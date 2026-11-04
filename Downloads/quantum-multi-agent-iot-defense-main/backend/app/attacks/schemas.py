from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AttackType(StrEnum):
    ARP_SPOOFING = "Arp_Spoofing"
    HTTP_FLOOD = "HTTP_Flood"
    ICMP_FLOOD = "ICMP_Flood"
    MQTT_FLOOD = "MQTT_Flood"
    PORT_SCANNING = "Port_Scanning"
    TCP_FLOOD = "TCP_Flood"
    UDP_FLOOD = "UDP_Flood"


class AttackStatus(StrEnum):
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class AttackIntensity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AttackScenario(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    attack_id: str
    attack_type: AttackType
    name: str
    description: str
    target_device_id: str
    source_device_id: str
    status: AttackStatus
    severity_hint: Literal["low", "medium", "high", "critical"]
    start_tick: int = Field(ge=0)
    end_tick: int = Field(ge=0)
    duration_ticks: int = Field(ge=1)
    intensity: AttackIntensity
    seed: int
    correlation_id: UUID
    metadata: dict[str, str | int | float | bool]
    ticks_active: int = Field(default=0, ge=0)
    network_events_generated: int = Field(default=0, ge=0)


class ScheduleAttackRequest(BaseModel):
    attack_type: AttackType
    target_device_id: str | None = None
    source_device_id: str | None = None
    start_tick: int | None = Field(default=None, ge=0)
    duration_ticks: int | None = Field(default=None, ge=1, le=100)
    intensity: AttackIntensity | None = None
    seed: int = 42


class AttackPresetView(BaseModel):
    attack_type: AttackType
    name: str
    description: str
    default_target_types: list[str]
    default_duration_ticks: int
    default_intensity: AttackIntensity
    protocol: Literal["TCP", "UDP", "ICMP", "ARP"]
    service: str
    behavior_summary: str


class GroundTruthRecord(BaseModel):
    """Private controller-side label indexed by network event ID."""

    attack_id: str
    attack_type: AttackType
    correlation_id: UUID
