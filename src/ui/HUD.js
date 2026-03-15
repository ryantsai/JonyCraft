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
    this.homeScreen = document.querySelector('#menu-home-screen');
    this.singleplayerScreen = document.querySelector('#singleplayer-screen');
    this.disconnectScreen = document.querySelector('#disconnect-screen');
    this.disconnectMessage = document.querySelector('#disconnect-message');
    this.startButton = document.querySelector('#start-btn');
    this.startButtonText = document.querySelector('#start-btn .start-btn-text');
    this.hpText = document.querySelector('#hp-text');
    this.hpFill = document.querySelector('#hp-fill');
    this.multiplayerScoreboard = document.querySelector('#multiplayer-scoreboard');
    this.multiplayerPingLabel = document.querySelector('#multiplayer-ping-label');
    this.multiplayerRows = document.querySelector('#multiplayer-scoreboard-rows');
    this._lastPingUpdate = 0;
    this._lastPingValue = 0;
    this.defenseBoard = document.querySelector('#defense-scoreboard');
    this.defWave = document.querySelector('#def-wave');
    this.defTimer = document.querySelector('#def-timer');
    this.defKills = document.querySelector('#def-kills');
    this.defGold = document.querySelector('#def-gold');
    this.disconnectTimer = null;
  }

  init() {
    this.startButton.addEventListener('click', () => {
      events.emit('sound:click');
      events.emit('game:enter');
    });

    document.querySelector('#choose-singleplayer-btn').addEventListener('click', () => {
      events.emit('sound:click');
      this.state.playStyle = 'singleplayer';
      this.showSingleplayerScreen();
    });

    document.querySelector('#choose-multiplayer-btn').addEventListener('click', () => {
      events.emit('sound:click');
      this.state.playStyle = 'multiplayer';
      this.showMultiplayerScreen();
    });

    document.querySelector('#singleplayer-back-btn').addEventListener('click', () => {
      events.emit('sound:click');
      this.showHomeScreen();
    });

    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach((node) => node.classList.remove('mode-btn-active'));
        btn.classList.add('mode-btn-active');
        this.state.gameMode = btn.dataset.mode;
        this.updateStartAction();
      });
    });

    events.on('hotbar:rebuild', () => this.rebuildHotbar());
    events.on('hotbar:scroll', (delta) => this.moveSelection(delta));
    events.on('hud:update', () => this.update());
    events.on('game:enter', () => this.enterWorld());
    events.on('status:message', (message) => { this.statusMessage.textContent = message; });
    events.on('multiplayer:session-ready', () => this.enterJoinedSession());
    events.on('multiplayer:lobby:closed', () => this.showHomeScreen());
    events.on('multiplayer:disconnected', ({ message }) => this.showDisconnectedScreen(message));

    this.rebuildHotbar();
    this.showHomeScreen();

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

      if (skill.kind === 'attack' && skill.damage !== undefined) {
        const stats = document.createElement('span');
        stats.className = 'skill-stats';
        stats.textContent = `ATK ${skill.damage} · 範圍 ${skill.range} · CD ${skill.cooldownMs}ms`;
        item.appendChild(stats);
      }

      item.append(slotNum, slotName);
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
    const multiplayerText = this.state.multiplayer.enabled
      ? ` | 房間：${this.state.multiplayer.sessionName} (${this.state.multiplayer.sessionPlayerCount}人)`
      : '';
    this.statusMessage.textContent = `${fruitLabel} 已選：${selected} | 目標：${target}${zombieText}${multiplayerText} | ${pointer}`;
    this.statusCoords.textContent = `XYZ ${player.position.x.toFixed(1)} / ${player.position.y.toFixed(1)} / ${player.position.z.toFixed(1)}`;

    const hpRatio = player.hp / player.maxHp;
    this.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    this.hpFill.style.width = `${Math.max(0, hpRatio * 100)}%`;
    this.hpFill.dataset.high = hpRatio > 0.5 ? 'true' : 'false';
    this.hpFill.dataset.mid = (hpRatio > 0.25 && hpRatio <= 0.5) ? 'true' : 'false';

    const multiplayer = this.state.multiplayer;
    const showScoreboard = multiplayer.enabled && multiplayer.playerStats.length > 0;
    this.multiplayerScoreboard.dataset.visible = showScoreboard ? 'true' : 'false';
    if (showScoreboard) {
      const now = performance.now();
      if (now - this._lastPingUpdate > 1000) {
        this._lastPingUpdate = now;
        this._lastPingValue = Math.round(multiplayer.pingMs || 0);
      }
      this.multiplayerPingLabel.textContent = `Ping ${this._lastPingValue} ms`;
      this._renderMultiplayerStats(multiplayer.playerStats);
    } else {
      this.multiplayerRows.textContent = '';
      this.multiplayerPingLabel.textContent = 'Ping -- ms';
    }

    const defense = this.state.defense;
    this.defenseBoard.dataset.visible = defense.enabled ? 'true' : 'false';
    if (defense.enabled) {
      this.defWave.textContent = String(defense.wave);
      this.defTimer.textContent = String(Math.ceil(defense.timeLeft));
      this.defKills.textContent = String(defense.totalKills);
      this.defGold.textContent = String(defense.totalGold);
    }
  }

  enterWorld() {
    this.state.playStyle = 'singleplayer';
    this.startScreen.dataset.hidden = 'true';
    events.emit('fruit:show');
  }

  enterJoinedSession() {
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
    this.showHomeScreen();
    this.statusMessage.textContent = '先選擇單人或多人，再進入下一步。';
    this.statusCoords.textContent = '準備就緒';
  }

  showHomeScreen() {
    this._clearDisconnectTimer();
    this.state.mode = 'menu';
    this.state.playStyle = 'singleplayer';
    this.homeScreen.dataset.hidden = 'false';
    this.singleplayerScreen.dataset.hidden = 'true';
    this.disconnectScreen.dataset.hidden = 'true';
    this.startScreen.dataset.hidden = 'false';
    this.updateStartAction();
  }

  showSingleplayerScreen() {
    this._clearDisconnectTimer();
    this.state.mode = 'menu';
    this.state.playStyle = 'singleplayer';
    this.homeScreen.dataset.hidden = 'true';
    this.singleplayerScreen.dataset.hidden = 'false';
    this.disconnectScreen.dataset.hidden = 'true';
    this.startScreen.dataset.hidden = 'false';
    this.updateStartAction();
  }

  showMultiplayerScreen(options = {}) {
    this._clearDisconnectTimer();
    this.state.mode = 'menu';
    this.state.playStyle = 'multiplayer';
    this.homeScreen.dataset.hidden = 'true';
    this.singleplayerScreen.dataset.hidden = 'true';
    this.disconnectScreen.dataset.hidden = 'true';
    this.startScreen.dataset.hidden = 'false';
    events.emit('multiplayer:lobby:show', options);
  }

  updateStartAction() {
    if (!this.startButtonText) return;
    this.startButtonText.textContent = this.state.gameMode === 'homeland' ? '保衛家園' : '進入世界';
  }

  showDisconnectedScreen(message) {
    this._clearDisconnectTimer();
    document.exitPointerLock?.();
    this.state.mode = 'menu';
    this.startScreen.dataset.hidden = 'false';
    this.homeScreen.dataset.hidden = 'true';
    this.singleplayerScreen.dataset.hidden = 'true';
    this.disconnectScreen.dataset.hidden = 'false';
    this.disconnectMessage.textContent = message || '多人伺服器已中斷，正在返回房間列表...';
    this.disconnectTimer = window.setTimeout(() => {
      this.showMultiplayerScreen({ statusMessage: message });
    }, 1200);
  }

  _clearDisconnectTimer() {
    if (!this.disconnectTimer) return;
    window.clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
  }

  _renderMultiplayerStats(players) {
    this.multiplayerRows.textContent = '';
    players.forEach((player) => {
      const row = document.createElement('div');
      row.className = 'multiplayer-scoreboard-row';
      row.dataset.self = String(player.name === this.state.playerName);

      const name = document.createElement('span');
      name.className = 'score-player';
      name.textContent = player.name;

      const kills = document.createElement('span');
      kills.className = 'score-value';
      kills.textContent = String(player.kills ?? 0);

      const gold = document.createElement('span');
      gold.className = 'score-value';
      gold.textContent = String(player.gold ?? 0);

      const ping = document.createElement('span');
      ping.className = 'score-value';
      ping.textContent = `${Math.round(player.pingMs ?? 0)} ms`;

      row.append(name, kills, gold, ping);
      this.multiplayerRows.appendChild(row);
    });
  }
}
