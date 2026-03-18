/**
 * Game HTML shell template. Separated for clarity and future
 * dynamic UI generation (e.g. adding new game mode buttons).
 */
export const gameTemplate = `
  <div class="shell">
    <canvas class="game-canvas" aria-label="JonyCraft 像素沙盒"></canvas>
    <div class="hud">
      <div class="crosshair" aria-hidden="true"></div>
      <div class="status-bar">
        <div id="status-message">正在載入 Kenney 像素資源...</div>
        <div id="status-coords"></div>
      </div>
      <div id="multiplayer-scoreboard" class="multiplayer-scoreboard" data-visible="false" aria-label="多人分數板">
        <div class="multiplayer-scoreboard-header">
          <span>多人分數板</span>
          <span id="multiplayer-ping-label">Ping -- ms</span>
        </div>
        <div class="multiplayer-scoreboard-columns">
          <span>玩家</span>
          <span>K</span>
          <span>G</span>
          <span>Ping</span>
        </div>
        <div id="multiplayer-scoreboard-rows" class="multiplayer-scoreboard-rows"></div>
      </div>
      <div id="defense-scoreboard" class="defense-scoreboard" data-visible="false" aria-label="保衛家園記分板">
        <span>波次 <span id="def-wave">1</span></span>
        <span class="defense-sep">·</span>
        <span>倒數 <span id="def-timer">60</span>s</span>
        <span class="defense-sep">·</span>
        <span>敵人 <span id="def-alive">0</span></span>
      </div>
      <div class="player-health-bar" aria-label="生命值">
        <div class="health-row">
          <span class="health-label">❤ <span id="hp-text">100 / 100</span></span>
          <span id="defense-stats" class="defense-stats" data-visible="false">擊殺 <span id="def-kills">0</span> · 金幣 <span id="def-gold">0</span></span>
        </div>
        <div class="health-track">
          <div id="hp-fill" class="health-fill" style="width: 100%"></div>
        </div>
      </div>
      <div id="debug-panel" class="debug-panel" data-visible="false">
        <button id="debug-fruit-btn" class="debug-toggle-btn" type="button">果實</button>
        <button id="debug-skin-btn" class="debug-toggle-btn" type="button">造型</button>
        <button id="debug-item-btn" class="debug-toggle-btn" type="button">道具</button>
        <div id="debug-fruit-grid" class="debug-grid" data-visible="false"></div>
        <div id="debug-skin-grid" class="debug-grid" data-visible="false"></div>
        <div id="debug-item-grid" class="debug-grid" data-visible="false"></div>
      </div>
      <div id="inventory-panel" class="inventory-panel" data-visible="false">
        <div class="inventory-header">
          <span class="inventory-title">背包</span>
          <button id="inventory-close-btn" class="inventory-close-btn" type="button">✕</button>
        </div>
        <div id="inventory-grid" class="inventory-grid"></div>
        <div class="inventory-hint">點擊自動裝備 · 拖曳至技能欄指定位置 · 右鍵卸除</div>
      </div>
      <div id="merchant-shop-panel" class="merchant-shop-panel" data-visible="false">
        <div class="merchant-shop-header">
          <span class="merchant-shop-title">商人</span>
          <span id="merchant-gold-label" class="merchant-gold-label">金幣: 0</span>
          <button id="merchant-close-btn" class="merchant-close-btn" type="button">✕</button>
        </div>
        <div id="merchant-shop-grid" class="merchant-shop-grid"></div>
      </div>
      <div id="pause-menu" class="pause-menu" data-visible="false">
        <div class="pause-panel">
          <h2 class="pause-title">遊戲暫停</h2>
          <button id="pause-resume-btn" class="pause-btn" type="button">繼續遊戲</button>
          <button id="pause-quit-btn" class="pause-btn pause-btn-quit" type="button">返回主選單</button>
        </div>
      </div>
      <div id="hotbar" class="hotbar" aria-label="技能欄"></div>
      <div id="mobile-controls" class="mobile-controls" aria-label="虛擬搖桿">
        <div class="stick-cluster">
          <div id="move-pad" class="touch-pad" aria-label="移動搖桿">
            <div id="move-knob" class="touch-knob"></div>
          </div>
        </div>
        <div class="mobile-actions">
          <button id="touch-jump" type="button">跳躍</button>
          <button id="touch-primary" type="button">使用</button>
          <button id="touch-secondary" type="button">放置</button>
          <button id="touch-interact" type="button" class="touch-interact-btn" data-visible="false">互動</button>
        </div>
        <button id="touch-pause" class="mobile-pause-btn" type="button">⏸</button>
        <button id="touch-fullscreen" class="mobile-fullscreen-btn" type="button">⛶</button>
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
          <p class="subtitle">像素沙盒冒險</p>
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

        <p class="footer-credit">Kenney 像素素材 · Three.js 引擎</p>
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
          <p class="subtitle">像素沙盒冒險</p>
        </div>

        <div class="menu-divider"></div>

        <div id="mode-select" class="mode-select">
          <p class="section-label">選擇模式</p>
          <div class="mode-list">
            <button class="mode-btn" data-mode="test" type="button">
              <img src="assets/kenney/items/sword_diamond.png" alt="" class="mode-icon" />
              <div class="mode-info">
                <span class="mode-name">測試模式</span>
                <span class="mode-desc">戰鬥、建造、探索</span>
              </div>
            </button>
            <button class="mode-btn mode-btn-active" data-mode="homeland" type="button">
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
              <kbd>1~0</kbd>
              <span>切換技能</span>
            </div>
            <div class="control-item">
              <kbd>Tab (按住)</kbd>
              <span>背包</span>
            </div>
            <div class="control-item">
              <kbd>E</kbd>
              <span>互動</span>
            </div>
          </div>
        </div>

        <button id="start-btn" class="start-btn" type="button">
          <span class="start-btn-text">進入世界</span>
          <span class="start-btn-arrow">▶</span>
        </button>

        <p class="footer-credit">Kenney 像素素材 · Three.js 引擎</p>
      </div>

      <div id="disconnect-screen" class="start-panel menu-page disconnect-screen" data-hidden="true">
        <div class="panel-glow"></div>
        <div class="title-block">
          <div class="title-row">
            <div class="title-icon">
              <img src="assets/kenney/items/gamepad.png" alt="" class="title-block-img" />
            </div>
            <h1 class="game-title">
              <span class="title-jony">連線</span><span class="title-craft">中斷</span>
            </h1>
          </div>
          <p class="subtitle">多人伺服器暫時沒有回應</p>
        </div>
        <div class="menu-divider"></div>
        <p id="disconnect-message" class="disconnect-message">20 秒內未收到伺服器資料，正在返回多人大廳...</p>
        <p class="footer-credit">稍後會自動回到多人房間列表</p>
      </div>
    </div>
  </div>
`;
