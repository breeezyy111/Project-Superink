import * as THREE from 'three';
import { InkSystem } from '../ink/InkSystem';
import { Physics } from './Physics';
import {
  boxUVsWorld, concreteTiles, facade, graffiti, hazard, metalPlate, wallPanel,
} from './textures';

/**
 * "Grindrail Skatepark" — the first Splashburg stage.
 * The layout is defined for Alpha's half (z < 0) and rotated 180° for Bravo,
 * so both sides are identical.
 */

type Surface = 'concrete' | 'tealPanel' | 'creamPanel' | 'violetPanel' | 'coralPanel' | 'metal' | 'deck';

interface BoxDef {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  size: THREE.Vector3;
  surface: Surface;
  inkable?: boolean;
  inkSides?: boolean;
  mirror?: boolean; // default true for half-map defs
}

export interface MapInfo {
  spawns: [THREE.Vector3[], THREE.Vector3[]];
  spawnYaw: [number, number];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  killY: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Q0 = () => new THREE.Quaternion();
const ROT_Y_PI = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

function surfaceMaterial(s: Surface): { mat: THREE.Material; meters: number } {
  switch (s) {
    case 'concrete':
      return { mat: new THREE.MeshStandardMaterial({ map: concreteTiles(), roughness: 0.62 }), meters: 4 };
    case 'tealPanel':
      return { mat: new THREE.MeshStandardMaterial({ map: wallPanel('#3db5a6', '#ffd23f'), roughness: 0.45 }), meters: 4 };
    case 'creamPanel':
      return { mat: new THREE.MeshStandardMaterial({ map: wallPanel('#efe2c2', '#ff8a5c'), roughness: 0.5 }), meters: 4 };
    case 'violetPanel':
      return { mat: new THREE.MeshStandardMaterial({ map: wallPanel('#8e7be0', '#5ff0d0'), roughness: 0.45 }), meters: 4 };
    case 'coralPanel':
      return { mat: new THREE.MeshStandardMaterial({ map: wallPanel('#ff8b6e', '#fff1c9'), roughness: 0.45 }), meters: 4 };
    case 'deck':
      return { mat: new THREE.MeshStandardMaterial({ map: concreteTiles('#a9adbb', '#7c8194'), roughness: 0.5 }), meters: 4 };
    case 'metal':
      return { mat: new THREE.MeshStandardMaterial({ map: metalPlate(), roughness: 0.32, metalness: 0.65 }), meters: 2 };
  }
}

export class SkateparkMap {
  group = new THREE.Group();
  info: MapInfo;
  private defs: BoxDef[] = [];

  constructor(private physics: Physics, private ink: InkSystem) {
    this.layout();
    for (const d of this.defs) this.build(d);
    this.decor();
    ink.finalize();

    const alpha = [-4.5, -1.5, 1.5, 4.5].map((x) => V(x, 2.6, -40.5));
    const bravo = alpha.map((p) => V(-p.x, p.y, -p.z));
    this.info = {
      spawns: [alpha, bravo],
      spawnYaw: [0, Math.PI],
      bounds: { minX: -21.5, maxX: 21.5, minZ: -43.5, maxZ: 43.5 },
      killY: -6,
    };
  }

  // ---------- helpers ----------
  private box(x: number, y: number, z: number, sx: number, sy: number, sz: number, surface: Surface, extra: Partial<BoxDef> = {}) {
    // y is the BOTTOM of the box for convenience
    this.defs.push({ pos: V(x, y + sy / 2, z), quat: Q0(), size: V(sx, sy, sz), surface, ...extra });
  }

  /** A slab whose top surface runs from point a to point b. */
  private ramp(a: THREE.Vector3, b: THREE.Vector3, width: number, surface: Surface, thickness = 0.6, extra: Partial<BoxDef> = {}) {
    const zAxis = b.clone().sub(a);
    const len = zAxis.length();
    zAxis.normalize();
    const xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize();
    const yAxis = zAxis.clone().cross(xAxis).normalize();
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    const quat = new THREE.Quaternion().setFromRotationMatrix(m);
    const center = a.clone().add(b).multiplyScalar(0.5).addScaledVector(yAxis, -thickness / 2);
    this.defs.push({ pos: center, quat, size: V(width, thickness, len), surface, ...extra });
  }

