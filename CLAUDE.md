# JonyCraft

A first-person Minecraft-style voxel sandbox game built with Three.js and Kenney asset packs. Players select game modes from the start menu. All UI and text is in Traditional Chinese (繁體中文).

## Tech Stack
- **Three.js** (r180) for 3D rendering
- **Vite** for dev server and build
- **Playwright** for automated visual testing
- Modular architecture with an event bus for decoupled system communication

## Kenney Assets Source
The full Kenney asset library is available at `/home/ryan/Kenney`. Copy assets from there into `public/assets/kenney/` as needed.

## Project Structure
```
src/
  main.js                  - Entry point: wires all systems, game loop
  style.css                - HUD and overlay styles

  config/
    constants.js           - All tuning constants (physics, world, combat, etc.)
    assets.js              - Asset URL helper
    blocks.js              - Block type definitions (faces, collision, transparency)
    skills.js              - Default skill/hotbar definitions
    fruits.js              - 10 Devil Fruit definitions with per-fruit combat skills & animStyle
    enemyTypes.js          - 11 enemy type definitions (stats, behavior, model, spawn weight)

  core/
    EventBus.js            - Pub/sub event system for decoupled communication
    GameState.js           - Central game state object (player, combat, defense, fruit)

  renderer/
    SceneSetup.js          - Three.js renderer, scene, camera, lighting, groups
    TextureManager.js      - Texture loading with caching
    BlockMaterials.js      - Per-face materials for each block type

  world/
    World.js               - Voxel data store, terrain generation, block queries
    WorldRenderer.js       - Block mesh syncing (create/remove/update meshes)

  player/
    Player.js              - Movement, collision, spawn selection
    Targeting.js           - DDA voxel raycast, enemy target detection

  combat/
    Combat.js              - Unified attack logic via attack(), block break/place, damage

  enemies/
    Zombie.js              - Zombie 3D model creation, tinting (legacy)
    EnemyModel.js          - Generic enemy 3D model builder (used by all enemy types)
    EnemyBehaviors.js      - Enemy AI behaviors (chase, charge, circle, leap, teleport, ranged, explode, regen, flee)
    EnemyManager.js        - Spawning, AI dispatch, projectiles, respawn, defeat/clearAll

  effects/
    Particles.js           - Hit particle system
    WeaponModels.js        - First-person weapon model building and animation
    ScreenEffects.js       - Camera shake, flash overlay, swing burst (extracted from WeaponModels)
    ProjectileSystem.js    - World-space projectile movement, collision, trail particles
    FireFistSpawner.js     - Bridges combat events to ProjectileSystem for fire fist
    FruitVFX.js            - Per-fruit VFX particle definitions and rendering
    CooldownHUD.js         - Cooldown overlay on hotbar items

  input/
    InputManager.js        - Keyboard, mouse, pointer lock
    MobileControls.js      - Virtual gamepad (touch pads + buttons)

  audio/
    SoundManager.js        - Sound effects loading and playback

  config/
    animStyles.js          - Per-fruit animation modifier data (ANIM_MODS)

  modes/
    GameMode.js            - Base class for game modes (provides no-op defaults)
    HomelandDefenseMode.js - Wave-based tower defense mode (extends GameMode)
    DefenseUtils.js        - Tower health bar rendering and fortress building

  ui/
    template.js            - Game HTML shell template (canvas, HUD, defense scoreboard, start screen)
    HUD.js                 - Hotbar, status bar, defense scoreboard, start screen
    FruitSelect.js         - Fruit selection overlay UI

  testing/
    TestingHooks.js        - Automation hooks (render_game_to_text, advanceTime)

public/assets/kenney/      - Kenney voxel textures (tiles, items, particles, zombie, skills)
test-actions*.json         - Playwright automation test scripts
progress.md                - Development log and TODO list
vite.config.js             - Vite config with BASE_PATH env support
```

