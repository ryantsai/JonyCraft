# JonyCraft

A first-person Minecraft-style voxel sandbox game built with [Three.js](https://threejs.org/) and [Kenney](https://kenney.nl/) voxel asset packs. All UI is in Traditional Chinese (繁體中文).

## Quick Start

```bash
npm install
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Production build
npm run preview   # Preview production build
```

## Code Architecture

The codebase is organized into modular systems that communicate through an event bus, designed for easy expansion (multiplayer, new game modes, database integration).

```
src/
├── main.js                    # Entry point — wires systems, runs game loop
├── style.css                  # All CSS (HUD, overlays, mobile controls)
│
├── config/                    # Static definitions & constants
│   ├── constants.js           # Physics, world size, combat, enemy tuning
│   ├── assets.js              # Asset URL helper (handles Vite base path)
│   ├── blocks.js              # Block type registry (faces, collision flags)
│   └── skills.js              # Hotbar skill definitions
│
├── core/                      # Shared infrastructure
│   ├── EventBus.js            # Pub/sub: decouples systems (block:changed, hud:update, etc.)
│   └── GameState.js           # Central mutable state (player, combat, mode)
│
├── renderer/                  # Three.js rendering layer
│   ├── SceneSetup.js          # Renderer, scene, camera, lights, shared geometries
│   ├── TextureManager.js      # Cached texture loader (nearest-neighbor filtering)
│   └── BlockMaterials.js      # Per-face materials for each block type
│
├── world/                     # Voxel world
│   ├── World.js               # Block data store (Map), terrain generation, queries
│   └── WorldRenderer.js       # Mesh creation/removal synced to world data
│
├── player/                    # Player systems
│   ├── Player.js              # AABB movement, collision, gravity, spawn selection
│   └── Targeting.js           # DDA voxel raycast + enemy target detection
│
├── combat/
│   └── Combat.js              # Sword/punch attacks, block break/place, damage
│
├── enemies/                   # Enemy AI
│   ├── Zombie.js              # 3D model builder, hit flash tinting
│   └── EnemyManager.js        # Spawn logic, AI updates, respawn timers
│
├── effects/                   # Visual effects
│   ├── Particles.js           # Hit particle system (spawn, physics, cleanup)
│   └── WeaponModels.js        # First-person weapon models & swing animations
│
├── input/                     # Input handling
│   ├── InputManager.js        # Keyboard, mouse, pointer lock
│   └── MobileControls.js      # Virtual gamepad (dual touch pads + buttons)
│
├── ui/                        # User interface
│   ├── template.js            # HTML shell (canvas, HUD, start screen)
│   └── HUD.js                 # Hotbar, status bar, start screen logic
│
└── testing/
    └── TestingHooks.js        # Playwright automation (render_game_to_text, advanceTime)
```

## System Communication

Systems are decoupled via an **EventBus** (`src/core/EventBus.js`):

| Event | Emitted by | Consumed by |
|---|---|---|
| `block:changed` | World | WorldRenderer |
| `hud:update` | Combat, Input | HUD |
| `hotbar:rebuild` | InputManager | HUD |
| `hotbar:scroll` | InputManager | HUD |
| `game:enter` | InputManager, HUD | HUD |

This pattern makes it straightforward to add networking, logging, or new systems without modifying existing code.

## Key Design Decisions

- **GameState** is the single source of truth for mutable game state. For multiplayer, it becomes the client-side authoritative state synced with the server.
- **World** stores blocks in a `Map<string, string>` keyed by `"x,y,z"`. It emits change events so the renderer stays in sync without tight coupling.
- **Fixed-timestep simulation** (`1000/60 ms`) ensures deterministic physics regardless of frame rate.
- **Reusable Three.js vectors** avoid per-frame allocations in hot paths.

## Expansion Points

| Feature | Where to add |
|---|---|
| New block types | `src/config/blocks.js` |
| New skills/weapons | `src/config/skills.js` + `src/effects/WeaponModels.js` |
| New enemy types | `src/enemies/` (new file) + register in `EnemyManager` |
| New game modes | `src/ui/template.js` (button) + mode logic in new module |
| Multiplayer networking | Hook into EventBus events + add network layer in `src/core/` |
| Database / save-load | Serialize `World.blocks` + `GameState` in new `src/core/Persistence.js` |
| Inventory system | New `src/player/Inventory.js` + wire to HUD |

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD / Arrow Up/Down | Left stick |
| Look | Mouse / Arrow Left/Right | Right stick |
| Jump | Space | Jump button |
| Use skill | Left click | Use button |
| Place block | Right click (skill 3) | Place button |
| Switch skill | 1/2/3 or scroll wheel | Tap hotbar |
| Fullscreen | F | — |

## Tech Stack

- **Three.js** r180 — 3D rendering
- **Vite** — Dev server & bundler
- **Playwright** — Automated visual testing
- **Kenney Assets** — Voxel textures and sprites
