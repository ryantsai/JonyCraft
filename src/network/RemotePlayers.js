import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_MODEL, SKINS } from '../config/skins.js';

const _predicted = new THREE.Vector3();
const glbLoader = new GLTFLoader();
let cachedGLTF = null;

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

  root.add(body, head, leftArm, rightArm, leftLeg, rightLeg, tag);
  return { root, leftArm, rightArm, leftLeg, rightLeg };
}

function createAvatar(name) {
  const { root, leftArm, rightArm, leftLeg, rightLeg } = createFallbackAvatar(name);
  return {
    root,
    skinId: null,
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
    // Remote player data for VFX
    remoteYaw: 0,
    remotePitch: 0,
    remoteFruitId: '',
  };
}

// Animation names from character-a.glb
const ANIM_IDLE = 'idle';
const ANIM_WALK = 'walk';
const ANIM_SPRINT = 'sprint';
const ANIM_ATTACK = 'attack-melee-right';

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

    const newRoot = new THREE.Group();
    newRoot.add(model, tag);
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
    const clipNames = [ANIM_IDLE, ANIM_WALK, ANIM_SPRINT, ANIM_ATTACK];
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

  // Attack animation plays once then returns to previous state
  if (animName === ANIM_ATTACK) {
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

// Fire skill VFX colors
const FIRE_COLORS = [0xff2200, 0xff4400, 0xff6b35, 0xffaa00, 0xffdd44];

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
      avatar.remoteYaw = player.yaw ?? 0;
      avatar.remotePitch = player.pitch ?? 0;
      avatar.remoteFruitId = player.fruitId ?? '';
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
          avatar.headNode.rotation.x = targetPitch;
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

      // Detect attack start for VFX
      if (avatar.isAttacking && !avatar.wasAttacking) {
        this._spawnRemoteAttackVFX(avatar);
      }
      avatar.wasAttacking = avatar.isAttacking;
    });

    // Update remote VFX particles
    this._updateRemoteVFX(dt);
  }

  _updateAnimationState(avatar) {
    const speed = avatar.snapshotVelocity.length();

    if (avatar.isAttacking) {
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
      });
    } else if (skillId === 'flame_emperor') {
      this._spawnRemoteFireball(pos, forward, yaw, {
        speed: 7, scale: 0.5, count: 35, life: 0.8,
      });
    } else if (skillId === 'fire_pillar') {
      this._spawnRemoteFirePillar(pos, yaw);
    } else {
      // Generic attack particles for any other skill
      this._spawnGenericAttackVFX(pos, forward, avatar.remoteFruitId);
    }
  }

  _spawnRemoteFireball(playerPos, forward, yaw, opts) {
    const spawnPos = new THREE.Vector3(
      playerPos.x + forward.x * 1.2,
      playerPos.y + 1.0 + forward.y * 1.0,
      playerPos.z + forward.z * 1.2,
    );
    const vel = forward.clone().multiplyScalar(opts.speed);

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

      this._remoteVFX.push({
        mesh, mat,
        vel: vel.clone().addScaledVector(
          new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.3) * 2,
            (Math.random() - 0.5) * 2,
          ), 1),
        age: 0,
        maxAge: opts.life + Math.random() * 0.3,
      });
    }
  }

  _spawnRemoteFirePillar(playerPos, yaw) {
    const spawnDist = 4.0;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const pillarPos = new THREE.Vector3(
      playerPos.x + fwd.x * spawnDist,
      playerPos.y,
      playerPos.z + fwd.z * spawnDist,
    );

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
      : fruitId === 'lightning' ? [0xffe060, 0xffffff, 0xffcc00]
      : fruitId === 'dark' ? [0x6a3d99, 0x442266, 0x884488]
      : fruitId === 'light' ? [0xfff4a0, 0xffffff, 0xffee88]
      : fruitId === 'quake' ? [0xc0a030, 0xffffff, 0xddcc88]
      : fruitId === 'magma' ? [0xcc3300, 0xff4400, 0xff8800]
      : fruitId === 'sand' ? [0xd4a843, 0xeedd88, 0xccbb77]
      : fruitId === 'bomb' ? [0xff4444, 0xff8800, 0xffcc00]
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

      this._remoteVFX.push({
        mesh, mat,
        vel: forward.clone().multiplyScalar(3 + Math.random() * 2).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.3) * 2,
            (Math.random() - 0.5) * 2,
          )),
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
        this.scene.particleGroup.remove(p.mesh);
        p.mat.dispose();
        p.mesh.geometry?.dispose();
        this._remoteVFX.splice(i, 1);
        continue;
      }

      const t = p.age / p.maxAge;

      if (p.type === 'pillar') {
        // Spiral upward
        p.spinAngle += p.spinSpeed * dt;
        const expandRadius = p.spinRadius * (1 + t * 0.5);
        p.mesh.position.x = p.basePos.x + Math.cos(p.spinAngle) * expandRadius;
        p.mesh.position.z = p.basePos.z + Math.sin(p.spinAngle) * expandRadius;
        p.mesh.position.y += p.velY * dt;
        p.mesh.rotation.x += dt * 8;
        p.mesh.rotation.y += dt * 6;
      } else if (p.vel) {
        // Projectile-like particle
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.y -= 2.0 * dt;
        p.mesh.rotation.x += dt * 6;
        p.mesh.rotation.y += dt * 4;
      }

      // Fade out
      p.mat.opacity = Math.max(0, (1 - t) * 0.9);
      const scale = 1 + t * 1.2;
      p.mesh.scale.setScalar(scale);
    }
  }

  clear() {
    this.avatars.forEach((avatar) => {
      this.scene.remotePlayerGroup.remove(avatar.root);
    });
    this.avatars.clear();

    // Clean up VFX
    for (const p of this._remoteVFX) {
      this.scene.particleGroup.remove(p.mesh);
      p.mat.dispose();
      p.mesh.geometry?.dispose();
    }
    this._remoteVFX = [];
  }
}
