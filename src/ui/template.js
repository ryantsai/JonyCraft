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
      <div class="player-health-bar" aria-label="生命值">
        <div class="health-label">❤ <span id="hp-text">20 / 20</span></div>
        <div class="health-track">
          <div id="hp-fill" class="health-fill" style="width: 100%"></div>
        </div>
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
      <div class="start-panel">
        <p class="eyebrow">Three.js 沙盒</p>
        <h1>JonyCraft</h1>
        <p class="lead">
          以 Kenney 體素素材打造的 Minecraft 風格沙盒遊戲。
        </p>
        <div id="mode-select" class="mode-select">
          <p class="mode-label">選擇遊戲模式</p>
          <div class="mode-list">
            <button class="mode-btn mode-btn-active" data-mode="test" type="button">測試模式</button>
          </div>
        </div>
        <div class="control-list">
          <span><strong>移動：</strong>WASD 或 方向鍵 上/下</span>
          <span><strong>跳躍：</strong>空白鍵</span>
          <span><strong>視角：</strong>滑鼠 或 方向鍵 左/右</span>
          <span><strong>左鍵：</strong>使用已選技能</span>
          <span><strong>右鍵：</strong>僅在技能 3 時放置泥土</span>
          <span><strong>技能：</strong>1 鑽石劍、2 橡膠拳、3 泥土</span>
          <span><strong>全螢幕：</strong>F</span>
        </div>
        <button id="start-btn" class="start-btn" type="button">進入世界</button>
      </div>
    </div>
  </div>
`;
