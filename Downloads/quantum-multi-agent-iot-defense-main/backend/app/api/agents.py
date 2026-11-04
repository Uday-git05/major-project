from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.agents.factory import create_default_agent_manager
from app.agents.manager import AgentManager, AgentNotFoundError
from app.api.routes import get_inference_service
from app.api.simulation import get_simulation_engine
from app.domain.agents import (
    AgentAuditEntry,
    AgentHealthSummary,
    AgentLifecycleResponse,
    AgentView,
)
from app.defense.dependencies import get_defense_manager
from app.recovery.dependencies import get_recovery_manager


router = APIRouter(prefix="/v1/agents", tags=["agents"])


@lru_cache
def get_agent_manager() -> AgentManager:
    return create_default_agent_manager(
        get_simulation_engine().bus,
        get_inference_service(),
        defense_manager=get_defense_manager(),
        recovery_manager=get_recovery_manager(),
    )


Manager = Annotated[AgentManager, Depends(get_agent_manager)]


@router.get("", response_model=list[AgentView])
def list_agents(manager: Manager) -> list[AgentView]:
    return manager.views()


@router.get("/health", response_model=AgentHealthSummary)
def agent_health(manager: Manager) -> AgentHealthSummary:
    return manager.health()


@router.get("/audit", response_model=list[AgentAuditEntry])
def agent_audit(
    manager: Manager,
    agent_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
) -> list[AgentAuditEntry]:
    try:
        return manager.audit(agent_id=agent_id, limit=limit)
    except AgentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}") from exc


@router.get("/{agent_id}", response_model=AgentView)
def get_agent(agent_id: str, manager: Manager) -> AgentView:
    try:
        return manager.get(agent_id).view()
    except AgentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}") from exc


@router.post("/start", response_model=AgentLifecycleResponse)
async def start_agents(manager: Manager) -> AgentLifecycleResponse:
    return await manager.start_all()


@router.post("/stop", response_model=AgentLifecycleResponse)
async def stop_agents(manager: Manager) -> AgentLifecycleResponse:
    return await manager.stop_all()
