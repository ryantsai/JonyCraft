from __future__ import annotations

import math
import random
from typing import Any

from storage import SessionRecord


WAVE_DURATION = 100.0
ENEMY_MULTIPLIER = 1.18
TOWER_MAX_HP = 240.0
ARENA_CENTER_X = 28.0
ARENA_CENTER_Z = 28.0
ARENA_Y = 3.0

ENEMY_DEFS: dict[str, dict[str, float | int]] = {
    "zombie": {"max_health": 3, "base_attack": 1, "base_defense": 0, "speed": 1.12, "size": 1.0, "attack_range": 1.8, "attack_cooldown": 1.0, "weight": 3},
    "skeleton": {"max_health": 2, "base_attack": 2, "base_defense": 0, "speed": 0.9, "size": 1.05, "attack_range": 7.2, "attack_cooldown": 2.2, "weight": 2},
    "slime": {"max_health": 4, "base_attack": 1, "base_defense": 1, "speed": 1.35, "size": 0.7, "attack_range": 1.5, "attack_cooldown": 1.0, "weight": 2},
    "giant": {"max_health": 12, "base_attack": 4, "base_defense": 2, "speed": 0.55, "size": 2.0, "attack_range": 3.0, "attack_cooldown": 1.8, "weight": 1},
    "spider": {"max_health": 2, "base_attack": 2, "base_defense": 0, "speed": 2.1, "size": 0.55, "attack_range": 1.6, "attack_cooldown": 0.7, "weight": 2},
    "ghost": {"max_health": 3, "base_attack": 2, "base_defense": 0, "speed": 1.0, "size": 0.9, "attack_range": 2.1, "attack_cooldown": 1.4, "weight": 1},
    "creeper": {"max_health": 4, "base_attack": 8, "base_defense": 0, "speed": 1.5, "size": 0.95, "attack_range": 2.2, "attack_cooldown": 1.8, "weight": 1},
    "wizard": {"max_health": 3, "base_attack": 3, "base_defense": 0, "speed": 1.2, "size": 1.0, "attack_range": 8.0, "attack_cooldown": 2.4, "weight": 1},
    "golem": {"max_health": 16, "base_attack": 3, "base_defense": 3, "speed": 0.45, "size": 1.7, "attack_range": 2.5, "attack_cooldown": 2.0, "weight": 1},
    "ninja": {"max_health": 2, "base_attack": 4, "base_defense": 0, "speed": 3.0, "size": 0.85, "attack_range": 1.8, "attack_cooldown": 0.8, "weight": 2},
    "blaze": {"max_health": 5, "base_attack": 2, "base_defense": 1, "speed": 0.8, "size": 1.1, "attack_range": 8.0, "attack_cooldown": 1.2, "weight": 1},
}

SPAWN_TABLE = [enemy_type for enemy_type, enemy_def in ENEMY_DEFS.items() for _ in range(int(enemy_def["weight"]))]


def _center() -> dict[str, float]:
    return {"x": ARENA_CENTER_X, "y": ARENA_Y, "z": ARENA_CENTER_Z}


def _default_player_meta() -> dict[str, float]:
    return {"serverHp": 100.0, "serverMaxHp": 100.0, "attackReadyAt": 0.0, "respawnUntil": 0.0}


def _compute_toughness(enemy: dict[str, Any]) -> float:
    enemy_def = ENEMY_DEFS[enemy["type"]]
    return (
        float(enemy["maxHealth"])
        + float(enemy_def["base_attack"]) * 1.5
        + float(enemy_def["base_defense"]) * 2
        + float(enemy_def["size"]) * 1.2
    )


def _spawn_enemy(defense: dict[str, Any], wave_scale: float, seed: int) -> None:
    enemy_type = SPAWN_TABLE[(defense["nextEnemyId"] + seed) % len(SPAWN_TABLE)]
    enemy_def = ENEMY_DEFS[enemy_type]
    angle = ((defense["nextEnemyId"] + seed) % 24) / 24 * math.pi * 2
    distance = 10 + ((defense["nextEnemyId"] + seed) % 7) * 1.4
    x = ARENA_CENTER_X + math.cos(angle) * distance
    z = ARENA_CENTER_Z + math.sin(angle) * distance
    max_health = float(enemy_def["max_health"]) * wave_scale
    defense["enemies"].append(
        {
            "id": f"enemy-{defense['nextEnemyId']}",
            "type": enemy_type,
            "x": round(x, 2),
            "y": ARENA_Y,
            "z": round(z, 2),
            "yaw": round(math.atan2(ARENA_CENTER_X - x, ARENA_CENTER_Z - z), 3),
            "health": max_health,
            "maxHealth": max_health,
            "baseAttack": float(enemy_def["base_attack"]) * wave_scale,
            "baseDefense": float(enemy_def["base_defense"]),
            "speed": float(enemy_def["speed"]) * min(1.8, 1 + (wave_scale - 1) * 0.3),
            "sizeMultiplier": float(enemy_def["size"]),
            "attackRange": float(enemy_def["attack_range"]),
            "attackCooldown": 0.0,
            "cooldownDuration": float(enemy_def["attack_cooldown"]),
            "target": "tower",
        }
    )
    defense["nextEnemyId"] += 1


