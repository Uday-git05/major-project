from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import get_settings
from app.domain.simulation import (
    DeviceView,
    ResetRequest,
    SimulationActionResponse,
    SimulationStatusResponse,
    TickRequest,
    TopologyResponse,
)
from app.simulation.clock import InvalidClockTransition
from app.simulation.engine import SimulationEngine
from app.simulation.events import EVENT_TYPES, SimulationEvent


router = APIRouter(prefix="/v1/simulation", tags=["simulation"])


@lru_cache
def get_simulation_engine() -> SimulationEngine:
    settings = get_settings()
    return SimulationEngine(
        seed=settings.simulation_seed,
        tick_duration_seconds=settings.simulation_tick_seconds,
        simulation_speed=settings.simulation_speed,
        telemetry_frequency=settings.simulation_telemetry_frequency,
        soil_sensor_count=settings.simulation_soil_sensor_count,
        temperature_sensor_count=settings.simulation_temperature_sensor_count,
        humidity_sensor_count=settings.simulation_humidity_sensor_count,
    )


Engine = Annotated[SimulationEngine, Depends(get_simulation_engine)]


@router.get("/status", response_model=SimulationStatusResponse)
def status(engine: Engine) -> SimulationStatusResponse:
    return engine.status()


@router.get("/devices", response_model=list[DeviceView])
def devices(engine: Engine) -> list[DeviceView]:
    return engine.device_views()


@router.get("/topology", response_model=TopologyResponse)
def topology(engine: Engine) -> TopologyResponse:
    return engine.topology()


@router.post("/start", response_model=SimulationActionResponse)
async def start(engine: Engine) -> SimulationActionResponse:
    return await _transition(engine.start)


@router.post("/pause", response_model=SimulationActionResponse)
async def pause(engine: Engine) -> SimulationActionResponse:
    return await _transition(engine.pause)


@router.post("/resume", response_model=SimulationActionResponse)
async def resume(engine: Engine) -> SimulationActionResponse:
    return await _transition(engine.resume)


@router.post("/reset", response_model=SimulationActionResponse)
async def reset(request: ResetRequest, engine: Engine) -> SimulationActionResponse:
    return await engine.reset(seed=request.seed)


@router.post("/tick", response_model=SimulationActionResponse)
async def tick(request: TickRequest, engine: Engine) -> SimulationActionResponse:
    return await _transition(lambda: engine.tick(request.count))


@router.get("/events", response_model=list[SimulationEvent])
def events(
    engine: Engine,
    event_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[SimulationEvent]:
    if event_type is not None and event_type not in EVENT_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported event type: {event_type}")
    return list(engine.events(event_type=event_type, limit=limit))


async def _transition(operation):
    try:
        return await operation()
    except InvalidClockTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
