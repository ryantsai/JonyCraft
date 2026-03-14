import * as THREE from 'three';
import {
  ZOMBIE_MAX_HEALTH, ZOMBIE_BASE_ATTACK, ZOMBIE_BASE_DEFENSE, ZOMBIE_SPEED,
} from '../config/constants.js';
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

  // Health bar sprite above head
  const healthBar = createHealthBarSprite();
  healthBar.position.set(0, 2.15, 0);
  root.add(healthBar);

  const zombie = {
    root, hitbox, body, head, leftArm, rightArm, leftLeg, rightLeg,
    healthBar,
    health: ZOMBIE_MAX_HEALTH,
    maxHealth: ZOMBIE_MAX_HEALTH,
    alive: true,
    hitFlash: 0,
    walkTime: 0,
    knockback: new THREE.Vector3(),
    knockbackTimer: 0,
    // Stats
    baseAttack: ZOMBIE_BASE_ATTACK,
    baseDefense: ZOMBIE_BASE_DEFENSE,
    speed: ZOMBIE_SPEED,
    sizeMultiplier: 1,
    attackCooldown: 0,
  };
  hitbox.userData.type = 'zombie';
  hitbox.userData.zombie = zombie;
  return zombie;
}

function createHealthBarSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.6, 0.22, 1);
  sprite.userData.canvas = canvas;
  sprite.userData.texture = texture;
  return sprite;
}

export function updateHealthBarSprite(zombie) {
  const sprite = zombie.healthBar;
  if (!sprite) return;
  const canvas = sprite.userData.canvas;
  const ctx = canvas.getContext('2d');
  const ratio = Math.max(0, zombie.health / zombie.maxHealth);
  const w = canvas.width;
  const h = canvas.height;
  const barW = 88;
  const barH = 12;
  const barX = 2;
  const barY = 2;

  ctx.clearRect(0, 0, w, h);

  // Background track
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.roundRect(barX, barY, barW, barH, 4);
  ctx.fill();

  // Filled portion (shortens as HP drops)
  if (ratio > 0) {
    ctx.beginPath();
    const fillW = Math.round((barW - 2) * ratio);
    ctx.fillStyle = ratio > 0.5 ? '#4ae04a' : ratio > 0.25 ? '#e0c030' : '#e04040';
    ctx.roundRect(barX + 1, barY + 1, fillW, barH - 2, 3);
    ctx.fill();
  }

  // HP text
  const hp = Math.max(0, Math.round(zombie.health));
  const maxHp = Math.round(zombie.maxHealth);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${hp}/${maxHp}`, barX + barW + 3, barY + barH / 2);

  sprite.userData.texture.needsUpdate = true;
  sprite.visible = zombie.health < zombie.maxHealth;
}
