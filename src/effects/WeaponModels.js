import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../config/assets.js';
import {
  SWORD_SWING_MS, PUNCH_SWING_MS,
} from '../config/constants.js';
import { events } from '../core/EventBus.js';

/**
 * Per-fruit animation modifiers.
 * stretchMul  – how far the punch arm extends (1 = full rubber stretch)
 * fistScale   – fist grows on impact (1 = no change)
 * shake       – camera shake intensity on attack
 * flashAlpha  – screen flash opacity on attack
 * swordGlow   – emissive intensity for sword attacks
 * arcTilt     – extra swing arc intensity
 * swirl       – extra rotational swirl during attacks
 * trail       – after-image trail opacity
 */
const ANIM_MODS = {
  stretch:   { stretchMul: 1.0,  fistScale: 1.0, shake: 0,    flashAlpha: 0,    swordGlow: 0,   arcTilt: 1.0, swirl: 0.08, trail: 0.10 },
  fire:      { stretchMul: 0.7,  fistScale: 1.4, shake: 0.02, flashAlpha: 0.15, swordGlow: 0.4, arcTilt: 1.2, swirl: 0.18, trail: 0.24 },
  ice:       { stretchMul: 0.5,  fistScale: 1.2, shake: 0,    flashAlpha: 0.1,  swordGlow: 0.5, arcTilt: 0.9, swirl: 0.10, trail: 0.16 },
  lightning: { stretchMul: 0.3,  fistScale: 1.1, shake: 0.01, flashAlpha: 0.2,  swordGlow: 0.6, arcTilt: 1.4, swirl: 0.26, trail: 0.32 },
  dark:      { stretchMul: 0.6,  fistScale: 1.3, shake: 0,    flashAlpha: 0.12, swordGlow: 0.3, arcTilt: 0.8, swirl: 0.22, trail: 0.28 },
  light:     { stretchMul: 0.4,  fistScale: 1.0, shake: 0.01, flashAlpha: 0.25, swordGlow: 0.7, arcTilt: 1.5, swirl: 0.20, trail: 0.35 },
  quake:     { stretchMul: 0.5,  fistScale: 1.8, shake: 0.06, flashAlpha: 0.1,  swordGlow: 0.2, arcTilt: 0.7, swirl: 0.06, trail: 0.12 },
  magma:     { stretchMul: 0.6,  fistScale: 1.6, shake: 0.03, flashAlpha: 0.15, swordGlow: 0.4, arcTilt: 1.0, swirl: 0.12, trail: 0.22 },
  sand:      { stretchMul: 0.8,  fistScale: 1.1, shake: 0,    flashAlpha: 0.08, swordGlow: 0.2, arcTilt: 0.95,swirl: 0.14, trail: 0.18 },
  bomb:      { stretchMul: 0.5,  fistScale: 1.5, shake: 0.05, flashAlpha: 0.3,  swordGlow: 0.3, arcTilt: 1.1, swirl: 0.16, trail: 0.30 },
};

const DEFAULT_MOD = { stretchMul: 1.0, fistScale: 1.0, shake: 0, flashAlpha: 0, swordGlow: 0, arcTilt: 1.0, swirl: 0.08, trail: 0.12 };

// Per-fruit VFX particle definitions
// count: number of particles, geo: geometry type, size: base scale,
// behavior: animation pattern, colors: [main, accent]
const FRUIT_VFX = {
  stretch: {
    count: 6, geo: 'box', size: 0.03,
    behavior: 'trail', colors: [0xffffff, 0xffcccc],
  },
  fire: {
    count: 10, geo: 'box', size: 0.045,
    behavior: 'rise', colors: [0xff6b35, 0xffdd44],
  },
  ice: {
    count: 8, geo: 'diamond', size: 0.04,
    behavior: 'orbit', colors: [0x88ddff, 0xffffff],
  },
  lightning: {
    count: 8, geo: 'bolt', size: 0.025,
    behavior: 'flicker', colors: [0xffee44, 0xffffff],
  },
  dark: {
    count: 8, geo: 'sphere', size: 0.04,
    behavior: 'vortex', colors: [0x6a3d99, 0x220044],
  },
  light: {
    count: 8, geo: 'plane', size: 0.05,
    behavior: 'radiate', colors: [0xffffa0, 0xffffff],
  },
  quake: {
    count: 10, geo: 'box', size: 0.05,
    behavior: 'shockwave', colors: [0xc0a030, 0xffdd66],
  },
  magma: {
    count: 8, geo: 'sphere', size: 0.05,
    behavior: 'drip', colors: [0xcc3300, 0xff8800],
  },
  sand: {
    count: 10, geo: 'box', size: 0.03,
    behavior: 'swirl', colors: [0xd4a843, 0xeedd88],
  },
  bomb: {
    count: 10, geo: 'box', size: 0.04,
    behavior: 'explode', colors: [0xff4444, 0xffaa22],
  },
};

