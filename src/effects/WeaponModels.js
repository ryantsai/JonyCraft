import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../config/assets.js';
import {
  SWORD_SWING_MS, PUNCH_SWING_MS,
} from '../config/constants.js';
import { events } from '../core/EventBus.js';
import { getAnimMod } from '../config/animStyles.js';
import { FruitVFX } from './FruitVFX.js';
import { updateCooldownHUD } from './CooldownHUD.js';

function tintDarkPullModel(root) {
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (material.color) material.color.setHex(0x1a1026);
      if ('emissive' in material && material.emissive) material.emissive.setHex(0x12001c);
      if ('roughness' in material) material.roughness = 0.92;
      if ('metalness' in material) material.metalness = 0.02;
    });
  });
}

/**
 * Builds and animates held weapon/skill 3D models in first person.
 * Supports per-fruit color tinting and animation modifiers.
 *
 * Screen effects, projectiles, and cooldown HUD are handled by
 * ScreenEffects, ProjectileSystem, and CooldownHUD respectively.
 *
 * Weapon types: sword, punch, cast, slam, uppercut, clap, fire_fist, dark_pull, dirt
 */
export class WeaponModels {
  constructor(sceneSetup, textureManager, blockMaterials) {
    this.scene = sceneSetup;
    this.textureManager = textureManager;
    this.blockMaterials = blockMaterials;
    this.models = {};

    // Track active fruit for tint changes
    this._lastFruitId = null;

    // References set externally
    this._gameState = null;

    // Fruit VFX particle system (delegated)
    this._fruitVFX = new FruitVFX(sceneSetup);
  }

  setRefs(enemyManager, particles) {
    // kept for backward-compat wiring in main.js
  }

  buildAll() {
    this._buildDiamondSword();
    this._buildRubberPunch();
    this._buildCastHand();
    this._buildSlamFist();
    this._buildUppercutFist();
    this._buildClapFists();
    this._buildFireFist();
    this._buildFirePillar();
    this._buildFlameEmperor();
    this._buildDarkPull();
    this._buildLaserSabre();
    this._buildLightBeam();
    this._buildDirtSkill();
    this._fruitVFX.build();
  }

  update(dt, gameState) {
    this._gameState = gameState;
    const combat = gameState.combat;
    if (combat.cooldown > 0) combat.cooldown = Math.max(0, combat.cooldown - dt * 1000);
    combat.swordSwingTime = Math.max(0, combat.swordSwingTime - dt * 1000);
    combat.punchTime = Math.max(0, combat.punchTime - dt * 1000);

    // Update weapon color tint when fruit changes
    this._updateFruitTint(gameState);

    Object.values(this.models).forEach((e) => { e.group.visible = false; });

    const skill = gameState.getSelectedSkill();
    const wt = skill.weaponType || skill.id;
    const swingMs = skill.swingMs || (wt === 'sword' ? SWORD_SWING_MS : PUNCH_SWING_MS);

    // Get per-fruit animation modifier
    const fruit = gameState.selectedFruit;
    const mod = fruit ? getAnimMod(fruit.animStyle) : getAnimMod(null);

    if (wt === 'sword') {
      this._animateSword(combat, swingMs, mod, gameState);
    } else if (wt === 'punch') {
      this._animatePunch(combat, swingMs, mod, gameState);
    } else if (wt === 'cast') {
      this._animateCast(combat, swingMs, mod, gameState);
    } else if (wt === 'slam') {
      this._animateSlam(combat, swingMs, mod, gameState);
    } else if (wt === 'uppercut') {
      this._animateUppercut(combat, swingMs, mod, gameState);
    } else if (wt === 'clap') {
      this._animateClap(combat, swingMs, mod, gameState);
    } else if (wt === 'fire_fist') {
      this._animateFireFist(combat, swingMs, mod, gameState);
    } else if (wt === 'fire_pillar') {
      this._animateFirePillar(combat, swingMs, mod, gameState);
    } else if (wt === 'flame_emperor') {
      this._animateFlameEmperor(combat, swingMs, mod, gameState);
    } else if (wt === 'dark_pull') {
      this._animateDarkPull(combat, swingMs, mod, gameState);
    } else if (wt === 'laser_sabre') {
      this._animateLaserSabre(combat, swingMs, mod, gameState);
    } else if (wt === 'light_beam') {
      this._animateLightBeam(combat, swingMs, mod, gameState);
    } else if (wt === 'dirt') {
      this.models.dirt.group.position.set(0.58, -0.56, -0.72);
      this.models.dirt.group.rotation.set(0.22, 0.22, -0.3);
      this.models.dirt.group.visible = gameState.mode === 'playing';
    }

    // Update fruit-specific VFX particles
    const attackPhase = (wt === 'sword' || wt === 'laser_sabre')
      ? (combat.swordSwingTime > 0 ? 1 - combat.swordSwingTime / swingMs : 0)
      : (combat.punchTime > 0 ? 1 - combat.punchTime / swingMs : 0);
    this._fruitVFX.update(dt, attackPhase, fruit, gameState.mode === 'playing');

    // Update cooldown HUD
    updateCooldownHUD(gameState);
  }

  // ── Sword animation with fruit modifiers ──

  _animateSword(combat, swingMs, mod, gameState) {
    const phase = combat.swordSwingTime > 0 ? 1 - combat.swordSwingTime / swingMs : 0;
    const windup = THREE.MathUtils.smoothstep(phase, 0, 0.28);
    const release = THREE.MathUtils.smoothstep(phase, 0.18, 0.78);
    const recover = THREE.MathUtils.smoothstep(phase, 0.78, 1);
    const slash = release - recover * 0.28;

    const impactPhase = phase > 0.2 && phase < 0.6
      ? Math.sin((phase - 0.2) / 0.4 * Math.PI)
      : 0;
    const scaleBoost = 1 + (mod.fistScale - 1) * 0.3 * impactPhase;

    this.models.sword.group.position.set(
      THREE.MathUtils.lerp(0.46, 0.04, slash),
      THREE.MathUtils.lerp(-0.54, -0.76, slash) + windup * 0.05,
      THREE.MathUtils.lerp(-0.56, -0.34, slash),
    );
    const swirlWave = Math.sin(phase * Math.PI * 3.2) * mod.swirl * Math.max(0, 1 - phase);
    this.models.sword.group.rotation.set(
      THREE.MathUtils.lerp(0.34, -0.88, slash) + windup * 0.1 + swirlWave,
      THREE.MathUtils.lerp(-0.12, -0.28, slash) - slash * 0.08 * mod.arcTilt,
      THREE.MathUtils.lerp(-1.18, -0.02, slash) - windup * 0.14 - slash * 0.12 * mod.arcTilt,
    );
    this.models.sword.sword.scale.set(-1.22 * scaleBoost, 1.22 * scaleBoost, 1);

    if (this.models.sword.glowMesh) {
      const glowAlpha = phase > 0 ? mod.swordGlow * (1 - phase) : 0;
      this.models.sword.glowMesh.material.opacity = glowAlpha;
      this.models.sword.glowMesh.visible = glowAlpha > 0.01;
    }

    this.models.sword.group.visible = gameState.mode === 'playing';
  }

