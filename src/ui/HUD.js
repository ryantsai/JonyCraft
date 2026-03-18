import { events } from '../core/EventBus.js';
import { FRUITS } from '../config/fruits.js';
import { SKINS } from '../config/skins.js';
import { ITEMS, ALL_ITEM_IDS, RARITY_COLORS } from '../config/items.js';
import { SHOP_ITEMS } from '../config/shopItems.js';

/**
 * HUD: hotbar, status bar, and start screen management.
 */
export class HUD {
  constructor(gameState, canvas, enemyManager) {
    this.state = gameState;
    this.canvas = canvas;
    this.enemies = enemyManager;
    this.inventory = null; // set via setInventory()

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
    this._cachedPlayerPings = new Map();
    this.debugPanel = document.querySelector('#debug-panel');
    this.debugFruitBtn = document.querySelector('#debug-fruit-btn');
    this.debugSkinBtn = document.querySelector('#debug-skin-btn');
    this.debugItemBtn = document.querySelector('#debug-item-btn');
    this.debugFruitGrid = document.querySelector('#debug-fruit-grid');
    this.debugSkinGrid = document.querySelector('#debug-skin-grid');
    this.debugItemGrid = document.querySelector('#debug-item-grid');
    this.inventoryPanel = document.querySelector('#inventory-panel');
    this.inventoryGrid = document.querySelector('#inventory-grid');
    this.inventoryCloseBtn = document.querySelector('#inventory-close-btn');
    this.defenseBoard = document.querySelector('#defense-scoreboard');
    this.defWave = document.querySelector('#def-wave');
    this.defTimer = document.querySelector('#def-timer');
    this.defAlive = document.querySelector('#def-alive');
    this.defKills = document.querySelector('#def-kills');
    this.defGold = document.querySelector('#def-gold');
    this.defenseStats = document.querySelector('#defense-stats');
    this.merchantPanel = document.querySelector('#merchant-shop-panel');
    this.merchantGrid = document.querySelector('#merchant-shop-grid');
    this.merchantCloseBtn = document.querySelector('#merchant-close-btn');
    this.merchantGoldLabel = document.querySelector('#merchant-gold-label');
    this.pauseMenu = document.querySelector('#pause-menu');
    this.pauseResumeBtn = document.querySelector('#pause-resume-btn');
    this.pauseQuitBtn = document.querySelector('#pause-quit-btn');
    this.disconnectTimer = null;
  }

  setInventory(inventory) {
    this.inventory = inventory;
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
    events.on('inventory:changed', () => this._rebuildInventoryPanel());
    events.on('inventory:open', () => this._openInventory());
    events.on('inventory:close', () => this._closeInventory());

    this.inventoryCloseBtn.addEventListener('click', () => {
      events.emit('sound:click');
      this._closeInventory();
    });

    this.rebuildHotbar();
    this.showHomeScreen();

    events.on('pause:toggle', () => this._togglePause());
    events.on('pause:resume', () => this._resumeGame());
    events.on('pause:quit', () => this._quitToMenu());
    this.pauseResumeBtn.addEventListener('click', () => {
      events.emit('sound:click');
      this._resumeGame();
    });
    this.pauseQuitBtn.addEventListener('click', () => {
      events.emit('sound:click');
      this._quitToMenu();
    });

    events.on('merchant:open', () => this._openMerchantShop());
    events.on('merchant:close', () => this._closeMerchantShop());
    events.on('merchant:refreshShop', () => this._rebuildMerchantShop());
    this.merchantCloseBtn.addEventListener('click', () => {
      events.emit('sound:click');
      this._closeMerchantShop();
    });

    this._initDebugPanel();
  }

