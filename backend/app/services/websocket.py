"""
WebSocket service for real-time updates
"""
import logging
import asyncio
from typing import Dict, Set, Optional
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manage WebSocket connections"""

    def __init__(self):
        self.active_connections: Dict[str, Set] = {
            "all": set(),
            "backups": set(),
            "servers": set(),
            "logs": set(),
        }
        self.user_connections: Dict[int, Set] = {}

    async def connect(self, websocket, channel: str = "all", user_id: Optional[int] = None):
        """Connect a client to a channel"""
        await websocket.accept()

        if channel in self.active_connections:
            self.active_connections[channel].add(websocket)

        if user_id:
            if user_id not in self.user_connections:
                self.user_connections[user_id] = set()
            self.user_connections[user_id].add(websocket)

        logger.info(f"WebSocket connected to channel: {channel}")

    def disconnect(self, websocket, channel: str = "all", user_id: Optional[int] = None):
        """Disconnect a client from a channel"""
        if channel in self.active_connections:
            self.active_connections[channel].discard(websocket)

        if user_id and user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

        logger.info(f"WebSocket disconnected from channel: {channel}")

    async def send_personal_message(self, message: dict, websocket):
        """Send message to specific client"""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send message: {e}")

    async def broadcast(self, message: dict, channel: str = "all"):
        """Broadcast message to all clients in a channel"""
        if channel not in self.active_connections:
            return

        disconnected = set()
        for connection in self.active_connections[channel]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")
                disconnected.add(connection)

        # Clean up disconnected clients
        for connection in disconnected:
            self.disconnect(connection, channel)

    async def broadcast_to_user(self, message: dict, user_id: int):
        """Broadcast message to all connections of a specific user"""
        if user_id not in self.user_connections:
            return

        disconnected = set()
        for connection in self.user_connections[user_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to user: {e}")
                disconnected.add(connection)

        # Clean up disconnected clients
        for connection in disconnected:
            if user_id in self.user_connections:
                self.user_connections[user_id].discard(connection)


# Global connection manager
manager = ConnectionManager()


class WebSocketService:
    """Service for sending WebSocket messages"""

    @staticmethod
    async def send_backup_progress(backup_id: int, progress: int, status: str, message: str = ""):
        """Send backup progress update"""
        await manager.broadcast({
            "type": "backup_progress",
            "backup_id": backup_id,
            "progress": progress,
            "status": status,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        }, channel="backups")

    @staticmethod
    async def send_restore_progress(backup_id: int, progress: int, status: str, message: str = ""):
        """Send restore progress update"""
        await manager.broadcast({
            "type": "restore_progress",
            "backup_id": backup_id,
            "progress": progress,
            "status": status,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        }, channel="backups")

    @staticmethod
    async def send_server_health_update(server_id: int, status: str, last_heartbeat: str):
        """Send server health update"""
        await manager.broadcast({
            "type": "server_health",
            "server_id": server_id,
            "health_status": status,
            "last_heartbeat": last_heartbeat,
            "timestamp": datetime.utcnow().isoformat()
        }, channel="servers")

    @staticmethod
    async def send_log_message(level: str, message: str, source: str = "system"):
        """Send log message"""
        await manager.broadcast({
            "type": "log",
            "level": level,
            "message": message,
            "source": source,
            "timestamp": datetime.utcnow().isoformat()
        }, channel="logs")

    @staticmethod
    async def send_notification(level: str, title: str, message: str, user_id: Optional[int] = None):
        """Send notification"""
        notification = {
            "type": "notification",
            "level": level,
            "title": title,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        }

        if user_id:
            await manager.broadcast_to_user(notification, user_id)
        else:
            await manager.broadcast(notification, channel="all")

    @staticmethod
    async def send_task_update(task_id: str, status: str, result: Optional[dict] = None):
        """Send task status update"""
        await manager.broadcast({
            "type": "task_update",
            "task_id": task_id,
            "status": status,
            "result": result,
            "timestamp": datetime.utcnow().isoformat()
        }, channel="all")

    @staticmethod
    async def stream_command_output(execution_id: int, output: str, stream: str = "stdout"):
        """Stream command execution output"""
        await manager.broadcast({
            "type": "command_output",
            "execution_id": execution_id,
            "output": output,
            "stream": stream,
            "timestamp": datetime.utcnow().isoformat()
        }, channel="logs")
