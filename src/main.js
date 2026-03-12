import './style.css';

import { FIXED_STEP_MS, LOOK_SPEED } from './config/constants.js';
import { events } from './core/EventBus.js';
import { GameState } from './core/GameState.js';
import { TextureManager } from './renderer/TextureManager.js';
import { SceneSetup } from './renderer/SceneSetup.js';
import { BlockMaterials } from './renderer/BlockMaterials.js';
import { World } from './world/World.js';
import { WorldRenderer } from './world/WorldRenderer.js';
import { PlayerController } from './player/Player.js';
import { Targeting } from './player/Targeting.js';
import { EnemyManager } from './enemies/EnemyManager.js';
import { ParticleSystem } from './effects/Particles.js';
import { WeaponModels } from './effects/WeaponModels.js';
import { CombatSystem } from './combat/Combat.js';
import { InputManager } from './input/InputManager.js';
import { MobileControls } from './input/MobileControls.js';
import { HUD } from './ui/HUD.js';
import { TestingHooks } from './testing/TestingHooks.js';
import { gameTemplate } from './ui/template.js';

// --- Bootstrap DOM ---
// gameTemplate is a static trusted string (no user input) — safe to assign
const app = document.querySelector('#app');
app.innerHTML = gameTemplate; // eslint-disable-line no-unsanitized/property
const canvas = document.querySelector('.game-canvas');

// --- Create systems ---
const gameState = new GameState();
const textureManager = new TextureManager();
const scene = new SceneSetup(canvas);
const blockMaterials = new BlockMaterials(textureManager);
const world = new World();
const worldRenderer = new WorldRenderer(world, scene, blockMaterials);
const playerController = new PlayerController(gameState, world, scene);
const enemyManager = new EnemyManager(gameState, world, scene, textureManager);
const targeting = new Targeting(gameState, world, scene, enemyManager);
const particles = new ParticleSystem(scene, textureManager);
const weaponModels = new WeaponModels(scene, textureManager, blockMaterials);
const combat = new CombatSystem(gameState, world, targeting, enemyManager, particles);
const inputManager = new InputManager(gameState, canvas, combat);
const mobileControls = new MobileControls(inputManager, combat, gameState);
const hud = new HUD(gameState, canvas, enemyManager);

// --- Wire events ---
events.on('block:changed', (data) => worldRenderer.onBlockChanged(data));

// --- Simulation step ---
function stepSimulation(deltaMs) {
  const capped = Math.min(deltaMs, 100);
  let remaining = capped;
  while (remaining > 0) {
    const stepMs = Math.min(FIXED_STEP_MS, remaining);
    const dt = stepMs / 1000;
    weaponModels.update(dt, gameState);
    particles.update(dt);
    if (gameState.mode === 'playing') {
      gameState.player.yaw -= inputManager.virtualInput.lookX * LOOK_SPEED * 1.3;
      gameState.player.pitch = Math.max(-1.35, Math.min(1.35,
        gameState.player.pitch - inputManager.virtualInput.lookY * LOOK_SPEED * 1.3,
      ));
      playerController.applyMovement(dt, inputManager.keyState, inputManager.virtualInput);
      enemyManager.update(dt);
    }
    remaining -= stepMs;
  }
}

function renderScene() {
  if (gameState.mode === 'playing') {
    gameState.enemyTarget = targeting.updateEnemyTarget();
    targeting.updateTarget();
  }
  hud.update();
  scene.render();
}

// --- Testing hooks ---
const testingHooks = new TestingHooks(
  gameState, world, enemyManager, particles,
  stepSimulation, renderScene,
);

// --- Init ---
async function init() {
  blockMaterials.build();
  weaponModels.buildAll();
  world.generate();
  worldRenderer.buildAll();
  playerController.setSpawn();
  enemyManager.spawnWave();
  hud.init();
  inputManager.init();
  mobileControls.init();
  testingHooks.init();
  scene.resize();
  targeting.updateTarget();
  hud.update();

  gameState.mode = 'menu';
  hud.setReady();

  let lastTime = performance.now();
  const animate = (now) => {
    if (!gameState.useManualClock) {
      stepSimulation(now - lastTime);
    }
    lastTime = now;
    renderScene();
    window.requestAnimationFrame(animate);
  };
  window.requestAnimationFrame(animate);
}

window.addEventListener('resize', () => scene.resize());

init().catch((error) => {
  console.error(error);
  document.querySelector('#status-message').textContent = '載入 JonyCraft 資源失敗。';
});
