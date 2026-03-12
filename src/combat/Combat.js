import * as THREE from 'three';
import {
  SWORD_RANGE, SWORD_SWING_MS, SWORD_COOLDOWN_MS,
  PUNCH_RANGE, PUNCH_SWING_MS, PUNCH_COOLDOWN_MS,
  PLAYER_HEIGHT, PLAYER_RADIUS,
} from '../config/constants.js';
import { events } from '../core/EventBus.js';

/**
 * Combat system: handles attacks, block break/place, and damage application.
 * Emits events so other systems (particles, HUD, networking) can react.
 */
export class CombatSystem {
  constructor(gameState, world, targeting, enemyManager, particles) {
    this.state = gameState;
    this.world = world;
    this.targeting = targeting;
    this.enemies = enemyManager;
    this.particles = particles;
  }

  swingSword() {
    const combat = this.state.combat;
    if (combat.cooldown > 0) return;
    combat.cooldown = SWORD_COOLDOWN_MS;
    combat.swordSwingTime = SWORD_SWING_MS;
    events.emit('sound:sword');
    this._attackZombie({
      range: SWORD_RANGE, knockbackStrength: 4.6,
      particleColor: 'red', particleCount: 12,
    });
  }

  punchAttack() {
    const combat = this.state.combat;
    if (combat.cooldown > 0) return;
    combat.cooldown = PUNCH_COOLDOWN_MS;
    combat.punchTime = PUNCH_SWING_MS;
    events.emit('sound:punch');
    this._attackZombie({
      range: PUNCH_RANGE, knockbackStrength: 7.4,
      particleColor: 'white', particleCount: 14,
    });
  }

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

  _attackZombie({ range, knockbackStrength, particleColor, particleCount }) {
    const zombie = this.targeting.updateEnemyTarget() ?? this.targeting.findMeleeCandidate();
    if (!zombie || !zombie.alive) return false;
    const distance = zombie.root.position.distanceTo(this.state.player.position);
    if (distance > range + 0.35) return false;

    zombie.health -= 1;
    zombie.hitFlash = 1;
    events.emit('sound:hit');
    const away = new THREE.Vector3().subVectors(zombie.root.position, this.state.player.position);
    away.y = 0;
    if (away.lengthSq() < 0.001) {
      away.set(Math.sin(this.state.player.yaw), 0, Math.cos(this.state.player.yaw));
    }
    away.normalize();
    zombie.knockback.copy(away.multiplyScalar(knockbackStrength));
    zombie.knockbackTimer = 240;
    this.particles.spawn(
      zombie.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)),
      particleColor, particleCount,
    );

    if (zombie.health <= 0) {
      this.particles.spawn(
        zombie.root.position.clone().add(new THREE.Vector3(0, 1, 0)),
        'white', 16,
      );
      zombie.alive = false;
      this.state.combat.kills += 1;
      events.emit('sound:kill');
      this.enemies.remove(zombie);
      this.enemies.scheduleRespawn();
    }

    events.emit('hud:update');
    return true;
  }
}
