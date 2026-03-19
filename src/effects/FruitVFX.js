import * as THREE from 'three';

/**
 * Per-fruit VFX particle definitions and rendering.
 * Each fruit has a unique visual style (fire rises, ice orbits, dark vortex, etc).
 */

const FRUIT_VFX = {
  stretch: {
    count: 6, geo: 'box', size: 0.03,
    behavior: 'trail', colors: [0xffffff, 0xffcccc],
  },
  fire: {
    count: 10, geo: 'box', size: 0.045,
    behavior: 'rise', colors: [0xff6b35, 0xffdd44],
  },
  ice: {
    count: 8, geo: 'diamond', size: 0.04,
    behavior: 'orbit', colors: [0x88ddff, 0xffffff],
  },
  dark: {
    count: 8, geo: 'sphere', size: 0.04,
    behavior: 'vortex', colors: [0x6a3d99, 0x220044],
  },
  light: {
    count: 8, geo: 'plane', size: 0.05,
    behavior: 'radiate', colors: [0xffffa0, 0xffffff],
  },
  magma: {
    count: 8, geo: 'sphere', size: 0.05,
    behavior: 'drip', colors: [0xcc3300, 0xff8800],
  },
  sand: {
    count: 10, geo: 'box', size: 0.03,
    behavior: 'swirl', colors: [0xd4a843, 0xeedd88],
  },
};

const BEHAVIOR_UPDATERS = {
  rise: updateRise,
  orbit: updateOrbit,
  vortex: updateVortex,
  radiate: updateRadiate,
  drip: updateDrip,
  swirl: updateSwirl,
  trail: updateTrail,
};

function createGeometry(geoType, size) {
  switch (geoType) {
    case 'sphere': return new THREE.SphereGeometry(size, 6, 4);
    case 'diamond': return new THREE.OctahedronGeometry(size);
    case 'plane': return new THREE.PlaneGeometry(size * 0.4, size * 3);
    default: return new THREE.BoxGeometry(size, size, size);
  }
}

export class FruitVFX {
  constructor(sceneSetup) {
    this.scene = sceneSetup;
    this._particles = [];
    this._group = null;
    this._animStyle = null;
    this._time = 0;
  }

  build() {
    this._group = new THREE.Group();
    this._group.renderOrder = 55;
    this.scene.heldItemPivot.add(this._group);

    const maxCount = 12;
    for (let i = 0; i < maxCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      mesh.visible = false;
      mesh.renderOrder = 55;
      this._group.add(mesh);
      this._particles.push({
        mesh,
        mat,
        seed: Math.random() * Math.PI * 2,
        active: false,
      });
    }
  }

  update(dt, attackPhase, fruit, isPlaying) {
    if (!fruit || !isPlaying) {
      this._particles.forEach(p => { p.mesh.visible = false; });
      this._animStyle = null;
      return;
    }

    this._configureForFruit(fruit.animStyle);
    this._time += dt;

    const cfg = FRUIT_VFX[fruit.animStyle];
    if (!cfg) return;

    const attacking = attackPhase > 0;
    const t = this._time;
    const updater = BEHAVIOR_UPDATERS[cfg.behavior] || updateTrail;

    this._particles.forEach((p, i) => {
      if (!p.active) return;

      const intensity = attacking ? (0.5 + attackPhase * 0.5) : 0.15;
      const alpha = attacking
        ? Math.min(1, attackPhase * 3) * (1 - Math.max(0, attackPhase - 0.7) / 0.3) * 0.85
        : 0.12 + Math.sin(t * 2 + p.seed) * 0.08;

      updater(p, i, cfg, t, attacking, attackPhase, intensity, alpha);
    });
  }

  _configureForFruit(animStyle) {
    if (this._animStyle === animStyle) return;
    this._animStyle = animStyle;

    const cfg = FRUIT_VFX[animStyle];
    if (!cfg) {
      this._particles.forEach(p => { p.active = false; p.mesh.visible = false; });
      return;
    }

    this._particles.forEach((p, i) => {
      if (i < cfg.count) {
        p.active = true;
        p.seed = Math.random() * Math.PI * 2;
        const oldGeo = p.mesh.geometry;
        p.mesh.geometry = createGeometry(cfg.geo, cfg.size);
        oldGeo.dispose();
        const color = i % 2 === 0 ? cfg.colors[0] : cfg.colors[1];
        p.mat.color.setHex(color);
        p.mat.opacity = 0;
        p.mesh.visible = false;
      } else {
        p.active = false;
        p.mesh.visible = false;
        p.mat.opacity = 0;
      }
    });
  }
}

// --- Behavior update functions ---

const baseX = 0, baseY = 0, baseZ = -0.6;

function applyTransform(p, x, y, z, rx, ry, rz, sc, alpha) {
  p.mesh.position.set(x, y, z);
  p.mesh.rotation.set(rx, ry, rz);
  p.mesh.scale.setScalar(sc);
  p.mat.opacity = alpha;
  p.mesh.visible = alpha > 0.01;
}