def ensure_homeland_state(session: SessionRecord) -> dict[str, Any]:
    if session.defense_state:
        session.defense_state.setdefault("turrets", [])
        session.defense_state.setdefault("enemies", [])
        session.defense_state.setdefault("nextEnemyId", 1)
        session.defense_state.setdefault("nextTurretId", 1)
        session.defense_state.setdefault("towerMaxHp", TOWER_MAX_HP)
        session.defense_state.setdefault("towerHp", TOWER_MAX_HP)
        session.defense_state.setdefault("wave", 0)
        session.defense_state.setdefault("timeLeft", WAVE_DURATION)
        session.defense_state.setdefault("totalKills", 0)
        session.defense_state.setdefault("totalGold", 0)
        return session.defense_state

    session.defense_state = {
        "wave": 0,
        "timeLeft": WAVE_DURATION,
        "totalKills": 0,
        "totalGold": 0,
        "towerHp": TOWER_MAX_HP,
        "towerMaxHp": TOWER_MAX_HP,
        "enemies": [],
        "turrets": [],
        "nextEnemyId": 1,
        "nextTurretId": 1,
        "status": "waiting",
        "center": _center(),
    }
    return session.defense_state


def start_next_wave(session: SessionRecord) -> None:
    defense = ensure_homeland_state(session)
    defense["wave"] += 1
    defense["timeLeft"] = WAVE_DURATION
    defense["towerHp"] = defense["towerMaxHp"]
    defense["status"] = "active"
    defense["enemies"] = []
    wave_scale = ENEMY_MULTIPLIER ** (defense["wave"] - 1)
    count = 4 + math.floor(defense["wave"] * 1.8)
    for index in range(count):
        _spawn_enemy(defense, wave_scale, index * 7)


def _active_players(session: SessionRecord) -> list[tuple[str, dict[str, Any]]]:
    players: list[tuple[str, dict[str, Any]]] = []
    for player_name, player in session.players.items():
        if player.state.get("mode") != "playing":
            continue
        if player.state.get("respawnUntil", 0.0) > player.state.get("_serverTime", 0.0):
            continue
        players.append((player_name, player.state))
    return players


def apply_player_defaults(session: SessionRecord) -> None:
    for player in session.players.values():
        for key, value in _default_player_meta().items():
            player.state.setdefault(key, value)


def process_attack(session: SessionRecord, player_name: str, attack: dict[str, Any], server_time: float) -> None:
    defense = ensure_homeland_state(session)
    player = session.players.get(player_name)
    if player is None:
        return

    ready_at = float(player.state.get("attackReadyAt", 0.0))
    if ready_at > server_time:
        return

    enemy_id = str(attack.get("enemyId") or "")
    enemy = next((item for item in defense["enemies"] if item["id"] == enemy_id), None)
    if enemy is None:
        return

    try:
        range_value = float(attack.get("range") or 0.0)
        damage_multiplier = float(attack.get("damageMultiplier") or 1.0)
        cooldown_ms = float(attack.get("cooldownMs") or 0.0)
    except (TypeError, ValueError):
        return

    range_value = max(1.0, min(range_value, 12.0))
    damage_multiplier = max(1.0, min(damage_multiplier, 8.0))
    cooldown_ms = max(120.0, min(cooldown_ms, 2000.0))

    dx = float(enemy["x"]) - float(player.state.get("x") or 0.0)
    dz = float(enemy["z"]) - float(player.state.get("z") or 0.0)
    if math.sqrt(dx * dx + dz * dz) > range_value + 0.85:
        return

    damage = max(1.0, damage_multiplier - float(enemy["baseDefense"]))
    enemy["health"] = max(0.0, float(enemy["health"]) - damage)
    player.state["attackReadyAt"] = server_time + cooldown_ms / 1000.0

    if enemy["health"] <= 0:
        defense["enemies"] = [item for item in defense["enemies"] if item["id"] != enemy["id"]]
        defense["totalKills"] += 1
        defense["totalGold"] += max(1, math.ceil(_compute_toughness(enemy) * 0.8))


def process_purchase(session: SessionRecord, purchase: str) -> None:
    defense = ensure_homeland_state(session)
    costs = {"heal": 15, "tower": 25, "turret": 40}
    cost = costs.get(purchase)
    if cost is None or defense["totalGold"] < cost:
        return
    defense["totalGold"] -= cost

    if purchase == "tower":
        defense["towerHp"] = min(defense["towerMaxHp"], defense["towerHp"] + 80)
        return

    if purchase == "turret":
        angle = len(defense["turrets"]) * 1.3
        defense["turrets"].append(
            {
                "id": f"turret-{defense['nextTurretId']}",
                "x": round(ARENA_CENTER_X + math.cos(angle) * 3.4, 2),
                "y": round(ARENA_Y + 0.6, 2),
                "z": round(ARENA_CENTER_Z + math.sin(angle) * 3.4, 2),
                "cooldown": 0.0,
            }
        )
        defense["nextTurretId"] += 1
        return

    if purchase == "heal":
        for player in session.players.values():
            player.state.setdefault("serverMaxHp", 100.0)
            player.state.setdefault("serverHp", player.state["serverMaxHp"])
            player.state["serverHp"] = min(player.state["serverMaxHp"], player.state["serverHp"] + 45)


