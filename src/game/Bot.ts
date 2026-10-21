import * as THREE from 'three';
import type { StageInfo as MapInfo } from '../world/Stage';
import { SUBS } from './items';
import type { Character } from './Character';
import type { GameCtx } from './types';
import type { ZoneControl } from './Zones';
import type { TowerControl } from './Tower';

/**
 * Simple but lively Turf War bot:
 *  - paints unclaimed / enemy turf by default
 *  - fights enemies it can see
 *  - swims in its own ink to refill
 *  - jumps / re-routes when stuck
 */
export class Bot {
  private target = new THREE.Vector3();
  private retargetT = 0;
  private thinkT = 0;
  private enemy: Character | null = null;
  private stuckT = 0;
  private lastPos = new THREE.Vector3();
  private strafe = 1;
  private strafeT = 0;
  private refilling = false;
  private aimErr = new THREE.Vector3();
  private chargeGoal = 1;
  private reaction = 0;
  private jumpT = 0;
  /** Tower Control: this bot always goes for the tower */
  private towerBot = Math.random() < 0.7;

  constructor(readonly ch: Character, private ctx: GameCtx, private map: MapInfo, readonly skill = 0.6, private zone: ZoneControl | null = null, private tower: TowerControl | null = null) {}

  private subT = 2;
  private specialDelay = 1;

  idle() {
    const inp = this.ch.input;
    inp.fire = false;
    inp.sub = false;
    inp.special = false;
    inp.swim = false;
    inp.move.set(0, 0);
  }

  /** Is there floor ahead in this direction (don't walk off ledges into the abyss)? */
  private groundAhead(dir: THREE.Vector3) {
    const p = this.ch.pos.clone().addScaledVector(dir, 1.4).setY(this.ch.pos.y + 0.8);
    const hit = this.ctx.physics.raycast(p, new THREE.Vector3(0, -1, 0), 4.5);
    return !!hit && hit.point.y > this.map.killY + 1;
  }

  reset() {
    this.retargetT = 0;
    this.enemy = null;
    this.refilling = false;
    this.lastPos.copy(this.ch.pos);
  }

  private pickTarget() {
    const b = this.map.bounds;
    const ch = this.ch;
    // Tower Control: most bots head for the tower (a couple roam and paint)
    const tw = this.tower;
    if (tw && (this.towerBot || tw.owner !== ch.team)) {
      tw.top(this.target);
      this.retargetT = 0.8;
      return;
    }
    // forward-ish bias: Alpha pushes toward +z, Bravo toward -z
    const dirZ = ch.team === 0 ? 1 : -1;
    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    // Zone Control: most of the time, go fight over the zone (more so when we don't hold it)
    const z = this.zone;
    const zoneTries = !z ? 0 : z.owner === ch.team ? (Math.random() < 0.5 ? 6 : 0) : 8;
    for (let i = 0; i < 10; i++) {
      const inZone = i < zoneTries;
      const r = inZone ? z!.rect : { minX: b.minX + 2, maxX: b.maxX - 2, minZ: b.minZ + 4, maxZ: b.maxZ - 4 };
      const p = new THREE.Vector3(
        THREE.MathUtils.lerp(r.minX, r.maxX, Math.random()),
        inZone ? z!.center.y + 3 : 6,
        THREE.MathUtils.lerp(r.minZ, r.maxZ, Math.random()),
      );
      const hit = this.ctx.physics.raycast(p, new THREE.Vector3(0, -1, 0), 10);
      if (!hit || hit.point.y > 3.2 || hit.normal.y < 0.6) continue;
      const owner = hit.inkable ? this.ctx.ink.ownerAt(hit.parent, hit.point, hit.normal) : -1;
      let score = 0;
      if (owner === 0) score += 3;
      else if (owner !== ch.team + 1 && owner > 0) score += 4;
      else if (owner === -1) score -= 3;
      const dist = hit.point.distanceTo(ch.pos);
      score -= Math.abs(dist - 12) * 0.12;
      score += (hit.point.z - ch.pos.z) * dirZ * 0.06;
      score += Math.random() * 1.5;
      if (inZone && owner !== ch.team + 1) score += 5;
      if (score > bestScore) {
        bestScore = score;
        best = hit.point;
      }
    }
    if (best) this.target.copy(best);
    this.retargetT = 3 + Math.random() * 3;
  }

  private canSee(o: Character) {
    const from = this.ch.chestPoint(new THREE.Vector3());
    const to = o.chestPoint(new THREE.Vector3());
    const d = to.clone().sub(from);
    const dist = d.length();
    const hit = this.ctx.physics.raycast(from, d.divideScalar(dist), dist);
    return !hit;
  }

