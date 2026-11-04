from datetime import datetime, timedelta, timezone

from app.domain.simulation import SimulationState


class InvalidClockTransition(RuntimeError):
    pass


class SimulationClock:
    """Logical clock independent from wall-clock time."""

    def __init__(self, tick_duration_seconds: float, start_time: datetime | None = None) -> None:
        if tick_duration_seconds <= 0:
            raise ValueError("tick_duration_seconds must be positive")
        self.tick_duration_seconds = float(tick_duration_seconds)
        self.initial_time = start_time or datetime(2026, 1, 1, tzinfo=timezone.utc)
        if self.initial_time.tzinfo is None:
            raise ValueError("start_time must be timezone-aware")
        self.reset()

    def start(self) -> None:
        if self.state is not SimulationState.STOPPED:
            raise InvalidClockTransition(f"Cannot start while {self.state}")
        self.state = SimulationState.RUNNING

    def pause(self) -> None:
        if self.state is not SimulationState.RUNNING:
            raise InvalidClockTransition(f"Cannot pause while {self.state}")
        self.state = SimulationState.PAUSED

    def resume(self) -> None:
        if self.state is not SimulationState.PAUSED:
            raise InvalidClockTransition(f"Cannot resume while {self.state}")
        self.state = SimulationState.RUNNING

    def advance(self) -> datetime:
        if self.state is not SimulationState.RUNNING:
            raise InvalidClockTransition(f"Cannot tick while {self.state}")
        self.tick_number += 1
        self.current_time = self.initial_time + timedelta(
            seconds=self.tick_number * self.tick_duration_seconds
        )
        return self.current_time

    def reset(self) -> None:
        self.state = SimulationState.STOPPED
        self.tick_number = 0
        self.current_time = self.initial_time
