import * as THREE from 'three';
import { events } from '../core/EventBus.js';

function cloneWithUniqueMaterials(root) {
  const clone = root.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone());
      child.material.forEach((material) => {
        material.transparent = true;
        material.depthWrite = false;
      });
      return;
    }
    child.material = child.material.clone();
    child.material.transparent = true;
    child.material.depthWrite = false;
  });
  return clone;
}

function setOpacity(root, opacity) {
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.opacity = opacity;
      material.transparent = true;
      material.depthWrite = opacity >= 0.99;
    });
  });
}

function tintDarkPullModel(root) {
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (material.color) material.color.setHex(0x140a20);
      if ('emissive' in material && material.emissive) material.emissive.setHex(0x1a0428);
      if ('roughness' in material) material.roughness = 0.96;
      if ('metalness' in material) material.metalness = 0.02;
    });
  });
}

export class DarkPullSpawner {
  constructor(gameState, sceneSetup, weaponModels, targeting, enemyManager, particles, world) {
    this.state = gameState;
    this.scene = sceneSetup;
    this.weaponModels = weaponModels;
    this.targeting = targeting;
    this.enemyManager = enemyManager;
    this.particles = particles;
    this.world = world;
    this.effects = [];
  }

  init() {
    events.on('combat:dark-pull-cast', () => this._spawnDarkPull());
  }

  update(dt) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      if (effect.state === 'travel') this._updateTravelEffect(effect, dt);
      else this._updateImpactEffect(effect, dt);

