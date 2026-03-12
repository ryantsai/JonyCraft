import * as THREE from 'three';
import { assetUrl } from '../config/assets.js';
import {
  SWORD_SWING_MS, PUNCH_SWING_MS,
} from '../config/constants.js';

/**
 * Builds and animates held weapon/skill 3D models in first person.
 */
export class WeaponModels {
  constructor(sceneSetup, textureManager, blockMaterials) {
    this.scene = sceneSetup;
    this.textureManager = textureManager;
    this.blockMaterials = blockMaterials;
    this.models = {};
  }

  buildAll() {
    this._buildDiamondSword();
    this._buildRubberPunch();
    this._buildDirtSkill();
  }

  update(dt, gameState) {
    const combat = gameState.combat;
    if (combat.cooldown > 0) combat.cooldown = Math.max(0, combat.cooldown - dt * 1000);
    combat.swordSwingTime = Math.max(0, combat.swordSwingTime - dt * 1000);
    combat.punchTime = Math.max(0, combat.punchTime - dt * 1000);

    Object.values(this.models).forEach((e) => { e.group.visible = false; });

    const skill = gameState.getSelectedSkill();

    if (skill.id === 'sword') {
      const phase = combat.swordSwingTime > 0 ? 1 - combat.swordSwingTime / SWORD_SWING_MS : 0;
      const windup = THREE.MathUtils.smoothstep(phase, 0, 0.28);
      const release = THREE.MathUtils.smoothstep(phase, 0.18, 0.78);
      const recover = THREE.MathUtils.smoothstep(phase, 0.78, 1);
      const slash = release - recover * 0.28;
      this.models.sword.group.position.set(
        THREE.MathUtils.lerp(0.46, 0.04, slash),
        THREE.MathUtils.lerp(-0.54, -0.76, slash) + windup * 0.05,
        THREE.MathUtils.lerp(-0.56, -0.34, slash),
      );
      this.models.sword.group.rotation.set(
        THREE.MathUtils.lerp(0.34, -0.88, slash) + windup * 0.1,
        THREE.MathUtils.lerp(-0.12, -0.28, slash),
        THREE.MathUtils.lerp(-1.18, -0.02, slash) - windup * 0.14,
      );
      this.models.sword.group.visible = gameState.mode === 'playing';
    } else if (skill.id === 'punch') {
      const phase = combat.punchTime > 0 ? 1 - combat.punchTime / PUNCH_SWING_MS : 0;
      const windup = THREE.MathUtils.smoothstep(phase, 0, 0.18);
      const release = THREE.MathUtils.smoothstep(phase, 0.12, 0.45);
      const recover = THREE.MathUtils.smoothstep(phase, 0.48, 1);
      const extend = Math.max(0, release - recover * 0.92);
      const armScale = 1 + extend * 3.6;
      const reach = this.models.punch.baseLength * armScale;

      this.models.punch.arm.scale.z = armScale;
      this.models.punch.fist.position.z = -reach;
      this.models.punch.cuff.position.z = -0.18 - extend * 0.08;
      this.models.punch.group.position.set(
        0.76 - extend * 0.24 + windup * 0.06,
        -0.74 + extend * 0.18 + windup * 0.05,
        -0.98 - extend * 0.24,
      );
      this.models.punch.group.rotation.set(
        0.56 - extend * 0.12 - windup * 0.1,
        -0.52 + extend * 0.18,
        -0.46 + extend * 0.08,
      );
      this.models.punch.armAnchor.rotation.set(-0.08 - extend * 0.05, 0.1 - extend * 0.06, 0.04);
      this.models.punch.forearmPivot.rotation.set(-0.06 + extend * 0.04, 0.02, 0);
      this.models.punch.group.visible = gameState.mode === 'playing';
    } else if (skill.id === 'dirt') {
      this.models.dirt.group.position.set(0.58, -0.56, -0.72);
      this.models.dirt.group.rotation.set(0.22, 0.22, -0.3);
      this.models.dirt.group.visible = gameState.mode === 'playing';
    }
  }

  _buildDiamondSword() {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      map: this.textureManager.load(assetUrl('assets/kenney/items/sword_diamond.png')),
      transparent: true, alphaTest: 0.15, side: THREE.DoubleSide, depthTest: false,
    });
    const sword = new THREE.Mesh(this.scene.planeGeometry.clone(), mat);
    sword.scale.set(-1.22, 1.22, 1);
    sword.renderOrder = 50;
    sword.position.set(-0.08, 0.02, 0);
    group.add(sword);
    group.visible = false;
    this.scene.heldItemPivot.add(group);
    this.models.sword = { group, sword };
  }

  _buildRubberPunch() {
    const group = new THREE.Group();
    const armAnchor = new THREE.Group();
    const forearmPivot = new THREE.Group();
    armAnchor.add(forearmPivot);
    group.add(armAnchor);

    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xc6452d });
    const armMat = new THREE.MeshLambertMaterial({ color: 0xd59a72 });
    const fistMat = new THREE.MeshLambertMaterial({ color: 0xefb48f });

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.28), sleeveMat);
    sleeve.position.set(0, 0, -0.08);

    const armGeo = new THREE.BoxGeometry(0.18, 0.18, 0.86);
    armGeo.translate(0, 0, -0.43);
    const arm = new THREE.Mesh(armGeo, armMat);

    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), fistMat);
    fist.position.set(0, 0, -0.86);

    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.08), sleeveMat);
    cuff.position.set(0, 0, -0.18);

    forearmPivot.add(arm, fist, cuff);
    armAnchor.add(sleeve);
    group.visible = false;
    this.scene.heldItemPivot.add(group);
    this.models.punch = { group, armAnchor, forearmPivot, arm, fist, cuff, baseLength: 0.86 };
  }

  _buildDirtSkill() {
    const group = new THREE.Group();
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      this.blockMaterials.get('dirt'),
    );
    group.add(cube);
    group.visible = false;
    this.scene.heldItemPivot.add(group);
    this.models.dirt = { group, cube };
  }
}
