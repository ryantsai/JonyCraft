import * as THREE from 'three';
import { events } from '../core/EventBus.js';

// Reusable objects to avoid per-frame allocations in hot update loops
const _velDir = new THREE.Vector3();
const _lookMatrix = new THREE.Matrix4();
const _lookUp = new THREE.Vector3(0, 1, 0);
const _lookOrigin = new THREE.Vector3();
const _away = new THREE.Vector3();
const _avatarCenter = new THREE.Vector3();

export class ProjectileSystem {
  constructor(sceneSetup, particleSystem, enemyManager, world) {
    this.scene = sceneSetup;
    this.particles = particleSystem;
    this.enemyManager = enemyManager;
    this.world = world;
    this.projectiles = [];
    this._explosionEffect = null;
    this._remotePlayers = null;
    this._multiplayerClient = null;
    this._gameState = null;
  }

  setExplosionEffect(explosionEffect) {
    this._explosionEffect = explosionEffect;
  }

  setRemotePlayers(remotePlayers) {
    this._remotePlayers = remotePlayers;
  }

  setMultiplayerClient(multiplayerClient) {
    this._multiplayerClient = multiplayerClient;
  }

  setGameState(gameState) {
    this._gameState = gameState;
  }

  /**
   * @param {object} opts
   * @param {boolean} [opts.aoe] - if true, explosion damages all enemies in aoeRadius
   * @param {number} [opts.aoeRadius] - radius of AOE damage
   * @param {boolean} [opts.explodeOnImpact] - spawn explosion effect on hit
   * @param {number} [opts.explosionScale] - scale of explosion visual
   * @param {number[]} [opts.explosionColors] - override fire colors for explosion
   * @param {boolean} [opts.visualOnly] - impacts/explosions only, no damage applied
   */
  spawn({ group, velocity, origin, maxRange, damage, knockback, trailConfig,
    aoe = false, aoeRadius = 0, explodeOnImpact = false, explosionScale = 1, explosionColors, visualOnly = false, gravity = 0 }) {
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
      aoe,
      aoeRadius,
      explodeOnImpact,
      explosionScale,
      explosionColors,
      visualOnly,
      gravity,
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

      if (proj.gravity) {
        proj.velocity.y -= proj.gravity * dt;
        _velDir.copy(proj.velocity).normalize();
        _lookMatrix.lookAt(_lookOrigin, _velDir, _lookUp);
        proj.group.quaternion.setFromRotationMatrix(_lookMatrix);
        proj._velDir.copy(_velDir);
      }

      proj.group.position.addScaledVector(proj.velocity, dt);

      const dist = proj.group.position.distanceTo(proj.origin);
      let hit = false;

      const alive = this.enemyManager.getAlive();
      for (const enemy of alive) {
        const d = proj.group.position.distanceTo(enemy.root.position);
        const hitRadius = 1.2 * (enemy.sizeMultiplier || 1);
        if (d < hitRadius) {
          const impactPos = proj.group.position.clone();

          if (!proj.visualOnly && proj.aoe && proj.aoeRadius > 0) {
            // AOE: damage all enemies within explosion radius
            this._applyAOEDamage(proj, impactPos, alive);
          } else if (!proj.visualOnly) {
            // Single-target damage
            this._applySingleDamage(proj, enemy);
          }

          // Spawn explosion or simple particles
          if (proj.explodeOnImpact && this._explosionEffect) {
            this._explosionEffect.spawn(impactPos, {
              scale: proj.explosionScale,
              fireColors: proj.explosionColors,
            });
          } else if (this.particles) {
            this.particles.spawn(impactPos, 'orange', 16);
          }

          events.emit('sound:punch');
          events.emit('hud:update');
          hit = true;
          break;
        }
      }

      if (!hit && this._remotePlayers && this._isPvPMode()) {
        hit = this._checkRemotePlayerCollision(proj);
      }

      if (!hit) {
        hit = this._checkWorldCollision(proj);
      }

      if (hit || dist > proj.maxRange) {
        // Spawn a smaller fizzle explosion when expiring without a hit (only for explosive projectiles)
        if (!hit && proj.explodeOnImpact && this._explosionEffect) {
          this._explosionEffect.spawn(proj.group.position.clone(), { scale: proj.explosionScale * 0.4 });
        }
        this._removeProjectile(i);
        continue;
      }

      if (proj.trailConfig && proj.trailParticles.length > 0) {
        this._updateTrail(dt, proj);
      }
    }
  }

  _checkWorldCollision(proj) {
    if (!this.world) return false;
    const pos = proj.group.position;
    const bx = Math.floor(pos.x);
    const by = Math.floor(pos.y);
    const bz = Math.floor(pos.z);

    const hitWorld = pos.y < 0 || this.world.getBlock(bx, by, bz) != null;
    if (!hitWorld) return false;

    const impactPos = pos.clone();

    if (!proj.visualOnly && proj.aoe && proj.aoeRadius > 0) {
      const alive = this.enemyManager.getAlive();
      this._applyAOEDamage(proj, impactPos, alive);
    }

    if (proj.explodeOnImpact && this._explosionEffect) {
      this._explosionEffect.spawn(impactPos, {
        scale: proj.explosionScale,
        fireColors: proj.explosionColors,
      });
    } else if (this.particles) {
      this.particles.spawn(impactPos, 'orange', 16);
    }

    events.emit('sound:punch');
    return true;
  }

  _applySingleDamage(proj, enemy) {
    const def = enemy.baseDefense || 0;
    const dmg = Math.max(1, proj.damage - def);
    enemy.health -= dmg;
    enemy.hitFlash = 1;

    _away.subVectors(enemy.root.position, proj.group.position).normalize();
    enemy.knockback.copy(_away.multiplyScalar(proj.knockback));
    enemy.knockbackTimer = 240;

    if (enemy.health <= 0) {
      this.enemyManager.defeat(enemy, { source: 'projectile' });
    }
  }

  _applyAOEDamage(proj, impactPos, allAlive) {
    for (const enemy of allAlive) {
      const d = enemy.root.position.distanceTo(impactPos);
      if (d > proj.aoeRadius) continue;

      const falloff = 1 - (d / proj.aoeRadius) * 0.5;
      const def = enemy.baseDefense || 0;
      const dmg = Math.max(1, Math.round(proj.damage * falloff) - def);
      enemy.health -= dmg;
      enemy.hitFlash = 1;

      _away.subVectors(enemy.root.position, impactPos);
      if (_away.lengthSq() < 0.01) _away.set(Math.random() - 0.5, 0.5, Math.random() - 0.5);
      _away.normalize();
      enemy.knockback.copy(_away.multiplyScalar(proj.knockback * falloff));
      enemy.knockbackTimer = 240;

      if (enemy.health <= 0) {
        this.enemyManager.defeat(enemy, { source: 'projectile' });
      }
    }
  }

  _isPvPMode() {
    return this._gameState?.playStyle === 'multiplayer' && this._gameState?.gameMode === 'test';
  }

  _checkRemotePlayerCollision(proj) {
    const pos = proj.group.position;
    let hitName = null;
    let hitAvatar = null;

    this._remotePlayers.avatars.forEach((avatar, name) => {
      if (hitName || avatar.isDead || !avatar.root.visible) return;
      _avatarCenter.copy(avatar.root.position).y += 0.9;
      if (pos.distanceTo(_avatarCenter) < 1.4) {
        hitName = name;
        hitAvatar = avatar;
      }
    });

    if (!hitName) return false;

    const impactPos = pos.clone();

    if (proj.explodeOnImpact && this._explosionEffect) {
      this._explosionEffect.spawn(impactPos, {
        scale: proj.explosionScale,
        fireColors: proj.explosionColors,
      });
    } else if (this.particles) {
      this.particles.spawn(impactPos, 'orange', 16);
    }

    if (hitAvatar && proj.knockback) {
      _away.subVectors(hitAvatar.root.position, impactPos);
      _away.y = 0;
      if (_away.lengthSq() < 0.01) _away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      _away.normalize();
      this._remotePlayers.applyKnockback(hitName, _away, Math.abs(proj.knockback));
    }

    if (this._multiplayerClient) {
      this._multiplayerClient.queuePvPAttack({
        targetPlayer: hitName,
        range: 999, // already confirmed hit, bypass range check
        damageMultiplier: proj.damage ?? 1,
        cooldownMs: 0, // projectile already handles cooldown
        knockback: proj.knockback ?? 0,
        weaponType: proj.aoe ? 'flame_emperor' : 'fire_fist',
      });
    }

    events.emit('sound:punch');
    events.emit('hud:update');
    return true;
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
