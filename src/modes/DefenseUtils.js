import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Shared utilities for defense game modes (single-player and multiplayer).
 * Eliminates duplication between HomelandDefenseMode and MultiplayerHomelandMode.
 */

export function createTowerHealthBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 20;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.2, 0.4, 1);
  sprite.userData.canvas = canvas;
  sprite.userData.texture = texture;
  return sprite;
}

export function updateTowerHealthBar(sprite, hp, maxHp) {
  if (!sprite) return;
  const canvas = sprite.userData.canvas;
  const ctx = canvas.getContext('2d');
  const ratio = Math.max(0, hp / maxHp);
  const w = canvas.width;
  const barW = 108;
  const barH = 14;
  const barX = 2;
  const barY = 3;

  ctx.clearRect(0, 0, w, canvas.height);

  ctx.beginPath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.roundRect(barX, barY, barW, barH, 5);
  ctx.fill();

  if (ratio > 0) {
    ctx.beginPath();
    const fillW = Math.round((barW - 2) * ratio);
    ctx.fillStyle = ratio > 0.5 ? '#4ae04a' : ratio > 0.25 ? '#e0c030' : '#e04040';
    ctx.roundRect(barX + 1, barY + 1, fillW, barH - 2, 4);
    ctx.fill();
  }

  const hpVal = Math.max(0, Math.ceil(hp));
  const maxVal = Math.round(maxHp);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${hpVal}/${maxVal}`, barX + barW + 4, barY + barH / 2);

  sprite.userData.texture.needsUpdate = true;
}

/**
 * Place solid blocks under the tower model so enemies collide with it.
 * Fills a cylindrical area at the center matching the GLB tower footprint.
 */
export function buildTowerCollision(world, centerX, centerZ) {
  const cx = Math.floor(centerX);
  const cz = Math.floor(centerZ);
  const ground = Math.floor(world.getTerrainSurfaceY(cx, cz) - 1);
  const towerRadius = 2;
  const towerHeight = 8;

  for (let x = -towerRadius; x <= towerRadius; x += 1) {
    for (let z = -towerRadius; z <= towerRadius; z += 1) {
      // Circular footprint
      if (x * x + z * z > towerRadius * towerRadius + 1) continue;
      for (let y = ground + 1; y <= ground + towerHeight; y += 1) {
        world.setBlock(cx + x, y, cz + z, 'barrier');
      }
    }
  }
}

/**
 * Build the tower GLB visual with Luffy mascot on top.
 * Returns { towerMesh, towerHealthBar } for the caller to store.
 * @param {object} opts - { world, scene, center, defense }
 */
export function buildTowerVisual({ world, scene, center, defense }) {
  const y = world.getTerrainSurfaceY(center.x, center.z);
  center.y = y;

  const placeholder = new THREE.Group();
  placeholder.position.set(center.x, y, center.z);
  scene.enemyGroup.add(placeholder);

  const healthBar = createTowerHealthBar();
  healthBar.position.set(center.x, y + 8, center.z);
  scene.enemyGroup.add(healthBar);
  if (defense) updateTowerHealthBar(healthBar, defense.towerHp, defense.towerMaxHp);

  const loader = new GLTFLoader();
  loader.load('assets/buildings/homebase/tower.glb', (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const s = 8 / maxDim;
    model.scale.set(s, s, s);
    const scaledBox = new THREE.Box3().setFromObject(model);
    const c = scaledBox.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.y -= scaledBox.min.y;
    model.position.z -= c.z;

    placeholder.add(model);
    const finalBox = new THREE.Box3().setFromObject(placeholder);
    healthBar.position.y = finalBox.max.y + 1;

    // Load Luffy mascot on top of the tower
    loader.load('assets/npc/luffy.glb', (luffyGltf) => {
      const luffy = luffyGltf.scene;
      const lBox = new THREE.Box3().setFromObject(luffy);
      const lSize = lBox.getSize(new THREE.Vector3());
      const lMax = Math.max(lSize.x, lSize.y, lSize.z);
      const ls = 2.5 / lMax;
      luffy.scale.set(ls, ls, ls);
      const lScaled = new THREE.Box3().setFromObject(luffy);
      const lCenter = lScaled.getCenter(new THREE.Vector3());
      const towerHeight = finalBox.max.y - finalBox.min.y;
      const roofY = finalBox.min.y + towerHeight * 0.67 - placeholder.position.y;
      luffy.position.x -= lCenter.x;
      luffy.position.y = roofY - lScaled.min.y;
      luffy.position.z -= lCenter.z + 1.5;
      placeholder.add(luffy);

      // Raise health bar above mascot
      const topBox = new THREE.Box3().setFromObject(placeholder);
      healthBar.position.y = topBox.max.y + 2.5;
    });
  });

  return { towerMesh: placeholder, towerHealthBar: healthBar };
}

/**
 * Build the fortress walls around the center. Bigger base (19×19).
 * 4 gates at cardinal directions, each 3 blocks wide.
 */
export function buildFortress(world, centerX, centerZ) {
  const cx = Math.floor(centerX);
  const cz = Math.floor(centerZ);
  const ground = Math.floor(world.getTerrainSurfaceY(cx, cz) - 1);
  const HALF = 9; // ±9 → 19×19
  for (let x = -HALF; x <= HALF; x += 1) {
    for (let z = -HALF; z <= HALF; z += 1) {
      const ax = cx + x;
      const az = cz + z;
      for (let y = ground + 1; y <= ground + 3; y += 1) {
        const onOuterWall = Math.abs(x) === HALF || Math.abs(z) === HALF;
        const isGate = (
          (z === -HALF && Math.abs(x) <= 1) ||
          (z === HALF && Math.abs(x) <= 1) ||
          (x === -HALF && Math.abs(z) <= 1) ||
          (x === HALF && Math.abs(z) <= 1)
        );
        if (onOuterWall && !isGate) {
          world.setBlock(ax, y, az, 'brick');
        }
      }
      // Stone floor inside the fortress
      if (Math.abs(x) < HALF && Math.abs(z) < HALF) {
        world.setBlock(ax, ground, az, 'stone');
      }
    }
  }
}

/**
 * Build a merchant NPC model inside the fortress.
 * Returns { group, position } — a Three.js group and its world position.
 */
export function buildMerchantNPC(scene, world, centerX, centerZ) {
  const ground = world.getTerrainSurfaceY(centerX + 5, centerZ - 5);
  const merchantPos = new THREE.Vector3(
    Math.floor(centerX) + 5.5,
    ground,
    Math.floor(centerZ) - 5.5,
  );

  const group = new THREE.Group();
  group.position.copy(merchantPos);

  // Body
  const bodyGeo = new THREE.BoxGeometry(0.6, 0.7, 0.35);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 }); // brown robe
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.85;
  group.add(body);

  // Head
  const headGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf5c6a0 }); // skin tone
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.45;
  group.add(head);

  // Hat (merchant cap)
  const hatGeo = new THREE.BoxGeometry(0.55, 0.2, 0.55);
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xffd966 }); // gold cap
  const hat = new THREE.Mesh(hatGeo, hatMat);
  hat.position.y = 1.78;
  group.add(hat);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.2, 0.55, 0.25);
  const armMat = new THREE.MeshStandardMaterial({ color: 0x7a3d10 });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-0.45, 0.85, 0);
  group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.position.set(0.45, 0.85, 0);
  group.add(rightArm);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.22, 0.5, 0.25);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x5a3510 });
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.16, 0.25, 0);
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.16, 0.25, 0);
  group.add(rightLeg);

  // Name label sprite
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 48;
  const ctx = labelCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.roundRect(0, 0, 256, 48, 8);
  ctx.fill();
  ctx.fillStyle = '#ffd966';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('商人 [E]', 128, 24);
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.minFilter = THREE.LinearFilter;
  const labelSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: labelTexture, depthTest: false }),
  );
  labelSprite.scale.set(2.4, 0.45, 1);
  labelSprite.position.y = 2.2;
  group.add(labelSprite);

  scene.enemyGroup.add(group);

  return { group, position: merchantPos };
}
