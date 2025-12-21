"""WebSocket endpoints for real-time updates."""

from typing import Dict, Set
from uuid import UUID
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel


router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self):
        # Map of organization_id -> set of websocket connections
        self.org_connections: Dict[str, Set[WebSocket]] = {}
        # Map of project_id -> set of websocket connections
        self.project_connections: Dict[str, Set[WebSocket]] = {}
        # Map of user_id -> websocket connection
        self.user_connections: Dict[str, WebSocket] = {}
        # Map of document_id -> set of websocket connections (for collaborative editing)
        self.document_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(
        self,
        websocket: WebSocket,
        user_id: str,
        organization_id: str | None = None,
        project_id: str | None = None,
        document_id: str | None = None,
    ):
        """Accept and register a websocket connection."""
        await websocket.accept()

        # Store user connection
        self.user_connections[user_id] = websocket

        # Register to organization channel
        if organization_id:
            if organization_id not in self.org_connections:
                self.org_connections[organization_id] = set()
            self.org_connections[organization_id].add(websocket)

        # Register to project channel
        if project_id:
            if project_id not in self.project_connections:
                self.project_connections[project_id] = set()
            self.project_connections[project_id].add(websocket)

        # Register to document channel
        if document_id:
            if document_id not in self.document_connections:
                self.document_connections[document_id] = set()
            self.document_connections[document_id].add(websocket)

    def disconnect(
        self,
        websocket: WebSocket,
        user_id: str,
        organization_id: str | None = None,
        project_id: str | None = None,
        document_id: str | None = None,
    ):
        """Unregister a websocket connection."""
        # Remove user connection
        if user_id in self.user_connections:
            del self.user_connections[user_id]

        # Remove from organization channel
        if organization_id and organization_id in self.org_connections:
            self.org_connections[organization_id].discard(websocket)
            if not self.org_connections[organization_id]:
                del self.org_connections[organization_id]

        # Remove from project channel
        if project_id and project_id in self.project_connections:
            self.project_connections[project_id].discard(websocket)
            if not self.project_connections[project_id]:
                del self.project_connections[project_id]

        # Remove from document channel
        if document_id and document_id in self.document_connections:
            self.document_connections[document_id].discard(websocket)
            if not self.document_connections[document_id]:
                del self.document_connections[document_id]

    async def send_to_user(self, user_id: str, message: dict):
        """Send message to a specific user."""
        if user_id in self.user_connections:
            await self.user_connections[user_id].send_json(message)

    async def broadcast_to_organization(
        self, organization_id: str, message: dict, exclude_user: str | None = None
    ):
        """Broadcast message to all users in an organization."""
        if organization_id in self.org_connections:
            for connection in self.org_connections[organization_id]:
                if exclude_user and self._get_user_for_connection(connection) == exclude_user:
                    continue
                try:
                    await connection.send_json(message)
                except Exception:
                    pass  # Connection might be closed

    async def broadcast_to_project(
        self, project_id: str, message: dict, exclude_user: str | None = None
    ):
        """Broadcast message to all users watching a project."""
        if project_id in self.project_connections:
            for connection in self.project_connections[project_id]:
                if exclude_user and self._get_user_for_connection(connection) == exclude_user:
                    continue
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

    async def broadcast_to_document(
        self, document_id: str, message: dict, exclude_user: str | None = None
    ):
        """Broadcast message to all users editing a document."""
        if document_id in self.document_connections:
            for connection in self.document_connections[document_id]:
                if exclude_user and self._get_user_for_connection(connection) == exclude_user:
                    continue
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

    def _get_user_for_connection(self, websocket: WebSocket) -> str | None:
        """Get user_id for a websocket connection."""
        for user_id, conn in self.user_connections.items():
            if conn == websocket:
                return user_id
        return None

    def get_document_users(self, document_id: str) -> list[str]:
        """Get list of users currently editing a document."""
        if document_id not in self.document_connections:
            return []
        users = []
        for conn in self.document_connections[document_id]:
            user_id = self._get_user_for_connection(conn)
            if user_id:
                users.append(user_id)
        return users


# Global connection manager instance
manager = ConnectionManager()


class WebSocketMessage(BaseModel):
    """Schema for WebSocket messages."""
    type: str  # activity, notification, presence, document_update, etc.
    payload: dict


@router.websocket("/connect")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str = Query(...),
    organization_id: str | None = Query(None),
    project_id: str | None = Query(None),
    document_id: str | None = Query(None),
):
    """
    Main WebSocket endpoint for real-time updates.

    Query parameters:
    - user_id: Required. The ID of the connecting user.
    - organization_id: Optional. Subscribe to organization updates.
    - project_id: Optional. Subscribe to project updates.
    - document_id: Optional. Subscribe to document collaboration updates.
    """
    await manager.connect(
        websocket=websocket,
        user_id=user_id,
        organization_id=organization_id,
        project_id=project_id,
        document_id=document_id,
    )

    # Notify others if joining a document
    if document_id:
        await manager.broadcast_to_document(
            document_id,
            {
                "type": "presence",
                "payload": {
                    "event": "user_joined",
                    "user_id": user_id,
                    "document_id": document_id,
                    "active_users": manager.get_document_users(document_id),
                },
            },
            exclude_user=user_id,
        )

    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle different message types
            if message.get("type") == "cursor_move":
                # Broadcast cursor position to other document editors
                if document_id:
                    await manager.broadcast_to_document(
                        document_id,
                        {
                            "type": "cursor_move",
                            "payload": {
                                "user_id": user_id,
                                "position": message.get("payload", {}).get("position"),
                            },
                        },
                        exclude_user=user_id,
                    )

            elif message.get("type") == "document_change":
                # Broadcast document changes to other editors
                if document_id:
                    await manager.broadcast_to_document(
                        document_id,
                        {
                            "type": "document_change",
                            "payload": {
                                "user_id": user_id,
                                "changes": message.get("payload", {}).get("changes"),
                            },
                        },
                        exclude_user=user_id,
                    )

            elif message.get("type") == "ping":
                # Respond to ping with pong
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(
            websocket=websocket,
            user_id=user_id,
            organization_id=organization_id,
            project_id=project_id,
            document_id=document_id,
        )

        # Notify others if leaving a document
        if document_id:
            await manager.broadcast_to_document(
                document_id,
                {
                    "type": "presence",
                    "payload": {
                        "event": "user_left",
                        "user_id": user_id,
                        "document_id": document_id,
                        "active_users": manager.get_document_users(document_id),
                    },
                },
            )


# Helper functions to send events from other parts of the application

async def notify_activity(
    organization_id: str,
    project_id: str | None,
    activity_data: dict,
    exclude_user: str | None = None,
):
    """Send activity notification to relevant users."""
    message = {
        "type": "activity",
        "payload": activity_data,
    }

    if project_id:
        await manager.broadcast_to_project(project_id, message, exclude_user)
    else:
        await manager.broadcast_to_organization(organization_id, message, exclude_user)


async def notify_user(user_id: str, notification_data: dict):
    """Send notification to a specific user."""
    await manager.send_to_user(
        user_id,
        {
            "type": "notification",
            "payload": notification_data,
        },
    )


async def notify_document_update(document_id: str, update_data: dict, exclude_user: str | None = None):
    """Send document update to all editors."""
    await manager.broadcast_to_document(
        document_id,
        {
            "type": "document_update",
            "payload": update_data,
        },
        exclude_user,
    )
