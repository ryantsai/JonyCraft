/**
 * Virtual gamepad for mobile devices: move pad, swipe-to-look, action buttons.
 */
export class MobileControls {
  constructor(inputManager, combatSystem, gameState) {
    this.input = inputManager;
    this.combat = combatSystem;
    this.state = gameState;
    this.canvas = inputManager.canvas;
    this.isMobile = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  init() {
    const mobileControls = document.querySelector('#mobile-controls');
    if (this.isMobile) mobileControls.dataset.visible = 'true';

    const movePad = document.querySelector('#move-pad');
    const moveKnob = document.querySelector('#move-knob');
    const touchJump = document.querySelector('#touch-jump');
    const touchPrimary = document.querySelector('#touch-primary');
    const touchSecondary = document.querySelector('#touch-secondary');

    this._bindTouchPad(movePad, moveKnob, (x, y) => {
      this.input.virtualInput.moveX = x;
      this.input.virtualInput.moveZ = y;
    });

    if (this.isMobile) this._bindSwipeToLook();

    this._bindHold(touchJump,
      () => this.input.keyState.add('Space'),
      () => this.input.keyState.delete('Space'),
    );

    this._bindHold(touchPrimary, () => {
      this.input.setPrimaryHeld(true);
      this.input.triggerPrimaryAction();
    }, () => {
      this.input.setPrimaryHeld(false);
    });

    this._bindHold(touchSecondary, () => {
      if (this.state.getSelectedSkill().kind === 'block') this.combat.handlePlace();
    });

    const fullscreenBtn = document.querySelector('#touch-fullscreen');
    const doc = document.documentElement;
    const canFullscreen = doc.requestFullscreen || doc.webkitRequestFullscreen;
    if (!canFullscreen) {
      // iOS Safari: no fullscreen API — hide the button
      fullscreenBtn.style.display = 'none';
    } else {
      fullscreenBtn.addEventListener('click', () => {
        const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
        if (isFullscreen) {
          (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
          (doc.requestFullscreen || doc.webkitRequestFullscreen).call(doc);
        }
      });
    }
  }

  _bindSwipeToLook() {
    const LOOK_SENSITIVITY = 0.006;
    let activeId = null;
    let lastX = 0;
    let lastY = 0;

    // Listen on the whole document so swipes anywhere (not on controls) rotate the camera
    document.addEventListener('touchstart', (e) => {
      if (this.state.mode !== 'playing' || activeId !== null) return;
      // Ignore touches that land on interactive mobile controls
      const el = e.target.closest('.touch-pad, .mobile-actions, .defense-scoreboard, .hotbar, .start-screen');
      if (el) return;
      const t = e.changedTouches[0];
      activeId = t.identifier;
      lastX = t.clientX;
      lastY = t.clientY;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (activeId === null) return;
      const t = Array.from(e.changedTouches).find((x) => x.identifier === activeId);
      if (!t) return;
      const dx = t.clientX - lastX;
      const dy = t.clientY - lastY;
      lastX = t.clientX;
      lastY = t.clientY;
      this.state.player.yaw -= dx * LOOK_SENSITIVITY;
      this.state.player.pitch = Math.max(-1.35, Math.min(1.35,
        this.state.player.pitch - dy * LOOK_SENSITIVITY,
      ));
    }, { passive: true });

    const endTouch = (e) => {
      const t = Array.from(e.changedTouches).find((x) => x.identifier === activeId);
      if (t) activeId = null;
    };
    document.addEventListener('touchend', endTouch, { passive: true });
    document.addEventListener('touchcancel', endTouch, { passive: true });
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
