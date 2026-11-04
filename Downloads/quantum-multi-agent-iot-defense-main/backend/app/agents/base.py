import asyncio
from abc import ABC, abstractmethod
from collections import deque
from datetime import datetime, timezone
import logging
from uuid import UUID, uuid4

from app.domain.agents import (
    AgentAuditEntry,
    AgentHealth,
    AgentStatus,
    AgentType,
    AgentView,
)
from app.simulation.bus import AsyncEventBus
from app.simulation.events import (
    AgentStatusEvent,
    AgentStatusPayload,
    SimulationEvent,
)


logger = logging.getLogger(__name__)


class AgentLifecycleError(RuntimeError):
    pass


class BaseAgent(ABC):
    """Independent queue-backed event consumer with lifecycle and audit state."""

    def __init__(
        self,
        *,
        agent_id: str,
        agent_type: AgentType,
        name: str,
        role: str,
        bus: AsyncEventBus,
        subscriptions: set[str],
        audit_limit: int = 500,
        queue_limit: int = 256,
    ) -> None:
        if audit_limit < 1:
            raise ValueError("audit_limit must be positive")
        if queue_limit < 1:
            raise ValueError("queue_limit must be positive")
        self.agent_id = agent_id
        self.agent_type = agent_type
        self.name = name
        self.role = role
        self.bus = bus
        self.subscriptions = frozenset(subscriptions)
        self.status = AgentStatus.STOPPED
        self.health = AgentHealth.UNKNOWN
        self.started_at: datetime | None = None
        self.last_activity_at: datetime | None = None
        self.processed_event_count = 0
        self.error_count = 0
        self._queue: asyncio.Queue[SimulationEvent] = asyncio.Queue(maxsize=queue_limit)
        self.dropped_event_count = 0
        self.coalesced_background_event_count = 0
        self._subscription_tokens: list[UUID] = []
        self._worker: asyncio.Task[None] | None = None
        self._run_gate = asyncio.Event()
        self._audit: deque[AgentAuditEntry] = deque(maxlen=audit_limit)
        self._audit_sequence = 0
        self._active_events = 0

    async def start(self) -> None:
        if self.status in {AgentStatus.RUNNING, AgentStatus.DEGRADED, AgentStatus.PAUSED}:
            return
        self.status = AgentStatus.STARTING
        self.health = AgentHealth.UNKNOWN
        for event_type in sorted(self.subscriptions):
            self._subscription_tokens.append(
                await self.bus.subscribe(event_type, self._enqueue)
            )
        self._run_gate.set()
        self._worker = asyncio.create_task(self._run(), name=f"agent:{self.agent_id}")
        now = datetime.now(timezone.utc)
        self.started_at = now
        self.last_activity_at = now
        self.status = AgentStatus.RUNNING
        self.health = AgentHealth.HEALTHY
        self._record("lifecycle", "agent started")
        await self._publish_status()

    async def stop(self) -> None:
        if self.status is AgentStatus.STOPPED:
            return
        for token in self._subscription_tokens:
            await self.bus.unsubscribe(token)
        self._subscription_tokens.clear()
        if self._worker is not None:
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass
            self._worker = None
        self._run_gate.clear()
        self.status = AgentStatus.STOPPED
        self.health = AgentHealth.UNKNOWN
        self.last_activity_at = datetime.now(timezone.utc)
        self._record("lifecycle", "agent stopped")
        await self._publish_status()

    async def pause(self) -> None:
        if self.status not in {AgentStatus.RUNNING, AgentStatus.DEGRADED}:
            raise AgentLifecycleError(f"Cannot pause {self.agent_id} while {self.status}")
        self._run_gate.clear()
        self.status = AgentStatus.PAUSED
        self._record("lifecycle", "agent paused")
        await self._publish_status()

    async def resume(self) -> None:
        if self.status is not AgentStatus.PAUSED:
            raise AgentLifecycleError(f"Cannot resume {self.agent_id} while {self.status}")
        self.status = AgentStatus.DEGRADED if self.error_count else AgentStatus.RUNNING
        self.health = AgentHealth.DEGRADED if self.error_count else AgentHealth.HEALTHY
        self._run_gate.set()
        self._record("lifecycle", "agent resumed")
        await self._publish_status()

    def _enqueue(self, event: SimulationEvent) -> None:
        if self.status in {AgentStatus.RUNNING, AgentStatus.DEGRADED, AgentStatus.PAUSED}:
            if self._queue.full():
                try:
                    self._queue.get_nowait()
                    self._queue.task_done()
                    self.dropped_event_count += 1
                except asyncio.QueueEmpty:
                    pass
            self._queue.put_nowait(event)

    async def _run(self) -> None:
        while True:
            event = await self._queue.get()
            self._active_events += 1
            try:
                await self._run_gate.wait()
                self.last_activity_at = datetime.now(timezone.utc)
                self._record(
                    "event_received",
                    f"received {event.event_type}",
                    correlation_id=event.correlation_id,
                    event_type=event.event_type,
                )
                await self.handle_event(event)
                self.processed_event_count += 1
                self._record(
                    "event_processed",
                    f"processed {event.event_type}",
                    correlation_id=event.correlation_id,
                    event_type=event.event_type,
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.error_count += 1
                self.status = AgentStatus.DEGRADED
                self.health = AgentHealth.DEGRADED
                self._record(
                    "error",
                    f"failed to process {event.event_type}",
                    correlation_id=event.correlation_id,
                    event_type=event.event_type,
                    error=str(exc),
                )
                logger.exception(
                    "Agent event handling failed",
                    extra={"agent_id": self.agent_id, "event_type": event.event_type},
                )
            finally:
                self._active_events -= 1
                self._queue.task_done()

    @abstractmethod
    async def handle_event(self, event: SimulationEvent) -> None:
        """Process one subscribed event and optionally publish typed output."""

    async def publish(self, event: SimulationEvent, detail: str) -> None:
        await self.bus.publish(event)
        self._record(
            "event_produced",
            detail,
            correlation_id=event.correlation_id,
            event_type=event.event_type,
        )

    async def wait_idle(self) -> None:
        await self._queue.join()

    def is_idle(self) -> bool:
        return self._queue.empty() and self._active_events == 0

    def view(self) -> AgentView:
        state = self.public_state()
        state.update({
            "queued_events": self._queue.qsize(),
            "queue_capacity": self._queue.maxsize,
            "dropped_events": self.dropped_event_count,
            "coalesced_background_events": self.coalesced_background_event_count,
        })
        return AgentView(
            agent_id=self.agent_id,
            agent_type=self.agent_type,
            name=self.name,
            role=self.role,
            status=self.status,
            health=self.health,
            started_at=self.started_at,
            last_activity_at=self.last_activity_at,
            processed_event_count=self.processed_event_count,
            error_count=self.error_count,
            subscriptions=sorted(self.subscriptions),
            dependencies=self.dependencies(),
            state=state,
        )

    def dependencies(self) -> dict[str, str]:
        return {"event_bus": "available"}

    def public_state(self) -> dict[str, object]:
        return {"queued_events": self._queue.qsize()}

    def audit(self) -> tuple[AgentAuditEntry, ...]:
        return tuple(self._audit)

    def reset_operational_state(self) -> None:
        self.processed_event_count = 0
        self.error_count = 0
        self.dropped_event_count = 0
        self.coalesced_background_event_count = 0
        self._audit.clear()
        self._audit_sequence = 0
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
                self._queue.task_done()
            except asyncio.QueueEmpty:
                break

    def _record(
        self,
        action: str,
        detail: str,
        *,
        correlation_id: UUID | None = None,
        event_type: str | None = None,
        error: str | None = None,
    ) -> None:
        self._audit_sequence += 1
        self._audit.append(
            AgentAuditEntry(
                sequence=self._audit_sequence,
                agent_id=self.agent_id,
                timestamp=datetime.now(timezone.utc),
                action=action,
                status=self.status,
                correlation_id=str(correlation_id) if correlation_id else None,
                event_type=event_type,
                detail=detail,
                error=error,
            )
        )

    async def _publish_status(self) -> None:
        event = AgentStatusEvent(
            event_id=uuid4(),
            timestamp=datetime.now(timezone.utc),
            source=self.agent_id,
            correlation_id=uuid4(),
            payload=AgentStatusPayload(
                agent_id=self.agent_id,
                agent_type=self.agent_type,
                status=self.status,
                health=self.health,
                processed_event_count=self.processed_event_count,
                error_count=self.error_count,
            ),
        )
        await self.bus.publish(event)
