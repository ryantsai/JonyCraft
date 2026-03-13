# JonyCraft

A first-person Minecraft-style voxel sandbox game built with [Three.js](https://threejs.org/) and [Kenney](https://kenney.nl/) voxel asset packs. All UI is in Traditional Chinese (繁體中文).

## Quick Start

```bash
npm install
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Production build
npm run preview   # Preview production build
```

## Game Modes

- **測試模式 (Test)** — Sandbox with combat, building, and exploration
- **保衛家園 (Homeland Defense)** — Wave-based tower defense: protect the central fortress from escalating enemy waves, earn gold, purchase upgrades

## Devil Fruit System

Before entering the world, players choose one of 10 Devil Fruits (inspired by Blox Fruits / One Piece). Each fruit grants 3–4 combat skills with unique stats and animations:

| Fruit | Skills | Style |
|---|---|---|
| 橡膠果實 (Rubber) | Pistol, Shotgun, Bazooka, Bell | Long-range stretchy punches |
| 火焰果實 (Flame) | Fire Fist, Fire Pillar, Flame Emperor | Fire-tinted, screen shake |
| 冰凍果實 (Ice) | Ice Spear, Ice Age, Ice Saber | Sword & punch, cyan particles |
| 閃電果實 (Lightning) | Thunder Bolt, Lightning Rush, Thunder Dragon | Ultra-fast, bright flash |
| 暗暗果實 (Dark) | Dark Pull, Black Hole, Liberation | Gravity pull, purple effects |
| 光光果實 (Light) | Light Beam, Flash Step, Light Sword, Laser Rain | Fastest attacks, bright glow |
| 震震果實 (Quake) | Quake Punch, Seismic Wave, Space Shatter | Heavy impact, strong shake |
| 岩漿果實 (Magma) | Eruption, Meteor Volcano, Magma Hound | Red glow, large fist |
| 沙沙果實 (Sand) | Desert Sword, Sand Trap, Sandstorm | Sword & punch mix |
| 爆爆果實 (Bomb) | Bomb Punch, Land Mine, Big Explosion | Explosive flash, high damage |

Each skill has: damage multiplier, attack range, swing speed, cooldown, knockback strength, and particle effects.

## Enemy Types (11)

| Type | Behavior | Special |
|---|---|---|
| 殭屍 (Zombie) | Chase | Basic melee |
| 骷髏射手 (Skeleton) | Ranged | Projectile attacks |
| 史萊姆 (Slime) | Leap | Bouncing squash/stretch |
| 巨人 (Giant) | Charge | High HP, charge attack |
| 蜘蛛 (Spider) | Circle | Fast circling + dash |
| 幽靈 (Ghost) | Teleport | Teleports near player |
| 爆破者 (Creeper) | Explode | Fuse → explosion destroys blocks |
| 巫師 (Wizard) | Ranged | Teleports away when close |
| 石像 (Golem) | Regen | High HP/defense, regenerates |
| 忍者 (Ninja) | Flee | Backstab, runs when facing |
| 烈焰人 (Blaze) | Ranged | Burst-fire projectiles, floats |

## Code Architecture

Modular systems communicate through an event bus, designed for easy expansion.

```
src/
├── main.js                    # Entry point — wires systems, runs game loop
├── style.css                  # All CSS (HUD, overlays, mobile controls)
│
├── config/                    # Static definitions & constants
│   ├── constants.js           # Physics, world size, combat, enemy tuning
│   ├── assets.js              # Asset URL helper (handles Vite base path)
│   ├── blocks.js              # Block type registry (faces, collision flags)
│   ├── skills.js              # Default hotbar skill definitions
│   ├── fruits.js              # 10 Devil Fruit definitions with skills & animStyle
│   └── enemyTypes.js          # 11 enemy type definitions with spawn weights
│
├── core/                      # Shared infrastructure
│   ├── EventBus.js            # Pub/sub: decouples systems
│   └── GameState.js           # Central mutable state (player, combat, defense, fruit)
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
│   └── Combat.js              # Sword/punch/fruit attacks, block break/place, damage
│
├── enemies/                   # Enemy AI
│   ├── Zombie.js              # Legacy zombie model builder
│   ├── EnemyModel.js          # Generic enemy 3D model builder
│   ├── EnemyBehaviors.js      # 9 AI behaviors (chase, charge, circle, leap, etc.)
│   └── EnemyManager.js        # Spawn logic, AI dispatch, projectiles, defeat/cleanup
│
├── effects/                   # Visual effects
│   ├── Particles.js           # Hit particle system (spawn, physics, cleanup)
│   └── WeaponModels.js        # First-person weapons, per-fruit animations, shake/flash
│
├── input/                     # Input handling
│   ├── InputManager.js        # Keyboard, mouse, pointer lock
│   └── MobileControls.js      # Virtual gamepad (dual touch pads + buttons)
│
├── audio/
│   └── SoundManager.js        # Sound effects loading and playback
│
├── modes/                     # Game mode controllers
│   └── HomelandDefenseMode.js # Wave defense: fortress, turrets, shop, wave scaling
│
├── ui/                        # User interface
│   ├── template.js            # HTML shell (canvas, HUD, defense scoreboard, start screen)
│   ├── HUD.js                 # Hotbar, status bar, defense scoreboard, start screen
│   └── FruitSelect.js         # Fruit selection overlay UI
│
└── testing/
    └── TestingHooks.js        # Playwright automation (render_game_to_text, advanceTime)
```

## System Communication

Systems are decoupled via an **EventBus** (`src/core/EventBus.js`):

| Event | Emitted by | Consumed by |
|---|---|---|
| `block:changed` | World | WorldRenderer |
| `hud:update` | Combat, EnemyManager, HomelandDefense | HUD |
| `hotbar:rebuild` | InputManager | HUD |
| `hotbar:scroll` | InputManager | HUD |
| `game:enter` | InputManager, HUD | HUD |
| `fruit:show` | HUD | FruitSelect |
| `fruit:selected` | FruitSelect | main.js (activates mode) |
| `combat:fruit-attack` | Combat | WeaponModels (shake, flash) |
| `enemy:killed` | EnemyManager | HomelandDefenseMode (gold/kills) |
| `shop:purchase` | HUD | HomelandDefenseMode |
| `status:message` | HomelandDefense | HUD |

## Key Design Decisions

- **GameState** is the single source of truth for mutable game state. Includes `defense` state for tower defense mode and `modeController` for the active game mode.
- **Mode Controller pattern**: `gameState.modeController` holds the active game mode instance. The main loop calls `modeController.update(dt)`. Modes can override enemy targets, scoring, and wave management.
- **World** stores blocks in a `Map<string, string>` keyed by `"x,y,z"`. Emits change events so the renderer stays in sync.
- **Fixed-timestep simulation** (`1000/60 ms`) ensures deterministic physics regardless of frame rate.
- **Reusable Three.js vectors** avoid per-frame allocations in hot paths.
- **Per-fruit animation modifiers** (`ANIM_MODS` in WeaponModels) control stretchMul, fistScale, shake, flashAlpha, swordGlow, arcTilt, swirl, and trail per fruit type.

## Expansion Points

| Feature | Where to add |
|---|---|
| New block types | `src/config/blocks.js` |
| New skills/weapons | `src/config/skills.js` + `src/effects/WeaponModels.js` |
| New Devil Fruits | `src/config/fruits.js` + add animStyle entry in `WeaponModels.ANIM_MODS` |
| New enemy types | `src/config/enemyTypes.js` (define stats + behavior key) |
| New enemy behaviors | `src/enemies/EnemyBehaviors.js` + register in `BEHAVIORS` map |
| New game modes | `src/modes/` (new file) + button in `template.js` + activate in `main.js` |
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
| Place block | Right click (block skill) | Place button |
| Switch skill | 1/2/3/4 or scroll wheel | Tap hotbar |
| Fullscreen | F | — |

## Tech Stack

- **Three.js** r180 — 3D rendering
- **Vite** — Dev server & bundler
- **Playwright** — Automated visual testing
- **Kenney Assets** — Voxel textures and sprites