  rebuildHotbar() {
    const skills = this.state.activeSkills;
    this.hotbar.textContent = '';
    skills.forEach((skill, index) => {
      const item = document.createElement('button');
      item.className = 'hotbar-item';
      item.type = 'button';
      item.dataset.selected = String(index === this.state.selectedIndex);
      if (skill._itemId) item.dataset.isItem = 'true';
      item.style.setProperty('--icon', `url("${skill.icon}")`);

      const slotNum = document.createElement('span');
      slotNum.className = 'slot-number';
      slotNum.textContent = index < 9 ? String(index + 1) : '0';

      const slotName = document.createElement('span');
      slotName.className = 'slot-name';
      slotName.textContent = skill.name;

      if (skill.kind === 'attack' && skill.damage !== undefined) {
        const stats = document.createElement('span');
        stats.className = 'skill-stats';
        stats.textContent = `ATK ${skill.damage} · 範圍 ${skill.range} · CD ${skill.cooldownMs}ms`;
        item.appendChild(stats);
      } else if (skill.kind === 'deployable') {
        const stats = document.createElement('span');
        stats.className = 'skill-stats';
        stats.textContent = '左鍵放置 · 需瞄準地面或牆頂';
        item.appendChild(stats);
      }

      // Show uses count for consumable items
      if (skill.kind === 'consumable' && skill._uses !== undefined && skill._uses !== Infinity) {
        const uses = document.createElement('span');
        uses.className = 'slot-uses';
        uses.textContent = `×${skill._uses}`;
        item.appendChild(uses);
      }

      item.append(slotNum, slotName);
      item.addEventListener('click', () => {
        this.state.selectedIndex = index;
        events.emit('sound:click');
        this.rebuildHotbar();
        this.update();
      });
      // Right-click to unequip items
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (skill._itemId && this.inventory) {
          this.inventory.unequipFromHotbar(index);
        }
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

    // Show debug panel only in test mode while playing
    const showDebug = this.state.mode === 'playing' && this.state.gameMode === 'test';
    this.debugPanel.dataset.visible = showDebug ? 'true' : 'false';

    // Show mobile interact button in homeland mode
    const touchInteract = document.querySelector('#touch-interact');
    if (touchInteract) {
      touchInteract.dataset.visible = this.state.defense.enabled ? 'true' : 'false';
    }

    const defense = this.state.defense;
    this.defenseBoard.dataset.visible = defense.enabled ? 'true' : 'false';
    this.defenseStats.dataset.visible = defense.enabled ? 'true' : 'false';
    if (defense.enabled) {
      this.defWave.textContent = String(defense.wave);
      this.defTimer.textContent = String(Math.ceil(defense.timeLeft));
      this.defAlive.textContent = String(alive);
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

  _initDebugPanel() {
    const fruitEmoji = (id) => {
      const map = {
        rubber: '\u{1F94A}', flame: '\u{1F525}', ice: '\u2744\uFE0F', lightning: '\u26A1',
        dark: '\u{1F311}', light: '\u2600\uFE0F', quake: '\u{1F4A5}', magma: '\u{1F30B}',
        sand: '\u{1F3DC}\uFE0F', bomb: '\u{1F4A3}',
      };
      return map[id] ?? '\u{1F34E}';
    };

    // Build fruit grid
    FRUITS.forEach((fruit) => {
      const btn = document.createElement('button');
      btn.className = 'debug-grid-item';
      btn.type = 'button';
      btn.dataset.fruitId = fruit.id;
      btn.style.setProperty('--item-color', fruit.color);
      const emoji = document.createElement('span');
      emoji.className = 'debug-emoji';
      emoji.textContent = fruitEmoji(fruit.id);
      const label = document.createElement('span');
      label.textContent = fruit.name;
      btn.append(emoji, label);
      btn.addEventListener('click', () => {
        this.state.selectFruit(fruit);
        this.rebuildHotbar();
        this.update();
        this._updateDebugFruitSelection();
        events.emit('sound:click');
      });
      this.debugFruitGrid.appendChild(btn);
    });

    // Build skin grid
    SKINS.forEach((skin) => {
      const btn = document.createElement('button');
      btn.className = 'debug-grid-item';
      btn.type = 'button';
      btn.dataset.skinId = skin.id;
      btn.style.setProperty('--item-color', skin.color);
      const img = document.createElement('img');
      img.className = 'debug-thumb';
      img.src = skin.texture;
      img.alt = skin.name;
      const label = document.createElement('span');
      label.textContent = skin.name;
      btn.append(img, label);
      btn.addEventListener('click', () => {
        this.state.selectedSkin = skin;
        this._updateDebugSkinSelection();
        events.emit('sound:click');
      });
      this.debugSkinGrid.appendChild(btn);
    });

    // Build debug item grid
    ALL_ITEM_IDS.forEach((itemId) => {
      const def = ITEMS[itemId];
      const btn = document.createElement('button');
      btn.className = 'debug-grid-item';
      btn.type = 'button';
      btn.style.setProperty('--item-color', RARITY_COLORS[def.rarity] || '#b0b0b0');
      const icon = document.createElement('img');
      icon.className = 'debug-thumb';
      icon.src = def.icon;
      icon.alt = def.name;
      const label = document.createElement('span');
      label.textContent = def.name;
      btn.append(icon, label);
      btn.addEventListener('click', () => {
        if (this.inventory) {
          this.inventory.addItem(itemId, 1);
          events.emit('sound:click');
        }
      });
      this.debugItemGrid.appendChild(btn);
    });

    // Toggle buttons — close all others when opening one
    const closeAllDebugGrids = () => {
      this.debugFruitGrid.dataset.visible = 'false';
      this.debugSkinGrid.dataset.visible = 'false';
      this.debugItemGrid.dataset.visible = 'false';
      this.debugFruitBtn.dataset.open = 'false';
      this.debugSkinBtn.dataset.open = 'false';
      this.debugItemBtn.dataset.open = 'false';
    };

    this.debugFruitBtn.addEventListener('click', () => {
      const open = this.debugFruitGrid.dataset.visible !== 'true';
      closeAllDebugGrids();
      if (open) {
        this.debugFruitGrid.dataset.visible = 'true';
        this.debugFruitBtn.dataset.open = 'true';
        this._updateDebugFruitSelection();
      }
      events.emit('sound:click');
    });

    this.debugSkinBtn.addEventListener('click', () => {
      const open = this.debugSkinGrid.dataset.visible !== 'true';
      closeAllDebugGrids();
      if (open) {
        this.debugSkinGrid.dataset.visible = 'true';
        this.debugSkinBtn.dataset.open = 'true';
        this._updateDebugSkinSelection();
      }
      events.emit('sound:click');
    });

    this.debugItemBtn.addEventListener('click', () => {
      const open = this.debugItemGrid.dataset.visible !== 'true';
      closeAllDebugGrids();
      if (open) {
        this.debugItemGrid.dataset.visible = 'true';
        this.debugItemBtn.dataset.open = 'true';
      }
      events.emit('sound:click');
    });
  }

  _updateDebugFruitSelection() {
    const currentId = this.state.selectedFruit?.id ?? '';
    this.debugFruitGrid.querySelectorAll('.debug-grid-item').forEach((btn) => {
      btn.dataset.selected = btn.dataset.fruitId === currentId ? 'true' : 'false';
    });
  }

  _updateDebugSkinSelection() {
    const currentId = this.state.selectedSkin?.id ?? '';
    this.debugSkinGrid.querySelectorAll('.debug-grid-item').forEach((btn) => {
      btn.dataset.selected = btn.dataset.skinId === currentId ? 'true' : 'false';
    });
  }

  _openInventory() {
    if (this.state.shopOpen || this.state.mode === 'paused') return;
    this.state.inventoryOpen = true;
    this.inventoryPanel.dataset.visible = 'true';
    document.exitPointerLock?.();
    this._rebuildInventoryPanel();
  }

  _closeInventory() {
    this.state.inventoryOpen = false;
    this.inventoryPanel.dataset.visible = 'false';
    if (this.state.mode === 'playing' && !this.state.shopOpen) {
      this.canvas.requestPointerLock?.();
    }
  }

  _rebuildInventoryPanel() {
    if (!this.inventory || this.inventoryPanel.dataset.visible !== 'true') return;
    this.inventoryGrid.textContent = '';

    this.inventory.bag.forEach((entry, index) => {
      const def = ITEMS[entry.itemId];
      if (!def) return;

      const slot = document.createElement('button');
      slot.className = 'inventory-slot';
      slot.type = 'button';
      slot.style.setProperty('--rarity-color', RARITY_COLORS[def.rarity] || '#b0b0b0');

      const icon = document.createElement('img');
      icon.className = 'inventory-icon';
      icon.src = def.icon;
      icon.alt = def.name;

      const name = document.createElement('span');
      name.className = 'inventory-item-name';
      name.textContent = def.name;

      const info = document.createElement('span');
      info.className = 'inventory-item-info';
      if (def.maxUses && def.maxUses !== Infinity) {
        info.textContent = `${entry.uses}/${def.maxUses}`;
      } else if (def.kind === 'weapon') {
        info.textContent = `ATK ${def.damage}`;
      } else if (def.kind === 'passive') {
        info.textContent = '被動';
      }

      slot.append(icon, name, info);
      slot.title = def.desc;
      slot.addEventListener('click', () => {
        if (def.kind === 'passive') return;
        if (this.inventory.equipToHotbar(index)) {
          events.emit('sound:click');
        }
      });
      this.inventoryGrid.appendChild(slot);
    });

    if (this.inventory.bag.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'inventory-empty';
      empty.textContent = '背包是空的';
      this.inventoryGrid.appendChild(empty);
    }
  }

  _togglePause() {
    if (this.state.mode !== 'playing' && this.state.mode !== 'paused') return;
    if (this.state.mode === 'paused') {
      this._resumeGame();
    } else {
      this._pauseGame();
    }
  }

  _pauseGame() {
    if (this.state.mode !== 'playing') return;
    // Close shop/inventory first if open
    if (this.state.shopOpen) this._closeMerchantShop();
    this._closeInventory();

    this.state.mode = 'paused';
    this.pauseMenu.dataset.visible = 'true';
    document.exitPointerLock?.();
  }

  _resumeGame() {
    if (this.state.mode !== 'paused') return;
    this.state.mode = 'playing';
    this.pauseMenu.dataset.visible = 'false';
    this.canvas.requestPointerLock?.();
  }

  _quitToMenu() {
    this.pauseMenu.dataset.visible = 'false';
    this.state.mode = 'menu';
    this.state.shopOpen = false;
    this._closeMerchantShop();
    this._closeInventory();

    // Leave multiplayer session if connected
    if (this.state.multiplayer.enabled) {
      events.emit('multiplayer:leave');
    }

    // Deactivate current mode controller
    this.state.modeController?.deactivate?.();
    this.state.modeController = null;
    this.state.defense.enabled = false;
    this.state.started = false;

    this.showHomeScreen();
  }

  _openMerchantShop() {
    this.merchantPanel.dataset.visible = 'true';
    this.state.shopOpen = true;
    document.exitPointerLock?.();
    this._rebuildMerchantShop();
  }

  _closeMerchantShop() {
    this.merchantPanel.dataset.visible = 'false';
    this.state.shopOpen = false;
    this.canvas.requestPointerLock?.();
  }

  _rebuildMerchantShop() {
    if (this.merchantPanel.dataset.visible !== 'true') return;
    const gold = this.state.defense.totalGold;
    this.merchantGoldLabel.textContent = `金幣: ${gold}`;
    this.merchantGrid.textContent = '';

    SHOP_ITEMS.forEach((shopItem) => {
      const card = document.createElement('button');
      card.className = 'merchant-item';
      card.type = 'button';
      const canAfford = gold >= shopItem.cost;
      card.dataset.affordable = canAfford ? 'true' : 'false';

      const icon = document.createElement('img');
      icon.className = 'merchant-item-icon';
      icon.src = shopItem.icon;
      icon.alt = shopItem.name;

      const info = document.createElement('div');
      info.className = 'merchant-item-info';

      const name = document.createElement('span');
      name.className = 'merchant-item-name';
      name.textContent = shopItem.name;

      const desc = document.createElement('span');
      desc.className = 'merchant-item-desc';
      desc.textContent = shopItem.desc;

      const cost = document.createElement('span');
      cost.className = 'merchant-item-cost';
      cost.textContent = `${shopItem.cost} 金`;

      info.append(name, desc);
      card.append(icon, info, cost);
      card.addEventListener('click', () => {
        events.emit('merchant:purchase', { shopItem });
      });
      this.merchantGrid.appendChild(card);
    });
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

      const now = performance.now();
      if (now - this._lastPingUpdate > 1000 || !this._cachedPlayerPings.has(player.name)) {
        this._cachedPlayerPings.set(player.name, Math.round(player.pingMs ?? 0));
      }
      const ping = document.createElement('span');
      ping.className = 'score-value';
      ping.textContent = `${this._cachedPlayerPings.get(player.name) ?? 0} ms`;

      row.append(name, kills, gold, ping);
      this.multiplayerRows.appendChild(row);
    });
  }
}
