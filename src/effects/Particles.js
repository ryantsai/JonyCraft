import * as THREE from 'three';
import { HIT_PARTICLE_LIFETIME } from '../config/constants.js';
import { assetUrl } from '../config/assets.js';

/**
 * Manages hit particles (spawn, update, cleanup).
 */
export class ParticleSystem {
  constructor(sceneSetup, textureManager) {
    this.scene = sceneSetup;
    this.textureManager = textureManager;
    this.particles = [];
  }

  spawn(origin, color = 'white', count = 10) {
    const spritePath = color === 'red'
      ? assetUrl('assets/kenney/particles/square_red.png')
      : assetUrl('assets/kenney/particles/square_white.png');

    for (let i = 0; i < count; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.textureManager.load(spritePath),
          transparent: true,
          alphaTest: 0.08,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.92,
        }),
      );
      sprite.position.copy(origin).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.55,
        (Math.random() - 0.05) * 0.7,
        (Math.random() - 0.5) * 0.55,
      ));
      const scale = 0.18 + Math.random() * 0.14;
      sprite.scale.set(scale, scale, 1);
      this.scene.particleGroup.add(sprite);
      this.particles.push({
        sprite,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2.2,
          1.5 + Math.random() * 1.8,
          (Math.random() - 0.5) * 2.2,
        ),
        lifetime: HIT_PARTICLE_LIFETIME,
        age: 0,
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.age += dt;
      p.velocity.y -= 4.2 * dt;
      p.sprite.position.addScaledVector(p.velocity, dt);
      const lifeT = p.age / p.lifetime;
      p.sprite.material.opacity = Math.max(0, 1 - lifeT);
      p.sprite.scale.multiplyScalar(0.992);
      if (p.age >= p.lifetime) {
        this.scene.particleGroup.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  get count() {
    return this.particles.length;
  }
}