function updateRise(p, i, cfg, t, attacking, phase, intensity, alpha) {
  const s = p.seed;
  const idx = i / cfg.count;
  const riseSpeed = attacking ? 3.0 : 1.2;
  const wobble = Math.sin(t * 8 + s * 3) * 0.06;
  const x = baseX + Math.sin(s * 6 + t * 2) * 0.12 * intensity;
  const y = baseY + ((t * riseSpeed + idx) % 0.5) * intensity - 0.1;
  const z = baseZ + Math.cos(s * 4 + t) * 0.08;
  const sc = cfg.size * (0.6 + Math.sin(t * 12 + s) * 0.4);
  applyTransform(p, x, y, z, wobble, 0, t * 3 + s, sc, alpha);
}

function updateOrbit(p, i, cfg, t, attacking, phase, intensity, alpha) {
  const s = p.seed;
  const idx = i / cfg.count;
  const angle = s + t * (attacking ? 2.5 : 0.8);
  const radius = 0.14 + idx * 0.08;
  const x = baseX + Math.cos(angle) * radius;
  const y = baseY + Math.sin(angle * 0.7) * radius * 0.6;
  const z = baseZ + Math.sin(angle) * radius * 0.5 - 0.1;
  const sc = cfg.size * (attacking ? 1.2 : 0.7);
  applyTransform(p, x, y, z, t * 0.5 + s, t * 0.8, t * 0.3 + s * 2, sc, alpha);
}

function updateVortex(p, i, cfg, t, attacking, phase, intensity, alpha) {
  const s = p.seed;
  const idx = i / cfg.count;
  const vAngle = s + t * (attacking ? -3.0 : -1.0);
  const vRadius = (attacking ? 0.2 - phase * 0.1 : 0.15) + idx * 0.05;
  const x = baseX + Math.cos(vAngle) * vRadius;
  const y = baseY + Math.sin(vAngle * 1.2) * vRadius * 0.5;
  const z = baseZ + Math.sin(vAngle * 0.6) * vRadius * 0.4 - 0.1;
  const sc = cfg.size * (0.5 + (1 - idx) * 0.8);
  applyTransform(p, x, y, z, t * 2, vAngle, 0, sc, alpha);
}

function updateRadiate(p, i, cfg, t, attacking, phase, intensity, alpha) {
  const rayAngle = (i / cfg.count) * Math.PI * 2 + t * (attacking ? 1.5 : 0.3);
  const rayLen = attacking ? 0.18 + phase * 0.12 : 0.1;
  const x = baseX + Math.cos(rayAngle) * rayLen;
  const y = baseY + Math.sin(rayAngle) * rayLen;
  const z = baseZ - 0.05;
  const sc = cfg.size * (attacking ? 1.4 : 0.6);
  applyTransform(p, x, y, z, 0, 0, rayAngle + Math.PI / 2, sc, alpha);
}

function updateDrip(p, i, cfg, t, attacking, phase, intensity, alpha) {
  const s = p.seed;
  const idx = i / cfg.count;
  const dripCycle = (t * (attacking ? 2.0 : 0.8) + idx * 1.5) % 1.5;
  const x = baseX + Math.sin(s * 4) * 0.1;
  const y = baseY + 0.1 - dripCycle * 0.3;
  const z = baseZ + Math.cos(s * 3) * 0.08 - 0.05;
  const sc = cfg.size * (0.7 + (1 - dripCycle / 1.5) * 0.6);
  p.mat.color.setHex(Math.sin(t * 4 + s) > 0 ? cfg.colors[0] : cfg.colors[1]);
  applyTransform(p, x, y, z, 0, 0, 0, sc, alpha);
}

function updateSwirl(p, i, cfg, t, attacking, phase, intensity, alpha) {
  const s = p.seed;
  const idx = i / cfg.count;
  const sAngle = s + t * (attacking ? 4.0 : 1.5);
  const sHeight = ((t * 1.5 + idx) % 1.0) - 0.3;
  const sRadius = 0.08 + sHeight * 0.06;
  const x = baseX + Math.cos(sAngle) * sRadius;
  const y = baseY + sHeight * 0.3;
  const z = baseZ + Math.sin(sAngle) * sRadius - 0.1;
  const sc = cfg.size * (0.5 + intensity * 0.6);
  applyTransform(p, x, y, z, 0, 0, t * 5 + s, sc, alpha);
}

function updateTrail(p, i, cfg, t, attacking, phase, intensity, alpha) {
  const s = p.seed;
  const idx = i / cfg.count;
  const trailOffset = idx * 0.12;
  const x = baseX + 0.02 + trailOffset * 0.3;
  const y = baseY + Math.sin(s + t * 3) * 0.03;
  const z = baseZ + 0.15 + trailOffset * (attacking ? 0.6 : 0.2);
  const sc = cfg.size * (attacking ? (0.3 + (1 - idx) * 0.5) : 0.15);
  p.mesh.scale.set(sc * 0.3, sc * 0.3, sc * 3);
  p.mesh.position.set(x, y, z);
  p.mesh.rotation.set(0, 0, s);
  p.mat.opacity = alpha * 0.7;
  p.mesh.visible = alpha * 0.7 > 0.01;
}
