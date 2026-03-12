# JonyCraft

A first-person Minecraft-style voxel sandbox game built with Three.js and Kenney asset packs. Players select game modes from the start menu. All UI and text is in Traditional Chinese (繁體中文).

## Tech Stack
- **Three.js** (r180) for 3D rendering
- **Vite** for dev server and build
- **Playwright** for automated visual testing
- Single-file architecture: all game logic lives in `src/main.js` (~1700 lines)

## Kenney Assets Source
The full Kenney asset library is available at `/home/ryan/Kenney`. Copy assets from there into `public/assets/kenney/` as needed.

## Project Structure
```
src/main.js          - All game logic (rendering, physics, combat, terrain, UI)
src/style.css        - HUD and overlay styles
public/assets/kenney/ - Kenney voxel textures (tiles, items, particles, zombie, sky, skills)
test-actions*.json   - Playwright automation test scripts
progress.md          - Development log and TODO list
vite.config.js       - Vite config with BASE_PATH env support
```

## Key Architecture Patterns
- Flat voxel world stored as a 3D array (`blocks[x][y][z]`)
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
All tuning constants are at the top of `src/main.js` (lines 70-93). Key ones:
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
- When adding features, keep everything in `src/main.js` unless there's a strong reason to split
- Use Kenney assets from `public/assets/kenney/` for visual consistency
- Maintain the automation testing hooks when modifying game state
- Block textures support per-face definitions (`side`, `top`, `bottom`) or `all`
- Update `progress.md` after significant changes
