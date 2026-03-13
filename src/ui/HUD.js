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
    this.hpText = document.querySelector('#hp-text');
    this.hpFill = document.querySelector('#hp-fill');
    this.defenseBoard = document.querySelector('#defense-scoreboard');
    this.defWave = document.querySelector('#def-wave');
    this.defTimer = document.querySelector('#def-timer');
    this.defTower = document.querySelector('#def-tower');
    this.defKills = document.querySelector('#def-kills');
    this.defGold = document.querySelector('#def-gold');
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
    events.on('status:message', (message) => { this.statusMessage.textContent = message; });

    this.rebuildHotbar();

    document.querySelectorAll('.defense-shop-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        events.emit('sound:click');
        events.emit('shop:purchase', { item: btn.dataset.shopItem });
      });
    });
  }

  rebuildHotbar() {
    const skills = this.state.activeSkills;
    this.hotbar.textContent = '';
    skills.forEach((skill, index) => {
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

      // Skill stats tooltip
      if (skill.kind === 'attack' && skill.damage !== undefined) {
        const stats = document.createElement('span');
        stats.className = 'skill-stats';
        stats.textContent = `ATK ${skill.damage} · 範圍 ${skill.range} · CD ${skill.cooldownMs}ms`;
        item.appendChild(stats);
      }

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
    const total = this.state.activeSkills.length;
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
    const et = this.state.enemyTarget;
    const enemyName = et?.typeDef?.name || '敵人';
    const zombieText = et
      ? ` | 目標：${enemyName} HP ${Math.ceil(et.health)}/${et.maxHealth} | 敵人 ${alive}`
      : alive > 0
        ? ` | 敵人存活 ${alive}`
        : ` | 已擊殺 ${this.state.combat.kills}`;
    const pointer = document.pointerLockElement === this.canvas ? '指標鎖定' : '滑鼠自由';
    const fruitLabel = this.state.selectedFruit ? ` [${this.state.selectedFruit.name}]` : '';
    this.statusMessage.textContent = `${fruitLabel} 已選：${selected} | 目標：${target}${zombieText} | ${pointer}`;
    this.statusCoords.textContent = `XYZ ${player.position.x.toFixed(1)} / ${player.position.y.toFixed(1)} / ${player.position.z.toFixed(1)}`;

    // Player health bar
    const hpRatio = player.hp / player.maxHp;
    this.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    this.hpFill.style.width = `${Math.max(0, hpRatio * 100)}%`;
    this.hpFill.dataset.high = hpRatio > 0.5 ? 'true' : 'false';
    this.hpFill.dataset.mid = (hpRatio > 0.25 && hpRatio <= 0.5) ? 'true' : 'false';

    const defense = this.state.defense;
    this.defenseBoard.dataset.visible = defense.enabled ? 'true' : 'false';
    if (defense.enabled) {
      this.defWave.textContent = String(defense.wave);
      this.defTimer.textContent = String(Math.ceil(defense.timeLeft));
      this.defTower.textContent = `${Math.ceil(defense.towerHp)} / ${defense.towerMaxHp}`;
      this.defKills.textContent = String(defense.totalKills);
      this.defGold.textContent = String(defense.totalGold);
    }
  }

  enterWorld() {
    // Show fruit selection instead of going directly to playing
    this.startScreen.dataset.hidden = 'true';
    events.emit('fruit:show');
  }

  onFruitSelected() {
    this.state.started = true;
    this.state.mode = 'playing';
    this.rebuildHotbar();
    this.update();
  }

  setReady() {
    this.statusMessage.textContent = '按下「進入世界」開始探索。';
    this.statusCoords.textContent = '準備就緒';
  }
}
