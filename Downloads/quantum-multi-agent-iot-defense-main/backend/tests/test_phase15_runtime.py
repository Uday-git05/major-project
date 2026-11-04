import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from threading import Event
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.agents.factory import create_default_agent_manager
from app.api import live as live_api
from app.api.live import router as live_router
from app.api.system import router as system_router
from app.attacks.controller import AttackController
from app.attacks.schemas import ScheduleAttackRequest
from app.defense.manager import DefenseManager
from app.defense.policy import VirtualSecurityPolicyStore
from app.features.contract import feature_contract
from app.features.manager import FeatureExtractionManager
from app.recovery.manager import RecoveryManager
from app.runtime.broadcaster import LiveEventBroadcaster
from app.runtime.coordinator import RuntimeCoordinator
from app.runtime.runner import AutomaticSimulationRunner
from app.runtime.dependencies import get_runtime_coordinator
from app.simulation.engine import SimulationEngine
from app.simulation.events import SimulationTickEvent, SimulationTickPayload, TelemetryEvent

from agent_test_utils import FakeInferenceService, feature_event


class FakeRegistry:
    feature_names = tuple(feature_contract()[1])
    binary_qml_threshold = 0.390
    binary_xgb_threshold = 0.012
    qml_device = "default.qubit"


def runtime_stack(*, service=None, queue_size=8):
    engine = SimulationEngine(seed=1515)
    policy = VirtualSecurityPolicyStore(); engine.attach_security_policy(policy)
    features = FeatureExtractionManager(engine.bus, emission_interval_seconds=0, minimum_packets=2)
    defense = DefenseManager(engine.bus, engine, policy)
    recovery = RecoveryManager(engine.bus, engine, defense, verification_ticks=2)
    agents = create_default_agent_manager(engine.bus, service or FakeInferenceService(),
        defense_manager=defense, recovery_manager=recovery)
    attacks = AttackController(engine.bus, engine); attacks.attach_security_policy(policy)
    broadcaster = LiveEventBroadcaster(engine.bus, queue_size=queue_size)
    runner = AutomaticSimulationRunner(engine, tick_interval=3600)
    runtime = RuntimeCoordinator(simulation=engine, features=features, agents=agents,
        attacks=attacks, defense=defense, recovery=recovery, registry=FakeRegistry(),
        broadcaster=broadcaster, runner=runner, demo_seed=1515)
    return runtime


@pytest.mark.anyio
async def test_activate_order_manual_runner_and_graceful_deactivate():
    runtime = runtime_stack()
    await runtime.initialize(); status = await runtime.activate()
    assert status["startup_order"] == ["feature_manager", "attack_controller", "agent_manager", "simulation_engine", "automatic_runner"]
    before = runtime.simulation.clock.tick_number
    assert await runtime.runner.advance_once() is True
    assert runtime.simulation.clock.tick_number == before + 1
    status = await runtime.deactivate()
    assert status["active"] is False and status["simulation"]["state"] == "paused"
    assert not runtime.runner.running and not runtime.features.running and not runtime.attacks.running
    await runtime.shutdown()


@pytest.mark.anyio
async def test_full_reset_increments_epoch_and_clears_runtime_state():
    runtime = runtime_stack()
    await runtime.initialize(); await runtime.activate(); await runtime.runner.advance_once()
    old_epoch = runtime.broadcaster.epoch
    await runtime.reset()
    snapshot = runtime.snapshot()
    assert snapshot["epoch"] == old_epoch + 1
    assert snapshot["simulation"]["tick_number"] == 0
    assert snapshot["attacks"] == []
    assert not any(item["event_type"] in {"simulation_tick", "network_activity", "feature_vector"}
                   for item in snapshot["events"])
    assert snapshot["defenses"] == [] and snapshot["recoveries"] == []
    assert snapshot["policy"]["action_count"] == 0
    await runtime.shutdown()


@pytest.mark.anyio
async def test_broadcaster_queue_is_bounded_and_slow_client_is_isolated():
    engine = SimulationEngine(); broadcaster = LiveEventBroadcaster(engine.bus, queue_size=2)
    await broadcaster.start(); _, slow = broadcaster.connect()
    await engine.start(); await engine.tick()
    assert slow.queue.qsize() == 2
    assert slow.dropped_messages > 0 and broadcaster.total_dropped > 0
    assert engine.clock.tick_number == 1
    await broadcaster.stop()


