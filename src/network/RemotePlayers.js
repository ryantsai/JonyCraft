import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_MODEL, SKINS } from '../config/skins.js';

const _predicted = new THREE.Vector3();
const glbLoader = new GLTFLoader();
let cachedGLTF = null;

// Cached fire skill GLB templates { scene, baseScale }
const _fireSkillTemplates = {};
const _fireSkillPaths = {
  fire_fist: 'assets/firstperson/skills/firefruit/fire_fist.glb',
  flame_emperor: 'assets/firstperson/skills/firefruit/flame_emperor.glb',
  fire_pillar: 'assets/firstperson/skills/firefruit/fire_pillar.glb',
};

function loadFireSkillTemplate(key) {
  if (_fireSkillTemplates[key]) return _fireSkillTemplates[key];
  const path = _fireSkillPaths[key];
  if (!path) return null;
  _fireSkillTemplates[key] = new Promise((resolve) => {
    glbLoader.load(path, (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const s = 0.5 / maxDim;
      model.scale.set(s, s, s);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x * s, -center.y * s, -center.z * s);
      resolve({ scene: model, baseScale: model.scale.clone() });
    }, undefined, () => resolve(null));
  });
  return _fireSkillTemplates[key];
}

// Pre-load fire skill GLBs
Object.keys(_fireSkillPaths).forEach((key) => loadFireSkillTemplate(key));

function loadCharacterModel() {
  if (cachedGLTF) return cachedGLTF;
  cachedGLTF = new Promise((resolve, reject) => {
    glbLoader.load(CHARACTER_MODEL, (gltf) => resolve(gltf), undefined, reject);
  });
  return cachedGLTF;
}

function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return new THREE.Color(`hsl(${hue} 70% 58%)`);
}

function createNameTag(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(7, 10, 18, 0.88)';
  ctx.roundRect(10, 10, 236, 44, 14);
  ctx.fill();
  ctx.strokeStyle = `#${color.getHexString()}`;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#f7fbff';
  ctx.font = '700 26px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 33);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.6, 0.65, 1);
  sprite.position.set(0, 2.45, 0);
  return sprite;
}

function createPlayerHealthBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.22, 1);
  sprite.position.set(0, 2.15, 0);
  sprite.userData.canvas = canvas;
  sprite.userData.texture = texture;
  return sprite;
}

function updatePlayerHealthBar(sprite, hp, maxHp) {
  if (!sprite) return;
  const canvas = sprite.userData.canvas;
  const ctx = canvas.getContext('2d');
  const ratio = Math.max(0, hp / maxHp);
  const w = canvas.width;
  const h = canvas.height;
  const barW = w - 4;
  const barH = h - 4;

  ctx.clearRect(0, 0, w, h);

  ctx.beginPath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.roundRect(1, 1, barW + 2, barH + 2, 4);
  ctx.fill();

  if (ratio > 0) {
    ctx.beginPath();
    const fillW = Math.round(barW * ratio);
    ctx.fillStyle = ratio > 0.5 ? '#4ae04a' : ratio > 0.25 ? '#e0c030' : '#e04040';
    ctx.roundRect(2, 2, fillW, barH, 3);
    ctx.fill();
  }

  sprite.userData.texture.needsUpdate = true;
}

function createFallbackAvatar(name) {
  const root = new THREE.Group();
  const color = colorFromName(name);
  const dark = color.clone().multiplyScalar(0.68);
  const light = new THREE.Color(0xf7f1d2);

  const bodyMaterial = new THREE.MeshLambertMaterial({ color });
  const accentMaterial = new THREE.MeshLambertMaterial({ color: dark });
  const skinMaterial = new THREE.MeshLambertMaterial({ color: light });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.82, 0.46), bodyMaterial);
  body.position.set(0, 0.92, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMaterial);
  head.position.set(0, 1.62, 0);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), accentMaterial);
  leftArm.position.set(-0.48, 0.94, 0);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), accentMaterial);
  rightArm.position.set(0.48, 0.94, 0);
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.2), accentMaterial);
  leftLeg.position.set(-0.18, 0.34, 0);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.2), accentMaterial);
  rightLeg.position.set(0.18, 0.34, 0);
  const tag = createNameTag(name, color);
  const healthBar = createPlayerHealthBar();

  root.add(body, head, leftArm, rightArm, leftLeg, rightLeg, tag, healthBar);
  return { root, leftArm, rightArm, leftLeg, rightLeg, healthBar };
}

