import * as THREE from 'three';
import { BLOCK_DEFS } from '../config/blocks.js';
import {
  PLAYER_HEIGHT, PLAYER_RADIUS, JUMP_SPEED, GRAVITY,
  WORLD_SIZE_X, WORLD_SIZE_Z, WORLD_HEIGHT, LOOK_SPEED,
} from '../config/constants.js';
import { events } from '../core/EventBus.js';

/**
 * Handles player physics: movement, collision, jumping, and spawn selection.
 * Future: extend with health, inventory, multiplayer player ID, etc.
 */
export class PlayerController {
  constructor(gameState, world, sceneSetup) {
    this.state = gameState;
    this.world = world;
    this.scene = sceneSetup;
    this.enemyManager = null;

    this.reusable = {
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      wishMove: new THREE.Vector3(),
      desiredVelocity: new THREE.Vector3(),
    };
  }

  setEnemyManager(em) {
    this.enemyManager = em;
  }

  moveAlongAxis(player, axis, delta) {
    if (delta === 0) return false;

    const maxStep = axis === 'y' ? 0.12 : 0.1;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / maxStep));
    const stepDelta = delta / steps;
    let collided = false;

    for (let i = 0; i < steps; i += 1) {
      const next = player.position[axis] + stepDelta;
      const testX = axis === 'x' ? next : player.position.x;
      const testY = axis === 'y' ? next : player.position.y;
      const testZ = axis === 'z' ? next : player.position.z;
      if (this.playerCollides(testX, testY, testZ) || this.entityCollides(testX, testY, testZ)) {
        collided = true;
        break;
      }
      player.position[axis] = next;
    }

    return collided;
  }

  resolvePenetration(player) {
    const collides = (x, y, z) => this.playerCollides(x, y, z) || this.entityCollides(x, y, z);

    if (!collides(player.position.x, player.position.y, player.position.z)) return;

    // Try nudging upward first (for block penetration)
    const originalY = player.position.y;
    for (let i = 1; i <= 30; i += 1) {
      const nudgeY = originalY + i * 0.05;
      if (!collides(player.position.x, nudgeY, player.position.z)) {
        player.position.y = nudgeY;
        return;
      }
    }

    // Try pushing outward horizontally (for entity penetration)
    for (let dist = 1; dist <= 8; dist += 1) {
      for (let angle = 0; angle < 8; angle += 1) {
        const a = (angle / 8) * Math.PI * 2;
        const nx = player.position.x + Math.cos(a) * dist * 0.25;
        const nz = player.position.z + Math.sin(a) * dist * 0.25;
        if (!collides(nx, player.position.y, nz)) {
          player.position.x = nx;
          player.position.z = nz;
          return;
        }
      }
    }

    this.setSpawn();
  }

  playerCollides(x, y, z) {
    const minX = Math.floor(x - PLAYER_RADIUS);
    const maxX = Math.floor(x + PLAYER_RADIUS);
    const minY = Math.floor(y);
    const maxY = Math.floor(y + PLAYER_HEIGHT - 0.001);
    const minZ = Math.floor(z - PLAYER_RADIUS);
    const maxZ = Math.floor(z + PLAYER_RADIUS);

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

  entityCollides(x, y, z) {
    const py = y;
    const pTop = y + PLAYER_HEIGHT;

    // Tower collision (cylinder: bottom radius 1.6, top radius 1.2, height 5.5)
    const mc = this.state.modeController;
    if (mc?.towerMesh) {
      const tp = mc.towerMesh.position;
      const tBottom = tp.y - 2.75;
      const tTop = tp.y + 2.75;
      if (py < tTop && pTop > tBottom) {
        const dx = x - tp.x;
        const dz = z - tp.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < PLAYER_RADIUS + 1.6) return true;
      }
    }

    // Enemy collision
    if (this.enemyManager) {
      const alive = this.enemyManager.getAlive();
      for (let i = 0; i < alive.length; i += 1) {
        const enemy = alive[i];
        const ep = enemy.root.position;
        const eRadius = 0.4 * (enemy.sizeMultiplier || 1);
        const eHeight = 1.75 * (enemy.sizeMultiplier || 1);
        if (py < ep.y + eHeight && pTop > ep.y) {
          const dx = x - ep.x;
          const dz = z - ep.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < PLAYER_RADIUS + eRadius) return true;
        }
      }
    }

    return false;
  }

  applyMovement(dt, keyState, virtualInput) {
    const player = this.state.player;
    const wish = this.reusable.wishMove.set(
      Number(keyState.has('KeyD')) - Number(keyState.has('KeyA')) + virtualInput.moveX,
      0,
      Number(keyState.has('KeyS') || keyState.has('ArrowDown')) -
        Number(keyState.has('KeyW') || keyState.has('ArrowUp')) + virtualInput.moveZ,
    );

    if (keyState.has('ArrowLeft')) player.yaw += 1.8 * dt;
    if (keyState.has('ArrowRight')) player.yaw -= 1.8 * dt;

    if (wish.lengthSq() > 0) {
      wish.normalize();
      const forward = this.reusable.forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      const right = this.reusable.right.set(-forward.z, 0, forward.x);
      const desired = this.reusable.desiredVelocity
        .set(0, 0, 0)
        .addScaledVector(forward, -wish.z)
        .addScaledVector(right, wish.x)
        .normalize()
        .multiplyScalar(player.speed);
      player.velocity.x = THREE.MathUtils.lerp(player.velocity.x, desired.x, 0.16);
      player.velocity.z = THREE.MathUtils.lerp(player.velocity.z, desired.z, 0.16);
    } else {
      player.velocity.x = THREE.MathUtils.damp(player.velocity.x, 0, 10, dt);
      player.velocity.z = THREE.MathUtils.damp(player.velocity.z, 0, 10, dt);
    }

    if (keyState.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
      events.emit('sound:jump');
    }

    player.velocity.y -= GRAVITY * dt;
    player.velocity.y = Math.max(player.velocity.y, -24);

    const xCollided = this.moveAlongAxis(player, 'x', player.velocity.x * dt);
    if (xCollided) {
      player.velocity.x = 0;
    }

    const zCollided = this.moveAlongAxis(player, 'z', player.velocity.z * dt);
    if (zCollided) {
      player.velocity.z = 0;
    }

    const yCollided = this.moveAlongAxis(player, 'y', player.velocity.y * dt);
    if (!yCollided) {
      player.onGround = false;
    } else {
      if (player.velocity.y < 0) player.onGround = true;
      player.velocity.y = 0;
    }

    this.resolvePenetration(player);

    const isMultiplayer = this.state.playStyle === 'multiplayer';
    if (player.position.y < -10) {
      if (isMultiplayer) this.setRandomSpawn();
      else this.setSpawn();
    } else if (player.hp <= 0 && !isMultiplayer) {
      this.setSpawn();
    }

    this.scene.syncCamera(player);
  }

  setRandomSpawn() {
    const player = this.state.player;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const x = 4 + Math.random() * (WORLD_SIZE_X - 8);
      const z = 4 + Math.random() * (WORLD_SIZE_Z - 8);
      const ix = Math.floor(x);
      const iz = Math.floor(z);
      let surfaceY = -1;
      for (let y = WORLD_HEIGHT - 2; y >= 0; y -= 1) {
        const block = this.world.getBlock(ix, y, iz);
        if (block && !['leaves', 'wood', 'water'].includes(block)) {
          const head = this.world.getBlock(ix, y + 1, iz);
          const aboveHead = this.world.getBlock(ix, y + 2, iz);
          if (!head && !aboveHead) {
            surfaceY = y + 1.01;
            break;
          }
        }
      }
      if (surfaceY < 0) continue;
      player.position.set(x, surfaceY, z);
      player.velocity.set(0, 0, 0);
      player.hp = player.maxHp;
      player.yaw = Math.random() * Math.PI * 2;
      player.pitch = -0.38;
      this.scene.syncCamera(player);
      return;
    }
    // Fallback to regular spawn
    this.setSpawn();
  }

  setSpawn() {
    let bestScore = -Infinity;
    let bestPos = new THREE.Vector3(WORLD_SIZE_X / 2, 8, WORLD_SIZE_Z / 2);
    const center = new THREE.Vector2(WORLD_SIZE_X / 2, WORLD_SIZE_Z / 2);

    for (let x = 2; x < WORLD_SIZE_X - 2; x += 1) {
      for (let z = 2; z < WORLD_SIZE_Z - 2; z += 1) {
        for (let y = WORLD_HEIGHT - 2; y >= 0; y -= 1) {
          const block = this.world.getBlock(x, y, z);
          if (!block || ['leaves', 'wood', 'water'].includes(block)) continue;

          const head = this.world.getBlock(x, y + 1, z);
          const aboveHead = this.world.getBlock(x, y + 2, z);
          if (head || aboveHead) continue;

          let clutter = 0;
          for (let dx = -2; dx <= 2; dx += 1) {
            for (let dz = -2; dz <= 2; dz += 1) {
              for (let dy = 1; dy <= 4; dy += 1) {
                const nearby = this.world.getBlock(x + dx, y + dy, z + dz);
                if (nearby && ['leaves', 'wood'].includes(nearby)) clutter += 1;
              }
            }
          }
          if (clutter > 0) continue;

          const distToCenter = center.distanceTo(new THREE.Vector2(x, z));
          const score = 12 - distToCenter + y * 0.15 + (block === 'grass' ? 3 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestPos.set(x + 0.5, y + 1.01, z + 0.5);
          }
          break;
        }
      }
    }

    const player = this.state.player;
    player.position.copy(bestPos);
    player.velocity.set(0, 0, 0);
    player.hp = player.maxHp;
    const lookDir = new THREE.Vector3(center.x + 2 - bestPos.x, 0, center.y + 2 - bestPos.z);
    player.yaw = Math.atan2(lookDir.x, lookDir.z);
    player.pitch = -0.38;
    this.scene.syncCamera(player);
  }
}
