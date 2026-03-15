from __future__ import annotations

import argparse
import json
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from homeland_sim import ensure_homeland_state, process_actions, tick_homeland_session
from pvp_sim import process_pvp_actions, tick_pvp_session
from storage import (
    PlayerRecord,
    SQLiteSessionRepository,
    SessionRecord,
    SessionRepository,
    now_ts,
)


IDLE_PLAYER_SECONDS = 15
EMPTY_SESSION_SECONDS = 45
MAX_EVENT_LOG = 800
MOVEMENT_PERSIST_INTERVAL_SECONDS = 1.0
HOMELAND_PERSIST_INTERVAL_SECONDS = 0.75
DEFAULT_DATABASE = Path(__file__).with_name("multiplayer_state.sqlite3")


def session_slug() -> str:
    return uuid.uuid4().hex[:8]


def clamp_text(value: str | None, fallback: str, limit: int = 48) -> str:
    text = (value or "").strip()
    if not text:
        text = fallback
    return text[:limit]


def block_key(x: int, y: int, z: int) -> str:
    return f"{x},{y},{z}"


def sanitize_log_text(value: Any, limit: int = 180) -> str:
    raw = str(value)
    chunks: list[str] = []
    for char in raw:
        code = ord(char)
        if char in "\r\n\t":
            chunks.append(" ")
        elif 32 <= code <= 126:
            chunks.append(char)
        else:
            chunks.append(f"\\x{code:02x}")
    text = "".join(chunks).strip() or "<empty>"
    if len(text) > limit:
        return f"{text[:limit]}..."
    return text


def looks_like_tls_handshake(data: bytes) -> bool:
    return len(data) >= 3 and data[0] == 0x16 and data[1] == 0x03


