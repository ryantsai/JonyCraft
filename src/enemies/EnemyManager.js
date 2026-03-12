import * as THREE from 'three';
import {
  ZOMBIE_RESPAWN_MS, INITIAL_ZOMBIE_COUNT,
  WORLD_SIZE_X, WORLD_SIZE_Z, PLAYER_RADIUS, PLAYER_HEIGHT,
} from '../config/constants.js';
import { ENEMY_TYPES, SPAWN_TABLE } from '../config/enemyTypes.js';
import { createEnemy, tintPart, updateHealthBarSprite } from './EnemyModel.js';
import { updateEnemyBehavior } from './EnemyBehaviors.js';
import { events } from '../core/EventBus.js';

const ENEMY_COUNT = 12;

/**
 * Manages all enemy types: spawning, AI dispatch, projectiles, and cleanup.
 */
export class EnemyManager {
  constructor(gameState, world, sceneSetup, textureManager) {
    this.state = gameState;
    this.world = world;
    this.scene = sceneSetup;
    this.textureManager = textureManager;
    this.particles = null; // set after construction

    this.zombies = []; // all enemies (kept as "zombies" for compat)
    this.hitboxes = [];
    this.respawnTimers = [];
    this.projectiles = [];
  }

  setParticles(particles) {
    this.particles = particles;
  }

  getAlive() {
    return this.zombies.filter((z) => z.alive);
  }

  spawn(seedOffset = this.zombies.length * 3, typeKey) {
    if (!typeKey) {
      typeKey = SPAWN_TABLE[Math.floor(Math.random() * SPAWN_TABLE.length)];
    }
    const typeDef = ENEMY_TYPES[typeKey];
    if (!typeDef) return null;
    const position = this._findSpawnPoint(seedOffset);
    const enemy = createEnemy(this.textureManager, typeDef, typeKey, position, this.scene.enemyGroup);
    this.zombies.push(enemy);
    this.hitboxes.push(enemy.hitbox);
    return enemy;
  }

  spawnWave() {
    while (this.getAlive().length < ENEMY_COUNT) {
      this.spawn(this.getAlive().length * 5);
    }
  }

  remove(enemy) {
    if (!enemy) return;
    this.scene.enemyGroup.remove(enemy.root);
    const hitIdx = this.hitboxes.indexOf(enemy.hitbox);
    if (hitIdx >= 0) this.hitboxes.splice(hitIdx, 1);
    enemy.hitbox.geometry.dispose();
    enemy.hitbox.material.dispose();
    const zIdx = this.zombies.indexOf(enemy);
    if (zIdx >= 0) this.zombies.splice(zIdx, 1);
    if (this.state.enemyTarget === enemy) this.state.enemyTarget = null;
  }

  scheduleRespawn() {
    this.respawnTimers.push(ZOMBIE_RESPAWN_MS);
  }

  addProjectile(proj) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color: proj.color === 'red' ? 0xff4444 : 0xffffff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sprite.scale.set(0.25, 0.25, 0.25);
    sprite.position.copy(proj.position);
    this.scene.particleGroup.add(sprite);
    proj.sprite = sprite;
    this.projectiles.push(proj);
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

    this.zombies.forEach((enemy) => {
      if (enemy.alive) this._updateSingle(dt, enemy);
    });

    this._updateProjectiles(dt);

    while (
      this.state.mode === 'playing' &&
      this.getAlive().length + this.respawnTimers.length < ENEMY_COUNT
    ) {
      this.spawn(Math.floor(Math.random() * 100));
    }
  }

  _updateSingle(dt, enemy) {
    enemy.walkTime += dt * 8;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);
    enemy.knockbackTimer = Math.max(0, enemy.knockbackTimer - dt * 1000);
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt * 1000);

    const tint = enemy.hitFlash > 0 ? 0xff8a8a : 0xffffff;
    [enemy.body, enemy.head, enemy.leftArm, enemy.rightArm, enemy.leftLeg, enemy.rightLeg]
      .forEach((part) => tintPart(part, tint));

    const toPlayer = new THREE.Vector3().subVectors(
      this.state.player.position, enemy.root.position,
    );
    const flatToPlayer = new THREE.Vector2(toPlayer.x, toPlayer.z);
    const distance = flatToPlayer.length();

    // Apply knockback
    if (enemy.knockback.lengthSq() > 0.0001) {
      const resist = enemy.typeDef.knockbackResist || 0;
      const factor = 1 - resist;
      enemy.root.position.x += enemy.knockback.x * factor * dt;
      enemy.root.position.z += enemy.knockback.z * factor * dt;
      enemy.knockback.multiplyScalar(Math.pow(0.08, dt));
    } else {
      enemy.knockback.set(0, 0, 0);
    }

    // Dispatch to behavior AI
    const ctx = {
      state: this.state,
      world: this.world,
      particles: this.particles,
      enemies: this,
    };
    updateEnemyBehavior(dt, enemy, this.state.player.position, distance, flatToPlayer, ctx);

    // Snap to terrain
    enemy.root.position.y = this.world.getTerrainSurfaceY(
      enemy.root.position.x, enemy.root.position.z,
    );

    updateHealthBarSprite(enemy);
  }

  _updateProjectiles(dt) {
    const p = this.state.player;
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const proj = this.projectiles[i];
      proj.age += dt;
      proj.sprite.position.addScaledVector(proj.velocity, dt);

      // Check player collision
      const dx = proj.sprite.position.x - p.position.x;
      const dy = proj.sprite.position.y - (p.position.y + PLAYER_HEIGHT / 2);
      const dz = proj.sprite.position.z - p.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < (PLAYER_RADIUS + 0.3) * (PLAYER_RADIUS + 0.3)) {
        const damage = Math.max(1, proj.damage - p.baseDefense);
        p.hp = Math.max(0, p.hp - damage);
        events.emit('player:hit', { damage });
        events.emit('sound:hit');
        events.emit('hud:update');
        if (this.particles) {
          this.particles.spawn(proj.sprite.position.clone(), proj.color || 'white', 6);
        }
        this._removeProjectile(i);
        continue;
      }

      if (proj.age >= proj.lifetime) {
        this._removeProjectile(i);
      }
    }
  }

  _removeProjectile(index) {
    const proj = this.projectiles[index];
    this.scene.particleGroup.remove(proj.sprite);
    proj.sprite.material.dispose();
    this.projectiles.splice(index, 1);
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
