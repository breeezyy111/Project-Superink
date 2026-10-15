import * as THREE from 'three';
import { InkSystem } from '../ink/InkSystem';
import type { Character } from './Character';
import type { GameCtx } from './types';

export type WeaponKind = 'shooter' | 'roller' | 'charger';

export interface WeaponSpec {
  kind: WeaponKind;
  name: string;
  blurb: string;
  // 0..1 values for the locker stat bars
  stats: { range: number; damage: number; fireRate: number; mobility: number };
}

export const WEAPONS: Record<WeaponKind, WeaponSpec> = {
  shooter: {
    kind: 'shooter',
    name: 'Fizz Blaster',
    blurb: 'Full-auto fizzy ink. Great all-rounder: paint, fight, repeat.',
    stats: { range: 0.5, damage: 0.45, fireRate: 0.85, mobility: 0.75 },
  },
  roller: {
    kind: 'roller',
    name: 'Grind Roller',
    blurb: 'Roll wide stripes of turf. Flick a heavy wave of ink. Run enemies over!',
    stats: { range: 0.3, damage: 0.95, fireRate: 0.35, mobility: 0.6 },
  },
  charger: {
    kind: 'charger',
    name: 'Streak Charger',
    blurb: 'Hold to charge, release for a long-range splat that streaks ink across the map.',
    stats: { range: 1.0, damage: 1.0, fireRate: 0.2, mobility: 0.35 },
  },
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export class WeaponState {
  cooldown = 0;
  charge = 0;
  flickT = 0;
  sinceFlick = 9;
  rolling = false;
  private prevFire = false;
  private chargeSfxT = 0;

  constructor(readonly kind: WeaponKind) {}

  /** Movement speed multiplier while using the weapon. */
  speedMul(ch: Character) {
    if (!ch.input.fire || ch.swimming) return 1;
    if (this.kind === 'shooter') return 0.72;
    if (this.kind === 'charger') return 0.32;
    if (this.kind === 'roller') return this.rolling ? 0.85 : 0.45;
    return 1;
  }

  reset() {
    this.cooldown = 0;
    this.charge = 0;
    this.flickT = 0;
    this.rolling = false;
    this.prevFire = false;
  }

  update(dt: number, ch: Character, ctx: GameCtx) {
    this.cooldown -= dt;
    this.sinceFlick += dt;
    const fire = ch.input.fire && !ch.swimming && ch.alive;
    const pressed = fire && !this.prevFire;
    const released = !fire && this.prevFire;
    this.prevFire = fire;

    switch (this.kind) {
      case 'shooter':
        if (fire && this.cooldown <= 0 && ch.ink >= 0.9) {
          this.cooldown = 0.115;
          ch.ink -= 0.9;
          this.fireShooter(ch, ctx);
        }
        break;

      case 'roller':
        if (pressed && this.cooldown <= 0 && ch.ink >= 8) {
          this.flickT = 0.2;
          this.cooldown = 0.6;
        }
        if (this.flickT > 0) {
          this.flickT -= dt;
          if (this.flickT <= 0) {
            ch.ink -= 8;
            this.sinceFlick = 0;
            this.flick(ch, ctx);
          }
        }
        this.rolling = fire && this.flickT <= 0 && this.sinceFlick > 0.3 && ch.grounded && ch.ink > 0.5;
        if (this.rolling) this.roll(dt, ch, ctx);
        break;

      case 'charger':
        if (fire && ch.ink >= 2) {
          const before = this.charge;
          this.charge = Math.min(1, this.charge + dt / 0.95);
          this.chargeSfxT -= dt;
          if (ch.isPlayer && this.chargeSfxT <= 0 && this.charge < 1) {
            this.chargeSfxT = 0.09;
            ctx.sfx.charge(this.charge);
          }
          if (ch.isPlayer && before < 1 && this.charge >= 1) ctx.sfx.chargeFull();
        } else if (released && this.charge > 0.05 && this.cooldown <= 0) {
          this.fireCharger(ch, ctx);
          this.cooldown = 0.3;
          this.charge = 0;
        } else if (!fire) {
          this.charge = 0;
        }
        break;
    }
  }

  private fireShooter(ch: Character, ctx: GameCtx) {
    const muzzle = ch.muzzle(tmp);
    const dir = ch.aimDirFrom(muzzle, tmp2);
    const spread = ch.grounded ? 0.055 : 0.14;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread * 0.5;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    ctx.projectiles.spawn({
      pos: muzzle, vel: dir.multiplyScalar(30), team: ch.team, owner: ch,
      damage: 35, paintR: 0.78, size: 0.15, gravDelay: 0.12, drips: true, falloff: 0.55,
    });
    ctx.sfx.shoot(ctx.listener.distanceTo(muzzle), ch.isPlayer);
  }

  private flick(ch: Character, ctx: GameCtx) {
    const muzzle = ch.muzzle(tmp);
    const base = ch.aimDirFrom(muzzle, tmp2);
    const yaw = Math.atan2(base.x, base.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(base.y, -1, 1)) + 0.12;
    for (let i = 0; i < 9; i++) {
      const a = yaw + (i / 8 - 0.5) * 0.75;
      const p = pitch + (Math.random() - 0.3) * 0.12;
      const d = new THREE.Vector3(Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p));
      ctx.projectiles.spawn({
        pos: muzzle.clone().addScaledVector(d, 0.3), vel: d.multiplyScalar(15 + Math.random() * 4), team: ch.team, owner: ch,
        damage: 55, paintR: 1.0, size: 0.22, gravDelay: 0.05, falloff: 0.35,
      });
    }
    ctx.sfx.flick(ctx.listener.distanceTo(muzzle));
    ch.model.pop();
  }

  private roll(dt: number, ch: Character, ctx: GameCtx) {
    const fwd = tmp.set(Math.sin(ch.yaw), 0, Math.cos(ch.yaw));
    const right = tmp2.set(fwd.z, 0, -fwd.x);
    const spd = ch.horizontalSpeed();
    if (spd > 0.5) ch.ink -= dt * 6;
    // paint a wide stripe under the roller drum
    const front = ch.pos.clone().addScaledVector(fwd, 0.85).add(new THREE.Vector3(0, 0.5, 0));
    for (const s of [-0.5, 0, 0.5]) {
      const p = front.clone().addScaledVector(right, s);
      const hit = ctx.physics.raycast(p, DOWN, 1.2);
      if (hit && hit.inkable) ctx.ink.paint([{ x: hit.point.x, y: hit.point.y, z: hit.point.z, r: 0.5 }], ch.team);
    }
    // run-over damage
    for (const c of ctx.characters) {
      if (!c.alive || c.team === ch.team) continue;
      const d = c.pos.clone().sub(ch.pos);
      const f = d.dot(fwd), l = Math.abs(d.dot(right));
      if (f > 0 && f < 1.3 && l < 0.95 && Math.abs(d.y) < 1.2 && spd > 1) ctx.damage(c, 140, ch);
    }
    if (ch.model.rollerDrum) ch.model.rollerDrum.rotation.x += spd * dt * 3;
    if (Math.random() < spd * dt * 2) ctx.effects.burst(front, new THREE.Vector3(0, 1, 0), ctx.colorOf(ch.team), 2, 2.5, 0.06);
    if (ch.isPlayer && spd > 1) ctx.sfx.roll(dt);
  }

  private fireCharger(ch: Character, ctx: GameCtx) {
    const c = this.charge;
    const full = c >= 1;
    ch.ink -= 2 + 16 * c;
    const muzzle = ch.muzzle(tmp).clone();
    const dir = ch.aimDirFrom(muzzle, tmp2).clone();
    const range = 9 + 23 * c;
    const mapHit = ctx.physics.raycast(muzzle, dir, range);
    let end = mapHit ? mapHit.dist : range;
    // characters along the line
    let target: Character | null = null;
    const ch3 = new THREE.Vector3();
    for (const o of ctx.characters) {
      if (!o.alive || o.team === ch.team) continue;
      o.chestPoint(ch3);
      const m = ch3.sub(muzzle);
      const t = m.dot(dir);
      if (t < 0 || t > end) continue;
      const perp = m.addScaledVector(dir, -t).length();
      if (perp < o.hitRadius() + 0.12) {
        end = t;
        target = o;
      }
    }
    const endPt = muzzle.clone().addScaledVector(dir, end);
    if (target) ctx.damage(target, full ? 160 : 40 + 80 * c, ch);
    else if (mapHit && mapHit.inkable) {
      ctx.ink.paint(InkSystem.pattern(mapHit.point, mapHit.normal, 0.7 + 0.6 * c, 6), ch.team);
      ctx.effects.burst(mapHit.point, mapHit.normal, ctx.colorOf(ch.team), 10, 5, 0.08);
    }
    // ink trail streaked along the floor under the shot
    const step = 0.9;
    for (let t = 1.5; t < end; t += step) {
      if (Math.random() > 0.25 + 0.6 * c) continue;
      const p = muzzle.clone().addScaledVector(dir, t);
      const hit = ctx.physics.raycast(p, DOWN, 3.5);
      if (hit && hit.inkable) ctx.ink.paint([{ x: hit.point.x, y: hit.point.y, z: hit.point.z, r: 0.32 + 0.22 * c }], ch.team);
    }
    ctx.effects.tracer(muzzle, endPt, ctx.colorOf(ch.team), full ? 0.09 : 0.05);
    ctx.sfx.charger(ctx.listener.distanceTo(muzzle), full);
    ch.model.pop();
  }
}