  private preferredRange() {
    switch (this.ch.weapon.kind) {
      case 'charger': return 17;
      case 'roller': return 1.5;
      case 'slosher': return 5;
      case 'splatling': return 11;
      case 'dualies': return 6;
      default: return 7;
    }
  }

  update(dt: number) {
    const ch = this.ch;
    const inp = ch.input;
    if (!ch.alive) {
      this.idle();
      return;
    }
    inp.sub = false;
    inp.special = false;
    this.subT -= dt;
    this.retargetT -= dt;
    this.thinkT -= dt;
    this.strafeT -= dt;
    this.jumpT -= dt;
    if (this.strafeT <= 0) {
      this.strafe = Math.random() < 0.5 ? -1 : 1;
      this.strafeT = 0.6 + Math.random() * 1.2;
    }

    // look for enemies a few times per second
    if (this.thinkT <= 0) {
      this.thinkT = 0.25;
      const range = ch.weapon.kind === 'charger' ? 30 : 18;
      let best: Character | null = null;
      let bestD = range;
      for (const o of this.ctx.characters) {
        if (!o.alive || o.team === ch.team) continue;
        if (o.submerged && o.pos.distanceTo(ch.pos) > 4) continue; // can't see hidden swimmers
        const d = o.pos.distanceTo(ch.pos);
        if (d < bestD && this.canSee(o)) {
          bestD = d;
          best = o;
        }
      }
      if (best !== this.enemy) {
        this.reaction = 0.45 - this.skill * 0.25;
        this.chargeGoal = 0.55 + Math.random() * 0.45;
      }
      this.enemy = best;
      const err = (1 - this.skill) * 1.2 + 0.15;
      this.aimErr.set((Math.random() - 0.5) * err, (Math.random() - 0.5) * err * 0.6, (Math.random() - 0.5) * err);
    }
    this.reaction -= dt;

    // ink management
    if (ch.ink < 12) this.refilling = true;
    if (this.refilling && ch.ink > 85) this.refilling = false;

    const toMove = new THREE.Vector3();
    let wantFire = false;
    let wantSwim = false;
    const aim = new THREE.Vector3();

    if (this.enemy && !this.refilling) {
      const e = this.enemy;
      const ep = e.chestPoint(new THREE.Vector3());
      // lead the target a little
      ep.addScaledVector(e.vel, 0.15 + ep.distanceTo(ch.pos) / 60);
      aim.copy(ep).add(this.aimErr);
      const to = e.pos.clone().sub(ch.pos).setY(0);
      const dist = to.length();
      to.normalize();
      const pref = this.preferredRange();
      const side = new THREE.Vector3(to.z, 0, -to.x).multiplyScalar(this.strafe);
      if (dist > pref + 2) toMove.add(to);
      else if (dist < pref - 2 && ch.weapon.kind !== 'roller') toMove.sub(to);
      toMove.addScaledVector(side, ch.weapon.kind === 'charger' ? 0.3 : 0.8);
      if (this.reaction <= 0) {
        if (ch.weapon.kind === 'charger' || ch.weapon.kind === 'splatling') {
          // hold until charged enough, then release
          wantFire = ch.weapon.charge < this.chargeGoal;
        } else if (ch.weapon.kind === 'roller') {
          wantFire = dist < 6;
          if (dist < 3.5) toMove.copy(to); // run them over
        } else {
          wantFire = dist < 14;
        }
      }
    } else {
      // turf mode
      if (this.retargetT <= 0 || ch.pos.distanceTo(this.target) < 2.5) this.pickTarget();
      const to = this.target.clone().sub(ch.pos).setY(0);
      if (to.lengthSq() > 0.01) toMove.copy(to.normalize());
      if (this.refilling) {
        wantSwim = true;
        // stay put in own ink, else head back toward own spawn side to find some
        if (ch.standing !== 'own') toMove.set(0, 0, ch.team === 0 ? -1 : 1).add(toMove.multiplyScalar(0.5));
        else toMove.multiplyScalar(ch.ink < 60 ? 0.0 : 1);
      } else {
        // paint the floor ahead; chargers shoot long streaks
        const fwd = toMove.lengthSq() > 0 ? toMove.clone() : new THREE.Vector3(Math.sin(ch.yaw), 0, Math.cos(ch.yaw));
        const wob = Math.sin(performance.now() / 300 + ch.name.length) * 0.6;
        const side = new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(wob * 3);
        const dist = ch.weapon.kind === 'charger' ? 16 : 4.5;
        aim.copy(ch.pos).addScaledVector(fwd, dist).add(side);
        aim.y = ch.pos.y;
        if (ch.weapon.kind === 'charger' || ch.weapon.kind === 'splatling') {
          wantFire = ch.weapon.charge < 0.9;
        } else {
          wantFire = true;
        }
        // in own ink and far from the target? swim there fast
        const far = ch.pos.distanceTo(this.target) > 8;
        if (far && ch.standing === 'own' && ch.weapon.kind !== 'roller' && Math.random() < 0.02) wantSwim = true;
      }
    }

    // subs: lob at enemies in mid range, or drop a mine where we stand
    const sub = ch.kitState.kit.sub;
    const cost = SUBS[sub].cost;
    if (this.subT <= 0 && ch.ink > cost + 15 && !this.refilling) {
      const d = this.enemy ? this.enemy.pos.distanceTo(ch.pos) : 99;
      if (sub === 'mine' ? Math.random() < 0.3 : this.enemy && d > 5 && d < 15 && this.reaction <= 0) {
        inp.sub = true;
        wantFire = false;
        this.subT = 4 + Math.random() * 5 - this.skill * 2;
      } else this.subT = 0.7;
    }
    // specials: fire them when it counts (or soon after they fill)
    if (ch.special >= 100) {
      this.specialDelay -= dt;
      const sp = ch.kitState.kit.special;
      const near = this.enemy && this.enemy.pos.distanceTo(ch.pos) < (sp === 'jet' ? 25 : 14);
      if (near || this.specialDelay < -6) {
        inp.special = true;
        this.specialDelay = 1 + Math.random() * 2;
      }
    }
    if (ch.jetT > 0 && this.enemy) {
      wantFire = true;
      aim.copy(this.enemy.pos).add(this.aimErr);
    }

    // don't walk off ledges / into water
    if (toMove.lengthSq() > 0.01 && !ch.climbing) {
      const dir = toMove.clone().setY(0).normalize();
      if (!this.groundAhead(dir)) {
        // a ledge: look for a way around (bridges, edges), favouring our usual side
        let found: THREE.Vector3 | null = null;
        for (const a of [0.5, 1.0, 1.5]) {
          for (const side of [this.strafe, -this.strafe]) {
            const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a * side);
            if (this.groundAhead(d)) {
              found = d;
              break;
            }
          }
          if (found) break;
        }
        if (found) toMove.copy(found).multiplyScalar(toMove.length());
        else {
          toMove.set(0, 0, 0);
          this.retargetT = 0;
        }
      }
    }