function createAvatar(name) {
  const { root, leftArm, rightArm, leftLeg, rightLeg, healthBar } = createFallbackAvatar(name);
  return {
    root,
    skinId: null,
    healthBar,
    snapshotPosition: new THREE.Vector3(),
    snapshotVelocity: new THREE.Vector3(),
    targetPosition: new THREE.Vector3(),
    targetYaw: 0,
    walkTime: Math.random() * Math.PI * 2,
    snapshotLocalTime: 0,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    // Animation state
    mixer: null,
    actions: {},
    currentAction: null,
    currentAnimName: '',
    headNode: null,
    // Attack state from server
    isAttacking: false,
    attackSkillId: '',
    wasAttacking: false,
    attackAnimTimer: 0,
    attackSeq: 0,
    lastAttackSeq: 0,
    // Remote player data for VFX
    remoteYaw: 0,
    remotePitch: 0,
    remoteFruitId: '',
    // Death state
    isDead: false,
    deathTimer: 0,
    // HP
    hp: 20,
    maxHp: 20,
    // Knockback
    knockbackVelocity: new THREE.Vector3(),
    knockbackTimer: 0,
  };
}

// Animation names from character-a.glb
const ANIM_IDLE = 'idle';
const ANIM_WALK = 'walk';
const ANIM_SPRINT = 'sprint';
const ANIM_ATTACK = 'attack-melee-right';
const ANIM_DIE = 'die';

async function upgradeAvatarToSkin(avatar, skin, name) {
  try {
    const gltf = await loadCharacterModel();
    const model = gltf.scene.clone(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const targetHeight = 1.75;
    const scale = targetHeight / Math.max(size.y, 0.01);
    model.scale.setScalar(scale);

    // Align model bottom to y=0 (root is placed at feet position)
    model.position.y = -box.min.y * scale;

    // Apply skin texture by replacing image on existing GLB texture
    if (skin.id !== 'a') {
      await new Promise((resolve) => {
        const img = new Image();
        img.src = skin.texture;
        img.onload = () => {
          model.traverse((child) => {
            if (child.isMesh && child.material?.map) {
              child.material.map.image = img;
              child.material.map.needsUpdate = true;
            }
          });
          resolve();
        };
        img.onerror = resolve;
      });
    }

    const color = colorFromName(name);
    const tag = createNameTag(name, color);

    const pos = avatar.root.position.clone();
    const rot = avatar.root.rotation.y;
    const parent = avatar.root.parent;

    if (parent) parent.remove(avatar.root);

    // GLB model faces +Z; game yaw 0 faces -Z, so rotate model 180°
    model.rotation.y = Math.PI;

    const hpBar = createPlayerHealthBar();
    avatar.healthBar = hpBar;

    const newRoot = new THREE.Group();
    newRoot.add(model, tag, hpBar);
    newRoot.position.copy(pos);
    newRoot.rotation.y = rot;

    if (parent) parent.add(newRoot);

    avatar.root = newRoot;
    avatar.leftArm = null;
    avatar.rightArm = null;
    avatar.leftLeg = null;
    avatar.rightLeg = null;
    avatar.skinId = skin.id;

    // Grab head node for pitch-based look direction
    avatar.headNode = model.getObjectByName('head') || null;

    // Set up AnimationMixer with clips from the original GLTF
    const mixer = new THREE.AnimationMixer(model);
    avatar.mixer = mixer;
    avatar.actions = {};
    const clipNames = [ANIM_IDLE, ANIM_WALK, ANIM_SPRINT, ANIM_ATTACK, ANIM_DIE];
    for (const clipName of clipNames) {
      const clip = gltf.animations.find((a) => a.name === clipName);
      if (clip) {
        const action = mixer.clipAction(clip.clone());
        action.setEffectiveWeight(0);
        avatar.actions[clipName] = action;
      }
    }

    // Start with idle
    _switchAnimation(avatar, ANIM_IDLE);
  } catch (err) {
    console.error('Failed to load skin for remote player:', err);
  }
}

function _switchAnimation(avatar, animName) {
  if (!avatar.mixer || avatar.currentAnimName === animName) return;
  const newAction = avatar.actions[animName];
  if (!newAction) return;

  const fadeDuration = 0.2;

  if (avatar.currentAction) {
    avatar.currentAction.fadeOut(fadeDuration);
  }

  newAction.reset();
  newAction.setEffectiveWeight(1);
  newAction.fadeIn(fadeDuration);
  newAction.play();

  // Attack and die animations play once
  if (animName === ANIM_ATTACK || animName === ANIM_DIE) {
    newAction.setLoop(THREE.LoopOnce, 1);
    newAction.clampWhenFinished = true;
  } else {
    newAction.setLoop(THREE.LoopRepeat);
  }

  avatar.currentAction = newAction;
  avatar.currentAnimName = animName;
}

function lerpAngle(from, to, alpha) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}

