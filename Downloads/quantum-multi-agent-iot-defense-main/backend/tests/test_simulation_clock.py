from datetime import datetime, timezone

import pytest

from app.domain.simulation import SimulationState
from app.simulation.clock import InvalidClockTransition, SimulationClock


def test_clock_lifecycle_and_logical_time():
    clock = SimulationClock(
        tick_duration_seconds=2.5,
        start_time=datetime(2030, 1, 1, tzinfo=timezone.utc),
    )
    assert clock.state is SimulationState.STOPPED
    clock.start()
    assert clock.advance() == datetime(2030, 1, 1, 0, 0, 2, 500000, tzinfo=timezone.utc)
    clock.pause()
    with pytest.raises(InvalidClockTransition):
        clock.advance()
    clock.resume()
    clock.advance()
    assert clock.tick_number == 2
    clock.reset()
    assert clock.tick_number == 0
    assert clock.current_time == clock.initial_time
    assert clock.state is SimulationState.STOPPED


def test_clock_rejects_invalid_transitions():
    clock = SimulationClock(1.0)
    with pytest.raises(InvalidClockTransition):
        clock.pause()
    with pytest.raises(InvalidClockTransition):
        clock.resume()
    with pytest.raises(InvalidClockTransition):
        clock.advance()
