import * as THREE from 'three';

export class TextureManager {
  constructor() {
    this.loader = new THREE.TextureLoader();
    this.cache = new Map();
  }

  load(path) {
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }
    const texture = this.loader.load(path);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipMapNearestFilter;
    this.cache.set(path, texture);
    return texture;
  }
}
