/**
 * Game HTML shell template. Separated for clarity and future
 * dynamic UI generation (e.g. adding new game mode buttons).
 */
export const gameTemplate = `
  <div class="shell">
    <canvas class="game-canvas" aria-label="JonyCraft 體素沙盒"></canvas>
    <div class="hud">
      <div class="crosshair" aria-hidden="true"></div>
      <div class="status-bar">
        <div id="status-message">正在載入 Kenney 體素資源...</div>
        <div id="status-coords"></div>
      </div>
      <div id="defense-scoreboard" class="defense-scoreboard" data-visible="false" aria-label="保衛家園記分板">
        <div class="defense-row">波次 <span id="def-wave">1</span> · 倒數 <span id="def-timer">60</span>s</div>
        <div class="defense-row">守護塔 HP <span id="def-tower">240/240</span></div>
        <div class="defense-row">總擊殺 <span id="def-kills">0</span> · 金幣 <span id="def-gold">0</span></div>
        <div class="defense-shop">
          <button class="defense-shop-btn" data-shop-item="heal" type="button">+45 生命 (15金)</button>
          <button class="defense-shop-btn" data-shop-item="tower" type="button">修復塔 (25金)</button>
          <button class="defense-shop-btn" data-shop-item="turret" type="button">自動砲塔 (40金)</button>
        </div>
      </div>
      <div class="player-health-bar" aria-label="生命值">
        <div class="health-label">❤ <span id="hp-text">100 / 100</span></div>
        <div class="health-track">
          <div id="hp-fill" class="health-fill" style="width: 100%"></div>
        </div>
        <div id="homebase-hp" class="homebase-hp" data-visible="false">🏰 基地塔 HP <span id="homebase-hp-text">240 / 240</span></div>
      </div>
      <div id="hotbar" class="hotbar" aria-label="技能欄"></div>
      <div id="mobile-controls" class="mobile-controls" aria-label="虛擬搖桿">
        <div class="stick-cluster">
          <div id="move-pad" class="touch-pad" aria-label="移動搖桿">
            <div id="move-knob" class="touch-knob"></div>
          </div>
          <div id="look-pad" class="touch-pad" aria-label="視角搖桿">
            <div id="look-knob" class="touch-knob"></div>
          </div>
        </div>
        <div class="mobile-actions">
          <button id="touch-jump" type="button">跳躍</button>
          <button id="touch-primary" type="button">使用</button>
          <button id="touch-secondary" type="button">放置</button>
        </div>
      </div>
    </div>
    <div id="start-screen" class="start-screen">
      <div class="menu-particles" aria-hidden="true"></div>
      <div id="menu-home-screen" class="start-panel menu-page">
        <div class="panel-glow"></div>
        <div class="title-block">
          <div class="title-row">
            <div class="title-icon">
              <img src="assets/kenney/tiles/dirt_grass.png" alt="" class="title-block-img" />
            </div>
            <h1 class="game-title">
              <span class="title-jony">Jony</span><span class="title-craft">Craft</span>
            </h1>
          </div>
          <p class="subtitle">體素沙盒冒險</p>
        </div>

        <div class="menu-divider"></div>

        <div class="play-style-section">
          <p class="section-label">選擇遊玩方式</p>
          <div class="play-style-list">
            <button id="choose-singleplayer-btn" class="play-style-btn" type="button">
              <img src="assets/kenney/items/singleplayer.png" alt="" class="mode-icon" />
              <div class="mode-info">
                <span class="mode-name">單人遊戲</span>
                <span class="mode-desc">直接選擇測試模式或保衛家園</span>
              </div>
            </button>
            <button id="choose-multiplayer-btn" class="play-style-btn" type="button">
              <img src="assets/kenney/items/gamepad.png" alt="" class="mode-icon" />
              <div class="mode-info">
                <span class="mode-name">多人連線</span>
                <span class="mode-desc">瀏覽房間、查看模式，或建立新的伺服器</span>
              </div>
            </button>
          </div>
        </div>

        <div class="menu-divider"></div>

        <div class="controls-section">
          <p class="section-label">操作說明</p>
          <div class="control-grid">
            <div class="control-item">
              <kbd>W A S D</kbd>
              <span>移動</span>
            </div>
            <div class="control-item">
              <kbd>空白鍵</kbd>
              <span>跳躍</span>
            </div>
            <div class="control-item">
              <kbd>滑鼠</kbd>
              <span>視角</span>
            </div>
            <div class="control-item">
              <kbd>左鍵</kbd>
              <span>攻擊</span>
            </div>
            <div class="control-item">
              <kbd>右鍵</kbd>
              <span>放置方塊</span>
            </div>
            <div class="control-item">
              <kbd>1 2 3 4</kbd>
              <span>切換技能</span>
            </div>
          </div>
        </div>

        <p class="footer-credit">Kenney 體素素材 · Three.js 引擎</p>
      </div>

      <div id="singleplayer-screen" class="start-panel menu-page" data-hidden="true">
        <div class="panel-glow"></div>
        <button id="singleplayer-back-btn" class="menu-back-btn" type="button">← 返回</button>
        <div class="title-block">
          <div class="title-row">
            <div class="title-icon">
              <img src="assets/kenney/tiles/dirt_grass.png" alt="" class="title-block-img" />
            </div>
            <h1 class="game-title">
              <span class="title-jony">Jony</span><span class="title-craft">Craft</span>
            </h1>
          </div>
          <p class="subtitle">體素沙盒冒險</p>
        </div>

        <div class="menu-divider"></div>

        <div id="mode-select" class="mode-select">
          <p class="section-label">選擇模式</p>
          <div class="mode-list">
            <button class="mode-btn mode-btn-active" data-mode="test" type="button">
              <img src="assets/kenney/items/sword_diamond.png" alt="" class="mode-icon" />
              <div class="mode-info">
                <span class="mode-name">測試模式</span>
                <span class="mode-desc">戰鬥、建造、探索</span>
              </div>
            </button>
            <button class="mode-btn" data-mode="homeland" type="button">
              <img src="assets/kenney/items/trophy.png" alt="" class="mode-icon" />
              <div class="mode-info">
                <span class="mode-name">保衛家園</span>
                <span class="mode-desc">守住中心堡壘，迎戰無盡波次</span>
              </div>
            </button>
          </div>
        </div>

        <div class="menu-divider"></div>

        <div class="controls-section">
          <p class="section-label">操作說明</p>
          <div class="control-grid">
            <div class="control-item">
              <kbd>W A S D</kbd>
              <span>移動</span>
            </div>
            <div class="control-item">
              <kbd>空白鍵</kbd>
              <span>跳躍</span>
            </div>
            <div class="control-item">
              <kbd>滑鼠</kbd>
              <span>視角</span>
            </div>
            <div class="control-item">
              <kbd>左鍵</kbd>
              <span>攻擊</span>
            </div>
            <div class="control-item">
              <kbd>右鍵</kbd>
              <span>放置方塊</span>
            </div>
            <div class="control-item">
              <kbd>1 2 3 4</kbd>
              <span>切換技能</span>
            </div>
          </div>
        </div>

        <button id="start-btn" class="start-btn" type="button">
          <span class="start-btn-text">進入世界</span>
          <span class="start-btn-arrow">▶</span>
        </button>

        <p class="footer-credit">Kenney 體素素材 · Three.js 引擎</p>
      </div>
    </div>
  </div>
`;
