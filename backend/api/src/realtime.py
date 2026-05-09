from fastapi import APIRouter, WebSocket

router = APIRouter()


@router.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    await websocket.send_json({'type': 'connected', 'message': 'AETHER realtime channel ready'})
    while True:
        data = await websocket.receive_text()
        await websocket.send_json({'type': 'echo', 'message': data})