    // Tower Control: once aboard, mostly stay on the deck (it carries us)
    if (this.tower && this.towerBot && this.tower.onDeck(ch)) {
      const c = this.tower.top(new THREE.Vector3()).sub(ch.pos).setY(0);
      toMove.multiplyScalar(0.15).addScaledVector(c, 0.4);
    }

    // stuck detection
    const moved = ch.pos.distanceTo(this.lastPos);
    this.lastPos.copy(ch.pos);
    if (toMove.lengthSq() > 0.1 && moved < dt * 1.2) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    let jump = false;
    if (this.stuckT > 0.5 && this.jumpT <= 0) {
      jump = true;
      this.jumpT = 0.8;
    }
    if (this.stuckT > 1.6) {
      this.pickTarget();
      this.stuckT = 0;
      // sidestep
      toMove.add(new THREE.Vector3(-toMove.z, 0, toMove.x).multiplyScalar(this.strafe * 1.5));
    }

    // dualies: dodge roll sideways now and then in a fight
    if (this.enemy && wantFire && ch.weapon.kind === 'dualies' && this.jumpT <= 0 && Math.random() < dt * (0.4 + this.skill)) {
      toMove.copy(new THREE.Vector3(-toMove.z, 0, toMove.x)).normalize().multiplyScalar(this.strafe);
      if (toMove.lengthSq() < 0.1) toMove.set(this.strafe, 0, 0);
      jump = true;
      this.jumpT = 0.6;
    }

    // out of ink: can't fire
    if (ch.ink < 3) wantFire = false;

    if (toMove.lengthSq() > 1) toMove.normalize();
    inp.move.set(toMove.x, toMove.z);
    inp.swim = wantSwim && !wantFire;
    inp.fire = wantFire;
    inp.jump = jump;
    if (aim.lengthSq() === 0) aim.copy(ch.pos).add(new THREE.Vector3(Math.sin(ch.yaw), 0, Math.cos(ch.yaw)).multiplyScalar(5));
    inp.aimPoint.copy(aim);
    const muzzle = ch.muzzle(new THREE.Vector3());
    const d = aim.clone().sub(muzzle);
    inp.aimYaw = Math.atan2(d.x, d.z);
    inp.aimPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  }
}
