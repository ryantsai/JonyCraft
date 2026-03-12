import * as THREE from 'three';
import { assetUrl } from '../config/assets.js';

/**
 * Creates a generic humanoid enemy model from box parts.
 * Colors and proportions are driven by the enemy type definition.
 */

function makePartMaterials(textureManager, path, sideColor, transparent) {
  const texture = textureManager.load(path);
  const frontBackProps = {
    map: texture,
    transparent: transparent || false,
    alphaTest: 0.2,
    opacity: transparent ? 0.55 : 1,
    color: 0xffffff,
  };
  const sideProps = {
    color: sideColor,
    transparent: transparent || false,
    opacity: transparent ? 0.55 : 1,
  };
  const materials = [
    new THREE.MeshLambertMaterial(sideProps),
    new THREE.MeshLambertMaterial(sideProps),
    new THREE.MeshLambertMaterial(sideProps),
    new THREE.MeshLambertMaterial(sideProps),
    new THREE.MeshLambertMaterial(frontBackProps),
    new THREE.MeshLambertMaterial(frontBackProps),
  ];
  materials.forEach((m) => { m.userData.baseColor = m.color.getHex(); });
  return materials;
}

function createPart(textureManager, path, x, y, z, w, h, d, color, transparent) {
  const part = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    makePartMaterials(textureManager, path, color, transparent),
  );
  part.position.set(x, y, z);
  return part;
}

export function tintPart(part, hex) {
  const materials = Array.isArray(part.material) ? part.material : [part.material];
  materials.forEach((m) => {
    if (hex === 0xffffff) {
      m.color.setHex(m.userData.baseColor ?? 0xffffff);
      return;
    }
    m.color.setHex(hex);
  });
}

function createHealthBarSprite(scale) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.2 * scale, 0.15 * scale, 1);
  sprite.userData.canvas = canvas;
  sprite.userData.texture = texture;
  return sprite;
}

export function updateHealthBarSprite(enemy) {
  const sprite = enemy.healthBar;
  if (!sprite) return;
  const canvas = sprite.userData.canvas;
  const ctx = canvas.getContext('2d');
  const ratio = Math.max(0, enemy.health / enemy.maxHealth);

  ctx.clearRect(0, 0, 64, 8);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.roundRect(0, 0, 64, 8, 3);
  ctx.fill();

  if (ratio > 0) {
    ctx.fillStyle = ratio > 0.5 ? '#4ae04a' : ratio > 0.25 ? '#e0c030' : '#e04040';
    ctx.roundRect(1, 1, Math.round(62 * ratio), 6, 2);
    ctx.fill();
  }

  sprite.userData.texture.needsUpdate = true;
  sprite.visible = enemy.health < enemy.maxHealth;
}

export function createEnemy(textureManager, typeDef, typeKey, spawnPosition, enemyGroup) {
  const s = typeDef.sizeMultiplier;
  const root = new THREE.Group();
  root.position.copy(spawnPosition);
  root.scale.set(s, s, s);
  enemyGroup.add(root);

  const c = typeDef.colors;
  const tr = typeDef.transparent || false;
  const bodyTex = assetUrl('assets/kenney/zombie/zombie_body.png');
  const headTex = assetUrl('assets/kenney/zombie/zombie_head.png');
  const armTex = assetUrl('assets/kenney/zombie/zombie_arm.png');
  const legTex = assetUrl('assets/kenney/zombie/zombie_leg.png');

  const body = createPart(textureManager, bodyTex, 0, 0.88, 0, 0.88, 0.84, 0.62, c.body, tr);
  const head = createPart(textureManager, headTex, 0, 1.55, 0, 0.64, 0.64, 0.72, c.head, tr);
  const leftArm = createPart(textureManager, armTex, -0.43, 0.86, 0, 0.22, 0.76, 0.32, c.arms, tr);
  const rightArm = createPart(textureManager, armTex, 0.43, 0.86, 0, 0.22, 0.76, 0.32, c.arms, tr);
  const leftLeg = createPart(textureManager, legTex, -0.16, 0.3, 0, 0.24, 0.6, 0.34, c.legs, tr);
  const rightLeg = createPart(textureManager, legTex, 0.16, 0.3, 0, 0.24, 0.6, 0.34, c.legs, tr);
  root.add(body, head, leftArm, rightArm, leftLeg, rightLeg);

  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 1.75, 0.85),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
  );
  hitbox.position.set(0, 0.88, 0);
  root.add(hitbox);

  const healthBar = createHealthBarSprite(Math.max(1, s));
  healthBar.position.set(0, 2.15, 0);
  root.add(healthBar);

  const enemy = {
    root, hitbox, body, head, leftArm, rightArm, leftLeg, rightLeg,
    healthBar,
    type: typeKey,
    typeDef,
    health: typeDef.maxHealth,
    maxHealth: typeDef.maxHealth,
    alive: true,
    hitFlash: 0,
    walkTime: 0,
    knockback: new THREE.Vector3(),
    knockbackTimer: 0,
    baseAttack: typeDef.baseAttack,
    baseDefense: typeDef.baseDefense,
    speed: typeDef.speed,
    sizeMultiplier: typeDef.sizeMultiplier,
    attackCooldown: 0,
    // Behavior state
    behaviorTimer: 0,
    behaviorPhase: 'idle',
    circleAngle: Math.random() * Math.PI * 2,
    fuseTimer: 0,
    fusing: false,
    burstRemaining: 0,
    burstTimer: 0,
  };

  hitbox.userData.type = typeKey;
  hitbox.userData.zombie = enemy; // keep compat with targeting system
  return enemy;
}
