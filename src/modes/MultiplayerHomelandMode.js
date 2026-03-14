import * as THREE from 'three';
import { WORLD_SIZE_X, WORLD_SIZE_Z } from '../config/constants.js';
import { events } from '../core/EventBus.js';

function createTowerHealthBar() {
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

function updateTowerHealthBar(sprite, hp, maxHp) {
  if (!sprite) return;
  const canvas = sprite.userData.canvas;
  const ctx = canvas.getContext('2d');
  const ratio = Math.max(0, hp / maxHp);
  const w = canvas.width;
  const h = canvas.height;
  const barW = 108;
  const barH = 14;
  const barX = 2;
  const barY = 3;

  ctx.clearRect(0, 0, w, h);

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

export class MultiplayerHomelandMode {
  constructor(gameState, world, enemyManager, scene, multiplayerClient) {
    this.state = gameState;
    this.world = world;
    this.enemies = enemyManager;
    this.scene = scene;
    this.multiplayer = multiplayerClient;

    this.center = new THREE.Vector3(WORLD_SIZE_X / 2, 0, WORLD_SIZE_Z / 2);
    this.towerMesh = null;
    this.towerHealthBar = null;
    this.turretMeshes = new Map();
    this._unsubscribeShop = null;
  }

  activate() {
    this.state.defense.enabled = true;
    this.state.defense.remoteAuthoritative = true;
    this.state.defense.status = 'waiting';
    this._buildFortress();
    this._buildTowerVisual();
    if (!this._unsubscribeShop) {
      this._unsubscribeShop = events.on('shop:purchase', ({ item }) => {
        this.multiplayer.queueHomelandPurchase(item);
      });
    }
  }

  update() {
    if (!this.state.defense.enabled) return;
    this._syncTurretVisuals();
    if (this.towerMesh) {
      const ratio = Math.max(0.35, this.state.defense.towerHp / Math.max(1, this.state.defense.towerMaxHp));
      this.towerMesh.scale.y = 0.8 + ratio * 0.4;
      this.towerMesh.position.y = this.center.y + (2.75 * this.towerMesh.scale.y);
    }
    updateTowerHealthBar(this.towerHealthBar, this.state.defense.towerHp, this.state.defense.towerMaxHp);
  }

  getDefenseTarget() {
    return this.center;
  }

  applyServerState(defenseState) {
    if (!defenseState) return;
    this.state.defense.enabled = true;
    this.state.defense.remoteAuthoritative = true;
    this.state.defense.wave = defenseState.wave ?? this.state.defense.wave;
    this.state.defense.timeLeft = defenseState.timeLeft ?? this.state.defense.timeLeft;
    this.state.defense.totalKills = defenseState.totalKills ?? this.state.defense.totalKills;
    this.state.defense.totalGold = defenseState.totalGold ?? this.state.defense.totalGold;
    this.state.defense.towerHp = defenseState.towerHp ?? this.state.defense.towerHp;
    this.state.defense.towerMaxHp = defenseState.towerMaxHp ?? this.state.defense.towerMaxHp;
    this.state.defense.status = defenseState.status ?? this.state.defense.status;
    this.state.defense.turrets = defenseState.turrets ?? [];

    if (defenseState.center) {
      this.center.set(defenseState.center.x, defenseState.center.y, defenseState.center.z);
    }

    this._buildTowerVisual();
    this._syncTurretVisuals();
  }

  _buildTowerVisual() {
    if (this.towerMesh) return;
    const geom = new THREE.CylinderGeometry(1.2, 1.6, 5.5, 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0xbca77f, roughness: 0.85 });
    this.towerMesh = new THREE.Mesh(geom, mat);
    const y = this.world.getTerrainSurfaceY(this.center.x, this.center.z);
    this.center.y = y;
    this.towerMesh.position.set(this.center.x, y + 2.75, this.center.z);
    this.scene.enemyGroup.add(this.towerMesh);

    if (!this.towerHealthBar) {
      this.towerHealthBar = createTowerHealthBar();
      this.towerHealthBar.position.set(this.center.x, y + 6.2, this.center.z);
      this.scene.enemyGroup.add(this.towerHealthBar);
    }
  }

  _buildFortress() {
    const cx = Math.floor(this.center.x);
    const cz = Math.floor(this.center.z);
    const ground = Math.floor(this.world.getTerrainSurfaceY(cx, cz) - 1);
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
            this.world.setBlock(ax, y, az, 'brick');
          }
        }
      }
    }
  }

  _syncTurretVisuals() {
    const keep = new Set();
    this.state.defense.turrets.forEach((turret) => {
      keep.add(turret.id);
      if (!this.turretMeshes.has(turret.id)) {
        const geom = new THREE.CylinderGeometry(0.3, 0.45, 1.2, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0x6ec6ff, emissive: 0x224466 });
        const mesh = new THREE.Mesh(geom, mat);
        this.scene.enemyGroup.add(mesh);
        this.turretMeshes.set(turret.id, mesh);
      }
      const mesh = this.turretMeshes.get(turret.id);
      mesh.position.set(turret.x, turret.y, turret.z);
    });

    Array.from(this.turretMeshes.entries()).forEach(([id, mesh]) => {
      if (keep.has(id)) return;
      this.scene.enemyGroup.remove(mesh);
      this.turretMeshes.delete(id);
    });
  }
}
