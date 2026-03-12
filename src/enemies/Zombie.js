import * as THREE from 'three';
import { ZOMBIE_MAX_HEALTH } from '../config/constants.js';
import { assetUrl } from '../config/assets.js';

function makeZombiePartMaterials(textureManager, path, sideColor) {
  const texture = textureManager.load(path);
  const frontBackProps = {
    map: texture,
    transparent: false,
    alphaTest: 0.2,
    color: 0xffffff,
  };
  const materials = [
    new THREE.MeshLambertMaterial({ color: sideColor }),
    new THREE.MeshLambertMaterial({ color: sideColor }),
    new THREE.MeshLambertMaterial({ color: sideColor }),
    new THREE.MeshLambertMaterial({ color: sideColor }),
    new THREE.MeshLambertMaterial(frontBackProps),
    new THREE.MeshLambertMaterial(frontBackProps),
  ];
  materials.forEach((m) => { m.userData.baseColor = m.color.getHex(); });
  return materials;
}

function createPart(textureManager, path, x, y, z, width, height, depth, sideColor) {
  const part = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    makeZombiePartMaterials(textureManager, path, sideColor),
  );
  part.position.set(x, y, z);
  return part;
}

export function tintZombiePart(part, hex) {
  const materials = Array.isArray(part.material) ? part.material : [part.material];
  materials.forEach((m) => {
    if (hex === 0xffffff) {
      m.color.setHex(m.userData.baseColor ?? 0xffffff);
      return;
    }
    m.color.setHex(hex);
  });
}

export function createZombie(textureManager, spawnPosition, enemyGroup) {
  const root = new THREE.Group();
  root.position.copy(spawnPosition);
  enemyGroup.add(root);

  const body = createPart(textureManager, assetUrl('assets/kenney/zombie/zombie_body.png'), 0, 0.88, 0, 0.88, 0.84, 0.62, 0x8f6734);
  const head = createPart(textureManager, assetUrl('assets/kenney/zombie/zombie_head.png'), 0, 1.55, 0, 0.64, 0.64, 0.72, 0x49ab67);
  const leftArm = createPart(textureManager, assetUrl('assets/kenney/zombie/zombie_arm.png'), -0.43, 0.86, 0, 0.22, 0.76, 0.32, 0x58be75);
  const rightArm = createPart(textureManager, assetUrl('assets/kenney/zombie/zombie_arm.png'), 0.43, 0.86, 0, 0.22, 0.76, 0.32, 0x58be75);
  const leftLeg = createPart(textureManager, assetUrl('assets/kenney/zombie/zombie_leg.png'), -0.16, 0.3, 0, 0.24, 0.6, 0.34, 0x726454);
  const rightLeg = createPart(textureManager, assetUrl('assets/kenney/zombie/zombie_leg.png'), 0.16, 0.3, 0, 0.24, 0.6, 0.34, 0x726454);
  root.add(body, head, leftArm, rightArm, leftLeg, rightLeg);

  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 1.75, 0.85),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
  );
  hitbox.position.set(0, 0.88, 0);
  root.add(hitbox);

  const zombie = {
    root, hitbox, body, head, leftArm, rightArm, leftLeg, rightLeg,
    health: ZOMBIE_MAX_HEALTH,
    alive: true,
    hitFlash: 0,
    walkTime: 0,
    knockback: new THREE.Vector3(),
    knockbackTimer: 0,
  };
  hitbox.userData.type = 'zombie';
  hitbox.userData.zombie = zombie;
  return zombie;
}
