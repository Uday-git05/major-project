import asyncio

from app.domain.agents import (
    AgentAuditEntry,
    AgentHealth,
    AgentHealthSummary,
    AgentLifecycleResponse,
    AgentView,
)

from .base import BaseAgent


class DuplicateAgentError(ValueError):
    pass


class AgentNotFoundError(KeyError):
    pass


class AgentManager:
    """Owns registration and lifecycle; reasoning remains inside individual agents."""

    def __init__(self) -> None:
        self._agents: dict[str, BaseAgent] = {}

    def register(self, agent: BaseAgent) -> None:
        if agent.agent_id in self._agents:
            raise DuplicateAgentError(f"Duplicate agent ID: {agent.agent_id}")
        self._agents[agent.agent_id] = agent

    def get(self, agent_id: str) -> BaseAgent:
        try:
            return self._agents[agent_id]
        except KeyError as exc:
            raise AgentNotFoundError(agent_id) from exc

    async def start_all(self) -> AgentLifecycleResponse:
        for agent in self._agents.values():
            await agent.start()
        return AgentLifecycleResponse(action="start", agents=self.views())

    async def stop_all(self) -> AgentLifecycleResponse:
        for agent in reversed(tuple(self._agents.values())):
            await agent.stop()
        return AgentLifecycleResponse(action="stop", agents=self.views())

    def views(self) -> list[AgentView]:
        return [agent.view() for agent in self._agents.values()]

    def health(self) -> AgentHealthSummary:
        views = self.views()
        return AgentHealthSummary(
            total_agents=len(views),
            healthy_agents=sum(view.health is AgentHealth.HEALTHY for view in views),
            degraded_agents=sum(view.health is AgentHealth.DEGRADED for view in views),
            unhealthy_agents=sum(view.health is AgentHealth.UNHEALTHY for view in views),
            agents=views,
        )

    def audit(self, *, agent_id: str | None = None, limit: int = 200) -> list[AgentAuditEntry]:
        agents = [self.get(agent_id)] if agent_id else list(self._agents.values())
        entries = [entry for agent in agents for entry in agent.audit()]
        entries.sort(key=lambda entry: (entry.timestamp, entry.agent_id, entry.sequence))
        return entries[-limit:]

    async def wait_idle(self) -> None:
        for _ in range(100):
            await asyncio.gather(*(agent.wait_idle() for agent in self._agents.values()))
            await asyncio.sleep(0)
            if all(agent.is_idle() for agent in self._agents.values()):
                return
        raise TimeoutError("Agent pipeline did not become idle")

    def reset_operational_state(self) -> None:
        for agent in self._agents.values():
            agent.reset_operational_state()
            if hasattr(agent, "incidents"):
                agent.incidents.clear()
            if hasattr(agent, "recent_activity"):
                agent.recent_activity.clear()
            for name in ("telemetry_events", "network_events", "structural_anomalies", "inference_count"):
                if hasattr(agent, name):
                    setattr(agent, name, 0)
