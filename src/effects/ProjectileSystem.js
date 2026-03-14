import * as THREE from 'three';
import { events } from '../core/EventBus.js';

/**
 * Manages world-space projectiles (fire fist, future projectile types).
 * Handles spawning, movement, enemy collision, trail particles, and cleanup.
 * Extracted from WeaponModels for single-responsibility.
 */
export class ProjectileSystem {
  constructor(sceneSetup, particleSystem, enemyManager) {
    this.scene = sceneSetup;
    this.particles = particleSystem;
    this.enemyManager = enemyManager;
    this.projectiles = [];
  }

  spawn({ group, velocity, origin, maxRange, damage, knockback, trailConfig }) {
    const trailParticles = [];
    if (trailConfig) {
      for (let i = 0; i < trailConfig.count; i++) {
        const colorIdx = i % trailConfig.colors.length;
        const tMat = new THREE.MeshBasicMaterial({
          color: trailConfig.colors[colorIdx],
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthTest: false,
        });
        const tMesh = new THREE.Mesh(
          new THREE.BoxGeometry(trailConfig.size, trailConfig.size, trailConfig.size),
          tMat,
        );
        tMesh.visible = false;
        tMesh.renderOrder = 56;
        this.scene.particleGroup.add(tMesh);
        trailParticles.push({
          mesh: tMesh, mat: tMat,
          vel: new THREE.Vector3(),
          life: 0, maxLife: 0,
        });
      }
    }

    this.projectiles.push({
      group,
      velocity: velocity.clone(),
      origin: origin.clone(),
      maxRange,
      damage,
      knockback,
      trailParticles,
      trailConfig,
      alive: true,
      age: 0,
      _velDir: velocity.clone().normalize(),
    });
  }

  update(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (!proj.alive) continue;

      proj.age += dt;
      proj.group.position.addScaledVector(proj.velocity, dt);

      const dist = proj.group.position.distanceTo(proj.origin);
      let hit = false;

      // Check enemy collision
      const alive = this.enemyManager.getAlive();
      for (const enemy of alive) {
        const d = proj.group.position.distanceTo(enemy.root.position);
        const hitRadius = 1.2 * (enemy.sizeMultiplier || 1);
        if (d < hitRadius) {
          const def = enemy.baseDefense || 0;
          const dmg = Math.max(1, proj.damage - def);
          enemy.health -= dmg;
          enemy.hitFlash = 1;

          const away = new THREE.Vector3()
            .subVectors(enemy.root.position, proj.group.position)
            .normalize();
          enemy.knockback.copy(away.multiplyScalar(proj.knockback));
          enemy.knockbackTimer = 240;

          if (this.particles) {
            this.particles.spawn(enemy.root.position.clone(), 'orange', 16);
          }

          if (enemy.health <= 0) {
            this.enemyManager.defeat(enemy, { source: 'projectile' });
          }

          events.emit('sound:punch');
          events.emit('hud:update');
          hit = true;
          break;
        }
      }

      if (hit || dist > proj.maxRange) {
        this._removeProjectile(i);
        continue;
      }

      // Update trail particles
      if (proj.trailConfig && proj.trailParticles.length > 0) {
        this._updateTrail(dt, proj);
      }
    }
  }

  _updateTrail(dt, proj) {
    const velDir = proj._velDir;
    const tc = proj.trailConfig;

    proj.trailParticles.forEach((tp) => {
      if (tp.life <= 0 && Math.random() < 0.85) {
        tp.mesh.position.copy(proj.group.position);
        tp.mesh.position.x += (Math.random() - 0.5) * 0.8;
        tp.mesh.position.y += (Math.random() - 0.5) * 0.8;
        tp.mesh.position.z += (Math.random() - 0.5) * 0.8;
        tp.vel.set(
          -velDir.x * 2.5 + (Math.random() - 0.5) * 2.0,
          -velDir.y * 2.5 + (Math.random() - 0.3) * 2.5,
          -velDir.z * 2.5 + (Math.random() - 0.5) * 2.0,
        );
        tp.life = 0.3 + Math.random() * 0.2;
        tp.maxLife = tp.life;
        if (tc.colors.length > 0) {
          const colorIdx = Math.floor(Math.random() * tc.colors.length);
          tp.mat.color.setHex(tc.colors[colorIdx]);
        }
      }

      if (tp.life > 0) {
        tp.life -= dt;
        tp.mesh.position.addScaledVector(tp.vel, dt);
        tp.vel.y += (tc.riseSpeed || 1.0) * dt;
        const ratio = Math.max(0, tp.life / tp.maxLife);
        tp.mat.opacity = ratio * 0.9;
        tp.mesh.scale.setScalar(1.0 + ratio * 1.5);
        tp.mesh.rotation.x += dt * 6;
        tp.mesh.rotation.y += dt * 4;
        tp.mesh.rotation.z += dt * 5;
        tp.mesh.visible = true;
      } else {
        tp.mesh.visible = false;
      }
    });
  }

  _removeProjectile(index) {
    const proj = this.projectiles[index];
    proj.alive = false;
    proj.group.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((mt) => { mt.map?.dispose(); mt.dispose(); });
        }
      }
    });
    this.scene.particleGroup.remove(proj.group);
    proj.trailParticles.forEach((tp) => {
      tp.mesh.geometry?.dispose();
      this.scene.particleGroup.remove(tp.mesh);
      tp.mat.dispose();
    });
    this.projectiles.splice(index, 1);
  }
}
