import * as THREE from 'three';

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

function createAvatar(name) {
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
  return {
    root,
    targetPosition: new THREE.Vector3(),
    targetYaw: 0,
    walkTime: Math.random() * Math.PI * 2,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
  };
}

function lerpAngle(from, to, alpha) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}

export class RemotePlayers {
  constructor(sceneSetup) {
    this.scene = sceneSetup;
    this.avatars = new Map();
  }

  updateRoster(players) {
    const keep = new Set();
    players.forEach((player) => {
      if (!player?.name) return;
      keep.add(player.name);
      let avatar = this.avatars.get(player.name);
      if (!avatar) {
        avatar = createAvatar(player.name);
        avatar.root.position.set(player.x ?? 0, player.y ?? 0, player.z ?? 0);
        avatar.targetPosition.copy(avatar.root.position);
        this.scene.remotePlayerGroup.add(avatar.root);
        this.avatars.set(player.name, avatar);
      }

      avatar.targetPosition.set(player.x ?? 0, player.y ?? 0, player.z ?? 0);
      avatar.targetYaw = player.yaw ?? 0;
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
    this.avatars.forEach((avatar) => {
      avatar.root.position.lerp(avatar.targetPosition, Math.min(1, dt * 8));
      avatar.root.rotation.y = lerpAngle(avatar.root.rotation.y, avatar.targetYaw, Math.min(1, dt * 8));
      avatar.walkTime += dt * 8;
      const stride = Math.sin(avatar.walkTime) * 0.35;
      avatar.leftArm.rotation.x = -stride;
      avatar.rightArm.rotation.x = stride;
      avatar.leftLeg.rotation.x = stride;
      avatar.rightLeg.rotation.x = -stride;
    });
  }

  clear() {
    this.avatars.forEach((avatar) => {
      this.scene.remotePlayerGroup.remove(avatar.root);
    });
    this.avatars.clear();
  }
}
