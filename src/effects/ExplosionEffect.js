import * as THREE from 'three';

/**
 * Voxel-style explosion effect using box geometry particles.
 * Spawns a burst of fire-colored cubes, an expanding shockwave ring,
 * a central flash sphere, and lingering smoke cubes that rise and fade.
 */

const FIRE_COLORS = [0xff4400, 0xff6b35, 0xffaa00, 0xffdd44, 0xff2200];
const SMOKE_COLORS = [0x444444, 0x555555, 0x333333, 0x666666];
const EMBER_COLORS = [0xff8800, 0xffcc00, 0xff4400];

const _boxGeo = new THREE.BoxGeometry(1, 1, 1);
const _sphereGeo = new THREE.SphereGeometry(1, 8, 6);
const _ringGeo = new THREE.RingGeometry(0.8, 1.0, 16);

export class ExplosionEffect {
  constructor(sceneSetup) {
    this.scene = sceneSetup;
    this._explosions = [];
  }

  /**
   * Spawn an explosion at the given world position.
   * @param {THREE.Vector3} position - center of explosion
   * @param {object} [opts] - optional overrides
   * @param {number} [opts.scale=1] - size multiplier
   * @param {number[]} [opts.fireColors] - override fire cube colors
   */
  spawn(position, opts = {}) {
    const scale = opts.scale || 1;
    const fireColors = opts.fireColors || FIRE_COLORS;
    const parts = [];

    // 1. Central flash sphere — bright, expands fast, fades quickly
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const flash = new THREE.Mesh(_sphereGeo, flashMat);
    flash.position.copy(position);
    flash.scale.setScalar(0.3 * scale);
    flash.renderOrder = 60;
    this.scene.particleGroup.add(flash);
    parts.push({
      mesh: flash, mat: flashMat, type: 'flash',
      life: 0.25, maxLife: 0.25,
      vel: null,
    });

    // 2. Fire burst cubes — 20 cubes explode outward
    const fireCount = 20;
    for (let i = 0; i < fireCount; i++) {
      const color = fireColors[i % fireColors.length];
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      const sz = (0.12 + Math.random() * 0.18) * scale;
      const mesh = new THREE.Mesh(_boxGeo, mat);
      mesh.position.copy(position);
      mesh.scale.setScalar(sz);
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      mesh.renderOrder = 58;
      this.scene.particleGroup.add(mesh);

      // Explode in a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = (3.5 + Math.random() * 4.5) * scale;
      const vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.sin(phi) * Math.sin(theta) * speed + 1.5,
        Math.cos(phi) * speed,
      );

      parts.push({
        mesh, mat, type: 'fire',
        life: 0.3 + Math.random() * 0.25,
        maxLife: 0.3 + Math.random() * 0.25,
        vel,
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
        ),
        startScale: sz,
      });
    }

    // 3. Shockwave ring — expands outward on the horizontal plane
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8833,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(_ringGeo, ringMat);
    ring.position.copy(position);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(0.1 * scale);
    ring.renderOrder = 57;
    this.scene.particleGroup.add(ring);
    parts.push({
      mesh: ring, mat: ringMat, type: 'ring',
      life: 0.35, maxLife: 0.35,
      vel: null,
    });

    // 4. Smoke cubes — slower, linger and rise
    const smokeCount = 8;
    for (let i = 0; i < smokeCount; i++) {
      const color = SMOKE_COLORS[i % SMOKE_COLORS.length];
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
      });
      const sz = (0.15 + Math.random() * 0.2) * scale;
      const mesh = new THREE.Mesh(_boxGeo, mat);
      mesh.position.copy(position);
      mesh.position.x += (Math.random() - 0.5) * 0.6 * scale;
      mesh.position.y += Math.random() * 0.4 * scale;
      mesh.position.z += (Math.random() - 0.5) * 0.6 * scale;
      mesh.scale.setScalar(sz);
      mesh.renderOrder = 56;
      this.scene.particleGroup.add(mesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        1.5 + Math.random() * 1.5,
        (Math.random() - 0.5) * 1.2,
      );

      parts.push({
        mesh, mat, type: 'smoke',
        life: 0.6 + Math.random() * 0.4,
        maxLife: 0.6 + Math.random() * 0.4,
        vel,
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 4,
        ),
        startScale: sz,
      });
    }

    // 5. Ember cubes — tiny, shoot upward with gravity
    const emberCount = 12;
    for (let i = 0; i < emberCount; i++) {
      const color = EMBER_COLORS[i % EMBER_COLORS.length];
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      const sz = (0.04 + Math.random() * 0.06) * scale;
      const mesh = new THREE.Mesh(_boxGeo, mat);
      mesh.position.copy(position);
      mesh.scale.setScalar(sz);
      mesh.renderOrder = 59;
      this.scene.particleGroup.add(mesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        3 + Math.random() * 5,
        (Math.random() - 0.5) * 5,
      );

      parts.push({
        mesh, mat, type: 'ember',
        life: 0.5 + Math.random() * 0.5,
        maxLife: 0.5 + Math.random() * 0.5,
        vel,
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
        ),
        startScale: sz,
      });
    }

    this._explosions.push({ parts, age: 0 });
  }

  update(dt) {
    for (let ei = this._explosions.length - 1; ei >= 0; ei--) {
      const explosion = this._explosions[ei];
      explosion.age += dt;
      let allDead = true;

      for (let pi = explosion.parts.length - 1; pi >= 0; pi--) {
        const p = explosion.parts[pi];
        p.life -= dt;

        if (p.life <= 0) {
          this.scene.particleGroup.remove(p.mesh);
          p.mat.dispose();
          explosion.parts.splice(pi, 1);
          continue;
        }

        allDead = false;
        const t = 1 - p.life / p.maxLife; // 0→1 progress

        switch (p.type) {
          case 'flash': {
            // Expand fast, then fade
            const expandT = Math.min(1, t * 4);
            const sz = 0.3 + expandT * 2.0;
            p.mesh.scale.setScalar(sz);
            p.mat.opacity = Math.max(0, 1 - t * 3) * 0.9;
            break;
          }
          case 'fire': {
            // Move outward, decelerate, tumble, shrink and fade
            p.vel.multiplyScalar(1 - dt * 3.5);
            p.vel.y -= 4.0 * dt;
            p.mesh.position.addScaledVector(p.vel, dt);
            p.mesh.rotation.x += p.rotSpeed.x * dt;
            p.mesh.rotation.y += p.rotSpeed.y * dt;
            p.mesh.rotation.z += p.rotSpeed.z * dt;
            const fireFade = t > 0.4 ? (t - 0.4) / 0.6 : 0;
            p.mat.opacity = (1 - fireFade) * 0.95;
            p.mesh.scale.setScalar(p.startScale * (1 - fireFade * 0.7));
            break;
          }
          case 'ring': {
            // Expand outward, thin out, fade
            const ringExpand = t * t;
            p.mesh.scale.setScalar(0.1 + ringExpand * 4.5);
            p.mat.opacity = Math.max(0, (1 - t) * 0.7);
            break;
          }
          case 'smoke': {
            // Rise slowly, expand slightly, fade
            p.vel.multiplyScalar(1 - dt * 2.0);
            p.mesh.position.addScaledVector(p.vel, dt);
            p.mesh.rotation.x += p.rotSpeed.x * dt;
            p.mesh.rotation.y += p.rotSpeed.y * dt;
            p.mesh.rotation.z += p.rotSpeed.z * dt;
            const smokeGrow = 1 + t * 1.5;
            p.mesh.scale.setScalar(p.startScale * smokeGrow);
            p.mat.opacity = Math.max(0, (1 - t * t) * 0.5);
            break;
          }
          case 'ember': {
            // Arc upward with gravity, flicker
            p.vel.y -= 8.0 * dt;
            p.mesh.position.addScaledVector(p.vel, dt);
            p.mesh.rotation.x += p.rotSpeed.x * dt;
            p.mesh.rotation.y += p.rotSpeed.y * dt;
            const flicker = Math.sin(explosion.age * 30 + pi * 7) > 0 ? 1 : 0.3;
            p.mat.opacity = Math.max(0, (1 - t) * 0.9 * flicker);
            p.mesh.scale.setScalar(p.startScale * (1 - t * 0.5));
            break;
          }
        }
      }

      if (allDead || explosion.parts.length === 0) {
        this._explosions.splice(ei, 1);
      }
    }
  }
}
