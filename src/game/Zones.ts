import * as THREE from 'three';
import type { Team } from '../config';
import type { InkRegion, InkSystem } from '../ink/InkSystem';
import type { Physics } from '../world/Physics';
import type { StageDef } from '../world/Stage';

/** Seconds of holding the zone a team needs to win by knockout. */
export const ZONE_COUNT = 60;
/** Share of the zone a team must cover to take it. */
export const CAPTURE_SHARE = 0.6;
/** Below this share, the holding team loses the zone (it goes neutral). */
const KEEP_SHARE = 0.42;
const MAX_PENALTY = 15;

export type ZoneEvent = { kind: 'captured' | 'lost'; team: Team } | { kind: 'contested'; team: Team };

export interface ZoneRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Zone Control: a box in the middle of the stage. Cover most of it with your ink
 * to take control. While your team holds it, your count ticks down. First to 0 wins,
 * or the lower count when time runs out.
 */
export class ZoneControl {
  readonly rect: ZoneRect;
  readonly center: THREE.Vector3;
  private region: InkRegion;
  count: [number, number] = [ZONE_COUNT, ZONE_COUNT];
  penalty: [number, number] = [0, 0];
  owner: Team | -1 = -1;
  share: [number, number] = [0, 0];
  /** points the current owner has counted during this hold */
  private holdCounted = 0;
  private lastHold: [number, number] = [0, 0];
  private warned = false;
  private group = new THREE.Group();
  private curtainMat: THREE.MeshBasicMaterial;
  private stripMat: THREE.MeshBasicMaterial;
  private checkT = 0;
  private color = new THREE.Color('#ffffff');

  constructor(
    private scene: THREE.Scene,
    def: StageDef,
    private ink: InkSystem,
    physics: Physics,
    private colorOf: (t: Team) => string,
  ) {
    const z = def.zone ?? { x: 0, z: 0, w: 10, d: 8 };
    this.rect = { minX: z.x - z.w / 2, maxX: z.x + z.w / 2, minZ: z.z - z.d / 2, maxZ: z.z + z.d / 2 };
    this.center = new THREE.Vector3(z.x, 0, z.z);
    // the zone sits on the floor level that covers most of the box (not on top of a fountain or crate)
    const all = ink.region(this.rect.minX, this.rect.maxX, this.rect.minZ, this.rect.maxZ, -50, 50);
    const area = new Map<number, number>();
    for (const { face, idx } of all) {
      const y = Math.round(face.wOrigin.y * 2) / 2;
      area.set(y, (area.get(y) ?? 0) + idx.length);
    }
    let y0 = 0, best = -1;
    for (const [y, n] of area) if (n > best) { best = n; y0 = y; }
    this.center.y = y0;
    this.region = ink.region(this.rect.minX, this.rect.maxX, this.rect.minZ, this.rect.maxZ, y0 - 0.6, y0 + 2.2);

    this.curtainMat = new THREE.MeshBasicMaterial({
      map: curtainTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.stripMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.buildOutline(physics, y0);
    scene.add(this.group);
  }

  /** Floor-hugging outline + a soft glowing curtain around the zone edge. */
  private buildOutline(physics: Physics, y0: number) {
    const { minX, maxX, minZ, maxZ } = this.rect;
    const corners = [new THREE.Vector2(minX, minZ), new THREE.Vector2(maxX, minZ), new THREE.Vector2(maxX, maxZ), new THREE.Vector2(minX, maxZ)];
    const pts: THREE.Vector3[] = [];
    const down = new THREE.Vector3(0, -1, 0);
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const n = Math.ceil(a.distanceTo(b) / 0.35);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const x = THREE.MathUtils.lerp(a.x, b.x, t), zz = THREE.MathUtils.lerp(a.y, b.y, t);
        const hit = physics.raycast(new THREE.Vector3(x, y0 + 1.2, zz), down, 3);
        pts.push(new THREE.Vector3(x, hit ? hit.point.y : y0, zz));
      }
    }
    pts.push(pts[0].clone());
    // curtain: vertical ribbon following the floor
    const H = 0.75;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    // flat strip on the floor
    const sp: number[] = [], sidx: number[] = [];
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      pos.push(p.x, p.y + 0.03, p.z, p.x, p.y + H, p.z);
      uv.push(i * 0.1, 0, i * 0.1, 1);
      // inward offset for the floor strip
      const dx = Math.sign(cx - p.x) * (Math.abs(p.x - minX) < 0.01 || Math.abs(p.x - maxX) < 0.01 ? 1 : 0);
      const dz = Math.sign(cz - p.z) * (Math.abs(p.z - minZ) < 0.01 || Math.abs(p.z - maxZ) < 0.01 ? 1 : 0);
      sp.push(p.x, p.y + 0.04, p.z, p.x + dx * 0.22, p.y + 0.04, p.z + dz * 0.22);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        sidx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const curtain = new THREE.Mesh(g, this.curtainMat);
    curtain.renderOrder = 3;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setIndex(sidx);
    const strip = new THREE.Mesh(sg, this.stripMat);
    strip.renderOrder = 2;
    this.group.add(curtain, strip);
  }