/**
 * Builds and animates held weapon/skill 3D models in first person.
 * Supports per-fruit color tinting, animation modifiers, screen shake, and flash.
 * Includes per-fruit VFX particle system for distinct visual styles.
 *
 * Weapon types: sword, punch, cast, slam, uppercut, clap, dirt
 */
export class WeaponModels {
  constructor(sceneSetup, textureManager, blockMaterials) {
    this.scene = sceneSetup;
    this.textureManager = textureManager;
    this.blockMaterials = blockMaterials;
    this.models = {};

    // Screen shake state
    this.shakeIntensity = 0;
    this.shakeDecay = 0.88;

    // Attack flash overlay
    this.flashOverlay = null;
    this.flashTime = 0;
    this.flashDuration = 0.12;
    this.flashColor = 'white';
    this.flashMaxAlpha = 0;

    // Swing burst / after-image state
    this.burstTime = 0;
    this.burstDuration = 0.22;
    this.burstColor = 'white';
    this.burstStrength = 0;

    // Track active fruit for tint changes
    this._lastFruitId = null;

    // References set externally
    this._gameState = null;
    this._enemyMgr = null;
    this._particles = null;

    // Fruit VFX particle system
    this._vfxParticles = [];
    this._vfxGroup = null;
    this._vfxAnimStyle = null;
    this._vfxTime = 0;
  }

  setRefs(enemyManager, particles) {
    this._enemyMgr = enemyManager;
    this._particles = particles;
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
    this._buildFruitVFX();
    this._createFlashOverlay();

    // Listen for attack events to trigger effects
    events.on('combat:fruit-attack', ({ animStyle, color }) => {
      this._triggerAttackEffect(animStyle, color);
    });

    // Listen for fire fist projectile spawn
    events.on('combat:fire-fist-shoot', () => {
      if (this._gameState) this.spawnFireFistProjectile(this._gameState);
    });
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
    const mod = fruit ? (ANIM_MODS[fruit.animStyle] || DEFAULT_MOD) : DEFAULT_MOD;

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
    this._updateFruitVFX(dt, attackPhase, fruit, gameState);

    // Update screen shake
    this._updateShake();

    // Update flash overlay
    this._updateFlash(dt);

    // Update swing burst overlay
    this._updateBurst(dt);

    // Update cooldown HUD
    this._updateCooldownHUD(gameState);
  }

  // ── Sword animation with fruit modifiers ──

