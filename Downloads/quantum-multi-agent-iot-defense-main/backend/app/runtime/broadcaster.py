import asyncio
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel

from app.simulation.bus import AsyncEventBus
from app.simulation.events import SimulationEvent


class LiveEnvelope(BaseModel):
    message_id: UUID
    sequence: int
    epoch: int
    timestamp: datetime
    type: str
    correlation_id: UUID
    payload: dict[str, object]


@dataclass
class ClientBuffer:
    queue: asyncio.Queue[LiveEnvelope]
    dropped_messages: int = 0


class LiveEventBroadcaster:
    """Non-blocking fan-out with isolated bounded buffers per WebSocket client."""

    def __init__(self, bus: AsyncEventBus, *, queue_size: int = 256,
                 history_size: int = 1000) -> None:
        if queue_size < 1:
            raise ValueError("queue_size must be positive")
        self.bus = bus
        self.queue_size = queue_size
        self.clients: dict[UUID, ClientBuffer] = {}
        self.sequence = 0
        self.epoch = 1
        self.total_dropped = 0
        self.recent_events: deque[SimulationEvent] = deque(maxlen=history_size)
        self._token: UUID | None = None

    async def start(self) -> None:
        if self._token is None:
            self._token = await self.bus.subscribe("*", self.publish)

    async def stop(self) -> None:
        if self._token is not None:
            await self.bus.unsubscribe(self._token)
            self._token = None
        self.clients.clear()

    def connect(self) -> tuple[UUID, ClientBuffer]:
        client_id = uuid4()
        buffer = ClientBuffer(asyncio.Queue(maxsize=self.queue_size))
        self.clients[client_id] = buffer
        return client_id, buffer

    def disconnect(self, client_id: UUID) -> None:
        self.clients.pop(client_id, None)

    async def publish(self, event: SimulationEvent) -> None:
        self.sequence += 1
        self.recent_events.append(event)
        envelope = LiveEnvelope(
            message_id=uuid4(), sequence=self.sequence, epoch=self.epoch,
            timestamp=event.timestamp, type=event.event_type,
            correlation_id=event.correlation_id,
            payload={"event": event.model_dump(mode="json")},
        )
        for buffer in tuple(self.clients.values()):
            if buffer.queue.full():
                try:
                    buffer.queue.get_nowait()
                    buffer.queue.task_done()
                except asyncio.QueueEmpty:
                    pass
                buffer.dropped_messages += 1
                self.total_dropped += 1
            buffer.queue.put_nowait(envelope)

    def new_epoch(self) -> int:
        self.epoch += 1
        self.sequence = 0
        self.recent_events.clear()
        for buffer in self.clients.values():
            while not buffer.queue.empty():
                try:
                    buffer.queue.get_nowait(); buffer.queue.task_done()
                except asyncio.QueueEmpty:
                    break
        marker = LiveEnvelope(
            message_id=uuid4(), sequence=0, epoch=self.epoch,
            timestamp=datetime.now(timezone.utc), type="runtime_reset",
            correlation_id=uuid4(), payload={"reason": "deterministic_full_reset"},
        )
        for buffer in self.clients.values():
            buffer.queue.put_nowait(marker)
        return self.epoch

    def health(self) -> dict[str, object]:
        return {"running": self._token is not None, "connected_clients": len(self.clients),
                "queue_size": self.queue_size, "dropped_messages": self.total_dropped,
                "sequence": self.sequence, "epoch": self.epoch,
                "checked_at": datetime.now(timezone.utc).isoformat()}
