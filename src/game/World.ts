import * as THREE from 'three';
import { SPECIAL_PER_CELL, Team } from '../config';
import { InkSystem, SplatCircle } from '../ink/InkSystem';
import type { Sfx } from '../audio/Sfx';
import type { Stage } from '../world/Stage';
import type { Character } from './Character';
import { Effects } from './Effects';
import { Gadgets } from './kit';
import { Projectiles } from './Projectiles';
import type { GameCtx } from './types';

/** Shared simulation for anywhere Inkfins run around with ink: battles and the hub. */
export abstract class InkWorld implements GameCtx {
  characters: Character[] = [];
  projectiles: Projectiles;
  effects: Effects;
  gadgets: Gadgets;
  listener = new THREE.Vector3();
  allowKit = true;

  constructor(protected scene: THREE.Scene, readonly stage: Stage, readonly sfx: Sfx) {
    this.projectiles = new Projectiles(scene);
    this.effects = new Effects(scene);
    this.gadgets = new Gadgets(scene);
  }

  get physics() {
    return this.stage.physics;
  }

  get ink() {
    return this.stage.ink;
  }

  abstract colorOf(team: Team): string;

  /** Called when a hit lands; `died` tells whether it splatted the target. */
  protected abstract onHit(target: Character, attacker: Character, died: boolean): void;

  damage(target: Character, amount: number, attacker: Character) {
    if (!target.alive || target.team === attacker.team) return;
    const died = target.hurt(amount, attacker);
    this.onHit(target, attacker, died);
  }

  paintBy(owner: Character, circles: SplatCircle[]) {
    const n = this.ink.paint(circles, owner.team);
    owner.painted += n;
    if (owner.specialT <= 0 && owner.special < 100) {
      const before = owner.special;
      owner.special = Math.min(100, owner.special + n * SPECIAL_PER_CELL);
      if (owner.isPlayer && before < 100 && owner.special >= 100) this.sfx.specialReady();
    }
  }

  explode(at: THREE.Vector3, radius: number, max: number, min: number, team: Team, owner: Character, exclude?: Character) {
    const ground = this.physics.raycast(at.clone().setY(at.y + 0.2), new THREE.Vector3(0, -1, 0), radius + 0.5);
    const normal = ground ? ground.normal : new THREE.Vector3(0, 1, 0);
    const center = ground && ground.dist < radius * 0.8 ? ground.point : at;
    this.paintBy(owner, InkSystem.pattern(center, normal, radius * 0.85, 8));
    // also splash walls and anything right around the blast
    this.paintBy(owner, [{ x: at.x, y: at.y, z: at.z, r: radius * 0.7 }]);
    const color = this.colorOf(team);
    this.effects.burst(at, null, color, 26, 8, 0.12);
    this.sfx.boom(this.listener.distanceTo(at));
    const c = new THREE.Vector3();
    for (const o of this.characters) {
      if (!o.alive || o.team === team || o === exclude) continue;
      const d = o.chestPoint(c).distanceTo(at);
      if (d > radius) continue;
      if (this.gadgets.protects(o, at)) continue;
      const k = d < radius * 0.35 ? 0 : (d - radius * 0.35) / (radius * 0.65);
      this.damage(o, THREE.MathUtils.lerp(max, min, k), owner);
    }
  }

  /** Advance characters, physics, shots, gadgets and effects. */
  protected simulate(dt: number, moving: boolean) {
    if (moving) {
      for (const c of this.characters) c.update(dt);
      this.physics.step();
      this.projectiles.update(dt, this);
      this.gadgets.update(dt, this);
    }
    this.effects.update(dt);
    this.stage.update(dt);
    this.ink.flush();
  }

  dispose() {
    for (const c of this.characters) c.dispose(this.scene);
    this.characters = [];
    this.projectiles.dispose(this.scene);
    this.effects.dispose();
    this.gadgets.clear();
  }
}
