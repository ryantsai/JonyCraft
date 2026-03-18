import { events } from '../core/EventBus.js';

function defaultServerEndpoint() {
  const { hostname } = window.location;
  if (hostname === '10.0.0.100') {
    return { host: '10.0.0.100', port: '8765' };
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return { host: '10.0.0.100', port: '8765' };
  }
  return { host: 'pb60.tailbf39d7.ts.net', port: '443' };
}

function trimText(value) {
  return String(value ?? '').trim();
}

function normalizeEndpointParts(host, port) {
  const fallback = defaultServerEndpoint();
  const rawHost = trimText(host);
  const rawPort = trimText(port);

  if (!rawHost) {
    return {
      host: fallback.host,
      port: rawPort || fallback.port,
    };
  }

  try {
    const parsed = new URL(rawHost.includes('://') ? rawHost : `http://${rawHost}`);
    return {
      host: parsed.hostname || fallback.host,
      port: rawPort || parsed.port || fallback.port,
    };
  } catch {
    const match = rawHost.match(/^\[?([^\]]+)\]?(?::(\d+))?$/);
    if (!match) {
      return {
        host: rawHost,
        port: rawPort || fallback.port,
      };
    }
    return {
      host: match[1] || fallback.host,
      port: rawPort || match[2] || fallback.port,
    };
  }
}

function endpointToUrl(host, port) {
  const normalized = normalizeEndpointParts(host, port);
  const safeHost = normalized.host;
  const safePort = normalized.port;
  if (safeHost.startsWith('http://') || safeHost.startsWith('https://')) {
    return `${safeHost.replace(/\/+$/, '')}:${safePort}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${safeHost}:${safePort}`;
}

function parseEndpoint(url) {
  const fallback = defaultServerEndpoint();
  const raw = trimText(url);
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return {
      host: parsed.hostname || fallback.host,
      port: parsed.port || fallback.port,
    };
  } catch {
    return fallback;
  }
}

export class MultiplayerClient {
  constructor(gameState, world) {
    this.state = gameState;
    this.world = world;
    this.remotePlayers = null;
    this.enemyManager = null;
    this.homelandMode = null;
    this.inventory = null;
    this.syncAccumulatorMs = 0;
    this.syncIntervalMs = 60;
    this.syncInFlight = false;
    this.pendingImmediateSync = false;
    this.disconnectTimeoutMs = 20_000;
    this.lastServerTrafficAt = performance.now();
    this.hasTimedOut = false;
    this.pendingBlockOps = [];
    this.pendingHomelandAttacks = [];
    this.pendingHomelandPurchases = [];
    this.pendingHomelandPlacements = [];
    this.pendingPvPAttacks = [];
    this.suppressBlockSync = false;

    const endpoint = defaultServerEndpoint();
    this.state.multiplayer.serverHost = endpoint.host;
    this.state.multiplayer.serverPort = endpoint.port;
    this.state.multiplayer.serverUrl = endpointToUrl(endpoint.host, endpoint.port);
  }

