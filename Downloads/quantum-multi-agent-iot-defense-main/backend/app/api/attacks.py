from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.simulation import get_simulation_engine
from app.attacks.controller import AttackController, AttackControllerError
from app.attacks.presets import PRESETS
from app.attacks.schemas import AttackPresetView, AttackScenario, ScheduleAttackRequest
from app.config import get_settings
from app.defense.dependencies import get_policy_store


router = APIRouter(prefix="/v1/attacks", tags=["attacks"])


@lru_cache
def get_attack_controller() -> AttackController:
    controller = AttackController(
        get_simulation_engine().bus,
        get_simulation_engine(),
        history_limit=get_settings().attack_history_limit,
    )
    controller.attach_security_policy(get_policy_store())
    return controller


Controller = Annotated[AttackController, Depends(get_attack_controller)]


@router.get("/types", response_model=list[AttackPresetView])
def attack_types() -> list[AttackPresetView]:
    return [preset.view() for preset in PRESETS.values()]


@router.get("", response_model=list[AttackScenario])
def attacks(controller: Controller) -> list[AttackScenario]:
    return controller.all_attacks()


@router.get("/active", response_model=list[AttackScenario])
def active_attacks(controller: Controller) -> list[AttackScenario]:
    return controller.active_attacks()


@router.get("/history", response_model=list[AttackScenario])
def attack_history(controller: Controller) -> list[AttackScenario]:
    return controller.history()


@router.post("/schedule", response_model=AttackScenario)
async def schedule_attack(
    request: ScheduleAttackRequest, controller: Controller
) -> AttackScenario:
    try:
        return await controller.schedule(request)
    except AttackControllerError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/launch", response_model=AttackScenario)
async def launch_attack(
    request: ScheduleAttackRequest, controller: Controller
) -> AttackScenario:
    """Launch a synthetic scenario and ensure the shared detector is running."""
    try:
        scenario = await controller.schedule(request)
        # Import lazily because the runtime coordinator itself owns this controller.
        from app.runtime.dependencies import get_runtime_coordinator

        await get_runtime_coordinator().activate()
        return scenario
    except AttackControllerError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{attack_id}/start", response_model=AttackScenario)
async def start_attack(attack_id: str, controller: Controller) -> AttackScenario:
    try:
        return await controller.start_attack(attack_id)
    except AttackControllerError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{attack_id}/cancel", response_model=AttackScenario)
async def cancel_attack(attack_id: str, controller: Controller) -> AttackScenario:
    try:
        return await controller.cancel(attack_id)
    except AttackControllerError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
