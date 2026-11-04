from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class AgentType(StrEnum):
    MONITORING = "monitoring"
    CLASSICAL_ML = "classical_ml"
    QUANTUM_ML = "quantum_ml"
    THREAT_ANALYSIS = "threat_analysis"
    DEFENSE = "defense"
    RECOVERY = "recovery"


class AgentStatus(StrEnum):
    STARTING = "starting"
    RUNNING = "running"
    DEGRADED = "degraded"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"


class AgentHealth(StrEnum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class AgentView(BaseModel):
    agent_id: str
    agent_type: AgentType
    name: str
    role: str
    status: AgentStatus
    health: AgentHealth
    started_at: datetime | None
    last_activity_at: datetime | None
    processed_event_count: int = Field(ge=0)
    error_count: int = Field(ge=0)
    subscriptions: list[str]
    dependencies: dict[str, str]
    state: dict[str, object]


class AgentAuditEntry(BaseModel):
    sequence: int = Field(ge=1)
    agent_id: str
    timestamp: datetime
    action: str
    status: AgentStatus
    correlation_id: str | None = None
    event_type: str | None = None
    detail: str
    error: str | None = None


class AgentLifecycleResponse(BaseModel):
    action: str
    agents: list[AgentView]


class AgentHealthSummary(BaseModel):
    total_agents: int
    healthy_agents: int
    degraded_agents: int
    unhealthy_agents: int
    agents: list[AgentView]
