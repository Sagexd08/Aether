import asyncio
import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from .config import get_settings
from .db import SessionLocal
from .routers.session import get_session_from_id

router = APIRouter()
settings = get_settings()


async def _get_redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


@router.websocket('/ws/{session_id}')
async def session_ws(
    websocket: WebSocket,
    session_id: str,
) -> None:
    await websocket.accept()

    # Verify session
    async with SessionLocal() as db:
        try:
            await get_session_from_id(session_id, db)
        except Exception:
            await websocket.send_json({'type': 'error', 'code': 'unauthorized', 'message': 'Invalid session', 'ts': int(time.time() * 1000)})
            await websocket.close(code=4001)
            return

    redis = await _get_redis()

    await websocket.send_json({
        'type': 'connected',
        'sessionId': session_id,
        'ts': int(time.time() * 1000),
    })

    pubsub = redis.pubsub()
    await pubsub.subscribe(f'ws:session:{session_id}')

    async def receive_loop() -> None:
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    msg = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if msg.get('type') == 'ping':
                    await websocket.send_json({'type': 'pong', 'ts': int(time.time() * 1000)})
        except WebSocketDisconnect:
            pass

    async def pubsub_loop() -> None:
        try:
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    await websocket.send_text(message['data'])
        except Exception:
            pass

    try:
        await asyncio.gather(receive_loop(), pubsub_loop(), return_exceptions=True)
    finally:
        await pubsub.unsubscribe(f'ws:session:{session_id}')
        await pubsub.close()
        await redis.aclose()