  _animateSword(combat, swingMs, mod, gameState) {
    const phase = combat.swordSwingTime > 0 ? 1 - combat.swordSwingTime / swingMs : 0;
    const windup = THREE.MathUtils.smoothstep(phase, 0, 0.28);
    const release = THREE.MathUtils.smoothstep(phase, 0.18, 0.78);
    const recover = THREE.MathUtils.smoothstep(phase, 0.78, 1);
    const slash = release - recover * 0.28;

    // Scale pulse on impact (fruit-specific)
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

    // Sword glow during swing
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

    // Fist grows on impact based on fruit
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

    // Palm pushes forward from lower-right
    m.group.position.set(
      0.52 - push * 0.36,
      -0.68 + charge * 0.12 + push * 0.22,
      -0.82 - push * 0.48,
    );

    // Palm rotates to face forward during cast
    const swirlWave = Math.sin(phase * Math.PI * 3.0) * mod.swirl * 0.6;
    m.group.rotation.set(
      0.3 - push * 0.5 + swirlWave,
      -0.4 + push * 0.2,
      -0.2 - charge * 0.15,
    );

    // Fingers spread open during charge
    const spread = charge * 0.18;
    m.fingers.forEach((f, i) => {
      const angle = (i - 1.5) * spread;
      f.rotation.set(-charge * 0.08, angle, 0);
    });

    // Orb pulses and grows during cast
    const orbScale = 0.12 + push * 0.22 * mod.fistScale;
    const orbGlow = phase > 0 ? (1 - phase) * 0.7 : 0.15;
    m.orb.scale.setScalar(orbScale);
    m.orb.material.opacity = orbGlow;
    m.orb.position.set(0, 0.02, -0.52 - push * 0.3);

    // Orb ring spins
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

    // Fist raises up during windup, then slams down
    const yOffset = windup * 0.6 - smash * 1.1 + recover * 0.5;
    const zOffset = -smash * 0.3 + recover * 0.15;

    m.group.position.set(
      0.3 - smash * 0.2,
      -0.4 + yOffset,
      -0.9 + zOffset,
    );

    // Rotate: tilts back during windup, forward during slam
    const tiltX = -windup * 0.6 + smash * 1.4 - recover * 0.8;
    const shake = phase > 0.4 && phase < 0.6
      ? Math.sin(phase * Math.PI * 12) * mod.shake * 8
      : 0;
    m.group.rotation.set(
      tiltX + shake,
      -0.15,
      -0.1 + smash * 0.08,
    );

    // Fist scales up on impact
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

    // Fist drops low then sweeps upward
    const yOffset = -crouch * 0.4 + swing * 1.0 - recover * 0.6;
    const zOffset = -swing * 0.35 + recover * 0.2;

    m.group.position.set(
      0.6 - swing * 0.25,
      -0.9 + yOffset,
      -0.85 + zOffset,
    );

    // Arm rotates through the uppercut arc
    const arcAngle = -crouch * 0.3 + swing * 1.2 - recover * 0.9;
    const swirlWave = Math.sin(phase * Math.PI * 3.5) * mod.swirl * 0.8;
    m.group.rotation.set(
      arcAngle + swirlWave,
      -0.4 + swing * 0.15,
      -0.3 + swing * 0.2 - recover * 0.1,
    );

    // Fist scales on impact
    const impactBoost = phase > 0.3 && phase < 0.55
      ? Math.sin((phase - 0.3) / 0.25 * Math.PI) * (mod.fistScale - 1) * 0.5
      : 0;
    m.fist.scale.setScalar(1 + impactBoost);

    // Arm stretches slightly
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

    // Both fists spread apart then clap together and push forward
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

    // Group position
    m.group.position.set(
      0.15,
      -0.65 + thrust * 0.12,
      -0.7 - thrust * 0.3,
    );

    // Rotation — hands tilt inward to meet
    const tiltAngle = converge * 0.3 - recover * 0.15;
    m.leftFist.rotation.set(0, tiltAngle, converge * 0.2);
    m.rightFist.rotation.set(0, -tiltAngle, -converge * 0.2);

    m.group.rotation.set(
      0.2 - thrust * 0.15,
      -0.1,
      0,
    );

    // Impact flash: both fists scale up on converge
    const impactBoost = phase > 0.35 && phase < 0.55
      ? Math.sin((phase - 0.35) / 0.2 * Math.PI) * (mod.fistScale - 1) * 0.7
      : 0;
    m.leftFist.scale.setScalar(1 + impactBoost);
    m.rightFist.scale.setScalar(1 + impactBoost);

    // Energy burst between fists on impact
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
    // Force VFX reconfiguration on fruit change
    this._vfxAnimStyle = null;

    if (fruit) {
      const c = new THREE.Color(fruit.color);
      // Tint punch fist with fruit color
      this.models.punch.fist.material.color.copy(c);
      this.models.punch.arm.material.color.copy(
        new THREE.Color(0xd59a72).lerp(c, 0.4),
      );
      this.models.punch.cuff.material.color.copy(
        new THREE.Color(0xc6452d).lerp(c, 0.5),
      );

      // Tint cast hand + orb
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

      // Tint slam fist
      this.models.slam.fist.material.color.copy(c);
      this.models.slam.arm.material.color.copy(
        new THREE.Color(0xd59a72).lerp(c, 0.4),
      );

      // Tint uppercut fist
      this.models.uppercut.fist.material.color.copy(c);
      this.models.uppercut.arm.material.color.copy(
        new THREE.Color(0xd59a72).lerp(c, 0.4),
      );

      // Tint clap fists
      this.models.clap.leftMat.color.copy(c);
      this.models.clap.rightMat.color.copy(c);
      if (this.models.clap.energyBurst) {
        this.models.clap.energyBurst.material.color.copy(c);
      }

      // Update sword glow color
      if (this.models.sword.glowMesh) {
        this.models.sword.glowMesh.material.color.copy(c);
      }
    } else {
      // Reset to default skin colors
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

  // ── Attack effect triggers ──

  _triggerAttackEffect(animStyle, color) {
    const mod = ANIM_MODS[animStyle] || DEFAULT_MOD;
    if (mod.shake > 0) {
      this.shakeIntensity = mod.shake;
    }
    if (mod.flashAlpha > 0) {
      this.flashTime = this.flashDuration;
      this.flashColor = color;
      this.flashMaxAlpha = mod.flashAlpha;
    }
    this.burstTime = this.burstDuration;
    this.burstColor = color;
    this.burstStrength = mod.trail;
  }

  // ── Screen shake ──

  _updateShake() {
    if (this.shakeIntensity > 0.001) {
      const ox = (Math.random() - 0.5) * this.shakeIntensity * 2;
      const oy = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.scene.heldItemPivot.position.set(ox, oy, 0);
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this.shakeIntensity = 0;
      this.scene.heldItemPivot.position.set(0, 0, 0);
    }
  }

  // ── Screen flash overlay ──

  _createFlashOverlay() {
    const el = document.createElement('div');
    el.className = 'attack-flash-overlay';
    document.querySelector('.shell').appendChild(el);
    this.flashOverlay = el;
  }

  _updateFlash(dt) {
    if (this.flashTime > 0) {
      this.flashTime = Math.max(0, this.flashTime - dt);
      const t = this.flashTime / this.flashDuration;
      const alpha = t * this.flashMaxAlpha;
      this.flashOverlay.style.background = this.flashColor;
      this.flashOverlay.style.opacity = String(alpha);
    } else if (this.flashOverlay) {
      this.flashOverlay.style.opacity = '0';
    }
  }


  _updateBurst(dt) {
    if (!this.flashOverlay) return;
    if (this.burstTime <= 0) {
      this.flashOverlay.style.setProperty('--burst', '0');
      return;
    }

    this.burstTime = Math.max(0, this.burstTime - dt);
    const t = this.burstTime / this.burstDuration;
    const eased = t * t * (3 - 2 * t);
    const burstAlpha = this.burstStrength * eased;
    this.flashOverlay.style.setProperty('--burst', burstAlpha.toFixed(3));
    this.flashOverlay.style.setProperty('--burst-color', this.burstColor);
  }

  // ── Cooldown HUD overlay ──

  _updateCooldownHUD(gameState) {
    const cd = gameState.combat.cooldown;
    const skill = gameState.getSelectedSkill();
    const maxCd = skill.cooldownMs || 300;
    const ratio = cd > 0 ? cd / maxCd : 0;

    const items = document.querySelectorAll('.hotbar-item');
    items.forEach((item, i) => {
      let overlay = item.querySelector('.cooldown-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'cooldown-overlay';
        item.appendChild(overlay);
      }
      // Show cooldown on all slots (shared global CD)
      if (ratio > 0 && i === gameState.selectedIndex) {
        overlay.style.height = `${ratio * 100}%`;
        overlay.style.opacity = '1';
      } else {
        overlay.style.height = '0%';
        overlay.style.opacity = '0';
      }
    });
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

    // Glow overlay for fruit sword attacks
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

    // Open palm (flat box)
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.22), palmMat);
    palm.position.set(0, 0, -0.3);
    group.add(palm);

    // Four fingers (thin boxes extending from palm)
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const fingerMat = new THREE.MeshLambertMaterial({ color: 0xefb48f });
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.16), fingerMat);
      finger.position.set(-0.08 + i * 0.053, 0.01, -0.5);
      group.add(finger);
      fingers.push(finger);
    }

    // Thumb
    const thumbMat = new THREE.MeshLambertMaterial({ color: 0xefb48f });
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.1), thumbMat);
    thumb.position.set(-0.14, 0.01, -0.34);
    thumb.rotation.y = 0.5;
    group.add(thumb);

    // Wrist / sleeve
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xc6452d });
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.18), sleeveMat);
    sleeve.position.set(0, -0.04, -0.12);
    group.add(sleeve);

    // Magic orb floating in front of palm
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

    // Orbit ring around orb
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

    // Larger fist for slam
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), fistMat);
    fist.position.set(0, 0, -0.7);

    // Thick arm
    const armGeo = new THREE.BoxGeometry(0.2, 0.2, 0.6);
    armGeo.translate(0, 0, -0.3);
    const arm = new THREE.Mesh(armGeo, armMat);

    // Sleeve
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.2), sleeveMat);
    sleeve.position.set(0, 0, -0.04);

    // Knuckle ridges for emphasis
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

    // Fist angled upward
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), fistMat);
    fist.position.set(0, 0.05, -0.78);

    // Forearm
    const armGeo = new THREE.BoxGeometry(0.17, 0.17, 0.7);
    armGeo.translate(0, 0, -0.35);
    const arm = new THREE.Mesh(armGeo, armMat);

    // Sleeve
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

    // Left fist
    const leftFist = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), leftMat);
    leftFist.position.set(-0.18, 0, -0.4);

    // Right fist
    const rightFist = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), rightMat);
    rightFist.position.set(0.18, 0, -0.4);

    // Left arm
    const leftArmMat = new THREE.MeshLambertMaterial({ color: 0xd59a72 });
    const leftArmGeo = new THREE.BoxGeometry(0.14, 0.14, 0.35);
    leftArmGeo.translate(0, 0, -0.18);
    const leftArm = new THREE.Mesh(leftArmGeo, leftArmMat);
    leftArm.position.set(-0.22, 0, 0);

    // Right arm
    const rightArmMat = new THREE.MeshLambertMaterial({ color: 0xd59a72 });
    const rightArmGeo = new THREE.BoxGeometry(0.14, 0.14, 0.35);
    rightArmGeo.translate(0, 0, -0.18);
    const rightArm = new THREE.Mesh(rightArmGeo, rightArmMat);
    rightArm.position.set(0.22, 0, 0);

    // Sleeves
    const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.14), sleeveMat);
    leftSleeve.position.set(-0.22, 0, 0.12);
    const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.14), sleeveMat);
    rightSleeve.position.set(0.22, 0, 0.12);

    // Energy burst sphere between fists on clap impact
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

  // ── Fire Fist: GLB projectile that shoots forward like an arrow ──

  _buildFireFist() {
    // First-person held model (visible in camera space)
    const group = new THREE.Group();
    group.visible = false;
    this.scene.heldItemPivot.add(group);

    this.models.fire_fist = {
      group,
      glbModel: null,
      glbLoaded: false,
      glbBaseScale: new THREE.Vector3(1, 1, 1),
      idleTime: 0,
      // World-space projectiles
      projectiles: [],
      projectileTemplate: null,
    };

    // Load the GLB model
    const loader = new GLTFLoader();
    loader.load('assets/firstperson/skills/firefruit/fire_fist.glb', (gltf) => {
      const model = gltf.scene;
      // Auto-scale to fit weapon view
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
      // Keep a reference for cloning projectiles
      this.models.fire_fist.projectileTemplate = model;
    });
  }

  _animateFireFist(combat, swingMs, mod, gameState) {
    const m = this.models.fire_fist;
    if (!m) return;

    const onCooldown = combat.cooldown > 0;
    m.idleTime += 0.016;
    const t = m.idleTime;

    // Hide the held model while on cooldown (fist was "shot")
    if (onCooldown) {
      m.group.visible = false;
    } else {
      // Idle: bottom-right with gentle wavering
      const waveX = Math.sin(t * 1.8) * 0.015;
      const waveY = Math.cos(t * 1.3) * 0.02;
      const waveRot = Math.sin(t * 1.1) * 0.03;
      m.group.position.set(0.55 + waveX, -0.55 + waveY, -0.7);
      m.group.rotation.set(0.15 + waveRot, -0.2, -0.15 + waveRot * 0.5);
      // Reset scale to base
      if (m.glbModel) m.glbModel.scale.copy(m.glbBaseScale);
      m.group.visible = gameState.mode === 'playing';
    }

    // Update world-space projectiles
    this._updateFireFistProjectiles(gameState);
  }

  /**
   * Called by Combat when fire_fist attack triggers.
   * Spawns a world-space projectile in the direction the player is looking.
   */
  spawnFireFistProjectile(gameState) {
    const m = this.models.fire_fist;
    if (!m || !m.glbLoaded) return;

    const player = gameState.player;
    // Direction from player yaw/pitch
    const dir = new THREE.Vector3(
      -Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch),
    ).normalize();

    // Spawn position: in front of the player
    const spawnPos = new THREE.Vector3(
      player.position.x + dir.x * 0.8,
      player.position.y + 1.4 + dir.y * 0.8,
      player.position.z + dir.z * 0.8,
    );

    // Clone the GLB model for the projectile
    const projModel = m.projectileTemplate.clone();
    // Make it a bit bigger in world space
    const ws = 1.8;
    projModel.scale.copy(m.glbBaseScale).multiplyScalar(ws);
    projModel.position.set(0, 0, 0);
    // Rotate to face the direction of travel
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const rotMatrix = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, up);
    quat.setFromRotationMatrix(rotMatrix);

    const projGroup = new THREE.Group();
    projGroup.position.copy(spawnPos);
    projGroup.quaternion.copy(quat);
    projGroup.add(projModel);
    this.scene.particleGroup.add(projGroup);

    // Fire trail particles attached to this projectile
    const trailParticles = [];
    for (let i = 0; i < 12; i++) {
      const tMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xff6b35 : 0xffdd44,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      });
      const tMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), tMat);
      tMesh.visible = false;
      tMesh.renderOrder = 56;
      this.scene.particleGroup.add(tMesh);
      trailParticles.push({
        mesh: tMesh, mat: tMat,
        vel: new THREE.Vector3(),
        life: 0, maxLife: 0,
      });
    }

    const skill = gameState.getSelectedSkill();
    const speed = 18;
    m.projectiles.push({
      group: projGroup,
      velocity: dir.clone().multiplyScalar(speed),
      origin: spawnPos.clone(),
      maxRange: skill.range + 2,
      age: 0,
      damage: (skill.damage ?? 2) * player.baseAttack,
      knockback: skill.knockback ?? 6.0,
      trailParticles,
      alive: true,
    });
  }

  _updateFireFistProjectiles(gameState) {
    const m = this.models.fire_fist;
    if (!m) return;
    const dt = 0.016;
    const enemies = this._enemyMgr;

    for (let i = m.projectiles.length - 1; i >= 0; i--) {
      const proj = m.projectiles[i];
      if (!proj.alive) continue;

      proj.age += dt;
      proj.group.position.addScaledVector(proj.velocity, dt);

      // Check distance traveled
      const dist = proj.group.position.distanceTo(proj.origin);

      // Check enemy collision
      let hit = false;
      if (enemies) {
        const alive = enemies.getAlive();
        for (const enemy of alive) {
          const d = proj.group.position.distanceTo(enemy.root.position);
          const hitRadius = 1.2 * (enemy.sizeMultiplier || 1);
          if (d < hitRadius) {
            // Deal damage
            const def = enemy.baseDefense || 0;
            const dmg = Math.max(1, proj.damage - def);
            enemy.health -= dmg;
            enemy.hitFlash = 1;

            // Knockback
            const away = new THREE.Vector3()
              .subVectors(enemy.root.position, proj.group.position)
              .normalize();
            enemy.knockback.copy(away.multiplyScalar(proj.knockback));
            enemy.knockbackTimer = 240;

            // Particles
            if (this._particles) {
              this._particles.spawn(enemy.root.position.clone(), 'orange', 16);
            }

            // Defeat check
            if (enemy.health <= 0) {
              enemies.defeat(enemy, { source: 'fire_fist' });
            }

            events.emit('sound:punch');
            events.emit('hud:update');
            hit = true;
            break;
          }
        }
      }

      // Remove if hit or out of range
      if (hit || dist > proj.maxRange) {
        proj.alive = false;
        this.scene.particleGroup.remove(proj.group);
        // Cleanup trail particles
        proj.trailParticles.forEach((tp) => {
          this.scene.particleGroup.remove(tp.mesh);
          tp.mat.dispose();
        });
        m.projectiles.splice(i, 1);
        continue;
      }

      // Spawn trail particles behind projectile
      proj.trailParticles.forEach((tp) => {
        if (tp.life <= 0 && Math.random() < 0.5) {
          tp.mesh.position.copy(proj.group.position);
          tp.mesh.position.x += (Math.random() - 0.5) * 0.2;
          tp.mesh.position.y += (Math.random() - 0.5) * 0.2;
          tp.mesh.position.z += (Math.random() - 0.5) * 0.2;
          tp.vel.set(
            (Math.random() - 0.5) * 1.2,
            (Math.random() - 0.2) * 1.5,
            (Math.random() - 0.5) * 1.2,
          );
          tp.life = 0.2 + Math.random() * 0.15;
          tp.maxLife = tp.life;
          tp.mat.color.setHex(Math.random() > 0.5 ? 0xff6b35 : 0xffdd44);
        }

        if (tp.life > 0) {
          tp.life -= dt;
          tp.mesh.position.addScaledVector(tp.vel, dt);
          tp.vel.y -= 1.5 * dt;
          const ratio = Math.max(0, tp.life / tp.maxLife);
          tp.mat.opacity = ratio * 0.8;
          tp.mesh.scale.setScalar(0.5 + ratio * 0.8);
          tp.mesh.rotation.x += dt * 5;
          tp.mesh.rotation.z += dt * 4;
          tp.mesh.visible = true;
        } else {
          tp.mesh.visible = false;
        }
      });
    }
  }


  // ── Fruit VFX particle system ──

  _buildFruitVFX() {
    this._vfxGroup = new THREE.Group();
    this._vfxGroup.renderOrder = 55;
    this.scene.heldItemPivot.add(this._vfxGroup);

    // Pre-allocate max particle pool (largest count across all fruits)
    const maxCount = 12;
    for (let i = 0; i < maxCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      mesh.visible = false;
      mesh.renderOrder = 55;
      this._vfxGroup.add(mesh);
      this._vfxParticles.push({
        mesh,
        mat,
        seed: Math.random() * Math.PI * 2,
        active: false,
      });
    }
  }

  _configureVFXForFruit(animStyle) {
    if (this._vfxAnimStyle === animStyle) return;
    this._vfxAnimStyle = animStyle;

    const cfg = FRUIT_VFX[animStyle];
    if (!cfg) {
      this._vfxParticles.forEach(p => { p.active = false; p.mesh.visible = false; });
      return;
    }

    this._vfxParticles.forEach((p, i) => {
      if (i < cfg.count) {
        p.active = true;
        p.seed = Math.random() * Math.PI * 2;

        // Set geometry based on type
        const oldGeo = p.mesh.geometry;
        switch (cfg.geo) {
          case 'sphere':
            p.mesh.geometry = new THREE.SphereGeometry(cfg.size, 6, 4);
            break;
          case 'diamond': {
            // Octahedron looks like a diamond/crystal
            p.mesh.geometry = new THREE.OctahedronGeometry(cfg.size);
            break;
          }
          case 'bolt': {
            // Thin stretched box for lightning bolt segments
            p.mesh.geometry = new THREE.BoxGeometry(cfg.size * 0.3, cfg.size * 0.3, cfg.size * 4);
            break;
          }
          case 'plane':
            p.mesh.geometry = new THREE.PlaneGeometry(cfg.size * 0.4, cfg.size * 3);
            break;
          default:
            p.mesh.geometry = new THREE.BoxGeometry(cfg.size, cfg.size, cfg.size);
        }
        oldGeo.dispose();

        // Alternate between main and accent colors
        const color = i % 2 === 0 ? cfg.colors[0] : cfg.colors[1];
        p.mat.color.setHex(color);
        p.mat.opacity = 0;
        p.mesh.visible = false;
      } else {
        p.active = false;
        p.mesh.visible = false;
        p.mat.opacity = 0;
      }
    });
  }

  _updateFruitVFX(dt, phase, fruit, gameState) {
    if (!fruit || gameState.mode !== 'playing') {
      this._vfxParticles.forEach(p => { p.mesh.visible = false; });
      this._vfxAnimStyle = null;
      return;
    }

    this._configureVFXForFruit(fruit.animStyle);
    this._vfxTime += dt;
    const t = this._vfxTime;
    const attacking = phase > 0;
    const cfg = FRUIT_VFX[fruit.animStyle];
    if (!cfg) return;

    // Base position near the active weapon
    const baseX = 0, baseY = 0, baseZ = -0.6;

    this._vfxParticles.forEach((p, i) => {
      if (!p.active) return;

      const s = p.seed;
      const idx = i / cfg.count;

      // Idle: gentle ambient motion; attacking: intense effect
      const intensity = attacking ? (0.5 + phase * 0.5) : 0.15;
      const alpha = attacking
        ? Math.min(1, phase * 3) * (1 - Math.max(0, phase - 0.7) / 0.3) * 0.85
        : 0.12 + Math.sin(t * 2 + s) * 0.08;

      let x = baseX, y = baseY, z = baseZ;
      let rx = 0, ry = 0, rz = 0;
      let sc = cfg.size;

      switch (cfg.behavior) {
        case 'rise': {
          // Fire: particles rise upward with flicker
          const riseSpeed = attacking ? 3.0 : 1.2;
          const wobble = Math.sin(t * 8 + s * 3) * 0.06;
          x += Math.sin(s * 6 + t * 2) * 0.12 * intensity;
          y += ((t * riseSpeed + idx) % 0.5) * intensity - 0.1;
          z += Math.cos(s * 4 + t) * 0.08;
          sc *= 0.6 + Math.sin(t * 12 + s) * 0.4;
          rx = wobble;
          rz = t * 3 + s;
          break;
        }
        case 'orbit': {
          // Ice: crystals orbit slowly around weapon, sparkling
          const angle = s + t * (attacking ? 2.5 : 0.8);
          const radius = 0.14 + idx * 0.08;
          x += Math.cos(angle) * radius;
          y += Math.sin(angle * 0.7) * radius * 0.6;
          z += Math.sin(angle) * radius * 0.5 - 0.1;
          rx = t * 0.5 + s;
          ry = t * 0.8;
          rz = t * 0.3 + s * 2;
          sc *= attacking ? 1.2 : 0.7;
          break;
        }
        case 'flicker': {
          // Lightning: bolts flicker at random positions
          const flickerOn = Math.sin(t * 20 + s * 10) > (attacking ? -0.3 : 0.5);
          if (!flickerOn) { p.mesh.visible = false; p.mat.opacity = 0; return; }
          const a2 = s + i * 0.8;
          x += Math.sin(a2) * 0.15 + (Math.random() - 0.5) * 0.04;
          y += Math.cos(a2 * 1.3) * 0.12 + (Math.random() - 0.5) * 0.03;
          z += Math.sin(a2 * 0.7) * 0.1 - 0.1;
          rx = Math.random() * Math.PI;
          ry = Math.random() * Math.PI;
          rz = Math.random() * Math.PI;
          sc *= attacking ? 1.5 : 0.8;
          break;
        }
        case 'vortex': {
          // Dark: particles spiral inward
          const vAngle = s + t * (attacking ? -3.0 : -1.0);
          const vRadius = (attacking ? 0.2 - phase * 0.1 : 0.15) + idx * 0.05;
          x += Math.cos(vAngle) * vRadius;
          y += Math.sin(vAngle * 1.2) * vRadius * 0.5;
          z += Math.sin(vAngle * 0.6) * vRadius * 0.4 - 0.1;
          sc *= 0.5 + (1 - idx) * 0.8;
          rx = t * 2;
          ry = vAngle;
          break;
        }
        case 'radiate': {
          // Light: thin rays extend outward from center
          const rayAngle = (i / cfg.count) * Math.PI * 2 + t * (attacking ? 1.5 : 0.3);
          const rayLen = attacking ? 0.18 + phase * 0.12 : 0.1;
          x += Math.cos(rayAngle) * rayLen;
          y += Math.sin(rayAngle) * rayLen;
          z += -0.05;
          // Rotate plane to point outward
          rz = rayAngle + Math.PI / 2;
          sc *= attacking ? 1.4 : 0.6;
          break;
        }
        case 'shockwave': {
          // Quake: ring expands outward on impact
          if (attacking && phase > 0.3) {
            const shockPhase = (phase - 0.3) / 0.7;
            const ringAngle = (i / cfg.count) * Math.PI * 2;
            const ringR = shockPhase * 0.35;
            x += Math.cos(ringAngle) * ringR;
            y += -0.2 + Math.sin(ringAngle) * ringR * 0.3;
            z += Math.sin(ringAngle) * ringR * 0.5;
            sc *= 1.5 - shockPhase;
          } else {
            // Idle: subtle ground tremor
            x += Math.sin(s + t * 4) * 0.04;
            y += -0.15 + Math.abs(Math.sin(t * 6 + s * 3)) * 0.03;
            z += Math.cos(s * 2 + t * 3) * 0.04;
            sc *= 0.5;
          }
          break;
        }
        case 'drip': {
          // Magma: blobs drip downward with glow
          const dripCycle = (t * (attacking ? 2.0 : 0.8) + idx * 1.5) % 1.5;
          x += Math.sin(s * 4) * 0.1;
          y += 0.1 - dripCycle * 0.3;
          z += Math.cos(s * 3) * 0.08 - 0.05;
          sc *= 0.7 + (1 - dripCycle / 1.5) * 0.6;
          // Glow pulsation
          p.mat.color.setHex(
            Math.sin(t * 4 + s) > 0 ? cfg.colors[0] : cfg.colors[1],
          );
          break;
        }
        case 'swirl': {
          // Sand: tornado-like spiral
          const sAngle = s + t * (attacking ? 4.0 : 1.5);
          const sHeight = ((t * 1.5 + idx) % 1.0) - 0.3;
          const sRadius = 0.08 + sHeight * 0.06;
          x += Math.cos(sAngle) * sRadius;
          y += sHeight * 0.3;
          z += Math.sin(sAngle) * sRadius - 0.1;
          rz = t * 5 + s;
          sc *= 0.5 + intensity * 0.6;
          break;
        }
        case 'explode': {
          // Bomb: sparks fly outward from center on attack
          if (attacking && phase > 0.2) {
            const expPhase = (phase - 0.2) / 0.8;
            const expAngle = s + (i / cfg.count) * Math.PI * 2;
            const expR = expPhase * 0.4;
            x += Math.cos(expAngle) * expR;
            y += Math.sin(expAngle * 1.3) * expR - expPhase * 0.15;
            z += Math.sin(expAngle * 0.8) * expR * 0.5;
            sc *= 1.2 - expPhase * 0.8;
            // Alternate spark colors rapidly
            p.mat.color.setHex(
              Math.sin(t * 15 + s) > 0 ? cfg.colors[0] : cfg.colors[1],
            );
          } else {
            // Idle: faint smolder
            x += Math.sin(s + t * 2) * 0.04;
            y += Math.cos(s * 2 + t * 3) * 0.03;
            z += -0.05;
            sc *= 0.3;
          }
          break;
        }
        case 'trail':
        default: {
          // Stretch/rubber: speed lines trailing behind the fist
          const trailOffset = idx * 0.12;
          x += 0.02 + trailOffset * 0.3;
          y += Math.sin(s + t * 3) * 0.03;
          z += 0.15 + trailOffset * (attacking ? 0.6 : 0.2);
          sc *= attacking ? (0.3 + (1 - idx) * 0.5) : 0.15;
          // Stretch into lines
          p.mesh.scale.set(sc * 0.3, sc * 0.3, sc * 3);
          p.mesh.position.set(x, y, z);
          p.mesh.rotation.set(0, 0, s);
          p.mat.opacity = alpha * 0.7;
          p.mesh.visible = alpha > 0.01;
          return; // skip default scale/position set below
        }
      }

      p.mesh.position.set(x, y, z);
      p.mesh.rotation.set(rx, ry, rz);
      p.mesh.scale.setScalar(sc);
      p.mat.opacity = alpha;
      p.mesh.visible = alpha > 0.01;
    });
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
