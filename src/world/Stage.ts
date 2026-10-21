import * as THREE from 'three';
import { InkSystem } from '../ink/InkSystem';
import { Physics } from './Physics';
import {
  boxUVsWorld, brick, concreteTiles, corrugated, courtFloor, facade, graffiti, hazard, metalPlate, planks,
  plazaTiles, signTexture, wallPanel, waterTexture,
} from './textures';

/**
 * A Stage is one playable (or walkable) place: meshes + physics + paintable ink.
 * Battle stages are authored for Alpha's half (z < 0) and rotated 180° for Bravo,
 * so both teams always get the exact same layout.
 */

export type Surface =
  | 'concrete' | 'deck' | 'asphalt' | 'plaza' | 'planks' | 'brick' | 'court' | 'roof'
  | 'tealPanel' | 'creamPanel' | 'violetPanel' | 'coralPanel' | 'mintPanel' | 'yellowPanel'
  | 'metal' | 'glass'
  | 'containerRed' | 'containerBlue' | 'containerYellow' | 'containerGreen';

export interface BoxOpts {
  inkable?: boolean;
  inkSides?: boolean;
  mirror?: boolean;
  uvMeters?: number;
  trim?: boolean;
  castShadow?: boolean;
}

interface BoxDef extends BoxOpts {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  size: THREE.Vector3;
  surface: Surface;
}

export interface StageInfo {
  spawns: [THREE.Vector3[], THREE.Vector3[]];
  spawnYaw: [number, number];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  killY: number;
}

export interface StageDef {
  id: string;
  name: string;
  blurb: string;
  /** half-size of the playable area */
  half: { x: number; z: number };
  killY?: number;
  /** Zone Control area (center + size); defaults to a 10 x 8 m box in the middle */
  zone?: { x: number; z: number; w: number; d: number };
  /** Tower Control route from the middle to Bravo's base, as [x, z] points (Alpha's route is mirrored) */
  towerPath?: [number, number][];
  /** false for non-symmetric places like the hub */
  mirrored?: boolean;
  build(b: StageBuilder): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ROT_Y_PI = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

const matCache = new Map<Surface, { mat: THREE.Material; meters: number }>();
function surfaceMaterial(s: Surface): { mat: THREE.Material; meters: number } {
  let m = matCache.get(s);
  if (m) return m;
  const std = (map: THREE.Texture, roughness = 0.5, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ map, roughness, ...extra });
  switch (s) {
    case 'concrete': m = { mat: std(concreteTiles(), 0.62), meters: 4 }; break;
    case 'deck': m = { mat: std(concreteTiles('#a9adbb', '#7c8194')), meters: 4 }; break;
    case 'asphalt': m = { mat: std(concreteTiles('#6c6f78', '#55575f'), 0.85), meters: 6 }; break;
    case 'roof': m = { mat: std(concreteTiles('#b8b2c4', '#8f88a0'), 0.7), meters: 3 }; break;
    case 'plaza': m = { mat: std(plazaTiles(), 0.72, { envMapIntensity: 0.55 }), meters: 4 }; break;
    case 'planks': m = { mat: std(planks(), 0.7), meters: 4 }; break;
    case 'brick': m = { mat: std(brick(), 0.75), meters: 4 }; break;
    case 'court': m = { mat: std(courtFloor(), 0.5), meters: 1 }; break;
    case 'tealPanel': m = { mat: std(wallPanel('#3db5a6', '#ffd23f'), 0.45), meters: 4 }; break;
    case 'creamPanel': m = { mat: std(wallPanel('#efe2c2', '#ff8a5c')), meters: 4 }; break;
    case 'violetPanel': m = { mat: std(wallPanel('#8e7be0', '#5ff0d0'), 0.45), meters: 4 }; break;
    case 'coralPanel': m = { mat: std(wallPanel('#ff8b6e', '#fff1c9'), 0.45), meters: 4 }; break;
    case 'mintPanel': m = { mat: std(wallPanel('#8fe3b8', '#3a6fd8'), 0.45), meters: 4 }; break;
    case 'yellowPanel': m = { mat: std(wallPanel('#ffd65c', '#e2475f'), 0.45), meters: 4 }; break;
    case 'metal': m = { mat: std(metalPlate(), 0.32, { metalness: 0.65 }), meters: 2 }; break;
    case 'glass':
      m = { mat: new THREE.MeshPhysicalMaterial({ color: '#bfe9ff', roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1 }), meters: 4 };
      break;
    case 'containerRed': m = { mat: std(corrugated('#d9483b'), 0.5, { metalness: 0.2 }), meters: 3 }; break;
    case 'containerBlue': m = { mat: std(corrugated('#2f6fd1'), 0.5, { metalness: 0.2 }), meters: 3 }; break;
    case 'containerYellow': m = { mat: std(corrugated('#f0b62e'), 0.5, { metalness: 0.2 }), meters: 3 }; break;
    case 'containerGreen': m = { mat: std(corrugated('#3fae6b'), 0.5, { metalness: 0.2 }), meters: 3 }; break;
  }
  matCache.set(s, m!);
  return m!;
}