const FIRE_COLORS = [0xff2200, 0xff4400, 0xff6b35, 0xffaa00, 0xffdd44];

// Reusable objects for projectile orientation
const _quat = new THREE.Quaternion();
const _rotMatrix = new THREE.Matrix4();
const _lookUp = new THREE.Vector3(0, 1, 0);
const _lookOrigin = new THREE.Vector3();
const _spreadVec = new THREE.Vector3();

export class RemotePlayers {
  constructor(sceneSetup) {
    this.scene = sceneSetup;
    this.avatars = new Map();
    this.serverTimeOffset = 0;
    this._remoteVFX = []; // active remote player VFX particles
  }

  updateRoster(players, { serverTime } = {}) {
    const keep = new Set();
    const receivedAt = performance.now() / 1000;
    if (Number.isFinite(serverTime)) {
      const nextOffset = receivedAt - serverTime;
      this.serverTimeOffset = this.serverTimeOffset === 0
        ? nextOffset
        : (this.serverTimeOffset * 0.7) + (nextOffset * 0.3);
    }

    players.forEach((player) => {
      if (!player?.name) return;
      keep.add(player.name);
      let avatar = this.avatars.get(player.name);
      if (!avatar) {
        avatar = createAvatar(player.name);
        avatar.root.position.set(player.x ?? 0, player.y ?? 0, player.z ?? 0);
        avatar.snapshotPosition.copy(avatar.root.position);
        avatar.targetPosition.copy(avatar.root.position);
        avatar.snapshotLocalTime = receivedAt;
        this.scene.remotePlayerGroup.add(avatar.root);
        this.avatars.set(player.name, avatar);
      }

      // Upgrade avatar to GLB skin if the remote player has a skin set
      const remoteSkinId = player.skinId ?? null;
      if (remoteSkinId && remoteSkinId !== avatar.skinId) {
        const skin = SKINS.find((s) => s.id === remoteSkinId);
        if (skin) {
          void upgradeAvatarToSkin(avatar, skin, player.name);
        }
      }

      avatar.snapshotPosition.set(player.x ?? 0, player.y ?? 0, player.z ?? 0);
      avatar.snapshotVelocity.set(player.vx ?? 0, player.vy ?? 0, player.vz ?? 0);
      avatar.snapshotLocalTime = Number.isFinite(player.lastSeen)
        ? player.lastSeen + this.serverTimeOffset
        : receivedAt;
      avatar.targetPosition.copy(avatar.snapshotPosition);
      avatar.targetYaw = player.yaw ?? 0;

      // Attack state
      avatar.isAttacking = player.isAttacking ?? false;
      avatar.attackSkillId = player.attackSkillId ?? '';
      avatar.attackSeq = player.attackSeq ?? 0;
      avatar.remoteYaw = player.yaw ?? 0;
      avatar.remotePitch = player.pitch ?? 0;
      avatar.remoteFruitId = player.fruitId ?? '';

      // HP tracking
      avatar.hp = Number(player.serverHp ?? player.hp ?? avatar.hp);
      avatar.maxHp = Number(player.serverMaxHp ?? player.maxHp ?? avatar.maxHp);
      updatePlayerHealthBar(avatar.healthBar, avatar.hp, avatar.maxHp);

      // Death state: server sets respawnUntil when player dies
      const respawnUntil = Number(player.respawnUntil ?? 0);
      const srvTime = Number(player._serverTime ?? player.lastSeen ?? 0);
      const wasDead = avatar.isDead;
      avatar.isDead = respawnUntil > 0 && respawnUntil > srvTime;
      if (avatar.isDead && !wasDead) {
        avatar.deathTimer = 2.0;
        this._spawnDeathDebris(avatar);
      }
      if (!avatar.isDead && wasDead) {
        this._cleanupDeathState(avatar);
      }
    });

    Array.from(this.avatars.keys()).forEach((name) => {
      if (keep.has(name)) return;
      const avatar = this.avatars.get(name);
      if (!avatar) return;
      this.scene.remotePlayerGroup.remove(avatar.root);
      this.avatars.delete(name);
    });
  }

