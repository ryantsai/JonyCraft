import { SKILLS } from '../config/skills.js';
import { events } from '../core/EventBus.js';

/**
 * HUD: hotbar, status bar, and start screen management.
 */
export class HUD {
  constructor(gameState, canvas, enemyManager) {
    this.state = gameState;
    this.canvas = canvas;
    this.enemies = enemyManager;

    this.hotbar = document.querySelector('#hotbar');
    this.statusMessage = document.querySelector('#status-message');
    this.statusCoords = document.querySelector('#status-coords');
    this.startScreen = document.querySelector('#start-screen');
    this.startButton = document.querySelector('#start-btn');
  }

  init() {
    this.startButton.addEventListener('click', () => {
      events.emit('sound:click');
      events.emit('game:enter');
    });

    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('mode-btn-active'));
        btn.classList.add('mode-btn-active');
        this.state.gameMode = btn.dataset.mode;
      });
    });

    events.on('hotbar:rebuild', () => this.rebuildHotbar());
    events.on('hotbar:scroll', (delta) => this.moveSelection(delta));
    events.on('hud:update', () => this.update());
    events.on('game:enter', () => this.enterWorld());

    this.rebuildHotbar();
  }

  rebuildHotbar() {
    this.hotbar.textContent = '';
    SKILLS.forEach((skill, index) => {
      const item = document.createElement('button');
      item.className = 'hotbar-item';
      item.type = 'button';
      item.dataset.selected = String(index === this.state.selectedIndex);
      item.style.setProperty('--icon', `url("${skill.icon}")`);

      const slotNum = document.createElement('span');
      slotNum.className = 'slot-number';
      slotNum.textContent = String(index + 1);

      const slotName = document.createElement('span');
      slotName.className = 'slot-name';
      slotName.textContent = skill.name;

      item.appendChild(slotNum);
      item.appendChild(slotName);

      item.addEventListener('click', () => {
        this.state.selectedIndex = index;
        events.emit('sound:click');
        this.rebuildHotbar();
        this.update();
      });
      this.hotbar.appendChild(item);
    });
  }

  moveSelection(delta) {
    const total = SKILLS.length;
    this.state.selectedIndex = (this.state.selectedIndex + delta + total) % total;
    this.rebuildHotbar();
    this.update();
  }

  update() {
    const player = this.state.player;
    const selected = this.state.getSelectedSkill().name;
    const target = this.state.target
      ? `${this.state.target.block.type} @ ${this.state.target.block.x},${this.state.target.block.y},${this.state.target.block.z}`
      : '無';
    const alive = this.enemies.getAlive().length;
    const zombieText = this.state.enemyTarget
      ? ` | 目標殭屍 HP ${this.state.enemyTarget.health} | 殭屍 ${alive}`
      : alive > 0
        ? ` | 殭屍存活 ${alive}`
        : ` | 已擊殺殭屍 ${this.state.combat.kills}`;
    const pointer = document.pointerLockElement === this.canvas ? '指標鎖定' : '滑鼠自由';
    this.statusMessage.textContent = `已選：${selected} | 目標：${target}${zombieText} | ${pointer}`;
    this.statusCoords.textContent = `XYZ ${player.position.x.toFixed(1)} / ${player.position.y.toFixed(1)} / ${player.position.z.toFixed(1)}`;
  }

  enterWorld() {
    this.state.started = true;
    this.state.mode = 'playing';
    this.startScreen.dataset.hidden = 'true';
    this.update();
  }

  setReady() {
    this.statusMessage.textContent = '按下「進入世界」開始探索。';
    this.statusCoords.textContent = '準備就緒';
  }
}
