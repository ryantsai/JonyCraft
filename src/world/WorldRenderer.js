import * as THREE from 'three';

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();

/**
 * Renders the voxel world using InstancedMesh — one draw call per block type.
 * Reduces ~4000+ individual mesh draw calls to ~8.
 */
export class WorldRenderer {
  constructor(world, sceneSetup, blockMaterials) {
    this.world = world;
    this.scene = sceneSetup;
    this.blockMaterials = blockMaterials;
    this.instancedMeshes = new Map(); // blockType -> InstancedMesh
    this._dirty = false;
  }

  buildAll() {
    this._rebuildInstances();
  }

  onBlockChanged() {
    if (!this._dirty) {
      this._dirty = true;
      queueMicrotask(() => {
        this._dirty = false;
        this._rebuildInstances();
      });
    }
  }

  _rebuildInstances() {
    // Remove old instanced meshes
    this.instancedMeshes.forEach((mesh) => {
      this.scene.worldGroup.remove(mesh);
      mesh.dispose();
    });
    this.instancedMeshes.clear();

    // Group visible blocks by type
    const groups = new Map();
    const positions = this.world.getAllBlockPositions();
    for (const [x, y, z] of positions) {
      const type = this.world.getBlock(x, y, z);
      if (!type || !this.world.shouldRenderBlock(type, x, y, z)) continue;
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(x, y, z); // flat array for speed
    }

    // Create InstancedMesh per block type
    for (const [type, coords] of groups) {
      const count = coords.length / 3;
      const geometry = type === 'water' ? this.scene.waterGeometry : this.scene.boxGeometry;
      const material = this.blockMaterials.get(type);
      const instanced = new THREE.InstancedMesh(geometry, material, count);

      for (let i = 0; i < count; i += 1) {
        const x = coords[i * 3];
        const y = coords[i * 3 + 1];
        const z = coords[i * 3 + 2];
        _position.set(x + 0.5, y + (type === 'water' ? 0.43 : 0.5), z + 0.5);
        _matrix.makeTranslation(_position.x, _position.y, _position.z);
        instanced.setMatrixAt(i, _matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      this.scene.worldGroup.add(instanced);
      this.instancedMeshes.set(type, instanced);
    }
  }
}
