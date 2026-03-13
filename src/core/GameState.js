import * as THREE from 'three';
import {
  WORLD_SIZE_X, WORLD_SIZE_Z,
  PLAYER_MAX_HP, PLAYER_BASE_ATTACK, PLAYER_BASE_DEFENSE, MOVE_SPEED,
} from '../config/constants.js';
import { DEFAULT_SKILLS } from '../config/skills.js';

/**
 * Central game state. All systems read/write from this shared object.
 * Future multiplayer: this becomes the authoritative client state,
 * synced with the server via the networking layer.
 */
export class GameState {
  constructor() {
    this.mode = 'loading'; // loading | menu | fruit_select | playing | paused
    this.playStyle = 'singleplayer';
    this.gameMode = 'test';
    this.modeController = null;
    this.started = false;
    this.useManualClock = false;
    this.selectedIndex = 0;
    this.playerName = 'Player';

    // Fruit system
    this.selectedFruit = null;   // fruit definition object
    this.activeSkills = DEFAULT_SKILLS;

    this.player = {
      position: new THREE.Vector3(WORLD_SIZE_X / 2, 8, WORLD_SIZE_Z / 2),
      velocity: new THREE.Vector3(),
      yaw: Math.PI / 4,
      pitch: -0.38,
      onGround: false,
      // Stats
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      baseAttack: PLAYER_BASE_ATTACK,
      baseDefense: PLAYER_BASE_DEFENSE,
      speed: MOVE_SPEED,
      sizeMultiplier: 1,
    };

    this.target = null;
    this.enemyTarget = null;

    this.combat = {
      swordSwingTime: 0,
      punchTime: 0,
      cooldown: 0,
      kills: 0,
    };

    this.defense = {
      enabled: false,
      wave: 0,
      timeLeft: 0,
      totalKills: 0,
      totalGold: 0,
      towerHp: 0,
      towerMaxHp: 240,
    };

    this.multiplayer = {
      enabled: false,
      sessionId: null,
      sessionName: '',
      sessionMode: 'test',
      sessionPlayerCount: 1,
      serverUrl: '',
      sessions: [],
      latestBlockSeq: 0,
      connectionStatus: 'offline',
    };
  }

  selectFruit(fruit) {
    this.selectedFruit = fruit;
    this.activeSkills = fruit.skills;
    this.selectedIndex = 0;
  }

  getSelectedSkill() {
    return this.activeSkills[this.selectedIndex];
  }

  getSelectedBlockType() {
    return this.getSelectedSkill().blockType ?? 'dirt';
  }
}
