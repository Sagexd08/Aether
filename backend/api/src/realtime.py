import asyncio
import json
import time
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from .config import get_settings
from .security import decode_access_token
from .db import SessionLocal
from .models import Workspace

router = APIRouter()
settings = get_settings()

PRESENCE_TTL = 30  # seconds


async def _get_redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def _register_presence(redis: Redis, workspace_id: str, user_id: str) -> None:
    await redis.sadd(f'ws:presence:{workspace_id}', user_id)
    await redis.expire(f'ws:presence:{workspace_id}', PRESENCE_TTL)


async def _remove_presence(redis: Redis, workspace_id: str, user_id: str) -> None:
    await redis.srem(f'ws:presence:{workspace_id}', user_id)


async def _broadcast_presence(redis: Redis, workspace_id: str) -> None:
    members = await redis.smembers(f'ws:presence:{workspace_id}')
    event = json.dumps({
        'type': 'workspace.presence',
        'userIds': list(members),
        'ts': int(time.time() * 1000),
    })
    await redis.publish(f'ws:workspace:{workspace_id}', event)


@router.websocket('/ws/{workspace_id}')
async def workspace_ws(
    websocket: WebSocket,
    workspace_id: str,
    token: str = Query(default=''),
) -> None:
    await websocket.accept()

    # Authenticate
    try:
        user_id = decode_access_token(token)
    except Exception:
        await websocket.send_json({'type': 'error', 'code': 'unauthorized', 'message': 'Invalid token', 'ts': int(time.time() * 1000)})
        await websocket.close(code=4001)
        return

    # Verify workspace ownership
    async with SessionLocal() as db:
        workspace = await db.get(Workspace, workspace_id)
        if not workspace or workspace.owner_id != user_id:
            await websocket.send_json({'type': 'error', 'code': 'unauthorized', 'message': 'Workspace not found', 'ts': int(time.time() * 1000)})
            await websocket.close(code=4001)
            return

    redis = await _get_redis()
    await _register_presence(redis, workspace_id, user_id)
    await _broadcast_presence(redis, workspace_id)

    await websocket.send_json({
        'type': 'connected',
        'workspaceId': workspace_id,
        'userId': user_id,
        'ts': int(time.time() * 1000),
    })

    pubsub = redis.pubsub()
    await pubsub.subscribe(f'ws:workspace:{workspace_id}')

    async def receive_loop() -> None:
        try:
            while True:
                data = await websocket.receive_text()
                await redis.expire(f'ws:presence:{workspace_id}', PRESENCE_TTL)
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
        await pubsub.unsubscribe(f'ws:workspace:{workspace_id}')
        await pubsub.close()
        await _remove_presence(redis, workspace_id, user_id)
        await _broadcast_presence(redis, workspace_id)
        await redis.aclose()