  // ---------- layout ----------
  private layout() {
    // Floor: 11m tiles over the whole park (whole-map, not mirrored)
    for (let x = -22; x < 22; x += 11)
      for (let z = -44; z < 44; z += 11)
        this.box(x + 5.5, -1, z + 5.5, 11, 1, 11, 'concrete', { mirror: false, inkSides: false });

    // Perimeter walls
    this.box(-23, -1, 0, 2, 5.5, 90, 'tealPanel', { mirror: false });
    this.box(23, -1, 0, 2, 5.5, 90, 'tealPanel', { mirror: false });
    this.box(0, -1, -45, 44, 5.5, 2, 'creamPanel', { mirror: false });
    this.box(0, -1, 45, 44, 5.5, 2, 'creamPanel', { mirror: false });

    // --- Alpha half (mirrored to Bravo) ---
    // Spawn deck + ramp down into the park
    this.box(0, 0, -40, 16, 2.5, 8, 'deck');
    this.ramp(V(0, 2.5, -36), V(0, 0, -29.5), 8, 'deck');
    // deck side walls (cover beside the ramp)
    this.box(-6, 2.5, -36.6, 4, 0.9, 0.8, 'metal', { inkable: false });
    this.box(6, 2.5, -36.6, 4, 0.9, 0.8, 'metal', { inkable: false });
    // side ledges you can drop from
    this.ramp(V(-8, 2.5, -40), V(-13, 0, -40), 6, 'coralPanel');
    this.ramp(V(8, 2.5, -40), V(13, 0, -40), 6, 'coralPanel');

    // Starter cover crates
    this.box(-10, 0, -30, 2.4, 1.4, 2.4, 'creamPanel');
    this.box(10.5, 0, -27, 2.4, 1.4, 2.4, 'creamPanel');
    this.box(3.5, 0, -24, 4, 1.0, 1.0, 'violetPanel');

    // Side tower (left) + ramp
    this.box(-15.5, 0, -18, 7, 3, 7, 'violetPanel');
    this.ramp(V(-15.5, 3, -14.5), V(-15.5, 0, -7), 3.2, 'violetPanel');
    this.box(-18.8, 3, -21.2, 0.6, 1.0, 0.6, 'metal', { inkable: false });

    // Quarter pipe on the right wall
    this.ramp(V(22, 2.6, -18), V(15.5, 0, -18), 9, 'tealPanel', 0.8);
    this.box(19.5, 0, -24, 5, 2.6, 3, 'tealPanel');

    // Low walls / mid cover
    this.box(-6.5, 0, -12, 5, 1.2, 0.7, 'coralPanel');
    this.box(7, 0, -9, 0.7, 1.2, 5, 'coralPanel');
    this.box(13, 0, -36, 3, 1.8, 3, 'tealPanel');
    this.box(-13, 0, -33, 3, 1.8, 1.4, 'tealPanel');

    // Center funbox (half each side): box + ramp
    this.box(0, 0, -1.5, 9, 1.6, 3, 'creamPanel');
    this.ramp(V(0, 1.6, -3), V(0, 0, -8), 5, 'creamPanel');
    // pyramid-style side wedges
    this.ramp(V(-4.5, 1.6, -1.5), V(-8.5, 0, -1.5), 3, 'coralPanel');

    // Grind rails (decor + low obstacle, metal)
    this.defs.push({ pos: V(-9, 0.25, 4), quat: Q0(), size: V(0.25, 0.5, 8), surface: 'metal', inkable: false });
    this.defs.push({ pos: V(11, 0.25, -4), quat: Q0(), size: V(0.25, 0.5, 6), surface: 'metal', inkable: false });

    // Metal grate platform on the flank (un-inkable on purpose)
    this.box(16, 0, -2, 6, 1.2, 4, 'metal', { inkable: false });
  }