  // ── Punch animation with fruit modifiers ──

  _animatePunch(combat, swingMs, mod, gameState) {
    const phase = combat.punchTime > 0 ? 1 - combat.punchTime / swingMs : 0;
    const windup = THREE.MathUtils.smoothstep(phase, 0, 0.18);
    const release = THREE.MathUtils.smoothstep(phase, 0.12, 0.45);
    const recover = THREE.MathUtils.smoothstep(phase, 0.48, 1);
    const extend = Math.max(0, release - recover * 0.92);
    const armScale = 1 + extend * 3.6 * mod.stretchMul;
    const reach = this.models.punch.baseLength * armScale;

    const fistBoost = 1 + (mod.fistScale - 1) * extend;

    this.models.punch.arm.scale.z = armScale;
    this.models.punch.fist.position.z = -reach;
    this.models.punch.fist.scale.setScalar(fistBoost);
    this.models.punch.cuff.position.z = -0.18 - extend * 0.08;
    this.models.punch.group.position.set(
      0.76 - extend * 0.24 + windup * 0.06,
      -0.74 + extend * 0.18 + windup * 0.05,
      -0.98 - extend * 0.24,
    );
    const swirlWave = Math.sin(phase * Math.PI * 4.0) * mod.swirl * (0.35 + extend);
    this.models.punch.group.rotation.set(
      0.56 - extend * 0.12 - windup * 0.1 + swirlWave,
      -0.52 + extend * 0.18 + extend * 0.12 * mod.arcTilt,
      -0.46 + extend * 0.08 - extend * 0.1 * mod.arcTilt,
    );
    this.models.punch.armAnchor.rotation.set(-0.08 - extend * 0.05, 0.1 - extend * 0.06, 0.04);
    this.models.punch.forearmPivot.rotation.set(-0.06 + extend * 0.04, 0.02, 0);
    this.models.punch.group.visible = gameState.mode === 'playing';
  }

  // ── Cast animation: open palm pushes forward with magic orb ──

  _animateCast(combat, swingMs, mod, gameState) {
    const phase = combat.punchTime > 0 ? 1 - combat.punchTime / swingMs : 0;
    const charge = THREE.MathUtils.smoothstep(phase, 0, 0.25);
    const release = THREE.MathUtils.smoothstep(phase, 0.2, 0.55);
    const recover = THREE.MathUtils.smoothstep(phase, 0.6, 1);
    const push = Math.max(0, release - recover * 0.8);
    const m = this.models.cast;

    m.group.position.set(
      0.52 - push * 0.36,
      -0.68 + charge * 0.12 + push * 0.22,
      -0.82 - push * 0.48,
    );

    const swirlWave = Math.sin(phase * Math.PI * 3.0) * mod.swirl * 0.6;
    m.group.rotation.set(
      0.3 - push * 0.5 + swirlWave,
      -0.4 + push * 0.2,
      -0.2 - charge * 0.15,
    );

    const spread = charge * 0.18;
    m.fingers.forEach((f, i) => {
      const angle = (i - 1.5) * spread;
      f.rotation.set(-charge * 0.08, angle, 0);
    });

    const orbScale = 0.12 + push * 0.22 * mod.fistScale;
    const orbGlow = phase > 0 ? (1 - phase) * 0.7 : 0.15;
    m.orb.scale.setScalar(orbScale);
    m.orb.material.opacity = orbGlow;
    m.orb.position.set(0, 0.02, -0.52 - push * 0.3);

    if (m.orbRing) {
      m.orbRing.rotation.z += 0.08;
      m.orbRing.rotation.x += 0.03;
      m.orbRing.scale.setScalar(orbScale * 2.2);
      m.orbRing.material.opacity = orbGlow * 0.5;
      m.orbRing.position.copy(m.orb.position);
    }

    m.group.visible = gameState.mode === 'playing';
  }

  // ── Slam animation: overhead fist smashes downward ──

  _animateSlam(combat, swingMs, mod, gameState) {
    const phase = combat.punchTime > 0 ? 1 - combat.punchTime / swingMs : 0;
    const windup = THREE.MathUtils.smoothstep(phase, 0, 0.3);
    const smash = THREE.MathUtils.smoothstep(phase, 0.25, 0.5);
    const recover = THREE.MathUtils.smoothstep(phase, 0.55, 1);
    const m = this.models.slam;

    const yOffset = windup * 0.6 - smash * 1.1 + recover * 0.5;
    const zOffset = -smash * 0.3 + recover * 0.15;

    m.group.position.set(
      0.3 - smash * 0.2,
      -0.4 + yOffset,
      -0.9 + zOffset,
    );

    const tiltX = -windup * 0.6 + smash * 1.4 - recover * 0.8;
    const shake = phase > 0.4 && phase < 0.6
      ? Math.sin(phase * Math.PI * 12) * mod.shake * 8
      : 0;
    m.group.rotation.set(
      tiltX + shake,
      -0.15,
      -0.1 + smash * 0.08,
    );

    const impactBoost = phase > 0.35 && phase < 0.6
      ? Math.sin((phase - 0.35) / 0.25 * Math.PI) * (mod.fistScale - 1) * 0.6
      : 0;
    m.fist.scale.setScalar(1 + impactBoost);

    m.group.visible = gameState.mode === 'playing';
  }

  // ── Uppercut animation: fist swings upward from below ──

  _animateUppercut(combat, swingMs, mod, gameState) {
    const phase = combat.punchTime > 0 ? 1 - combat.punchTime / swingMs : 0;
    const crouch = THREE.MathUtils.smoothstep(phase, 0, 0.2);
    const swing = THREE.MathUtils.smoothstep(phase, 0.15, 0.5);
    const recover = THREE.MathUtils.smoothstep(phase, 0.55, 1);
    const m = this.models.uppercut;

    const yOffset = -crouch * 0.4 + swing * 1.0 - recover * 0.6;
    const zOffset = -swing * 0.35 + recover * 0.2;

    m.group.position.set(
      0.6 - swing * 0.25,
      -0.9 + yOffset,
      -0.85 + zOffset,
    );

    const arcAngle = -crouch * 0.3 + swing * 1.2 - recover * 0.9;
    const swirlWave = Math.sin(phase * Math.PI * 3.5) * mod.swirl * 0.8;
    m.group.rotation.set(
      arcAngle + swirlWave,
      -0.4 + swing * 0.15,
      -0.3 + swing * 0.2 - recover * 0.1,
    );

    const impactBoost = phase > 0.3 && phase < 0.55
      ? Math.sin((phase - 0.3) / 0.25 * Math.PI) * (mod.fistScale - 1) * 0.5
      : 0;
    m.fist.scale.setScalar(1 + impactBoost);

    const armStretch = 1 + swing * 0.4 * mod.stretchMul;
    m.arm.scale.z = armStretch;

    m.group.visible = gameState.mode === 'playing';
  }

