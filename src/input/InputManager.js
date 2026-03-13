import { CONTROL_KEYS, LOOK_SPEED } from '../config/constants.js';
import { events } from '../core/EventBus.js';

/**
 * Manages keyboard, mouse, and pointer lock input.
 * Translates raw browser events into game actions.
 * Future: remap keys, handle gamepad, network input forwarding.
 */
export class InputManager {
  constructor(gameState, canvas, combatSystem) {
    this.state = gameState;
    this.canvas = canvas;
    this.combat = combatSystem;
    this.keyState = new Set();
    this.virtualInput = { moveX: 0, moveZ: 0, lookX: 0, lookY: 0 };
  }

  init() {
    window.addEventListener('keydown', (event) => {
      if (CONTROL_KEYS.includes(event.code)) this.keyState.add(event.code);

      // Hotbar slots 1-4 (dynamic based on active skills count)
      const digitMap = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
      const slot = digitMap[event.code];
      if (slot !== undefined && slot < this.state.activeSkills.length) {
        this.state.selectedIndex = slot;
        events.emit('hotbar:rebuild');
      }

      if (event.code === 'KeyF') this._toggleFullscreen();
      if (event.code === 'Enter' && !this.state.started) events.emit('game:enter');
    });

    window.addEventListener('keyup', (event) => {
      this.keyState.delete(event.code);
    });

    window.addEventListener('wheel', (event) => {
      events.emit('hotbar:scroll', event.deltaY > 0 ? 1 : -1);
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
      const skill = this.state.getSelectedSkill();
      if (event.button === 0) {
        if (skill.kind === 'attack') {
          // Fruit skill with full stats defined
          if (skill.range !== undefined) {
            this.combat.fruitAttack();
          } else if (skill.id === 'sword') {
            this.combat.swingSword();
          } else if (skill.id === 'punch') {
            this.combat.punchAttack();
          }
        } else if (skill.kind === 'block') {
          this.combat.handleBreak();
        }
      }
      if (event.button === 2 && skill.kind === 'block') this.combat.handlePlace();
    });

    window.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  _toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }
}
