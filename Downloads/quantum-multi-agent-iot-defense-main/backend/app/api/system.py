from typing import Annotated

from fastapi import APIRouter, Depends

from app.runtime.coordinator import RuntimeCoordinator
from app.runtime.dependencies import get_runtime_coordinator


router = APIRouter(prefix="/v1/system", tags=["system"])
Runtime = Annotated[RuntimeCoordinator, Depends(get_runtime_coordinator)]


@router.get("/status")
async def system_status(runtime: Runtime) -> dict[str, object]:
    return runtime.status()


@router.get("/snapshot")
async def system_snapshot(runtime: Runtime) -> dict[str, object]:
    # Runtime collections are owned by the application event loop. Keeping
    # snapshot construction on that loop prevents concurrent deque iteration
    # from a FastAPI worker thread while live events are being ingested.
    return runtime.snapshot()


@router.post("/activate")
async def activate(runtime: Runtime) -> dict[str, object]:
    return await runtime.activate()


@router.post("/deactivate")
async def deactivate(runtime: Runtime) -> dict[str, object]:
    return await runtime.deactivate()


@router.post("/reset")
async def reset(runtime: Runtime) -> dict[str, object]:
    return await runtime.reset()
