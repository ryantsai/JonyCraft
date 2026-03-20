import * as THREE from 'three';
import { events } from '../core/EventBus.js';

// Reusable objects for projectile group creation (avoid per-spawn allocations)
const _quat = new THREE.Quaternion();
const _rotMatrix = new THREE.Matrix4();
const _lookUp = new THREE.Vector3(0, 1, 0);
const _lookOrigin = new THREE.Vector3();
const _awayVec = new THREE.Vector3();

export class FireFistSpawner {
  constructor(gameState, sceneSetup, weaponModels, projectileSystem) {
    this.state = gameState;
    this.scene = sceneSetup;
    this.weaponModels = weaponModels;
    this.projectileSystem = projectileSystem;
    this._enemyManager = null;
    this._explosionEffect = null;
    this._world = null;
    this._pillarEffects = [];
  }

  setEnemyManager(enemyManager) {
    this._enemyManager = enemyManager;
  }

  setExplosionEffect(explosionEffect) {
    this._explosionEffect = explosionEffect;
  }

  setWorld(world) {
    this._world = world;
  }

  init() {
    events.on('combat:fire-fist-shoot', () => this._spawnFireFist());
    events.on('combat:fire-pillar-cast', () => this._spawnFirePillar());
    events.on('combat:flame-emperor-shoot', () => this._spawnFlameEmperor());
    events.on('combat:light-beam-shoot', () => this._spawnLightBeam());
  }

  update(dt) {
    this._updatePillarEffects(dt);
  }

  _getPlayerDirectionAndSpawn() {
    const player = this.state.player;
    const dir = new THREE.Vector3(
      -Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch),
    ).normalize();

    const right = new THREE.Vector3(
      Math.cos(player.yaw),
      0,
      -Math.sin(player.yaw),
    ).normalize();

    const spawnPos = new THREE.Vector3(
      player.position.x + right.x * 0.6 + dir.x * 1.0,
      player.position.y + 1.0 + dir.y * 1.0,
      player.position.z + right.z * 0.6 + dir.z * 1.0,
    );

