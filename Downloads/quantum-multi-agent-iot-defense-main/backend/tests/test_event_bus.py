import pytest

from app.simulation.bus import AsyncEventBus
from app.simulation.events import SimulationTickEvent, SimulationTickPayload
from app.domain.simulation import SimulationState
from datetime import datetime, timezone
from uuid import uuid4


@pytest.mark.anyio
async def test_event_bus_publish_subscribe_and_unsubscribe():
    bus = AsyncEventBus()
    received = []
    wildcard = []
    token = await bus.subscribe("simulation_tick", received.append)
    await bus.subscribe("*", wildcard.append)
    event = SimulationTickEvent(
        event_id=uuid4(),
        timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
        source="test-clock",
        correlation_id=uuid4(),
        payload=SimulationTickPayload(
            tick_number=1,
            tick_duration_seconds=1.0,
            state=SimulationState.RUNNING,
        ),
    )
    await bus.publish(event)
    assert received == [event]
    assert wildcard == [event]
    assert await bus.unsubscribe(token) is True
    assert await bus.unsubscribe(token) is False
    await bus.publish(event)
    assert received == [event]
    assert wildcard == [event, event]


@pytest.mark.anyio
async def test_event_bus_rejects_unknown_event_type():
    bus = AsyncEventBus()
    with pytest.raises(ValueError, match="Unsupported event type"):
        await bus.subscribe("attack", lambda event: None)
