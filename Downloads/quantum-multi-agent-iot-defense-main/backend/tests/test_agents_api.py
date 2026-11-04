from fastapi.testclient import TestClient

from app.agents.factory import create_default_agent_manager
from app.api.agents import get_agent_manager
from app.main import app
from app.simulation.bus import AsyncEventBus

from agent_test_utils import FakeInferenceService


def test_agent_api_lifecycle_health_and_lookup():
    manager = create_default_agent_manager(AsyncEventBus(), FakeInferenceService())
    app.dependency_overrides[get_agent_manager] = lambda: manager
    try:
        with TestClient(app) as client:
            listed = client.get("/v1/agents")
            started = client.post("/v1/agents/start")
            health = client.get("/v1/agents/health")
            single = client.get("/v1/agents/quantum-ml-agent")
            missing = client.get("/v1/agents/not-present")
            stopped = client.post("/v1/agents/stop")
        assert listed.status_code == 200
        assert len(listed.json()) == 6
        assert all(item["status"] == "running" for item in started.json()["agents"])
        assert health.json()["healthy_agents"] == 6
        assert single.json()["dependencies"]["qml_execution"] == "asynchronous"
        assert missing.status_code == 404
        assert all(item["status"] == "stopped" for item in stopped.json()["agents"])
    finally:
        app.dependency_overrides.pop(get_agent_manager, None)


def test_agent_audit_endpoint_is_typed_and_filterable():
    manager = create_default_agent_manager(AsyncEventBus(), FakeInferenceService())
    app.dependency_overrides[get_agent_manager] = lambda: manager
    try:
        with TestClient(app) as client:
            client.post("/v1/agents/start")
            audit = client.get(
                "/v1/agents/audit", params={"agent_id": "monitoring-agent", "limit": 10}
            )
            unknown = client.get("/v1/agents/audit", params={"agent_id": "missing"})
            client.post("/v1/agents/stop")
        assert audit.status_code == 200
        assert audit.json()
        assert all(entry["agent_id"] == "monitoring-agent" for entry in audit.json())
        assert unknown.status_code == 404
    finally:
        app.dependency_overrides.pop(get_agent_manager, None)
