import * as THREE from 'three';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../config/constants.js';
import { events } from '../core/EventBus.js';

/**
 * Combat system: handles attacks, block break/place, and damage application.
 * All attack skills (default + fruit) follow a single unified path via attack().
 */
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
      // Still emit VFX events for fire skills so local player sees effects
      if (skill.weaponType === 'fire_fist') events.emit('combat:fire-fist-shoot');
      else if (skill.weaponType === 'flame_emperor') events.emit('combat:flame-emperor-shoot');
      else if (skill.weaponType === 'fire_pillar') events.emit('combat:fire-pillar-cast');
      else if (skill.weaponType === 'dark_pull') events.emit('combat:dark-pull-cast');
      else if (skill.weaponType === 'light_beam') events.emit('combat:light-beam-shoot');
      this._queueHomelandAttack({
        range: skill.range,
        damageMultiplier: skill.damage ?? 1,
        cooldownMs: skill.cooldownMs,
      });
      return;
    }

    // PvP attack in multiplayer test mode
    if (this._shouldUsePvPAttack()) {
      if (skill.weaponType === 'fire_fist') events.emit('combat:fire-fist-shoot');
      else if (skill.weaponType === 'flame_emperor') events.emit('combat:flame-emperor-shoot');
      else if (skill.weaponType === 'fire_pillar') events.emit('combat:fire-pillar-cast');
      else if (skill.weaponType === 'dark_pull') events.emit('combat:dark-pull-cast');
      else if (skill.weaponType === 'light_beam') events.emit('combat:light-beam-shoot');
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

    // Projectile-based weapon types — damage is handled by the projectile on hit
    if (skill.weaponType === 'fire_fist') {
      events.emit('combat:fire-fist-shoot');
      return;
    }
    if (skill.weaponType === 'flame_emperor') {
      events.emit('combat:flame-emperor-shoot');
      return;
    }
    // Fire pillar — AOE centered on player, handled by FireFistSpawner
    if (skill.weaponType === 'fire_pillar') {
      events.emit('combat:fire-pillar-cast');
      return;
    }
    if (skill.weaponType === 'dark_pull') {
      events.emit('combat:dark-pull-cast');
      return;
    }
    if (skill.weaponType === 'light_beam') {
      events.emit('combat:light-beam-shoot');
      return;
    }

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

  _shouldUseServerHomelandAttack() {
    return this.state.playStyle === 'multiplayer' && this.state.gameMode === 'homeland';
  }

  _shouldUsePvPAttack() {
    return this.state.playStyle === 'multiplayer' && this.state.gameMode === 'test';
  }

  _queuePvPAttack({ range, damageMultiplier, cooldownMs, knockbackStrength, particleColor, particleCount }) {
    if (!this.remotePlayers) return;
    const playerPos = this.state.player.position;
    const forward = new THREE.Vector3(
      -Math.sin(this.state.player.yaw), 0, -Math.cos(this.state.player.yaw),
    );
    let bestTarget = null;
    let bestAvatar = null;
    let bestScore = -Infinity;

    this.remotePlayers.avatars.forEach((avatar, name) => {
      if (avatar.isDead) return;
      const toTarget = new THREE.Vector3().subVectors(avatar.root.position, playerPos);
      const distance = toTarget.length();
      if (distance > range + 1.0) return;
      toTarget.y = 0;
      if (toTarget.lengthSq() < 0.001) {
        bestTarget = name;
        bestAvatar = avatar;
        bestScore = Infinity;
        return;
      }
      toTarget.normalize();
      const facing = forward.dot(toTarget);
      const score = facing * 10 - distance;
      if (facing > 0.2 && score > bestScore) {
        bestScore = score;
        bestTarget = name;
        bestAvatar = avatar;
      }
    });

    if (!bestTarget) return;

    // Apply knockback visually on the remote avatar
    if (bestAvatar && knockbackStrength) {
      const away = new THREE.Vector3().subVectors(bestAvatar.root.position, playerPos);
      away.y = 0;
      if (away.lengthSq() < 0.001) {
        away.set(Math.sin(this.state.player.yaw), 0, Math.cos(this.state.player.yaw));
      }
      away.normalize();
      const kbDir = knockbackStrength < 0 ? -1 : 1;
      const kbMag = Math.abs(knockbackStrength);
      this.remotePlayers.applyKnockback(bestTarget, away, kbMag * kbDir);
    }

    // Spawn hit particles on target
    if (bestAvatar && particleColor) {
      events.emit('sound:hit');
      this.particles.spawn(
        bestAvatar.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)),
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
    const away = new THREE.Vector3().subVectors(enemy.root.position, this.state.player.position);
    away.y = 0;
    if (away.lengthSq() < 0.001) {
      away.set(Math.sin(this.state.player.yaw), 0, Math.cos(this.state.player.yaw));
    }
    away.normalize();

    // Negative knockback = pull toward player (dark fruit)
    const kbDir = knockbackStrength < 0 ? -1 : 1;
    const kbMag = Math.abs(knockbackStrength);
    enemy.knockback.copy(away.multiplyScalar(kbMag * kbDir));
    enemy.knockbackTimer = 240;
    this.particles.spawn(
      enemy.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)),
      particleColor, particleCount,
    );

    if (enemy.health <= 0) {
      this.particles.spawn(
        enemy.root.position.clone().add(new THREE.Vector3(0, 1, 0)),
        'white', 16,
      );
      this.enemies.defeat(enemy, { source: 'player' });
      if (!this.state.defense.enabled) this.enemies.scheduleRespawn();
    }

    events.emit('hud:update');
    return true;
  }
}
