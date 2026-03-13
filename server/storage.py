from __future__ import annotations

import json
import sqlite3
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def now_ts() -> float:
    import time

    return time.time()


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
    defense_state: dict[str, Any] = field(default_factory=dict)
    updated_at: float = field(default_factory=now_ts)

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


class SessionRepository(ABC):
    @abstractmethod
    def load_all_sessions(self) -> dict[str, SessionRecord]:
        raise NotImplementedError

    @abstractmethod
    def save_session(self, session: SessionRecord) -> None:
        raise NotImplementedError

    @abstractmethod
    def delete_session(self, session_id: str) -> None:
        raise NotImplementedError


class SQLiteSessionRepository(SessionRepository):
    def __init__(self, database_path: str | Path) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _init_schema(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    owner_name TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    block_seq INTEGER NOT NULL,
                    session_state_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS players (
                    session_id TEXT NOT NULL,
                    player_name TEXT NOT NULL,
                    joined_at REAL NOT NULL,
                    last_seen REAL NOT NULL,
                    player_state_json TEXT NOT NULL,
                    PRIMARY KEY (session_id, player_name),
                    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                );
                """
            )

    def load_all_sessions(self) -> dict[str, SessionRecord]:
        with self._connect() as connection:
            session_rows = connection.execute("SELECT * FROM sessions").fetchall()
            player_rows = connection.execute("SELECT * FROM players").fetchall()

        players_by_session: dict[str, dict[str, PlayerRecord]] = {}
        for row in player_rows:
            payload = json.loads(row["player_state_json"])
            players_by_session.setdefault(row["session_id"], {})[row["player_name"]] = PlayerRecord(
                name=row["player_name"],
                joined_at=row["joined_at"],
                last_seen=row["last_seen"],
                state=payload,
            )

        sessions: dict[str, SessionRecord] = {}
        for row in session_rows:
            state = json.loads(row["session_state_json"])
            sessions[row["session_id"]] = SessionRecord(
                session_id=row["session_id"],
                name=row["name"],
                owner_name=row["owner_name"],
                mode=row["mode"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                block_seq=row["block_seq"],
                block_log=state.get("block_log", []),
                world_overrides=state.get("world_overrides", {}),
                defense_state=state.get("defense_state", {}),
                players=players_by_session.get(row["session_id"], {}),
            )
        return sessions

    def save_session(self, session: SessionRecord) -> None:
        session.updated_at = now_ts()
        session_state_json = json.dumps(
            {
                "block_log": session.block_log,
                "world_overrides": session.world_overrides,
                "defense_state": session.defense_state,
            }
        )
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions (
                    session_id, name, owner_name, mode, created_at, updated_at, block_seq, session_state_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    name=excluded.name,
                    owner_name=excluded.owner_name,
                    mode=excluded.mode,
                    updated_at=excluded.updated_at,
                    block_seq=excluded.block_seq,
                    session_state_json=excluded.session_state_json
                """,
                (
                    session.session_id,
                    session.name,
                    session.owner_name,
                    session.mode,
                    session.created_at,
                    session.updated_at,
                    session.block_seq,
                    session_state_json,
                ),
            )
            connection.execute("DELETE FROM players WHERE session_id = ?", (session.session_id,))
            connection.executemany(
                """
                INSERT INTO players (session_id, player_name, joined_at, last_seen, player_state_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    (
                        session.session_id,
                        player.name,
                        player.joined_at,
                        player.last_seen,
                        json.dumps(player.state),
                    )
                    for player in session.players.values()
                ],
            )
            connection.commit()

    def delete_session(self, session_id: str) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM players WHERE session_id = ?", (session_id,))
            connection.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
            connection.commit()
