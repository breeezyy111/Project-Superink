import * as THREE from 'three';
import type { Team } from '../config';
import type { Character } from './Character';
import { Kit, SpecialKind, SubKind, SUBS } from './items';
import type { GameCtx } from './types';

// Subs, specials and everything they leave lying around in the world.

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

export const SPECIAL_DURATION: Record<SpecialKind, number> = { squall: 0.6, tsunami: 1.0, shield: 7, jet: 7 };

interface Bomb {
  kind: SubKind | 'squall';
  owner: Character;
  team: Team;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  landed: boolean;
  fuse: number;
  slideDir: THREE.Vector3;
  paintAcc: number;
  mesh: THREE.Object3D;
}

interface Mine {
  owner: Character;
  team: Team;
  pos: THREE.Vector3;
  arm: number;
  trigger: number;
  age: number;
  mesh: THREE.Mesh;
}

interface Cloud {
  owner: Character;
  team: Team;
  pos: THREE.Vector3;
  t: number;
  dropT: number;
  mesh: THREE.Group;
}

interface Wave {
  owner: Character;
  team: Team;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  dist: number;
  painted: number;
  hit: Set<Character>;
  mesh: THREE.Mesh;
}

interface Shield {
  owner: Character;
  team: Team;
  pos: THREE.Vector3;
  r: number;
  t: number;
  mesh: THREE.Mesh;
}

function teamGlossy(color: string, extra: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, ...extra });
}

export class Gadgets {
  bombs: Bomb[] = [];
  mines: Mine[] = [];
  clouds: Cloud[] = [];
  waves: Wave[] = [];
  shields: Shield[] = [];

  constructor(private scene: THREE.Scene) {}