class SessionStore:
    def __init__(self, repository: SessionRepository) -> None:
        self._repository = repository
        self._sessions = repository.load_all_sessions()
        self._lock = threading.Lock()

    def _save_locked(self, session: SessionRecord) -> None:
        session.block_log = session.block_log[-MAX_EVENT_LOG:]
        self._repository.save_session(session)

    def _cleanup_locked(self) -> None:
        current = now_ts()
        expired_session_ids: list[str] = []
        for session_id, session in self._sessions.items():
            stale_players = [
                name
                for name, player in session.players.items()
                if current - player.last_seen > IDLE_PLAYER_SECONDS
            ]
            for name in stale_players:
                session.players.pop(name, None)

            if session.players:
                self._save_locked(session)
            elif current - session.created_at > EMPTY_SESSION_SECONDS:
                expired_session_ids.append(session_id)

        for session_id in expired_session_ids:
            self._sessions.pop(session_id, None)
            self._repository.delete_session(session_id)

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
            if session.mode == "homeland":
                ensure_homeland_state(session)
            session.players[player_name] = PlayerRecord(name=player_name)
            self._sessions[session.session_id] = session
            self._save_locked(session)
            return session.summary()

    def join_session(self, session_id: str, player_name: str) -> dict[str, Any]:
        with self._lock:
            self._cleanup_locked()
            session = self._require_locked(session_id)
            player = session.players.get(player_name)
            if player is None:
                player = PlayerRecord(name=player_name)
                session.players[player_name] = player
            player.last_seen = now_ts()
            self._save_locked(session)
            return session.summary()

    def leave_session(self, session_id: str, player_name: str) -> dict[str, Any]:
        with self._lock:
            self._cleanup_locked()
            session = self._require_locked(session_id)
            session.players.pop(player_name, None)
            self._save_locked(session)
            return session.summary()

    def sync_session(self, session_id: str, player_name: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._cleanup_locked()
            session = self._require_locked(session_id)
            player = session.players.get(player_name)
            if player is None:
                player = PlayerRecord(name=player_name)
                session.players[player_name] = player

            player.last_seen = now_ts()
            player.state = self._sanitize_player_state(player.state, payload.get("player") or {})
            player.state.setdefault("scoreKills", 0)
            player.state.setdefault("scoreGold", 0)
            if session.mode != "homeland":
                player.state["scoreKills"] = max(
                    int(player.state.get("scoreKills") or 0),
                    int(player.state.get("combatKills") or 0),
                )
                player.state["scoreGold"] = 0

            had_block_changes = False
            for op in payload.get("blockOps") or []:
                normalized = self._normalize_block_op(op, player_name)
                if normalized is None:
                    continue
                had_block_changes = True
                session.block_seq += 1
                event = {"seq": session.block_seq, **normalized}
                session.block_log.append(event)
                session.world_overrides[block_key(event["x"], event["y"], event["z"])] = {
                    "x": event["x"],
                    "y": event["y"],
                    "z": event["z"],
                    "type": event["type"],
                }

            homeland_actions = payload.get("homelandActions") or {}
            had_homeland_actions = bool(homeland_actions.get("attacks")) or bool(homeland_actions.get("purchases"))
            if session.mode == "homeland":
                process_actions(
                    session,
                    player_name,
                    homeland_actions,
                    player.last_seen,
                )

            pvp_actions = payload.get("pvpActions") or {}
            had_pvp_actions = bool(pvp_actions.get("attacks"))
            if session.mode == "test":
                process_pvp_actions(session, player_name, pvp_actions, player.last_seen)

            should_persist = (
                had_block_changes
                or had_homeland_actions
                or had_pvp_actions
                or (player.last_seen - session.updated_at) >= MOVEMENT_PERSIST_INTERVAL_SECONDS
            )
            if should_persist:
                self._save_locked(session)

            since_seq = int(payload.get("sinceBlockSeq") or 0)
            world_state = list(session.world_overrides.values()) if since_seq <= 0 else []
            block_ops = [event for event in session.block_log if event["seq"] > since_seq]

            response = {
                "session": session.summary(),
                "players": [record.export() for record in session.players.values()],
                "worldState": world_state,
                "blockOps": block_ops,
                "latestBlockSeq": session.block_seq,
                "serverTime": player.last_seen,
            }
            if session.mode == "homeland":
                response["homelandState"] = session.defense_state
            return response

    def tick(self, dt: float) -> None:
        with self._lock:
            self._cleanup_locked()
            current = now_ts()
            for session in self._sessions.values():
                for player in session.players.values():
                    player.state["_serverTime"] = current
                if session.mode == "homeland":
                    tick_homeland_session(session, dt, current)
                    if (current - session.updated_at) >= HOMELAND_PERSIST_INTERVAL_SECONDS:
                        self._save_locked(session)
                elif session.mode == "test":
                    tick_pvp_session(session, current)

    def _require_locked(self, session_id: str) -> SessionRecord:
        session = self._sessions.get(session_id)
        if session is None:
            raise KeyError("session not found")
        return session

    @staticmethod
    def _sanitize_player_state(previous: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
        state = dict(previous)
        state.update(
            {
                "x": float(incoming.get("x") or 0.0),
                "y": float(incoming.get("y") or 0.0),
                "z": float(incoming.get("z") or 0.0),
                "vx": float(incoming.get("vx") or 0.0),
                "vy": float(incoming.get("vy") or 0.0),
                "vz": float(incoming.get("vz") or 0.0),
                "yaw": float(incoming.get("yaw") or 0.0),
                "pitch": float(incoming.get("pitch") or 0.0),
                "combatKills": max(0, int(incoming.get("combatKills") or state.get("combatKills") or 0)),
                "pingMs": max(0.0, float(incoming.get("pingMs") or state.get("pingMs") or 0.0)),
                "mode": clamp_text(incoming.get("mode"), "menu", 20),
                "fruitId": clamp_text(incoming.get("fruitId"), "", 24),
                "selectedSkillId": clamp_text(incoming.get("selectedSkillId"), "", 32),
                "skinId": clamp_text(incoming.get("skinId"), "", 24),
                "isAttacking": bool(incoming.get("isAttacking", False)),
                "attackSkillId": clamp_text(incoming.get("attackSkillId"), "", 32),
                "hp": float(incoming.get("hp") or state.get("hp") or 100.0),
                "maxHp": float(incoming.get("maxHp") or state.get("maxHp") or 100.0),
            }
        )
        state.setdefault("serverHp", state.get("maxHp", 100.0))
        state.setdefault("serverMaxHp", state.get("maxHp", 100.0))
        state.setdefault("attackReadyAt", 0.0)
        state.setdefault("respawnUntil", 0.0)
        return state

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

        return {"playerName": player_name, "x": x, "y": y, "z": z, "type": block_type}


def start_tick_loop(store: SessionStore, interval_seconds: float = 0.1) -> threading.Thread:
    def loop() -> None:
        last_time = now_ts()
        while True:
            time.sleep(interval_seconds)
            current = now_ts()
            store.tick(max(0.02, min(0.2, current - last_time)))
            last_time = current

    thread = threading.Thread(target=loop, daemon=True, name="homeland-sim")
    thread.start()
    return thread


STORE: SessionStore | None = None


class MultiplayerHTTPServer(ThreadingHTTPServer):
    def handle_error(self, request: Any, client_address: tuple[str, int]) -> None:
        _, exc, _ = sys.exc_info()
        host = client_address[0] if client_address else "<unknown>"
        if isinstance(exc, ConnectionResetError):
            print(f"[multiplayer] {host} connection reset by peer")
            return
        if isinstance(exc, BrokenPipeError):
            print(f"[multiplayer] {host} disconnected before the response completed")
            return
        print(f"[multiplayer] {host} unexpected server error: {exc}")


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
                session = STORE.create_session(
                    clamp_text(body.get("playerName"), "Guest"),
                    body.get("sessionName"),
                    body.get("sessionMode"),
                )
                self._send_json(201, {"session": session})
                return

            if parsed.path.endswith("/join"):
                session_id = parsed.path.split("/")[-2]
                session = STORE.join_session(session_id, clamp_text(body.get("playerName"), "Guest"))
                self._send_json(200, {"session": session})
                return

            if parsed.path.endswith("/leave"):
                session_id = parsed.path.split("/")[-2]
                session = STORE.leave_session(session_id, clamp_text(body.get("playerName"), "Guest"))
                self._send_json(200, {"session": session})
                return

            if parsed.path.endswith("/sync"):
                session_id = parsed.path.split("/")[-2]
                result = STORE.sync_session(session_id, clamp_text(body.get("playerName"), "Guest"), body)
                self._send_json(200, result)
                return
        except KeyError as exc:
            self._send_json(404, {"error": str(exc)})
            return

        self._send_json(404, {"error": "not found"})

    def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
        if getattr(self, "_suppress_next_request_log", False) and str(code) == "400":
            self._suppress_next_request_log = False
            return
        request_line = sanitize_log_text(getattr(self, "requestline", "<unknown request>"))
        print(f"[multiplayer] {self.address_string()} {request_line} -> {code} ({size} bytes)")

    def log_error(self, format: str, *args: Any) -> None:  # noqa: A003
        if format == "code %d, message %s" and len(args) >= 2:
            status_code = args[0]
            message = str(args[1])
            raw_requestline = getattr(self, "raw_requestline", b"") or b""
            if looks_like_tls_handshake(raw_requestline):
                detail = "received an HTTPS/TLS handshake on the plain HTTP port"
            else:
                detail = sanitize_log_text(message)
            print(f"[multiplayer] {self.address_string()} bad request {status_code}: {detail}")
            self._suppress_next_request_log = True
            return

        formatted = sanitize_log_text(format % args if args else format)
        print(f"[multiplayer] {self.address_string()} error: {formatted}")

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        formatted = sanitize_log_text(format % args if args else format)
        print(f"[multiplayer] {self.address_string()} {formatted}")

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


def run_server(host: str, port: int, database_path: str | Path) -> None:
    global STORE

    repository = SQLiteSessionRepository(database_path)
    STORE = SessionStore(repository)
    start_tick_loop(STORE)

    server = MultiplayerHTTPServer((host, port), MultiplayerHandler)
    print(f"JonyCraft multiplayer server running on http://{host}:{port}")
    print(f"SQLite persistence: {Path(database_path).resolve()}")
    print("Homeland multiplayer waves/tower/enemies are simulated authoritatively on the server.")
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
    parser.add_argument("--database", default=str(DEFAULT_DATABASE), help="SQLite database path")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_server(args.host, args.port, args.database)
