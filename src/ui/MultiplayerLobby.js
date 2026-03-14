import { events } from '../core/EventBus.js';
import { rerollPlayerName } from '../network/PlayerIdentity.js';
import { SkinSelect } from './SkinSelect.js';

function suggestedSessionName(playerName) {
  return `${playerName}'s Realm`;
}

export class MultiplayerLobby {
  constructor(gameState, multiplayerClient) {
    this.state = gameState;
    this.multiplayer = multiplayerClient;
    this.overlay = null;
    this.status = null;
    this.serverHostInput = null;
    this.serverPortInput = null;
    this.playerNameEl = null;
    this.sessionsEl = null;
    this.hostModeButtons = [];
    this.skinSelect = null;
    this.busy = false;
  }

  init() {
    this._buildDOM();
    events.on('multiplayer:lobby:show', (payload) => this.show(payload));
  }

  async show(options = {}) {
    this.state.playStyle = 'multiplayer';
    this.overlay.dataset.hidden = 'false';
    const endpoint = this.multiplayer.getServerEndpoint();
    this.serverHostInput.value = endpoint.host;
    this.serverPortInput.value = endpoint.port;
    this._renderIdentity();
    this._renderHostMode();
    this._setStatus('正在載入房間列表...');
    await this.refreshSessions();
    if (options.statusMessage) this._setStatus(options.statusMessage);
  }

  hide() {
    this.overlay.dataset.hidden = 'true';
  }

  async refreshSessions() {
    try {
      this.multiplayer.setServerEndpoint(this.serverHostInput.value, this.serverPortInput.value);
      const sessions = await this.multiplayer.fetchSessions();
      this._renderSessions(sessions);
      this._setStatus(sessions.length > 0 ? '選擇一個房間加入，或直接建立新的房間。' : '目前沒有房間，來建立第一個吧。');
    } catch (error) {
      this._renderSessions([]);
      this._setStatus('找不到多人伺服器。請先執行 `python server/multiplayer_server.py`。');
      console.error(error);
    }
  }

  _buildDOM() {
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      return e;
    };
    const btn = (cls, text, type = 'button') => {
      const b = el('button', cls, text);
      b.type = type;
      return b;
    };

    const overlay = el('div', 'multiplayer-lobby');
    overlay.id = 'multiplayer-lobby';
    overlay.dataset.hidden = 'true';

    const panel = el('div', 'multiplayer-panel');
    panel.appendChild(el('div', 'panel-glow'));

    // Header
    const header = el('div', 'multiplayer-header');
    const headerInfo = el('div');
    const title = el('h2', 'multiplayer-title', '多人連線');
    const subtitle = el('p', 'multiplayer-subtitle', '瀏覽房間模式，或建立新的多人伺服器');
    headerInfo.append(title, subtitle);
    const closeBtn = btn('multiplayer-ghost-btn', '返回主選單');
    closeBtn.id = 'multiplayer-close';
    header.append(headerInfo, closeBtn);
    panel.appendChild(header);

    // Two-column layout
    const columns = el('div', 'multiplayer-columns');

    // Left column: skin select
    const skinCol = el('div', 'multiplayer-col-skin');
    this.skinSelect = new SkinSelect(this.state);
    this.skinSelect.buildDOM(skinCol);

    // Right column: server settings, rooms
    const mainCol = el('div', 'multiplayer-col-main');

    // Identity
    const identity = el('div', 'multiplayer-identity');
    const pill = el('div', 'multiplayer-pill');
    pill.append(el('span', 'pill-label', '玩家名稱'));
    const playerName = el('strong', null, 'Player');
    playerName.id = 'multiplayer-player-name';
    pill.appendChild(playerName);
    const rerollBtn = btn('multiplayer-ghost-btn', '重新隨機');
    rerollBtn.id = 'multiplayer-reroll';
    identity.append(pill, rerollBtn);
    mainCol.appendChild(identity);

    // Endpoint
    const endpointGrid = el('div', 'multiplayer-endpoint-grid');
    const hostField = el('label', 'multiplayer-field');
    hostField.append(el('span', null, '伺服器地址'));
    const hostInput = el('input');
    hostInput.id = 'multiplayer-server-host';
    hostInput.type = 'text';
    hostInput.spellcheck = false;
    hostField.appendChild(hostInput);
    const portField = el('label', 'multiplayer-field');
    portField.append(el('span', null, '連接埠'));
    const portInput = el('input');
    portInput.id = 'multiplayer-server-port';
    portInput.type = 'text';
    portInput.inputMode = 'numeric';
    portField.appendChild(portInput);
    endpointGrid.append(hostField, portField);
    mainCol.appendChild(endpointGrid);

    // Host mode
    const modeField = el('div', 'multiplayer-field');
    modeField.append(el('span', null, '建立新房間時的模式'));
    const modeList = el('div', 'host-mode-list');
    const testModeBtn = btn('host-mode-btn host-mode-btn-active', '測試模式');
    testModeBtn.dataset.hostMode = 'test';
    const homelandModeBtn = btn('host-mode-btn', '保衛家園');
    homelandModeBtn.dataset.hostMode = 'homeland';
    modeList.append(testModeBtn, homelandModeBtn);
    modeField.appendChild(modeList);
    mainCol.appendChild(modeField);