  private build(d: BoxDef) {
    const all: BoxDef[] = [d];
    if (d.mirror !== false) {
      all.push({
        ...d,
        pos: V(-d.pos.x, d.pos.y, -d.pos.z),
        quat: ROT_Y_PI.clone().multiply(d.quat),
      });
    }
    for (const b of all) {
      const geo = new THREE.BoxGeometry(b.size.x, b.size.y, b.size.z);
      const { mat, meters } = surfaceMaterial(b.surface);
      boxUVsWorld(geo, b.size.x, b.size.y, b.size.z, meters);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(b.pos);
      mesh.quaternion.copy(b.quat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      const inkable = b.inkable !== false;
      this.physics.addBox(b.pos, b.quat, b.size.clone().multiplyScalar(0.5), mesh, inkable);
      if (inkable) this.ink.addBox(mesh, b.size.x, b.size.y, b.size.z, { sides: b.inkSides !== false });
      // hazard trim on the top edge of tall-ish blocks
      if (b.size.y >= 1.4 && b.surface !== 'metal' && b.size.y < 5) {
        this.trim(mesh, b.size);
      }
    }
  }

  private trim(mesh: THREE.Mesh, size: THREE.Vector3) {
    const t = hazard().clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round((size.x + size.z) / 1.5)), 1);
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
    const h = 0.18;
    const g = new THREE.BoxGeometry(size.x + 0.04, h, size.z + 0.04);
    const m = new THREE.Mesh(g, [mat, mat, new THREE.MeshBasicMaterial({ visible: false }), mat, mat, mat]);
    m.position.y = size.y / 2 - h / 2 - 0.001;
    mesh.add(m);
  }

  private decor() {
    // Street ground outside the park
    const street = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: '#5d6170', roughness: 0.9 }),
    );
    street.rotation.x = -Math.PI / 2;
    street.position.y = -0.02;
    street.receiveShadow = true;
    this.group.add(street);

    // Splashburg skyline
    const palette: [string, string][] = [
      ['#f3a6c8', '#5a4b8a'], ['#9fe0f0', '#335c7a'], ['#ffe08a', '#7a5a2e'],
      ['#c6b5ff', '#3e3a73'], ['#ffb38a', '#7a3e2e'], ['#a8f0c0', '#2e6a50'],
    ];
    const rand = mulberry(7);
    const place = (x: number, z: number, w: number, d: number) => {
      const h = 14 + rand() * 30;
      const [base, win] = palette[Math.floor(rand() * palette.length)];
      const t = facade(base, win).clone();
      t.needsUpdate = true;
      t.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 6)));
      const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(x, h / 2, z);
      b.castShadow = false;
      b.receiveShadow = true;
      this.group.add(b);
      // rooftop accent
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 2, d * 0.4), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
      roof.position.set(x, h + 1, z);
      this.group.add(roof);
    };
    for (let z = -70; z <= 70; z += 14) {
      place(-36 - rand() * 8, z, 10 + rand() * 6, 10 + rand() * 4);
      place(36 + rand() * 8, z, 10 + rand() * 6, 10 + rand() * 4);
    }
    for (let x = -28; x <= 28; x += 14) {
      place(x, -64 - rand() * 8, 11 + rand() * 4, 10);
      place(x, 64 + rand() * 8, 11 + rand() * 4, 10);
    }

    // Graffiti on inner perimeter walls
    const tags: [string, string, string, string][] = [
      ['SPLASHBURG', '#ffe14d', '#ff3fa4', '#36d6ff'],
      ['INKFINS!', '#7dff5c', '#7a3cff', '#ff8a3c'],
      ['SUPERINK', '#ff5ca8', '#ffe14d', '#3cffd2'],
      ['GRIND IT', '#5cd6ff', '#ff5c5c', '#ffd23c'],
    ];
    const decal = (i: number, x: number, z: number, ry: number, w: number) => {
      const [t, f, o, a] = tags[i % tags.length];
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, w * 0.375),
        new THREE.MeshStandardMaterial({ map: graffiti(t, f, o, a), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false }),
      );
      m.position.set(x, 2.3, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      this.group.add(m);
    };
    decal(0, -21.99, -28, Math.PI / 2, 8);
    decal(1, 21.99, 28, -Math.PI / 2, 8);
    decal(2, -21.99, 20, Math.PI / 2, 8);
    decal(3, 21.99, -6, -Math.PI / 2, 7);
    decal(2, 0, -43.99, 0, 9);
    decal(0, 0, 43.99, Math.PI, 9);

    // Lamp posts with glowing heads (pure decor)
    const poleMat = new THREE.MeshStandardMaterial({ color: '#2c2f3a', roughness: 0.4, metalness: 0.5 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff1b0', emissiveIntensity: 1.5 });
    for (const [x, z] of [[-23, -10], [23, 10], [-23, 30], [23, -30]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 10), poleMat);
      pole.position.set(x, 4.5, z);
      pole.castShadow = true;
      this.group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), bulbMat);
      bulb.position.set(x, 8.2, z);
      this.group.add(bulb);
    }
  }
}

function mulberry(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
