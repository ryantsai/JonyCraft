import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_MODEL, SKINS } from '../config/skins.js';
import { events } from '../core/EventBus.js';

const loader = new GLTFLoader();
let cachedGLTF = null;

function loadModel() {
  if (cachedGLTF) return cachedGLTF;
  cachedGLTF = new Promise((resolve, reject) => {
    loader.load(CHARACTER_MODEL, (gltf) => resolve(gltf), undefined, reject);
  });
  return cachedGLTF;
}

/**
 * Skin selection section for the multiplayer lobby.
 * Renders a 3D preview of character-a.glb with the selected texture applied.
 */
export class SkinSelect {
  constructor(gameState) {
    this.state = gameState;
    this.container = null;
    this.previewCanvas = null;
    this.previewRenderer = null;
    this.previewScene = null;
    this.previewCamera = null;
    this.previewModel = null;
    this.animFrame = null;
    this.spinAngle = 0;
  }

  buildDOM(parentElement) {
    const section = document.createElement('div');
    section.className = 'skin-select-section';

    const label = document.createElement('span');
    label.className = 'skin-section-label';
    label.textContent = '選擇角色外觀';

    const layout = document.createElement('div');
    layout.className = 'skin-select-layout';

    const previewWrap = document.createElement('div');
    previewWrap.className = 'skin-preview-wrap';

    const canvas = document.createElement('canvas');
    canvas.className = 'skin-preview-canvas';
    canvas.width = 140;
    canvas.height = 170;

    const previewName = document.createElement('div');
    previewName.className = 'skin-preview-name';
    previewName.id = 'skin-preview-name';
    previewName.textContent = this.state.selectedSkin.name;

    previewWrap.append(canvas, previewName);

    const grid = document.createElement('div');
    grid.className = 'skin-grid';
    grid.id = 'skin-grid';

    layout.append(previewWrap, grid);
    section.append(label, layout);

    parentElement.appendChild(section);
    this.container = section;
    this.previewCanvas = canvas;

    this._initPreviewRenderer();
    this._buildGrid();
    // GLB already loads with texture-a; only swap if a different skin is selected
    this._loadModel().then(() => {
      if (this.state.selectedSkin.id !== 'a') {
        this._applyTexture(this.state.selectedSkin);
      }
    });
  }

  dispose() {
    this._stopPreviewLoop();
    if (this.previewRenderer) {
      this.previewRenderer.dispose();
      this.previewRenderer = null;
    }
  }

  _initPreviewRenderer() {
    this.previewRenderer = new THREE.WebGLRenderer({
      canvas: this.previewCanvas,
      antialias: true,
      alpha: true,
    });
    this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;

    this.previewScene = new THREE.Scene();

    this.previewCamera = new THREE.PerspectiveCamera(35, 140 / 170, 0.1, 50);
    this.previewCamera.position.set(0, 1.4, 3.3);
    this.previewCamera.lookAt(0, 0.9, 0);

    const ambient = new THREE.HemisphereLight(0xeef7ff, 0x7a684d, 1.6);
    this.previewScene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff6dd, 1.2);
    sun.position.set(3, 5, 4);
    this.previewScene.add(sun);
  }

  _buildGrid() {
    const grid = this.container.querySelector('#skin-grid');
    SKINS.forEach((skin) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'skin-card';
      card.dataset.skinId = skin.id;
      card.dataset.selected = String(skin.id === this.state.selectedSkin.id);
      card.style.setProperty('--skin-color', skin.color);

      const thumb = document.createElement('img');
      thumb.className = 'skin-card-thumb';
      thumb.src = skin.texture;
      thumb.alt = skin.name;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'skin-card-name';
      nameSpan.textContent = skin.name;

      card.append(thumb, nameSpan);

      card.addEventListener('click', () => {
        events.emit('sound:click');
        this.state.selectedSkin = skin;
        this._updateCards();
        this._applyTexture(skin);
        this.container.querySelector('#skin-preview-name').textContent = skin.name;
      });

      grid.appendChild(card);
    });
  }

  _updateCards() {
    this.container.querySelectorAll('.skin-card').forEach((card) => {
      card.dataset.selected = String(card.dataset.skinId === this.state.selectedSkin.id);
    });
  }

  async _loadModel() {
    try {
      const gltf = await loadModel();
      const model = gltf.scene.clone(true);

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = 1.6 / Math.max(size.y, 0.01);
      model.scale.setScalar(scale);

      const center = box.getCenter(new THREE.Vector3());
      model.position.y = -center.y * scale;

      this.previewModel = model;
      this.previewScene.add(model);
      this._startPreviewLoop();
    } catch (err) {
      console.error('Failed to load character model for preview:', err);
    }
  }

  _applyTexture(skin) {
    if (!this.previewModel) return;
    const img = new Image();
    img.src = skin.texture;
    img.onload = () => {
      this.previewModel.traverse((child) => {
        if (child.isMesh && child.material?.map) {
          child.material.map.image = img;
          child.material.map.needsUpdate = true;
        }
      });
    };
  }

  _startPreviewLoop() {
    this._stopPreviewLoop();
    const animate = () => {
      this.animFrame = requestAnimationFrame(animate);
      if (this.previewModel) {
        this.spinAngle += 0.012;
        this.previewModel.rotation.y = this.spinAngle;
      }
      this.previewRenderer.render(this.previewScene, this.previewCamera);
    };
    animate();
  }

  _stopPreviewLoop() {
    if (this.animFrame !== null) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }
}
