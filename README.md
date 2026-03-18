# JonyCraft

JonyCraft 是一款以 **Three.js** 打造的第一人稱 voxel 沙盒動作遊戲（介面為繁體中文）。
玩家可先選擇遊玩模式，再挑選惡魔果實獲得技能組，進入世界進行建造、戰鬥與保衛據點。

## 快速開始

```bash
npm install
npm run dev       # 開發伺服器 http://localhost:5173
npm run build     # 產生正式版
npm run preview   # 預覽正式版
```

## 目前可玩模式

- **測試模式（Test）**：單人沙盒，含建造與戰鬥。
- **保衛家園（Homeland Defense）**：單人波次防守，保護主塔並使用金幣在商店購買支援。
- **多人連線（PvP / 多人保衛家園）**：透過 `MultiplayerClient` 同步遠端玩家、傷害與家園狀態，並提供 Roblox 風格聊天窗（`T` 開啟、可最小化、200 則歷史訊息緩衝）。

## 核心玩法系統

- **惡魔果實系統**：10 種果實，各自綁定 3~4 個技能（傷害、範圍、冷卻、擊退、動畫風格）。
- **敵人系統**：11 種敵人，行為由 `EnemyBehaviors` 分派（追擊、衝鋒、遠程、再生、爆炸等）。
- **防守模式系統**：主塔血量、波次、金幣、商店、砲塔放置。
- **投射物 / 特效系統**：`ProjectileSystem`、`ExplosionEffect`、`FruitVFX`、`ScreenEffects`。
- **事件匯流排（EventBus）**：用事件串接 UI、戰鬥、音效、模式控制與多人同步。

## 專案結構（精簡）

```text
src/
  main.js                       # 啟動與主迴圈、系統接線

  config/                       # 靜態資料（常數、方塊、果實、敵人、商店等）
  core/                         # GameState、EventBus、Inventory
  renderer/                     # Three.js 場景/材質/貼圖
  world/                        # 方塊資料與世界渲染
  player/                       # 玩家移動與目標選取
  combat/                       # 攻擊、放置、傷害計算
  enemies/                      # 敵人生成、AI、模型
  effects/                      # 粒子、武器動畫、爆炸、投射物
  input/                        # 鍵鼠與行動端控制
  ui/                           # HUD、模板、果實選單、多人大廳
  modes/                        # GameMode、單人/多人保衛家園、砲塔系統
  network/                      # 玩家身分、多人 client、遠端玩家
  audio/                        # 音效管理
  testing/                      # 自動化測試 hooks
```

## 常見擴充點

- 新方塊：`src/config/blocks.js`
- 新果實/技能：`src/config/fruits.js`、`src/config/skills.js`、`src/config/animStyles.js`
- 新敵人/行為：`src/config/enemyTypes.js`、`src/enemies/EnemyBehaviors.js`
- 新模式：`src/modes/` 新增控制器後在 `src/main.js` 接線
- 新網路同步欄位：`src/network/MultiplayerClient.js` + 對應 `GameState`

## 自動化測試

- 測試動作腳本：根目錄 `test-actions*.json`
- 測試 hooks：`window.render_game_to_text`、`window.advanceTime(ms)`（`src/testing/TestingHooks.js`）

## 技術棧

- Three.js
- Vite
- Playwright（測試）
