from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.features.manager import FeatureExtractionManager
from app.simulation.bus import AsyncEventBus
from app.simulation.events import (
    NetworkActivityEvent,
    NetworkActivityPayload,
    SimulationTickEvent,
    SimulationTickPayload,
)
from app.domain.simulation import SimulationState

from feature_test_utils import network_event, packet


@pytest.mark.anyio
async def test_duplicate_and_missing_packet_metadata_policies():
    bus = AsyncEventBus()
    manager = FeatureExtractionManager(bus, emission_interval_seconds=0)
    await manager.start()
    event = network_event(
        [packet(0.0, "forward", 20, 10), packet(1.0, "backward", 20, 10)]
    )
    await bus.publish(event)
    await bus.publish(event)
    missing = NetworkActivityEvent(
        event_id=uuid4(),
        timestamp=datetime.now(timezone.utc),
        source="sensor",
        correlation_id=uuid4(),
        payload=NetworkActivityPayload(
            source_device_id="sensor",
            destination_device_id="gateway",
            source_address="10.0.0.2",
            destination_address="10.0.0.1",
            source_port=20000,
            destination_port=1883,
            protocol="TCP",
            service="mqtt",
            direction="device_to_gateway",
            packet_count=1,
            byte_count=30,
            payload_bytes=10,
            header_bytes=20,
            duration_seconds=0,
            inter_arrival_time_seconds=0,
            response_packet_count=0,
            response_byte_count=0,
            success=True,
        ),
    )
    await bus.publish(missing)
    assert manager.duplicate_events == 1
    assert manager.invalid_events == 1
    assert manager.vectors_emitted == 1
    await manager.stop()


@pytest.mark.anyio
async def test_out_of_order_events_are_sorted_and_counted():
    bus = AsyncEventBus()
    manager = FeatureExtractionManager(bus, emission_interval_seconds=10)
    await manager.start()
    later = network_event(
        [packet(0.0, "forward", 20, 10), packet(1.0, "backward", 20, 10)],
        timestamp=datetime(2026, 1, 1, 0, 0, 10, tzinfo=timezone.utc),
    )
    earlier = network_event(
        [packet(0.0, "forward", 20, 20), packet(1.0, "backward", 20, 20)],
        timestamp=datetime(2026, 1, 1, 0, 0, 5, tzinfo=timezone.utc),
    )
    await bus.publish(later)
    await bus.publish(earlier)
    flow = next(iter(manager.active_flows.values()))
    assert manager.out_of_order_events == 1
    assert flow.flow_start == earlier.timestamp
    assert [item.timestamp for item in flow.packets] == sorted(item.timestamp for item in flow.packets)
    await manager.stop()


@pytest.mark.anyio
async def test_emission_interval_and_timeout_final_window():
    bus = AsyncEventBus()
    manager = FeatureExtractionManager(
        bus,
        emission_interval_seconds=1.0,
        inactivity_timeout_seconds=2.0,
        max_flow_age_seconds=20.0,
    )
    emitted = []
    await bus.subscribe("feature_vector", emitted.append)
    await manager.start()
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    await bus.publish(
        network_event(
            [packet(0, "forward", 20, 10), packet(0.1, "backward", 20, 10)],
            timestamp=start,
        )
    )
    await bus.publish(
        network_event(
            [packet(0, "forward", 20, 10), packet(0.1, "backward", 20, 10)],
            timestamp=start + timedelta(seconds=0.5),
        )
    )
    assert len(emitted) == 1
    await bus.publish(
        network_event(
            [packet(0, "forward", 20, 10), packet(0.1, "backward", 20, 10)],
            timestamp=start + timedelta(seconds=1.0),
        )
    )
    assert len(emitted) == 2
    tick_time = start + timedelta(seconds=3.1)
    await bus.publish(
        SimulationTickEvent(
            event_id=uuid4(),
            timestamp=tick_time,
            source="clock",
            correlation_id=uuid4(),
            payload=SimulationTickPayload(
                tick_number=4,
                tick_duration_seconds=1.0,
                state=SimulationState.RUNNING,
            ),
        )
    )
    assert len(emitted) == 3
    assert emitted[-1].payload.is_partial_window is False
    assert not manager.active_flows
    await manager.stop()


@pytest.mark.anyio
async def test_correlation_and_bounded_provenance_are_preserved():
    bus = AsyncEventBus()
    manager = FeatureExtractionManager(
        bus, emission_interval_seconds=0, provenance_limit=2
    )
    emitted = []
    await bus.subscribe("feature_vector", emitted.append)
    await manager.start()
    correlations = [uuid4(), uuid4(), uuid4()]
    event_ids = []
    for index, correlation in enumerate(correlations):
        event = network_event(
            [packet(0, "forward", 20, 10), packet(0.1, "backward", 20, 10)],
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=index),
            correlation_id=correlation,
        )
        event_ids.append(event.event_id)
        await bus.publish(event)
    assert emitted[-1].correlation_id == correlations[-1]
    assert emitted[-1].payload.source_event_ids == event_ids[-2:]
    assert emitted[-1].payload.flow_id
    await manager.stop()


@pytest.mark.anyio
async def test_maximum_flow_age_closes_window_even_when_recently_active():
    bus = AsyncEventBus()
    manager = FeatureExtractionManager(
        bus,
        inactivity_timeout_seconds=100.0,
        max_flow_age_seconds=2.0,
        emission_interval_seconds=10.0,
    )
    emitted = []
    await bus.subscribe("feature_vector", emitted.append)
    await manager.start()
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    await bus.publish(
        network_event(
            [packet(0, "forward", 20, 10), packet(0.1, "backward", 20, 10)],
            timestamp=start,
        )
    )
    await manager.expire_flows(start + timedelta(seconds=2.1))
    assert len(emitted) == 2
    assert emitted[-1].payload.is_partial_window is False
    assert manager.active_flows == {}
    await manager.stop()
