from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.simulation.events import DefenseActionType


class ActionStatus(StrEnum):
    PLANNED = "planned"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class DefenseActionRecord(BaseModel):
    action_id: str
    correlation_id: UUID
    incident_id: str
    action_type: DefenseActionType
    target: str
    reason: str
    evidence: list[str] = Field(default_factory=list)
    status: ActionStatus
    requested_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    result: dict[str, str | int | float | bool | None] = Field(default_factory=dict)
    reversible: bool = True
    rollback_state: str = "not_requested"
    initiated_by: str
    human_override_state: str = "none"


class HumanActionRequest(BaseModel):
    actor: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=1, max_length=500)


class ManualDefenseRequest(HumanActionRequest):
    action_type: DefenseActionType
    target: str = Field(min_length=1, max_length=200)
    incident_id: str = Field(default="manual", min_length=1, max_length=200)


class PolicyStateView(BaseModel):
    isolated_devices: list[str]
    quarantined_sources: list[str]
    rate_limited_services: dict[str, float]
    restricted_ports: list[int]
    gateway_protection: bool
    counters: dict[str, int]
    action_count: int


DecisionMode = Literal["observe", "proposal", "automatic"]