  // ---------------- subs ----------------
  throwSub(ch: Character, kind: SubKind, ctx: GameCtx) {
    const color = ctx.colorOf(ch.team);
    if (kind === 'mine') {
      for (let i = this.mines.length - 1; i >= 0; i--) if (this.mines[i].owner === ch) this.removeMine(i);
      const hit = ctx.physics.raycast(ch.pos.clone().setY(ch.pos.y + 0.5), DOWN, 2);
      const p = hit ? hit.point : ch.pos.clone();
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 20), teamGlossy(color, { transparent: true, opacity: 0.55 }));
      mesh.position.copy(p).setY(p.y + 0.04);
      this.scene.add(mesh);
      this.mines.push({ owner: ch, team: ch.team, pos: p.clone(), arm: 0.6, trigger: -1, age: 0, mesh });
      ctx.sfx.ui();
      return;
    }
    this.lob(ch, kind, ctx);
  }

  private lob(ch: Character, kind: Bomb['kind'], ctx: GameCtx) {
    const color = ctx.colorOf(ch.team);
    const muzzle = ch.muzzle(new THREE.Vector3());
    const dir = ch.aimDirFrom(muzzle, new THREE.Vector3());
    const speed = kind === 'slide' ? 13 : 14;
    const vel = dir.clone().multiplyScalar(speed).add(new THREE.Vector3(0, kind === 'slide' ? 1.5 : 4.5, 0));
    let mesh: THREE.Object3D;
    if (kind === 'squall') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), teamGlossy('#ffffff', { emissive: color, emissiveIntensity: 0.4 }));
    } else {
      const g = new THREE.Group();
      const r = kind === 'burst' ? 0.16 : 0.22;
      const body = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), teamGlossy(color));
      if (kind === 'slide') body.scale.set(1.2, 0.6, 1.2);
      const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, r * 0.15, 6, 16), new THREE.MeshStandardMaterial({ color: '#2b2b33', roughness: 0.4 }));
      band.rotation.x = Math.PI / 2;
      if (kind === 'slide') band.scale.set(1.2, 1.2, 0.6);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 0.4, 10), new THREE.MeshStandardMaterial({ color: '#ffd23f' }));
      cap.position.y = r * (kind === 'slide' ? 0.6 : 1);
      g.add(body, band, cap);
      mesh = g;
    }
    mesh.position.copy(muzzle);
    mesh.traverse((o) => (o.castShadow = true));
    this.scene.add(mesh);
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    this.bombs.push({ kind, owner: ch, team: ch.team, pos: muzzle.clone(), vel, age: 0, landed: false, fuse: 99, slideDir: flat, paintAcc: 0, mesh });
    ctx.sfx.jump();
  }

  // ---------------- specials ----------------
  activateSpecial(ch: Character, kind: SpecialKind, ctx: GameCtx) {
    const color = ctx.colorOf(ch.team);
    ctx.effects.burst(ch.pos.clone().setY(ch.pos.y + 1), null, color, 30, 6, 0.1);
    ctx.sfx.special(ctx.listener.distanceTo(ch.pos), ch.isPlayer);
    ch.model.pop();
    switch (kind) {
      case 'squall':
        this.lob(ch, 'squall', ctx);
        break;
      case 'tsunami': {
        const dir = new THREE.Vector3(Math.sin(ch.input.aimYaw), 0, Math.cos(ch.input.aimYaw));
        const geo = new THREE.CapsuleGeometry(0.9, 6.2, 8, 20);
        geo.rotateZ(Math.PI / 2);
        const mesh = new THREE.Mesh(geo, teamGlossy(color));
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.waves.push({ owner: ch, team: ch.team, origin: ch.pos.clone(), dir, dist: 0.5, painted: 0, hit: new Set(), mesh });
        break;
      }
      case 'shield': {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 40, 24),
          new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.28, roughness: 0.05, clearcoat: 1, emissive: color, emissiveIntensity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
        );
        const pos = ch.pos.clone().setY(ch.pos.y + 0.6);
        mesh.position.copy(pos);
        mesh.scale.setScalar(0.1);
        this.scene.add(mesh);
        this.shields.push({ owner: ch, team: ch.team, pos, r: 3.2, t: SPECIAL_DURATION.shield, mesh });
        break;
      }
      case 'jet':
        ch.startJet();
        break;
    }
  }

  // ---------------- queries ----------------
  /** Would a shot from `team` moving from pos by seg enter an enemy shield? */
  blocks(pos: THREE.Vector3, seg: THREE.Vector3, team: Team) {
    for (const s of this.shields) {
      if (s.team === team) continue;
      const before = pos.distanceTo(s.pos);
      const after = pos.clone().add(seg).distanceTo(s.pos);
      if (before > s.r && after <= s.r) return true;
    }
    return false;
  }

  /** Distance along a ray until it enters an enemy shield (Infinity if none). */
  shieldRay(from: THREE.Vector3, dir: THREE.Vector3, maxT: number, team: Team) {
    let best = Infinity;
    for (const s of this.shields) {
      if (s.team === team) continue;
      const m = from.clone().sub(s.pos);
      if (m.length() <= s.r) continue;
      const b = m.dot(dir);
      const c = m.lengthSq() - s.r * s.r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < maxT && t < best) best = t;
    }
    return best;
  }

  /** Is `target` sheltered from a blast at `at` by their own team's shield? */
  protects(target: Character, at: THREE.Vector3) {
    const c = target.chestPoint(new THREE.Vector3());
    for (const s of this.shields) {
      if (s.team !== target.team) continue;
      if (c.distanceTo(s.pos) < s.r && at.distanceTo(s.pos) > s.r) return true;
    }
    return false;
  }

  // ---------------- simulation ----------------
  update(dt: number, ctx: GameCtx) {
    this.updateBombs(dt, ctx);
    this.updateMines(dt, ctx);
    this.updateClouds(dt, ctx);
    this.updateWaves(dt, ctx);
    for (let i = this.shields.length - 1; i >= 0; i--) {
      const s = this.shields[i];
      s.t -= dt;
      const grow = Math.min(1, (SPECIAL_DURATION.shield - s.t) * 6);
      const shrink = Math.min(1, s.t * 4);
      s.mesh.scale.setScalar(s.r * grow * Math.max(0.01, shrink) * (1 + Math.sin(s.t * 12) * 0.01));
      if (s.t <= 0) {
        this.scene.remove(s.mesh);
        this.shields.splice(i, 1);
      }
    }
  }

  private explodeBomb(i: number, ctx: GameCtx) {
    const b = this.bombs[i];
    const at = b.pos;
    switch (b.kind) {
      case 'burst': ctx.explode(at, 1.9, 60, 25, b.team, b.owner); break;
      case 'pop': ctx.explode(at, 3.0, 180, 50, b.team, b.owner); break;
      case 'slide': ctx.explode(at, 2.6, 180, 45, b.team, b.owner); break;
      case 'squall': {
        // spawn the storm cloud above the landing point (lower if there's a ceiling)
        const ceil = ctx.physics.raycast(at.clone().setY(at.y + 0.3), UP, 5);
        const h = ceil ? Math.max(1.6, ceil.dist - 0.4) : 4.6;
        this.spawnCloud(b.owner, at.clone().setY(at.y + h), ctx);
        break;
      }
    }
    this.scene.remove(b.mesh);
    this.bombs.splice(i, 1);
  }

  private spawnCloud(owner: Character, pos: THREE.Vector3, ctx: GameCtx) {
    const color = ctx.colorOf(owner.team);
    const g = new THREE.Group();
    const mat = teamGlossy('#ffffff', { emissive: color, emissiveIntensity: 0.18, roughness: 0.5, clearcoat: 0.2 });
    const dark = teamGlossy(color, { roughness: 0.4 });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const r = k === 0 ? 0 : 1.6 + Math.random() * 0.8;
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.9 + Math.random() * 0.6, 16, 12), k % 3 === 0 ? dark : mat);
      s.position.set(Math.cos(a) * r, Math.random() * 0.5, Math.sin(a) * r);
      s.scale.y = 0.7;
      g.add(s);
    }
    g.position.copy(pos);
    g.scale.setScalar(0.1);
    this.scene.add(g);
    this.clouds.push({ owner, team: owner.team, pos, t: 6.5, dropT: 0, mesh: g });
  }

  private updateBombs(dt: number, ctx: GameCtx) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.age += dt;
      if (b.age > 6) {
        this.explodeBomb(i, ctx);
        continue;
      }
      if (b.kind === 'slide' && b.landed) {
        // skid along the ground, hugging it, painting a lane
        const spd = b.vel.length();
        const step = b.slideDir.clone().multiplyScalar(spd * dt);
        const wall = ctx.physics.raycast(b.pos.clone().setY(b.pos.y + 0.15), b.slideDir, spd * dt + 0.25);
        if (wall && Math.abs(wall.normal.y) < 0.5) {
          b.slideDir.reflect(wall.normal.setY(0).normalize()).setY(0).normalize();
        } else b.pos.add(step);
        const ground = ctx.physics.raycast(b.pos.clone().setY(b.pos.y + 0.6), DOWN, 1.6);
        if (ground) b.pos.y = ground.point.y + 0.12;
        else b.landed = false;
        b.vel.multiplyScalar(1 - dt * 0.7);
        b.paintAcc += spd * dt;
        if (ground && ground.inkable && b.paintAcc > 0.3) {
          b.paintAcc = 0;
          ctx.paintBy(b.owner, [{ x: ground.point.x, y: ground.point.y, z: ground.point.z, r: 0.6 }]);
        }
      } else if (!(b.kind === 'pop' && b.landed)) {
        b.vel.y -= 22 * dt;
        const seg = b.vel.clone().multiplyScalar(dt);
        const len = seg.length();
        const dir = seg.clone().divideScalar(len || 1);
        const hit = ctx.physics.raycast(b.pos, dir, len + 0.15);
        if (hit) {
          b.pos.copy(hit.point).addScaledVector(hit.normal, 0.15);
          if (b.kind === 'burst' || b.kind === 'squall') {
            this.explodeBomb(i, ctx);
            continue;
          }
          if (b.kind === 'pop') {
            b.vel.reflect(hit.normal).multiplyScalar(0.35);
            if (hit.normal.y > 0.6 && b.vel.length() < 3.5) {
              b.landed = true;
              b.vel.set(0, 0, 0);
              b.fuse = 0.85;
            }
          } else if (b.kind === 'slide') {
            if (hit.normal.y > 0.6) {
              b.landed = true;
              b.vel.set(b.slideDir.x, 0, b.slideDir.z).multiplyScalar(10);
              b.fuse = 1.5;
            } else {
              b.vel.reflect(hit.normal).multiplyScalar(0.5);
            }
          }
        } else b.pos.add(seg);
      }
      // bursts pop on contact, slide bombs go off when they skid into someone
      if (b.kind === 'burst' || (b.kind === 'slide' && b.landed)) {
        const c = new THREE.Vector3();
        const reach = b.kind === 'slide' ? 1.3 : 0.8;
        if (ctx.characters.some((o) => o.alive && o.team !== b.team && o.chestPoint(c).distanceTo(b.pos) < reach)) {
          this.explodeBomb(i, ctx);
          continue;
        }
      }
      if (b.landed) {
        b.fuse -= dt;
        // blink faster as the fuse runs out
        const blink = Math.sin(b.age * (12 + (1.5 - b.fuse) * 25)) > 0;
        b.mesh.scale.setScalar(blink ? 1.15 : 1);
        if (b.fuse <= 0) {
          this.explodeBomb(i, ctx);
          continue;
        }
      }
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.y += dt * 6;
    }
  }

  private updateMines(dt: number, ctx: GameCtx) {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.age += dt;
      m.arm -= dt;
      if (m.trigger < 0 && m.arm <= 0) {
        if (ctx.characters.some((o) => o.alive && o.team !== m.team && o.pos.distanceTo(m.pos) < 2.2)) {
          m.trigger = 0.4;
          ctx.sfx.beep(false);
        }
      }
      if (m.trigger >= 0) {
        m.trigger -= dt;
        m.mesh.scale.setScalar(1 + (0.4 - m.trigger) * 2);
        if (m.trigger <= 0) {
          ctx.explode(m.pos.clone().setY(m.pos.y + 0.3), 2.6, 150, 45, m.team, m.owner);
          this.removeMine(i);
          continue;
        }
      }
      if (!m.owner.alive || m.age > 60) this.removeMine(i);
    }
  }

  private removeMine(i: number) {
    this.scene.remove(this.mines[i].mesh);
    this.mines.splice(i, 1);
  }

  private updateClouds(dt: number, ctx: GameCtx) {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t -= dt;
      const grow = Math.min(1, (6.5 - c.t) * 3);
      c.mesh.scale.setScalar(grow * Math.min(1, c.t * 2) + 0.01);
      c.mesh.rotation.y += dt * 0.6;
      c.dropT -= dt;
      while (c.dropT <= 0 && grow >= 1) {
        c.dropT += 0.035;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 3.3;
        ctx.projectiles.spawn({
          pos: new THREE.Vector3(c.pos.x + Math.cos(a) * r, c.pos.y - 0.4, c.pos.z + Math.sin(a) * r),
          vel: new THREE.Vector3(0, -13, 0), team: c.team, owner: c.owner, damage: 7, paintR: 0.62, size: 0.11, gravDelay: 0, falloff: 1,
        });
      }
      if (c.t <= 0) {
        this.scene.remove(c.mesh);
        this.clouds.splice(i, 1);
      }
    }
  }

  private updateWaves(dt: number, ctx: GameCtx) {
    const WIDTH = 7, RANGE = 26, SPEED = 15;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.dist += SPEED * dt;
      const center = w.origin.clone().addScaledVector(w.dir, w.dist);
      const g = ctx.physics.raycast(center.clone().setY(w.origin.y + 4), DOWN, 9);
      const y = g ? g.point.y : w.origin.y;
      w.mesh.position.set(center.x, y + 0.7 + Math.sin(w.dist) * 0.1, center.z);
      w.mesh.rotation.y = Math.atan2(w.dir.x, w.dir.z);
      const k = Math.min(1, (RANGE - w.dist) / 4);
      w.mesh.scale.set(1, Math.max(0.05, k), Math.max(0.05, k));
      const side = new THREE.Vector3(w.dir.z, 0, -w.dir.x);
      // paint a row across the wave every 0.6m
      while (w.painted < w.dist) {
        w.painted += 0.6;
        const row = w.origin.clone().addScaledVector(w.dir, w.painted);
        const circles = [];
        for (let s = -3; s <= 3; s++) {
          const p = row.clone().addScaledVector(side, s * (WIDTH / 7)).setY(w.origin.y + 4);
          const hit = ctx.physics.raycast(p, DOWN, 9);
          if (hit && hit.inkable) circles.push({ x: hit.point.x, y: hit.point.y, z: hit.point.z, r: 0.75 });
        }
        if (circles.length) ctx.paintBy(w.owner, circles);
      }
      if (Math.random() < 0.6) ctx.effects.burst(w.mesh.position.clone().addScaledVector(side, (Math.random() - 0.5) * WIDTH), UP, ctx.colorOf(w.team), 2, 5, 0.12);
      for (const o of ctx.characters) {
        if (!o.alive || o.team === w.team || w.hit.has(o)) continue;
        const d = o.pos.clone().sub(center);
        if (Math.abs(d.dot(w.dir)) < 1.4 && Math.abs(d.dot(side)) < WIDTH / 2 && Math.abs(o.pos.y - y) < 2.5) {
          w.hit.add(o);
          ctx.damage(o, 140, w.owner);
        }
      }
      if (w.dist >= RANGE) {
        this.scene.remove(w.mesh);
        this.waves.splice(i, 1);
      }
    }
  }

  clear() {
    for (const b of this.bombs) this.scene.remove(b.mesh);
    for (const m of this.mines) this.scene.remove(m.mesh);
    for (const c of this.clouds) this.scene.remove(c.mesh);
    for (const w of this.waves) this.scene.remove(w.mesh);
    for (const s of this.shields) this.scene.remove(s.mesh);
    this.bombs = [];
    this.mines = [];
    this.clouds = [];
    this.waves = [];
    this.shields = [];
  }
}

