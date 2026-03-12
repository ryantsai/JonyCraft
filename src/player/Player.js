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

    this.reusable = {
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      wishMove: new THREE.Vector3(),
      desiredVelocity: new THREE.Vector3(),
    };
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

    const nextX = player.position.x + player.velocity.x * dt;
    if (!this.playerCollides(nextX, player.position.y, player.position.z)) {
      player.position.x = nextX;
    } else {
      player.velocity.x = 0;
    }

    const nextZ = player.position.z + player.velocity.z * dt;
    if (!this.playerCollides(player.position.x, player.position.y, nextZ)) {
      player.position.z = nextZ;
    } else {
      player.velocity.z = 0;
    }

    const nextY = player.position.y + player.velocity.y * dt;
    if (!this.playerCollides(player.position.x, nextY, player.position.z)) {
      player.position.y = nextY;
      player.onGround = false;
    } else {
      if (player.velocity.y < 0) player.onGround = true;
      player.velocity.y = 0;
    }

    if (player.position.y < -10 || player.hp <= 0) {
      this.setSpawn();
    }

    this.scene.syncCamera(player);
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
