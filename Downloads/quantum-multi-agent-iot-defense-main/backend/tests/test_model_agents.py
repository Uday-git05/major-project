import pytest

from app.domain.agents import AgentStatus
from app.agents.classical_ml import ClassicalMLAgent
from app.agents.manager import AgentManager
from app.agents.quantum_ml import QuantumMLAgent
from app.simulation.bus import AsyncEventBus

from agent_test_utils import FakeInferenceService, feature_event


@pytest.mark.anyio
async def test_classical_agent_uses_inference_service_abstraction_and_preserves_correlation():
    bus = AsyncEventBus()
    service = FakeInferenceService()
    agent = ClassicalMLAgent(bus, service)
    manager = AgentManager()
    manager.register(agent)
    received = []
    await bus.subscribe("classical_prediction", received.append)
    await manager.start_all()
    source = feature_event()
    await bus.publish(source)
    await manager.wait_idle()
    assert service.calls == ["classical_binary", "classical_multiclass"]
    assert len(received) == 1
    assert received[0].correlation_id == source.correlation_id
    assert received[0].payload.feature_vector_event_id == source.event_id
    assert received[0].payload.extractor_version == source.payload.extractor_version
    await manager.stop_all()


@pytest.mark.anyio
async def test_quantum_agent_uses_service_and_declares_async_availability():
    bus = AsyncEventBus()
    service = FakeInferenceService()
    agent = QuantumMLAgent(bus, service)
    manager = AgentManager()
    manager.register(agent)
    received = []
    await bus.subscribe("quantum_prediction", received.append)
    await manager.start_all()
    source = feature_event()
    await bus.publish(source)
    await manager.wait_idle()
    assert service.calls == ["qml_binary", "qml_multiclass"]
    assert received[0].correlation_id == source.correlation_id
    assert received[0].payload.feature_vector_event_id == source.event_id
    assert agent.view().dependencies["qml_execution"] == "asynchronous"
    await manager.stop_all()


def test_quantum_agent_coalesces_background_queue_before_focused_scenario():
    bus = AsyncEventBus()
    agent = QuantumMLAgent(bus, FakeInferenceService(), queue_limit=4)
    agent.status = AgentStatus.PAUSED
    background = [feature_event() for _ in range(4)]
    for event in background:
        agent._enqueue(event)
    background_feature = feature_event()
    focused = background_feature.model_copy(update={
        "payload": background_feature.payload.model_copy(update={"source_device_id": "synthetic-source-demo"})
    })
    agent._enqueue(focused)
    assert list(agent._queue._queue) == [focused]
    assert agent.view().state["coalesced_background_events"] == 4
    assert agent.view().state["queued_events"] == 1


@pytest.mark.anyio
async def test_model_service_failure_degrades_only_affected_agent():
    bus = AsyncEventBus()
    classical = ClassicalMLAgent(bus, FakeInferenceService(fail_classical=True))
    quantum = QuantumMLAgent(bus, FakeInferenceService())
    manager = AgentManager()
    manager.register(classical)
    manager.register(quantum)
    await manager.start_all()
    await bus.publish(feature_event())
    await manager.wait_idle()
    assert classical.error_count == 1
    assert quantum.inference_count == 1
    await manager.stop_all()
