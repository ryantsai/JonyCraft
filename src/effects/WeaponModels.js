import * as THREE from 'three';
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
 */
const ANIM_MODS = {
  stretch:   { stretchMul: 1.0,  fistScale: 1.0, shake: 0,    flashAlpha: 0,    swordGlow: 0 },
  fire:      { stretchMul: 0.7,  fistScale: 1.4, shake: 0.02, flashAlpha: 0.15, swordGlow: 0.4 },
  ice:       { stretchMul: 0.5,  fistScale: 1.2, shake: 0,    flashAlpha: 0.1,  swordGlow: 0.5 },
  lightning: { stretchMul: 0.3,  fistScale: 1.1, shake: 0.01, flashAlpha: 0.2,  swordGlow: 0.6 },
  dark:      { stretchMul: 0.6,  fistScale: 1.3, shake: 0,    flashAlpha: 0.12, swordGlow: 0.3 },
  light:     { stretchMul: 0.4,  fistScale: 1.0, shake: 0.01, flashAlpha: 0.25, swordGlow: 0.7 },
  quake:     { stretchMul: 0.5,  fistScale: 1.8, shake: 0.06, flashAlpha: 0.1,  swordGlow: 0.2 },
  magma:     { stretchMul: 0.6,  fistScale: 1.6, shake: 0.03, flashAlpha: 0.15, swordGlow: 0.4 },
  sand:      { stretchMul: 0.8,  fistScale: 1.1, shake: 0,    flashAlpha: 0.08, swordGlow: 0.2 },
  bomb:      { stretchMul: 0.5,  fistScale: 1.5, shake: 0.05, flashAlpha: 0.3,  swordGlow: 0.3 },
};

const DEFAULT_MOD = { stretchMul: 1.0, fistScale: 1.0, shake: 0, flashAlpha: 0, swordGlow: 0 };

/**
 * Builds and animates held weapon/skill 3D models in first person.
 * Supports per-fruit color tinting, animation modifiers, screen shake, and flash.
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

    // Track active fruit for tint changes
    this._lastFruitId = null;
  }

  buildAll() {
    this._buildDiamondSword();
    this._buildRubberPunch();
    this._buildDirtSkill();
    this._createFlashOverlay();

    // Listen for attack events to trigger effects
    events.on('combat:fruit-attack', ({ animStyle, color }) => {
      this._triggerAttackEffect(animStyle, color);
    });
  }

  update(dt, gameState) {
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
    } else if (wt === 'dirt') {
      this.models.dirt.group.position.set(0.58, -0.56, -0.72);
      this.models.dirt.group.rotation.set(0.22, 0.22, -0.3);
      this.models.dirt.group.visible = gameState.mode === 'playing';
    }

    // Update screen shake
    this._updateShake();

    // Update flash overlay
    this._updateFlash(dt);

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
    this.models.sword.group.rotation.set(
      THREE.MathUtils.lerp(0.34, -0.88, slash) + windup * 0.1,
      THREE.MathUtils.lerp(-0.12, -0.28, slash),
      THREE.MathUtils.lerp(-1.18, -0.02, slash) - windup * 0.14,
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
    this.models.punch.group.rotation.set(
      0.56 - extend * 0.12 - windup * 0.1,
      -0.52 + extend * 0.18,
      -0.46 + extend * 0.08,
    );
    this.models.punch.armAnchor.rotation.set(-0.08 - extend * 0.05, 0.1 - extend * 0.06, 0.04);
    this.models.punch.forearmPivot.rotation.set(-0.06 + extend * 0.04, 0.02, 0);
    this.models.punch.group.visible = gameState.mode === 'playing';
  }

  // ── Fruit color tinting ──

  _updateFruitTint(gameState) {
    const fruit = gameState.selectedFruit;
    const fruitId = fruit?.id || null;
    if (fruitId === this._lastFruitId) return;
    this._lastFruitId = fruitId;

    if (fruit) {
      const c = new THREE.Color(fruit.color);
      // Tint fist with fruit color
      this.models.punch.fist.material.color.copy(c);
      // Blend arm color between fruit and skin tone
      this.models.punch.arm.material.color.copy(
        new THREE.Color(0xd59a72).lerp(c, 0.4),
      );
      // Tint the sleeve too
      this.models.punch.cuff.material.color.copy(
        new THREE.Color(0xc6452d).lerp(c, 0.5),
      );
      // Update sword glow color
      if (this.models.sword.glowMesh) {
        this.models.sword.glowMesh.material.color.copy(c);
      }
    } else {
      // Reset to default skin colors
      this.models.punch.fist.material.color.setHex(0xefb48f);
      this.models.punch.arm.material.color.setHex(0xd59a72);
      this.models.punch.cuff.material.color.setHex(0xc6452d);
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
