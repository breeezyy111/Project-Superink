import * as THREE from 'three';
import { INK_TEXELS_PER_METER, OWNER_CELLS_PER_METER, Team } from '../config';

/**
 * Ink is stored per flat face. Each face owns:
 *  - a color canvas (what you see, glossy blobs),
 *  - a height canvas (drives the bump map so ink looks thick and wet),
 *  - a low-res ownership grid (gameplay: who owns this spot, turf counting).
 */
export class InkFace {
  readonly W: number;
  readonly H: number;
  readonly cols: number;
  readonly rows: number;
  readonly owner: Uint8Array; // 0 none, 1 alpha, 2 bravo
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly hCanvas: HTMLCanvasElement;
  readonly hctx: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  readonly htex: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh;
  dirty = false;

  // World-space frame (map is static so we compute once).
  readonly wOrigin = new THREE.Vector3();
  readonly wU = new THREE.Vector3();
  readonly wV = new THREE.Vector3();
  readonly wN = new THREE.Vector3();
  isFloor = false;

  constructor(
    readonly parent: THREE.Object3D,
    readonly lOrigin: THREE.Vector3,
    readonly lU: THREE.Vector3,
    readonly lV: THREE.Vector3,
    readonly w: number,
    readonly h: number,
    material: (f: InkFace) => THREE.Material,
  ) {
    this.W = Math.max(8, Math.min(1024, Math.ceil(w * INK_TEXELS_PER_METER)));
    this.H = Math.max(8, Math.min(1024, Math.ceil(h * INK_TEXELS_PER_METER)));
    this.cols = Math.max(1, Math.round(w * OWNER_CELLS_PER_METER));
    this.rows = Math.max(1, Math.round(h * OWNER_CELLS_PER_METER));
    this.owner = new Uint8Array(this.cols * this.rows);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d')!;
    this.hCanvas = document.createElement('canvas');
    this.hCanvas.width = this.W;
    this.hCanvas.height = this.H;
    this.hctx = this.hCanvas.getContext('2d')!;
    this.hctx.fillStyle = '#000';
    this.hctx.fillRect(0, 0, this.W, this.H);

    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.htex = new THREE.CanvasTexture(this.hCanvas);

    const n = new THREE.Vector3().crossVectors(lU, lV).normalize();
    const off = n.clone().multiplyScalar(0.012);
    const o = lOrigin.clone().add(off);
    const pU = lU.clone().multiplyScalar(w);
    const pV = lV.clone().multiplyScalar(h);
    const p = [o, o.clone().add(pU), o.clone().add(pV), o.clone().add(pU).add(pV)];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p.flatMap((v) => [v.x, v.y, v.z]), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([...n.toArray(), ...n.toArray(), ...n.toArray(), ...n.toArray()], 3));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    this.mesh = new THREE.Mesh(geo, material(this));
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false; // only shown once something is painted
    parent.add(this.mesh);
  }

  computeWorldFrame() {
    this.parent.updateWorldMatrix(true, false);
    const m = this.parent.matrixWorld;
    const rot = new THREE.Matrix3().setFromMatrix4(m);
    this.wOrigin.copy(this.lOrigin).applyMatrix4(m);
    this.wU.copy(this.lU).applyMatrix3(rot).normalize();
    this.wV.copy(this.lV).applyMatrix3(rot).normalize();
    this.wN.crossVectors(this.wU, this.wV).normalize();
    this.isFloor = this.wN.y > 0.7;
  }

  ownerAtUV(u: number, v: number): number {
    const c = Math.floor((u / this.w) * this.cols);
    const r = Math.floor((v / this.h) * this.rows);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return 0;
    return this.owner[r * this.cols + c];
  }
}

export interface SplatCircle {
  x: number; // world position
  y: number;
  z: number;
  r: number;
}

const tmp = new THREE.Vector3();
/** How far (in radii) a blob's soft field reaches; it shows up to radius 1. */
const FIELD_REACH = 1.45;

export class InkSystem {
  faces: InkFace[] = [];
  private byParent = new Map<THREE.Object3D, InkFace[]>();
  colors: [string, string] = ['#ff7a1a', '#2b4cff'];
  floorCells = 0;
  counts: [number, number] = [0, 0];

  setColors(a: string, b: string) {
    this.colors = [a, b];
  }

  /** Material shared shape for the glossy ink overlay. */
  makeMaterial = (f: InkFace) =>
    new THREE.MeshPhysicalMaterial({
      map: f.tex,
      alphaMap: f.htex,
      bumpMap: f.htex,
      bumpScale: 2.2,
      roughness: 0.22,
      metalness: 0.0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
      transparent: false,
      alphaTest: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      envMapIntensity: 0.55,
    });

