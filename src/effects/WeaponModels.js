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

/**
 * Builds and animates held weapon/skill 3D models in first person.
 * Supports per-fruit color tinting and animation modifiers.
 *
 * Screen effects, projectiles, and cooldown HUD are handled by
 * ScreenEffects, ProjectileSystem, and CooldownHUD respectively.
 *
 * Weapon types: sword, punch, cast, slam, uppercut, clap, fire_fist, dirt
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
    } else if (wt === 'dirt') {
      this.models.dirt.group.position.set(0.58, -0.56, -0.72);
      this.models.dirt.group.rotation.set(0.22, 0.22, -0.3);
      this.models.dirt.group.visible = gameState.mode === 'playing';
    }

    // Update fruit-specific VFX particles
    const attackPhase = wt === 'sword'
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

  /** Returns the GLB template for projectile cloning (used by FireFistProjectileSpawner). */
  getFireFistTemplate() {
    const m = this.models.fire_fist;
    if (!m || !m.glbLoaded) return null;
    return { template: m.projectileTemplate || m.glbModel, baseScale: m.glbBaseScale };
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
