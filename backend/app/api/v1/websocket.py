"""
WebSocket endpoints
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.services.websocket import manager
from app.api.dependencies import get_current_user
from app.models.user import User
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint for real-time updates

    Channels:
    - all: All updates
    - backups: Backup/restore progress
    - servers: Server health updates
    - logs: System logs and command output
    """
    await manager.connect(websocket, channel="all")

    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()

            # Handle channel subscription changes
            import json
            try:
                message = json.loads(data)
                if message.get("action") == "subscribe":
                    channel = message.get("channel", "all")
                    await manager.connect(websocket, channel=channel)
                    await websocket.send_json({
                        "type": "subscribed",
                        "channel": channel
                    })
                elif message.get("action") == "unsubscribe":
                    channel = message.get("channel", "all")
                    manager.disconnect(websocket, channel=channel)
                    await websocket.send_json({
                        "type": "unsubscribed",
                        "channel": channel
                    })
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        manager.disconnect(websocket, channel="all")
        logger.info("WebSocket client disconnected")


@router.websocket("/ws/backups/{backup_id}")
async def backup_websocket(websocket: WebSocket, backup_id: int):
    """WebSocket endpoint for specific backup progress"""
    await websocket.accept()

    # Send initial connection confirmation
    await websocket.send_json({
        "type": "connected",
        "backup_id": backup_id
    })

    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info(f"Backup WebSocket disconnected: {backup_id}")


@router.websocket("/ws/logs")
async def logs_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time logs"""
    await manager.connect(websocket, channel="logs")

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel="logs")
        logger.info("Logs WebSocket disconnected")


@router.websocket("/ws/servers")
async def servers_websocket(websocket: WebSocket):
    """WebSocket endpoint for server health updates"""
    await manager.connect(websocket, channel="servers")

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel="servers")
        logger.info("Servers WebSocket disconnected")