  // ── Clap animation: two fists converge and thrust forward ──

  _animateClap(combat, swingMs, mod, gameState) {
    const phase = combat.punchTime > 0 ? 1 - combat.punchTime / swingMs : 0;
    const spread = THREE.MathUtils.smoothstep(phase, 0, 0.2);
    const converge = THREE.MathUtils.smoothstep(phase, 0.15, 0.45);
    const thrust = THREE.MathUtils.smoothstep(phase, 0.4, 0.65);
    const recover = THREE.MathUtils.smoothstep(phase, 0.7, 1);
    const m = this.models.clap;

    const separation = spread * 0.6 - converge * 0.6;
    const zPush = -thrust * 0.5 + recover * 0.3;

    m.leftFist.position.set(
      -0.18 - separation,
      0,
      -0.4 + zPush,
    );
    m.rightFist.position.set(
      0.18 + separation,
      0,
      -0.4 + zPush,
    );

    m.group.position.set(
      0.15,
      -0.65 + thrust * 0.12,
      -0.7 - thrust * 0.3,
    );

    const tiltAngle = converge * 0.3 - recover * 0.15;
    m.leftFist.rotation.set(0, tiltAngle, converge * 0.2);
    m.rightFist.rotation.set(0, -tiltAngle, -converge * 0.2);

    m.group.rotation.set(
      0.2 - thrust * 0.15,
      -0.1,
      0,
    );

    const impactBoost = phase > 0.35 && phase < 0.55
      ? Math.sin((phase - 0.35) / 0.2 * Math.PI) * (mod.fistScale - 1) * 0.7
      : 0;
    m.leftFist.scale.setScalar(1 + impactBoost);
    m.rightFist.scale.setScalar(1 + impactBoost);

    if (m.energyBurst) {
      const burstAlpha = phase > 0.38 && phase < 0.65
        ? Math.sin((phase - 0.38) / 0.27 * Math.PI) * 0.8
        : 0;
      m.energyBurst.material.opacity = burstAlpha;
      m.energyBurst.visible = burstAlpha > 0.01;
      m.energyBurst.scale.setScalar(0.15 + burstAlpha * 0.25);
      m.energyBurst.rotation.z += 0.12;
    }

    m.group.visible = gameState.mode === 'playing';
  }

  // ── Fruit color tinting ──

  _updateFruitTint(gameState) {
    const fruit = gameState.selectedFruit;
    const fruitId = fruit?.id || null;
    if (fruitId === this._lastFruitId) return;
    this._lastFruitId = fruitId;

    if (fruit) {
      const c = new THREE.Color(fruit.color);
      this.models.punch.fist.material.color.copy(c);
      this.models.punch.arm.material.color.copy(
        new THREE.Color(0xd59a72).lerp(c, 0.4),
      );
      this.models.punch.cuff.material.color.copy(
        new THREE.Color(0xc6452d).lerp(c, 0.5),
      );

      this.models.cast.palm.material.color.copy(
        new THREE.Color(0xefb48f).lerp(c, 0.3),
      );
      this.models.cast.orb.material.color.copy(c);
      if (this.models.cast.orbRing) {
        this.models.cast.orbRing.material.color.copy(c);
      }
      this.models.cast.fingers.forEach(f => {
        f.material.color.copy(new THREE.Color(0xefb48f).lerp(c, 0.3));
      });

      this.models.slam.fist.material.color.copy(c);
      this.models.slam.arm.material.color.copy(
        new THREE.Color(0xd59a72).lerp(c, 0.4),
      );

      this.models.uppercut.fist.material.color.copy(c);
      this.models.uppercut.arm.material.color.copy(
        new THREE.Color(0xd59a72).lerp(c, 0.4),
      );

      this.models.clap.leftMat.color.copy(c);
      this.models.clap.rightMat.color.copy(c);
      if (this.models.clap.energyBurst) {
        this.models.clap.energyBurst.material.color.copy(c);
      }

      if (this.models.sword.glowMesh) {
        this.models.sword.glowMesh.material.color.copy(c);
      }
    } else {
      this.models.punch.fist.material.color.setHex(0xefb48f);
      this.models.punch.arm.material.color.setHex(0xd59a72);
      this.models.punch.cuff.material.color.setHex(0xc6452d);
      this.models.cast.palm.material.color.setHex(0xefb48f);
      this.models.cast.orb.material.color.setHex(0xaaddff);
      if (this.models.cast.orbRing) this.models.cast.orbRing.material.color.setHex(0xaaddff);
      this.models.cast.fingers.forEach(f => f.material.color.setHex(0xefb48f));
      this.models.slam.fist.material.color.setHex(0xefb48f);
      this.models.slam.arm.material.color.setHex(0xd59a72);
      this.models.uppercut.fist.material.color.setHex(0xefb48f);
      this.models.uppercut.arm.material.color.setHex(0xd59a72);
      this.models.clap.leftMat.color.setHex(0xefb48f);
      this.models.clap.rightMat.color.setHex(0xefb48f);
      if (this.models.clap.energyBurst) this.models.clap.energyBurst.material.color.setHex(0xffffff);
      if (this.models.sword.glowMesh) {
        this.models.sword.glowMesh.material.color.setHex(0xffffff);
      }
    }
  }

  // ── Build models ──

