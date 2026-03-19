import * as THREE from 'three';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../config/constants.js';
import { events } from '../core/EventBus.js';

// Projectile weapon types that emit their own VFX events and handle damage via ProjectileSystem
const PROJECTILE_WEAPON_EVENTS = {
  fire_fist: 'combat:fire-fist-shoot',
  flame_emperor: 'combat:flame-emperor-shoot',
  fire_pillar: 'combat:fire-pillar-cast',
  dark_pull: 'combat:dark-pull-cast',
  light_beam: 'combat:light-beam-shoot',
};

// Reusable vectors to avoid per-frame allocations
const _forward = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _away = new THREE.Vector3();
const _particleOffset = new THREE.Vector3(0, 1.1, 0);

export class CombatSystem {
  constructor(gameState, world, targeting, enemyManager, particles, multiplayerClient = null) {
    this.state = gameState;
    this.world = world;
    this.targeting = targeting;
    this.enemies = enemyManager;
    this.particles = particles;
    this.multiplayer = multiplayerClient;
    this.remotePlayers = null;
    this.cannonTowers = null;
  }

  setRemotePlayers(remotePlayers) {
    this.remotePlayers = remotePlayers;
  }

  setCannonTowers(cannonTowerSystem) {
    this.cannonTowers = cannonTowerSystem;
  }

  /**
   * Unified attack method. Reads stats from the active skill definition.
   * Replaces the old swingSword/punchAttack/fruitAttack split.
   */
  attack() {
    const combat = this.state.combat;
    if (combat.cooldown > 0) return;

    const skill = this.state.getSelectedSkill();
    if (!skill || skill.kind !== 'attack') return;

    combat.cooldown = skill.cooldownMs;
    combat.attackSeq = (combat.attackSeq || 0) + 1;

    // Drive the correct weapon animation
    if (skill.weaponType === 'sword' || skill.weaponType === 'laser_sabre') {
      combat.swordSwingTime = skill.swingMs;
      events.emit('sound:sword');
    } else {
      combat.punchTime = skill.swingMs;
      events.emit('sound:punch');
    }

    // Trigger fruit-specific visual effects (shake, flash)
    const fruit = this.state.selectedFruit;
    if (fruit) {
      events.emit('combat:fruit-attack', {
        animStyle: fruit.animStyle,
        color: skill.particleColor,
        skillId: skill.id,
      });
    }

    // In multiplayer homeland, all attacks go through the server
    if (this._shouldUseServerHomelandAttack()) {
      this._emitProjectileVFX(skill.weaponType);
      this._queueHomelandAttack({
        range: skill.range,
        damageMultiplier: skill.damage ?? 1,
        cooldownMs: skill.cooldownMs,
      });
      return;
    }

    // PvP attack in multiplayer test mode
    if (this._shouldUsePvPAttack()) {
      this._emitProjectileVFX(skill.weaponType);
      this._queuePvPAttack({
        range: skill.range,
        damageMultiplier: skill.damage ?? 1,
        cooldownMs: skill.cooldownMs,
        knockbackStrength: skill.knockback,
        particleColor: skill.particleColor,
        particleCount: skill.particleCount,
      });
      // Also try to hit local enemies (mobs in test mode)
      if (!['fire_fist', 'flame_emperor', 'fire_pillar', 'light_beam'].includes(skill.weaponType)) {
        this._attackEnemy({
          range: skill.range,
          knockbackStrength: skill.knockback,
          particleColor: skill.particleColor,
          particleCount: skill.particleCount,
          damageMultiplier: skill.damage ?? 1,
        });
      }
      return;
    }

    // Projectile-based weapon types — damage is handled on hit by ProjectileSystem
    if (this._emitProjectileVFX(skill.weaponType)) return;

    this._attackEnemy({
      range: skill.range,
      knockbackStrength: skill.knockback,
      particleColor: skill.particleColor,
      particleCount: skill.particleCount,
      damageMultiplier: skill.damage ?? 1,
    });
  }

  // Legacy aliases for backward compatibility with any external callers
  fruitAttack() { this.attack(); }
  swingSword() { this.attack(); }
  punchAttack() { this.attack(); }

  handleBreak() {
    if (!this.state.target) return;
    const { x, y, z } = this.state.target.block;
    if (y === 0) return;
    this.world.removeBlock(x, y, z);
    this.targeting.updateTarget();
    events.emit('sound:break');
    events.emit('hud:update');
  }

  handlePlace() {
    if (!this.state.target) return;
    const { x, y, z } = this.state.target.placeAt;
    if (!this.world.isInsideWorld(x, y, z) || this.world.getBlock(x, y, z)) return;

    const p = this.state.player.position;
    const overlaps =
      p.x + PLAYER_RADIUS > x && p.x - PLAYER_RADIUS < x + 1 &&
      p.y + PLAYER_HEIGHT > y && p.y < y + 1 &&
      p.z + PLAYER_RADIUS > z && p.z - PLAYER_RADIUS < z + 1;
    if (overlaps) return;

    this.world.setBlock(x, y, z, this.state.getSelectedBlockType());
    this.targeting.updateTarget();
    events.emit('sound:place');
    events.emit('hud:update');
  }

