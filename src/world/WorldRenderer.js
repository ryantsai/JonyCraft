import * as THREE from 'three';

/**
 * Manages block mesh creation, syncing, and removal in the scene.
 * Listens for world changes to keep meshes in sync.
 */
export class WorldRenderer {
  constructor(world, sceneSetup, blockMaterials) {
    this.world = world;
    this.scene = sceneSetup;
    this.blockMaterials = blockMaterials;
    this.blockMeshes = new Map();
    this.raycastMeshes = [];
  }

  syncBlockMesh(x, y, z) {
    const key = `${x},${y},${z}`;
    const type = this.world.getBlock(x, y, z);
    const current = this.blockMeshes.get(key);

    if (!type || !this.world.shouldRenderBlock(type, x, y, z)) {
      if (current) {
        this.scene.worldGroup.remove(current);
        this._removeRaycastMesh(current);
        this.blockMeshes.delete(key);
      }
      return;
    }

    if (current) {
      this.scene.worldGroup.remove(current);
      this._removeRaycastMesh(current);
      this.blockMeshes.delete(key);
    }

    const geometry = type === 'water' ? this.scene.waterGeometry : this.scene.boxGeometry;
    const material = this.blockMaterials.get(type);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x + 0.5, y + (type === 'water' ? 0.43 : 0.5), z + 0.5);
    mesh.userData = { x, y, z, type };
    this.scene.worldGroup.add(mesh);
    this.raycastMeshes.push(mesh);
    this.blockMeshes.set(key, mesh);
  }

  syncNeighborhood(x, y, z) {
    const positions = [
      [x, y, z],
      [x + 1, y, z], [x - 1, y, z],
      [x, y + 1, z], [x, y - 1, z],
      [x, y, z + 1], [x, y, z - 1],
    ];
    positions.forEach(([px, py, pz]) => {
      if (this.world.isInsideWorld(px, py, pz)) {
        this.syncBlockMesh(px, py, pz);
      }
    });
  }

  buildAll() {
    this.world.getAllBlockPositions().forEach(([x, y, z]) => {
      this.syncBlockMesh(x, y, z);
    });
  }

  onBlockChanged({ x, y, z }) {
    this.syncNeighborhood(x, y, z);
  }

  _removeRaycastMesh(mesh) {
    const index = this.raycastMeshes.indexOf(mesh);
    if (index >= 0) this.raycastMeshes.splice(index, 1);
  }
}