  update(dt) {
    const now = performance.now() / 1000;
    this.avatars.forEach((avatar) => {
      const predictionLead = Math.max(0, Math.min(0.22, now - avatar.snapshotLocalTime));
      _predicted.copy(avatar.snapshotPosition).addScaledVector(avatar.snapshotVelocity, predictionLead);
      const error = avatar.root.position.distanceTo(_predicted);
      if (error > 3) {
        avatar.root.position.copy(_predicted);
      } else {
        const followSpeed = error > 1.2 ? 14 : 10;
        avatar.root.position.lerp(_predicted, Math.min(1, dt * followSpeed));
      }
      avatar.root.rotation.y = lerpAngle(avatar.root.rotation.y, avatar.targetYaw, Math.min(1, dt * 10));

      // Update AnimationMixer for GLB-based avatars
      if (avatar.mixer) {
        avatar.mixer.update(dt);
        this._updateAnimationState(avatar);

        // Rotate head to match remote player's pitch (look up/down)
        // Applied after mixer so it overrides the animation's head rotation
        if (avatar.headNode) {
          // Model is rotated 180° so pitch is inverted
          const targetPitch = Math.max(-1.2, Math.min(1.2, avatar.remotePitch));
          avatar.headNode.rotation.x = -targetPitch;
        }
      }

      // Walk animation only for fallback avatars with limbs (no GLB)
      if (avatar.leftArm && !avatar.mixer) {
        const moveAmount = avatar.snapshotVelocity.length();
        avatar.walkTime += dt * Math.max(2.5, moveAmount * 6);
        const stride = Math.sin(avatar.walkTime) * Math.min(0.35, moveAmount * 0.18);
        avatar.leftArm.rotation.x = -stride;
        avatar.rightArm.rotation.x = stride;
        avatar.leftLeg.rotation.x = stride;
        avatar.rightLeg.rotation.x = -stride;
      }

      // Death debris physics
      if (avatar.deathTimer > 0) {
        avatar.deathTimer -= dt;
        // Hide original model, show debris
        avatar.root.visible = false;
        if (avatar._deathDebris) {
          avatar._deathDebris.forEach((piece) => {
            piece.velocity.y -= 15 * dt; // gravity
            piece.mesh.position.addScaledVector(piece.velocity, dt);
            piece.mesh.rotation.x += piece.spin.x * dt;
            piece.mesh.rotation.z += piece.spin.z * dt;
            // Fade out in last 0.6 seconds
            if (avatar.deathTimer < 0.6) {
              piece.mesh.traverse((child) => {
                if (child.material) {
                  child.material.transparent = true;
                  child.material.opacity = Math.max(0, avatar.deathTimer / 0.6);
                }
              });
            }
          });
        }
        if (avatar.deathTimer <= 0) {
          avatar.deathTimer = 0;
          this._removeDeathDebris(avatar);
        }
      }
      // Hide health bar during death
      if (avatar.healthBar) {
        avatar.healthBar.visible = !avatar.isDead && avatar.deathTimer <= 0;
      }
      // Show/hide based on alive state
      if (avatar.isDead && avatar.deathTimer <= 0) {
        avatar.root.visible = false;
      } else if (!avatar.isDead && avatar.deathTimer <= 0) {
        avatar.root.visible = true;
      }

      // Knockback displacement
      if (avatar.knockbackTimer > 0) {
        avatar.knockbackTimer -= dt * 1000;
        avatar.root.position.addScaledVector(avatar.knockbackVelocity, dt);
        avatar.knockbackVelocity.multiplyScalar(0.92);
      }

      // Attack animation hold timer
      if (avatar.attackAnimTimer > 0) avatar.attackAnimTimer -= dt;

      // Detect attack start for VFX — use attackSeq to catch rapid-fire attacks
      const newAttack = avatar.attackSeq !== avatar.lastAttackSeq;
      if (newAttack) {
        avatar.lastAttackSeq = avatar.attackSeq;
        avatar.attackAnimTimer = 0.4; // hold attack anim for at least 400ms
        this._spawnRemoteAttackVFX(avatar);
      }
      avatar.wasAttacking = avatar.isAttacking;
    });

    // Update remote VFX particles
    this._updateRemoteVFX(dt);
  }

