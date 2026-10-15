import * as THREE from 'three';
import type { MapInfo } from '../world/SkateparkMap';
import type { Character } from './Character';
import type { GameCtx } from './types';

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

  constructor(readonly ch: Character, private ctx: GameCtx, private map: MapInfo, readonly skill = 0.6) {}

  reset() {
    this.retargetT = 0;
    this.enemy = null;
    this.refilling = false;
    this.lastPos.copy(this.ch.pos);
  }

  private pickTarget() {
    const b = this.map.bounds;
    const ch = this.ch;
    // forward-ish bias: Alpha pushes toward +z, Bravo toward -z
    const dirZ = ch.team === 0 ? 1 : -1;
    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Vector3(
        THREE.MathUtils.lerp(b.minX + 2, b.maxX - 2, Math.random()),
        6,
        THREE.MathUtils.lerp(b.minZ + 4, b.maxZ - 4, Math.random()),
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
      default: return 7;
    }
  }

  update(dt: number) {
    const ch = this.ch;
    const inp = ch.input;
    if (!ch.alive) {
      inp.fire = false;
      inp.swim = false;
      inp.move.set(0, 0);
      return;
    }
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
        if (ch.weapon.kind === 'charger') {
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
        if (ch.weapon.kind === 'charger') {
          wantFire = ch.weapon.charge < 0.9;
        } else {
          wantFire = true;
        }
        // in own ink and far from the target? swim there fast
        const far = ch.pos.distanceTo(this.target) > 8;
        if (far && ch.standing === 'own' && ch.weapon.kind !== 'roller' && Math.random() < 0.02) wantSwim = true;
      }
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