## Key Architecture Patterns
- **Event Bus**: Systems communicate via `events.emit()`/`events.on()` (e.g. `block:changed`, `hud:update`, `game:enter`, `combat:fruit-attack`, `enemy:killed`, `shop:purchase`). This enables adding multiplayer networking, database hooks, or new systems without modifying existing code.
- **GameState**: Central state object shared by all systems. Includes `player`, `combat`, `defense`, `selectedFruit`, and `modeController`. Future multiplayer: becomes the authoritative client state synced with server.
- **World**: Voxel data stored in a Map keyed by `"x,y,z"` strings. Emits change events so WorldRenderer stays in sync.
- **Mode Controller**: `gameState.modeController` holds the active game mode instance (e.g. `HomelandDefenseMode`). The main loop calls `modeController.update(dt)` each frame. Modes can override enemy targets, add scoring, and manage waves.
- Fixed-timestep game loop (`FIXED_STEP_MS = 1000/60`)
- First-person camera with pointer lock controls
- **Fruit System**: 10 devil fruits (Blox Fruits inspired), each granting 3-4 combat skills with unique stats (damage, range, cooldown, knockback, swingMs, animStyle). Each fruit has an `animStyle` that drives per-fruit animation modifiers (stretchMul, fistScale, shake, flash, swordGlow, arcTilt, swirl, trail). Players select a fruit before entering the world; skills replace the default hotbar.
- **Enemy Type System**: 11 enemy types defined in `enemyTypes.js` (zombie, skeleton, slime, giant, spider, ghost, creeper, wizard, golem, ninja, blaze). Each has unique stats, behavior AI, and model colors. Weighted spawn table for random variety.
- **Enemy Behaviors**: 9 AI behaviors in `EnemyBehaviors.js`: chase, charge, circle, leap, teleport, ranged, explode, regen, flee. Behaviors support defense mode by targeting the tower instead of the player.
- Default skills: Sword, Rubber Punch, Dirt Block (before fruit selection)
- AABB collision detection for player-world and enemy-world physics
- Mobile virtual gamepad with dual touch pads

## Commands
- `npm run dev` - Start dev server
- `npm run build` - Production build
- `npm run preview` - Preview production build

## Game Constants
All tuning constants live in `src/config/constants.js`. Key ones:
- `WORLD_SIZE_X/Z = 56`, `WORLD_HEIGHT = 10` - World dimensions
- `MOVE_SPEED = 5.2`, `JUMP_SPEED = 7.6`, `GRAVITY = 22` - Player physics
- `SWORD_RANGE = 3`, `PUNCH_RANGE = 6.2` - Combat ranges (default skills)
- `ZOMBIE_SPEED = 1.12`, `ZOMBIE_MAX_HEALTH = 3` - Base zombie tuning
- `INITIAL_ZOMBIE_COUNT = 5` - Default wave size

## Testing
- Automated tests use Playwright with JSON action scripts (`test-actions*.json`)
- Game exposes `window.render_game_to_text` and `window.advanceTime(ms)` for automation
- Tests verify movement, building, combat, knockback, and skill switching

## Game Modes
Players select a game mode from the start screen before entering the world:
- **測試模式 (Test)** — Sandbox mode with zombies, combat, and building
- **保衛家園 (Homeland Defense)** — Wave-based tower defense: protect the central fortress from escalating enemy waves. Features a shop system (heal, tower repair, turret purchase) funded by gold earned from kills. Waves scale enemy stats via `ENEMY_MULTIPLIER`.

## Workflow
- All changes should be submitted as a PR via `gh` CLI and pushed to GitHub
- Create a feature branch, commit, push, and open a PR using `gh pr create`

## Language
- All UI text and labels must be in **Traditional Chinese (繁體中文)**
- Keep code identifiers, comments, and docs in English

## Development Guidelines
- Each system is a class in its own file under the appropriate directory
- New features should be added as new modules, wired in `src/main.js`
- New game modes go in `src/modes/` and are activated via `gameState.modeController`
- Use the EventBus for cross-system communication instead of direct coupling
- Use Kenney assets from `public/assets/kenney/` for visual consistency
- Maintain the automation testing hooks when modifying game state
- Block textures support per-face definitions (`side`, `top`, `bottom`) or `all`
- New enemy types go in `src/config/enemyTypes.js` with a behavior from `EnemyBehaviors.js`
- New fruit definitions go in `src/config/fruits.js` with an `animStyle` key matching entries in `src/config/animStyles.js`
- New game modes extend `GameMode` base class in `src/modes/GameMode.js`
- New projectile types use `ProjectileSystem.spawn()` with a trail config
- Combat uses a single unified `attack()` path — all skills (default + fruit) define full stats on the skill object
- Update `progress.md` after significant changes

## Multiplayer & Database Expansion Points
- **GameState**: Add player ID, session management, server sync methods
- **EventBus**: Hook network layer to relay events (block changes, combat, movement)
- **World**: Add serialize/deserialize for save/load and chunk streaming
- **EnemyManager**: Make server-authoritative for multiplayer consistency
- **InputManager**: Forward inputs to server, apply server corrections