    // Actions
    const actions = el('div', 'multiplayer-actions');
    const refreshBtn = btn('multiplayer-ghost-btn', '重新整理');
    refreshBtn.id = 'multiplayer-refresh';
    const createBtn = btn('start-btn multiplayer-create-btn');
    createBtn.id = 'multiplayer-create';
    createBtn.append(el('span', 'start-btn-text', '建立房間'), el('span', 'start-btn-arrow', '+'));
    actions.append(refreshBtn, createBtn);
    mainCol.appendChild(actions);

    // Status + sessions
    const status = el('div', 'multiplayer-status', '正在準備多人資料...');
    status.id = 'multiplayer-status';
    const sessions = el('div', 'multiplayer-sessions');
    sessions.id = 'multiplayer-sessions';
    mainCol.append(status, sessions);

    columns.append(skinCol, mainCol);
    panel.appendChild(columns);
    overlay.appendChild(panel);

    document.querySelector('.shell').appendChild(overlay);
    this.overlay = overlay;
    this.status = status;
    this.serverHostInput = hostInput;
    this.serverPortInput = portInput;
    this.playerNameEl = playerName;
    this.sessionsEl = sessions;
    this.hostModeButtons = [testModeBtn, homelandModeBtn];

    const refreshEndpoint = async () => {
      if (this.busy) return;
      this._setStatus('正在切換多人伺服器...');
      await this.refreshSessions();
    };

    [this.serverHostInput, this.serverPortInput].forEach((input) => {
      input.addEventListener('change', () => {
        void refreshEndpoint();
      });
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void refreshEndpoint();
      });
    });

    overlay.querySelector('#multiplayer-close').addEventListener('click', () => {
      events.emit('sound:click');
      this.hide();
      events.emit('multiplayer:lobby:closed');
    });

    overlay.querySelector('#multiplayer-reroll').addEventListener('click', () => {
      if (this.busy) return;
      events.emit('sound:click');
      const name = rerollPlayerName();
      this.multiplayer.setPlayerName(name);
      this._renderIdentity();
    });

    this.hostModeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (this.busy) return;
        this.state.multiplayer.sessionMode = button.dataset.hostMode;
        this._renderHostMode();
      });
    });

    overlay.querySelector('#multiplayer-refresh').addEventListener('click', async () => {
      if (this.busy) return;
      events.emit('sound:click');
      this._setStatus('正在重新整理房間列表...');
      await this.refreshSessions();
    });

    overlay.querySelector('#multiplayer-create').addEventListener('click', async () => {
      if (this.busy) return;
      await this._withBusy(async () => {
        events.emit('sound:click');
        this._setStatus('正在建立多人房間...');
        this.multiplayer.setServerEndpoint(this.serverHostInput.value, this.serverPortInput.value);
        await this.multiplayer.createSession(
          suggestedSessionName(this.state.playerName),
          this.state.multiplayer.sessionMode,
        );
        this.hide();
        events.emit('multiplayer:session-ready');
      });
    });
  }

  _renderIdentity() {
    this.playerNameEl.textContent = this.state.playerName;
  }

  _renderHostMode() {
    this.hostModeButtons.forEach((button) => {
      button.classList.toggle('host-mode-btn-active', button.dataset.hostMode === this.state.multiplayer.sessionMode);
    });
  }

  _renderSessions(sessions) {
    this.sessionsEl.textContent = '';
    if (!sessions.length) {
      const empty = document.createElement('div');
      empty.className = 'multiplayer-empty';
      empty.textContent = '還沒有公開房間。建立一個，讓其他玩家加入你。';
      this.sessionsEl.appendChild(empty);
      return;
    }

    sessions.forEach((session) => {
      const card = document.createElement('div');
      card.className = 'session-card';

      const titleRow = document.createElement('div');
      titleRow.className = 'session-title-row';

      const name = document.createElement('div');
      name.className = 'session-name';
      name.textContent = session.name;

      const badge = document.createElement('span');
      badge.className = 'session-badge';
      badge.textContent = `${session.playerCount} 人`;

      titleRow.append(name, badge);

      const meta = document.createElement('div');
      meta.className = 'session-meta';
      const modeLabel = session.mode === 'homeland' ? '保衛家園' : '測試模式';
      meta.textContent = `${session.status === 'active' ? '遊戲中' : '等待中'} · ${modeLabel} · 房主 ${session.owner}`;

      const roster = document.createElement('div');
      roster.className = 'session-roster';
      roster.textContent = (session.players ?? []).join(' · ');

      const join = document.createElement('button');
      join.className = 'session-join-btn';
      join.type = 'button';
      join.textContent = '加入';
      join.addEventListener('click', async () => {
        if (this.busy) return;
        await this._withBusy(async () => {
          events.emit('sound:click');
          this._setStatus(`正在加入 ${session.name}...`);
          this.multiplayer.setServerEndpoint(this.serverHostInput.value, this.serverPortInput.value);
          await this.multiplayer.joinSession(session.id);
          this.hide();
          events.emit('multiplayer:session-ready');
        });
      });

      card.append(titleRow, meta, roster, join);
      this.sessionsEl.appendChild(card);
    });
  }

  _setStatus(text) {
    this.status.textContent = text;
  }

  async _withBusy(task) {
    this.busy = true;
    try {
      await task();
    } catch (error) {
      this._setStatus(error.message || '多人連線發生錯誤。');
      console.error(error);
    } finally {
      this.busy = false;
    }
  }
}