const UNINKABLE: Surface[] = ['metal', 'glass'];

/** Authoring helpers used by stage definitions. */
export class StageBuilder {
  defs: BoxDef[] = [];
  decor = new THREE.Group();
  alphaSpawns: THREE.Vector3[] = [];
  alphaYaw = 0;
  waters: THREE.Texture[] = [];
  /** solid decor colliders: [center, quat, half, parent] */
  extraColliders: { pos: THREE.Vector3; quat: THREE.Quaternion; half: THREE.Vector3; mirror: boolean }[] = [];
  private rand: () => number;

  constructor(readonly mirroredDefault: boolean, seed = 7) {
    this.rand = mulberry(seed);
  }

  random() {
    return this.rand();
  }

  /** Axis-aligned box. `y` is the BOTTOM of the box. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, surface: Surface, opts: BoxOpts = {}) {
    this.defs.push({ pos: V(x, y + sy / 2, z), quat: new THREE.Quaternion(), size: V(sx, sy, sz), surface, ...opts });
  }

  /** Box rotated around Y (radians). `y` is the bottom. */
  boxRot(x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY: number, surface: Surface, opts: BoxOpts = {}) {
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    this.defs.push({ pos: V(x, y + sy / 2, z), quat, size: V(sx, sy, sz), surface, ...opts });
  }

  /** A slab whose top surface runs from point a to point b. */
  ramp(a: THREE.Vector3, b: THREE.Vector3, width: number, surface: Surface, thickness = 0.6, opts: BoxOpts = {}) {
    const zAxis = b.clone().sub(a);
    const len = zAxis.length();
    zAxis.normalize();
    const xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize();
    const yAxis = zAxis.clone().cross(xAxis).normalize();
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    const center = a.clone().add(b).multiplyScalar(0.5).addScaledVector(yAxis, -thickness / 2);
    this.defs.push({ pos: center, quat, size: V(width, thickness, len), surface, ...opts });
  }

  /** Tiled floor slab covering a rectangle with its top at y. */
  floor(minX: number, maxX: number, minZ: number, maxZ: number, surface: Surface, y = 0, tile = 11) {
    for (let x = minX; x < maxX - 0.01; x += tile)
      for (let z = minZ; z < maxZ - 0.01; z += tile) {
        const w = Math.min(tile, maxX - x), d = Math.min(tile, maxZ - z);
        this.box(x + w / 2, y - 1, z + d / 2, w, 1, d, surface, { mirror: false, inkSides: false });
      }
  }

  /** Four perimeter walls around a rectangle. */
  walls(hx: number, hz: number, height: number, side: Surface, end: Surface, y = -1) {
    this.box(-hx - 1, y, 0, 2, height, hz * 2 + 4, side, { mirror: false });
    this.box(hx + 1, y, 0, 2, height, hz * 2 + 4, side, { mirror: false });
    this.box(0, y, -hz - 1, hx * 2, height, 2, end, { mirror: false });
    this.box(0, y, hz + 1, hx * 2, height, 2, end, { mirror: false });
  }

  /** The standard spawn deck at the Alpha end, with a ramp into the stage. */
  spawnDeck(z: number, surface: Surface = 'deck', height = 2.5, width = 16) {
    this.box(0, 0, z, width, height, 8, surface);
    this.ramp(V(0, height, z + 4), V(0, 0, z + 4 + height * 2.6), 8, surface);
    this.box(-6, height, z + 3.4, 4, 0.9, 0.8, 'metal', { inkable: false });
    this.box(6, height, z + 3.4, 4, 0.9, 0.8, 'metal', { inkable: false });
    this.alphaSpawns = [-4.5, -1.5, 1.5, 4.5].map((x) => V(x, height + 0.1, z - 0.5));
    this.alphaYaw = 0;
  }

