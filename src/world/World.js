import * as THREE from 'three';
import { BLOCK_DEFS } from '../config/blocks.js';
import {
  WORLD_SIZE_X, WORLD_SIZE_Z, WORLD_HEIGHT, WORLD_SEED, SEA_LEVEL,
} from '../config/constants.js';
import { events } from '../core/EventBus.js';

function worldKey(x, y, z) {
  return `${x},${y},${z}`;
}

function hash2D(x, z) {
  const raw = Math.sin((x + WORLD_SEED) * 12.9898 + (z - WORLD_SEED) * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function sampleHeight(x, z) {
  const waveA = Math.sin((x + WORLD_SEED) * 0.08) * 0.22;
  const waveB = Math.cos((z - WORLD_SEED * 0.8) * 0.08) * 0.2;
  const jitter = (hash2D(x, z) - 0.5) * 0.18;
  return THREE.MathUtils.clamp(Math.floor(3 + waveA + waveB + jitter), 2, 3);
}

/**
 * Voxel world data store. Holds block data in a Map and provides
 * query/mutation methods. Emits events on block changes so the
 * renderer and other systems can react.
 *
 * Future: This is the layer that will serialize/deserialize for
 * save/load and network sync.
 */
export class World {
  constructor() {
    this.blocks = new Map();
  }

  getBlock(x, y, z) {
    return this.blocks.get(worldKey(x, y, z)) ?? null;
  }

  isInsideWorld(x, y, z) {
    return x >= 0 && x < WORLD_SIZE_X && z >= 0 && z < WORLD_SIZE_Z && y >= 0 && y < WORLD_HEIGHT;
  }

  setBlock(x, y, z, type) {
    if (!this.isInsideWorld(x, y, z)) return false;
    this.blocks.set(worldKey(x, y, z), type);
    events.emit('block:changed', { x, y, z, type });
    return true;
  }

  removeBlock(x, y, z) {
    if (!this.isInsideWorld(x, y, z)) return false;
    const key = worldKey(x, y, z);
    if (!this.blocks.has(key)) return false;
    this.blocks.delete(key);
    events.emit('block:changed', { x, y, z, type: null });
    return true;
  }

  getTerrainSurfaceY(x, z) {
    const cellX = THREE.MathUtils.clamp(Math.floor(x), 0, WORLD_SIZE_X - 1);
    const cellZ = THREE.MathUtils.clamp(Math.floor(z), 0, WORLD_SIZE_Z - 1);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
      const block = this.getBlock(cellX, y, cellZ);
      if (block && BLOCK_DEFS[block].collides && block !== 'leaves') {
        return y + 1;
      }
    }
    return SEA_LEVEL + 1;
  }

  shouldRenderBlock(type, x, y, z) {
    if (type === 'water') {
      return this.getBlock(x, y + 1, z) !== 'water';
    }
    const neighbors = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ];
    return neighbors.some(([dx, dy, dz]) => {
      const neighbor = this.getBlock(x + dx, y + dy, z + dz);
      if (!neighbor) return true;
      return BLOCK_DEFS[neighbor].transparent;
    });
  }

  generate() {
    for (let x = 0; x < WORLD_SIZE_X; x += 1) {
      for (let z = 0; z < WORLD_SIZE_Z; z += 1) {
        const height = sampleHeight(x, z);
        const surfaceType = hash2D(x * 5, z * 7) > 0.985 ? 'sand' : 'grass';

        for (let y = 0; y <= height; y += 1) {
          let type = 'stone';
          if (y === height) type = surfaceType;
          else if (y >= height - 1) type = 'dirt';
          this.blocks.set(worldKey(x, y, z), type);
        }

        const treeChance = hash2D(x + 11, z + 19);
        if (
          this.getBlock(x, height, z) === 'grass' &&
          treeChance > 0.996 &&
          x > 3 && z > 3 &&
          x < WORLD_SIZE_X - 4 && z < WORLD_SIZE_Z - 4
        ) {
          this._generateTree(x, height, z);
        }
      }
    }
  }

  _generateTree(baseX, baseY, baseZ) {
    const trunkHeight = 3 + Math.floor(hash2D(baseX + 3, baseZ + 5) * 2);
    for (let y = 1; y <= trunkHeight; y += 1) {
      this.blocks.set(worldKey(baseX, baseY + y, baseZ), 'wood');
    }
    const topY = baseY + trunkHeight;
    for (let x = -2; x <= 2; x += 1) {
      for (let y = 0; y <= 2; y += 1) {
        for (let z = -2; z <= 2; z += 1) {
          const distance = Math.abs(x) + Math.abs(z) + y;
          if (distance > 4) continue;
          const lx = baseX + x;
          const ly = topY + y;
          const lz = baseZ + z;
          if (!this.isInsideWorld(lx, ly, lz) || this.getBlock(lx, ly, lz)) continue;
          this.blocks.set(worldKey(lx, ly, lz), 'leaves');
        }
      }
    }
  }

  getAllBlockPositions() {
    return Array.from(this.blocks.keys()).map((key) => key.split(',').map(Number));
  }
}
