import csv
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import PROJECT_ROOT, Settings
from app.inference.registry import ArtifactRegistry
from app.inference.service import InferenceService
from app.main import app
from app.api.simulation import get_simulation_engine
from app.simulation.engine import SimulationEngine


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(
        artifacts_dir=PROJECT_ROOT / "artifacts",
        models_dir=PROJECT_ROOT / "models",
    )


@pytest.fixture(scope="session")
def registry(settings: Settings) -> ArtifactRegistry:
    return ArtifactRegistry(settings)


@pytest.fixture(scope="session")
def service(registry: ArtifactRegistry) -> InferenceService:
    return InferenceService(registry)


@pytest.fixture()
def sample_features(registry: ArtifactRegistry) -> dict[str, float]:
    path = PROJECT_ROOT / "splits" / "binary_test_raw_v1.csv"
    with path.open("r", encoding="utf-8", newline="") as handle:
        row = next(csv.DictReader(handle))
    return {name: float(row[name]) for name in registry.feature_names}


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture()
def simulation_engine() -> SimulationEngine:
    return SimulationEngine(seed=73, tick_duration_seconds=2.0)


@pytest.fixture()
def anyio_backend():
    return "asyncio"


@pytest.fixture()
def simulation_client(simulation_engine: SimulationEngine):
    app.dependency_overrides[get_simulation_engine] = lambda: simulation_engine
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_simulation_engine, None)
