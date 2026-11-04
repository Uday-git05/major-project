import asyncio
import inspect
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable
from uuid import UUID, uuid4

from .events import EVENT_TYPES, SimulationEvent


EventHandler = Callable[[SimulationEvent], Awaitable[None] | None]
logger = logging.getLogger(__name__)


class AsyncEventBus:
    """Small in-process bus with deterministic handler ordering."""

    def __init__(self) -> None:
        self._subscriptions: dict[str, dict[UUID, EventHandler]] = defaultdict(dict)
        self._lock = asyncio.Lock()

    async def subscribe(self, event_type: str, handler: EventHandler) -> UUID:
        if event_type != "*" and event_type not in EVENT_TYPES:
            raise ValueError(f"Unsupported event type: {event_type}")
        token = uuid4()
        async with self._lock:
            self._subscriptions[event_type][token] = handler
        return token

    async def unsubscribe(self, token: UUID) -> bool:
        async with self._lock:
            for handlers in self._subscriptions.values():
                if token in handlers:
                    del handlers[token]
                    return True
        return False

    async def publish(self, event: SimulationEvent) -> None:
        async with self._lock:
            handlers = list(self._subscriptions[event.event_type].values())
            handlers.extend(self._subscriptions["*"].values())
        pending: list[Awaitable[None]] = []
        for handler in handlers:
            try:
                result = handler(event)
                if inspect.isawaitable(result):
                    pending.append(result)
            except Exception:
                logger.exception("Event handler failed", extra={"event_type": event.event_type})
        if pending:
            results = await asyncio.gather(*pending, return_exceptions=True)
            for result in results:
                if isinstance(result, BaseException):
                    logger.error(
                        "Asynchronous event handler failed",
                        exc_info=(type(result), result, result.__traceback__),
                        extra={"event_type": event.event_type},
                    )
