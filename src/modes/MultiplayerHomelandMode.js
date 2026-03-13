import * as THREE from 'three';
import { WORLD_SIZE_X, WORLD_SIZE_Z } from '../config/constants.js';
import { events } from '../core/EventBus.js';

export class MultiplayerHomelandMode {
  constructor(gameState, world, enemyManager, scene, multiplayerClient) {
    this.state = gameState;
    this.world = world;
    this.enemies = enemyManager;
    this.scene = scene;
    this.multiplayer = multiplayerClient;

    this.center = new THREE.Vector3(WORLD_SIZE_X / 2, 0, WORLD_SIZE_Z / 2);
    this.towerMesh = null;
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
