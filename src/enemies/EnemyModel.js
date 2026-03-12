import * as THREE from 'three';

/**
 * Creates enemy models using per-type Kenney character textures.
 * Shares BoxGeometry instances to reduce GPU memory.
 */

// Shared geometries — created once, reused across all enemies
const _geoCache = new Map();
function getGeo(w, h, d) {
  const key = `${w},${h},${d}`;
  if (!_geoCache.has(key)) _geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return _geoCache.get(key);
}

function makePartMaterials(textureManager, path, sideColor, transparent) {
  const texture = textureManager.load(path);
  const opacity = transparent ? 0.55 : 1;
  const frontBack = new THREE.MeshLambertMaterial({
    map: texture, transparent: transparent || false,
    alphaTest: 0.2, opacity, color: 0xffffff,
  });
  const side = new THREE.MeshLambertMaterial({
    color: sideColor, transparent: transparent || false, opacity,
  });
  frontBack.userData.baseColor = 0xffffff;
  side.userData.baseColor = sideColor;
  return [side, side, side, side, frontBack, frontBack];
}

function createPart(textureManager, path, x, y, z, w, h, d, color, transparent) {
  const part = new THREE.Mesh(
    getGeo(w, h, d),
    makePartMaterials(textureManager, path, color, transparent),
  );
  part.position.set(x, y, z);
  return part;
}

export function tintPart(part, hex) {
  const materials = part.material;
  for (let i = 0; i < materials.length; i += 1) {
    const m = materials[i];
    m.color.setHex(hex === 0xffffff ? (m.userData.baseColor ?? 0xffffff) : hex);
  }
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

// Shared invisible hitbox material
const _hitboxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });

export function createEnemy(textureManager, typeDef, typeKey, spawnPosition, enemyGroup) {
  const s = typeDef.sizeMultiplier;
  const root = new THREE.Group();
  root.position.copy(spawnPosition);
  root.scale.set(s, s, s);
  enemyGroup.add(root);

  const c = typeDef.colors;
  const tr = typeDef.transparent || false;
  const tex = typeDef.textures;

  const body = createPart(textureManager, tex.body, 0, 0.88, 0, 0.88, 0.84, 0.62, c.body, tr);
  const head = createPart(textureManager, tex.head, 0, 1.55, 0, 0.64, 0.64, 0.72, c.head, tr);
  const leftArm = createPart(textureManager, tex.arm, -0.43, 0.86, 0, 0.22, 0.76, 0.32, c.arms, tr);
  const rightArm = createPart(textureManager, tex.arm, 0.43, 0.86, 0, 0.22, 0.76, 0.32, c.arms, tr);
  const leftLeg = createPart(textureManager, tex.leg, -0.16, 0.3, 0, 0.24, 0.6, 0.34, c.legs, tr);
  const rightLeg = createPart(textureManager, tex.leg, 0.16, 0.3, 0, 0.24, 0.6, 0.34, c.legs, tr);
  root.add(body, head, leftArm, rightArm, leftLeg, rightLeg);

  const hitbox = new THREE.Mesh(getGeo(0.85, 1.75, 0.85), _hitboxMat);
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
    behaviorTimer: 0,
    behaviorPhase: 'idle',
    circleAngle: Math.random() * Math.PI * 2,
    fuseTimer: 0,
    fusing: false,
    burstRemaining: 0,
    burstTimer: 0,
    _wasTinted: false,
    _lastHealth: typeDef.maxHealth,
  };

  hitbox.userData.type = typeKey;
  hitbox.userData.zombie = enemy;
  return enemy;
}
