import * as THREE from 'three';
import { InkfinModel, Look } from '../game/InkfinModel';
import { buildWeaponModel, WeaponKind } from '../game/weapons';

/** The 3D turntable shown in the Locker while you customize your Inkfin. */
export class LockerStage {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private model: InkfinModel | null = null;
  /** debug: show the swim form on the turntable */
  showSwim = false;
  private holder = new THREE.Group();
  private t = 0;
  private dragging = false;
  private spin = 0;
  private lastX = 0;

  constructor(env: THREE.Texture | null, private inkColor: string) {
    this.scene.background = this.backdrop();
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.6;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6a5a8a', 1.4));
    const key = new THREE.DirectionalLight('#fff3e0', 2.4);
    key.position.set(3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9fe8ff', 1.6);
    rim.position.set(-4, 3, -4);
    this.scene.add(rim);

    // ink-puddle pedestal
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.95, 0.18, 48),
      new THREE.MeshPhysicalMaterial({ color: '#2a2438', roughness: 0.35, clearcoat: 0.6 }),
    );
    ped.position.y = -0.09;
    ped.receiveShadow = true;
    this.scene.add(ped);
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 40),
      new THREE.MeshPhysicalMaterial({ color: inkColor, roughness: 0.1, clearcoat: 1 }),
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = 0.006;
    puddle.receiveShadow = true;
    puddle.name = 'puddle';
    this.scene.add(puddle);
    this.scene.add(this.holder);

    this.camera.position.set(0, 1.3, 4.6);

    window.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).tagName === 'CANVAS') {
        this.dragging = true;
        this.lastX = e.clientX;
      }
    });
    window.addEventListener('pointerup', () => (this.dragging = false));
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.spin += (e.clientX - this.lastX) * 0.01;
      this.lastX = e.clientX;
    });
  }

  private backdrop() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#2b1f4a');
    grad.addColorStop(1, '#120e1c');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 512);
    // halftone dots
    for (let y = 0; y < 512; y += 16)
      for (let x = 0; x < 1024; x += 16) {
        const r = Math.max(0, (x / 1024) * 3.2 - 0.6);
        g.fillStyle = 'rgba(228,255,47,0.08)';
        g.beginPath(); g.arc(x + ((y / 16) % 2) * 8, y, r, 0, Math.PI * 2); g.fill();
      }
    // big ink splats
    const splat = (x: number, y: number, r: number, col: string) => {
      g.fillStyle = col;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2, d = r * (0.8 + Math.random() * 0.6);
        g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.1 + Math.random() * 0.25), 0, Math.PI * 2); g.fill();
      }
    };
    splat(820, 140, 90, 'rgba(255,47,168,0.55)');
    splat(940, 380, 70, 'rgba(228,255,47,0.45)');
    splat(560, 430, 50, 'rgba(46,232,255,0.4)');
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  setLook(look: Look, weapon: WeaponKind) {
    if (this.model) this.holder.remove(this.model.root);
    this.model = new InkfinModel(look, this.inkColor, weapon);
    const wm = buildWeaponModel(weapon, this.model.inkMats[0]);
    this.model.setWeaponModel(wm.model, wm.drum);
    this.holder.add(this.model.root);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    // keep the character on the right side when the panel is on the left
    const shift = w > 700 ? -0.95 * (w / h) * 0.55 : 0;
    this.camera.position.set(shift, 1.2, 5.0);
    this.camera.lookAt(shift, 0.78, 0);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number) {
    this.t += dt;
    if (!this.dragging) this.spin += dt * 0.35;
    this.holder.rotation.y = this.spin;
    if (this.model) {
      this.model.animate(dt, {
        speed: 0, grounded: true, aimPitch: -0.3 + Math.sin(this.t * 1.3) * 0.08, inkFrac: 0.8,
        swim: this.showSwim, hidden: false, firing: false, rolling: false, climbing: false,
      });
      this.model.root.position.y = Math.abs(Math.sin(this.t * 2.2)) * 0.03;
    }
  }
}