  init() {
    events.on('multiplayer:leave', () => this.leaveSession());

    events.on('block:changed', (change) => {
      if (!this.state.multiplayer.enabled || this.suppressBlockSync) return;
      this.pendingBlockOps.push({
        x: change.x,
        y: change.y,
        z: change.z,
        type: change.type,
      });
    });

    window.addEventListener('beforeunload', () => {
      if (!this.state.multiplayer.enabled || !navigator.sendBeacon) return;
      const url = this._makeUrl(`/api/sessions/${this.state.multiplayer.sessionId}/leave`);
      const blob = new Blob([
        JSON.stringify({ playerName: this.state.playerName }),
      ], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    });
  }

  attachRemotePlayers(remotePlayers) {
    this.remotePlayers = remotePlayers;
  }

  attachEnemyManager(enemyManager) {
    this.enemyManager = enemyManager;
  }

  attachHomelandMode(homelandMode) {
    this.homelandMode = homelandMode;
  }

  attachInventory(inventory) {
    this.inventory = inventory;
  }

  setPlayerName(name) {
    this.state.playerName = name;
  }

  setServerEndpoint(host, port) {
    const endpoint = normalizeEndpointParts(host, port);
    this.state.multiplayer.serverHost = endpoint.host;
    this.state.multiplayer.serverPort = endpoint.port;
    this.state.multiplayer.serverUrl = endpointToUrl(
      this.state.multiplayer.serverHost,
      this.state.multiplayer.serverPort,
    );
  }

  setServerUrl(url) {
    const endpoint = parseEndpoint(url);
    this.setServerEndpoint(endpoint.host, endpoint.port);
  }

  getServerEndpoint() {
    return {
      host: this.state.multiplayer.serverHost,
      port: this.state.multiplayer.serverPort,
    };
  }

  async fetchSessions() {
    const startedAt = performance.now();
    const response = await fetch(this._makeUrl('/api/sessions'));
    this._recordServerTraffic(startedAt);
    if (!response.ok) throw new Error('無法讀取多人連線房間列表。');
    const payload = await response.json();
    this.state.multiplayer.sessions = payload.sessions ?? [];
    this.state.multiplayer.connectionStatus = 'ready';
    return this.state.multiplayer.sessions;
  }

  async createSession(sessionName, sessionMode) {
    const payload = await this._post('/api/sessions/create', {
      playerName: this.state.playerName,
      sessionName,
      sessionMode,
    });
    this._activateSession(payload.session);
    await this.syncNow(true);
    return payload.session;
  }

  async joinSession(sessionId) {
    const payload = await this._post(`/api/sessions/${sessionId}/join`, {
      playerName: this.state.playerName,
    });
    this._activateSession(payload.session);
    await this.syncNow(true);
    return payload.session;
  }

  async leaveSession() {
    if (!this.state.multiplayer.enabled || !this.state.multiplayer.sessionId) return;
    try {
      await this._post(`/api/sessions/${this.state.multiplayer.sessionId}/leave`, {
        playerName: this.state.playerName,
      });
    } catch {
      // best-effort
    }
    this._resetSessionState();
  }

  queueHomelandAttack(attack) {
    this.pendingHomelandAttacks.push(attack);
  }

  queueHomelandPurchase(item) {
    this.pendingHomelandPurchases.push(item);
  }

  queueHomelandPlacement(placement) {
    this.pendingHomelandPlacements.push(placement);
  }

  queuePvPAttack(attack) {
    this.pendingPvPAttacks.push(attack);
  }

  update(dt) {
    if (!this.state.multiplayer.enabled || !this.state.multiplayer.sessionId) return;
    if (!this.hasTimedOut && (performance.now() - this.lastServerTrafficAt) >= this.disconnectTimeoutMs) {
      this._handleTrafficTimeout();
      return;
    }
    this.syncAccumulatorMs += dt * 1000;
    if (this.syncAccumulatorMs < this.syncIntervalMs) return;
    this.syncAccumulatorMs %= this.syncIntervalMs;
    void this.syncNow();
  }

  async syncNow(force = false) {
    if (!this.state.multiplayer.enabled || !this.state.multiplayer.sessionId) return;
    if (!force && this.syncInFlight) {
      this.pendingImmediateSync = true;
      return;
    }

    this.syncInFlight = true;
    this.state.multiplayer.connectionStatus = 'syncing';
    const outboundBlockOps = this.pendingBlockOps.splice(0, this.pendingBlockOps.length);
    const outboundHomelandAttacks = this.pendingHomelandAttacks.splice(0, this.pendingHomelandAttacks.length);
    const outboundHomelandPurchases = this.pendingHomelandPurchases.splice(0, this.pendingHomelandPurchases.length);
    const outboundHomelandPlacements = this.pendingHomelandPlacements.splice(0, this.pendingHomelandPlacements.length);
    const outboundPvPAttacks = this.pendingPvPAttacks.splice(0, this.pendingPvPAttacks.length);
    try {
      const payload = await this._post(`/api/sessions/${this.state.multiplayer.sessionId}/sync`, {
        playerName: this.state.playerName,
        player: this._snapshotPlayer(),
        sinceBlockSeq: this.state.multiplayer.latestBlockSeq,
        blockOps: outboundBlockOps,
        homelandActions: {
          attacks: outboundHomelandAttacks,
          purchases: outboundHomelandPurchases,
          placements: outboundHomelandPlacements,
        },
        pvpActions: {
          attacks: outboundPvPAttacks,
        },
      });
      this._applySync(payload);
    } catch (error) {
      this.pendingBlockOps.unshift(...outboundBlockOps);
      this.pendingHomelandAttacks.unshift(...outboundHomelandAttacks);
      this.pendingHomelandPurchases.unshift(...outboundHomelandPurchases);
      this.pendingHomelandPlacements.unshift(...outboundHomelandPlacements);
      this.pendingPvPAttacks.unshift(...outboundPvPAttacks);
      this.state.multiplayer.connectionStatus = 'error';
      if (String(error.message).includes('session not found')) {
        this._resetSessionState();
        events.emit('status:message', '多人房間已不存在，請重新回到主選單建立或加入房間。');
      } else {
        events.emit('status:message', `${this.state.playerName} 的多人連線中斷，正在等待重新同步。`);
      }
      console.error(error);
    } finally {
      this.syncInFlight = false;
      const shouldResync = this.pendingImmediateSync || this.syncAccumulatorMs >= this.syncIntervalMs;
      this.pendingImmediateSync = false;
      if (shouldResync) {
        this.syncAccumulatorMs = 0;
        void this.syncNow();
      }
    }
  }

  _activateSession(session) {
    this.state.playStyle = 'multiplayer';
    this.state.gameMode = session.mode ?? 'test';
    this.state.multiplayer.enabled = true;
    this.state.multiplayer.sessionId = session.id;
    this.state.multiplayer.sessionName = session.name;
    this.state.multiplayer.sessionMode = session.mode ?? 'test';
    this.state.multiplayer.sessionPlayerCount = session.playerCount ?? 1;
    this.state.multiplayer.latestBlockSeq = 0;
    this.state.multiplayer.connectionStatus = 'online';
    this.state.multiplayer.playerStats = [];
    this.state.multiplayer.pingMs = 0;
    this.syncAccumulatorMs = 0;
    this.lastServerTrafficAt = performance.now();
    this.hasTimedOut = false;
    this.pendingBlockOps = [];
    this.pendingHomelandAttacks = [];
    this.pendingHomelandPurchases = [];
    this.pendingHomelandPlacements = [];
    this.pendingImmediateSync = false;
  }

  _applySync(payload) {
    if (!this.state.multiplayer.enabled) return;
    this.state.multiplayer.connectionStatus = 'online';
    this.state.multiplayer.sessionName = payload.session?.name ?? this.state.multiplayer.sessionName;
    this.state.multiplayer.sessionMode = payload.session?.mode ?? this.state.multiplayer.sessionMode;
    this.state.multiplayer.sessionPlayerCount = payload.session?.playerCount ?? this.state.multiplayer.sessionPlayerCount;

    if (Array.isArray(payload.worldState) && payload.worldState.length > 0) {
      this._applyBlockOps(payload.worldState);
    }
    if (Array.isArray(payload.blockOps) && payload.blockOps.length > 0) {
      this._applyBlockOps(payload.blockOps);
    }

    this.state.multiplayer.latestBlockSeq = payload.latestBlockSeq ?? this.state.multiplayer.latestBlockSeq;

    const others = (payload.players ?? []).filter((player) => player.name !== this.state.playerName);
    const selfPlayer = (payload.players ?? []).find((player) => player.name === this.state.playerName);
    if (selfPlayer?.serverHp !== undefined) {
      this.state.player.hp = Number(selfPlayer.serverHp);
      this.state.player.maxHp = Number(selfPlayer.serverMaxHp ?? this.state.player.maxHp);
    }

    // Restore inventory from server on first sync / reconnect
    if (selfPlayer?.inventoryState && this.inventory) {
      this.inventory.restoreFromSync(selfPlayer.inventoryState);
    }
    // PvP knockback: server tells us we got hit
    if (selfPlayer?.lastHitAt !== undefined) {
      const hitAt = Number(selfPlayer.lastHitAt);
      if (hitAt > (this._lastHitHandled ?? 0)) {
        this._lastHitHandled = hitAt;
        events.emit('pvp:knockback', {
          fromX: Number(selfPlayer.lastHitFromX ?? 0),
          fromZ: Number(selfPlayer.lastHitFromZ ?? 0),
          knockback: Number(selfPlayer.lastHitKnockback ?? 0),
          weaponType: selfPlayer.lastHitWeapon ?? '',
        });
      }
    }

    // PvP respawn: server tells us where to spawn after death
    if (selfPlayer?.respawnX !== undefined && selfPlayer?.respawnZ !== undefined) {
      const respawnUntil = Number(selfPlayer.respawnUntil ?? 0);
      const serverTime = Number(payload.serverTime ?? 0);
      if (respawnUntil > 0 && respawnUntil > serverTime - 2.5 && !this._lastRespawnHandled) {
        this._lastRespawnHandled = respawnUntil;
        events.emit('pvp:respawn', {
          x: Number(selfPlayer.respawnX),
          z: Number(selfPlayer.respawnZ),
        });
      } else if (respawnUntil <= serverTime) {
        this._lastRespawnHandled = null;
      }
    }
    this.state.multiplayer.playerStats = (payload.players ?? [])
      .map((player) => ({
        name: player.name,
        kills: Math.max(0, Math.round(player.scoreKills ?? player.combatKills ?? 0)),
        gold: Math.max(0, Math.round(player.scoreGold ?? 0)),
        pingMs: Math.max(0, Math.round(player.pingMs ?? (player.name === this.state.playerName
          ? this.state.multiplayer.pingMs
          : 0))),
      }))
      .sort((left, right) => {
        if (left.name === this.state.playerName) return -1;
        if (right.name === this.state.playerName) return 1;
        return (right.kills - left.kills) || left.name.localeCompare(right.name);
      });
    this.remotePlayers?.updateRoster(others, { serverTime: payload.serverTime });

    if (payload.homelandState && this.state.gameMode === 'homeland') {
      this.homelandMode?.applyServerState(payload.homelandState);
      this.enemyManager?.syncExternalEnemies(payload.homelandState.enemies ?? []);
      if (payload.homelandState.status === 'defeated') {
        this.state.mode = 'paused';
        events.emit('status:message', '多人守護塔已被摧毀，本局結束。');
      }
    }

    events.emit('hud:update');
  }

  _applyBlockOps(ops) {
    this.suppressBlockSync = true;
    try {
      ops.forEach((op) => {
        if (op.playerName === this.state.playerName) return;
        if (op.type === null || op.type === undefined || op.type === '') {
          this.world.removeBlock(op.x, op.y, op.z);
        } else {
          this.world.setBlock(op.x, op.y, op.z, op.type);
        }
      });
    } finally {
      this.suppressBlockSync = false;
    }
  }

  _snapshotPlayer() {
    const player = this.state.player;
    const snapshot = {
      x: Number(player.position.x.toFixed(2)),
      y: Number(player.position.y.toFixed(2)),
      z: Number(player.position.z.toFixed(2)),
      vx: Number(player.velocity.x.toFixed(2)),
      vy: Number(player.velocity.y.toFixed(2)),
      vz: Number(player.velocity.z.toFixed(2)),
      yaw: Number(player.yaw.toFixed(3)),
      pitch: Number(player.pitch.toFixed(3)),
      hp: Number(player.hp.toFixed(1)),
      maxHp: Number(player.maxHp.toFixed(1)),
      combatKills: Math.round(this.state.combat.kills),
      pingMs: Math.round(this.state.multiplayer.pingMs || 0),
      mode: this.state.mode,
      fruitId: this.state.selectedFruit?.id ?? '',
      selectedSkillId: this.state.getSelectedSkill()?.id ?? '',
      skinId: this.state.selectedSkin?.id ?? '',
      // Attack state for remote animation & VFX
      isAttacking: this.state.combat.punchTime > 0 || this.state.combat.swordSwingTime > 0,
      attackSkillId: this.state.getSelectedSkill()?.id ?? '',
      attackSeq: this.state.combat.attackSeq || 0,
    };

    // Include inventory state for persistence
    if (this.inventory) {
      snapshot.inventoryState = this.inventory.snapshotForSync();
    }

    return snapshot;
  }

  async _post(path, payload) {
    const startedAt = performance.now();
    const response = await fetch(this._makeUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    this._recordServerTraffic(startedAt);

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || `多人連線請求失敗 (${response.status})`);
    }
    return data;
  }

