from fastapi.testclient import TestClient

from app.api.features import get_feature_manager
from app.features.manager import FeatureExtractionManager
from app.main import app
from app.simulation.bus import AsyncEventBus


def test_feature_schema_status_flows_and_recent_endpoints():
    manager = FeatureExtractionManager(AsyncEventBus())
    app.dependency_overrides[get_feature_manager] = lambda: manager
    try:
        with TestClient(app) as client:
            schema = client.get("/v1/features/schema")
            status = client.get("/v1/features/status")
            flows = client.get("/v1/features/flows")
            recent = client.get("/v1/features/recent")
        assert schema.status_code == 200
        assert schema.json()["feature_count"] == 27
        assert len(schema.json()["feature_names"]) == 27
        assert "not claimed to exactly reproduce" in schema.json()["compatibility_notice"]
        assert status.json()["active_flow_count"] == 0
        assert flows.json() == []
        assert recent.json() == []
    finally:
        app.dependency_overrides.pop(get_feature_manager, None)
