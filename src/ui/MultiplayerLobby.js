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
    const overlay = document.createElement('div');
    overlay.id = 'multiplayer-lobby';
    overlay.className = 'multiplayer-lobby';
    overlay.dataset.hidden = 'true';
    overlay.innerHTML = `
      <div class="multiplayer-panel">
        <div class="panel-glow"></div>
        <div class="multiplayer-header">
          <div>
            <h2 class="multiplayer-title">多人連線</h2>
            <p class="multiplayer-subtitle">瀏覽房間模式，或建立新的多人伺服器</p>
          </div>
          <button id="multiplayer-close" class="multiplayer-ghost-btn" type="button">返回主選單</button>
        </div>

        <div class="multiplayer-identity">
          <div class="multiplayer-pill">
            <span class="pill-label">玩家名稱</span>
            <strong id="multiplayer-player-name">Player</strong>
          </div>
          <button id="multiplayer-reroll" class="multiplayer-ghost-btn" type="button">重新隨機</button>
        </div>

        <div class="multiplayer-endpoint-grid">
          <label class="multiplayer-field">
            <span>伺服器地址</span>
            <input id="multiplayer-server-host" type="text" spellcheck="false" />
          </label>
          <label class="multiplayer-field">
            <span>連接埠</span>
            <input id="multiplayer-server-port" type="text" inputmode="numeric" />
          </label>
        </div>

        <div class="multiplayer-field">
          <span>建立新房間時的模式</span>
          <div class="host-mode-list">
            <button class="host-mode-btn host-mode-btn-active" data-host-mode="test" type="button">測試模式</button>
            <button class="host-mode-btn" data-host-mode="homeland" type="button">保衛家園</button>
          </div>
        </div>

        <div class="multiplayer-actions">
          <button id="multiplayer-refresh" class="multiplayer-ghost-btn" type="button">重新整理</button>
          <button id="multiplayer-create" class="start-btn multiplayer-create-btn" type="button">
            <span class="start-btn-text">建立房間</span>
            <span class="start-btn-arrow">+</span>
          </button>
        </div>

        <div id="multiplayer-status" class="multiplayer-status">正在準備多人資料...</div>
        <div id="multiplayer-sessions" class="multiplayer-sessions"></div>
      </div>
    `;

    document.querySelector('.shell').appendChild(overlay);
    this.overlay = overlay;
    this.status = overlay.querySelector('#multiplayer-status');
    this.serverHostInput = overlay.querySelector('#multiplayer-server-host');
    this.serverPortInput = overlay.querySelector('#multiplayer-server-port');
    this.playerNameEl = overlay.querySelector('#multiplayer-player-name');
    this.sessionsEl = overlay.querySelector('#multiplayer-sessions');
    this.hostModeButtons = Array.from(overlay.querySelectorAll('.host-mode-btn'));

    this.skinSelect = new SkinSelect(this.state);
    const panel = overlay.querySelector('.multiplayer-panel');
    const actionsEl = overlay.querySelector('.multiplayer-actions');
    const skinContainer = document.createElement('div');
    skinContainer.className = 'multiplayer-field';
    panel.insertBefore(skinContainer, actionsEl);
    this.skinSelect.buildDOM(skinContainer);

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