  /** Pure decoration (no collision). Mirrored copies are made automatically when asked. */
  add(obj: THREE.Object3D, mirror = false) {
    this.decor.add(obj);
    if (mirror) {
      const c = obj.clone();
      c.position.set(-obj.position.x, obj.position.y, -obj.position.z);
      c.rotation.y = obj.rotation.y + Math.PI;
      this.decor.add(c);
    }
    return obj;
  }

  /** Solid, un-inkable decoration collider (e.g. tree trunk, fountain). */
  solid(x: number, y: number, z: number, sx: number, sy: number, sz: number, mirror = true) {
    this.extraColliders.push({ pos: V(x, y + sy / 2, z), quat: new THREE.Quaternion(), half: V(sx / 2, sy / 2, sz / 2), mirror });
  }

  sign(text: string, x: number, y: number, z: number, w: number, rotY: number, bg = '#ffe14d', fg = '#ff3fa4', mirror = false) {
    const h = w / 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: signTexture(text, bg, fg), roughness: 0.4, transparent: true, emissive: '#ffffff', emissiveIntensity: 0.08, emissiveMap: signTexture(text, bg, fg) }));
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    return this.add(m, mirror);
  }

  graffiti(i: number, x: number, y: number, z: number, rotY: number, w: number) {
    const tags: [string, string, string, string][] = [
      ['SPLASHBURG', '#ffe14d', '#ff3fa4', '#36d6ff'],
      ['INKFINS!', '#7dff5c', '#7a3cff', '#ff8a3c'],
      ['SUPERINK', '#ff5ca8', '#ffe14d', '#3cffd2'],
      ['GRIND IT', '#5cd6ff', '#ff5c5c', '#ffd23c'],
      ['FRESH!', '#ff8a3c', '#2b4cff', '#e4ff2f'],
    ];
    const [t, f, o, a] = tags[i % tags.length];
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * 0.375),
      new THREE.MeshStandardMaterial({ map: graffiti(t, f, o, a), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false }),
    );
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    return this.add(m);
  }

  lamp(x: number, z: number, y = 0, h = 7) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, h, 10), new THREE.MeshStandardMaterial({ color: '#2c2f3a', roughness: 0.4, metalness: 0.5 }));
    pole.position.y = h / 2;
    pole.castShadow = true;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff1b0', emissiveIntensity: 1.5 }));
    bulb.position.y = h + 0.2;
    g.add(pole, bulb);
    g.position.set(x, y, z);
    return this.add(g);
  }

  tree(x: number, z: number, y = 0, scale = 1, mirror = true) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.25 * scale, 2.4 * scale, 10), new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 0.8 }));
    trunk.position.y = 1.2 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    const leaf = new THREE.MeshStandardMaterial({ color: '#4cc46a', roughness: 0.6 });
    for (const [dx, dy, dz, r] of [[0, 3.1, 0, 1.3], [0.8, 2.7, 0.3, 0.9], [-0.7, 2.8, -0.3, 0.95], [0.1, 3.8, 0.2, 0.85]]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r * scale, 16, 12), leaf);
      b.position.set(dx * scale, dy * scale, dz * scale);
      b.castShadow = true;
      g.add(b);
    }
    g.position.set(x, y, z);
    this.add(g, mirror);
    this.solid(x, y, z, 0.5 * scale, 2.4 * scale, 0.5 * scale, mirror);
  }

  palm(x: number, z: number, y = 0, mirror = true) {
    const g = new THREE.Group();
    const segs = 6;
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#b08350', roughness: 0.8 });
    for (let i = 0; i < segs; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.85, 10), trunkMat);
      s.position.set(Math.sin(i * 0.25) * 0.35, 0.42 + i * 0.8, 0);
      s.rotation.z = -0.08;
      s.castShadow = true;
      g.add(s);
    }
    const leafMat = new THREE.MeshStandardMaterial({ color: '#36b55c', roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3, 4, 1, true), leafMat);
      leaf.scale.set(1, 1, 0.2);
      leaf.position.set(0.6, segs * 0.8, 0);
      leaf.rotation.set(0, (i / 7) * Math.PI * 2, Math.PI / 2 + 0.35);
      leaf.translateY(1.2);
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(x, y, z);
    this.add(g, mirror);
    this.solid(x, y, z, 0.45, 4, 0.45, mirror);
  }

  awning(x: number, y: number, z: number, w: number, rotY: number, a: string, b: string, mirror = true) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 32;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect(i * 32, 0, 32, 32);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(w / 2, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.6), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.7 }));
    m.position.set(x, y, z);
    m.rotation.set(0, rotY, 0);
    m.rotateX(-0.9);
    m.castShadow = true;
    return this.add(m, mirror);
  }

  /** Big flat water plane with scrolling waves. */
  water(y: number, size = 600) {
    const t = waterTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(size / 8, size / 8);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.15, clearcoat: 0.8 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    this.waters.push(t);
    return this.add(m);
  }

  street(y = -0.02) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#5d6170', roughness: 0.9 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    return this.add(m);
  }

  /** Ring of pastel Splashburg buildings around a rectangle. */
  skyline(hx: number, hz: number, gap = 12, baseY = 0, minH = 14, maxH = 44, skipSides: ('x' | 'z')[] = []) {
    const palette: [string, string][] = [
      ['#f3a6c8', '#5a4b8a'], ['#9fe0f0', '#335c7a'], ['#ffe08a', '#7a5a2e'],
      ['#c6b5ff', '#3e3a73'], ['#ffb38a', '#7a3e2e'], ['#a8f0c0', '#2e6a50'],
    ];
    const place = (x: number, z: number, w: number, d: number) => {
      const h = minH + this.rand() * (maxH - minH);
      const [base, win] = palette[Math.floor(this.rand() * palette.length)];
      const t = facade(base, win).clone();
      t.needsUpdate = true;
      t.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 6)));
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
      b.position.set(x, baseY + h / 2, z);
      b.receiveShadow = true;
      this.decor.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 2, d * 0.4), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
      roof.position.set(x, baseY + h + 1, z);
      this.decor.add(roof);
    };
    if (!skipSides.includes('x'))
      for (let z = -hz - 20; z <= hz + 20; z += 14) {
        place(-hx - gap - this.rand() * 8, z, 10 + this.rand() * 6, 10 + this.rand() * 4);
        place(hx + gap + this.rand() * 8, z, 10 + this.rand() * 6, 10 + this.rand() * 4);
      }
    if (!skipSides.includes('z'))
      for (let x = -hx - 6; x <= hx + 6; x += 14) {
        place(x, -hz - gap - 8 - this.rand() * 8, 11 + this.rand() * 4, 10);
        place(x, hz + gap + 8 + this.rand() * 8, 11 + this.rand() * 4, 10);
      }
  }
}