  _spawnDeathDebris(avatar) {
    this._removeDeathDebris(avatar);
    const worldPos = avatar.root.position.clone();
    const debris = [];

    // Body part names in the GLB model
    const partNames = ['head', 'arm-left', 'arm-right', 'leg-left', 'leg-right', 'torso'];

    // Find the GLB model node inside the root group
    let modelNode = null;
    avatar.root.traverse((child) => {
      if (child.isGroup && child.rotation.y === Math.PI) modelNode = child;
    });

    // Force world matrix update so getWorldPosition/Scale are accurate
    avatar.root.updateMatrixWorld(true);

    for (const partName of partNames) {
      let srcNode = null;
      const searchRoot = modelNode || avatar.root;
      searchRoot.traverse((child) => {
        if (child.name === partName) srcNode = child;
      });

      if (!srcNode) continue;

      // Clone the body part as a standalone mesh group
      const piece = srcNode.clone(true);
      // Get world position and scale of the part
      const partWorldPos = new THREE.Vector3();
      const partWorldScale = new THREE.Vector3();
      srcNode.getWorldPosition(partWorldPos);
      srcNode.getWorldScale(partWorldScale);
      piece.position.copy(partWorldPos);
      piece.rotation.set(0, 0, 0);
      piece.scale.copy(partWorldScale);

      // Random outward velocity (Roblox-style burst)
      const angle = Math.random() * Math.PI * 2;
      const upForce = partName === 'head' ? 8 : 3 + Math.random() * 4;
      const outForce = 2 + Math.random() * 3;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * outForce,
        upForce,
        Math.sin(angle) * outForce,
      );
      const spin = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        0,
        (Math.random() - 0.5) * 12,
      );

