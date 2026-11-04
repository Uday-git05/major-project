import socket

import pytest

from app.domain.simulation import DeviceStatus, DeviceType, SimulationState
from app.simulation.clock import InvalidClockTransition
from app.simulation.engine import SimulationEngine


def _serialized_events(engine: SimulationEngine):
    return [event.model_dump(mode="json") for event in engine.events(limit=1000)]


@pytest.mark.anyio
async def test_same_seed_reproduces_exact_event_sequence():
    first = SimulationEngine(seed=101)
    second = SimulationEngine(seed=101)
    await first.start()
    await second.start()
    await first.tick(3)
    await second.tick(3)
    assert _serialized_events(first) == _serialized_events(second)


@pytest.mark.anyio
async def test_different_seed_changes_telemetry():
    first = SimulationEngine(seed=101)
    second = SimulationEngine(seed=102)
    await first.start()
    await second.start()
    await first.tick()
    await second.tick()
    first_values = [
        event.payload.readings
        for event in first.events(event_type="telemetry")
    ]
    second_values = [
        event.payload.readings
        for event in second.events(event_type="telemetry")
    ]
    assert first_values != second_values


@pytest.mark.anyio
async def test_start_pause_resume_reset(simulation_engine):
    started = await simulation_engine.start()
    assert started.status.state is SimulationState.RUNNING
    await simulation_engine.tick(2)
    await simulation_engine.pause()
    with pytest.raises(InvalidClockTransition):
        await simulation_engine.tick()
    await simulation_engine.resume()
    await simulation_engine.tick()
    reset = await simulation_engine.reset()
    assert reset.status.state is SimulationState.STOPPED
    assert reset.status.tick_number == 0
    assert reset.status.event_count == 0
    assert all(device.last_seen is None for device in simulation_engine.device_views())


def test_default_devices_have_required_types_and_independent_health(simulation_engine):
    devices = simulation_engine.device_views()
    types = {device.device_type for device in devices}
    assert types == set(DeviceType)
    assert sum(device.device_type is DeviceType.SOIL_MOISTURE_SENSOR for device in devices) == 2
    assert all(device.status is DeviceStatus.ONLINE for device in devices)
    assert all(device.health.value == "healthy" for device in devices)
    assert len({device.address for device in devices}) == len(devices)


@pytest.mark.anyio
async def test_tick_generates_telemetry_network_and_health(simulation_engine):
    await simulation_engine.start()
    result = await simulation_engine.tick()
    assert result.events_emitted > 0
    telemetry = simulation_engine.events(event_type="telemetry")
    network = simulation_engine.events(event_type="network_activity")
    health = simulation_engine.events(event_type="system_health")
    assert len(telemetry) == len(simulation_engine.devices) - 1
    assert len(network) == len(telemetry)
    assert len(health) == 1
    activity = network[0].payload
    assert activity.byte_count == activity.payload_bytes + activity.header_bytes
    assert activity.destination_device_id == simulation_engine.topology().gateway_id
    assert activity.success is True


@pytest.mark.anyio
async def test_virtual_irrigation_cycle_activates_and_deactivates_pump():
    engine = SimulationEngine(seed=73)
    await engine.start()
    await engine.tick(100)
    pump_states = [event.payload.readings["pump_on"] for event in engine.events(event_type="telemetry", limit=1000)
                   if event.payload.device_id == "pump_controller-01"]
    flow_values = [event.payload.readings["flow_liters_per_minute"] for event in engine.events(event_type="telemetry", limit=1000)
                   if event.payload.device_id == "water_flow-01"]
    assert True in pump_states and False in pump_states
    assert any(value > 0.15 for value in flow_values)


def test_topology_is_explicit_and_contains_control_link(simulation_engine):
    topology = simulation_engine.topology()
    assert len(topology.nodes) == len(simulation_engine.devices)
    assert len(topology.links) == len(simulation_engine.devices)
    assert any(link.relationship == "control" for link in topology.links)
    assert all(
        link.source_device_id == topology.gateway_id
        or link.destination_device_id == topology.gateway_id
        for link in topology.links
    )


@pytest.mark.anyio
async def test_normal_simulation_uses_no_external_network_or_attack_events(
    monkeypatch, simulation_engine
):
    def forbidden_socket(*args, **kwargs):
        raise AssertionError("External network access attempted")

    monkeypatch.setattr(socket, "socket", forbidden_socket)
    await simulation_engine.start()
    await simulation_engine.tick(5)
    event_types = {event.event_type for event in simulation_engine.events(limit=1000)}
    assert "attack" not in event_types
    assert event_types == {
        "device_state",
        "simulation_tick",
        "telemetry",
        "network_activity",
        "system_health",
    }
