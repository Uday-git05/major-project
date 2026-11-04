from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field


class RecoveryState(StrEnum):
    PENDING = "pending"
    MONITORING = "monitoring"
    ELIGIBLE = "eligible"
    RECOVERING = "recovering"
    VERIFYING = "verifying"
    RECOVERED = "recovered"
    FAILED = "failed"
    MANUAL_REVIEW = "manual_review"


class RecoveryRecord(BaseModel):
    recovery_id: str
    defense_action_id: str
    correlation_id: UUID
    state: RecoveryState
    created_tick: int = Field(ge=0)
    state_tick: int = Field(ge=0)
    verification_ticks: int = Field(default=0, ge=0)
    normal_events_observed: int = Field(default=0, ge=0)
    high_assessment_seen: bool = False
    verified: bool = False
    reason: str