@pytest.mark.anyio
async def test_typed_stream_preserves_event_and_correlation_identity():
    engine = SimulationEngine(); broadcaster = LiveEventBroadcaster(engine.bus, queue_size=4)
    await broadcaster.start(); _, client = broadcaster.connect()
    correlation = uuid4()
    event = SimulationTickEvent(event_id=uuid4(), timestamp=datetime.now(timezone.utc),
        source="test", correlation_id=correlation,
        payload=SimulationTickPayload(tick_number=1, tick_duration_seconds=1, state="running"))
    await engine.bus.publish(event)
    envelope = client.queue.get_nowait()
    assert envelope.type == "simulation_tick" and envelope.correlation_id == correlation
    assert envelope.payload["event"]["event_id"] == str(event.event_id)
    await broadcaster.stop()


@pytest.mark.anyio
async def test_epoch_reset_marker_reaches_connected_clients():
    engine = SimulationEngine(); broadcaster = LiveEventBroadcaster(engine.bus, queue_size=4)
    await broadcaster.start(); _, client = broadcaster.connect()
    assert broadcaster.new_epoch() == 2
    marker = client.queue.get_nowait()
    assert marker.type == "runtime_reset" and marker.epoch == 2 and marker.sequence == 0
    await broadcaster.stop()


def test_websocket_connect_stream_and_disconnect(monkeypatch):
    engine = SimulationEngine(); broadcaster = LiveEventBroadcaster(engine.bus, queue_size=8)
    monkeypatch.setattr(live_api, "get_broadcaster", lambda: broadcaster)
    @asynccontextmanager
    async def lifespan(_app):
        await broadcaster.start(); yield; await broadcaster.stop()
    app = FastAPI(lifespan=lifespan); app.include_router(live_router)
    @app.post("/emit")
    async def emit():
        await engine.start()
        return {"ok": True}
    with TestClient(app) as client:
        with client.websocket_connect("/ws/live") as socket:
            ready = socket.receive_json()
            assert ready["type"] == "connection_ready" and ready["epoch"] == 1
            assert client.post("/emit").status_code == 200
            message = socket.receive_json()
            assert message["type"] == "device_state"
        assert len(broadcaster.clients) == 0


def test_quiet_websocket_disconnect_is_detected_without_outbound_event(monkeypatch):
    engine = SimulationEngine(); broadcaster = LiveEventBroadcaster(engine.bus, queue_size=8)
    monkeypatch.setattr(live_api, "get_broadcaster", lambda: broadcaster)
    app = FastAPI(); app.include_router(live_router)
    with TestClient(app) as client:
        with client.websocket_connect("/ws/live") as socket:
            assert socket.receive_json()["type"] == "connection_ready"
        assert len(broadcaster.clients) == 0


def test_snapshot_endpoint_stays_on_runtime_event_loop():
    runtime = runtime_stack()
    original_snapshot = runtime.snapshot

    def loop_owned_snapshot():
        asyncio.get_running_loop()  # Fails if FastAPI dispatches to a worker thread.
        return original_snapshot()

    runtime.snapshot = loop_owned_snapshot
    app = FastAPI(); app.include_router(system_router)
    app.dependency_overrides[get_runtime_coordinator] = lambda: runtime
    with TestClient(app) as client:
        response = client.get("/v1/system/snapshot")
    assert response.status_code == 200
    assert response.json()["epoch"] == 1


class GatedQmlService(FakeInferenceService):
    def __init__(self):
        super().__init__(attack=True); self.release_qml = Event()
    def predict_qml_binary(self, features, correlation_id):
        self.release_qml.wait(timeout=5)
        return super().predict_qml_binary(features, correlation_id)


class UnavailableQmlService(FakeInferenceService):
    def predict_qml_binary(self, features, correlation_id):
        raise RuntimeError("controlled QML subsystem outage")

    def predict_qml_multiclass(self, features, correlation_id):
        raise RuntimeError("controlled QML subsystem outage")


