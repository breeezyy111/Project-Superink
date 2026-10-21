import * as THREE from 'three';
import { gear, GearItem } from './items';
import type { WeaponKind } from './weapons';

export interface Look {
  skin: string;
  hair: 0 | 1 | 2 | 3; // Frill Crown, Swoop Fin, Twin Fins, Short Crop
  eyes: string;
  mark: 0 | 1 | 2; // Zebra Band, Cheek Fins, Freckle Dots
  head: string; // gear ids
  clothes: string;
  shoes: string;
}

export const SKIN_TONES = ['#ffe0c7', '#f6c9a2', '#e2a77c', '#c07f55', '#8f5a3a', '#5e3b26'];
export const EYE_COLORS = ['#3b2a8c', '#1f8a5c', '#b0461f', '#1f6fb0', '#8a1f6f', '#333333'];
export const HAIR_NAMES = ['Frill Crown', 'Swoop Fin', 'Twin Fins', 'Short Crop'];
export const MARK_NAMES = ['Zebra Band', 'Cheek Fins', 'Freckle Dots'];

export const DEFAULT_LOOK: Look = {
  skin: SKIN_TONES[1], hair: 0, eyes: EYE_COLORS[0], mark: 0,
  head: 'h_none', clothes: 'c_tee_white', shoes: 's_sneaker_white',
};

const MARK_COLOR = '#1f1b2b';

/** Fabric texture for clothes: stripes / jersey number, white elsewhere (tinted by material color). */
const clothTexCache = new Map<string, THREE.Texture>();
function clothTexture(item: GearItem) {
  if (item.style !== 'stripe') return null;
  let t = clothTexCache.get(item.id);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = item.color;
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = item.accent;
  for (let y = 4; y < 128; y += 22) g.fillRect(0, y, 64, 10);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  clothTexCache.set(item.id, t);
  return t;
}

let checkerTex: THREE.Texture | null = null;
function checker() {
  if (checkerTex) return checkerTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#15121c' : '#ffffff';
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  checkerTex = new THREE.CanvasTexture(c);
  checkerTex.colorSpace = THREE.SRGBColorSpace;
  checkerTex.wrapS = checkerTex.wrapT = THREE.RepeatWrapping;
  checkerTex.repeat.set(3, 2);
  return checkerTex;
}

const numberCache = new Map<string, THREE.Texture>();
function numberTexture(color: string) {
  let t = numberCache.get(color);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '900 100px "Titan One", "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText('7', 64, 70);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  numberCache.set(color, t);
  return t;
}

