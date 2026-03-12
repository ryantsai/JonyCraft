import { assetUrl } from '../config/assets.js';
import { events } from '../core/EventBus.js';

/**
 * Manages all game sound effects using the Web Audio API.
 * Listens to EventBus events and plays appropriate sounds.
 */
export class SoundManager {
  constructor(gameState) {
    this.state = gameState;
    this.ctx = null; // AudioContext, created on first user gesture
    this.buffers = new Map(); // name -> AudioBuffer
    this.volume = 0.5;
    this.footstepTimer = 0;
    this._unlocked = false;
  }

  init() {
    // Unlock audio context on first user interaction
    const unlock = () => {
      if (this._unlocked) return;
      this._unlocked = true;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._loadAll();
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);

    // Wire events
    events.on('sound:sword', () => this._playRandom('sword', 3));
    events.on('sound:punch', () => this._playRandom('woosh', 2));
    events.on('sound:hit', () => this._playRandom('impactPunch', 3));
    events.on('sound:kill', () => this.play('zombieDeath'));
    events.on('sound:break', () => this._playRandom('impactMining', 3));
    events.on('sound:place', () => this._playRandom('stoneHit', 2));
    events.on('sound:jump', () => this.play('jump', 0.4));
    events.on('sound:click', () => this.play('click', 0.6));
  }

  updateFootsteps(dt, keyState, virtualInput) {
    if (this.state.mode !== 'playing') return;
    const player = this.state.player;
    const moving = keyState.has('KeyW') || keyState.has('KeyA') ||
      keyState.has('KeyS') || keyState.has('KeyD') ||
      keyState.has('ArrowUp') || keyState.has('ArrowDown') ||
      Math.abs(virtualInput.moveX) > 0.2 || Math.abs(virtualInput.moveZ) > 0.2;

    if (moving && player.onGround) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this._playRandom('footstep', 4, 0.25);
        this.footstepTimer = 0.38;
      }
    } else {
      this.footstepTimer = 0;
    }
  }

  play(name, vol = this.volume) {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = vol;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start(0);
  }

  _playRandom(prefix, count, vol = this.volume) {
    const idx = Math.floor(Math.random() * count) + 1;
    this.play(`${prefix}${idx}`, vol);
  }

  _loadAll() {
    const files = [
      'sword1', 'sword2', 'sword3',
      'woosh1', 'woosh2',
      'impactPunch1', 'impactPunch2', 'impactPunch3',
      'impactSoft1', 'impactSoft2',
      'impactMining1', 'impactMining2', 'impactMining3',
      'stoneHit1', 'stoneHit2',
      'footstep1', 'footstep2', 'footstep3', 'footstep4',
      'jump', 'click', 'zombieDeath',
    ];
    for (const name of files) {
      const url = assetUrl(`assets/kenney/sounds/${name}.ogg`);
      fetch(url)
        .then((res) => res.arrayBuffer())
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buffer) => this.buffers.set(name, buffer))
        .catch(() => { /* sound file missing — silently skip */ });
    }
  }
}
