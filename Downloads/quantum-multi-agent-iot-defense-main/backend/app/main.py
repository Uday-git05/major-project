import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.api.simulation import router as simulation_router
from app.api.agents import router as agents_router
from app.api.features import get_feature_manager, router as features_router
from app.api.attacks import get_attack_controller, router as attacks_router
from app.api.defense import router as defense_router
from app.api.recovery import router as recovery_router
from app.config import get_settings
from app.inference.errors import ArtifactCompatibilityError, FeatureContractError
from app.api.system import router as system_router
from app.api.live import router as live_router
from app.runtime.dependencies import get_runtime_coordinator


@asynccontextmanager
async def lifespan(_application: FastAPI):
    runtime = get_runtime_coordinator()
    await runtime.initialize()
    if get_settings().auto_run_simulation:
        await runtime.activate()
    try:
        yield
    finally:
        await runtime.shutdown()


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Phase 8 frozen classical ML and QML inference service.",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[item.strip() for item in settings.cors_origins.split(",") if item.strip()],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.exception_handler(FeatureContractError)
    async def feature_contract_handler(
        _request: Request, exc: FeatureContractError
    ) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @application.exception_handler(ArtifactCompatibilityError)
    async def artifact_handler(
        _request: Request, exc: ArtifactCompatibilityError
    ) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    application.include_router(router)
    application.include_router(simulation_router)
    application.include_router(agents_router)
    application.include_router(features_router)
    application.include_router(attacks_router)
    application.include_router(defense_router)
    application.include_router(recovery_router)
    application.include_router(system_router)
    application.include_router(live_router)
    return application


app = create_app()