  _buildDiamondSword() {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      map: this.textureManager.load(assetUrl('assets/kenney/items/sword_diamond.png')),
      transparent: true, alphaTest: 0.15, side: THREE.DoubleSide, depthTest: false,
    });
    const sword = new THREE.Mesh(this.scene.planeGeometry.clone(), mat);
    sword.scale.set(-1.22, 1.22, 1);
    sword.renderOrder = 50;
    sword.position.set(-0.08, 0.02, 0);
    group.add(sword);

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const glowMesh = new THREE.Mesh(this.scene.planeGeometry.clone(), glowMat);
    glowMesh.scale.set(-1.32, 1.32, 1);
    glowMesh.renderOrder = 51;
    glowMesh.position.set(-0.08, 0.02, 0.01);
    glowMesh.visible = false;
    group.add(glowMesh);

    group.visible = false;
    this.scene.heldItemPivot.add(group);
    this.models.sword = { group, sword, glowMesh };
  }

  _buildRubberPunch() {
    const group = new THREE.Group();
    const armAnchor = new THREE.Group();
    const forearmPivot = new THREE.Group();
    armAnchor.add(forearmPivot);
    group.add(armAnchor);

    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xc6452d });
    const armMat = new THREE.MeshLambertMaterial({ color: 0xd59a72 });
    const fistMat = new THREE.MeshLambertMaterial({ color: 0xefb48f });

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.28), sleeveMat);
    sleeve.position.set(0, 0, -0.08);

    const armGeo = new THREE.BoxGeometry(0.18, 0.18, 0.86);
    armGeo.translate(0, 0, -0.43);
    const arm = new THREE.Mesh(armGeo, armMat);

    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), fistMat);
    fist.position.set(0, 0, -0.86);

    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.08), sleeveMat);
    cuff.position.set(0, 0, -0.18);

    forearmPivot.add(arm, fist, cuff);
    armAnchor.add(sleeve);
    group.visible = false;
    this.scene.heldItemPivot.add(group);
    this.models.punch = { group, armAnchor, forearmPivot, arm, fist, cuff, baseLength: 0.86 };
  }

  _buildCastHand() {
    const group = new THREE.Group();
    const palmMat = new THREE.MeshLambertMaterial({ color: 0xefb48f });

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.22), palmMat);
    palm.position.set(0, 0, -0.3);
    group.add(palm);

    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const fingerMat = new THREE.MeshLambertMaterial({ color: 0xefb48f });
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.16), fingerMat);
      finger.position.set(-0.08 + i * 0.053, 0.01, -0.5);
      group.add(finger);
      fingers.push(finger);
    }

    const thumbMat = new THREE.MeshLambertMaterial({ color: 0xefb48f });
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.1), thumbMat);
    thumb.position.set(-0.14, 0.01, -0.34);
    thumb.rotation.y = 0.5;
    group.add(thumb);

    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xc6452d });
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.18), sleeveMat);
    sleeve.position.set(0, -0.04, -0.12);
    group.add(sleeve);

    const orbMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), orbMat);
    orb.position.set(0, 0.02, -0.52);
    orb.renderOrder = 52;
    group.add(orb);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const ringGeo = new THREE.RingGeometry(0.14, 0.18, 16);
    const orbRing = new THREE.Mesh(ringGeo, ringMat);
    orbRing.position.copy(orb.position);
    orbRing.renderOrder = 53;
    group.add(orbRing);

    group.visible = false;
    this.scene.heldItemPivot.add(group);
    this.models.cast = { group, palm, fingers, orb, orbRing, sleeve };
  }

  _buildSlamFist() {
    const group = new THREE.Group();
    const armMat = new THREE.MeshLambertMaterial({ color: 0xd59a72 });
    const fistMat = new THREE.MeshLambertMaterial({ color: 0xefb48f });
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xc6452d });

    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), fistMat);
    fist.position.set(0, 0, -0.7);

    const armGeo = new THREE.BoxGeometry(0.2, 0.2, 0.6);
    armGeo.translate(0, 0, -0.3);
    const arm = new THREE.Mesh(armGeo, armMat);

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.2), sleeveMat);
    sleeve.position.set(0, 0, -0.04);

    const knuckleMat = new THREE.MeshLambertMaterial({ color: 0xe0a080 });
    for (let i = 0; i < 3; i++) {
      const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), knuckleMat);
      knuckle.position.set(-0.1 + i * 0.1, 0.18, -0.7);
      group.add(knuckle);
    }

    group.add(arm, fist, sleeve);
    group.visible = false;
    this.scene.heldItemPivot.add(group);
    this.models.slam = { group, fist, arm, sleeve };
  }

  _buildUppercutFist() {
    const group = new THREE.Group();
    const armMat = new THREE.MeshLambertMaterial({ color: 0xd59a72 });
    const fistMat = new THREE.MeshLambertMaterial({ color: 0xefb48f });
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xc6452d });

    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), fistMat);
    fist.position.set(0, 0.05, -0.78);

    const armGeo = new THREE.BoxGeometry(0.17, 0.17, 0.7);
    armGeo.translate(0, 0, -0.35);
    const arm = new THREE.Mesh(armGeo, armMat);

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.22), sleeveMat);
    sleeve.position.set(0, 0, -0.04);

    group.add(arm, fist, sleeve);
    group.visible = false;
    this.scene.heldItemPivot.add(group);
    this.models.uppercut = { group, fist, arm, sleeve };
  }

  _buildClapFists() {
    const group = new THREE.Group();
    const leftMat = new THREE.MeshLambertMaterial({ color: 0xefb48f });
    const rightMat = new THREE.MeshLambertMaterial({ color: 0xefb48f });
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xc6452d });

    const leftFist = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), leftMat);
    leftFist.position.set(-0.18, 0, -0.4);

    const rightFist = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), rightMat);
    rightFist.position.set(0.18, 0, -0.4);

    const leftArmMat = new THREE.MeshLambertMaterial({ color: 0xd59a72 });
    const leftArmGeo = new THREE.BoxGeometry(0.14, 0.14, 0.35);
    leftArmGeo.translate(0, 0, -0.18);
    const leftArm = new THREE.Mesh(leftArmGeo, leftArmMat);
    leftArm.position.set(-0.22, 0, 0);

    const rightArmMat = new THREE.MeshLambertMaterial({ color: 0xd59a72 });
    const rightArmGeo = new THREE.BoxGeometry(0.14, 0.14, 0.35);
    rightArmGeo.translate(0, 0, -0.18);
    const rightArm = new THREE.Mesh(rightArmGeo, rightArmMat);
    rightArm.position.set(0.22, 0, 0);

    const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.14), sleeveMat);
    leftSleeve.position.set(-0.22, 0, 0.12);
    const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.14), sleeveMat);
    rightSleeve.position.set(0.22, 0, 0.12);

    const burstMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const energyBurst = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6), burstMat);
    energyBurst.position.set(0, 0, -0.4);
    energyBurst.renderOrder = 52;
    energyBurst.visible = false;

    group.add(leftFist, rightFist, leftArm, rightArm, leftSleeve, rightSleeve, energyBurst);
    group.visible = false;
    this.scene.heldItemPivot.add(group);
    this.models.clap = { group, leftFist, rightFist, leftMat, rightMat, energyBurst };
  }

  // ── Fire Fist: GLB model held in first person ──

  _buildFireFist() {
    const group = new THREE.Group();
    group.visible = false;
    this.scene.heldItemPivot.add(group);

    this.models.fire_fist = {
      group,
      glbModel: null,
      glbLoaded: false,
      glbBaseScale: new THREE.Vector3(1, 1, 1),
      idleTime: 0,
    };

    const loader = new GLTFLoader();
    loader.load('assets/firstperson/skills/firefruit/fire_fist.glb', (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const s = 0.5 / maxDim;
      model.scale.set(s, s, s);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x * s, -center.y * s, -center.z * s);

      group.add(model);
      this.models.fire_fist.glbModel = model;
      this.models.fire_fist.glbBaseScale.copy(model.scale);
      this.models.fire_fist.glbLoaded = true;
    });
  }

  _animateFireFist(combat, swingMs, mod, gameState) {
    const m = this.models.fire_fist;
    if (!m) return;

    const onCooldown = combat.cooldown > 0;
    m.idleTime += 0.016;
    const t = m.idleTime;

    if (onCooldown) {
      m.group.visible = false;
    } else {
      const waveX = Math.sin(t * 1.8) * 0.015;
      const waveY = Math.cos(t * 1.3) * 0.02;
      const waveRot = Math.sin(t * 1.1) * 0.03;
      m.group.position.set(0.55 + waveX, -0.55 + waveY, -0.7);
      m.group.rotation.set(0.15 + waveRot, -0.2, -0.15 + waveRot * 0.5);
      if (m.glbModel) m.glbModel.scale.copy(m.glbBaseScale);
      m.group.visible = gameState.mode === 'playing';
    }
  }

  // ── Fire Pillar: GLB model held in first person (flame tornado) ──

  _buildFirePillar() {
    const group = new THREE.Group();
    group.visible = false;
    this.scene.heldItemPivot.add(group);

    this.models.fire_pillar = {
      group,
      glbModel: null,
      glbLoaded: false,
      glbBaseScale: new THREE.Vector3(1, 1, 1),
      idleTime: 0,
    };

    const loader = new GLTFLoader();
    loader.load('assets/firstperson/skills/firefruit/fire_pillar.glb', (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const s = 0.5 / maxDim;
      model.scale.set(s, s, s);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x * s, -center.y * s, -center.z * s);

      group.add(model);
      this.models.fire_pillar.glbModel = model;
      this.models.fire_pillar.glbBaseScale.copy(model.scale);
      this.models.fire_pillar.glbLoaded = true;
    });
  }

  _animateFirePillar(combat, swingMs, mod, gameState) {
    const m = this.models.fire_pillar;
    if (!m) return;

    const onCooldown = combat.cooldown > 0;
    m.idleTime += 0.016;
    const t = m.idleTime;

    if (onCooldown) {
      m.group.visible = false;
    } else {
      const waveX = Math.sin(t * 1.5) * 0.012;
      const waveY = Math.cos(t * 1.1) * 0.018;
      const spinY = t * 1.5;
      m.group.position.set(0.5 + waveX, -0.5 + waveY, -0.65);
      m.group.rotation.set(0.1, spinY, -0.1);
      if (m.glbModel) {
        const pulse = 1 + Math.sin(t * 2.5) * 0.08;
        m.glbModel.scale.copy(m.glbBaseScale).multiplyScalar(pulse);
      }
      m.group.visible = gameState.mode === 'playing';
    }
  }

  /** Returns the GLB template for projectile cloning by weapon type key. */
  getProjectileTemplate(key) {
    const m = this.models[key];
    if (!m || !m.glbLoaded) return null;
    return { template: m.glbModel, baseScale: m.glbBaseScale };
  }

  // Legacy alias
  getFireFistTemplate() {
    return this.getProjectileTemplate('fire_fist');
  }

  // ── Flame Emperor: GLB model held in first person (bigger fireball) ──

  _buildFlameEmperor() {
    const group = new THREE.Group();
    group.visible = false;
    this.scene.heldItemPivot.add(group);

    // Burning VFX particles around the held fireball
    const burnGroup = new THREE.Group();
    burnGroup.renderOrder = 55;
    group.add(burnGroup);
    const burnParticles = [];
    const burnCount = 16;
    const burnColors = [0xff4400, 0xff6b35, 0xffaa00, 0xffdd44, 0xff2200];
    for (let i = 0; i < burnCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: burnColors[i % burnColors.length],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      const sz = 0.015 + Math.random() * 0.015;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mat);
      mesh.visible = false;
      mesh.renderOrder = 55;
      burnGroup.add(mesh);
      burnParticles.push({ mesh, mat, seed: Math.random() * Math.PI * 2 });
    }

    this.models.flame_emperor = {
      group,
      glbModel: null,
      glbLoaded: false,
      glbBaseScale: new THREE.Vector3(1, 1, 1),
      idleTime: 0,
      burnGroup,
      burnParticles,
    };

    const loader = new GLTFLoader();
    loader.load('assets/firstperson/skills/firefruit/flame_emperor.glb', (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const s = 0.6 / maxDim;
      model.scale.set(s, s, s);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x * s, -center.y * s, -center.z * s);
      // Model points along +X; rotate so head faces -Z (forward in camera space)
      model.rotation.y = Math.PI / 2;

      group.add(model);
      this.models.flame_emperor.glbModel = model;
      this.models.flame_emperor.glbBaseScale.copy(model.scale);
      this.models.flame_emperor.glbLoaded = true;
    });
  }

  _animateFlameEmperor(combat, swingMs, mod, gameState) {
    const m = this.models.flame_emperor;
    if (!m) return;

    const onCooldown = combat.cooldown > 0;
    m.idleTime += 0.016;
    const t = m.idleTime;

    if (onCooldown) {
      m.group.visible = false;
      m.burnParticles.forEach(p => { p.mesh.visible = false; });
    } else {
      // Hovering fireball with slow pulse
      const pulseScale = 1 + Math.sin(t * 2.0) * 0.06;
      const waveX = Math.sin(t * 1.2) * 0.02;
      const waveY = Math.cos(t * 0.9) * 0.025;
      const waveRot = Math.sin(t * 0.8) * 0.04;
      m.group.position.set(0.5 + waveX, -0.45 + waveY, -0.65);
      m.group.rotation.set(0.1 + waveRot, -0.15 + waveRot * 0.3, -0.1);
      if (m.glbModel) {
        m.glbModel.scale.copy(m.glbBaseScale).multiplyScalar(pulseScale);
      }
      m.group.visible = gameState.mode === 'playing';

      // Animate burning VFX around the fireball
      this._updateFlameEmperorBurn(m, t);
    }
  }

  // ── Dark Pull: GLB cloud idle at the bottom-right, then lunges on cast ──

  _buildDarkPull() {
    const group = new THREE.Group();
    group.visible = false;
    this.scene.heldItemPivot.add(group);

    this.models.dark_pull = {
      group,
      glbModel: null,
      glbLoaded: false,
      glbBaseScale: new THREE.Vector3(1, 1, 1),
      idleTime: 0,
    };

    const loader = new GLTFLoader();
    loader.load(assetUrl('assets/firstperson/skills/darkfruit/dark_pull.glb'), (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = 1.02 / maxDim;
      model.scale.set(s, s, s);

      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x * s, -center.y * s, -center.z * s);
      tintDarkPullModel(model);

      group.add(model);
      this.models.dark_pull.glbModel = model;
      this.models.dark_pull.glbBaseScale.copy(model.scale);
      this.models.dark_pull.glbLoaded = true;
    });
  }

  _animateDarkPull(combat, swingMs, mod, gameState) {
    const m = this.models.dark_pull;
    if (!m) return;

    m.idleTime += 0.016;
    const t = m.idleTime;
    const phase = combat.punchTime > 0 ? 1 - combat.punchTime / swingMs : 0;
    const surge = phase > 0 ? Math.sin(Math.min(1, phase) * Math.PI) : 0;
    const driftX = Math.sin(t * 1.45) * 0.02;
    const driftY = Math.cos(t * 1.15) * 0.018;
    const rollWave = Math.sin(t * 1.8) * 0.05;

    m.group.position.set(
      0.42 - surge * 0.16 + driftX * 0.6,
      -0.5 + driftY * 0.6 + surge * 0.08,
      -0.82 - surge * 0.1,
    );
    m.group.rotation.set(
      0.12 - surge * 0.12 + rollWave * 0.25,
      -0.25 + surge * 0.18,
      -0.16 - surge * 0.08 + rollWave * 0.45,
    );

    if (m.glbModel) {
      const pulse = 1 + Math.sin(t * 2.1) * 0.06;
      const stretch = 1 + surge * (0.9 + mod.swirl);
      const flatten = 0.8 - surge * 0.28;
      const widen = 1 + surge * 0.45;
      m.glbModel.scale.set(
        m.glbBaseScale.x * pulse * stretch,
        m.glbBaseScale.y * pulse * Math.max(0.35, flatten),
        m.glbBaseScale.z * pulse * widen,
      );
    }

    m.group.visible = gameState.mode === 'playing';
  }

  _updateFlameEmperorBurn(m, t) {
    const count = m.burnParticles.length;
    for (let i = 0; i < count; i++) {
      const p = m.burnParticles[i];
      const s = p.seed;
      const idx = i / count;

      // Layer 1 (0-7): orbiting embers that circle and rise
      // Layer 2 (8-11): flickering sparks that jump around
      // Layer 3 (12-15): rising wisps that drift upward

      if (i < 8) {
        // Orbiting embers — circle the fireball at varying heights and speeds
        const orbitSpeed = 2.5 + idx * 1.5;
        const angle = s + t * orbitSpeed;
        const radius = 0.06 + Math.sin(t * 3 + s) * 0.02;
        const riseOffset = ((t * 0.8 + idx * 2.0) % 1.0) * 0.12 - 0.04;
        const x = Math.cos(angle) * radius;
        const y = riseOffset + Math.sin(angle * 1.3) * 0.02;
        const z = Math.sin(angle) * radius - 0.02;

        p.mesh.position.set(x, y, z);
        p.mesh.rotation.set(t * 4 + s, t * 3 + s * 2, t * 5);

        // Pulse opacity
        const flickerBase = 0.4 + Math.sin(t * 8 + s * 5) * 0.2;
        const brightPulse = Math.sin(t * 3 + s * 3) > 0.7 ? 0.3 : 0;
        p.mat.opacity = flickerBase + brightPulse;
        p.mesh.visible = true;

        // Cycle colors for shimmer
        if (Math.sin(t * 6 + s * 4) > 0.5) {
          p.mat.color.setHex(0xffdd44);
        } else if (Math.sin(t * 4 + s * 7) > 0.3) {
          p.mat.color.setHex(0xff6b35);
        } else {
          p.mat.color.setHex(0xff4400);
        }
      } else if (i < 12) {
        // Flickering sparks — snap to random positions near the fireball
        const flickerOn = Math.sin(t * 15 + s * 8) > 0.2;
        if (!flickerOn) {
          p.mesh.visible = false;
          p.mat.opacity = 0;
          continue;
        }
        const sparkAngle = s + t * 5;
        const sparkR = 0.04 + Math.random() * 0.04;
        p.mesh.position.set(
          Math.cos(sparkAngle) * sparkR + (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.3) * 0.08,
          Math.sin(sparkAngle) * sparkR + (Math.random() - 0.5) * 0.02,
        );
        p.mesh.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI,
        );
        p.mat.opacity = 0.6 + Math.random() * 0.3;
        p.mat.color.setHex(0xffdd44);
        p.mesh.visible = true;
      } else {
        // Rising wisps — drift upward and fade, then reset
        const wispCycle = ((t * 0.6 + idx * 3.0) % 1.5);
        const wispProgress = wispCycle / 1.5;
        const wispX = Math.sin(s * 3 + t * 1.5) * 0.04;
        const wispY = wispCycle * 0.15 - 0.02;
        const wispZ = Math.cos(s * 2 + t * 1.2) * 0.03;

        p.mesh.position.set(wispX, wispY, wispZ);
        p.mesh.rotation.set(0, 0, t * 3 + s);

        // Fade in then out
        const fadeIn = Math.min(1, wispProgress * 4);
        const fadeOut = Math.max(0, 1 - (wispProgress - 0.5) / 0.5);
        p.mat.opacity = fadeIn * fadeOut * 0.5;
        p.mat.color.setHex(wispProgress > 0.6 ? 0xff6b35 : 0xffaa00);
        p.mesh.visible = p.mat.opacity > 0.01;
      }
    }
  }

  // ── Laser Sabre: GLB sword with continuous glow effect ──

  _buildLaserSabre() {
    const group = new THREE.Group();
    group.visible = false;
    this.scene.heldItemPivot.add(group);

    // Continuous glow particles along the blade
    const glowGroup = new THREE.Group();
    glowGroup.renderOrder = 55;
    group.add(glowGroup);
    const glowParticles = [];
    const glowCount = 20;
    const glowColors = [0x00ffff, 0x44ddff, 0x88eeff, 0xaaffff, 0x00ccff];
    for (let i = 0; i < glowCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: glowColors[i % glowColors.length],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      const sz = 0.012 + Math.random() * 0.012;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mat);
      mesh.visible = false;
      mesh.renderOrder = 55;
      glowGroup.add(mesh);
      glowParticles.push({ mesh, mat, seed: Math.random() * Math.PI * 2 });
    }

    // Core blade glow (additive overlay)
    const bladeGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const bladeGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.5, 0.03),
      bladeGlowMat,
    );
    bladeGlow.renderOrder = 54;
    bladeGlow.position.set(0, 0.3, 0);
    group.add(bladeGlow);

    // Light shockwave ring — expands outward on each swing
    const shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0xfff4a0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const shockwave = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.15, 24),
      shockwaveMat,
    );
    shockwave.renderOrder = 56;
    shockwave.visible = false;
    group.add(shockwave);

    this.models.laser_sabre = {
      group,
      glbModel: null,
      glbLoaded: false,
      glbBaseScale: new THREE.Vector3(1, 1, 1),
      idleTime: 0,
      glowGroup,
      glowParticles,
      bladeGlow,
      bladeGlowMat,
      mixer: null,
      shockwave,
      shockwaveMat,
      wasSwinging: false,
    };

    const loader = new GLTFLoader();
    loader.load('assets/weapons/laser_sabre.glb', (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = 28.0 / maxDim;
      model.scale.set(s, s, s);
      // Anchor at the bottom of the model (handle) so it pivots from grip
      const center = box.getCenter(new THREE.Vector3());
      const bottom = box.min.y;
      model.position.set(-center.x * s, -bottom * s, -center.z * s);

      // Rotate so blade points upward: flip on X so tip goes up
      model.rotation.x = Math.PI;

      // Ensure GLB renders on top of the world (no ground clipping)
      model.traverse((child) => {
        if (child.isMesh) {
          child.renderOrder = 50;
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((mt) => { mt.depthTest = false; });
          }
        }
      });

      group.add(model);
      this.models.laser_sabre.glbModel = model;
      this.models.laser_sabre.glbBaseScale.copy(model.scale);
      this.models.laser_sabre.glbLoaded = true;

      // Set up AnimationMixer to loop all embedded GLB animations
      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) {
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
        }
        this.models.laser_sabre.mixer = mixer;
      }
    });
  }

  _animateLaserSabre(combat, swingMs, mod, gameState) {
    const m = this.models.laser_sabre;
    if (!m) return;

    m.idleTime += 0.016;
    const t = m.idleTime;

    // Tick GLB animation mixer (looping effect animations)
    if (m.mixer) m.mixer.update(0.016);

    const phase = combat.swordSwingTime > 0 ? 1 - combat.swordSwingTime / swingMs : 0;

    // ── Held in right hand, blade pointing straight up, swings forward ──
    const windup = THREE.MathUtils.smoothstep(phase, 0, 0.25);
    const release = THREE.MathUtils.smoothstep(phase, 0.2, 0.6);
    const recover = THREE.MathUtils.smoothstep(phase, 0.65, 1);
    const swing = release - recover * 0.9;

    // Rest: far right, flat side angled toward camera, hilt visible.
    // Swing: tips blade forward.
    m.group.position.set(
      1.2 - swing * 0.2,
      -0.5 + windup * 0.15 - swing * 0.3,
      THREE.MathUtils.lerp(-0.6, -1.1, swing),
    );
    m.group.rotation.set(
      THREE.MathUtils.lerp(0.1, -1.5, swing) + windup * 0.3,
      THREE.MathUtils.lerp(-0.5, -0.4, swing),
      THREE.MathUtils.lerp(0.15, 0, swing),
    );

    // ── Idle sway when not swinging ──
    if (phase === 0) {
      const swayX = Math.sin(t * 1.6) * 0.012;
      const swayY = Math.cos(t * 1.2) * 0.015;
      const swayRot = Math.sin(t * 1.0) * 0.025;
      m.group.position.x += swayX;
      m.group.position.y += swayY;
      m.group.rotation.z += swayRot * 0.5;
    }

    // ── Blade core glow: continuous pulsing ──
    const pulseAlpha = 0.2 + Math.sin(t * 3.5) * 0.1;
    const attackBoost = phase > 0 ? (1 - phase) * 0.4 : 0;
    m.bladeGlowMat.opacity = pulseAlpha + attackBoost;
    const pulseScale = 1 + Math.sin(t * 4.0) * 0.15;
    m.bladeGlow.scale.set(pulseScale, 1, pulseScale);

    // ── Continuous glow particles along the blade ──
    this._updateLaserSabreGlow(m, t, phase);

    // ── Light shockwave on each swing ──
    const isSwinging = phase > 0;
    if (isSwinging && !m.wasSwinging) {
      // New swing started — reset shockwave
      m.shockwaveTime = 0;
    }
    m.wasSwinging = isSwinging;

    if (m.shockwaveTime !== undefined && m.shockwaveTime < 0.5) {
      m.shockwaveTime += 0.016;
      const st = m.shockwaveTime / 0.5; // 0→1 over 0.5s
      const scale = 0.5 + st * 3.0; // expand outward
      m.shockwave.scale.setScalar(scale);
      m.shockwave.position.set(0, 0.3, -0.1);
      m.shockwave.rotation.set(0, 0, t * 2);
      // Bright flash that fades out
      m.shockwaveMat.opacity = (1 - st) * 0.7;
      m.shockwaveMat.color.setHex(st < 0.3 ? 0xffffff : 0xfff4a0);
      m.shockwave.visible = true;
    } else {
      m.shockwave.visible = false;
      m.shockwaveMat.opacity = 0;
    }

    m.group.visible = gameState.mode === 'playing';
  }

  _updateLaserSabreGlow(m, t, phase) {
    const count = m.glowParticles.length;
    const attackIntensity = phase > 0 ? Math.sin(phase * Math.PI) : 0;

    for (let i = 0; i < count; i++) {
      const p = m.glowParticles[i];
      const s = p.seed;
      const idx = i / count;

      if (i < 10) {
        // Layer 1: particles drifting along the blade length
        const bladePos = ((t * 0.5 + idx * 2.0) % 1.0);
        const y = bladePos * 0.5 + 0.05;
        const orbitAngle = s + t * 3.0;
        const radius = 0.025 + Math.sin(t * 4 + s) * 0.01;
        const x = Math.cos(orbitAngle) * radius;
        const z = Math.sin(orbitAngle) * radius;

        p.mesh.position.set(x, y, z);
        p.mesh.rotation.set(t * 3 + s, t * 2, t * 4 + s);

        const fadeEdge = Math.sin(bladePos * Math.PI);
        const flicker = 0.3 + Math.sin(t * 7 + s * 5) * 0.15;
        p.mat.opacity = (flicker + attackIntensity * 0.3) * fadeEdge;
        p.mesh.visible = p.mat.opacity > 0.01;

        if (Math.sin(t * 5 + s * 3) > 0.4) {
          p.mat.color.setHex(0x88eeff);
        } else {
          p.mat.color.setHex(0x00ffff);
        }
      } else if (i < 15) {
        // Layer 2: sparking flickers
        const flickerOn = Math.sin(t * 12 + s * 6) > 0.3;
        if (!flickerOn) {
          p.mesh.visible = false;
          p.mat.opacity = 0;
          continue;
        }
        const sparkY = 0.1 + Math.random() * 0.4;
        const sparkR = 0.02 + Math.random() * 0.03;
        const sparkAngle = s + t * 6;
        p.mesh.position.set(
          Math.cos(sparkAngle) * sparkR,
          sparkY,
          Math.sin(sparkAngle) * sparkR,
        );
        p.mat.opacity = 0.5 + Math.random() * 0.4;
        p.mat.color.setHex(0xaaffff);
        p.mesh.visible = true;
      } else {
        // Layer 3: wisps that detach upward from the blade tip
        const wispCycle = ((t * 0.7 + idx * 3.0) % 1.2);
        const wispProgress = wispCycle / 1.2;
        const wispX = Math.sin(s * 3 + t * 1.8) * 0.03;
        const wispY = 0.55 + wispCycle * 0.12;
        const wispZ = Math.cos(s * 2 + t * 1.5) * 0.025;

        p.mesh.position.set(wispX, wispY, wispZ);
        p.mesh.rotation.set(0, 0, t * 2.5 + s);

        const fadeIn = Math.min(1, wispProgress * 3);
        const fadeOut = Math.max(0, 1 - (wispProgress - 0.4) / 0.6);
        p.mat.opacity = fadeIn * fadeOut * 0.45;
        p.mat.color.setHex(wispProgress > 0.5 ? 0x44ddff : 0x00ffff);
        p.mesh.visible = p.mat.opacity > 0.01;
      }
    }
  }

  // ── Light Beam: GLB spear held in hand, thrown as projectile ──

  _buildLightBeam() {
    const group = new THREE.Group();
    group.visible = false;
    group.renderOrder = 80;
    this.scene.heldItemPivot.add(group);

    const heldVisual = new THREE.Group();
    heldVisual.renderOrder = 80;
    group.add(heldVisual);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xf8d84a,
      depthTest: false,
      depthWrite: false,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffef9b,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });

    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 1.7),
      beamMat,
    );
    shaft.position.z = -0.88;
    shaft.renderOrder = 80;
    heldVisual.add(shaft);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.34, 6),
      beamMat,
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -1.86;
    tip.renderOrder = 80;
    heldVisual.add(tip);

    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 1.95),
      glowMat,
    );
    glow.position.z = -0.98;
    glow.renderOrder = 81;
    heldVisual.add(glow);

    this.models.light_beam = {
      group,
      heldVisual,
      glow,
      glowMat,
      glbModel: null,
      glbLoaded: false,
      glbBaseScale: new THREE.Vector3(1, 1, 1),
      idleTime: 0,
      mixer: null,
    };

    const loader = new GLTFLoader();
    loader.load(assetUrl('assets/weapons/light_beam.glb'), (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = 2.8 / maxDim;
      model.scale.set(s, s, s);
      const center = box.getCenter(new THREE.Vector3());
      const bottom = box.min.y;
      model.position.set(-center.x * s, -bottom * s, -center.z * s + 0.02);

      // Point the spear tip forward (-Z in camera space)
      // Model tip points along -Y; rotate +90° X so tip faces -Z (forward)
      model.rotation.x = Math.PI / 2;

      this.models.light_beam.glbModel = model;
      this.models.light_beam.glbBaseScale.copy(model.scale);
      this.models.light_beam.glbLoaded = true;

      // Loop embedded animations
      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) {
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
        }
        this.models.light_beam.mixer = mixer;
      }
    });
  }

  _animateLightBeam(combat, swingMs, mod, gameState) {
    const m = this.models.light_beam;
    if (!m) return;

    m.idleTime += 0.016;
    const t = m.idleTime;
    if (m.mixer) m.mixer.update(0.016);

    const phase = combat.punchTime > 0 ? 1 - combat.punchTime / swingMs : 0;

    // Throw animation: wind up by the shoulder, then spear-thrust toward center
    const windup = THREE.MathUtils.smoothstep(phase, 0, 0.3);
    const thrust = THREE.MathUtils.smoothstep(phase, 0.25, 0.6);
    const recover = THREE.MathUtils.smoothstep(phase, 0.6, 1);
    const throw_ = thrust - recover * 0.9;

    // Rest: lower-right diagonal spear pose.
    // Throw: pull back slightly, then drive the tip toward the crosshair.
    m.group.position.set(
      THREE.MathUtils.lerp(0.92, 0.54, throw_) + windup * 0.04,
      THREE.MathUtils.lerp(-0.42, -0.24, throw_) + windup * 0.08 - throw_ * 0.04,
      THREE.MathUtils.lerp(-0.24, -0.88, throw_) + windup * 0.08,
    );
    m.group.rotation.set(
      THREE.MathUtils.lerp(0.34, 0.08, throw_) + windup * 0.04,
      THREE.MathUtils.lerp(-0.12, 0.02, throw_),
      THREE.MathUtils.lerp(-1.02, -0.46, throw_),
    );

    if (m.glowMat) {
      m.glowMat.opacity = 0.32 + Math.sin(t * 3.4) * 0.1 + (1 - throw_) * 0.06;
    }
    if (m.glow) {
      const pulse = 1 + Math.sin(t * 4.2) * 0.06;
      m.glow.scale.set(1.05 + pulse * 0.08, 1.05 + pulse * 0.08, pulse);
    }

    // Idle sway
    if (phase === 0) {
      m.group.position.x += Math.sin(t * 1.4) * 0.01;
      m.group.position.y += Math.cos(t * 1.1) * 0.012;
    }

    // Hide briefly at end of throw (spear is "released")
    if (phase > 0.55 && phase < 0.9) {
      m.group.visible = false;
    } else {
      m.group.visible = gameState.mode === 'playing';
    }
  }

  _buildDirtSkill() {
    const group = new THREE.Group();
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      this.blockMaterials.get('dirt'),
    );
    group.add(cube);
    group.visible = false;
    this.scene.heldItemPivot.add(group);
    this.models.dirt = { group, cube };
  }
}