/** A band of sphere surface around the face; `edge(a)` returns [top, bottom] polar angles. */
function faceBand(r: number, a0: number, a1: number, edge: (a: number) => [number, number], segs = 48) {
  const pos: number[] = [];
  const idx: number[] = [];
  const P = (a: number, th: number) => [r * Math.sin(a) * Math.sin(th), r * Math.cos(th), r * Math.cos(a) * Math.sin(th)];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (a1 - a0) * (i / segs);
    const [t0, t1] = edge(a);
    pos.push(...P(a, t0), ...P(a, (t0 + t1) / 2), ...P(a, t1));
    if (i < segs) {
      const k = i * 3;
      idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const eyeTexCache = new Map<string, THREE.Texture>();
/** Big cartoony eye with a cuttlefish "W" pupil. */
function eyeTexture(iris: string) {
  let t = eyeTexCache.get(iris);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(64, 64, 60, 62, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = iris;
  g.beginPath(); g.ellipse(64, 70, 40, 46, 0, 0, Math.PI * 2); g.fill();
  // W pupil
  g.fillStyle = '#0d0d14';
  g.beginPath();
  g.moveTo(34, 58); g.quadraticCurveTo(44, 92, 52, 84); g.quadraticCurveTo(58, 72, 64, 66);
  g.quadraticCurveTo(70, 72, 76, 84); g.quadraticCurveTo(84, 92, 94, 58);
  g.quadraticCurveTo(96, 82, 80, 96); g.quadraticCurveTo(70, 100, 64, 88);
  g.quadraticCurveTo(58, 100, 48, 96); g.quadraticCurveTo(32, 82, 34, 58);
  g.fill();
  // shines
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(46, 46, 11, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(82, 92, 5, 0, Math.PI * 2); g.fill();
  // lash line
  g.strokeStyle = '#0d0d14';
  g.lineWidth = 7;
  g.beginPath(); g.ellipse(64, 64, 58, 60, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  eyeTexCache.set(iris, t);
  return t;
}

let zebraTex: THREE.Texture | null = null;
/** White with soft gray bands: multiplied by the ink color for cuttlefish zebra stripes. */
function zebraTexture() {
  if (zebraTex) return zebraTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  // bands run across the back (u wraps around the sphere, v goes pole to pole)
  for (let i = 0; i < 9; i++) {
    const x = i * 28 + 10;
    g.beginPath();
    g.moveTo(x, 40);
    g.bezierCurveTo(x + 10, 90, x - 10, 140, x + 4, 128);
    g.lineTo(x + 10, 128);
    g.bezierCurveTo(x + 4, 140, x + 20, 90, x + 12, 40);
    g.fill();
  }
  zebraTex = new THREE.CanvasTexture(c);
  zebraTex.colorSpace = THREE.SRGBColorSpace;
  return zebraTex;
}

/** Wavy frill strip wrapped around a center, like a cuttlefish's side fins. */
function frillGeometry(radius: number, width: number, start: number, end: number, waves: number, droop: number, segs = 96) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = start + (end - start) * t;
    const taper = Math.sin(Math.PI * t) ** 0.6;
    const w = width * (0.75 + 0.25 * Math.sin(a * waves)) * taper;
    const wave = Math.sin(a * waves * 1.0 + 0.6) * 0.035 * taper;
    const x = Math.sin(a), z = Math.cos(a);
    pos.push(x * radius, 0, z * radius);
    pos.push(x * (radius + w), -droop * w + wave, z * (radius + w));
    if (i < segs) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function glossy(color: THREE.ColorRepresentation, extra: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1, ...extra });
}

export class InkfinModel {
  root = new THREE.Group();
  kid = new THREE.Group();
  fish = new THREE.Group();
  inkMats: THREE.MeshPhysicalMaterial[] = [];
  private tankInk!: THREE.Mesh;
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private torso!: THREE.Group;
  private head!: THREE.Group;
  private tentacles: THREE.Object3D[] = [];
  weaponMount = new THREE.Group();
  offhandMount = new THREE.Group();
  weaponModel: THREE.Group | null = null;
  rollerDrum: THREE.Object3D | null = null;
  private walkPhase = 0;
  private squash = 1;
  private squashV = 0;
  private eyes: THREE.Mesh[] = [];
  private blinkT = 2 + Math.random() * 3;
  private airT = 0;
  private idleT = 0;
  private lookT = 3 + Math.random() * 4;
  private lookYaw = 0;
  private spawnT = 1;
  private danceT = 0;

  constructor(public look: Look, inkColor: string, public weapon: WeaponKind) {
    this.root.add(this.kid, this.fish);
    this.buildKid();
    this.buildFish();
    this.setInkColor(inkColor);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
      }
    });
    this.fish.visible = false;
  }

  private inkMat() {
    const m = glossy('#fff', { roughness: 0.12, clearcoatRoughness: 0.05 });
    this.inkMats.push(m);
    return m;
  }

  setInkColor(c: string) {
    for (const m of this.inkMats) m.color.set(c);
  }

  private buildKid() {
    const L = this.look;
    const skin = glossy(L.skin, { roughness: 0.45, clearcoat: 0.3 });
    const cloth = gear(L.clothes);
    const shoeItem = gear(L.shoes);
    const ctex = clothTexture(cloth);
    const shirt = new THREE.MeshStandardMaterial({ color: ctex ? '#ffffff' : cloth.color, map: ctex, roughness: 0.75 });
    const pants = new THREE.MeshStandardMaterial({ color: '#2a2d3a', roughness: 0.7 });
    const shoe = shoeItem.style === 'slipon'
      ? new THREE.MeshStandardMaterial({ map: checker(), roughness: 0.6 })
      : glossy(shoeItem.color, { roughness: 0.4 });
    const shoeAccent = glossy(shoeItem.accent, { roughness: 0.4 });
    const sole = new THREE.MeshStandardMaterial({ color: '#1d1d24', roughness: 0.6 });
    const sock = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.8 });

    // legs (short and stubby: Splatoon-style proportions)
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.1 * s, 0.5, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.26, 6, 12), skin);
      leg.position.y = -0.2;
      hip.add(leg);
      const short = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.105, 0.18, 14), pants);
      short.position.y = -0.03;
      hip.add(short);
      const so = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.08, 12), sock);
      so.position.y = -0.37;
      hip.add(so);
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.14, 6, 12), shoe);
      foot.rotation.x = Math.PI / 2;
      foot.scale.set(1, 1, 0.85);
      foot.position.set(0, -0.43, 0.04);
      hip.add(foot);
      const sl = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.15, 4, 12), sole);
      sl.rotation.x = Math.PI / 2;
      sl.scale.set(1.05, 1, 0.3);
      sl.position.set(0, -0.485, 0.04);
      hip.add(sl);
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.089, 0.016, 6, 16), shoeItem.style === 'sneaker' ? this.inkMat() : shoeAccent);
      stripe.rotation.y = Math.PI / 2;
      stripe.position.set(0, -0.42, 0.04);
      hip.add(stripe);
      if (shoeItem.style === 'hightop') {
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.14, 14), shoe);
        collar.position.set(0, -0.35, 0.0);
        const lace = new THREE.Mesh(new THREE.CylinderGeometry(0.087, 0.087, 0.025, 14), shoeAccent);
        lace.position.set(0, -0.3, 0);
        hip.add(collar, lace);
      }
      this.kid.add(hip);
      this.legs.push(hip);
    }

    // torso
    this.torso = new THREE.Group();
    this.torso.position.y = 0.5;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.16, 8, 16), shirt);
    body.position.y = 0.2;
    body.scale.set(1.05, 1, 0.82);
    this.torso.add(body);
    // ink-colored collar + hem stripe
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 8, 20), this.inkMat());
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.42;
    this.torso.add(collar);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.022, 8, 24), this.inkMat());
    hem.rotation.x = Math.PI / 2;
    hem.scale.set(1.05, 0.82, 1);
    hem.position.y = 0.06;
    this.torso.add(hem);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 12), skin);
    neck.position.y = 0.47;
    this.torso.add(neck);
    if (cloth.style === 'hoodie') {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), shirt);
      hood.rotation.x = -1.9;
      hood.position.set(0, 0.4, -0.1);
      hood.scale.set(1.1, 1, 0.8);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.03), new THREE.MeshStandardMaterial({ color: cloth.accent, roughness: 0.8 }));
      pocket.position.set(0, 0.12, 0.145);
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), new THREE.MeshStandardMaterial({ color: cloth.accent }));
      string.position.set(0.04, 0.35, 0.14);
      const string2 = string.clone();
      string2.position.x = -0.04;
      this.torso.add(hood, pocket, string, string2);
    }
    if (cloth.style === 'jersey') {
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshStandardMaterial({ map: numberTexture(cloth.accent), transparent: true, roughness: 0.7 }));
      num.position.set(0, 0.24, 0.147);
      this.torso.add(num);
      const back = num.clone();
      back.position.z = -0.147;
      back.rotation.y = Math.PI;
      this.torso.add(back);
    }
    this.kid.add(this.torso);

    // ink tank backpack (shows remaining ink)
    const tank = new THREE.Group();
    tank.position.set(0, 0.24, -0.19);
    const glass = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.085, 0.16, 6, 14),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1 }),
    );
    tank.add(glass);
    this.tankInk = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.3, 14), this.inkMat());
    tank.add(this.tankInk);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12), new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.4 }));
    cap.position.y = 0.18;
    tank.add(cap);
    for (const s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.5 }));
      strap.rotation.y = Math.PI / 2;
      strap.position.set(0.1 * s, 0.07, 0.12);
      tank.add(strap);
    }
    this.torso.add(tank);

    // arms
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(0.21 * s, 0.33, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.18, 6, 10), skin);
      arm.position.y = -0.13;
      sh.add(arm);
      const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), cloth.style === 'tank' ? skin : shirt);
      sleeve.scale.set(1, 0.9, 1);
      sleeve.position.y = -0.02;
      sh.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), skin);
      hand.position.y = -0.27;
      sh.add(hand);
      this.torso.add(sh);
      this.arms.push(sh);
    }
    // weapon held in right hand
    this.weaponMount.position.set(0, -0.27, 0.02);
    this.arms[1].add(this.weaponMount);
    this.offhandMount.position.set(0, -0.27, 0.02);
    this.arms[0].add(this.offhandMount);

    // head: big and round
    this.head = new THREE.Group();
    this.head.position.y = 0.8;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.33, 32, 24), skin);
    skull.scale.set(1, 0.93, 0.95);
    this.head.add(skull);
    // eyes
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.115, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ map: eyeTexture(L.eyes), roughness: 0.12, clearcoat: 1 }),
      );
      eye.rotation.x = Math.PI / 2;
      eye.scale.set(0.8, 0.3, 1.0);
      eye.position.set(0.122 * s, 0.0, 0.272);
      eye.rotation.y = s * 0.4;
      this.head.add(eye);
      this.eyes.push(eye);
      if (L.mark === 2) {
        // freckle dots in ink color
        for (let k = 0; k < 3; k++) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), this.inkMat());
          dot.position.set((0.17 + k * 0.035) * s, -0.115 - (k % 2) * 0.014, 0.24 - k * 0.04);
          this.head.add(dot);
        }
      } else if (L.mark === 1) {
        // cheek fins: three slanted stripes per cheek
        for (let k = 0; k < 3; k++) {
          const a = s * (0.62 + k * 0.17);
          const th = Math.PI / 2 + 0.28 + k * 0.03;
          const n = new THREE.Vector3(Math.sin(a) * Math.sin(th), Math.cos(th), Math.cos(a) * Math.sin(th));
          const st = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.07, 4, 8), new THREE.MeshStandardMaterial({ color: MARK_COLOR, roughness: 0.5 }));
          st.position.copy(n).multiplyScalar(0.312).multiply(new THREE.Vector3(1, 0.93, 0.95));
          st.lookAt(st.position.clone().add(n));
          st.rotateX(Math.PI / 2);
          st.rotateZ(s * 0.5);
          st.scale.set(1, 1, 0.5);
          this.head.add(st);
        }
      }
    }
    if (L.mark === 0) {
      // zebra band: a wavy dark band across the eyes, like cuttlefish stripes
      const band = new THREE.Mesh(
        faceBand(0.333, -1.35, 1.35, (a) => {
          const taper = Math.cos((a / 1.35) * Math.PI * 0.5) ** 0.5;
          const w = 0.25 * taper + 0.02;
          // zig-zag stripe edges, like the bands on a real cuttlefish
          const zig = (x: number) => (Math.abs(((x % 1) + 1) % 1 - 0.5) - 0.25) * 4;
          const top = zig(a * 2.2) * 0.07 * taper;
          const bot = zig(a * 2.2 + 0.5) * 0.06 * taper;
          return [Math.PI / 2 - w + top, Math.PI / 2 + w * 0.8 + bot];
        }),
        new THREE.MeshStandardMaterial({ color: MARK_COLOR, roughness: 0.45, side: THREE.DoubleSide }),
      );
      band.scale.set(1, 0.93, 0.95);
      band.position.y = 0.0;
      this.head.add(band);
    }
    // smile
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#4a1f1f' }));
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.135, 0.29);
    mouth.rotation.x = -0.35;
    this.head.add(mouth);

    this.buildHair();
    this.buildHeadgear();
    this.torso.add(this.head);
  }

  private buildHair() {
    const hair = this.inkMat();
    hair.side = THREE.DoubleSide;
    // cap, tilted back so the forehead shows
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.345, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.56), hair);
    cap.scale.set(1.02, 0.96, 1.0);
    cap.position.set(0, 0.015, -0.01);
    cap.rotation.x = -0.32;
    this.head.add(cap);
    // bangs: rounded lobes over the forehead
    for (let i = -2; i <= 2; i++) {
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), hair);
      lobe.scale.set(1.15, 0.8, 0.55);
      lobe.position.set(i * 0.085, 0.16 - Math.abs(i) * 0.035, 0.27 - Math.abs(i) * 0.04);
      lobe.rotation.y = i * 0.3;
      this.head.add(lobe);
    }
    const style = this.look.hair;
    if (style === 0) {
      // Frill Crown: two layers of wavy fins hanging around the back and sides
      const f1 = new THREE.Mesh(frillGeometry(0.31, 0.24, Math.PI * 0.28, Math.PI * 1.72, 9, 2.0), hair);
      f1.position.y = 0.06;
      this.head.add(f1);
      const f2 = new THREE.Mesh(frillGeometry(0.28, 0.16, Math.PI * 0.4, Math.PI * 1.6, 11, 1.1), hair);
      f2.position.y = 0.2;
      this.head.add(f2);
    } else if (style === 1) {
      // Swoop Fin: short frill + a long frilled tail sweeping down the back
      const f1 = new THREE.Mesh(frillGeometry(0.31, 0.14, Math.PI * 0.35, Math.PI * 1.65, 9, 1.6), hair);
      f1.position.y = 0.08;
      this.head.add(f1);
      for (let k = 0; k < 5; k++) {
        const r = 0.085 - k * 0.011;
        const seg = new THREE.Mesh(frillGeometry(r, 0.075 - k * 0.006, 0, Math.PI * 2, 7, 0.5, 40), hair);
        const core = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), hair);
        core.scale.set(1, 1.2, 1);
        seg.position.set(0, 0.12 - k * 0.12, -0.36 - k * 0.04);
        seg.rotation.x = -0.5;
        core.position.copy(seg.position);
        this.head.add(seg, core);
      }
    } else if (style === 3) {
      // Short Crop: just a tight little frill at the nape
      const f1 = new THREE.Mesh(frillGeometry(0.3, 0.07, Math.PI * 0.5, Math.PI * 1.5, 10, 1.2), hair);
      f1.position.y = 0.0;
      this.head.add(f1);
    } else {
      // Twin Fins: two big frilled side fins like cuttlefish wings
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        g.position.set(0.3 * s, -0.04, -0.06);
        g.rotation.z = s * -0.55;
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), hair);
        core.scale.set(0.9, 1.9, 0.7);
        core.position.y = -0.08;
        const fr = new THREE.Mesh(frillGeometry(0.06, 0.12, Math.PI * 0.1, Math.PI * 1.9, 7, 0.1, 48), hair);
        fr.rotation.z = Math.PI / 2;
        fr.scale.set(1.9, 1, 1.1);
        fr.position.y = -0.08;
        g.add(core, fr);
        this.head.add(g);
      }
      const back = new THREE.Mesh(frillGeometry(0.31, 0.13, Math.PI * 0.62, Math.PI * 1.38, 8, 1.6), hair);
      back.position.y = 0.08;
      this.head.add(back);
    }
  }

  private buildHeadgear() {
    const item = gear(this.look.head);
    if (item.style === 'none') return;
    const main = glossy(item.color, { roughness: 0.5, clearcoat: 0.2 });
    const acc = glossy(item.accent, { roughness: 0.4 });
    const g = new THREE.Group();
    const ring = (r: number, tube: number, mat: THREE.Material, y: number, tilt = -0.25) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 36), mat);
      m.rotation.x = Math.PI / 2 + tilt;
      m.position.y = y;
      g.add(m);
      return m;
    };
    switch (item.style) {
      case 'cap': {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.36, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), main);
        crown.position.y = 0.05;
        crown.rotation.x = -0.2;
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 24, 1, false, -Math.PI / 2, Math.PI), acc);
        brim.scale.set(1.15, 1, 1.1);
        brim.position.set(0, 0.18, 0.25);
        brim.rotation.x = 0.15;
        const button = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), acc);
        button.position.set(0, 0.4, -0.06);
        g.add(crown, brim, button);
        break;
      }
      case 'beanie': {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.365, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), main);
        crown.scale.set(1, 1.08, 1);
        crown.rotation.x = -0.22;
        const cuff = ring(0.345, 0.05, acc, 0.03, -0.22);
        cuff.scale.set(1, 1, 1.4);
        const pom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), acc);
        pom.position.set(0, 0.42, -0.08);
        g.add(crown, pom);
        break;
      }
      case 'headphones': {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.03, 8, 30, Math.PI), main);
        band.position.y = 0.02;
        g.add(band);
        for (const s of [-1, 1]) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20), main);
          cup.rotation.z = Math.PI / 2;
          cup.position.set(0.34 * s, 0.0, 0);
          const pad = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 20), acc);
          pad.rotation.y = Math.PI / 2;
          pad.position.set(0.39 * s, 0.0, 0);
          g.add(cup, pad);
        }
        break;
      }
      case 'visor': {
        ring(0.335, 0.03, main, 0.13, -0.2);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24, 1, false, -Math.PI / 2, Math.PI), main);
        brim.scale.set(1.1, 1, 1.1);
        brim.position.set(0, 0.2, 0.26);
        brim.rotation.x = 0.2;
        g.add(brim);
        break;
      }
      case 'bucket': {
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.35, 0.22, 28), main);
        crown.position.y = 0.3;
        crown.rotation.x = -0.15;
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.02, 32), main);
        brim.position.y = 0.19;
        brim.rotation.x = -0.15;
        const bandM = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.345, 0.05, 28), acc);
        bandM.position.y = 0.23;
        bandM.rotation.x = -0.15;
        g.add(crown, brim, bandM);
        break;
      }
      case 'goggles': {
        ring(0.34, 0.025, new THREE.MeshStandardMaterial({ color: '#2b2b33' }), 0.14, -0.25);
        for (const s of [-1, 1]) {
          const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 20), main);
          frame.rotation.x = Math.PI / 2 - 0.5;
          frame.position.set(0.1 * s, 0.24, 0.24);
          const lens = new THREE.Mesh(new THREE.CircleGeometry(0.068, 20), new THREE.MeshPhysicalMaterial({ color: item.accent, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.8 }));
          lens.rotation.x = -0.5;
          lens.position.set(0.1 * s, 0.258, 0.272);
          g.add(frame, lens);
        }
        break;
      }
      case 'band':
        ring(0.338, 0.04, main, 0.14, -0.22);
        break;
    }
    g.traverse((o) => (o.castShadow = true));
    this.head.add(g);
  }

  private buildFish() {
    // Cuttlefish swim form: striped mantle + full frill fin + tentacles + big cute eyes
    const mantleMat = glossy('#fff', { roughness: 0.12, clearcoatRoughness: 0.05, map: zebraTexture() });
    this.inkMats.push(mantleMat);
    const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 20), mantleMat);
    mantle.scale.set(0.95, 0.55, 1.6);
    mantle.position.y = 0.2;
    this.fish.add(mantle);
    const finMat = this.inkMat();
    finMat.side = THREE.DoubleSide;
    const fin = new THREE.Mesh(frillGeometry(0.27, 0.14, 0.35, Math.PI * 2 - 0.35, 14, 0.15, 128), finMat);
    fin.scale.set(1.05, 1, 1.75);
    fin.position.y = 0.17;
    fin.rotation.y = Math.PI; // opening at the front (tentacles)
    this.fish.add(fin);

    const up = new THREE.Vector3(0, 1, 0);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ map: eyeTexture(this.look.eyes), roughness: 0.12, clearcoat: 1 }),
      );
      const n = new THREE.Vector3(0.6 * s, 0.7, 0.4).normalize();
      eye.quaternion.setFromUnitVectors(up, n);
      // spin the texture so the pupil's W sits upright when seen from the front
      eye.rotateY(s * -0.9 + Math.PI);
      eye.scale.set(1, 0.4, 1.15);
      eye.position.set(0.16 * s, 0.29, 0.26);
      this.fish.add(eye);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 7 - 0.5) * 1.9;
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.2 + (i % 3) * 0.04, 4, 8), this.inkMats[this.inkMats.length - 1]);
      t.rotation.x = Math.PI / 2 + 0.15;
      t.position.set(Math.sin(a) * 0.14, 0.13 + (i % 2) * 0.05, 0.58 + Math.cos(a) * 0.04);
      t.rotation.y = a * 0.6;
      this.fish.add(t);
      this.tentacles.push(t);
    }
  }

  setWeaponModel(m: THREE.Group, drum: THREE.Object3D | null) {
    if (this.weaponModel) this.weaponMount.remove(this.weaponModel);
    this.weaponModel = m;
    this.rollerDrum = drum;
    this.weaponMount.add(m);
    this.offhandMount.clear();
    if (m.userData.offhand) this.offhandMount.add(m.userData.offhand as THREE.Object3D);
    m.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  }

  /**
   * Animate.
   * speed: horizontal speed, aimPitch: radians (positive = up), inkFrac 0..1
   */
  animate(dt: number, opts: { speed: number; grounded: boolean; aimPitch: number; inkFrac: number; swim: boolean; hidden: boolean; firing: boolean; rolling: boolean; climbing: boolean; flicking?: boolean }) {
    this.kid.visible = !opts.swim;
    this.fish.visible = opts.swim && !opts.hidden;
    this.weaponMount.visible = true;
    this.offhandMount.visible = true;
    this.kid.position.y = 0;
    this.danceT = 0;
    // landing: squash harder the longer we were in the air
    if (opts.grounded) {
      if (this.airT > 0.18 && !opts.swim) this.squash = Math.min(this.squash, 1 - Math.min(0.32, this.airT * 0.35));
      this.airT = 0;
    } else this.airT += dt;
    this.updateSquash(dt);
    this.blink(dt);

    this.tankInk.scale.y = Math.max(0.02, opts.inkFrac);
    this.tankInk.position.y = -0.15 + 0.15 * Math.max(0.02, opts.inkFrac);

    if (opts.swim) {
      this.walkPhase += dt * (4 + opts.speed * 1.6);
      for (let i = 0; i < this.tentacles.length; i++) {
        this.tentacles[i].rotation.y = Math.sin(this.walkPhase + i) * 0.35;
      }
      this.fish.rotation.x = opts.climbing ? -Math.PI / 2.2 : opts.grounded ? 0 : -0.3;
      this.fish.position.y = opts.climbing ? 0.4 : 0;
      return;
    }

    const moving = opts.speed > 0.4 && opts.grounded;
    this.walkPhase += dt * (moving ? 5 + opts.speed * 1.1 : 0);
    const swing = moving ? Math.sin(this.walkPhase) * Math.min(0.9, opts.speed * 0.13) : 0;
    this.legs[0].rotation.x += (swing - this.legs[0].rotation.x) * Math.min(1, dt * 18);
    this.legs[1].rotation.x += (-swing - this.legs[1].rotation.x) * Math.min(1, dt * 18);
    if (!opts.grounded) {
      this.legs[0].rotation.x = -0.5;
      this.legs[1].rotation.x = 0.3;
    }
    const bob = moving ? Math.abs(Math.cos(this.walkPhase)) * 0.05 : 0;
    // idle: soft breathing bounce, and now and then a look around
    this.idleT += dt;
    const idle = !moving && opts.grounded && !opts.firing;
    const breathe = idle ? Math.sin(this.idleT * 2.6) * 0.012 : 0;
    this.torso.position.y = 0.5 + bob + breathe;
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 3 + Math.random() * 5;
      this.lookYaw = idle && Math.random() < 0.7 ? (Math.random() - 0.5) * 1.1 : 0;
    }
    if (!idle) this.lookYaw = 0;
    const w = this.weapon;
    const roller = w === 'roller';
    const twoHand = (roller || w === 'splatling') && !opts.flicking;
    const dual = w === 'dualies';
    this.torso.rotation.y = roller || dual ? 0 : -0.25;
    // left arm swings (or grips the roller / splatling / second dualie), right arm aims
    const aim = -Math.PI / 2 - opts.aimPitch;
    const target = opts.flicking ? (w === 'slosher' ? -2.4 : -2.7) : roller ? -1.0 : aim;
    const k = Math.min(1, dt * (opts.flicking ? 30 : 14));
    this.arms[1].rotation.x += (target - this.arms[1].rotation.x) * k;
    this.arms[1].rotation.y = roller ? 0.3 : dual ? 0.12 : 0.25;
    if (dual) {
      this.arms[0].rotation.x += (aim - this.arms[0].rotation.x) * k;
      this.arms[0].rotation.y = -0.12;
    } else {
      this.arms[0].rotation.x = twoHand ? this.arms[1].rotation.x : -swing * 0.8;
      this.arms[0].rotation.y = twoHand ? (roller ? -0.3 : -0.45) : 0;
    }
    this.head.rotation.x = -opts.aimPitch * 0.5 + (idle ? Math.sin(this.idleT * 2.6 + 1) * 0.03 : 0);
    this.head.rotation.y += (0.25 + this.lookYaw - this.head.rotation.y) * Math.min(1, dt * 5);
    // a little lean into the run
    this.torso.rotation.x = moving ? Math.min(0.18, opts.speed * 0.025) : 0;
  }

  /** Springy squash & stretch: squash < 1 is flattened, > 1 stretched; it wobbles back to 1. */
  private updateSquash(dt: number) {
    const k = 260, damp = 16;
    this.squashV += (-(this.squash - 1) * k - this.squashV * damp) * dt;
    this.squash += this.squashV * dt;
    this.squash = THREE.MathUtils.clamp(this.squash, 0.45, 1.5);
    // pop in after spawning
    if (this.spawnT < 1) this.spawnT = Math.min(1, this.spawnT + dt * 4);
    const grow = this.spawnT < 1 ? easeOutBack(this.spawnT) : 1;
    const sq = this.squash;
    const w = 1 / Math.sqrt(sq);
    this.root.scale.set(w * grow, sq * grow, w * grow);
  }

  private blink(dt: number) {
    this.blinkT -= dt;
    // eyes close for ~0.12s (the hemisphere's height is its local z after rotation)
    const closed = this.blinkT < 0.12 && this.blinkT > 0;
    for (const e of this.eyes) e.scale.z += ((closed ? 0.08 : 1) - e.scale.z) * Math.min(1, dt * 40);
    if (this.blinkT <= 0) this.blinkT = Math.random() < 0.15 ? 0.25 : 2 + Math.random() * 4;
  }

  pop() {
    this.squash = 0.55;
    this.squashV = 0;
  }

  /** Jump: stretch tall. */
  stretch() {
    this.squash = 1.28;
    this.squashV = 0;
  }

  /** Grow in from nothing (respawn). */
  popIn() {
    this.spawnT = 0;
  }

  /**
   * Results pose. Winners dance (hop, arms up, spin); losers slump and sniffle.
   * Call every frame instead of animate().
   */
  dance(dt: number, win: boolean, seed = 0) {
    this.kid.visible = true;
    this.fish.visible = false;
    // hands free for the celebration
    this.weaponMount.visible = false;
    this.offhandMount.visible = false;
    this.danceT += dt;
    const t = this.danceT + seed * 0.37;
    this.blink(dt);
    if (win) {
      const beat = t * 4.2;
      const hop = Math.max(0, Math.sin(beat)) * 0.14;
      this.kid.position.y = hop;
      this.squash = 1 + Math.sin(beat + Math.PI / 2) * 0.08;
      this.squashV = 0;
      this.updateSquash(0);
      this.torso.position.y = 0.5;
      this.torso.rotation.set(0, Math.sin(beat * 0.5) * 0.35, Math.sin(beat * 0.5) * 0.08);
      this.arms[0].rotation.set(-2.6 + Math.sin(beat) * 0.4, 0, 0.3);
      this.arms[1].rotation.set(-2.6 - Math.sin(beat) * 0.4, 0, -0.3);
      this.legs[0].rotation.x = Math.sin(beat) * 0.35;
      this.legs[1].rotation.x = -Math.sin(beat) * 0.35;
      this.head.rotation.set(-0.15, Math.sin(beat * 0.5) * 0.3, Math.sin(beat) * 0.12);
      // a full spin every few seconds
      const spin = (t % 4) / 4;
      this.root.rotation.y = this.baseYaw + (spin > 0.85 ? ((spin - 0.85) / 0.15) * Math.PI * 2 : 0);
    } else {
      this.kid.position.y = 0;
      this.squash = 0.96;
      this.squashV = 0;
      this.updateSquash(0);
      this.torso.position.y = 0.48;
      this.torso.rotation.set(0.25, 0, 0);
      const sniff = Math.max(0, Math.sin(t * 1.3)) ** 6;
      this.arms[0].rotation.set(0.1, 0, 0.1);
      this.arms[1].rotation.set(-1.3 - sniff * 0.6, 0, -0.5);
      this.legs[0].rotation.x = 0;
      this.legs[1].rotation.x = 0;
      this.head.rotation.set(0.45 + sniff * 0.1, Math.sin(t * 0.7) * 0.15, 0);
      this.root.rotation.y = this.baseYaw;
    }
  }

  /** facing used by dance() */
  baseYaw = 0;
}

function easeOutBack(t: number) {
  const c = 1.9;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
