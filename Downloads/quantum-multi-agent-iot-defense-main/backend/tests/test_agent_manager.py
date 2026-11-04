from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.agents.base import BaseAgent
from app.agents.manager import AgentManager, DuplicateAgentError
from app.domain.agents import AgentHealth, AgentStatus, AgentType
from app.simulation.bus import AsyncEventBus
from app.simulation.events import SimulationEvent, SimulationTickEvent, SimulationTickPayload
from app.domain.simulation import SimulationState


class CountingAgent(BaseAgent):
    def __init__(self, bus, *, agent_id="counter", audit_limit=20, queue_limit=256, fail=False):
        super().__init__(
            agent_id=agent_id,
            agent_type=AgentType.MONITORING,
            name="Counter",
            role="Test event handling",
            bus=bus,
            subscriptions={"simulation_tick"},
            audit_limit=audit_limit,
            queue_limit=queue_limit,
        )
        self.count = 0
        self.fail = fail

    async def handle_event(self, event: SimulationEvent) -> None:
        self.count += 1
        if self.fail:
            raise RuntimeError("isolated failure")


def tick_event():
    return SimulationTickEvent(
        event_id=uuid4(),
        timestamp=datetime.now(timezone.utc),
        source="clock",
        correlation_id=uuid4(),
        payload=SimulationTickPayload(
            tick_number=1, tick_duration_seconds=1.0, state=SimulationState.RUNNING
        ),
    )


def test_registration_and_duplicate_rejection():
    manager = AgentManager()
    agent = CountingAgent(AsyncEventBus())
    manager.register(agent)
    assert manager.get("counter") is agent
    with pytest.raises(DuplicateAgentError, match="Duplicate agent ID"):
        manager.register(CountingAgent(AsyncEventBus()))


@pytest.mark.anyio
async def test_agent_lifecycle_and_health():
    manager = AgentManager()
    agent = CountingAgent(AsyncEventBus())
    manager.register(agent)
    await manager.start_all()
    assert agent.status is AgentStatus.RUNNING
    assert agent.health is AgentHealth.HEALTHY
    await agent.pause()
    assert agent.status is AgentStatus.PAUSED
    await agent.resume()
    assert agent.status is AgentStatus.RUNNING
    await manager.stop_all()
    assert agent.status is AgentStatus.STOPPED


@pytest.mark.anyio
async def test_failure_is_isolated_and_reported():
    bus = AsyncEventBus()
    failing = CountingAgent(bus, agent_id="failing", fail=True)
    healthy = CountingAgent(bus, agent_id="healthy")
    manager = AgentManager()
    manager.register(failing)
    manager.register(healthy)
    await manager.start_all()
    await bus.publish(tick_event())
    await manager.wait_idle()
    assert failing.error_count == 1
    assert failing.status is AgentStatus.DEGRADED
    assert healthy.count == 1
    assert healthy.health is AgentHealth.HEALTHY
    await manager.stop_all()


@pytest.mark.anyio
async def test_audit_history_is_bounded():
    bus = AsyncEventBus()
    agent = CountingAgent(bus, audit_limit=3)
    manager = AgentManager()
    manager.register(agent)
    await manager.start_all()
    for _ in range(4):
        await bus.publish(tick_event())
    await manager.wait_idle()
    assert len(agent.audit()) == 3
    assert all(entry.agent_id == "counter" for entry in agent.audit())
    await manager.stop_all()


@pytest.mark.anyio
async def test_agent_queue_is_bounded_and_reports_drops():
    bus = AsyncEventBus()
    agent = CountingAgent(bus, queue_limit=2)
    manager = AgentManager()
    manager.register(agent)
    await manager.start_all()
    await agent.pause()
    for _ in range(5):
        await bus.publish(tick_event())
    state = agent.view().state
    assert state["queued_events"] == 2
    assert state["queue_capacity"] == 2
    assert state["dropped_events"] == 3
    await agent.resume()
    await manager.wait_idle()
    assert agent.count == 2
    await manager.stop_all()
