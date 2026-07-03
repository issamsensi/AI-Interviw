import json
import logging
import uuid
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, interview_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[interview_id] = websocket

    def disconnect(self, interview_id: str):
        self.active_connections.pop(interview_id, None)

    async def send_json(self, interview_id: str, data: dict):
        ws = self.active_connections.get(interview_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception as e:
                logger.error(f"WebSocket send error: {e}")
                self.disconnect(interview_id)

    async def send_audio(self, interview_id: str, audio_bytes: bytes):
        ws = self.active_connections.get(interview_id)
        if ws:
            try:
                await ws.send_bytes(audio_bytes)
            except Exception as e:
                logger.error(f"WebSocket send audio error: {e}")
                self.disconnect(interview_id)

    async def receive_json(self, interview_id: str) -> dict | None:
        ws = self.active_connections.get(interview_id)
        if ws:
            try:
                data = await ws.receive_json()
                return data
            except Exception as e:
                logger.error(f"WebSocket receive error: {e}")
                self.disconnect(interview_id)
        return None

    async def receive_bytes(self, interview_id: str) -> bytes | None:
        ws = self.active_connections.get(interview_id)
        if ws:
            try:
                data = await ws.receive_bytes()
                return data
            except Exception as e:
                logger.error(f"WebSocket receive bytes error: {e}")
                self.disconnect(interview_id)
        return None


manager = ConnectionManager()
