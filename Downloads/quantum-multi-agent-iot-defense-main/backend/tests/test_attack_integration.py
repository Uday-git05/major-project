import pytest

from app.agents.factory import create_default_agent_manager
from app.attacks.schemas import AttackType, ScheduleAttackRequest

from agent_test_utils import FakeInferenceService
from attack_test_utils import attack_environment


@pytest.mark.anyio
async def test_ground_truth_cannot_enter_feature_or_prediction_payloads():
    bus, engine, controller, features = attack_environment()
    captured = []
    await bus.subscribe("*", captured.append)
    await controller.start()
    await features.start()
    scenario = await controller.schedule(
        ScheduleAttackRequest(
            attack_type=AttackType.HTTP_FLOOD,
            duration_ticks=1,
            seed=3,
        )
    )
    await engine.start()
    await engine.tick()
    attack_network = [
        event
        for event in captured
        if event.event_type == "network_activity"
        and controller.ground_truth_for_event(event.event_id)
    ]
    attack_features = [
        event
        for event in captured
        if event.event_type == "feature_vector" and event.correlation_id == scenario.correlation_id
    ]
    assert attack_network and attack_features
    assert scenario.attack_type.value.lower() not in scenario.source_device_id.lower()
    for event in attack_network:
        serialized = event.payload.model_dump(mode="json")
        assert "attack_type" not in serialized
        assert "ground_truth" not in serialized
        assert controller.ground_truth_for_event(event.event_id).attack_type is AttackType.HTTP_FLOOD
    for event in attack_features:
        serialized = event.payload.model_dump(mode="json")
        assert "attack_type" not in serialized
        assert "ground_truth" not in serialized
        assert "severity_hint" not in serialized
        assert len(event.payload.features) == 27
        assert event.source == "feature-extraction-manager"
        assert all(
            controller.ground_truth_for_event(source_id) is not None
            for source_id in event.payload.source_event_ids
        )
    await features.stop()
    await controller.stop()


@pytest.mark.anyio
async def test_attack_features_reach_both_model_agents_and_threat_analysis():
    bus, engine, controller, features = attack_environment()
    service = FakeInferenceService(attack=True)
    agents = create_default_agent_manager(bus, service)
    captured = []
    await bus.subscribe("*", captured.append)
    await controller.start()
    await features.start()
    await agents.start_all()
    scenario = await controller.schedule(
        ScheduleAttackRequest(
            attack_type=AttackType.TCP_FLOOD,
            duration_ticks=1,
            seed=12,
        )
    )
    await engine.start()
    await engine.tick()
    await agents.wait_idle()
    correlated = [event for event in captured if event.correlation_id == scenario.correlation_id]
    types = {event.event_type for event in correlated}
    assert "network_activity" in types
    assert "feature_vector" in types
    assert "classical_prediction" in types
    assert "quantum_prediction" in types
    assert "threat_assessment" in types
    assert service.calls.count("classical_binary") > 0
    assert service.calls.count("qml_binary") > 0
    await agents.stop_all()
    await features.stop()
    await controller.stop()


@pytest.mark.anyio
async def test_mixed_normal_attack_normal_sequence_stays_operational():
    bus, engine, controller, features = attack_environment()
    captured = []
    await bus.subscribe("*", captured.append)
    await controller.start()
    await features.start()
    await engine.start()
    await engine.tick()
    normal_before = sum(
        event.event_type == "network_activity"
        and controller.ground_truth_for_event(event.event_id) is None
        for event in captured
    )
    scenario = await controller.schedule(
        ScheduleAttackRequest(
            attack_type=AttackType.PORT_SCANNING,
            duration_ticks=1,
            start_tick=2,
        )
    )
    await engine.tick()
    vectors_during = features.vectors_emitted
    await engine.tick()
    normal_after = sum(
        event.event_type == "network_activity"
        and event.timestamp == engine.clock.current_time
        and controller.ground_truth_for_event(event.event_id) is None
        for event in captured
    )
    assert normal_before > 0
    assert scenario.status.value == "completed"
    assert vectors_during > 0
    assert normal_after > 0
    assert features.invalid_events == 0
    await features.stop()
    await controller.stop()
