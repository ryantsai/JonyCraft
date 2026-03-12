import * as THREE from 'three';
import {
  ZOMBIE_RESPAWN_MS, INITIAL_ZOMBIE_COUNT,
  WORLD_SIZE_X, WORLD_SIZE_Z, PLAYER_RADIUS, PLAYER_HEIGHT,
  GRAVITY,
} from '../config/constants.js';
import { BLOCK_DEFS } from '../config/blocks.js';
import { ENEMY_TYPES, SPAWN_TABLE } from '../config/enemyTypes.js';
import { createEnemy, tintPart, updateHealthBarSprite } from './EnemyModel.js';
import { updateEnemyBehavior } from './EnemyBehaviors.js';
import { events } from '../core/EventBus.js';

const ENEMY_COUNT = 12;
const ENEMY_GRAVITY = 22;
const ENEMY_JUMP_SPEED = 6.5;
const ENEMY_BASE_RADIUS = 0.4;
const ENEMY_BASE_HEIGHT = 1.75;

// Reusable vectors to avoid per-frame allocations
const _toPlayer = new THREE.Vector3();
const _flatToPlayer = new THREE.Vector2();
const _spawnTest = new THREE.Vector3();
const _sep = new THREE.Vector3();

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
    this._aliveCache = [];
    this._aliveCacheDirty = true;
    this._ctx = { state: null, world: null, particles: null, enemies: this };
  }

  setParticles(particles) {
    this.particles = particles;
  }

  getAlive() {
    if (this._aliveCacheDirty) {
      this._aliveCache = this.zombies.filter((z) => z.alive);
      this._aliveCacheDirty = false;
    }
    return this._aliveCache;
  }

  _markDirty() {
    this._aliveCacheDirty = true;
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
    this._markDirty();
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
    this._markDirty();
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

    // Push overlapping enemies apart
    this._separateEnemies();

    this._updateProjectiles(dt);

    while (
      this.state.mode === 'playing' &&
      this.getAlive().length + this.respawnTimers.length < ENEMY_COUNT
    ) {
      this.spawn(Math.floor(Math.random() * 100));
    }
  }

  _enemyCollides(x, y, z, radius, height) {
    const minX = Math.floor(x - radius);
    const maxX = Math.floor(x + radius);
    const minY = Math.floor(y);
    const maxY = Math.floor(y + height - 0.001);
    const minZ = Math.floor(z - radius);
    const maxZ = Math.floor(z + radius);
    for (let px = minX; px <= maxX; px += 1) {
      for (let py = minY; py <= maxY; py += 1) {
        for (let pz = minZ; pz <= maxZ; pz += 1) {
          const type = this.world.getBlock(px, py, pz);
          if (type && BLOCK_DEFS[type].collides) return true;
        }
      }
    }
    return false;
  }

  _applyEnemyPhysics(dt, enemy, preX, preZ) {
    const s = enemy.sizeMultiplier;
    const r = ENEMY_BASE_RADIUS * s;
    const h = ENEMY_BASE_HEIGHT * s;
    const pos = enemy.root.position;

    // --- Horizontal collision (behavior already moved pos.x/z) ---
    const movedX = pos.x !== preX;
    const movedZ = pos.z !== preZ;

    if (movedX || movedZ) {
      const blocked = this._enemyCollides(pos.x, pos.y, pos.z, r, h);
      if (blocked) {
        // Can we step up 1 block?
        if (enemy.onGround && !this._enemyCollides(pos.x, pos.y + 1, pos.z, r, h)) {
          enemy.velocityY = ENEMY_JUMP_SPEED;
          enemy.onGround = false;
        } else {
          // Try sliding along each axis independently
          const xOk = !this._enemyCollides(pos.x, pos.y, preZ, r, h);
          const zOk = !this._enemyCollides(preX, pos.y, pos.z, r, h);
          if (xOk && !zOk) {
            pos.z = preZ;
          } else if (zOk && !xOk) {
            pos.x = preX;
          } else {
            pos.x = preX;
            pos.z = preZ;
          }
        }
      }
    }

    // --- Gravity ---
    enemy.velocityY -= ENEMY_GRAVITY * dt;
    enemy.velocityY = Math.max(enemy.velocityY, -24);

    // --- Vertical movement ---
    const newY = pos.y + enemy.velocityY * dt;
    if (this._enemyCollides(pos.x, newY, pos.z, r, h)) {
      if (enemy.velocityY < 0) {
        // Snap to ground surface
        pos.y = this.world.getTerrainSurfaceY(pos.x, pos.z);
        enemy.onGround = true;
      }
      enemy.velocityY = 0;
    } else {
      pos.y = newY;
      if (enemy.velocityY < -0.1) enemy.onGround = false;
    }

    // Safety: don't fall through world
    const surfaceY = this.world.getTerrainSurfaceY(pos.x, pos.z);
    if (pos.y < surfaceY - 0.05 && enemy.velocityY <= 0) {
      pos.y = surfaceY;
      enemy.velocityY = 0;
      enemy.onGround = true;
    }
  }

  _separateEnemies() {
    const alive = this.getAlive();
    const count = alive.length;
    for (let i = 0; i < count; i += 1) {
      const a = alive[i];
      const ra = ENEMY_BASE_RADIUS * a.sizeMultiplier;
      for (let j = i + 1; j < count; j += 1) {
        const b = alive[j];
        const rb = ENEMY_BASE_RADIUS * b.sizeMultiplier;
        const minDist = (ra + rb) * 1.8; // slightly larger than radii for comfort
        _sep.subVectors(a.root.position, b.root.position);
        _sep.y = 0; // only horizontal separation
        const distSq = _sep.lengthSq();
        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.5;
          _sep.normalize().multiplyScalar(overlap);
          a.root.position.x += _sep.x;
          a.root.position.z += _sep.z;
          b.root.position.x -= _sep.x;
          b.root.position.z -= _sep.z;
        }
      }
    }
  }

  _updateSingle(dt, enemy) {
    enemy.walkTime += dt * 8;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);
    enemy.knockbackTimer = Math.max(0, enemy.knockbackTimer - dt * 1000);
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt * 1000);

    // Tint only when flash state changes
    if (enemy.hitFlash > 0) {
      tintPart(enemy.body, 0xff8a8a);
      tintPart(enemy.head, 0xff8a8a);
      tintPart(enemy.leftArm, 0xff8a8a);
      tintPart(enemy.rightArm, 0xff8a8a);
      tintPart(enemy.leftLeg, 0xff8a8a);
      tintPart(enemy.rightLeg, 0xff8a8a);
    } else if (enemy._wasTinted) {
      tintPart(enemy.body, 0xffffff);
      tintPart(enemy.head, 0xffffff);
      tintPart(enemy.leftArm, 0xffffff);
      tintPart(enemy.rightArm, 0xffffff);
      tintPart(enemy.leftLeg, 0xffffff);
      tintPart(enemy.rightLeg, 0xffffff);
    }
    enemy._wasTinted = enemy.hitFlash > 0;

    _toPlayer.subVectors(this.state.player.position, enemy.root.position);
    _flatToPlayer.set(_toPlayer.x, _toPlayer.z);
    const distance = _flatToPlayer.length();

    // Save pre-behavior position for collision check
    const preX = enemy.root.position.x;
    const preZ = enemy.root.position.z;

    // Apply knockback
    if (enemy.knockback.lengthSq() > 0.0001) {
      const factor = 1 - (enemy.typeDef.knockbackResist || 0);
      enemy.root.position.x += enemy.knockback.x * factor * dt;
      enemy.root.position.z += enemy.knockback.z * factor * dt;
      enemy.knockback.multiplyScalar(Math.pow(0.08, dt));
    } else {
      enemy.knockback.set(0, 0, 0);
    }

    // Dispatch to behavior AI (reuse ctx object)
    this._ctx.state = this.state;
    this._ctx.world = this.world;
    this._ctx.particles = this.particles;
    updateEnemyBehavior(dt, enemy, this.state.player.position, distance, _flatToPlayer, this._ctx);

    // Physics: collision, gravity, jumping
    this._applyEnemyPhysics(dt, enemy, preX, preZ);

    // Jump animation — squash and stretch
    if (!enemy.onGround) {
      const jumpT = Math.max(0, enemy.velocityY / ENEMY_JUMP_SPEED);
      const stretch = 1 + jumpT * 0.15;
      const squash = 1 / Math.sqrt(stretch);
      enemy.body.scale.set(squash, stretch, squash);
      enemy.head.scale.set(squash, stretch, squash);
    } else if (enemy.typeDef.behavior !== 'leap') {
      // Reset scale only if not a leap-type (leap manages its own scale)
      enemy.body.scale.set(1, 1, 1);
      enemy.head.scale.set(1, 1, 1);
    }

    // Only update health bar when health changed
    if (enemy._lastHealth !== enemy.health) {
      enemy._lastHealth = enemy.health;
      updateHealthBarSprite(enemy);
    }
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
      _spawnTest.set(ax, surfaceY, az);
      const occupied = this.getAlive().some(
        (z) => z.root.position.distanceToSquared(_spawnTest) < 9,
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
