import * as THREE from 'three';
import { PUNCH_RANGE, SWORD_RANGE } from '../config/constants.js';

/**
 * Handles voxel raycasting (DDA) and enemy target detection.
 */
export class Targeting {
  constructor(gameState, world, sceneSetup, enemyManager) {
    this.state = gameState;
    this.world = world;
    this.scene = sceneSetup;
    this.enemyManager = enemyManager;

    this.raycaster = new THREE.Raycaster();
    this.reusable = {
      rayOrigin: new THREE.Vector3(),
      rayDirection: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      toZombie: new THREE.Vector3(),
    };
  }

  raycastVoxel(maxDistance = 6) {
    const player = this.state.player;
    const origin = this.reusable.rayOrigin.set(
      player.position.x,
      player.position.y + 1.62,
      player.position.z,
    );
    const direction = this.reusable.rayDirection.set(
      -Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch),
    ).normalize();

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    let t = 0;

    const stepX = direction.x > 0 ? 1 : -1;
    const stepY = direction.y > 0 ? 1 : -1;
    const stepZ = direction.z > 0 ? 1 : -1;

    const invDx = direction.x !== 0 ? 1 / Math.abs(direction.x) : Number.POSITIVE_INFINITY;
    const invDy = direction.y !== 0 ? 1 / Math.abs(direction.y) : Number.POSITIVE_INFINITY;
    const invDz = direction.z !== 0 ? 1 / Math.abs(direction.z) : Number.POSITIVE_INFINITY;

    let tMaxX = direction.x > 0
      ? (Math.floor(origin.x) + 1 - origin.x) * invDx
      : (origin.x - Math.floor(origin.x)) * invDx;
    let tMaxY = direction.y > 0
      ? (Math.floor(origin.y) + 1 - origin.y) * invDy
      : (origin.y - Math.floor(origin.y)) * invDy;
    let tMaxZ = direction.z > 0
      ? (Math.floor(origin.z) + 1 - origin.z) * invDz
      : (origin.z - Math.floor(origin.z)) * invDz;

    while (t <= maxDistance) {
      const blockType = this.world.getBlock(x, y, z);
      if (blockType) {
        return {
          x, y, z, type: blockType,
          normal: {
            x: tMaxX <= tMaxY && tMaxX <= tMaxZ ? -stepX : 0,
            y: tMaxY < tMaxX && tMaxY <= tMaxZ ? -stepY : 0,
            z: tMaxZ < tMaxX && tMaxZ < tMaxY ? -stepZ : 0,
          },
        };
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += invDx; }
        else { z += stepZ; t = tMaxZ; tMaxZ += invDz; }
      } else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += invDy; }
      else { z += stepZ; t = tMaxZ; tMaxZ += invDz; }
    }

    return null;
  }

  updateTarget() {
    const hit = this.raycastVoxel(6);
    if (!hit) {
      this.state.target = null;
      return;
    }
    const { x, y, z } = hit;
    const normal = hit.normal;
    this.state.target = {
      block: { x, y, z, type: hit.type },
      placeAt: {
        x: x + Math.round(normal.x),
        y: y + Math.round(normal.y),
        z: z + Math.round(normal.z),
      },
    };
  }

  updateEnemyTarget() {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.scene.camera);
    this.raycaster.far = PUNCH_RANGE + 0.6;
    const hits = this.raycaster.intersectObjects(this.enemyManager.hitboxes, false);
    const skill = this.state.getSelectedSkill();
    const activeRange = skill.id === 'punch' ? PUNCH_RANGE : SWORD_RANGE;
    const zombieHit = hits.find((entry) => entry.distance <= activeRange + 0.6);
    return zombieHit ? zombieHit.object.userData.zombie : null;
  }

  findMeleeCandidate() {
    const forward = this.reusable.forward.set(
      -Math.sin(this.state.player.yaw), 0, -Math.cos(this.state.player.yaw),
    );
    let bestZombie = null;
    let bestScore = -Infinity;

    this.enemyManager.getAlive().forEach((zombie) => {
      const toZombie = this.reusable.toZombie.subVectors(
        zombie.root.position, this.state.player.position,
      );
      const distance = toZombie.length();
      if (distance > PUNCH_RANGE + 0.45) return;
      toZombie.y = 0;
      if (toZombie.lengthSq() === 0) {
        bestZombie = zombie;
        bestScore = Infinity;
        return;
      }
      toZombie.normalize();
      const facing = forward.dot(toZombie);
      const score = facing * 10 - distance;
      if (facing > 0.35 && score > bestScore) {
        bestScore = score;
        bestZombie = zombie;
      }
    });

    return bestZombie;
  }
}
