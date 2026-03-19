from __future__ import annotations

import logging
import math
import random
from typing import Any

from storage import SessionRecord

log = logging.getLogger("multiplayer")

PVP_MAX_HP = 20.0
PVP_RESPAWN_DELAY = 2.0
ARENA_SIZE_X = 56.0
ARENA_SIZE_Z = 56.0
MIN_SPAWN_DISTANCE = 8.0


def _random_spawn(session: SessionRecord) -> dict[str, float]:
    """Pick a random spawn position not too close to any active player."""
    for _ in range(30):
        x = 4.0 + random.random() * (ARENA_SIZE_X - 8.0)
        z = 4.0 + random.random() * (ARENA_SIZE_Z - 8.0)
        too_close = False
        for player in session.players.values():
            if player.state.get("mode") != "playing":
                continue
            dx = float(player.state.get("x") or 0.0) - x
            dz = float(player.state.get("z") or 0.0) - z
            if math.sqrt(dx * dx + dz * dz) < MIN_SPAWN_DISTANCE:
                too_close = True
                break
        if not too_close:
            return {"x": round(x, 2), "z": round(z, 2)}
    # Fallback: just pick a random spot
    return {
        "x": round(4.0 + random.random() * (ARENA_SIZE_X - 8.0), 2),
        "z": round(4.0 + random.random() * (ARENA_SIZE_Z - 8.0), 2),
    }


def ensure_pvp_defaults(player_state: dict[str, Any]) -> None:
    """Set PvP HP defaults for test mode players."""
    if player_state.get("serverMaxHp") != PVP_MAX_HP:
        player_state["serverMaxHp"] = PVP_MAX_HP
        # Cap current HP to new max (fixes 100/20 on first join)
        if float(player_state.get("serverHp", PVP_MAX_HP)) > PVP_MAX_HP:
            player_state["serverHp"] = PVP_MAX_HP
    player_state.setdefault("serverHp", PVP_MAX_HP)
    player_state.setdefault("attackReadyAt", 0.0)
    player_state.setdefault("respawnUntil", 0.0)
    player_state.setdefault("pvpKills", 0)
    player_state.setdefault("pvpDeaths", 0)


def process_pvp_attack(
    session: SessionRecord,
    attacker_name: str,
    attack: dict[str, Any],
    server_time: float,
) -> None:
    attacker = session.players.get(attacker_name)
    if attacker is None:
        return

    ready_at = float(attacker.state.get("attackReadyAt", 0.0))
    if ready_at > server_time:
        return

    target_name = str(attack.get("targetPlayer") or "")
    target = session.players.get(target_name)
    if target is None or target_name == attacker_name:
        return
    if target.state.get("mode") != "playing":
        return
    # Don't attack respawning players
    if float(target.state.get("respawnUntil", 0.0)) > server_time:
        return

    try:
        range_value = float(attack.get("range") or 0.0)
        damage_multiplier = float(attack.get("damageMultiplier") or 1.0)
        cooldown_ms = float(attack.get("cooldownMs") or 0.0)
        knockback = float(attack.get("knockback") or 0.0)
    except (TypeError, ValueError):
        return

    range_value = max(1.0, min(range_value, 12.0))
    damage_multiplier = max(1.0, min(damage_multiplier, 8.0))
    cooldown_ms = max(120.0, min(cooldown_ms, 3000.0))
    knockback = max(-20.0, min(knockback, 20.0))
    weapon_type = str(attack.get("weaponType") or "")[:32]

    ax = float(attacker.state.get("x") or 0.0)
    az = float(attacker.state.get("z") or 0.0)
    tx = float(target.state.get("x") or 0.0)
    tz = float(target.state.get("z") or 0.0)
    dx = tx - ax
    dz = tz - az
    if math.sqrt(dx * dx + dz * dz) > range_value + 1.5:
        return

    damage = max(1.0, damage_multiplier)
    target.state["serverHp"] = max(0.0, float(target.state.get("serverHp") or PVP_MAX_HP) - damage)
    attacker.state["attackReadyAt"] = server_time + cooldown_ms / 1000.0

    # Store hit info so the target client can apply knockback
    target.state["lastHitFromX"] = round(ax, 2)
    target.state["lastHitFromZ"] = round(az, 2)
    target.state["lastHitKnockback"] = round(knockback, 2)
    target.state["lastHitWeapon"] = weapon_type
    target.state["lastHitAt"] = server_time

    if target.state["serverHp"] <= 0.0:
        # Target died - respawn
        target.state["serverHp"] = PVP_MAX_HP
        target.state["respawnUntil"] = server_time + PVP_RESPAWN_DELAY
        spawn = _random_spawn(session)
        target.state["respawnX"] = spawn["x"]
        target.state["respawnZ"] = spawn["z"]
        target.state.setdefault("pvpDeaths", 0)
        target.state["pvpDeaths"] += 1
        # Award kill
        attacker.state.setdefault("pvpKills", 0)
        attacker.state["pvpKills"] += 1
        attacker.state.setdefault("scoreKills", 0)
        attacker.state["scoreKills"] = int(attacker.state.get("pvpKills", 0))
        log.info(
            "PVP_KILL session=%s killer=%s victim=%s weapon=%s",
            session.session_id, attacker_name, target_name, weapon_type,
        )


def process_pvp_actions(
    session: SessionRecord,
    player_name: str,
    actions: dict[str, Any],
    server_time: float,
) -> None:
    if session.mode != "test":
        return
    for attack in actions.get("attacks") or []:
        if isinstance(attack, dict):
            process_pvp_attack(session, player_name, attack, server_time)


def tick_pvp_session(session: SessionRecord, server_time: float) -> None:
    """Ensure PvP defaults are set for all test mode players."""
    if session.mode != "test":
        return
    for player in session.players.values():
        ensure_pvp_defaults(player.state)
        player.state["_serverTime"] = server_time
