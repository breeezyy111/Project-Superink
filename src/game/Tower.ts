import * as THREE from 'three';
import type { Team } from '../config';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../world/Physics';
import type { StageDef } from '../world/Stage';
import type { Character } from './Character';

/** How fast the tower rolls when ridden, and drifts back home when nobody's on it (m/s). */
const RIDE_SPEED = 1.15;
const RETURN_SPEED = 0.45;
/** Checkpoints (fraction of the route) where the tower stops for a moment. */
const CHECKPOINTS = [0.33, 0.66];
const CHECKPOINT_WAIT = 4;
export const TOWER_RADIUS = 1.55;
const DECK_H = 0.38;

export type TowerEvent =
  | { kind: 'ride'; team: Team }
  | { kind: 'checkpoint'; team: Team; n: number }
  | { kind: 'lost'; team: Team };

/**
 * Tower Control: a round platform starts in the middle of the stage. Stand on it and it
 * rolls toward the other team's base (it stops while both teams are on it). Reach their
 * base to win by knockout; otherwise the team that pushed it furthest wins.
 */
export class TowerControl {
  /** 0..100 left for each team (100 - best progress), like Splatoon's tower count */
  count: [number, number] = [100, 100];
  /** time the tower waits at a checkpoint, per team (shown like a penalty) */
  penalty: [number, number] = [0, 0];
  /** team riding the tower (-1 = nobody / contested) */
  owner: Team | -1 = -1;
  /** current progress of each team, 0..1 */
  share: [number, number] = [0, 0];
  /** route position: > 0 toward Bravo's base (Alpha pushing), < 0 toward Alpha's */
  s = 0;
  best: [number, number] = [0, 0];
  readonly pos = new THREE.Vector3();
  readonly center = new THREE.Vector3();
  contested = false;
  private routes: [THREE.Vector3[], THREE.Vector3[]];
  private lengths: [number, number];
  private cleared: [number[], number[]] = [[], []];
  private waitT = 0;
  private collider: RAPIER.Collider;
  private group = new THREE.Group();
  private deckMat: THREE.MeshPhysicalMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private icon: THREE.Group;
  private iconMat: THREE.MeshPhysicalMaterial;
  private ringMat: THREE.MeshBasicMaterial;
  private t = 0;
  private lastPos = new THREE.Vector3();