// ---------- weapon models ----------

function glossy(color: THREE.ColorRepresentation) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
}

/** Returns the model (held in the right hand, pointing along +Y-down arm => local -Y is "forward") */
export function buildWeaponModel(kind: WeaponKind, inkMat: THREE.Material): { model: THREE.Group; drum: THREE.Object3D | null } {
  const g = new THREE.Group();
  const dark = glossy('#2a2c36');
  const accent = glossy('#ffd23f');
  let drum: THREE.Object3D | null = null;
  // the arm points down its -Y axis when aiming; weapons extend along -Y
  if (kind === 'shooter') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.16), glossy('#f2f2f2'));
    body.position.y = -0.12;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 14), inkMat);
    tank.position.set(0, -0.1, 0.11);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 12), dark);
    nozzle.position.y = -0.38;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.14), dark);
    grip.position.set(0, 0.04, -0.08);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 14), accent);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.3;
    g.add(body, tank, nozzle, grip, ring);
  } else if (kind === 'charger') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.95, 12), glossy('#f2f2f2'));
    barrel.position.y = -0.38;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.14), dark);
    stock.position.y = 0.12;
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.25, 6, 12), inkMat);
    tank.position.set(0, -0.05, 0.1);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 12), accent);
    scope.position.set(0, -0.15, -0.09);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 12), inkMat);
    tip.rotation.x = Math.PI;
    tip.position.y = -0.88;
    g.add(barrel, stock, tank, scope, tip);
  } else {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 10), dark);
    handle.position.y = -0.45;
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.06), dark);
    yoke.position.y = -0.95;
    drum = new THREE.Group();
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.85, 20), inkMat);
    roller.rotation.z = Math.PI / 2;
    drum.add(roller);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.04, 20), accent);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = s * 0.44;
      drum.add(cap);
    }
    drum.position.y = -1.1;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), accent);
    g.add(handle, yoke, drum, grip);
  }
  return { model: g, drum };
}