      if (effect.finished) {
        this._disposeEffect(effect);
        this.effects.splice(i, 1);
      }
    }
  }

  _spawnDarkPull() {
    const skill = this.state.getSelectedSkill();
    if (!skill || skill.id !== 'dark_pull') return;

    const player = this.state.player;
    const forward = new THREE.Vector3(
      -Math.sin(player.yaw),
      0,
      -Math.cos(player.yaw),
    ).normalize();

    const targetEnemy = this.targeting.updateEnemyTarget() ?? this.targeting.findMeleeCandidate();
    const initialDir = targetEnemy
      ? new THREE.Vector3().subVectors(targetEnemy.root.position, player.position)
      : forward.clone();
    initialDir.y = 0;
    if (initialDir.lengthSq() < 0.001) initialDir.copy(forward);
    initialDir.normalize();

    const start = player.position.clone().addScaledVector(initialDir, 1.45);
    start.y = this.world.getTerrainSurfaceY(start.x, start.z) + 0.05;

    const group = new THREE.Group();
    group.position.copy(start);
    this.scene.particleGroup.add(group);

    const tmpl = this.weaponModels.getProjectileTemplate('dark_pull');
    let model;
    let baseScale;
    if (tmpl) {
      model = cloneWithUniqueMaterials(tmpl.template);
      tintDarkPullModel(model);
      baseScale = tmpl.baseScale.clone().multiplyScalar(2.4);
      model.scale.copy(baseScale);
      group.add(model);
    } else {
      const material = new THREE.MeshBasicMaterial({
        color: 0x2a0d3f,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      model = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.22, 18), material);
      model.rotation.z = Math.PI / 2;
      baseScale = new THREE.Vector3(1, 1, 1);
      group.add(model);
    }

    group.rotation.y = Math.atan2(initialDir.x, initialDir.z);

    this.effects.push({
      group,
      model,
      baseScale,
      dir: initialDir.clone(),
      start: start.clone(),
      targetEnemy,
      maxRange: Math.max(3.5, skill.range ?? 7),
      travelled: 0,
      speed: 10.5,
      state: 'travel',
      age: 0,
      impactAge: 0,
      impactDuration: 0.45,
      skill,
      damage: Math.max(1, this.state.player.baseAttack * (skill.damage ?? 1)),
      pulledTargets: new Set(),
      impactPoint: start.clone(),
      didGameplayHit: false,
      swirlOffset: Math.random() * Math.PI * 2,
    });
  }

  _updateTravelEffect(effect, dt) {
    effect.age += dt;

    if (effect.targetEnemy?.alive) {
      const toEnemy = new THREE.Vector3().subVectors(
        effect.targetEnemy.root.position,
        effect.group.position,
      );
      toEnemy.y = 0;
      if (toEnemy.lengthSq() > 0.04) {
        effect.dir.copy(toEnemy.normalize());
      }
    }

    const step = Math.min(effect.speed * dt, effect.maxRange - effect.travelled);
    effect.group.position.addScaledVector(effect.dir, step);
    effect.travelled += step;
    effect.group.position.y = this.world.getTerrainSurfaceY(
      effect.group.position.x,
      effect.group.position.z,
    ) + 0.05;
    effect.group.rotation.y = Math.atan2(effect.dir.x, effect.dir.z);

    const progress = THREE.MathUtils.clamp(effect.travelled / effect.maxRange, 0, 1);
    const lengthScale = 0.35 + progress * 1.1;
    const widthScale = 0.25 + progress * 0.725;
    const thicknessScale = 0.16 - progress * 0.06 + Math.sin(effect.age * 8 + effect.swirlOffset) * 0.015;
    effect.model.scale.set(
      effect.baseScale.x * lengthScale,
      effect.baseScale.y * Math.max(0.12, thicknessScale),
      effect.baseScale.z * widthScale,
    );
    setOpacity(effect.group, 0.82 - progress * 0.18);

    if (this.particles && Math.random() < 0.55) {
      this.particles.spawn(
        effect.group.position.clone().add(new THREE.Vector3(0, 0.08, 0)),
        'purple',
        2,
      );
    }

    const impactRadius = 0.8 + progress * 1.05;
    const hitEnemy = this._findImpactedEnemy(effect, impactRadius);
    if (hitEnemy) {
      effect.impactPoint.copy(hitEnemy.root.position);
      effect.impactPoint.y = this.world.getTerrainSurfaceY(
        hitEnemy.root.position.x,
        hitEnemy.root.position.z,
      ) + 0.05;
      this._beginImpact(effect, true);
      return;
    }

    if (effect.travelled >= effect.maxRange - 0.001) {
      effect.impactPoint.copy(effect.group.position);
      this._beginImpact(effect, false);
    }
  }

  _updateImpactEffect(effect, dt) {
    effect.impactAge += dt;
    const phase = THREE.MathUtils.clamp(effect.impactAge / effect.impactDuration, 0, 1);
    const expand = 1 + phase * 1.2;
    const fade = 1 - phase;

    effect.group.position.copy(effect.impactPoint);
    effect.model.scale.set(
      effect.baseScale.x * 1.35 * expand,
      effect.baseScale.y * Math.max(0.045, 0.08 - phase * 0.025),
      effect.baseScale.z * 1.1 * expand,
    );
    effect.group.rotation.y += dt * 1.8;
    setOpacity(effect.group, Math.max(0, 0.85 * fade));

    if (phase >= 1) effect.finished = true;
  }

  _findImpactedEnemy(effect, radius) {
    const aliveEnemies = this.enemyManager.getAlive();
    let best = null;
    let bestDistance = Infinity;

    for (const enemy of aliveEnemies) {
      if (!enemy.alive || effect.pulledTargets.has(enemy)) continue;
      const distance = enemy.root.position.distanceTo(effect.group.position);
      const hitRadius = radius + 0.45 * (enemy.sizeMultiplier || 1);
      if (distance <= hitRadius && distance < bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }

    return best;
  }

  _beginImpact(effect, didHitEnemy) {
    effect.state = 'impact';
    effect.didGameplayHit = didHitEnemy;
    effect.group.position.copy(effect.impactPoint);

    if (this._shouldApplyGameplay() && didHitEnemy) {
      this._applyPullDamage(effect);
    } else {
      events.emit('sound:punch');
    }

    if (this.particles) {
      this.particles.spawn(
        effect.impactPoint.clone().add(new THREE.Vector3(0, 0.15, 0)),
        'purple',
        didHitEnemy ? 18 : 10,
      );
    }
    events.emit('hud:update');
  }

  _applyPullDamage(effect) {
    const skill = effect.skill;
    const playerPos = this.state.player.position;
    const impactRadius = 1.9;
    const pullStrength = Math.abs(skill.knockback ?? 0);
    let hitCount = 0;

    this.enemyManager.getAlive().forEach((enemy) => {
      if (!enemy.alive) return;
      const distance = enemy.root.position.distanceTo(effect.impactPoint);
      if (distance > impactRadius + 0.3 * (enemy.sizeMultiplier || 1)) return;

      const falloff = 1 - THREE.MathUtils.clamp(distance / impactRadius, 0, 0.75);
      const defense = enemy.baseDefense || 0;
      const damage = Math.max(1, Math.round(effect.damage * Math.max(0.7, falloff)) - defense);
      enemy.health -= damage;
      enemy.hitFlash = 1;

      const pullDir = new THREE.Vector3().subVectors(playerPos, enemy.root.position);
      pullDir.y = 0;
      if (pullDir.lengthSq() < 0.001) {
        pullDir.copy(effect.dir).multiplyScalar(-1);
      }
      pullDir.normalize();
      enemy.knockback.copy(pullDir.multiplyScalar(pullStrength * Math.max(0.6, falloff)));
      enemy.knockbackTimer = 280;

      hitCount += 1;
      effect.pulledTargets.add(enemy);

      if (enemy.health <= 0) {
        this.enemyManager.defeat(enemy, { source: 'dark_pull' });
        if (!this.state.defense.enabled) this.enemyManager.scheduleRespawn();
      }
    });

    if (hitCount > 0) {
      events.emit('sound:hit');
    } else {
      events.emit('sound:punch');
    }
  }

  _shouldApplyGameplay() {
    return this.state.playStyle !== 'multiplayer';
  }

  _disposeEffect(effect) {
    effect.group.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    });
    this.scene.particleGroup.remove(effect.group);
  }
}
