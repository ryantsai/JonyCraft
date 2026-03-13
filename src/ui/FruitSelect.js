import { FRUITS } from '../config/fruits.js';
import { events } from '../core/EventBus.js';

/**
 * Fruit selection overlay.
 * Shown after the player clicks "進入世界" — they must pick a fruit
 * before the game actually starts.
 */
export class FruitSelect {
  constructor(gameState) {
    this.state = gameState;
    this.overlay = null;
    this.selectedId = null;
  }

  init() {
    this._buildDOM();

    events.on('fruit:show', () => this.show());
  }

  show() {
    this.state.mode = 'fruit_select';
    this.overlay.dataset.hidden = 'false';
    this.selectedId = null;
    this._updateCards();
    this._updateConfirmBtn();
  }

  hide() {
    this.overlay.dataset.hidden = 'true';
  }

  _buildDOM() {
    const overlay = document.createElement('div');
    overlay.id = 'fruit-select';
    overlay.className = 'fruit-select';
    overlay.dataset.hidden = 'true';

    overlay.innerHTML = `
      <div class="fruit-panel">
        <div class="panel-glow"></div>
        <h2 class="fruit-title">選擇你的惡魔果實</h2>
        <p class="fruit-subtitle">每種果實賦予獨特的戰鬥技能</p>
        <div class="fruit-grid" id="fruit-grid"></div>
        <div class="fruit-preview" id="fruit-preview">
          <p class="fruit-preview-placeholder">選擇一個果實查看技能</p>
        </div>
        <button class="fruit-confirm-btn" id="fruit-confirm-btn" type="button" disabled>
          <span class="start-btn-text">確認選擇</span>
          <span class="start-btn-arrow">▶</span>
        </button>
      </div>
    `;

    document.querySelector('.shell').appendChild(overlay);
    this.overlay = overlay;

    const grid = overlay.querySelector('#fruit-grid');
    FRUITS.forEach((fruit) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'fruit-card';
      card.dataset.fruitId = fruit.id;
      card.style.setProperty('--fruit-color', fruit.color);

      card.innerHTML = `
        <span class="fruit-emoji">${this._fruitEmoji(fruit.id)}</span>
        <span class="fruit-card-name">${fruit.name}</span>
      `;

      card.addEventListener('click', () => {
        events.emit('sound:click');
        this.selectedId = fruit.id;
        this._updateCards();
        this._updatePreview(fruit);
        this._updateConfirmBtn();
      });

      grid.appendChild(card);
    });

    const confirmBtn = overlay.querySelector('#fruit-confirm-btn');
    confirmBtn.addEventListener('click', () => {
      if (!this.selectedId) return;
      const fruit = FRUITS.find((f) => f.id === this.selectedId);
      if (!fruit) return;
      events.emit('sound:click');
      this.state.selectFruit(fruit);
      this.hide();
      events.emit('fruit:selected', fruit);
    });
  }

  _updateCards() {
    this.overlay.querySelectorAll('.fruit-card').forEach((card) => {
      card.dataset.selected = String(card.dataset.fruitId === this.selectedId);
    });
  }

  _updateConfirmBtn() {
    const btn = this.overlay.querySelector('#fruit-confirm-btn');
    btn.disabled = !this.selectedId;
  }

  _updatePreview(fruit) {
    const preview = this.overlay.querySelector('#fruit-preview');
    const skillsHtml = fruit.skills.map((s, i) => `
      <div class="fruit-skill-row">
        <span class="fruit-skill-slot">${i + 1}</span>
        <span class="fruit-skill-name">${s.name}</span>
        <span class="fruit-skill-stats">ATK ×${s.damage} · 範圍 ${s.range} · CD ${s.cooldownMs}ms</span>
        ${s.desc ? `<span class="fruit-skill-desc">${s.desc}</span>` : ''}
      </div>
    `).join('');

    preview.innerHTML = `
      <div class="fruit-preview-header" style="color: ${fruit.color}">
        <span class="fruit-preview-emoji">${this._fruitEmoji(fruit.id)}</span>
        <span class="fruit-preview-name">${fruit.name}</span>
      </div>
      <p class="fruit-preview-desc">${fruit.desc}</p>
      <div class="fruit-skill-list">${skillsHtml}</div>
    `;
  }

  _fruitEmoji(id) {
    const map = {
      rubber: '🟤', flame: '🔥', ice: '🧊', lightning: '⚡',
      dark: '🌑', light: '✨', quake: '💥', magma: '🌋',
      sand: '🏜️', bomb: '💣',
    };
    return map[id] || '🍎';
  }
}
