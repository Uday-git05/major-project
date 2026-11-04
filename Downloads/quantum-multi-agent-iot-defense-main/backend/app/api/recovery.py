from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.recovery.dependencies import get_recovery_manager
from app.recovery.manager import RecoveryManager
from app.recovery.schemas import RecoveryRecord


router = APIRouter(prefix="/v1/recovery", tags=["recovery"])
Manager = Annotated[RecoveryManager, Depends(get_recovery_manager)]


@router.get("", response_model=list[RecoveryRecord])
def recoveries(manager: Manager): return manager.history()


@router.get("/{recovery_id}", response_model=RecoveryRecord)
def recovery(recovery_id: str, manager: Manager):
    try: return manager.get(recovery_id)
    except ValueError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc
