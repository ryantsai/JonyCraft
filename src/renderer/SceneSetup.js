import * as THREE from 'three';
import { EYE_HEIGHT } from '../config/constants.js';

/**
 * Sets up the Three.js renderer, scene, camera, and lighting.
 * Provides access to scene groups for world, enemies, and particles.
 */
export class SceneSetup {
  constructor(canvas) {
    this.canvas = canvas;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9ed2ff, 20, 54);
    this.scene.background = new THREE.Color(0x8ed0ff);

    // Camera hierarchy
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 120);
    this.pitchPivot = new THREE.Object3D();
    this.yawPivot = new THREE.Object3D();
    this.pitchPivot.add(this.camera);
    this.yawPivot.add(this.pitchPivot);
    this.scene.add(this.yawPivot);

    this.heldItemPivot = new THREE.Group();
    this.camera.add(this.heldItemPivot);

    // Lighting
    const ambientLight = new THREE.HemisphereLight(0xeef7ff, 0x7a684d, 1.45);
    this.scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xfff6dd, 1.25);
    sunLight.position.set(12, 22, 8);
    this.scene.add(sunLight);

    // Scene groups
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.enemyGroup = new THREE.Group();
    this.scene.add(this.enemyGroup);
    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);

    // Shared geometries
    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.waterGeometry = new THREE.BoxGeometry(1, 0.86, 1);
    this.planeGeometry = new THREE.PlaneGeometry(1, 1);
  }

  syncCamera(player) {
    this.yawPivot.position.copy(player.position);
    this.yawPivot.rotation.y = player.yaw;
    this.pitchPivot.rotation.x = player.pitch;
    this.camera.position.set(0, EYE_HEIGHT, 0);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
