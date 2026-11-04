import socket

import pytest

from app.attacks.controller import AttackControllerError
from app.attacks.schemas import AttackStatus, AttackType, ScheduleAttackRequest

from attack_test_utils import attack_environment


@pytest.mark.anyio
async def test_schedule_start_activity_completion_lifecycle():
    bus, engine, controller, _ = attack_environment()
    lifecycle = []
    await bus.subscribe("*", lifecycle.append)
    await controller.start()
    scenario = await controller.schedule(
        ScheduleAttackRequest(
            attack_type=AttackType.MQTT_FLOOD,
            duration_ticks=2,
            seed=8,
        )
    )
    assert scenario.status is AttackStatus.SCHEDULED
    await engine.start()
    await engine.tick(2)
    assert scenario.status is AttackStatus.COMPLETED
    types = [event.event_type for event in lifecycle]
    assert "attack_scheduled" in types
    assert "attack_started" in types
    assert types.count("attack_activity") == 2
    assert "attack_completed" in types
    assert all(
        event.correlation_id == scenario.correlation_id
        for event in lifecycle
        if event.event_type.startswith("attack_")
    )
    await controller.stop()


@pytest.mark.anyio
async def test_manual_start_and_cancel():
    _, engine, controller, _ = attack_environment()
    await controller.start()
    scenario = await controller.schedule(
        ScheduleAttackRequest(
            attack_type=AttackType.TCP_FLOOD,
            start_tick=10,
            duration_ticks=4,
        )
    )
    await controller.start_attack(scenario.attack_id)
    assert scenario.status is AttackStatus.ACTIVE
    assert scenario.start_tick == engine.clock.tick_number + 1
    await controller.cancel(scenario.attack_id)
    assert scenario.status is AttackStatus.CANCELLED
    assert controller.active_attacks() == []
    assert controller.history() == [scenario]
    await controller.stop()


@pytest.mark.anyio
async def test_every_synthetic_scenario_targets_every_registered_farm_device():
    bus, engine, controller, _ = attack_environment()
    captured = []
    await bus.subscribe("network_activity", captured.append)
    devices = engine.device_views()
    assert [(device.name, device.device_id) for device in devices] == [
        ("Farm Gateway", "gateway-01"),
        ("Soil Moisture Sensor 1", "soil_moisture-01"),
        ("Soil Moisture Sensor 2", "soil_moisture-02"),
        ("Temperature Sensor 1", "temperature-01"),
        ("Humidity Sensor 1", "humidity-01"),
        ("Irrigation Flow Sensor", "water_flow-01"),
        ("Main Pump Controller", "pump_controller-01"),
        ("Field Weather Node", "weather-01"),
    ]

    await controller.start()
    scenarios = []
    for device in devices:
        for attack_type in AttackType:
            scenarios.append(await controller.schedule(ScheduleAttackRequest(
                attack_type=attack_type,
                target_device_id=device.device_id,
                duration_ticks=1,
            )))

    assert len(scenarios) == 8 * 7
    assert all(
        scenario.target_device_id in {device.device_id for device in devices}
        for scenario in scenarios
    )
    await engine.start()
    await engine.tick()
    synthetic = [
        event for event in captured
        if controller.ground_truth_for_event(event.event_id) is not None
    ]
    generated_pairs = {
        (controller.ground_truth_for_event(event.event_id).attack_type, event.payload.destination_device_id)
        for event in synthetic
    }
    assert len(synthetic) >= len(scenarios)
    assert generated_pairs == {
        (attack_type, device.device_id)
        for attack_type in AttackType
        for device in devices
    }
    await controller.stop()


@pytest.mark.anyio
async def test_unknown_targets_are_rejected():
    _, _, controller, _ = attack_environment()
    with pytest.raises(AttackControllerError, match="Unknown"):
        await controller.schedule(
            ScheduleAttackRequest(
                attack_type=AttackType.ARP_SPOOFING,
                target_device_id="external-host",
            )
        )


@pytest.mark.anyio
async def test_normal_and_attack_traffic_coexist():
    bus, engine, controller, _ = attack_environment()
    network = []
    await bus.subscribe("network_activity", network.append)
    await controller.start()
    scenario = await controller.schedule(
        ScheduleAttackRequest(
            attack_type=AttackType.UDP_FLOOD,
            duration_ticks=1,
        )
    )
    await engine.start()
    await engine.tick()
    normal = [event for event in network if controller.ground_truth_for_event(event.event_id) is None]
    synthetic = [event for event in network if controller.ground_truth_for_event(event.event_id)]
    assert normal
    assert synthetic
    assert all(event.correlation_id == scenario.correlation_id for event in synthetic)
    await controller.stop()


@pytest.mark.anyio
async def test_attack_controller_performs_no_external_network_access(monkeypatch):
    def forbidden_socket(*args, **kwargs):
        raise AssertionError("External network access attempted")

    monkeypatch.setattr(socket, "socket", forbidden_socket)
    _, engine, controller, _ = attack_environment()
    await controller.start()
    await controller.schedule(
        ScheduleAttackRequest(attack_type=AttackType.ICMP_FLOOD, duration_ticks=1)
    )
    await engine.start()
    await engine.tick()
    await controller.stop()
