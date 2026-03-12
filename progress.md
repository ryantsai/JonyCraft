Original prompt: Create a web based minecraft cline with three.js, using assets from Kenney pack I've downloaded from here: C:\Users\ryan.RYAN5080\Desktop\Kenney

2026-03-12
- Started a fresh project in an empty workspace.
- Selected Kenney `2D assets/Voxel Pack` as the primary source for block textures and skybox art.
- Planned first playable scope: procedural voxel terrain, first-person controls, jumping/collision, place/break actions, hotbar, and deterministic testing hooks.
- Scaffolded a Vite + Three.js app with a centered canvas, start screen, HUD, crosshair, and hotbar.
- Copied Kenney voxel textures for grass, dirt, stone, sand, trunk, leaves, brick, and water into `public/assets/kenney`.
- Implemented procedural terrain generation with beaches, water, hills, and tree placement.
- Added first-person movement, jumping, collisions, block targeting, block breaking, and block placement.
- Added a first-person diamond sword using Kenney `sword_diamond.png`, with swing animation and melee cooldown.
- Added a Kenney-textured zombie enemy that spawns in front of the player, can be targeted in melee range, takes 3 hits to kill, and respawns after a short delay.
- Repositioned and scaled the sword so it stays visible in the first-person view instead of hiding at the screen edge.
- Added zombie knockback on sword hits, with short recovery time before it resumes chasing.
- Replaced the zombie's paper-like sprite body with boxy 3D body parts so it reads as a solid voxel-style enemy.
- Locked zombie facing to horizontal rotation only so the 3D body stays assembled instead of tipping and looking broken.
- Reworked the sword animation into a wider diagonal slash with clearer wind-up and follow-through.
- Added Kenney-based hit particles on sword impacts and enemy deaths, with brighter additive sprites so impacts read clearly on screen.
- Tightened melee hit detection so close-range front-facing slashes register more reliably.
- Re-anchored the first-person sword so the hilt sits in the lower-right and the blade angles inward toward the screen center.
- Switched zombie face materials from blended transparency to alpha-cutout opaque rendering and increased part depth to avoid angle-based see-through artifacts.
- Exposed `window.render_game_to_text` and `window.advanceTime(ms)` for automation-friendly testing.
- Verified the app with `npm run build`.
- Verified gameplay using the `develop-web-game` Playwright client:
  - `test-actions.json` checked movement/jump flow and visual spawn quality.
  - `test-actions-build.json` confirmed target selection and visible block placement in the world.
  - `test-actions-zombie-look.json` captured the zombie alive and in melee range.
  - `test-actions-combat.json` confirmed sword hits reduce zombie health and can complete a kill (`kills: 1` in automation state output).
  - `test-actions-knockback.json` confirmed one-hit knockback via state delta and screenshot review.
- Adjusted spawn selection to prefer open ground and removed auto-pointer-lock on start to keep automated runs stable.

TODO
- Optional polish: add chunk meshing or instancing if the world size grows beyond the current compact sandbox.
- Optional polish: expand the hotbar with more Kenney voxel block variants and a simple save/load layer.
