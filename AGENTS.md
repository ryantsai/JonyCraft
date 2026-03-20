# AGENTS.md

本文件提供在 JonyCraft 專案中進行開發時的快速對齊資訊。

## 專案摘要

- 第一人稱 voxel 動作沙盒遊戲
- UI 與遊戲內文字皆為 **繁體中文**
- 架構為模組化 class + EventBus
- 含單人與多人（PvP / Homeland）流程

## 本地開發

```bash
npm install
npm run dev
npm run build
npm run preview
```

## 目前程式碼結構

```text
src/
  main.js
  style.css

  config/
    constants.js
    assets.js
    blocks.js
    items.js
    shopItems.js
    skills.js
    fruits.js
    animStyles.js
    enemyTypes.js
    skins.js

  core/
    EventBus.js
    GameState.js
    Inventory.js

  renderer/
    SceneSetup.js
    TextureManager.js
    BlockMaterials.js

  world/
    World.js
    WorldRenderer.js

  player/
    Player.js
    Targeting.js

  combat/
    Combat.js

  enemies/
    EnemyManager.js
    EnemyBehaviors.js
    EnemyModel.js
    Zombie.js

  effects/
    WeaponModels.js
    ScreenEffects.js
    ProjectileSystem.js
    ExplosionEffect.js
    Particles.js
    FruitVFX.js
    FireFistSpawner.js
    DarkPullSpawner.js
    CooldownHUD.js

  modes/
    GameMode.js
    HomelandDefenseMode.js
    MultiplayerHomelandMode.js
    DefenseUtils.js
    CannonTowerSystem.js

  network/
    PlayerIdentity.js
    MultiplayerClient.js
    RemotePlayers.js

  ui/
    template.js
    HUD.js
    FruitSelect.js
    SkinSelect.js
    MultiplayerLobby.js

  input/
    InputManager.js
    MobileControls.js

  audio/
    SoundManager.js

  testing/
    TestingHooks.js
```

## 關鍵設計約定

1. **EventBus 優先**
   - 跨系統事件請走 `events.emit/on`，避免直接相互耦合。

2. **GameState 為共享狀態中心**
   - 主要狀態：`player`、`combat`、`defense`、`selectedFruit`、`modeController`、`multiplayer`。

3. **模式控制器 (modeController)**
   - `main.js` 每幀呼叫 `gameState.modeController?.update(dt)`。
   - 新模式放 `src/modes/`，並在 `main.js` 接上切換流程。

4. **戰鬥走 unified path**
   - 技能資料定義在 config，`Combat.attack()` 統一路徑處理命中、傷害、擊退、VFX 觸發。

5. **多人與單人可共用系統，權威來源要清楚**
   - 多人保衛家園由 server 狀態為主（client 可做有限 optimistic UI）。

## 文件與內容規範

- 遊戲內文案：繁體中文
- 程式碼識別字、註解、技術文件：英文或中英混合皆可，但要一致
- 新增功能時請同步更新：
  - `README.md`（玩家/開發者可見的功能與架構摘要）
  - `progress.md`（重大里程碑）

## 常見修改入口

- 新方塊：`src/config/blocks.js`
- 新果實技能：`src/config/fruits.js`、`src/config/skills.js`、`src/config/animStyles.js`
- 新敵人：`src/config/enemyTypes.js` + `src/enemies/EnemyBehaviors.js`
- 新商城道具：`src/config/shopItems.js`
- 新特效/投射物：`src/effects/`
- 新多人同步欄位：`src/network/MultiplayerClient.js`

## 測試與驗證

- 先跑 `npm run build` 確認可編譯
- 自動化腳本位於 `test-actions*.json`
- 測試 hook 在 `src/testing/TestingHooks.js`