export class Stage {
  group = new THREE.Group();
  ink = new InkSystem();
  info: StageInfo;
  private waters: THREE.Texture[];

  /** Tower Control: the tower's route, so props standing on it can be left out */
  private lane: THREE.Vector2[][] | null = null;

  private constructor(readonly def: StageDef, readonly physics: Physics, opts: { towerLane?: boolean } = {}) {
    const b = new StageBuilder(def.mirrored !== false);
    def.build(b);
    if (opts.towerLane) {
      const pts = (def.towerPath ?? [[0, 0], [0, def.half.z - 12]]).map(([x, z]) => new THREE.Vector2(x, z));
      this.lane = [pts, pts.map((p) => p.clone().negate())];
    }
    for (const d of b.defs) this.buildBox(d, def.mirrored !== false);
    for (const c of b.extraColliders) {
      for (const pos of c.mirror && def.mirrored !== false ? [c.pos, V(-c.pos.x, c.pos.y, -c.pos.z)] : [c.pos]) {
        if (this.blocksLane(pos, c.half, c.quat)) continue;
        this.physics.addBox(pos, c.quat, c.half, b.decor, false);
      }
    }
    if (this.lane) {
      // props (trees, benches...) standing in the lane go too
      for (const o of [...b.decor.children]) {
        if (o.position.y < 2.5 && this.laneDist(o.position.x, o.position.z) < 2.2) b.decor.remove(o);
      }
    }
    b.decor.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.castShadow === false) o.receiveShadow = true;
    });
    this.group.add(b.decor);
    this.waters = b.waters;
    this.ink.finalize();
    this.physics.step();

    const alpha = b.alphaSpawns.length ? b.alphaSpawns : [V(0, 0.2, 0)];
    const bravo = alpha.map((p) => V(-p.x, p.y, -p.z));
    this.info = {
      spawns: [alpha, bravo],
      spawnYaw: [b.alphaYaw, b.alphaYaw + Math.PI],
      bounds: { minX: -def.half.x + 0.5, maxX: def.half.x - 0.5, minZ: -def.half.z + 0.5, maxZ: def.half.z - 0.5 },
      killY: def.killY ?? -6,
    };
  }

  static async create(def: StageDef, opts: { towerLane?: boolean } = {}) {
    const physics = await Physics.create();
    return new Stage(def, physics, opts);
  }

  /** Distance from a point to the tower route (Infinity when there's no lane). */
  private laneDist(x: number, z: number) {
    if (!this.lane) return Infinity;
    const p = new THREE.Vector2(x, z);
    let best = Infinity;
    for (const r of this.lane) {
      for (let i = 1; i < r.length; i++) {
        const a = r[i - 1], ab = r[i].clone().sub(a);
        const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
        best = Math.min(best, a.clone().addScaledVector(ab, t).distanceTo(p));
      }
    }
    return best;
  }

  /** Would this box stand in the tower's way? (floors and things overhead are fine) */
  private blocksLane(pos: THREE.Vector3, half: THREE.Vector3, quat: THREE.Quaternion) {
    if (!this.lane) return false;
    const top = pos.y + half.y, bottom = pos.y - half.y;
    // keep floors, thin platforms (bridges, ramps, walkways) and anything high overhead;
    // remove solid blocks, including ones stacked on top of blocks we removed
    if (top <= 0.45 || half.y * 2 < 0.8) return false;
    if (bottom >= 2.6 && !(bottom < 6 && half.y * 2 >= 1.5)) return false;
    // footprint radius of the (possibly rotated) box
    const e = new THREE.Vector3(half.x, 0, half.z).applyQuaternion(quat);
    const e2 = new THREE.Vector3(half.x, 0, -half.z).applyQuaternion(quat);
    const hx = Math.max(Math.abs(e.x), Math.abs(e2.x)), hz = Math.max(Math.abs(e.z), Math.abs(e2.z));
    // sample the footprint against the lane
    for (let i = 0; i <= 4; i++) {
      for (let j = 0; j <= 4; j++) {
        if (this.laneDist(pos.x - hx + (hx * 2 * i) / 4, pos.z - hz + (hz * 2 * j) / 4) < 1.9) return true;
      }
    }
    return false;
  }

  private buildBox(d: BoxDef, mirrored: boolean) {
    const all: BoxDef[] = [d];
    if (mirrored && d.mirror !== false) {
      all.push({ ...d, pos: V(-d.pos.x, d.pos.y, -d.pos.z), quat: ROT_Y_PI.clone().multiply(d.quat) });
    }
    for (const b of all) {
      if (this.blocksLane(b.pos, b.size.clone().multiplyScalar(0.5), b.quat)) continue;
      const geo = new THREE.BoxGeometry(b.size.x, b.size.y, b.size.z);
      const { mat, meters } = surfaceMaterial(b.surface);
      if (b.surface === 'court') {
        // one court texture stretched over the top face
        const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) if (k < 8 || k >= 12) uv.setXY(k, 0.02, 0.02);
      } else {
        boxUVsWorld(geo, b.size.x, b.size.y, b.size.z, b.uvMeters ?? meters);
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(b.pos);
      mesh.quaternion.copy(b.quat);
      mesh.castShadow = b.castShadow !== false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      const inkable = b.inkable ?? !UNINKABLE.includes(b.surface);
      this.physics.addBox(b.pos, b.quat, b.size.clone().multiplyScalar(0.5), mesh, inkable);
      if (inkable) this.ink.addBox(mesh, b.size.x, b.size.y, b.size.z, { sides: b.inkSides !== false });
      if ((b.trim ?? (b.size.y >= 1.4 && b.size.y < 5)) && inkable) this.trim(mesh, b.size);
    }
  }

  private trim(mesh: THREE.Mesh, size: THREE.Vector3) {
    const t = hazard().clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round((size.x + size.z) / 1.5)), 1);
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
    const h = 0.18;
    const m = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.04, h, size.z + 0.04), [mat, mat, new THREE.MeshBasicMaterial({ visible: false }), mat, mat, mat]);
    m.position.y = size.y / 2 - h / 2 - 0.001;
    mesh.add(m);
  }

  update(dt: number) {
    for (const w of this.waters) {
      w.offset.x += dt * 0.02;
      w.offset.y += dt * 0.012;
    }
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const f of this.ink.faces) {
      f.tex.dispose();
      f.htex.dispose();
      (f.mesh.material as THREE.Material).dispose();
    }
    this.physics.dispose();
  }
}

export function mulberry(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { V };
