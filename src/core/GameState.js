import * as THREE from 'three';
import { WORLD_SIZE_X, WORLD_SIZE_Z } from '../config/constants.js';
import { SKILLS } from '../config/skills.js';

/**
 * Central game state. All systems read/write from this shared object.
 * Future multiplayer: this becomes the authoritative client state,
 * synced with the server via the networking layer.
 */
export class GameState {
  constructor() {
    this.mode = 'loading'; // loading | menu | playing | paused
    this.gameMode = 'test';
    this.started = false;
    this.useManualClock = false;
    this.selectedIndex = 0;

    this.player = {
      position: new THREE.Vector3(WORLD_SIZE_X / 2, 8, WORLD_SIZE_Z / 2),
      velocity: new THREE.Vector3(),
      yaw: Math.PI / 4,
      pitch: -0.38,
      onGround: false,
    };

    this.target = null;
    this.enemyTarget = null;

    this.combat = {
      swordSwingTime: 0,
      punchTime: 0,
      cooldown: 0,
      kills: 0,
    };
  }

  getSelectedSkill() {
    return SKILLS[this.selectedIndex];
  }

  getSelectedBlockType() {
    return this.getSelectedSkill().blockType ?? 'dirt';
  }
}
