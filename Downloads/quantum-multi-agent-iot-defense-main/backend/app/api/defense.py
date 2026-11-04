from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.defense.dependencies import get_defense_manager, get_policy_store
from app.defense.manager import DefenseActionError, DefenseManager
from app.defense.schemas import (
    DefenseActionRecord, HumanActionRequest, ManualDefenseRequest, PolicyStateView,
)


router = APIRouter(prefix="/v1/defense", tags=["defense"])
Manager = Annotated[DefenseManager, Depends(get_defense_manager)]


@router.get("/actions", response_model=list[DefenseActionRecord])
def actions(manager: Manager): return manager.history()


@router.get("/policy-state", response_model=PolicyStateView)
def policy_state(): return get_policy_store().view()


@router.post("/manual", response_model=DefenseActionRecord)
async def manual(request: ManualDefenseRequest, manager: Manager):
    record = await manager.request(
        incident_id=request.incident_id, action_type=request.action_type,
        target=request.target, reason=request.reason, evidence=["human:manual"],
        correlation_id=uuid4(), initiated_by=request.actor)
    return await manager.approve(record.action_id, request.actor, request.reason)


@router.get("/actions/{action_id}", response_model=DefenseActionRecord)
def action(action_id: str, manager: Manager): return _get(manager, action_id)


@router.post("/actions/{action_id}/approve", response_model=DefenseActionRecord)
async def approve(action_id: str, request: HumanActionRequest, manager: Manager):
    return await _call(manager.approve, action_id, request.actor, request.reason)


@router.post("/actions/{action_id}/reject", response_model=DefenseActionRecord)
async def reject(action_id: str, request: HumanActionRequest, manager: Manager):
    return await _call(manager.reject, action_id, request.actor, request.reason)


@router.post("/actions/{action_id}/cancel", response_model=DefenseActionRecord)
async def cancel(action_id: str, request: HumanActionRequest, manager: Manager):
    return await _call(manager.cancel, action_id, request.actor, request.reason)


@router.post("/actions/{action_id}/rollback", response_model=DefenseActionRecord)
async def rollback(action_id: str, request: HumanActionRequest, manager: Manager):
    return await _call(manager.rollback, action_id, request.actor, request.reason)


def _get(manager, action_id):
    try: return manager.get(action_id)
    except DefenseActionError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc


async def _call(method, *args):
    try: return await method(*args)
    except DefenseActionError as exc: raise HTTPException(status_code=409, detail=str(exc)) from exc