  addFace(parent: THREE.Object3D, origin: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, w: number, h: number) {
    const f = new InkFace(parent, origin, u, v, w, h, this.makeMaterial);
    this.faces.push(f);
    let arr = this.byParent.get(parent);
    if (!arr) this.byParent.set(parent, (arr = []));
    arr.push(f);
    return f;
  }

  /** Adds ink faces for all sides of an axis-aligned (in local space) box mesh. */
  addBox(mesh: THREE.Object3D, sx: number, sy: number, sz: number, opts: { bottom?: boolean; sides?: boolean } = {}) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // top: u=+x, v=-z  -> normal +y
    this.addFace(mesh, V(-hx, hy, hz), V(1, 0, 0), V(0, 0, -1), sx, sz);
    if (opts.sides !== false) {
      // +z face: u=+x, v=+y
      this.addFace(mesh, V(-hx, -hy, hz), V(1, 0, 0), V(0, 1, 0), sx, sy);
      // -z face: u=-x, v=+y
      this.addFace(mesh, V(hx, -hy, -hz), V(-1, 0, 0), V(0, 1, 0), sx, sy);
      // +x face: u=-z, v=+y
      this.addFace(mesh, V(hx, -hy, hz), V(0, 0, -1), V(0, 1, 0), sz, sy);
      // -x face: u=+z, v=+y
      this.addFace(mesh, V(-hx, -hy, -hz), V(0, 0, 1), V(0, 1, 0), sz, sy);
    }
    if (opts.bottom) this.addFace(mesh, V(-hx, -hy, -hz), V(1, 0, 0), V(0, 0, 1), sx, sz);
  }

  finalize() {
    this.floorCells = 0;
    for (const f of this.faces) {
      f.computeWorldFrame();
      if (f.isFloor) this.floorCells += f.cols * f.rows;
    }
  }

  reset() {
    this.counts = [0, 0];
    for (const f of this.faces) {
      f.owner.fill(0);
      f.ctx.clearRect(0, 0, f.W, f.H);
      f.hctx.fillStyle = '#000';
      f.hctx.fillRect(0, 0, f.W, f.H);
      f.mesh.visible = false;
      f.dirty = true;
    }
  }

  /**
   * Build a blobby splat pattern around a point: one core circle plus satellites,
   * laid out in the plane perpendicular to `normal`.
   */
  static pattern(p: THREE.Vector3, normal: THREE.Vector3, radius: number, blobs = 6): SplatCircle[] {
    const out: SplatCircle[] = [{ x: p.x, y: p.y, z: p.z, r: radius }];
    const t1 = new THREE.Vector3();
    const t2 = new THREE.Vector3();
    if (Math.abs(normal.y) < 0.9) t1.set(0, 1, 0).cross(normal).normalize();
    else t1.set(1, 0, 0).cross(normal).normalize();
    t2.crossVectors(normal, t1);
    for (let i = 0; i < blobs; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * (0.55 + Math.random() * 0.55);
      const r = radius * (0.22 + Math.random() * 0.3);
      out.push({
        x: p.x + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * d,
        y: p.y + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * d,
        z: p.z + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * d,
        r,
      });
    }
    // a couple of far droplets
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * (1.2 + Math.random() * 0.5);
      out.push({
        x: p.x + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * d,
        y: p.y + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * d,
        z: p.z + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * d,
        r: radius * (0.08 + Math.random() * 0.1),
      });
    }
    return out;
  }

  /** Paint a set of world-space circles for a team onto every face they touch. */
  paint(circles: SplatCircle[], team: Team) {
    // bounding sphere of the whole splat for quick rejection
    let maxR = 0;
    const c0 = circles[0];
    for (const c of circles) {
      const d = Math.hypot(c.x - c0.x, c.y - c0.y, c.z - c0.z) + c.r;
      if (d > maxR) maxR = d;
    }
    const color = this.colors[team];
    const tval = team + 1;
    for (const f of this.faces) {
      tmp.set(c0.x, c0.y, c0.z).sub(f.wOrigin);
      const d0 = tmp.dot(f.wN);
      if (d0 > maxR || d0 < -maxR) continue;
      const u0 = tmp.dot(f.wU);
      const v0 = tmp.dot(f.wV);
      if (u0 < -maxR || v0 < -maxR || u0 > f.w + maxR || v0 > f.h + maxR) continue;
      let touched = false;
      for (const c of circles) {
        tmp.set(c.x, c.y, c.z).sub(f.wOrigin);
        const d = tmp.dot(f.wN);
        // only paint faces the splat is in front of (or barely behind: corners)
        if (d < -0.18 || d > c.r) continue;
        const rr = c.r * c.r - d * d * 0.6;
        if (rr <= 0) continue;
        const r = Math.sqrt(rr);
        const u = tmp.dot(f.wU);
        const v = tmp.dot(f.wV);
        if (u < -r || v < -r || u > f.w + r || v > f.h + r) continue;
        this.paintFace(f, u, v, r, color, tval);
        touched = true;
      }
      if (touched) {
        f.dirty = true;
        f.mesh.visible = true;
      }
    }
  }

  private paintFace(f: InkFace, u: number, v: number, r: number, color: string, tval: number) {
    const px = (u / f.w) * f.W;
    const py = (1 - v / f.h) * f.H;
    const pr = r * INK_TEXELS_PER_METER;
    const outer = pr * FIELD_REACH;
    // color: a hard disc slightly larger than the visible blob, so merged
    // metaball bridges always have color underneath them
    const ctx = f.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, outer, 0, Math.PI * 2);
    ctx.fill();
    // field: soft falloff, added together. alphaTest (0.5) cuts it into gooey
    // merged blobs, and the same field drives the bump map for thick rounded edges.
    const h = f.hctx;
    const g = h.createRadialGradient(px, py, 0, px, py, outer);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.95)');
    g.addColorStop(1 / FIELD_REACH, 'rgba(128,128,128,1)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    h.globalCompositeOperation = 'lighter';
    h.fillStyle = g;
    h.globalAlpha = 1;
    h.beginPath();
    h.arc(px, py, outer, 0, Math.PI * 2);
    h.fill();
    h.globalCompositeOperation = 'source-over';

    // ownership grid (slightly smaller than visual radius so edges are honest)
    const cr = r * 0.92;
    const cMin = Math.max(0, Math.floor(((u - cr) / f.w) * f.cols));
    const cMax = Math.min(f.cols - 1, Math.floor(((u + cr) / f.w) * f.cols));
    const rMin = Math.max(0, Math.floor(((v - cr) / f.h) * f.rows));
    const rMax = Math.min(f.rows - 1, Math.floor(((v + cr) / f.h) * f.rows));
    const cw = f.w / f.cols, ch = f.h / f.rows;
    for (let rI = rMin; rI <= rMax; rI++) {
      const cy = (rI + 0.5) * ch - v;
      for (let cI = cMin; cI <= cMax; cI++) {
        const cx = (cI + 0.5) * cw - u;
        if (cx * cx + cy * cy > cr * cr) continue;
        const idx = rI * f.cols + cI;
        const prev = f.owner[idx];
        if (prev === tval) continue;
        f.owner[idx] = tval;
        if (f.isFloor) {
          if (prev) this.counts[prev - 1]--;
          this.counts[tval - 1]++;
        }
      }
    }
  }

  /** Ownership at a world point on one of the faces belonging to `parent`. */
  ownerAt(parent: THREE.Object3D | undefined, p: THREE.Vector3, normal?: THREE.Vector3): number {
    const list = parent ? this.byParent.get(parent) : this.faces;
    if (!list) return 0;
    let best: InkFace | null = null;
    let bestD = 0.35;
    let bu = 0, bv = 0;
    for (const f of list) {
      if (normal && f.wN.dot(normal) < 0.5) continue;
      tmp.copy(p).sub(f.wOrigin);
      const d = Math.abs(tmp.dot(f.wN));
      if (d >= bestD) continue;
      const u = tmp.dot(f.wU), v = tmp.dot(f.wV);
      if (u < 0 || v < 0 || u > f.w || v > f.h) continue;
      best = f; bestD = d; bu = u; bv = v;
    }
    return best ? best.ownerAtUV(bu, bv) : 0;
  }

  /** Upload dirty canvases to the GPU, at most `budget` faces per frame. */
  flush(budget = 24) {
    let n = 0;
    for (const f of this.faces) {
      if (!f.dirty) continue;
      f.tex.needsUpdate = true;
      f.htex.needsUpdate = true;
      f.dirty = false;
      if (++n >= budget) break;
    }
  }

  turf(): [number, number] {
    const t = Math.max(1, this.floorCells);
    return [this.counts[0] / t, this.counts[1] / t];
  }
}
