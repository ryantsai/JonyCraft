from __future__ import annotations

import argparse
import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse


IDLE_PLAYER_SECONDS = 15
EMPTY_SESSION_SECONDS = 45
MAX_EVENT_LOG = 800


def now_ts() -> float:
    return time.time()


def session_slug() -> str:
    return uuid.uuid4().hex[:8]


def clamp_text(value: str | None, fallback: str, limit: int = 48) -> str:
    text = (value or "").strip()
    if not text:
        text = fallback
    return text[:limit]


def block_key(x: int, y: int, z: int) -> str:
    return f"{x},{y},{z}"


@dataclass
class PlayerRecord:
    name: str
    state: dict[str, Any] = field(default_factory=dict)
    joined_at: float = field(default_factory=now_ts)
    last_seen: float = field(default_factory=now_ts)

    def export(self) -> dict[str, Any]:
        payload = {
            "name": self.name,
            "lastSeen": self.last_seen,
        }
        payload.update(self.state)
        return payload


@dataclass
class SessionRecord:
    session_id: str
    name: str
    owner_name: str
    mode: str = "test"
    created_at: float = field(default_factory=now_ts)
    players: dict[str, PlayerRecord] = field(default_factory=dict)
    block_seq: int = 0
    block_log: list[dict[str, Any]] = field(default_factory=list)
    world_overrides: dict[str, dict[str, Any]] = field(default_factory=dict)

    def touch_player(self, player_name: str) -> PlayerRecord:
        player = self.players.get(player_name)
        if player is None:
            player = PlayerRecord(name=player_name)
            self.players[player_name] = player
        player.last_seen = now_ts()
        return player

    def summary(self) -> dict[str, Any]:
        active_players = sorted(self.players.values(), key=lambda item: item.joined_at)
        return {
            "id": self.session_id,
            "name": self.name,
            "mode": self.mode,
            "owner": self.owner_name,
            "createdAt": self.created_at,
            "playerCount": len(active_players),
            "players": [player.name for player in active_players],
            "status": "active" if any(player.state.get("mode") == "playing" for player in active_players) else "lobby",
        }


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionRecord] = {}
        self._lock = threading.Lock()

    def _cleanup_locked(self) -> None:
        current = now_ts()
        expired_sessions: list[str] = []
        for session_id, session in self._sessions.items():
            stale_players = [
                name
                for name, player in session.players.items()
                if current - player.last_seen > IDLE_PLAYER_SECONDS
            ]
            for name in stale_players:
                session.players.pop(name, None)
            if not session.players and current - session.created_at > EMPTY_SESSION_SECONDS:
                expired_sessions.append(session_id)

        for session_id in expired_sessions:
            self._sessions.pop(session_id, None)

    def list_sessions(self) -> list[dict[str, Any]]:
        with self._lock:
            self._cleanup_locked()
            sessions = [session.summary() for session in self._sessions.values()]
        return sorted(sessions, key=lambda item: item["createdAt"], reverse=True)

    def create_session(
        self,
        player_name: str,
        session_name: str | None = None,
        session_mode: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._cleanup_locked()
            session = SessionRecord(
                session_id=session_slug(),
                name=clamp_text(session_name, f"{player_name}'s Realm"),
                owner_name=player_name,
                mode="homeland" if session_mode == "homeland" else "test",
            )
            session.touch_player(player_name)
            self._sessions[session.session_id] = session
            return session.summary()

    def join_session(self, session_id: str, player_name: str) -> dict[str, Any]:
        with self._lock:
            self._cleanup_locked()
            session = self._sessions.get(session_id)
            if session is None:
                raise KeyError("session not found")
            session.touch_player(player_name)
            return session.summary()

    def leave_session(self, session_id: str, player_name: str) -> dict[str, Any]:
        with self._lock:
            self._cleanup_locked()
            session = self._sessions.get(session_id)
            if session is None:
                raise KeyError("session not found")
            session.players.pop(player_name, None)
            return session.summary()

    def sync_session(self, session_id: str, player_name: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._cleanup_locked()
            session = self._sessions.get(session_id)
            if session is None:
                raise KeyError("session not found")

            player = session.touch_player(player_name)
            player.state = self._sanitize_player_state(payload.get("player") or {})
            since_seq = int(payload.get("sinceBlockSeq") or 0)

            for op in payload.get("blockOps") or []:
                normalized = self._normalize_block_op(op, player_name)
                if normalized is None:
                    continue
                session.block_seq += 1
                event = {"seq": session.block_seq, **normalized}
                session.block_log.append(event)
                session.world_overrides[block_key(event["x"], event["y"], event["z"])] = {
                    "x": event["x"],
                    "y": event["y"],
                    "z": event["z"],
                    "type": event["type"],
                }

            if len(session.block_log) > MAX_EVENT_LOG:
                session.block_log = session.block_log[-MAX_EVENT_LOG:]

            world_state = list(session.world_overrides.values()) if since_seq <= 0 else []
            block_ops = [event for event in session.block_log if event["seq"] > since_seq]

            return {
                "session": session.summary(),
                "players": [record.export() for record in session.players.values()],
                "worldState": world_state,
                "blockOps": block_ops,
                "latestBlockSeq": session.block_seq,
                "serverTime": now_ts(),
            }

    @staticmethod
    def _sanitize_player_state(state: dict[str, Any]) -> dict[str, Any]:
        return {
            "x": float(state.get("x") or 0),
            "y": float(state.get("y") or 0),
            "z": float(state.get("z") or 0),
            "yaw": float(state.get("yaw") or 0),
            "pitch": float(state.get("pitch") or 0),
            "mode": clamp_text(state.get("mode"), "menu", 20),
            "fruitId": clamp_text(state.get("fruitId"), "", 24),
            "selectedSkillId": clamp_text(state.get("selectedSkillId"), "", 24),
        }

    @staticmethod
    def _normalize_block_op(op: Any, player_name: str) -> dict[str, Any] | None:
        if not isinstance(op, dict):
            return None
        try:
            x = int(op["x"])
            y = int(op["y"])
            z = int(op["z"])
        except (KeyError, TypeError, ValueError):
            return None

        block_type = op.get("type")
        if block_type is not None:
            block_type = clamp_text(str(block_type), "", 24) or None

        return {
            "playerName": player_name,
            "x": x,
            "y": y,
            "z": z,
            "type": block_type,
        }


STORE = SessionStore()


class MultiplayerHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_json(204, {})

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send_json(200, {"ok": True, "serverTime": now_ts()})
            return
        if parsed.path == "/api/sessions":
            self._send_json(200, {"sessions": STORE.list_sessions()})
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        body = self._read_json_body()
        try:
            if parsed.path == "/api/sessions/create":
                player_name = clamp_text(body.get("playerName"), "Guest")
                session = STORE.create_session(
                    player_name,
                    body.get("sessionName"),
                    body.get("sessionMode"),
                )
                self._send_json(201, {"session": session})
                return

            if parsed.path.endswith("/join"):
                session_id = parsed.path.split("/")[-2]
                player_name = clamp_text(body.get("playerName"), "Guest")
                session = STORE.join_session(session_id, player_name)
                self._send_json(200, {"session": session})
                return

            if parsed.path.endswith("/leave"):
                session_id = parsed.path.split("/")[-2]
                player_name = clamp_text(body.get("playerName"), "Guest")
                session = STORE.leave_session(session_id, player_name)
                self._send_json(200, {"session": session})
                return

            if parsed.path.endswith("/sync"):
                session_id = parsed.path.split("/")[-2]
                player_name = clamp_text(body.get("playerName"), "Guest")
                result = STORE.sync_session(session_id, player_name, body)
                self._send_json(200, result)
                return
        except KeyError as exc:
            self._send_json(404, {"error": str(exc)})
            return

        self._send_json(404, {"error": "not found"})

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        print(f"[multiplayer] {self.address_string()} - {format % args}")

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}
        return payload if isinstance(payload, dict) else {}

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        origin = self.headers.get("Origin") or "*"
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Vary", "Origin")
        self.end_headers()
        if status != 204:
            self.wfile.write(body)


def run_server(host: str, port: int) -> None:
    server = ThreadingHTTPServer((host, port), MultiplayerHandler)
    print(f"JonyCraft multiplayer server running on http://{host}:{port}")
    print("Names are trusted as-is from the client cookie; no authentication is enforced.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down multiplayer server...")
    finally:
        server.server_close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="JonyCraft multiplayer session server")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host")
    parser.add_argument("--port", default=8765, type=int, help="Bind port")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_server(args.host, args.port)
