import * as THREE from 'three';
import { BLOCK_DEFS } from '../config/blocks.js';

/**
 * Builds per-face materials for each block type.
 */
export class BlockMaterials {
  constructor(textureManager) {
    this.materials = {};
    this.textureManager = textureManager;
  }

  build() {
    Object.entries(BLOCK_DEFS).forEach(([type, def]) => {
      if (def.invisible) return;
      const top = def.faces.top ?? def.faces.all ?? def.faces.side;
      const bottom = def.faces.bottom ?? def.faces.all ?? def.faces.side ?? top;
      const side = def.faces.side ?? def.faces.all ?? top;
      const materialProps = {
        transparent: Boolean(def.transparent),
        opacity: def.opacity ?? 1,
        alphaTest: def.alphaTest ?? 0,
      };
      this.materials[type] = [
        new THREE.MeshLambertMaterial({ map: this.textureManager.load(side), ...materialProps }),
        new THREE.MeshLambertMaterial({ map: this.textureManager.load(side), ...materialProps }),
        new THREE.MeshLambertMaterial({ map: this.textureManager.load(top), ...materialProps }),
        new THREE.MeshLambertMaterial({ map: this.textureManager.load(bottom), ...materialProps }),
        new THREE.MeshLambertMaterial({ map: this.textureManager.load(side), ...materialProps }),
        new THREE.MeshLambertMaterial({ map: this.textureManager.load(side), ...materialProps }),
      ];
    });
  }

  get(type) {
    return this.materials[type];
  }
}
