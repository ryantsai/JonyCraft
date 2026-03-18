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

      // Hotbar slots 1-9
      const digitMap = {
        Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4,
        Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8,
      };
      const slot = digitMap[event.code];
      if (slot !== undefined && slot < this.state.activeSkills.length) {
        this.state.selectedIndex = slot;
        events.emit('hotbar:rebuild');
      }

      // Hold Tab to open inventory
      if (event.code === 'Tab') {
        event.preventDefault();
        if (!this.state.inventoryOpen) {
          events.emit('inventory:open');
        }
      }

      // Interact with nearby NPC (merchant) — also closes shop if open
      if (event.code === 'KeyE') {
        if (this.state.shopOpen) {
          events.emit('merchant:close');
        } else {
          events.emit('merchant:interact');
        }
      }

      // Escape: close shop first, then toggle pause
      if (event.code === 'Escape') {
        if (this.state.shopOpen) {
          events.emit('merchant:close');
        } else if (this.state.mode === 'playing' || this.state.mode === 'paused') {
          events.emit('pause:toggle');
        }
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

      // Release Tab to close inventory
      if (event.code === 'Tab') {
        event.preventDefault();
        if (this.state.inventoryOpen) {
          events.emit('inventory:close');
        }
      }
    });

    // Scroll wheel skill switching removed — use number keys or tap instead

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
      if (!this.state.started || this.state.shopOpen || this.state.inventoryOpen) return;
      this.canvas.requestPointerLock?.();
    });

    this.canvas.addEventListener('mousedown', (event) => {
      if (this.state.mode !== 'playing' || this.state.shopOpen || this.state.inventoryOpen) return;
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
