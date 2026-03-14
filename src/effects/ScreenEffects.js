import { getAnimMod } from '../config/animStyles.js';
import { events } from '../core/EventBus.js';

/**
 * Manages screen-space visual effects: camera shake, flash overlay, and swing burst.
 * Extracted from WeaponModels for single-responsibility.
 */
export class ScreenEffects {
  constructor(sceneSetup) {
    this.scene = sceneSetup;

    // Screen shake
    this.shakeIntensity = 0;
    this.shakeDecay = 0.88;

    // Flash overlay
    this.flashOverlay = null;
    this.flashTime = 0;
    this.flashDuration = 0.12;
    this.flashColor = 'white';
    this.flashMaxAlpha = 0;

    // Swing burst / after-image
    this.burstTime = 0;
    this.burstDuration = 0.22;
    this.burstColor = 'white';
    this.burstStrength = 0;
  }

  init() {
    this._createFlashOverlay();
    events.on('combat:fruit-attack', ({ animStyle, color }) => {
      this.triggerAttack(animStyle, color);
    });
  }

  triggerAttack(animStyle, color) {
    const mod = getAnimMod(animStyle);
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

  update(dt) {
    this._updateShake();
    this._updateFlash(dt);
    this._updateBurst(dt);
  }

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
}
