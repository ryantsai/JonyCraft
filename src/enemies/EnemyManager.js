import * as THREE from 'three';
import {
  ZOMBIE_RESPAWN_MS, INITIAL_ZOMBIE_COUNT,
  WORLD_SIZE_X, WORLD_SIZE_Z,
  ZOMBIE_ATTACK_RANGE, ZOMBIE_ATTACK_COOLDOWN_MS,
} from '../config/constants.js';
import { createZombie, tintZombiePart, updateHealthBarSprite } from './Zombie.js';
import { events } from '../core/EventBus.js';

/**
 * Manages zombie spawning, AI, respawn timers, and cleanup.
 * Future: generalize to support multiple enemy types and
 * server-authoritative enemy state for multiplayer.
 */
export class EnemyManager {
  constructor(gameState, world, sceneSetup, textureManager) {
    this.state = gameState;
    this.world = world;
    this.scene = sceneSetup;
    this.textureManager = textureManager;

    this.zombies = [];
    this.hitboxes = [];
    this.respawnTimers = [];
  }

  getAlive() {
    return this.zombies.filter((z) => z.alive);
  }

  spawn(seedOffset = this.zombies.length * 3) {
    const position = this._findSpawnPoint(seedOffset);
    const zombie = createZombie(this.textureManager, position, this.scene.enemyGroup);
    this.zombies.push(zombie);
    this.hitboxes.push(zombie.hitbox);
    return zombie;
  }

  spawnWave() {
    while (this.getAlive().length < INITIAL_ZOMBIE_COUNT) {
      this.spawn(this.getAlive().length * 5);
    }
  }

  remove(zombie) {
    if (!zombie) return;
    this.scene.enemyGroup.remove(zombie.root);
    const hitIdx = this.hitboxes.indexOf(zombie.hitbox);
    if (hitIdx >= 0) this.hitboxes.splice(hitIdx, 1);
    zombie.hitbox.geometry.dispose();
    zombie.hitbox.material.dispose();
    const zIdx = this.zombies.indexOf(zombie);
    if (zIdx >= 0) this.zombies.splice(zIdx, 1);
    if (this.state.enemyTarget === zombie) this.state.enemyTarget = null;
  }

  scheduleRespawn() {
    this.respawnTimers.push(ZOMBIE_RESPAWN_MS);
  }

  update(dt) {
    this.respawnTimers = this.respawnTimers
      .map((t) => Math.max(0, t - dt * 1000))
      .filter((t) => {
        if (t === 0 && this.state.mode === 'playing') {
          this.spawn(Math.floor(Math.random() * 100));
          return false;
        }
        return true;
      });

    this.zombies.forEach((zombie) => {
      if (zombie.alive) this._updateSingle(dt, zombie);
    });

    while (
      this.state.mode === 'playing' &&
      this.getAlive().length + this.respawnTimers.length < INITIAL_ZOMBIE_COUNT
    ) {
      this.spawn(Math.floor(Math.random() * 100));
    }
  }

  _updateSingle(dt, zombie) {
    zombie.walkTime += dt * 8;
    zombie.hitFlash = Math.max(0, zombie.hitFlash - dt * 4);
    zombie.knockbackTimer = Math.max(0, zombie.knockbackTimer - dt * 1000);
    zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt * 1000);

    const tint = zombie.hitFlash > 0 ? 0xff8a8a : 0xffffff;
    [zombie.body, zombie.head, zombie.leftArm, zombie.rightArm, zombie.leftLeg, zombie.rightLeg]
      .forEach((part) => tintZombiePart(part, tint));

    const toPlayer = new THREE.Vector3().subVectors(
      this.state.player.position, zombie.root.position,
    );
    const flatToPlayer = new THREE.Vector2(toPlayer.x, toPlayer.z);
    const distance = flatToPlayer.length();

    if (zombie.knockback.lengthSq() > 0.0001) {
      zombie.root.position.x += zombie.knockback.x * dt;
      zombie.root.position.z += zombie.knockback.z * dt;
      zombie.knockback.multiplyScalar(Math.pow(0.08, dt));
    } else {
      zombie.knockback.set(0, 0, 0);
    }

    if (distance > 1.7 && zombie.knockbackTimer === 0) {
      flatToPlayer.normalize();
      zombie.root.position.x += flatToPlayer.x * zombie.speed * dt;
      zombie.root.position.z += flatToPlayer.y * zombie.speed * dt;
    }
    zombie.root.position.y = this.world.getTerrainSurfaceY(
      zombie.root.position.x, zombie.root.position.z,
    );

    // Zombie attacks player when in range
    if (distance <= ZOMBIE_ATTACK_RANGE && zombie.attackCooldown === 0) {
      zombie.attackCooldown = ZOMBIE_ATTACK_COOLDOWN_MS;
      const damage = Math.max(1, zombie.baseAttack - this.state.player.baseDefense);
      this.state.player.hp = Math.max(0, this.state.player.hp - damage);
      events.emit('player:hit', { damage });
      events.emit('sound:hit');
      events.emit('hud:update');
    }

    const sway = Math.sin(zombie.walkTime) * 0.12 * Math.min(1, distance / 2);
    zombie.leftArm.position.x = -0.43 + sway;
    zombie.rightArm.position.x = 0.43 - sway;
    zombie.leftLeg.position.x = -0.16 - sway * 0.38;
    zombie.rightLeg.position.x = 0.16 + sway * 0.38;

    const dx = this.state.player.position.x - zombie.root.position.x;
    const dz = this.state.player.position.z - zombie.root.position.z;
    zombie.root.rotation.set(0, Math.atan2(dx, dz), 0);

    updateHealthBarSprite(zombie);
  }

  _findSpawnPoint(seedOffset = 0) {
    const player = this.state.player;
    let spawn = null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const angle = ((attempt + seedOffset) / 24) * Math.PI * 2;
      const distance = 6 + ((attempt + seedOffset) % 5) * 2.5;
      const ax = player.position.x + Math.sin(angle) * distance;
      const az = player.position.z + Math.cos(angle) * distance;
      if (ax < 1 || ax > WORLD_SIZE_X - 2 || az < 1 || az > WORLD_SIZE_Z - 2) continue;
      const surfaceY = this.world.getTerrainSurfaceY(ax, az);
      const block = this.world.getBlock(Math.floor(ax), Math.floor(surfaceY - 1), Math.floor(az));
      if (block === 'water') continue;
      const occupied = this.getAlive().some(
        (z) => z.root.position.distanceToSquared(new THREE.Vector3(ax, surfaceY, az)) < 9,
      );
      if (occupied) continue;
      spawn = new THREE.Vector3(Math.floor(ax) + 0.5, surfaceY, Math.floor(az) + 0.5);
      break;
    }
    if (!spawn) {
      spawn = new THREE.Vector3(
        Math.min(WORLD_SIZE_X - 2, player.position.x + 8),
        this.world.getTerrainSurfaceY(player.position.x + 8, player.position.z),
        Math.min(WORLD_SIZE_Z - 2, player.position.z + 2),
      );
    }
    return spawn;
  }
}
