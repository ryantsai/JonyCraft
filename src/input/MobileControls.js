/**
 * Virtual gamepad for mobile devices: dual touch pads + action buttons.
 */
export class MobileControls {
  constructor(inputManager, combatSystem, gameState) {
    this.input = inputManager;
    this.combat = combatSystem;
    this.state = gameState;
    this.isMobile = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  init() {
    const mobileControls = document.querySelector('#mobile-controls');
    if (this.isMobile) mobileControls.dataset.visible = 'true';

    const movePad = document.querySelector('#move-pad');
    const moveKnob = document.querySelector('#move-knob');
    const lookPad = document.querySelector('#look-pad');
    const lookKnob = document.querySelector('#look-knob');
    const touchJump = document.querySelector('#touch-jump');
    const touchPrimary = document.querySelector('#touch-primary');
    const touchSecondary = document.querySelector('#touch-secondary');

    this._bindTouchPad(movePad, moveKnob, (x, y) => {
      this.input.virtualInput.moveX = x;
      this.input.virtualInput.moveZ = y;
    });

    this._bindTouchPad(lookPad, lookKnob, (x, y) => {
      this.input.virtualInput.lookX = x * 16;
      this.input.virtualInput.lookY = y * 16;
    });

    this._bindHold(touchJump,
      () => this.input.keyState.add('Space'),
      () => this.input.keyState.delete('Space'),
    );

    this._bindHold(touchPrimary, () => {
      const skill = this.state.getSelectedSkill();
      if (skill.id === 'sword') this.combat.swingSword();
      else if (skill.id === 'punch') this.combat.punchAttack();
      else this.combat.handleBreak();
    });

    this._bindHold(touchSecondary, () => {
      if (this.state.getSelectedSkill().id === 'dirt') this.combat.handlePlace();
    });
  }

  _bindTouchPad(pad, knob, onMove) {
    const state = { activeId: null };
    const reset = () => {
      state.activeId = null;
      knob.style.transform = 'translate(0px, 0px)';
      onMove(0, 0);
    };
    const update = (touch) => {
      const rect = pad.getBoundingClientRect();
      const radius = rect.width * 0.35;
      const localX = touch.clientX - (rect.left + rect.width / 2);
      const localY = touch.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(localX, localY);
      const scale = dist > radius ? radius / dist : 1;
      const cx = localX * scale;
      const cy = localY * scale;
      knob.style.transform = `translate(${cx}px, ${cy}px)`;
      onMove(cx / radius, cy / radius);
    };
    pad.addEventListener('touchstart', (e) => {
      if (state.activeId !== null) return;
      state.activeId = e.changedTouches[0].identifier;
      update(e.changedTouches[0]);
      e.preventDefault();
    }, { passive: false });
    pad.addEventListener('touchmove', (e) => {
      const t = Array.from(e.changedTouches).find((x) => x.identifier === state.activeId);
      if (!t) return;
      update(t);
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      const t = Array.from(e.changedTouches).find((x) => x.identifier === state.activeId);
      if (!t) return;
      reset();
      e.preventDefault();
    };
    pad.addEventListener('touchend', end, { passive: false });
    pad.addEventListener('touchcancel', end, { passive: false });
  }

  _bindHold(button, onPress, onRelease = () => {}) {
    button.addEventListener('touchstart', (e) => { onPress(); e.preventDefault(); }, { passive: false });
    const release = (e) => { onRelease(); e.preventDefault(); };
    button.addEventListener('touchend', release, { passive: false });
    button.addEventListener('touchcancel', release, { passive: false });
  }
}