  inside(p: THREE.Vector3) {
    const r = this.rect;
    return p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ && Math.abs(p.y - this.center.y) < 3;
  }

  /** Advance the zone. Returns what happened this step. */
  update(dt: number, playing: boolean): ZoneEvent[] {
    const ev: ZoneEvent[] = [];
    this.curtainMat.map!.offset.x -= dt * 0.25;
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.2;
      this.share = this.ink.regionShare(this.region);
    }
    if (!playing) return ev;
    const [a, b] = this.share;
    const prev = this.owner;
    if (this.owner === -1) {
      if (a >= CAPTURE_SHARE) this.take(0, ev);
      else if (b >= CAPTURE_SHARE) this.take(1, ev);
    } else {
      const mine = this.share[this.owner];
      const theirs = this.share[1 - this.owner];
      const other = (1 - this.owner) as Team;
      if (theirs >= CAPTURE_SHARE) this.take(other, ev);
      else if (mine < KEEP_SHARE && theirs > mine) {
        ev.push({ kind: 'lost', team: this.owner });
        this.lastHold[this.owner] = this.holdCounted;
        this.owner = -1;
        this.warned = false;
      } else if (!this.warned && mine < 0.5 && theirs > 0.25) {
        this.warned = true;
        ev.push({ kind: 'contested', team: this.owner });
      } else if (mine > 0.55) this.warned = false;
    }
    if (this.owner !== -1) {
      const t = this.owner;
      if (this.penalty[t] > 0) this.penalty[t] = Math.max(0, this.penalty[t] - dt);
      else {
        this.count[t] = Math.max(0, this.count[t] - dt);
        this.holdCounted += dt;
      }
    }
    if (prev !== this.owner) this.recolor();
    return ev;
  }

  private take(t: Team, ev: ZoneEvent[]) {
    const other = (1 - t) as Team;
    if (this.owner === other) this.lastHold[other] = this.holdCounted;
    // taking it back costs time: half of what the other team counted on their last hold
    const pen = Math.min(MAX_PENALTY, Math.round(this.lastHold[other] * 0.5));
    if (pen > 0) this.penalty[t] = pen;
    this.lastHold[other] = 0;
    this.owner = t;
    this.holdCounted = 0;
    this.warned = false;
    ev.push({ kind: 'captured', team: t });
  }

  private recolor() {
    this.color.set(this.owner === -1 ? '#ffffff' : this.colorOf(this.owner));
    this.stripMat.color.copy(this.color);
    this.curtainMat.color.copy(this.color);
  }

  /** Display count: count + any penalty still to burn off. */
  shown(t: Team) {
    return Math.ceil(this.count[t] + this.penalty[t]);
  }

  /** The team with the lower count (null when tied). */
  leader(): Team | null {
    const a = this.count[0] + this.penalty[0], b = this.count[1] + this.penalty[1];
    if (Math.abs(a - b) < 0.01) return null;
    return a < b ? 0 : 1;
  }

  reset() {
    this.count = [ZONE_COUNT, ZONE_COUNT];
    this.penalty = [0, 0];
    this.owner = -1;
    this.recolor();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.curtainMat.map?.dispose();
    this.curtainMat.dispose();
    this.stripMat.dispose();
  }
}

/** Vertical gradient with soft stripes, scrolled sideways for a "force field" look. */
function curtainTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 64; y++) {
    const a = Math.pow(1 - y / 63, 2.2) * 0.45;
    for (let x = 0; x < 64; x++) {
      const s = 0.65 + 0.35 * Math.sin((x / 64) * Math.PI * 2);
      g.fillStyle = `rgba(255,255,255,${(a * s).toFixed(3)})`;
      g.fillRect(x, 63 - y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