  handleDeployable() {
    const skill = this.state.getSelectedSkill();
    if (this.state.modeController?.tryPlaceDeployable) {
      this.state.modeController.tryPlaceDeployable(skill);
      return;
    }
    if (this.cannonTowers && skill?.deployableType === 'cannon_tower') {
      this.cannonTowers.tryPlaceSelectedTower();
    }
  }

  _emitProjectileVFX(weaponType) {
    const eventName = PROJECTILE_WEAPON_EVENTS[weaponType];
    if (eventName) {
      events.emit(eventName);
      return true;
    }
    return false;
  }

  _shouldUseServerHomelandAttack() {
    return this.state.playStyle === 'multiplayer' && this.state.gameMode === 'homeland';
  }

  _shouldUsePvPAttack() {
    return this.state.playStyle === 'multiplayer' && this.state.gameMode === 'test';
  }

  _queuePvPAttack({ range, damageMultiplier, cooldownMs, knockbackStrength, particleColor, particleCount }) {
    if (!this.remotePlayers) return;
    const playerPos = this.state.player.position;
    _forward.set(-Math.sin(this.state.player.yaw), 0, -Math.cos(this.state.player.yaw));
    let bestTarget = null;
    let bestAvatar = null;
    let bestScore = -Infinity;

    this.remotePlayers.avatars.forEach((avatar, name) => {
      if (avatar.isDead) return;
      _toTarget.subVectors(avatar.root.position, playerPos);
      const distance = _toTarget.length();
      if (distance > range + 1.0) return;
      _toTarget.y = 0;
      if (_toTarget.lengthSq() < 0.001) {
        bestTarget = name;
        bestAvatar = avatar;
        bestScore = Infinity;
        return;
      }
      _toTarget.normalize();
      const facing = _forward.dot(_toTarget);
      const score = facing * 10 - distance;
      if (facing > 0.2 && score > bestScore) {
        bestScore = score;
        bestTarget = name;
        bestAvatar = avatar;
      }
    });

    if (!bestTarget) return;

    if (bestAvatar && knockbackStrength) {
      _away.subVectors(bestAvatar.root.position, playerPos);
      _away.y = 0;
      if (_away.lengthSq() < 0.001) {
        _away.set(Math.sin(this.state.player.yaw), 0, Math.cos(this.state.player.yaw));
      }
      _away.normalize();
      const kbDir = knockbackStrength < 0 ? -1 : 1;
      const kbMag = Math.abs(knockbackStrength);
      this.remotePlayers.applyKnockback(bestTarget, _away, kbMag * kbDir);
    }

    if (bestAvatar && particleColor) {
      events.emit('sound:hit');
      this.particles.spawn(
        _particleOffset.clone().add(bestAvatar.root.position),
        particleColor, particleCount ?? 6,
      );
    }

    const skill = this.state.getSelectedSkill();
    this.multiplayer?.queuePvPAttack({
      targetPlayer: bestTarget,
      range,
      damageMultiplier,
      cooldownMs,
      knockback: knockbackStrength ?? 0,
      weaponType: skill?.weaponType ?? '',
    });
  }

  _queueHomelandAttack({ range, damageMultiplier, cooldownMs }) {
    const enemy = this.targeting.updateEnemyTarget() ?? this.targeting.findMeleeCandidate();
    if (!enemy?.serverId) return false;
    this.multiplayer?.queueHomelandAttack({
      enemyId: enemy.serverId,
      range,
      damageMultiplier,
      cooldownMs,
    });
    return true;
  }

  _attackEnemy({ range, knockbackStrength, particleColor, particleCount, damageMultiplier = 1 }) {
    const enemy = this.targeting.updateEnemyTarget() ?? this.targeting.findMeleeCandidate();
    if (!enemy || !enemy.alive) return false;
    const distance = enemy.root.position.distanceTo(this.state.player.position);
    if (distance > range + 0.35) return false;

    const damage = Math.max(1, this.state.player.baseAttack * damageMultiplier - enemy.baseDefense);
    enemy.health -= damage;
    enemy.hitFlash = 1;
    events.emit('sound:hit');
    _away.subVectors(enemy.root.position, this.state.player.position);
    _away.y = 0;
    if (_away.lengthSq() < 0.001) {
      _away.set(Math.sin(this.state.player.yaw), 0, Math.cos(this.state.player.yaw));
    }
    _away.normalize();

    // Negative knockback = pull toward player (dark fruit)
    const kbDir = knockbackStrength < 0 ? -1 : 1;
    const kbMag = Math.abs(knockbackStrength);
    enemy.knockback.copy(_away.multiplyScalar(kbMag * kbDir));
    enemy.knockbackTimer = 240;
    this.particles.spawn(
      _particleOffset.clone().add(enemy.root.position),
      particleColor, particleCount,
    );

    if (enemy.health <= 0) {
      this.particles.spawn(
        _particleOffset.clone().setY(1).add(enemy.root.position),
        'white', 16,
      );
      this.enemies.defeat(enemy, { source: 'player' });
      if (!this.state.defense.enabled) this.enemies.scheduleRespawn();
    }

    events.emit('hud:update');
    return true;
  }
}