  _makeUrl(path) {
    return `${this.state.multiplayer.serverUrl}${path}`;
  }

  _resetSessionState() {
    this.remotePlayers?.clear();
    this.enemyManager?.clearAll();
    this.state.defense.enabled = false;
    this.state.defense.remoteAuthoritative = false;
    this.state.defense.status = 'idle';
    this.state.defense.turrets = [];
    this.state.multiplayer.enabled = false;
    this.state.multiplayer.sessionId = null;
    this.state.multiplayer.sessionName = '';
    this.state.multiplayer.sessionMode = 'test';
    this.state.multiplayer.connectionStatus = 'offline';
    this.state.multiplayer.playerStats = [];
    this.state.multiplayer.pingMs = 0;
    this.state.multiplayer.latestBlockSeq = 0;
    this.state.multiplayer.sessionPlayerCount = 1;
    this.pendingBlockOps = [];
    this.pendingHomelandAttacks = [];
    this.pendingHomelandPurchases = [];
    this.pendingHomelandPlacements = [];
    this.pendingPvPAttacks = [];
    this.pendingImmediateSync = false;
  }

  _recordServerTraffic(startedAt) {
    this.lastServerTrafficAt = performance.now();
    this.hasTimedOut = false;
    const elapsed = Math.max(0, this.lastServerTrafficAt - startedAt);
    this.state.multiplayer.pingMs = elapsed;
  }

  _handleTrafficTimeout() {
    this.hasTimedOut = true;
    const message = '20 秒內未收到伺服器資料，已返回多人大廳。';
    this._resetSessionState();
    events.emit('multiplayer:disconnected', { message });
  }
}