  constructor(private scene: THREE.Scene, def: StageDef, private physics: Physics, private colorOf: (t: Team) => string) {
    const pts = def.towerPath ?? [[0, 0], [0, def.half.z - 12]];
    const toBravo = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const toAlpha = pts.map(([x, z]) => new THREE.Vector3(-x, 0, -z));
    // Alpha (team 0) rides toward Bravo's base; Bravo toward Alpha's
    this.routes = [toBravo, toAlpha];
    const len = (r: THREE.Vector3[]) => r.reduce((a, p, i) => (i ? a + p.distanceTo(r[i - 1]) : 0), 0);
    this.lengths = [len(toBravo), len(toAlpha)];

    this.collider = physics.addCylinder(new THREE.Vector3(0, -50, 0), new THREE.Quaternion(), DECK_H / 2, TOWER_RADIUS, this.group);
    // look: a chunky round deck with stripes, a glowing ring and a floating team icon
    this.deckMat = new THREE.MeshPhysicalMaterial({ color: '#f4f2ea', roughness: 0.35, clearcoat: 0.6 });
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(TOWER_RADIUS, TOWER_RADIUS * 1.04, DECK_H, 40), this.deckMat);
    deck.position.y = DECK_H / 2;
    deck.castShadow = deck.receiveShadow = true;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(TOWER_RADIUS, 0.07, 10, 48),
      new THREE.MeshStandardMaterial({ color: '#2a2438', roughness: 0.5 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = DECK_H;
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(TOWER_RADIUS * 0.55, TOWER_RADIUS * 0.75, 40), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = DECK_H + 0.01;
    this.glowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 12, 1, true), this.glowMat);
    beam.position.y = DECK_H + 1.6;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.0, 8), new THREE.MeshStandardMaterial({ color: '#2a2438' }));
    pole.position.y = DECK_H + 1.5;
    this.iconMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.15, clearcoat: 1 });
    this.icon = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), this.iconMat);
    gem.scale.y = 1.35;
    gem.castShadow = true;
    this.icon.add(gem);
    this.icon.position.y = DECK_H + 3.4;
    // wheels peeking out underneath
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#2a2438', roughness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 14), wheelMat);
      w.rotation.z = Math.PI / 2;
      w.rotation.y = a;
      w.position.set(Math.cos(a) * TOWER_RADIUS * 0.8, 0.08, Math.sin(a) * TOWER_RADIUS * 0.8);
      this.group.add(w);
    }
    this.group.add(deck, rim, ring, beam, pole, this.icon);
    scene.add(this.group);
    this.place(true);
    this.center.copy(this.pos);
    // route markers on the floor: checkpoints and goals
    for (const team of [0, 1] as Team[]) {
      for (const f of [...CHECKPOINTS, 1]) {
        const p = this.pointAt(team, f);
        const g = new THREE.Mesh(
          new THREE.RingGeometry(f === 1 ? 1.4 : 0.9, f === 1 ? 1.7 : 1.1, 32),
          new THREE.MeshBasicMaterial({ color: f === 1 ? '#ffe14a' : '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }),
        );
        g.rotation.x = -Math.PI / 2;
        g.position.copy(p).setY(this.floorY(p) + 0.03);
        g.renderOrder = 2;
        this.group.parent!.add(g);
        this.markers.push(g);
      }
    }
  }

  private markers: THREE.Mesh[] = [];

  /** Point along a team's route at fraction f (0..1). */
  private pointAt(team: Team, f: number) {
    const r = this.routes[team];
    let d = f * this.lengths[team];
    for (let i = 1; i < r.length; i++) {
      const seg = r[i].distanceTo(r[i - 1]);
      if (d <= seg || i === r.length - 1) return r[i - 1].clone().lerp(r[i], Math.min(1, d / Math.max(1e-6, seg)));
      d -= seg;
    }
    return r[0].clone();
  }

  /** Floor under a point, looking down from a little above `from` (so it climbs ramps, not onto walkways). */
  private floorY(p: THREE.Vector3, from = 0) {
    const hit = this.physics.raycast(new THREE.Vector3(p.x, from + 1.6, p.z), new THREE.Vector3(0, -1, 0), 30, this.collider);
    return hit ? hit.point.y : from;
  }

  /** Move the deck to the current route position (rides up over low obstacles). */
  private place(snap = false) {
    const team: Team = this.s >= 0 ? 0 : 1;
    const p = this.pointAt(team, Math.abs(this.s));
    // sample a few points under the deck so it rides on the highest floor
    let y = -Infinity;
    const from = snap ? 0 : this.pos.y;
    for (const [dx, dz] of [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) y = Math.max(y, this.floorY(p.clone().add(new THREE.Vector3(dx, 0, dz)), from));
    if (!isFinite(y)) y = from;
    p.y = snap ? y : THREE.MathUtils.lerp(this.pos.y, y, 0.2);
    this.lastPos.copy(snap ? p : this.pos);
    this.pos.copy(p);
    this.group.position.copy(p);
    this.collider.setTranslation({ x: p.x, y: p.y + DECK_H / 2, z: p.z });
  }

  /** Is this character standing on the deck? */
  onDeck(c: Character) {
    if (!c.alive) return false;
    const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z;
    return dx * dx + dz * dz < (TOWER_RADIUS + 0.1) ** 2 && Math.abs(c.pos.y - (this.pos.y + DECK_H)) < 0.45;
  }

  /** Top of the deck (for bots heading to it). */
  top(out = new THREE.Vector3()) {
    return out.copy(this.pos).setY(this.pos.y + DECK_H);
  }

  /** Advance the tower. Carries riders along. */
  update(dt: number, playing: boolean, characters: Character[]): TowerEvent[] {
    const ev: TowerEvent[] = [];
    this.t += dt;
    this.icon.rotation.y += dt * 1.5;
    this.icon.position.y = DECK_H + 3.4 + Math.sin(this.t * 2) * 0.12;
    if (!playing) return ev;
    const riders: [Character[], Character[]] = [[], []];
    for (const c of characters) if (this.onDeck(c)) riders[c.team].push(c);
    const a = riders[0].length > 0, b = riders[1].length > 0;
    this.contested = a && b;
    const owner: Team | -1 = a && !b ? 0 : b && !a ? 1 : -1;
    if (owner !== this.owner) {
      if (owner !== -1) ev.push({ kind: 'ride', team: owner });
      else if (this.owner !== -1 && !this.contested) ev.push({ kind: 'lost', team: this.owner });
      this.owner = owner;
      this.recolor();
    }
    const before = this.s;
    if (this.waitT > 0) {
      this.waitT -= dt;
      const t = this.s >= 0 ? 0 : 1;
      this.penalty[t] = Math.max(0, this.waitT);
    } else if (owner !== -1) {
      const dir = owner === 0 ? 1 : -1;
      const len = this.lengths[this.s * dir >= 0 ? owner : ((1 - owner) as Team)];
      this.s += (dir * RIDE_SPEED * dt) / len;
    } else if (!this.contested && this.s !== 0) {
      // nobody on it: drift back toward the middle
      const len = this.lengths[this.s > 0 ? 0 : 1];
      const step = (RETURN_SPEED * dt) / len;
      this.s = Math.abs(this.s) <= step ? 0 : this.s - Math.sign(this.s) * step;
    }
    this.s = THREE.MathUtils.clamp(this.s, -1, 1);
    // checkpoints: the tower stops for a moment the first time each one is reached
    for (const team of [0, 1] as Team[]) {
      const prog = team === 0 ? this.s : -this.s;
      const prev = team === 0 ? before : -before;
      CHECKPOINTS.forEach((cp, n) => {
        if (prev < cp && prog >= cp && !this.cleared[team].includes(n)) {
          this.cleared[team].push(n);
          this.waitT = CHECKPOINT_WAIT;
          ev.push({ kind: 'checkpoint', team, n: n + 1 });
        }
      });
    }
    if (this.waitT <= 0) this.penalty = [0, 0];
    this.share = [Math.max(0, this.s), Math.max(0, -this.s)];
    this.best = [Math.max(this.best[0], this.share[0]), Math.max(this.best[1], this.share[1])];
    this.count = [Math.round((1 - this.best[0]) * 100), Math.round((1 - this.best[1]) * 100)];
    this.place();
    // carry everyone standing on it
    const d = this.pos.clone().sub(this.lastPos);
    if (d.lengthSq() > 0) for (const c of characters) if (this.onDeck(c) || riders[c.team].includes(c)) c.carry(d);
    return ev;
  }

  /** The team that pushed furthest (null when tied). */
  leader(): Team | null {
    if (Math.abs(this.best[0] - this.best[1]) < 1e-4) return null;
    return this.best[0] > this.best[1] ? 0 : 1;
  }

  shown(t: Team) {
    return this.count[t];
  }

  /** Online client: follow the host's tower. */
  applyNet(s: number, best: [number, number], owner: Team | -1, wait: [number, number]): TowerEvent[] {
    const ev: TowerEvent[] = [];
    if (owner !== this.owner) {
      if (owner !== -1) ev.push({ kind: 'ride', team: owner });
      this.owner = owner;
      this.recolor();
    }
    this.s = s;
    this.best = best;
    this.penalty = wait;
    this.share = [Math.max(0, s), Math.max(0, -s)];
    this.count = [Math.round((1 - best[0]) * 100), Math.round((1 - best[1]) * 100)];
    this.place();
    return ev;
  }

  /** Online client: carry riders by the tower's latest move. */
  carryRiders(characters: Character[]) {
    const d = this.pos.clone().sub(this.lastPos);
    if (d.lengthSq() > 0) for (const c of characters) if (c.isPlayer && this.onDeck(c)) c.carry(d);
    this.lastPos.copy(this.pos);
  }

  private recolor() {
    const c = new THREE.Color(this.owner === -1 ? '#ffffff' : this.colorOf(this.owner));
    this.iconMat.color.copy(c);
    this.ringMat.color.copy(c);
    this.glowMat.color.copy(c);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of this.markers) m.parent?.remove(m);
    this.physics.world.removeCollider(this.collider, false);
  }
}
