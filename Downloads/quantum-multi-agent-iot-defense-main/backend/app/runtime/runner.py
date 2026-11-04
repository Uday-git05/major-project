import asyncio

from app.domain.simulation import SimulationState
from app.simulation.engine import SimulationEngine


class AutomaticSimulationRunner:
    """Advances logical time at a wall-clock cadence without using wall time in decisions."""

    def __init__(self, simulation: SimulationEngine, *, tick_interval: float = 1.0) -> None:
        if tick_interval <= 0:
            raise ValueError("tick_interval must be positive")
        self.simulation = simulation
        self.tick_interval = tick_interval
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self.tick_errors = 0

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self.running:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="automatic-simulation-runner")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            await self._task
            self._task = None

    async def pause(self) -> None:
        if self.simulation.clock.state is SimulationState.RUNNING:
            await self.simulation.pause()

    async def resume(self) -> None:
        if self.simulation.clock.state is SimulationState.PAUSED:
            await self.simulation.resume()

    async def reset(self, *, seed: int | None = None) -> None:
        await self.stop()
        await self.simulation.reset(seed=seed)

    async def _run(self) -> None:
        while not self._stop.is_set():
            delay = self.tick_interval / self.simulation.simulation_speed
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=delay)
                continue
            except TimeoutError:
                pass
            if self.simulation.clock.state is SimulationState.RUNNING:
                try:
                    await self.advance_once()
                except Exception:
                    self.tick_errors += 1

    async def advance_once(self) -> bool:
        if self.simulation.clock.state is not SimulationState.RUNNING:
            return False
        await self.simulation.tick()
        return True