    return { dir, spawnPos, player };
  }

  _createProjectileGroup(tmpl, worldScale, dir, spawnPos, modelRotY = 0) {
    const projModel = tmpl.template.clone();
    projModel.scale.copy(tmpl.baseScale).multiplyScalar(worldScale);
    projModel.position.set(0, 0, 0);
    if (modelRotY) projModel.rotation.y = modelRotY;

    _rotMatrix.lookAt(_lookOrigin, dir, _lookUp);
    _quat.setFromRotationMatrix(_rotMatrix);

    const projGroup = new THREE.Group();
    projGroup.position.copy(spawnPos);
    projGroup.quaternion.copy(_quat);
    projGroup.add(projModel);
    this.scene.particleGroup.add(projGroup);
    return projGroup;
  }

  _spawnFireFist() {
    const tmpl = this.weaponModels.getProjectileTemplate('fire_fist');
    if (!tmpl) return;

    const { dir, spawnPos, player } = this._getPlayerDirectionAndSpawn();
    const projGroup = this._createProjectileGroup(tmpl, 4.5, dir, spawnPos);
    const skill = this.state.getSelectedSkill();

    this.projectileSystem.spawn({
      group: projGroup,
      velocity: dir.clone().multiplyScalar(9),
      origin: spawnPos.clone(),
      maxRange: (skill.range || 12) + 2,
      damage: (skill.damage ?? 2) * player.baseAttack,
      knockback: skill.knockback ?? 6.0,
      trailConfig: {
        count: 30,
        size: 0.18,
        colors: [0xff4400, 0xff6b35, 0xffdd44],
        riseSpeed: 1.0,
      },
      // No explosion for fire_fist
      explodeOnImpact: false,
    });
  }

  _spawnFirePillar() {
    const player = this.state.player;
    const skill = this.state.getSelectedSkill();
    const aoeRadius = skill.aoeRadius || 5.25;
    const spawnDist = 4.0; // fixed distance in front of player

    // Spawn position: fixed distance in front of player (horizontal only)
    const forward = new THREE.Vector3(
      -Math.sin(player.yaw),
      0,
      -Math.cos(player.yaw),
    ).normalize();
    const groundY = this._world
      ? this._world.getTerrainSurfaceY(
          player.position.x + forward.x * spawnDist,
          player.position.z + forward.z * spawnDist,
        )
      : player.position.y;
    const pillarPos = new THREE.Vector3(
      player.position.x + forward.x * spawnDist,
      groundY,
      player.position.z + forward.z * spawnDist,
    );

    const tmpl = this.weaponModels.getProjectileTemplate('fire_pillar');
    if (tmpl) {
      const pillarModel = tmpl.template.clone();
      // Clone materials so fade-out doesn't affect the held-item model
      pillarModel.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
        }
      });
      const worldScale = 6.0;
      const thinFactor = 0.5; // thinner tornado
      pillarModel.scale.set(
        tmpl.baseScale.x * worldScale * thinFactor,
        tmpl.baseScale.y * worldScale,
        tmpl.baseScale.z * worldScale * thinFactor,
      );
      pillarModel.position.set(0, 0, 0);

      const pillarGroup = new THREE.Group();
      pillarGroup.position.copy(pillarPos);
      pillarGroup.add(pillarModel);
      this.scene.particleGroup.add(pillarGroup);

      this._pillarEffects.push({
        group: pillarGroup,
        model: pillarModel,
        baseScale: worldScale,
        thinFactor,
        baseScaleVec: tmpl.baseScale.clone(),
        age: 0,
        maxAge: 1.2,
        pos: pillarPos.clone(),
        aoeRadius,
      });
    }

    // Spawn lots of fire particles rising in a tornado pattern
    const fireColors = [0xff2200, 0xff4400, 0xff6b35, 0xffaa00, 0xffdd44];
    const particleCount = 60;
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 * 3; // 3 spirals
      const radius = 0.2 + (i / particleCount) * aoeRadius * 0.5; // tighter spiral
      const height = (i / particleCount) * 4.0;
      const color = fireColors[i % fireColors.length];
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      const sz = 0.08 + Math.random() * 0.12;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sz, sz, sz),
        mat,
      );
      mesh.position.set(
        pillarPos.x + Math.cos(angle) * radius,
        pillarPos.y + height + Math.random() * 0.5,
        pillarPos.z + Math.sin(angle) * radius,
      );
      mesh.renderOrder = 58;
      this.scene.particleGroup.add(mesh);

      this._pillarEffects.push({
        type: 'particle',
        mesh,
        mat,
        age: 0,
        maxAge: 0.6 + Math.random() * 0.6,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          3 + Math.random() * 5,
          (Math.random() - 0.5) * 1.5,
        ),
        spinAngle: angle,
        spinRadius: radius,
        spinSpeed: 5 + Math.random() * 4,
        basePos: pillarPos.clone(),
        startY: mesh.position.y,
      });
    }

    // Spawn upward explosion effect at pillar center
    if (this._explosionEffect) {
      this._explosionEffect.spawn(
        new THREE.Vector3(pillarPos.x, pillarPos.y + 1.0, pillarPos.z),
        {
          scale: 2.0,
          fireColors: [0xff2200, 0xff4400, 0xffaa00, 0xffdd44, 0xff6b35],
        },
      );
    }

    // AOE damage centered on pillar position, launch enemies upward
    if (this._enemyManager) {
      const alive = this._enemyManager.getAlive();
      const damage = (skill.damage ?? 3) * player.baseAttack;

      for (const enemy of alive) {
        const d = enemy.root.position.distanceTo(pillarPos);
        if (d > aoeRadius) continue;

        const falloff = 1 - (d / aoeRadius) * 0.5;
        const def = enemy.baseDefense || 0;
        const dmg = Math.max(1, Math.round(damage * falloff) - def);
        enemy.health -= dmg;
        enemy.hitFlash = 1;

        _awayVec.subVectors(enemy.root.position, pillarPos);
        _awayVec.y = 0;
        if (_awayVec.lengthSq() < 0.01) _awayVec.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        _awayVec.normalize();
        enemy.knockback.copy(_awayVec.multiplyScalar(2.0 * falloff));
        enemy.knockbackTimer = 300;

        // Launch enemy upward (30% less than before)
        enemy.velocityY = ((skill.knockback ?? 16) * falloff + 8) * 0.7;
        enemy.onGround = false;

        if (enemy.health <= 0) {
          this._enemyManager.defeat(enemy, { source: 'fire_pillar' });
        }
      }
    }

    events.emit('sound:punch');
    events.emit('hud:update');
  }

  _updatePillarEffects(dt) {
    for (let i = this._pillarEffects.length - 1; i >= 0; i--) {
      const effect = this._pillarEffects[i];

      if (effect.type === 'particle') {
        // Tornado fire particle
        effect.age += dt;
        if (effect.age >= effect.maxAge) {
          this.scene.particleGroup.remove(effect.mesh);
          effect.mat.dispose();
          this._pillarEffects.splice(i, 1);
          continue;
        }
        const t = effect.age / effect.maxAge;
        // Spiral upward
        effect.spinAngle += effect.spinSpeed * dt;
        const expandRadius = effect.spinRadius * (1 + t * 0.5);
        effect.mesh.position.x = effect.basePos.x + Math.cos(effect.spinAngle) * expandRadius;
        effect.mesh.position.z = effect.basePos.z + Math.sin(effect.spinAngle) * expandRadius;
        effect.mesh.position.y += effect.vel.y * dt;
        effect.mesh.rotation.x += dt * 8;
        effect.mesh.rotation.y += dt * 6;
        // Fade out
        effect.mat.opacity = Math.max(0, (1 - t) * 0.9);
        const scale = 1 + t * 1.5;
        effect.mesh.scale.setScalar(scale * 0.12);
        continue;
      }

      // GLB pillar model — rising flame tornado
      effect.age += dt;
      if (effect.age >= effect.maxAge) {
        // Dispose cloned materials, but not geometry (shared with template)
        effect.group.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.dispose();
          }
        });
        this.scene.particleGroup.remove(effect.group);
        this._pillarEffects.splice(i, 1);
        continue;
      }

      const t = effect.age / effect.maxAge;
      // Rise from ground and expand, then shrink and fade
      const risePhase = Math.min(1, t * 3); // fast rise in first third
      const fadePhase = Math.max(0, (t - 0.6) / 0.4); // fade in last 40%
      const scaleExpand = 1 + risePhase * 1.5 - fadePhase * 0.8;
      const yRise = risePhase * 3.0;

      effect.group.position.y = effect.pos.y + yRise;
      const thin = effect.thinFactor || 0.5;
      const bs = effect.baseScaleVec || new THREE.Vector3(1, 1, 1);
      effect.model.scale.set(
        bs.x * effect.baseScale * thin * scaleExpand,
        bs.y * effect.baseScale * scaleExpand,
        bs.z * effect.baseScale * thin * scaleExpand,
      );
      // Spin the tornado
      effect.group.rotation.y += dt * 8;

      // Fade out model materials
      effect.group.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.transparent = true;
          child.material.opacity = 1 - fadePhase;
        }
      });
    }
  }

  _spawnFlameEmperor() {
    const tmpl = this.weaponModels.getProjectileTemplate('flame_emperor');
    if (!tmpl) return;

    const { dir, spawnPos, player } = this._getPlayerDirectionAndSpawn();
    // Bigger projectile model in world space; rotate +90° Y so +X model head faces -Z (forward)
    const projGroup = this._createProjectileGroup(tmpl, 7.0, dir, spawnPos, Math.PI / 2);
    const skill = this.state.getSelectedSkill();

    this.projectileSystem.spawn({
      group: projGroup,
      velocity: dir.clone().multiplyScalar(7),
      origin: spawnPos.clone(),
      maxRange: (skill.range || 14) + 2,
      damage: (skill.damage ?? 5) * player.baseAttack,
      knockback: skill.knockback ?? 10.0,
      trailConfig: {
        count: 40,
        size: 0.25,
        colors: [0xff2200, 0xff4400, 0xff6b35, 0xffdd44, 0xffaa00],
        riseSpeed: 1.5,
      },
      // AOE explosion on impact
      aoe: true,
      aoeRadius: skill.aoeRadius || 5,
      explodeOnImpact: true,
      explosionScale: 3.0,
      explosionColors: [0xff2200, 0xff4400, 0xffaa00, 0xffdd44, 0xff6b35],
    });
  }

  _spawnLightBeam() {
    const tmpl = this.weaponModels.getProjectileTemplate('light_beam');
    if (!tmpl) return;

    const { dir, spawnPos, player } = this._getPlayerDirectionAndSpawn();
    const skill = this.state.getSelectedSkill();
    const projectileSpeed = 186;
    const projectileGravity = 0;
    const right = new THREE.Vector3(
      Math.cos(player.yaw),
      0,
      -Math.sin(player.yaw),
    ).normalize();
    const launchPos = spawnPos.clone()
      .addScaledVector(right, 0.16)
      .addScaledVector(dir, 0.2);
    launchPos.y -= 0.12;
    const cameraOrigin = new THREE.Vector3(
      player.position.x,
      player.position.y + 1.62,
      player.position.z,
    );
    const crosshairDistance = skill.range || 32;
    const crosshairPoint = cameraOrigin.clone().addScaledVector(dir, crosshairDistance);
    const aimPoint = crosshairPoint.clone();

    // Clone model and orient spear tip along travel direction
    const projModel = tmpl.template.clone();
    projModel.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => {
          const next = material.clone();
          next.depthTest = true;
          return next;
        });
      } else {
        child.material = child.material.clone();
        child.material.depthTest = true;
      }
    });
    const worldScale = 3.5;
    projModel.scale.copy(tmpl.baseScale).multiplyScalar(worldScale);
    projModel.position.set(0, 0, 0);
    projModel.rotation.set(0, 0, 0);

    const launchDir = aimPoint.sub(launchPos).normalize();

    _rotMatrix.lookAt(_lookOrigin, launchDir, _lookUp);
    _quat.setFromRotationMatrix(_rotMatrix);

    const projGroup = new THREE.Group();
    projGroup.position.copy(launchPos);
    projGroup.quaternion.copy(_quat);
    projGroup.add(projModel);
    this.scene.particleGroup.add(projGroup);

    this.projectileSystem.spawn({
      group: projGroup,
      velocity: launchDir.multiplyScalar(projectileSpeed),
      origin: launchPos.clone(),
      maxRange: skill.range || 32,
      damage: (skill.damage ?? 2) * player.baseAttack,
      knockback: skill.knockback ?? 5.0,
      trailConfig: {
        count: 36,
        size: 0.18,
        colors: [0xfff7c9, 0xffffff, 0xffef9b, 0xffd54f],
        riseSpeed: -0.35,
      },
      explodeOnImpact: false,
      gravity: projectileGravity,
    });
  }
}
