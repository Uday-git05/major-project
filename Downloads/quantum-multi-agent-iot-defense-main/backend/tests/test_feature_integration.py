import pytest

from app.agents.factory import create_default_agent_manager
from app.features.manager import FeatureExtractionManager
from app.simulation.bus import AsyncEventBus
from app.simulation.engine import SimulationEngine

from agent_test_utils import FakeInferenceService


async def _run_seed(seed: int):
    bus = AsyncEventBus()
    engine = SimulationEngine(seed=seed)
    engine.bus = bus
    features = FeatureExtractionManager(bus, emission_interval_seconds=0)
    await features.start()
    await engine.start()
    await engine.tick(2)
    payloads = [event.payload.model_dump(mode="json") for event in features.recent_vectors]
    await features.stop()
    return payloads


@pytest.mark.anyio
async def test_same_seed_produces_deterministic_feature_vectors():
    first = await _run_seed(41)
    second = await _run_seed(41)
    assert first == second
    assert first


@pytest.mark.anyio
async def test_live_simulator_features_reach_both_model_agents_and_threat_analysis():
    bus = AsyncEventBus()
    engine = SimulationEngine(seed=17)
    engine.bus = bus
    feature_manager = FeatureExtractionManager(bus, emission_interval_seconds=0)
    service = FakeInferenceService(attack=False)
    agents = create_default_agent_manager(bus, service)
    observed = []
    await bus.subscribe("*", observed.append)
    await feature_manager.start()
    await agents.start_all()
    await engine.start()
    await engine.tick()
    await agents.wait_idle()
    kinds = {event.event_type for event in observed}
    assert "network_activity" in kinds
    assert "feature_vector" in kinds
    assert "classical_prediction" in kinds
    assert "quantum_prediction" in kinds
    assert "threat_assessment" in kinds
    feature_correlations = {
        event.correlation_id for event in observed if event.event_type == "feature_vector"
    }
    assert any(
        event.correlation_id in feature_correlations
        for event in observed
        if event.event_type == "classical_prediction"
    )
    assert any(
        event.correlation_id in feature_correlations
        for event in observed
        if event.event_type == "quantum_prediction"
    )
    assert service.calls.count("classical_binary") == feature_manager.vectors_emitted
    assert service.calls.count("qml_binary") == feature_manager.vectors_emitted
    await agents.stop_all()
    await feature_manager.stop()