      this.scene.remotePlayerGroup.add(piece);
      debris.push({ mesh: piece, velocity, spin });
    }

    // If no GLB parts found (fallback avatar), create box debris from limbs
    if (debris.length === 0) {
      const color = 0xcc3333;
      const parts = [
        { size: [0.5, 0.5, 0.5], offset: [0, 1.6, 0], up: 8 },  // head
        { size: [0.72, 0.82, 0.46], offset: [0, 0.9, 0], up: 3 }, // body
        { size: [0.18, 0.72, 0.18], offset: [-0.48, 0.9, 0], up: 5 }, // left arm
        { size: [0.18, 0.72, 0.18], offset: [0.48, 0.9, 0], up: 5 },  // right arm
        { size: [0.2, 0.68, 0.2], offset: [-0.18, 0.34, 0], up: 4 },  // left leg
        { size: [0.2, 0.68, 0.2], offset: [0.18, 0.34, 0], up: 4 },   // right leg
      ];
      for (const part of parts) {
        const geom = new THREE.BoxGeometry(...part.size);
        const mat = new THREE.MeshLambertMaterial({ color });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(
          worldPos.x + part.offset[0],
          worldPos.y + part.offset[1],
          worldPos.z + part.offset[2],
        );
        const angle = Math.random() * Math.PI * 2;
        const velocity = new THREE.Vector3(
          Math.cos(angle) * (2 + Math.random() * 3),
          part.up + Math.random() * 2,
          Math.sin(angle) * (2 + Math.random() * 3),
        );
        const spin = new THREE.Vector3(
          (Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12,
        );
        this.scene.remotePlayerGroup.add(mesh);
        debris.push({ mesh, velocity, spin });
      }
    }

    avatar._deathDebris = debris;
  }

  _removeDeathDebris(avatar) {
    if (!avatar._deathDebris) return;
    avatar._deathDebris.forEach((piece) => {
      this.scene.remotePlayerGroup.remove(piece.mesh);
    });
    avatar._deathDebris = null;
  }

  _cleanupDeathState(avatar) {
    this._removeDeathDebris(avatar);
    avatar.deathTimer = 0;
    avatar.root.visible = true;
    // Restore any material state
    avatar.root.traverse((child) => {
      if (child.material) {
        child.material.opacity = 1;
        child.material.transparent = false;
      }
    });
  }

  applyKnockback(playerName, direction, strength) {
    const avatar = this.avatars.get(playerName);
    if (!avatar) return;
    avatar.knockbackVelocity.copy(direction).multiplyScalar(strength);
    avatar.knockbackTimer = 240;
  }

  _updateAnimationState(avatar) {
    // During death, model is hidden — debris handles visuals
    if (avatar.isDead || avatar.deathTimer > 0) return;

    const speed = avatar.snapshotVelocity.length();

    if (avatar.isAttacking || avatar.attackAnimTimer > 0) {
      _switchAnimation(avatar, ANIM_ATTACK);
    } else if (speed > 4.0) {
      _switchAnimation(avatar, ANIM_SPRINT);
    } else if (speed > 0.5) {
      _switchAnimation(avatar, ANIM_WALK);
    } else {
      _switchAnimation(avatar, ANIM_IDLE);
    }
  }

  _spawnRemoteAttackVFX(avatar) {
    const skillId = avatar.attackSkillId;
    if (!skillId) return;

    const pos = avatar.root.position;
    const yaw = avatar.remoteYaw;
    const pitch = avatar.remotePitch;

    // Forward direction from remote player's yaw/pitch
    const forward = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    ).normalize();

    if (skillId === 'fire_fist') {
      this._spawnRemoteFireball(pos, forward, yaw, {
        speed: 9, scale: 0.3, count: 20, life: 0.5,
        glbKey: 'fire_fist', glbScale: 4.5,
      });
    } else if (skillId === 'flame_emperor') {
      this._spawnRemoteFireball(pos, forward, yaw, {
        speed: 7, scale: 0.5, count: 35, life: 0.8,
        glbKey: 'flame_emperor', glbScale: 7.0, glbRotY: Math.PI / 2,
      });
    } else if (skillId === 'fire_pillar') {
      this._spawnRemoteFirePillar(pos, yaw);
    } else {
      // Generic attack particles for any other skill
      this._spawnGenericAttackVFX(pos, forward, avatar.remoteFruitId);
    }
  }

  async _spawnRemoteFireball(playerPos, forward, yaw, opts) {
    const spawnPos = new THREE.Vector3(
      playerPos.x + forward.x * 1.2,
      playerPos.y + 1.0 + forward.y * 1.0,
      playerPos.z + forward.z * 1.2,
    );
    const vel = forward.clone().multiplyScalar(opts.speed);

    // Spawn GLB projectile model
    if (opts.glbKey) {
      const tmpl = await loadFireSkillTemplate(opts.glbKey);
      if (tmpl) {
        const projModel = tmpl.scene.clone();
        projModel.traverse((child) => {
          if (child.isMesh && child.material) child.material = child.material.clone();
        });
        projModel.scale.copy(tmpl.baseScale).multiplyScalar(opts.glbScale);
        projModel.position.set(0, 0, 0);
        if (opts.glbRotY) projModel.rotation.y = opts.glbRotY;

        const projGroup = new THREE.Group();
        projGroup.position.copy(spawnPos);
        _rotMatrix.lookAt(_lookOrigin, forward, _lookUp);
        _quat.setFromRotationMatrix(_rotMatrix);
        projGroup.quaternion.copy(_quat);
        projGroup.add(projModel);
        this.scene.particleGroup.add(projGroup);

        this._remoteVFX.push({
          type: 'glb_projectile',
          group: projGroup,
          vel: vel.clone(),
          age: 0,
          maxAge: opts.life + 0.8,
          fadeStart: opts.life + 0.3,
        });
      }
    }

    // Trail particles
    for (let i = 0; i < opts.count; i++) {
      const color = FIRE_COLORS[i % FIRE_COLORS.length];
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthTest: false,
      });
      const sz = (0.08 + Math.random() * 0.12) * opts.scale / 0.3;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mat);
      mesh.position.copy(spawnPos);
      mesh.position.x += (Math.random() - 0.5) * 0.4;
      mesh.position.y += (Math.random() - 0.5) * 0.4;
      mesh.position.z += (Math.random() - 0.5) * 0.4;
      mesh.renderOrder = 58;
      this.scene.particleGroup.add(mesh);

      _spreadVec.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.3) * 2,
        (Math.random() - 0.5) * 2,
      );
      this._remoteVFX.push({
        mesh, mat,
        vel: vel.clone().add(_spreadVec),
        age: 0,
        maxAge: opts.life + Math.random() * 0.3,
      });
    }
  }

  async _spawnRemoteFirePillar(playerPos, yaw) {
    const spawnDist = 4.0;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const pillarPos = new THREE.Vector3(
      playerPos.x + fwd.x * spawnDist,
      playerPos.y,
      playerPos.z + fwd.z * spawnDist,
    );

    // Spawn GLB tornado model
    const tmpl = await loadFireSkillTemplate('fire_pillar');
    if (tmpl) {
      const pillarModel = tmpl.scene.clone();
      pillarModel.traverse((child) => {
        if (child.isMesh && child.material) child.material = child.material.clone();
      });
      const worldScale = 6.0;
      const thinFactor = 0.5;
      pillarModel.scale.set(
        tmpl.baseScale.x * worldScale * thinFactor,
        tmpl.baseScale.y * worldScale,
        tmpl.baseScale.z * worldScale * thinFactor,
      );
      pillarModel.position.set(0, 0, 0);

      const pillarGroup = new THREE.Group();
      pillarGroup.position.copy(pillarPos);
      pillarGroup.add(pillarModel);
      this.scene.particleGroup.add(pillarGroup);

      this._remoteVFX.push({
        type: 'glb_pillar',
        group: pillarGroup,
        model: pillarModel,
        baseScale: worldScale,
        thinFactor,
        baseScaleVec: tmpl.baseScale.clone(),
        pos: pillarPos.clone(),
        age: 0,
        maxAge: 1.2,
      });
    }

    const particleCount = 40;
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 * 3;
      const radius = 0.2 + (i / particleCount) * 2.5;
      const height = (i / particleCount) * 4.0;
      const color = FIRE_COLORS[i % FIRE_COLORS.length];
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthTest: false,
      });
      const sz = 0.08 + Math.random() * 0.12;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mat);
      mesh.position.set(
        pillarPos.x + Math.cos(angle) * radius,
        pillarPos.y + height + Math.random() * 0.5,
        pillarPos.z + Math.sin(angle) * radius,
      );
      mesh.renderOrder = 58;
      this.scene.particleGroup.add(mesh);

      this._remoteVFX.push({
        mesh, mat,
        type: 'pillar',
        age: 0,
        maxAge: 0.8 + Math.random() * 0.5,
        spinAngle: angle,
        spinRadius: radius,
        spinSpeed: 5 + Math.random() * 3,
        basePos: pillarPos.clone(),
        velY: 3 + Math.random() * 5,
      });
    }
  }

  _spawnGenericAttackVFX(pos, forward, fruitId) {
    // Simple burst particles in the attack direction
    const colors = fruitId === 'flame' ? FIRE_COLORS
      : fruitId === 'ice' ? [0x6ec6ff, 0xaaddff, 0xffffff]
      : fruitId === 'dark' ? [0x6a3d99, 0x442266, 0x884488]
      : fruitId === 'light' ? [0xfff4a0, 0xffffff, 0xffee88]
      : fruitId === 'magma' ? [0xcc3300, 0xff4400, 0xff8800]
      : fruitId === 'sand' ? [0xd4a843, 0xeedd88, 0xccbb77]
      : [0xffffff, 0xcccccc, 0xffddaa]; // rubber or default

    const spawnPos = new THREE.Vector3(
      pos.x + forward.x * 1.0,
      pos.y + 1.0 + forward.y * 0.8,
      pos.z + forward.z * 1.0,
    );

    for (let i = 0; i < 10; i++) {
      const color = colors[i % colors.length];
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthTest: false,
      });
      const sz = 0.06 + Math.random() * 0.08;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mat);
      mesh.position.copy(spawnPos);
      mesh.renderOrder = 58;
      this.scene.particleGroup.add(mesh);

      _spreadVec.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.3) * 2,
        (Math.random() - 0.5) * 2,
      );
      this._remoteVFX.push({
        mesh, mat,
        vel: forward.clone().multiplyScalar(3 + Math.random() * 2).add(_spreadVec),
        age: 0,
        maxAge: 0.3 + Math.random() * 0.3,
      });
    }
  }

  _updateRemoteVFX(dt) {
    for (let i = this._remoteVFX.length - 1; i >= 0; i--) {
      const p = this._remoteVFX[i];
      p.age += dt;

      if (p.age >= p.maxAge) {
        this._cleanupVFXEntry(p);
        this._remoteVFX.splice(i, 1);
        continue;
      }

      const t = p.age / p.maxAge;

      if (p.type === 'glb_projectile') {
        // GLB model flying forward
        p.group.position.addScaledVector(p.vel, dt);
        // Fade out materials near end
        if (p.age > p.fadeStart) {
          const fadeT = (p.age - p.fadeStart) / (p.maxAge - p.fadeStart);
          p.group.traverse((child) => {
            if (child.isMesh && child.material) {
              child.material.transparent = true;
              child.material.opacity = 1 - fadeT;
            }
          });
        }
      } else if (p.type === 'glb_pillar') {
        // GLB tornado rising and spinning
        const risePhase = Math.min(1, t * 3);
        const fadePhase = Math.max(0, (t - 0.6) / 0.4);
        const scaleExpand = 1 + risePhase * 1.5 - fadePhase * 0.8;
        const yRise = risePhase * 3.0;

        p.group.position.y = p.pos.y + yRise;
        const thin = p.thinFactor;
        const bs = p.baseScaleVec;
        p.model.scale.set(
          bs.x * p.baseScale * thin * scaleExpand,
          bs.y * p.baseScale * scaleExpand,
          bs.z * p.baseScale * thin * scaleExpand,
        );
        p.group.rotation.y += dt * 8;

        // Fade out
        p.group.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.transparent = true;
            child.material.opacity = 1 - fadePhase;
          }
        });
      } else if (p.type === 'pillar') {
        // Spiral particle upward
        p.spinAngle += p.spinSpeed * dt;
        const expandRadius = p.spinRadius * (1 + t * 0.5);
        p.mesh.position.x = p.basePos.x + Math.cos(p.spinAngle) * expandRadius;
        p.mesh.position.z = p.basePos.z + Math.sin(p.spinAngle) * expandRadius;
        p.mesh.position.y += p.velY * dt;
        p.mesh.rotation.x += dt * 8;
        p.mesh.rotation.y += dt * 6;
        p.mat.opacity = Math.max(0, (1 - t) * 0.9);
        p.mesh.scale.setScalar(1 + t * 1.2);
      } else if (p.vel) {
        // Projectile-like particle
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.y -= 2.0 * dt;
        p.mesh.rotation.x += dt * 6;
        p.mesh.rotation.y += dt * 4;
        p.mat.opacity = Math.max(0, (1 - t) * 0.9);
        p.mesh.scale.setScalar(1 + t * 1.2);
      }
    }
  }

  _cleanupVFXEntry(p) {
    if (p.group) {
      // GLB-based entry — dispose cloned materials, remove group
      p.group.traverse((child) => {
        if (child.isMesh && child.material) child.material.dispose();
      });
      this.scene.particleGroup.remove(p.group);
    } else if (p.mesh) {
      this.scene.particleGroup.remove(p.mesh);
      p.mat?.dispose();
      p.mesh.geometry?.dispose();
    }
  }

  clear() {
    this.avatars.forEach((avatar) => {
      this._removeDeathDebris(avatar);
      this.scene.remotePlayerGroup.remove(avatar.root);
    });
    this.avatars.clear();

    for (const p of this._remoteVFX) {
      this._cleanupVFXEntry(p);
    }
    this._remoteVFX = [];
  }
}
