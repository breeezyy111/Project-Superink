import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { HEALTH, INK_TANK, PHYS, Team } from '../config';
import { MAP_ONLY } from '../world/Physics';
import { InkfinModel, Look } from './InkfinModel';
import type { Kit } from './items';
import { KitState } from './kit';
import { buildWeaponModel, WeaponState } from './weapons';
import type { GameCtx } from './types';

export interface CharInput {
  move: THREE.Vector2; // world-space x/z desired direction, length 0..1
  fire: boolean;
  sub: boolean;
  special: boolean;
  swim: boolean;
  jump: boolean;
  aimPoint: THREE.Vector3; // world point to shoot toward
  aimYaw: number;
  aimPitch: number;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class Character {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  hp = HEALTH.max;
  ink = INK_TANK.max;
  alive = true;
  grounded = false;
  swimming = false;
  submerged = false; // swimming in own ink (hidden + fast)
  climbing = false;
  standing: 'own' | 'enemy' | 'none' = 'none';
  respawnT = 0;
  lastHurtT = 99;
  enemyInkDamage = 0;
  splats = 0;
  deaths = 0;
  paintedApprox = 0;
  lastAttacker: Character | null = null;
  input: CharInput = {
    move: new THREE.Vector2(), fire: false, swim: false, jump: false, sub: false, special: false,
    aimPoint: new THREE.Vector3(), aimYaw: 0, aimPitch: 0,
  };
  weapon: WeaponState;
  kitState: KitState;
  /** special gauge 0..100, filled by painting */
  special = 0;
  /** >0 while a special is running */
  specialT = 0;
  /** >0 while flying on Turbo Jet */
  jetT = 0;
  private jetBaseY = 0;
  /** ownership cells this character painted this match */
  painted = 0;
  model: InkfinModel;
  collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;
  private wasSwimming = false;
  private swimSfxT = 0;
  private jumpHeld = false;

  constructor(
    readonly name: string,
    readonly team: Team,
    readonly isPlayer: boolean,
    look: Look,
    readonly kit: Kit,
    private ctx: GameCtx,
    scene: THREE.Scene,
  ) {
    this.weapon = new WeaponState(kit.main);
    this.kitState = new KitState(kit);
    this.model = new InkfinModel(look, ctx.colorOf(team), kit.main);
    const wm = buildWeaponModel(kit.main, this.model.inkMats[0]);
    this.model.setWeaponModel(wm.model, wm.drum);
    scene.add(this.model.root);

    this.collider = ctx.physics.createCharacterCollider(PHYS.playerRadius, PHYS.playerHalfHeight);
    this.controller = ctx.physics.world.createCharacterController(0.03);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.controller.enableAutostep(0.45, 0.2, false);
    this.controller.enableSnapToGround(0.35);
    this.controller.setSlideEnabled(true);
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.model.root);
    this.ctx.physics.world.removeCharacterController(this.controller);
    this.ctx.physics.world.removeCollider(this.collider, false);
  }