def process_actions(session: SessionRecord, player_name: str, actions: dict[str, Any], server_time: float) -> None:
    if session.mode != "homeland":
        return
    ensure_homeland_state(session)
    for attack in actions.get("attacks") or []:
        if isinstance(attack, dict):
            process_attack(session, player_name, attack, server_time)
    for purchase in actions.get("purchases") or []:
        if isinstance(purchase, str):
            process_purchase(session, purchase)


def tick_homeland_session(session: SessionRecord, dt: float, server_time: float) -> None:
    if session.mode != "homeland":
        return

    apply_player_defaults(session)
    defense = ensure_homeland_state(session)
    playing_players = _active_players(session)
    if not playing_players:
        defense["status"] = "waiting"
        return

    if defense["wave"] <= 0 or (not defense["enemies"] and defense["status"] == "waiting"):
        start_next_wave(session)

    defense["status"] = "active"
    defense["timeLeft"] = max(0.0, float(defense["timeLeft"]) - dt)

    for enemy in defense["enemies"]:
        enemy["attackCooldown"] = max(0.0, float(enemy["attackCooldown"]) - dt)

        target_name = None
        target_x = ARENA_CENTER_X
        target_z = ARENA_CENTER_Z
        target_distance = float("inf")
        for player_name, state in playing_players:
            dx = float(state.get("x") or 0.0) - float(enemy["x"])
            dz = float(state.get("z") or 0.0) - float(enemy["z"])
            distance = math.sqrt(dx * dx + dz * dz)
            if distance < target_distance:
                target_distance = distance
                target_name = player_name
                target_x = float(state.get("x") or 0.0)
                target_z = float(state.get("z") or 0.0)

        if target_name is None or target_distance > 7.0:
            target_name = "tower"
            dx = ARENA_CENTER_X - float(enemy["x"])
            dz = ARENA_CENTER_Z - float(enemy["z"])
            target_distance = math.sqrt(dx * dx + dz * dz)
            target_x = ARENA_CENTER_X
            target_z = ARENA_CENTER_Z
        else:
            dx = target_x - float(enemy["x"])
            dz = target_z - float(enemy["z"])

        enemy["target"] = target_name
        enemy["yaw"] = round(math.atan2(dx, dz), 3) if target_distance > 0.001 else float(enemy["yaw"])
        if target_distance > float(enemy["attackRange"]):
            step = min(float(enemy["speed"]) * dt, max(0.0, target_distance - float(enemy["attackRange"]) + 0.1))
            if target_distance > 0.001:
                enemy["x"] = round(float(enemy["x"]) + dx / target_distance * step, 2)
                enemy["z"] = round(float(enemy["z"]) + dz / target_distance * step, 2)
        elif float(enemy["attackCooldown"]) <= 0.0:
            enemy["attackCooldown"] = float(enemy["cooldownDuration"])
            damage = max(1.0, float(enemy["baseAttack"]) * 0.8)
            if target_name == "tower":
                defense["towerHp"] = max(0.0, float(defense["towerHp"]) - damage)
            else:
                player_state = session.players[target_name].state
                player_state["serverHp"] = max(0.0, float(player_state.get("serverHp") or 100.0) - damage)
                if player_state["serverHp"] <= 0.0:
                    player_state["serverHp"] = float(player_state.get("serverMaxHp") or 100.0)
                    player_state["respawnUntil"] = server_time + 1.0

    for turret in defense["turrets"]:
        turret["cooldown"] = max(0.0, float(turret["cooldown"]) - dt)
        if float(turret["cooldown"]) > 0.0:
            continue
        enemy = next(
            (
                item
                for item in defense["enemies"]
                if math.dist((float(item["x"]), float(item["z"])), (float(turret["x"]), float(turret["z"]))) < 8.0
            ),
            None,
        )
        if enemy is None:
            continue
        enemy["health"] = max(0.0, float(enemy["health"]) - 1.2)
        turret["cooldown"] = 0.65
        if enemy["health"] <= 0.0:
            defense["enemies"] = [item for item in defense["enemies"] if item["id"] != enemy["id"]]
            defense["totalKills"] += 1
            defense["totalGold"] += max(1, math.ceil(_compute_toughness(enemy) * 0.8))

    if float(defense["towerHp"]) <= 0.0:
        defense["status"] = "defeated"
        defense["timeLeft"] = 0.0
        defense["enemies"] = []
        return

    if not defense["enemies"] or float(defense["timeLeft"]) <= 0.0:
        start_next_wave(session)
