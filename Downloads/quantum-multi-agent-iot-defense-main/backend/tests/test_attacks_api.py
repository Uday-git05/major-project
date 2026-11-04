from fastapi.testclient import TestClient

from app.api.attacks import get_attack_controller
from app.attacks.controller import AttackController
from app.main import app
from app.simulation.bus import AsyncEventBus
from app.simulation.engine import SimulationEngine


def _controller():
    bus = AsyncEventBus()
    engine = SimulationEngine(seed=5)
    engine.bus = bus
    return AttackController(bus, engine)


def test_attack_api_types_schedule_start_cancel_and_lists():
    controller = _controller()
    app.dependency_overrides[get_attack_controller] = lambda: controller
    try:
        with TestClient(app) as client:
            types = client.get("/v1/attacks/types")
            scheduled = client.post(
                "/v1/attacks/schedule",
                json={"attack_type": "HTTP_Flood", "duration_ticks": 2, "seed": 4},
            )
            attack_id = scheduled.json()["attack_id"]
            started = client.post(f"/v1/attacks/{attack_id}/start")
            active = client.get("/v1/attacks/active")
            cancelled = client.post(f"/v1/attacks/{attack_id}/cancel")
            history = client.get("/v1/attacks/history")
        assert types.status_code == 200
        assert len(types.json()) == 7
        registered_types = {device.device_type.value for device in controller.simulation.device_views()}
        assert all(set(preset["default_target_types"]) == registered_types for preset in types.json())
        assert scheduled.status_code == 200
        assert started.json()["status"] == "active"
        assert len(active.json()) == 1
        assert cancelled.json()["status"] == "cancelled"
        assert len(history.json()) == 1
    finally:
        app.dependency_overrides.pop(get_attack_controller, None)


def test_attack_api_rejects_botnet_and_unknown_target():
    controller = _controller()
    app.dependency_overrides[get_attack_controller] = lambda: controller
    try:
        with TestClient(app) as client:
            botnet = client.post(
                "/v1/attacks/schedule", json={"attack_type": "BotNet_DDOS"}
            )
            unknown = client.post(
                "/v1/attacks/schedule",
                json={"attack_type": "UDP_Flood", "target_device_id": "internet-host"},
            )
        assert botnet.status_code == 422
        assert unknown.status_code == 422
    finally:
        app.dependency_overrides.pop(get_attack_controller, None)


def test_attack_launch_activates_shared_runtime_and_uses_unique_simulation_ids(monkeypatch):
    controller = _controller()
    app.dependency_overrides[get_attack_controller] = lambda: controller
    activations = []

    class Runtime:
        async def activate(self):
            activations.append(True)

    import app.runtime.dependencies as runtime_dependencies

    monkeypatch.setattr(runtime_dependencies, "get_runtime_coordinator", lambda: Runtime())
    try:
        with TestClient(app) as client:
            first = client.post("/v1/attacks/launch", json={"attack_type": "HTTP_Flood", "duration_ticks": 2})
            second = client.post("/v1/attacks/launch", json={"attack_type": "HTTP_Flood", "duration_ticks": 2})
        assert first.status_code == second.status_code == 200
        assert first.json()["attack_id"] != second.json()["attack_id"]
        assert len(activations) == 2
    finally:
        app.dependency_overrides.pop(get_attack_controller, None)
