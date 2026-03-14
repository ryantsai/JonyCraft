import * as THREE from 'three';

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
        world.setBlock(cx + x, y, cz + z, 'brick');
      }
    }
  }
}

export function buildFortress(world, centerX, centerZ) {
  const cx = Math.floor(centerX);
  const cz = Math.floor(centerZ);
  const ground = Math.floor(world.getTerrainSurfaceY(cx, cz) - 1);
  for (let x = -6; x <= 6; x += 1) {
    for (let z = -6; z <= 6; z += 1) {
      const ax = cx + x;
      const az = cz + z;
      for (let y = ground + 1; y <= ground + 3; y += 1) {
        const onOuterWall = Math.abs(x) === 6 || Math.abs(z) === 6;
        const isGate = (
          (z === -6 && Math.abs(x) <= 1) ||
          (z === 6 && Math.abs(x) <= 1) ||
          (x === -6 && Math.abs(z) <= 1) ||
          (x === 6 && Math.abs(z) <= 1)
        );
        if (onOuterWall && !isGate) {
          world.setBlock(ax, y, az, 'brick');
        }
      }
    }
  }
}