/** Per-character sub/special handling. */
export class KitState {
  private subCd = 0;
  private prevSub = false;
  private prevSpecial = false;
  private jetCd = 0;

  constructor(readonly kit: Kit) {}

  get subCost() {
    return SUBS[this.kit.sub].cost;
  }

  update(dt: number, ch: Character, ctx: GameCtx) {
    this.subCd -= dt;
    this.jetCd -= dt;
    const sub = ch.input.sub && ch.alive;
    const special = ch.input.special && ch.alive;
    const subPressed = sub && !this.prevSub;
    const specialPressed = special && !this.prevSpecial;
    this.prevSub = sub;
    this.prevSpecial = special;
    if (!ctx.allowKit) return;

    if (subPressed && !ch.swimming && ch.jetT <= 0 && this.subCd <= 0) {
      if (ch.ink >= this.subCost) {
        ch.ink -= this.subCost;
        this.subCd = 0.5;
        ctx.gadgets.throwSub(ch, this.kit.sub, ctx);
      } else if (ch.isPlayer) ctx.sfx.denied();
    }
    if (specialPressed && ch.special >= 100 && ch.specialT <= 0) {
      ch.special = 0;
      ch.specialT = SPECIAL_DURATION[this.kit.special];
      ctx.gadgets.activateSpecial(ch, this.kit.special, ctx);
    }
    // Turbo Jet: the main weapon becomes an explosive launcher
    if (ch.jetT > 0 && ch.input.fire && this.jetCd <= 0) {
      this.jetCd = 0.6;
      const muzzle = ch.muzzle(new THREE.Vector3());
      const dir = ch.aimDirFrom(muzzle, new THREE.Vector3());
      ctx.projectiles.spawn({
        pos: muzzle, vel: dir.multiplyScalar(30), team: ch.team, owner: ch, damage: 0, paintR: 1.2, size: 0.3,
        gravDelay: 0.25, falloff: 1, explode: { radius: 2.6, max: 150, min: 45 },
      });
      ctx.sfx.flick(0);
    }
  }
}

