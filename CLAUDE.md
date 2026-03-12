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
    skills.js              - Skill/hotbar definitions

  core/
    EventBus.js            - Pub/sub event system for decoupled communication
    GameState.js           - Central game state object

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
    Combat.js              - Attack logic (sword/punch), block break/place

  enemies/
    Zombie.js              - Zombie 3D model creation, tinting
    EnemyManager.js        - Spawning, AI updates, respawn timers

  effects/
    Particles.js           - Hit particle system
    WeaponModels.js        - First-person held weapon models and animation

  input/
    InputManager.js        - Keyboard, mouse, pointer lock
    MobileControls.js      - Virtual gamepad (touch pads + buttons)

  ui/
    template.js            - Game HTML shell template
    HUD.js                 - Hotbar, status bar, start screen

  testing/
    TestingHooks.js        - Automation hooks (render_game_to_text, advanceTime)

public/assets/kenney/      - Kenney voxel textures (tiles, items, particles, zombie, skills)
test-actions*.json         - Playwright automation test scripts
progress.md                - Development log and TODO list
vite.config.js             - Vite config with BASE_PATH env support
```

## Key Architecture Patterns
- **Event Bus**: Systems communicate via `events.emit()`/`events.on()` (e.g. `block:changed`, `hud:update`, `game:enter`). This enables adding multiplayer networking, database hooks, or new systems without modifying existing code.
- **GameState**: Central state object shared by all systems. Future multiplayer: becomes the authoritative client state synced with server.
- **World**: Voxel data stored in a Map keyed by `"x,y,z"` strings. Emits change events so WorldRenderer stays in sync.
- Fixed-timestep game loop (`FIXED_STEP_MS = 1000/60`)
- First-person camera with pointer lock controls
- Skills system: Sword, Rubber Punch, Dirt Block (selectable via hotbar 1/2/3)
- Zombie enemies with health, knockback, respawn mechanics
- AABB collision detection for player-world physics
- Mobile virtual gamepad with dual touch pads

## Commands
- `npm run dev` - Start dev server
- `npm run build` - Production build
- `npm run preview` - Preview production build

## Game Constants
All tuning constants live in `src/config/constants.js`. Key ones:
- `WORLD_SIZE_X/Z = 56`, `WORLD_HEIGHT = 10` - World dimensions
- `MOVE_SPEED = 5.2`, `JUMP_SPEED = 7.6`, `GRAVITY = 22` - Player physics
- `SWORD_RANGE = 3`, `PUNCH_RANGE = 6.2` - Combat ranges
- `ZOMBIE_SPEED = 1.12`, `ZOMBIE_MAX_HEALTH = 3` - Enemy tuning
- `INITIAL_ZOMBIE_COUNT = 5` - Wave size

## Testing
- Automated tests use Playwright with JSON action scripts (`test-actions*.json`)
- Game exposes `window.render_game_to_text` and `window.advanceTime(ms)` for automation
- Tests verify movement, building, combat, knockback, and skill switching

## Game Modes
Players select a game mode from the start screen before entering the world. Currently available:
- **測試模式 (Test)** — The default sandbox with zombies, combat, and building

Future modes will be added as new buttons on the start screen.

## Workflow
- All changes should be submitted as a PR via `gh` CLI and pushed to GitHub
- Create a feature branch, commit, push, and open a PR using `gh pr create`

## Language
- All UI text and labels must be in **Traditional Chinese (繁體中文)**
- Keep code identifiers, comments, and docs in English

## Development Guidelines
- Each system is a class in its own file under the appropriate directory
- New features should be added as new modules, wired in `src/main.js`
- Use the EventBus for cross-system communication instead of direct coupling
- Use Kenney assets from `public/assets/kenney/` for visual consistency
- Maintain the automation testing hooks when modifying game state
- Block textures support per-face definitions (`side`, `top`, `bottom`) or `all`
- Update `progress.md` after significant changes

## Multiplayer & Database Expansion Points
- **GameState**: Add player ID, session management, server sync methods
- **EventBus**: Hook network layer to relay events (block changes, combat, movement)
- **World**: Add serialize/deserialize for save/load and chunk streaming
- **EnemyManager**: Make server-authoritative for multiplayer consistency
- **InputManager**: Forward inputs to server, apply server corrections
