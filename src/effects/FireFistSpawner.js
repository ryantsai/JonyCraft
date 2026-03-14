import * as THREE from 'three';
import { events } from '../core/EventBus.js';

/**
 * Listens for 'combat:fire-fist-shoot' events and spawns fire fist
 * projectiles via ProjectileSystem. Bridges WeaponModels (which holds
 * the GLB template) with ProjectileSystem (which handles movement/collision).
 */
export class FireFistSpawner {
  constructor(gameState, sceneSetup, weaponModels, projectileSystem) {
    this.state = gameState;
    this.scene = sceneSetup;
    this.weaponModels = weaponModels;
    this.projectileSystem = projectileSystem;
  }

  init() {
    events.on('combat:fire-fist-shoot', () => this._spawn());
  }

  _spawn() {
    const tmpl = this.weaponModels.getFireFistTemplate();
    if (!tmpl) return;

    const player = this.state.player;
    const dir = new THREE.Vector3(
      -Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch),
    ).normalize();

    const right = new THREE.Vector3(
      Math.cos(player.yaw),
      0,
      -Math.sin(player.yaw),
    ).normalize();

    const spawnPos = new THREE.Vector3(
      player.position.x + right.x * 0.6 + dir.x * 1.0,
      player.position.y + 1.0 + dir.y * 1.0,
      player.position.z + right.z * 0.6 + dir.z * 1.0,
    );

    // Clone the GLB model for the projectile
    const projModel = tmpl.template.clone();
    const ws = 4.5;
    projModel.scale.copy(tmpl.baseScale).multiplyScalar(ws);
    projModel.position.set(0, 0, 0);

    const quat = new THREE.Quaternion();
    const rotMatrix = new THREE.Matrix4().lookAt(
      new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0),
    );
    quat.setFromRotationMatrix(rotMatrix);

    const projGroup = new THREE.Group();
    projGroup.position.copy(spawnPos);
    projGroup.quaternion.copy(quat);
    projGroup.add(projModel);
    this.scene.particleGroup.add(projGroup);

    const skill = this.state.getSelectedSkill();
    const speed = 9;

    this.projectileSystem.spawn({
      group: projGroup,
      velocity: dir.clone().multiplyScalar(speed),
      origin: spawnPos.clone(),
      maxRange: (skill.range || 12) + 2,
      damage: (skill.damage ?? 2) * player.baseAttack,
      knockback: skill.knockback ?? 6.0,
      trailConfig: {
        count: 30,
        size: 0.18,
        colors: [0xff4400, 0xff6b35, 0xffdd44],
        riseSpeed: 1.0,
      },
    });
  }
}
