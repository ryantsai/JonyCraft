import { CONTROL_KEYS, LOOK_SPEED } from '../config/constants.js';
import { events } from '../core/EventBus.js';

/**
 * Manages keyboard, mouse, and pointer lock input.
 * Translates raw browser events into game actions.
 */
export class InputManager {
  constructor(gameState, canvas, combatSystem) {
    this.state = gameState;
    this.canvas = canvas;
    this.combat = combatSystem;
    this.inventory = null; // set via setInventory()
    this.keyState = new Set();
    this.virtualInput = { moveX: 0, moveZ: 0, lookX: 0, lookY: 0 };
    this.primaryHeld = false;
  }

  setInventory(inventory) {
    this.inventory = inventory;
  }

  init() {
    window.addEventListener('keydown', (event) => {
      if (CONTROL_KEYS.includes(event.code)) this.keyState.add(event.code);

      // Hotbar slots 1-0 (up to 10 slots)
      const digitMap = {
        Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4,
        Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Digit0: 9,
      };
      const slot = digitMap[event.code];
      if (slot !== undefined && slot < this.state.activeSkills.length) {
        this.state.selectedIndex = slot;
        events.emit('hotbar:rebuild');
      }

      // Toggle inventory panel with Tab or I
      if (event.code === 'Tab' || event.code === 'KeyI') {
        event.preventDefault();
        events.emit('inventory:toggle');
      }

      if (event.code === 'KeyF') this._toggleFullscreen();
      if (
        event.code === 'Enter' &&
        !this.state.started &&
        this.state.playStyle === 'singleplayer' &&
        document.querySelector('#singleplayer-screen')?.dataset.hidden !== 'true'
      ) {
        events.emit('game:enter');
      }
    });

    window.addEventListener('keyup', (event) => {
      this.keyState.delete(event.code);
    });

    window.addEventListener('wheel', (event) => {
      events.emit('hotbar:scroll', event.deltaY > 0 ? 1 : -1);
    });

    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.primaryHeld = false;
    });

    window.addEventListener('blur', () => {
      this.primaryHeld = false;
    });

    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== this.canvas || this.state.mode !== 'playing') return;
      this.state.player.yaw -= event.movementX * LOOK_SPEED;
      this.state.player.pitch = Math.max(-1.35, Math.min(1.35,
        this.state.player.pitch - event.movementY * LOOK_SPEED,
      ));
    });

    this.canvas.addEventListener('click', () => {
      if (!this.state.started) return;
      this.canvas.requestPointerLock?.();
    });

    this.canvas.addEventListener('mousedown', (event) => {
      if (this.state.mode !== 'playing') return;
      if (event.button === 0) {
        this.primaryHeld = true;
        this.triggerPrimaryAction();
      }
      const skill = this.state.getSelectedSkill();
      if (event.button === 2 && skill.kind === 'block') this.combat.handlePlace();
    });

    window.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  update() {
    if (this.state.mode !== 'playing' || !this.primaryHeld) return;
    const skill = this.state.getSelectedSkill();
    // Only auto-repeat for attack skills, not consumables
    if (skill?.kind === 'attack') this.triggerPrimaryAction();
  }

  triggerPrimaryAction() {
    const skill = this.state.getSelectedSkill();
    if (!skill) return;

    if (skill.kind === 'consumable') {
      if (this.inventory) this.inventory.useSelected();
      return;
    }

    if (skill.kind === 'attack') {
      this.combat.attack();
      return;
    }

    if (skill.kind === 'block') this.combat.handleBreak();
  }

  setPrimaryHeld(isHeld) {
    this.primaryHeld = isHeld;
  }

  _toggleFullscreen() {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    if (isFullscreen) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    } else {
      const doc = document.documentElement;
      (doc.requestFullscreen || doc.webkitRequestFullscreen)?.call(doc);
    }
  }
}
