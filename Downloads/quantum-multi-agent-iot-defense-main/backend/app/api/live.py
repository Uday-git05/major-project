import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.runtime.dependencies import get_broadcaster


router = APIRouter(tags=["live"])


@router.websocket("/ws/live")
async def live(websocket: WebSocket) -> None:
    broadcaster = get_broadcaster()
    await websocket.accept()
    client_id, buffer = broadcaster.connect()
    receive_task: asyncio.Task | None = None
    queue_task: asyncio.Task | None = None

    def disconnect_when_closed(task: asyncio.Task) -> None:
        """Remove quiet clients as soon as ASGI reports their disconnect.

        Test clients and real browsers can close while the sender is blocked on an
        empty queue.  The callback makes registry cleanup independent of when the
        endpoint coroutine is next scheduled; the ``finally`` block remains the
        authoritative idempotent cleanup path.
        """
        if task.cancelled():
            return
        try:
            message = task.result()
        except (WebSocketDisconnect, RuntimeError):
            broadcaster.disconnect(client_id)
            return
        if message.get("type") == "websocket.disconnect":
            broadcaster.disconnect(client_id)

    try:
        await websocket.send_json({"message_id": str(client_id), "sequence": broadcaster.sequence,
            "epoch": broadcaster.epoch, "timestamp": datetime.now(timezone.utc).isoformat(), "type": "connection_ready",
            "correlation_id": str(client_id), "payload": {"queue_size": broadcaster.queue_size}})
        receive_task = asyncio.create_task(websocket.receive())
        receive_task.add_done_callback(disconnect_when_closed)
        while True:
            queue_task = asyncio.create_task(buffer.queue.get())
            done, _ = await asyncio.wait(
                {receive_task, queue_task}, return_when=asyncio.FIRST_COMPLETED)
            if receive_task in done:
                message = receive_task.result()
                if message["type"] == "websocket.disconnect":
                    if queue_task.done():
                        queue_task.result(); buffer.queue.task_done()
                    break
                receive_task = asyncio.create_task(websocket.receive())
                receive_task.add_done_callback(disconnect_when_closed)
            if queue_task in done:
                envelope = queue_task.result()
                try:
                    await websocket.send_json(envelope.model_dump(mode="json"))
                finally:
                    buffer.queue.task_done()
            else:
                queue_task.cancel()
                await asyncio.gather(queue_task, return_exceptions=True)
                queue_task = None
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        for task in (receive_task, queue_task):
            if task is not None and not task.done():
                task.cancel()
        await asyncio.gather(
            *(task for task in (receive_task, queue_task) if task is not None),
            return_exceptions=True)
        broadcaster.disconnect(client_id)
