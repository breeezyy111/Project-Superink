import * as THREE from 'three';
import { InkSystem } from '../ink/InkSystem';
import type { Character } from './Character';
import type { GameCtx } from './types';

export type WeaponKind = 'shooter' | 'roller' | 'charger' | 'blaster' | 'slosher' | 'splatling' | 'dualies' | 'god';

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
  blaster: {
    kind: 'blaster',
    name: 'Boom Blaster',
    blurb: 'Lobs slow, heavy ink shells that burst on impact. A direct hit splats!',
    stats: { range: 0.45, damage: 0.9, fireRate: 0.3, mobility: 0.65 },
  },
  slosher: {
    kind: 'slosher',
    name: 'Splash Bucket',
    blurb: 'Fling big arcs of ink over walls and up onto ledges. Two hits splat.',
    stats: { range: 0.55, damage: 0.8, fireRate: 0.4, mobility: 0.7 },
  },
  splatling: {
    kind: 'splatling',
    name: 'Whirl Splatling',
    blurb: 'Hold to spin up, release to unload a long stream of fast shots.',
    stats: { range: 0.8, damage: 0.6, fireRate: 1.0, mobility: 0.4 },
  },
  god: {
    kind: 'god',
    name: 'Golden Godblaster',
    blurb: 'Admin only. Never runs dry, splats in one hit and paints everything it touches.',
    stats: { range: 1, damage: 1, fireRate: 1, mobility: 1 },
  },
  dualies: {
    kind: 'dualies',
    name: 'Twin Dualies',
    blurb: 'Two quick pistols. Press Jump while shooting to dodge-roll!',
    stats: { range: 0.4, damage: 0.45, fireRate: 0.9, mobility: 0.95 },
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
  /** splatling: seconds of firing left in the current burst */
  burst = 0;
  /** dualies: dodge rolls left before a short recovery, and post-roll aiming stance */
  rollsLeft = 2;
  rollRecover = 0;
  stanceT = 0;
  private hand = 0;

  /** dualies: the first part of the stance is the roll itself */
  get dodging() {
    return this.kind === 'dualies' && this.stanceT > 0.33;
  }
  private prevFire = false;
  private chargeSfxT = 0;

  constructor(readonly kind: WeaponKind) {}

  /** Movement speed multiplier while using the weapon. */
  speedMul(ch: Character) {
    if (!ch.input.fire || ch.swimming) return 1;
    if (this.kind === 'shooter') return 0.72;
    if (this.kind === 'charger') return 0.32;
    if (this.kind === 'blaster') return 0.6;
    if (this.kind === 'roller') return this.rolling ? 0.85 : 0.45;
    if (this.kind === 'slosher') return 0.7;
    if (this.kind === 'splatling') return this.burst > 0 ? 0.55 : 0.4;
    if (this.kind === 'dualies') return this.stanceT > 0 ? 0 : 0.85;
    return 1;
  }

  reset() {
    this.cooldown = 0;
    this.charge = 0;
    this.flickT = 0;
    this.rolling = false;
    this.prevFire = false;
    this.burst = 0;
    this.rollsLeft = 2;
    this.rollRecover = 0;
    this.stanceT = 0;
  }

  /**
   * Dualies dodge roll: Jump while shooting and moving. Returns true if the jump was used for a roll.
   * Called by Character before it applies a normal jump.
   */
  tryDodge(ch: Character, ctx: GameCtx) {
    if (this.kind !== 'dualies' || !ch.input.fire || ch.swimming || !ch.grounded) return false;
    const mv = ch.input.move;
    if (mv.lengthSq() < 0.1 || this.rollsLeft <= 0 || ch.ink < 5) return false;
    ch.ink -= 5;
    this.rollsLeft--;
    if (this.rollsLeft <= 0) this.rollRecover = 0.7;
    const d = new THREE.Vector3(mv.x, 0, mv.y).normalize();
    ch.vel.x = d.x * 15;
    ch.vel.z = d.z * 15;
    this.stanceT = 0.55;
    ch.model.pop();
    ctx.effects.burst(ch.pos.clone().setY(ch.pos.y + 0.2), new THREE.Vector3(0, 1, 0), ctx.colorOf(ch.team), 10, 4, 0.08);
    const hit = ctx.physics.raycast(ch.pos.clone().setY(ch.pos.y + 0.5), DOWN, 1.5);
    if (hit && hit.inkable) ctx.paintBy(ch, [{ x: hit.point.x, y: hit.point.y, z: hit.point.z, r: 0.9 }]);
    ctx.sfx.dive();
    return true;
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

      case 'slosher':
        if (fire && this.cooldown <= 0 && ch.ink >= 7) {
          this.cooldown = 0.75;
          ch.ink -= 7;
          this.flickT = 0.12; // short wind-up swing before the ink leaves the bucket
        }
        if (this.flickT > 0) {
          this.flickT -= dt;
          if (this.flickT <= 0) this.slosh(ch, ctx);
        }
        break;

      case 'splatling':
        if (ch.model.rollerDrum) ch.model.rollerDrum.rotation.y += dt * (this.burst > 0 ? 30 : this.charge * 14);
        if (this.burst > 0) {
          // unloading: fixed rate until the burst runs out (can't re-charge mid-burst)
          this.burst -= dt;
          if (this.cooldown <= 0 && ch.ink >= 0.6) {
            this.cooldown = 1 / 14;
            ch.ink -= 0.6;
            this.fireSplatling(ch, ctx);
          }
          if (ch.ink < 0.6) this.burst = 0;
        } else if (fire && ch.ink >= 4) {
          const before = this.charge;
          this.charge = Math.min(1, this.charge + dt / 0.85);
          this.chargeSfxT -= dt;
          if (ch.isPlayer && this.chargeSfxT <= 0 && this.charge < 1) {
            this.chargeSfxT = 0.07;
            ctx.sfx.charge(this.charge * 0.7);
          }
          if (ch.isPlayer && before < 1 && this.charge >= 1) ctx.sfx.chargeFull();
        } else if (released && this.charge > 0.08) {
          this.burst = 0.3 + 1.5 * this.charge;
          this.charge = 0;
        } else if (!fire) {
          this.charge = 0;
        }
        break;

      case 'dualies':
        this.stanceT -= dt;
        if (this.rollRecover > 0) {
          this.rollRecover -= dt;
          if (this.rollRecover <= 0) this.rollsLeft = 2;
        } else if (!fire) this.rollsLeft = 2;
        if (fire && this.cooldown <= 0 && ch.ink >= 0.8) {
          this.cooldown = 0.1;
          ch.ink -= 0.8;
          this.fireDualie(ch, ctx);
        }
        break;

      case 'god':
        // admin weapon: rapid exploding shots, no ink cost
        if (fire && this.cooldown <= 0) {
          this.cooldown = 0.07;
          this.fireGod(ch, ctx);
        }
        break;

      case 'blaster':
        if (fire && this.cooldown <= 0 && ch.ink >= 8) {
          this.cooldown = 0.8;
          ch.ink -= 8;
          this.fireBlaster(ch, ctx);
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

  private slosh(ch: Character, ctx: GameCtx) {
    const muzzle = ch.muzzle(tmp).clone();
    muzzle.y += 0.3;
    const base = ch.aimDirFrom(muzzle, tmp2);
    const yaw = Math.atan2(base.x, base.z);
    // a lobbed arc: aim a bit higher than the crosshair so it can reach over cover
    const pitch = Math.asin(THREE.MathUtils.clamp(base.y, -1, 1)) + 0.28;
    for (let i = 0; i < 6; i++) {
      const a = yaw + (Math.random() - 0.5) * 0.07;
      const p = pitch - i * 0.035;
      const sp = 17 - i * 0.9;
      const d = new THREE.Vector3(Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p));
      ctx.projectiles.spawn({
        pos: muzzle.clone().addScaledVector(d, -i * 0.12), vel: d.multiplyScalar(sp), team: ch.team, owner: ch,
        damage: i === 0 ? 70 : 12, paintR: i === 0 ? 1.15 : 0.7, size: i === 0 ? 0.3 : 0.19, gravDelay: 0, falloff: 1,
      });
    }
    ctx.sfx.flick(ctx.listener.distanceTo(muzzle));
    ch.model.pop();
  }

  private fireSplatling(ch: Character, ctx: GameCtx) {
    const muzzle = ch.muzzle(tmp);
    const dir = ch.aimDirFrom(muzzle, tmp2);
    const spread = 0.035;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread * 0.5;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    ctx.projectiles.spawn({
      pos: muzzle, vel: dir.multiplyScalar(38), team: ch.team, owner: ch,
      damage: 28, paintR: 0.7, size: 0.13, gravDelay: 0.2, drips: true, falloff: 0.6,
    });
    ctx.sfx.shoot(ctx.listener.distanceTo(muzzle), ch.isPlayer);
  }

  private fireGod(ch: Character, ctx: GameCtx) {
    const muzzle = ch.muzzle(tmp);
    const dir = ch.aimDirFrom(muzzle, tmp2);
    ctx.projectiles.spawn({
      pos: muzzle, vel: dir.multiplyScalar(55), team: ch.team, owner: ch,
      damage: 999, paintR: 1.6, size: 0.3, gravDelay: 0.5, falloff: 1,
      explode: { radius: 3.2, max: 999, min: 999 }, maxAge: 2,
    });
    ctx.sfx.shoot(ctx.listener.distanceTo(muzzle), ch.isPlayer);
  }

  private fireDualie(ch: Character, ctx: GameCtx) {
    const muzzle = ch.muzzle(tmp);
    // alternate hands
    this.hand ^= 1;
    if (this.hand) {
      const y = ch.input.aimYaw;
      muzzle.x += Math.cos(y) * 0.55;
      muzzle.z -= Math.sin(y) * 0.55;
    }
    const dir = ch.aimDirFrom(muzzle, tmp2);
    const spread = this.stanceT > 0 ? 0.02 : ch.grounded ? 0.07 : 0.15;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread * 0.5;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    ctx.projectiles.spawn({
      pos: muzzle, vel: dir.multiplyScalar(this.stanceT > 0 ? 30 : 26), team: ch.team, owner: ch,
      damage: 30, paintR: 0.62, size: 0.12, gravDelay: 0.08, drips: true, falloff: 0.5,
    });
    ctx.sfx.shoot(ctx.listener.distanceTo(muzzle), ch.isPlayer);
  }

  private fireBlaster(ch: Character, ctx: GameCtx) {
    const muzzle = ch.muzzle(tmp);
    const dir = ch.aimDirFrom(muzzle, tmp2);
    ctx.projectiles.spawn({
      pos: muzzle, vel: dir.multiplyScalar(24), team: ch.team, owner: ch,
      damage: 125, paintR: 1.1, size: 0.26, gravDelay: 0.18, falloff: 1,
      explode: { radius: 2.3, max: 60, min: 30 }, maxAge: 0.55,
    });
    ctx.sfx.flick(ctx.listener.distanceTo(muzzle));
    ch.model.pop();
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
      if (hit && hit.inkable) ctx.paintBy(ch, [{ x: hit.point.x, y: hit.point.y, z: hit.point.z, r: 0.5 }]);
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
    const shieldT = ctx.gadgets.shieldRay(muzzle, dir, end, ch.team);
    const blocked = shieldT < end;
    if (blocked) end = shieldT;
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
    else if (blocked) ctx.effects.burst(muzzle.clone().addScaledVector(dir, end), null, ctx.colorOf(ch.team), 8, 4, 0.07);
    else if (mapHit && mapHit.inkable) {
      ctx.paintBy(ch, InkSystem.pattern(mapHit.point, mapHit.normal, 0.7 + 0.6 * c, 6));
      ctx.effects.burst(mapHit.point, mapHit.normal, ctx.colorOf(ch.team), 10, 5, 0.08);
    }
    // ink trail streaked along the floor under the shot
    const step = 0.9;
    for (let t = 1.5; t < end; t += step) {
      if (Math.random() > 0.25 + 0.6 * c) continue;
      const p = muzzle.clone().addScaledVector(dir, t);
      const hit = ctx.physics.raycast(p, DOWN, 3.5);
      if (hit && hit.inkable) ctx.paintBy(ch, [{ x: hit.point.x, y: hit.point.y, z: hit.point.z, r: 0.32 + 0.22 * c }]);
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
  } else if (kind === 'slosher') {
    // a chunky paint bucket held by the handle
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.28, 20, 1, true), glossy('#f2f2f2'));
    (bucket.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide;
    bucket.position.y = -0.24;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), glossy('#f2f2f2'));
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = -0.38;
    const inkTop = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), inkMat);
    inkTop.rotation.x = -Math.PI / 2;
    inkTop.position.y = -0.13;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 24), accent);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.1;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 6, 20, Math.PI), dark);
    handle.position.y = -0.1;
    g.add(bucket, bottom, inkTop, rim, handle);
  } else if (kind === 'splatling') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.42, 16), glossy('#f2f2f2'));
    body.position.y = -0.18;
    const drumM = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), dark);
      b.position.set(Math.cos(a) * 0.06, -0.55, Math.sin(a) * 0.06);
      drumM.add(b);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.3, 16), inkMat);
    tank.position.set(0, -0.15, 0.16);
    tank.rotation.x = 0.1;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.24), accent);
    handle.position.set(0, 0.02, -0.08);
    g.add(body, drumM, tank, handle);
    drum = drumM; // spins while firing
  } else if (kind === 'dualies') {
    const pistol = () => {
      const p = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.12), glossy('#f2f2f2'));
      body.position.y = -0.1;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.12, 10), dark);
      barrel.position.y = -0.29;
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), inkMat);
      tank.position.set(0, -0.08, 0.08);
      p.add(body, barrel, tank);
      return p;
    };
    g.add(pistol());
    g.userData.offhand = pistol();
  } else if (kind === 'god') {
    // golden blaster with a glowing core
    const gold = new THREE.MeshPhysicalMaterial({ color: '#ffd23f', metalness: 0.8, roughness: 0.2, clearcoat: 1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.42, 16), gold);
    body.position.y = -0.18;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshPhysicalMaterial({ color: '#ffffff', emissive: '#fff2a8', emissiveIntensity: 1.2, clearcoat: 1 }));
    core.position.set(0, -0.12, 0.12);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 16), gold);
    barrel.position.y = -0.5;
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 24), inkMat);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = -0.42;
    const ring2 = ring1.clone();
    ring2.position.y = -0.58;
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), gold);
    fin.position.set(0, -0.2, -0.13);
    fin.rotation.x = Math.PI;
    g.add(body, core, barrel, ring1, ring2, fin);
  } else if (kind === 'blaster') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.36, 16), glossy('#f2f2f2'));
    body.position.y = -0.14;
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.06, 0.12, 16, 1, true), dark);
    bell.position.y = -0.36;
    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), inkMat);
    tank.position.set(0, -0.08, 0.12);
    const fin1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.12), accent);
    fin1.position.set(0, -0.18, -0.1);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.14), dark);
    grip.position.set(0, 0.06, -0.08);
    g.add(body, bell, tank, fin1, grip);
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