@pytest.mark.anyio
async def test_qml_outage_degrades_only_qml_and_preserves_primary_pipeline():
    runtime = runtime_stack(service=UnavailableQmlService())
    captured = []
    await runtime.simulation.bus.subscribe("*", captured.append)
    await runtime.initialize(); await runtime.activate(); await runtime.runner.stop()
    await runtime.simulation.tick()
    await runtime.agents.wait_idle()

    monitoring = runtime.agents.get("monitoring-agent")
    classical = runtime.agents.get("classical-ml-agent")
    quantum = runtime.agents.get("quantum-ml-agent")
    assert monitoring.processed_event_count > 0
    assert classical.inference_count > 0 and classical.error_count == 0
    assert quantum.inference_count == 0 and quantum.error_count > 0
    assert any(event.event_type == "classical_prediction" for event in captured)
    assert not any(event.event_type == "quantum_prediction" for event in captured)
    assessments = [event for event in captured if event.event_type == "threat_assessment"]
    primary_assessments = [event for event in assessments if event.payload.detected is not None]
    assert primary_assessments
    assert all(event.payload.evidence_strength == "primary" for event in primary_assessments)
    status = runtime.status()
    assert status["overall"] == "degraded"
    assert status["components"]["qml_inference"] == "degraded"
    await runtime.shutdown()


@pytest.mark.anyio
async def test_classical_arrives_while_qml_is_pending_then_updates_same_incident():
    service = GatedQmlService(); runtime = runtime_stack(service=service)
    emitted = []; classical_ready = asyncio.Event(); qml_ready = asyncio.Event()
    async def capture(event):
        emitted.append(event)
        if event.event_type == "classical_prediction": classical_ready.set()
        if event.event_type == "quantum_prediction": qml_ready.set()
    await runtime.simulation.bus.subscribe("*", capture)
    await runtime.initialize(); await runtime.activate()
    source = feature_event(); await runtime.simulation.bus.publish(source)
    await asyncio.wait_for(classical_ready.wait(), timeout=5)
    assert not qml_ready.is_set()
    service.release_qml.set(); await asyncio.wait_for(qml_ready.wait(), timeout=5)
    await runtime.agents.wait_idle()
    correlated = [item for item in emitted if item.correlation_id == source.correlation_id]
    assert any(item.event_type == "classical_prediction" for item in correlated)
    assert any(item.event_type == "quantum_prediction" for item in correlated)
    assessments = [item for item in correlated if item.event_type == "threat_assessment"]
    assert len(assessments) >= 2 and len({item.payload.incident_id for item in assessments}) == 1
    classical_time = next(item.timestamp for item in correlated if item.event_type == "classical_prediction")
    qml_time = next(item.timestamp for item in correlated if item.event_type == "quantum_prediction")
    assert classical_time <= qml_time
    await runtime.shutdown()


@pytest.mark.anyio
async def test_normal_live_pipeline_operates_without_frontend_client():
    runtime = runtime_stack()
    await runtime.initialize(); await runtime.activate()
    for _ in range(2): await runtime.runner.advance_once()
    await runtime.agents.wait_idle()
    kinds = {event.event_type for event in runtime.simulation.events(limit=500)}
    assert {"simulation_tick", "telemetry", "network_activity"}.issubset(kinds)
    assert len(runtime.broadcaster.clients) == 0
    await runtime.shutdown()


@pytest.mark.anyio
async def test_full_attack_prediction_defense_recovery_chain_stays_correlated():
    runtime = runtime_stack(service=FakeInferenceService(attack=True))
    await runtime.initialize(); await runtime.activate()
    scenario = await runtime.attacks.schedule(ScheduleAttackRequest(
        attack_type="Port_Scanning", duration_ticks=2, intensity="high", seed=1515))
    await runtime.runner.advance_once(); await runtime.agents.wait_idle()
    correlated = [event for event in runtime.broadcaster.recent_events
                  if event.correlation_id == scenario.correlation_id]
    kinds = {event.event_type for event in correlated}
    assert {"attack_started", "network_activity", "feature_vector", "classical_prediction",
            "quantum_prediction", "threat_assessment", "defense_action_completed"}.issubset(kinds)
    for _ in range(5):
        await runtime.runner.advance_once(); await runtime.agents.wait_idle()
    correlated = [event for event in runtime.broadcaster.recent_events
                  if event.correlation_id == scenario.correlation_id]
    kinds = {event.event_type for event in correlated}
    assert "attack_completed" in kinds and "defense_rollback" in kinds
    assert "recovery_verified" in kinds
    assert runtime.defense.policy.counters["attack_events_suppressed"] > 0
    await runtime.shutdown()