  spawn(p: THREE.Vector3, yaw: number) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.input.aimYaw = yaw;
    this.hp = HEALTH.max;
    this.ink = INK_TANK.max;
    this.alive = true;
    this.swimming = false;
    this.jetT = 0;
    this.specialT = 0;
    this.weapon.reset();
    this.model.root.visible = true;
    this.syncCollider();
  }

  startJet() {
    const g = this.ctx.physics.raycast(this.pos.clone().setY(this.pos.y + 0.5), DOWN, 30);
    this.jetBaseY = g ? g.point.y : this.pos.y;
    this.jetT = 7;
    this.swimming = false;
  }

  chestPoint(out: THREE.Vector3) {
    return out.copy(this.pos).add(tmp2.set(0, this.swimming ? 0.35 : 0.95, 0));
  }

  hitRadius() {
    return this.swimming ? 0.45 : 0.55;
  }

  horizontalSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  muzzle(out: THREE.Vector3) {
    const y = this.input.aimYaw;
    // right shoulder, a bit forward
    return out.set(
      this.pos.x + Math.sin(y) * 0.55 + Math.cos(y) * -0.3,
      this.pos.y + 1.22 + Math.sin(this.input.aimPitch) * 0.45,
      this.pos.z + Math.cos(y) * 0.55 - Math.sin(y) * -0.3,
    );
  }

  aimDirFrom(from: THREE.Vector3, out: THREE.Vector3) {
    out.copy(this.input.aimPoint).sub(from);
    if (out.lengthSq() < 0.5) out.set(Math.sin(this.input.aimYaw), 0, Math.cos(this.input.aimYaw));
    return out.normalize();
  }

  private syncCollider() {
    this.collider.setTranslation({ x: this.pos.x, y: this.pos.y + PHYS.playerRadius + PHYS.playerHalfHeight, z: this.pos.z });
  }

  /** Who owns the ink under the given ray? */
  private probe(origin: THREE.Vector3, dir: THREE.Vector3, dist: number): 'own' | 'enemy' | 'none' {
    const hit = this.ctx.physics.raycast(origin, dir, dist);
    if (!hit || !hit.inkable) return 'none';
    const o = this.ctx.ink.ownerAt(hit.parent, hit.point, hit.normal);
    if (o === 0) return 'none';
    return o === this.team + 1 ? 'own' : 'enemy';
  }

  update(dt: number) {
    if (!this.alive) {
      this.respawnT -= dt;
      return;
    }
    const inp = this.input;
    this.lastHurtT += dt;

    // what are we standing on?
    this.standing = this.probe(tmp.copy(this.pos).setY(this.pos.y + 0.3), DOWN, 0.55);

    // swim / kid form
    const jetting = this.jetT > 0;
    if (jetting) this.jetT -= dt;
    if (this.specialT > 0) this.specialT -= dt;
    const wantSwim = inp.swim && !jetting;
    if (wantSwim !== this.wasSwimming) {
      this.model.pop();
      if (wantSwim && this.standing === 'own') {
        this.ctx.effects.burst(this.pos, new THREE.Vector3(0, 1, 0), this.ctx.colorOf(this.team), 10, 4, 0.08);
        if (this.isPlayer) this.ctx.sfx.dive();
      }
    }
    this.wasSwimming = wantSwim;
    this.swimming = wantSwim;

    // wall climb check (swim form into own-inked wall)
    this.climbing = false;
    const mv = inp.move;
    if (this.swimming && mv.lengthSq() > 0.05) {
      const dir = tmp2.set(mv.x, 0, mv.y).normalize();
      const origin = tmp.copy(this.pos).setY(this.pos.y + 0.45);
      const hit = this.ctx.physics.raycast(origin, dir, PHYS.playerRadius + 0.4);
      if (hit && hit.inkable && Math.abs(hit.normal.y) < 0.4) {
        const o = this.ctx.ink.ownerAt(hit.parent, hit.point, hit.normal);
        if (o === this.team + 1) this.climbing = true;
      }
    }
    this.submerged = this.swimming && (this.standing === 'own' || this.climbing);

    // speed
    let speed = PHYS.walkSpeed;
    if (this.swimming) {
      speed = this.submerged ? PHYS.swimSpeed : this.standing === 'enemy' ? 1.6 : PHYS.swimSpeedDry;
    } else {
      if (this.standing === 'enemy') speed = PHYS.walkSpeedEnemyInk;
      speed *= this.weapon.speedMul(this);
    }
    if (jetting) speed = 5.5;

    const target = tmp.set(mv.x * speed, 0, mv.y * speed);
    const accel = jetting ? 30 : this.grounded || this.climbing ? (this.swimming ? 55 : 45) : 12;
    const k = Math.min(1, accel * dt / Math.max(1, speed));
    if (this.weapon.dodging) {
      // mid dodge roll: keep the burst of speed, easing off
      this.vel.x *= 1 - Math.min(1, dt * 3);
      this.vel.z *= 1 - Math.min(1, dt * 3);
    } else {
      this.vel.x += (target.x - this.vel.x) * k;
      this.vel.z += (target.z - this.vel.z) * k;
    }

    // vertical
    if (jetting) {
      // hover high above the ground the jet started from
      const target = this.jetBaseY + 6;
      this.vel.y = THREE.MathUtils.clamp((target - this.pos.y) * 3, -6, 8);
      this.grounded = false;
      if (Math.random() < 0.7) this.ctx.effects.burst(this.pos.clone(), DOWN, this.ctx.colorOf(this.team), 2, 6, 0.09);
    } else if (this.climbing) {
      this.vel.y = inp.jump ? PHYS.climbSpeed * 1.4 : PHYS.climbSpeed;
      this.wasClimbing = true;
    } else {
      if (this.wasClimbing && this.swimming && mv.lengthSq() > 0.05) {
        // popped over the top of a wall: give a little hop forward
        this.vel.y = Math.max(this.vel.y, 5.5);
        this.vel.x += mv.x * 2;
        this.vel.z += mv.y * 2;
      }
      this.wasClimbing = false;
      this.vel.y -= PHYS.gravity * dt;
      if (this.grounded && this.vel.y < 0) this.vel.y = -1;
      if (inp.jump && !this.jumpHeld && this.grounded && this.weapon.tryDodge(this, this.ctx)) {
        // dualies turned the jump into a dodge roll
      } else if (inp.jump && !this.jumpHeld && this.grounded) {
        this.vel.y = this.submerged ? PHYS.jumpSpeed * 1.12 : PHYS.jumpSpeed;
        this.grounded = false;
        this.model.pop();
        if (this.isPlayer) this.ctx.sfx.jump();
      }
    }
    this.jumpHeld = inp.jump;

    // move through Rapier's character controller
    const delta = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.controller.computeColliderMovement(this.collider, delta, undefined, MAP_ONLY);
    const m = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    this.pos.x += m.x;
    this.pos.y += m.y;
    this.pos.z += m.z;
    if (dt > 0) {
      // bonk on ceilings, stop when blocked
      if (this.vel.y > 0 && m.y < delta.y * 0.5 && !this.climbing) this.vel.y = 0;
    }
    this.syncCollider();

    // facing
    if (this.swimming) {
      if (mv.lengthSq() > 0.02) this.yaw = lerpAngle(this.yaw, Math.atan2(mv.x, mv.y), Math.min(1, dt * 14));
    } else if (this.weapon.rolling) {
      if (mv.lengthSq() > 0.02) this.yaw = lerpAngle(this.yaw, Math.atan2(mv.x, mv.y), Math.min(1, dt * 7));
    } else {
      this.yaw = lerpAngle(this.yaw, inp.aimYaw, Math.min(1, dt * 18));
    }

    // weapon
    if (!jetting) this.weapon.update(dt, this, this.ctx);
    this.kitState.update(dt, this, this.ctx);

    // ink tank
    if (this.submerged) this.ink += INK_TANK.refillSwim * dt;
    else if (!inp.fire) this.ink += INK_TANK.refillIdle * dt;
    this.ink = THREE.MathUtils.clamp(this.ink, 0, INK_TANK.max);

    // enemy ink hurts (up to a cap), regen when safe
    if (this.standing === 'enemy' && this.grounded) {
      const dmg = HEALTH.enemyInkDps * dt;
      // enemy ink chips away at you, but can never splat you on its own
      if (this.enemyInkDamage < HEALTH.enemyInkDamageCap && this.hp > 1) {
        this.hp = Math.max(1, this.hp - dmg);
        this.enemyInkDamage += dmg;
      }
      this.lastHurtT = Math.min(this.lastHurtT, 0.5);
    } else {
      this.enemyInkDamage = Math.max(0, this.enemyInkDamage - dt * 30);
    }
    if (this.lastHurtT > HEALTH.regenDelay) {
      this.hp = Math.min(HEALTH.max, this.hp + HEALTH.regenPerSec * (this.submerged ? 1.6 : 1) * dt);
    }

    // swim sfx/ripples
    if (this.submerged && this.horizontalSpeed() > 2) {
      this.swimSfxT -= dt;
      if (this.swimSfxT <= 0) {
        this.swimSfxT = 0.12;
        this.ctx.effects.burst(this.pos.clone().setY(this.pos.y + 0.1), new THREE.Vector3(0, 1, 0), this.ctx.colorOf(this.team), 2, 2.2, 0.06);
        if (this.isPlayer) this.ctx.sfx.swim();
      }
    }

    this.updateModel(dt);
  }

  private wasClimbing = false;

  private updateModel(dt: number) {
    const r = this.model.root;
    r.position.copy(this.pos);
    if (this.climbing) {
      r.rotation.set(0, this.yaw, 0);
    } else {
      r.rotation.set(0, this.yaw, 0);
    }
    // enemies hidden in their own ink are invisible; your own team shows a faint ripple only
    const hidden = this.submerged;
    this.model.animate(dt, {
      speed: this.horizontalSpeed(),
      grounded: this.grounded,
      aimPitch: this.input.aimPitch,
      inkFrac: this.ink / INK_TANK.max,
      swim: this.swimming,
      hidden,
      firing: this.input.fire,
      rolling: this.weapon.rolling,
      climbing: this.climbing,
      flicking: this.weapon.flickT > 0 || this.weapon.sinceFlick < 0.15,
    });
  }

  hurt(amount: number, attacker: Character) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.lastHurtT = 0;
    this.lastAttacker = attacker;
    return this.hp <= 0;
  }

  die(respawnSeconds: number) {
    this.alive = false;
    this.special *= 0.5;
    this.jetT = 0;
    this.specialT = 0;
    this.deaths++;
    this.respawnT = respawnSeconds;
    this.model.root.visible = false;
    this.vel.set(0, 0, 0);
  }
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
