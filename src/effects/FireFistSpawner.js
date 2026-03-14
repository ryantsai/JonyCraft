import * as THREE from 'three';
import { events } from '../core/EventBus.js';

/**
 * Listens for projectile-type combat events and spawns the corresponding
 * projectiles via ProjectileSystem. Bridges WeaponModels (which holds
 * the GLB templates) with ProjectileSystem (movement/collision/AOE).
 *
 * Supported projectile types:
 *   - fire_fist: fast single-target fireball, no explosion
 *   - flame_emperor: slower, bigger fireball with AOE explosion on impact
 */
export class FireFistSpawner {
  constructor(gameState, sceneSetup, weaponModels, projectileSystem) {
    this.state = gameState;
    this.scene = sceneSetup;
    this.weaponModels = weaponModels;
    this.projectileSystem = projectileSystem;
  }

  init() {
    events.on('combat:fire-fist-shoot', () => this._spawnFireFist());
    events.on('combat:flame-emperor-shoot', () => this._spawnFlameEmperor());
  }

  _getPlayerDirectionAndSpawn() {
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

    return { dir, spawnPos, player };
  }

  _createProjectileGroup(tmpl, worldScale, dir, spawnPos, modelRotY = 0) {
    const projModel = tmpl.template.clone();
    projModel.scale.copy(tmpl.baseScale).multiplyScalar(worldScale);
    projModel.position.set(0, 0, 0);
    // Correct model orientation — rotate within the group so it faces -Z
    if (modelRotY) projModel.rotation.y = modelRotY;

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
    return projGroup;
  }

  _spawnFireFist() {
    const tmpl = this.weaponModels.getProjectileTemplate('fire_fist');
    if (!tmpl) return;

    const { dir, spawnPos, player } = this._getPlayerDirectionAndSpawn();
    const projGroup = this._createProjectileGroup(tmpl, 4.5, dir, spawnPos);
    const skill = this.state.getSelectedSkill();

    this.projectileSystem.spawn({
      group: projGroup,
      velocity: dir.clone().multiplyScalar(9),
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
      // No explosion for fire_fist
      explodeOnImpact: false,
    });
  }

  _spawnFlameEmperor() {
    const tmpl = this.weaponModels.getProjectileTemplate('flame_emperor');
    if (!tmpl) return;

    const { dir, spawnPos, player } = this._getPlayerDirectionAndSpawn();
    // Bigger projectile model in world space; rotate -90° Y so +X model faces forward (-Z)
    const projGroup = this._createProjectileGroup(tmpl, 7.0, dir, spawnPos, -Math.PI / 2);
    const skill = this.state.getSelectedSkill();

    this.projectileSystem.spawn({
      group: projGroup,
      velocity: dir.clone().multiplyScalar(7),
      origin: spawnPos.clone(),
      maxRange: (skill.range || 14) + 2,
      damage: (skill.damage ?? 5) * player.baseAttack,
      knockback: skill.knockback ?? 10.0,
      trailConfig: {
        count: 40,
        size: 0.25,
        colors: [0xff2200, 0xff4400, 0xff6b35, 0xffdd44, 0xffaa00],
        riseSpeed: 1.5,
      },
      // AOE explosion on impact
      aoe: true,
      aoeRadius: skill.aoeRadius || 5,
      explodeOnImpact: true,
      explosionScale: 1.5,
      explosionColors: [0xff2200, 0xff4400, 0xffaa00, 0xffdd44, 0xff6b35],
    });
  }
}
