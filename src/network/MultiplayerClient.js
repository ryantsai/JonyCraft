import { events } from '../core/EventBus.js';

function defaultServerUrl() {
  const { protocol, hostname } = window.location;
  const safeProtocol = protocol === 'https:' ? 'https:' : 'http:';
  return `${safeProtocol}//${hostname || '127.0.0.1'}:8765`;
}

function trimUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

export class MultiplayerClient {
  constructor(gameState, world) {
    this.state = gameState;
    this.world = world;
    this.remotePlayers = null;
    this.syncAccumulatorMs = 0;
    this.syncIntervalMs = 180;
    this.syncInFlight = false;
    this.pendingBlockOps = [];
    this.suppressBlockSync = false;
    this.state.multiplayer.serverUrl = defaultServerUrl();
  }

  init() {
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

  setPlayerName(name) {
    this.state.playerName = name;
  }

  setServerUrl(url) {
    this.state.multiplayer.serverUrl = trimUrl(url) || defaultServerUrl();
  }

  async fetchSessions() {
    const response = await fetch(this._makeUrl('/api/sessions'));
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
      // Leaving is best-effort; the server will also clean up stale players.
    }
    this.remotePlayers?.clear();
    this.pendingBlockOps = [];
    this.state.multiplayer.enabled = false;
    this.state.multiplayer.sessionId = null;
    this.state.multiplayer.sessionName = '';
    this.state.multiplayer.sessionMode = 'test';
    this.state.multiplayer.connectionStatus = 'offline';
    this.state.multiplayer.latestBlockSeq = 0;
    this.state.multiplayer.sessionPlayerCount = 1;
  }

  update(dt) {
    if (!this.state.multiplayer.enabled || !this.state.multiplayer.sessionId) return;
    this.syncAccumulatorMs += dt * 1000;
    if (this.syncAccumulatorMs < this.syncIntervalMs) return;
    this.syncAccumulatorMs = 0;
    void this.syncNow();
  }

  async syncNow(force = false) {
    if (!this.state.multiplayer.enabled || !this.state.multiplayer.sessionId) return;
    if (!force && this.syncInFlight) return;

    this.syncInFlight = true;
    this.state.multiplayer.connectionStatus = 'syncing';
    const outboundBlockOps = this.pendingBlockOps.splice(0, this.pendingBlockOps.length);
    try {
      const payload = await this._post(`/api/sessions/${this.state.multiplayer.sessionId}/sync`, {
        playerName: this.state.playerName,
        player: this._snapshotPlayer(),
        sinceBlockSeq: this.state.multiplayer.latestBlockSeq,
        blockOps: outboundBlockOps,
      });
      this._applySync(payload);
    } catch (error) {
      this.pendingBlockOps.unshift(...outboundBlockOps);
      this.state.multiplayer.connectionStatus = 'error';
      if (String(error.message).includes('session not found')) {
        this.remotePlayers?.clear();
        this.state.multiplayer.enabled = false;
        this.state.multiplayer.sessionId = null;
        this.state.multiplayer.sessionName = '';
        this.state.multiplayer.sessionMode = 'test';
        this.state.multiplayer.latestBlockSeq = 0;
        this.state.multiplayer.sessionPlayerCount = 1;
        this.state.multiplayer.connectionStatus = 'offline';
        events.emit('status:message', '多人房間已不存在，請重新回到主選單建立或加入房間。');
      } else {
        events.emit('status:message', `${this.state.playerName} 的多人連線中斷，正在等待重新同步。`);
      }
      console.error(error);
    } finally {
      this.syncInFlight = false;
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
    this.syncAccumulatorMs = 0;
    this.pendingBlockOps = [];
  }

  _applySync(payload) {
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
    this.remotePlayers?.updateRoster(others);
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
    return {
      x: Number(player.position.x.toFixed(2)),
      y: Number(player.position.y.toFixed(2)),
      z: Number(player.position.z.toFixed(2)),
      yaw: Number(player.yaw.toFixed(3)),
      pitch: Number(player.pitch.toFixed(3)),
      mode: this.state.mode,
      fruitId: this.state.selectedFruit?.id ?? '',
      selectedSkillId: this.state.getSelectedSkill()?.id ?? '',
    };
  }

  async _post(path, payload) {
    const response = await fetch(this._makeUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

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
    return `${trimUrl(this.state.multiplayer.serverUrl) || defaultServerUrl()}${path}`;
  }
}
