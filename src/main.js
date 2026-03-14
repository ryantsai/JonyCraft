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
import { ScreenEffects } from './effects/ScreenEffects.js';
import { ProjectileSystem } from './effects/ProjectileSystem.js';
import { ExplosionEffect } from './effects/ExplosionEffect.js';
import { FireFistSpawner } from './effects/FireFistSpawner.js';
import { CombatSystem } from './combat/Combat.js';
import { InputManager } from './input/InputManager.js';
import { MobileControls } from './input/MobileControls.js';
import { HUD } from './ui/HUD.js';
import { FruitSelect } from './ui/FruitSelect.js';
import { MultiplayerLobby } from './ui/MultiplayerLobby.js';
import { TestingHooks } from './testing/TestingHooks.js';
import { SoundManager } from './audio/SoundManager.js';
import { gameTemplate } from './ui/template.js';
import { HomelandDefenseMode } from './modes/HomelandDefenseMode.js';
import { MultiplayerHomelandMode } from './modes/MultiplayerHomelandMode.js';
import { ensurePlayerName } from './network/PlayerIdentity.js';
import { MultiplayerClient } from './network/MultiplayerClient.js';
import { RemotePlayers } from './network/RemotePlayers.js';

// --- Bootstrap DOM ---
// gameTemplate is a static trusted string (no user input) — safe to assign
const app = document.querySelector('#app');
app.innerHTML = gameTemplate; // eslint-disable-line no-unsanitized/property
const canvas = document.querySelector('.game-canvas');

// --- Create systems ---
const gameState = new GameState();
gameState.playerName = ensurePlayerName();
const textureManager = new TextureManager();
const scene = new SceneSetup(canvas);
const blockMaterials = new BlockMaterials(textureManager);
const world = new World();
const worldRenderer = new WorldRenderer(world, scene, blockMaterials);
const playerController = new PlayerController(gameState, world, scene);
const enemyManager = new EnemyManager(gameState, world, scene, textureManager);
playerController.setEnemyManager(enemyManager);
const targeting = new Targeting(gameState, world, scene, enemyManager);
const particles = new ParticleSystem(scene, textureManager);
enemyManager.setParticles(particles);
const weaponModels = new WeaponModels(scene, textureManager, blockMaterials);
const screenEffects = new ScreenEffects(scene);
const explosionEffect = new ExplosionEffect(scene);
const projectileSystem = new ProjectileSystem(scene, particles, enemyManager);
projectileSystem.setExplosionEffect(explosionEffect);
const multiplayer = new MultiplayerClient(gameState, world);
const combat = new CombatSystem(gameState, world, targeting, enemyManager, particles, multiplayer);
const inputManager = new InputManager(gameState, canvas, combat);
const mobileControls = new MobileControls(inputManager, combat, gameState);
const hud = new HUD(gameState, canvas, enemyManager);
const fruitSelect = new FruitSelect(gameState);
multiplayer.setPlayerName(gameState.playerName);
const remotePlayers = new RemotePlayers(scene);
multiplayer.attachRemotePlayers(remotePlayers);
multiplayer.attachEnemyManager(enemyManager);
const multiplayerLobby = new MultiplayerLobby(gameState, multiplayer);
const fireFistSpawner = new FireFistSpawner(gameState, scene, weaponModels, projectileSystem);
const soundManager = new SoundManager(gameState);
const homelandMode = new HomelandDefenseMode(gameState, world, enemyManager, scene);
const multiplayerHomelandMode = new MultiplayerHomelandMode(
  gameState, world, enemyManager, scene, multiplayer,
);
multiplayer.attachHomelandMode(multiplayerHomelandMode);

// --- Wire events ---
events.on('block:changed', (data) => worldRenderer.onBlockChanged(data));
events.on('fruit:selected', () => {
  gameState.defense.enabled = false;
  gameState.defense.remoteAuthoritative = false;
  gameState.defense.status = 'idle';
  gameState.defense.turrets = [];

  if (gameState.gameMode === 'homeland') {
    world.generate({ flatTerrain: true, treeChanceThreshold: 0.9992 });
    worldRenderer.buildAll();
    playerController.setSpawn();
    enemyManager.clearAll();
  }

  hud.onFruitSelected();
  if (gameState.gameMode === 'homeland') {
    if (gameState.playStyle === 'multiplayer') {
      gameState.modeController = multiplayerHomelandMode;
      multiplayerHomelandMode.activate();
      events.emit('status:message', `多人房間 ${gameState.multiplayer.sessionName} 進入保衛家園。`);
    } else {
      gameState.modeController = homelandMode;
      homelandMode.activate();
    }
  } else if (gameState.playStyle === 'multiplayer') {
    gameState.modeController = null;
    enemyManager.clearAll();
    events.emit('status:message', `多人房間 ${gameState.multiplayer.sessionName} 已連線，開始一起探索。`);
  } else {
    gameState.modeController = null;
    enemyManager.spawnWave();
  }
});

// --- Simulation step ---
function stepSimulation(deltaMs) {
  const capped = Math.min(deltaMs, 100);
  let remaining = capped;
  while (remaining > 0) {
    const stepMs = Math.min(FIXED_STEP_MS, remaining);
    const dt = stepMs / 1000;
    weaponModels.update(dt, gameState);
    screenEffects.update(dt);
    projectileSystem.update(dt);
    explosionEffect.update(dt);
    particles.update(dt);
    if (gameState.mode === 'playing') {
      inputManager.update();
      gameState.player.yaw -= inputManager.virtualInput.lookX * LOOK_SPEED * 1.3;
      gameState.player.pitch = Math.max(-1.35, Math.min(1.35,
        gameState.player.pitch - inputManager.virtualInput.lookY * LOOK_SPEED * 1.3,
      ));
      playerController.applyMovement(dt, inputManager.keyState, inputManager.virtualInput);
      soundManager.updateFootsteps(dt, inputManager.keyState, inputManager.virtualInput);
      if (gameState.playStyle === 'multiplayer') {
        if (gameState.gameMode === 'homeland') enemyManager.updateExternalVisuals(dt);
        else enemyManager.clearAll();
      } else {
        enemyManager.update(dt);
      }
      gameState.modeController?.update?.(dt);
    }
    multiplayer.update(dt);
    remotePlayers.update(dt);
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
  gameState, world, enemyManager, particles, remotePlayers,
  stepSimulation, renderScene,
);

window.__app = {
  gameState,
  world,
  scene,
  enemyManager,
  remotePlayers,
  multiplayer,
};

// --- Init ---
async function init() {
  blockMaterials.build();
  weaponModels.buildAll();
  world.generate();
  worldRenderer.buildAll();
  playerController.setSpawn();
  // initial enemy spawn is game-mode specific and starts after mode entry
  hud.init();
  fruitSelect.init();
  multiplayer.init();
  multiplayerLobby.init();
  screenEffects.init();
  fireFistSpawner.init();
  soundManager.init();
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
