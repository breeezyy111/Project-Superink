import * as THREE from 'three';
import type { Team } from '../config';
import { InkSystem } from '../ink/InkSystem';
import type { Character } from './Character';
import type { GameCtx } from './types';

export interface ProjOpts {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  team: Team;
  owner: Character;
  damage: number;
  paintR: number;
  size?: number;
  gravDelay?: number; // seconds of straight flight before gravity kicks in
  drips?: boolean; // leaves droplets that paint the floor below the path
  falloff?: number; // damage multiplier at max age
  /** burst on impact: splash damage from max (center) to min (edge) */
  explode?: { radius: number; max: number; min: number } | null;
  /** burst in mid-air after this many seconds (blasters) */
  maxAge?: number;
}

interface Proj extends Required<ProjOpts> {
  age: number;
  dripT: number;
}

const MAX_PER_TEAM = 800;
const dummy = new THREE.Object3D();
const seg = new THREE.Vector3();
const tmp = new THREE.Vector3();
const chest = new THREE.Vector3();

export class Projectiles {
  private list: Proj[] = [];
  private meshes: [THREE.InstancedMesh, THREE.InstancedMesh];

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1, 12, 10);
    this.meshes = [0, 1].map(() => {
      const m = new THREE.InstancedMesh(
        geo,
        new THREE.MeshPhysicalMaterial({ roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, emissiveIntensity: 0.25 }),
        MAX_PER_TEAM,
      );
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = true;
      scene.add(m);
      return m;
    }) as unknown as [THREE.InstancedMesh, THREE.InstancedMesh];
  }

  setColors(a: string, b: string) {
    for (const [i, c] of [a, b].entries()) {
      const mat = this.meshes[i].material as THREE.MeshPhysicalMaterial;
      mat.color.set(c);
      mat.emissive.set(c);
    }
  }

  spawn(o: ProjOpts) {
    this.list.push({ size: 0.16, gravDelay: 0.1, drips: false, falloff: 0.5, explode: null, maxAge: 3, ...o, pos: o.pos.clone(), vel: o.vel.clone(), age: 0, dripT: 0 });
  }

  clear() {
    this.list.length = 0;
  }

  dispose(scene: THREE.Scene) {
    this.clear();
    for (const m of this.meshes) {
      scene.remove(m);
      (m.material as THREE.Material).dispose();
    }
  }

  update(dt: number, ctx: GameCtx) {
    const counts = [0, 0];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age > p.gravDelay) p.vel.y -= 26 * dt;
      // a bit of drag so shots arc down like ink, not bullets
      if (p.age > p.gravDelay) p.vel.multiplyScalar(1 - Math.min(0.9, dt * 1.6));
      seg.copy(p.vel).multiplyScalar(dt);
      const len = seg.length();
      const dir = tmp.copy(seg).divideScalar(len || 1);
      let remove = false;

      // characters first
      if (p.damage > 0 || p.explode) {
        const hitC = this.hitCharacter(p, dir, len, ctx.characters);
        if (hitC) {
          const fall = THREE.MathUtils.lerp(1, p.falloff, Math.min(1, p.age / 0.6));
          if (p.damage > 0) ctx.damage(hitC, p.damage * fall, p.owner);
          ctx.effects.burst(p.pos, null, ctx.colorOf(p.team), 7, 4, 0.07);
          if (p.explode) ctx.explode(p.pos, p.explode.radius, p.explode.max, p.explode.min, p.team, p.owner, p.damage > 0 ? hitC : undefined);
          remove = true;
        }
      }
      // enemy Shell Shields swallow shots
      if (!remove && ctx.gadgets.blocks(p.pos, seg, p.team)) {
        ctx.effects.burst(p.pos, null, ctx.colorOf(p.team), 3, 2, 0.05);
        remove = true;
      }
      if (!remove) {
        const hit = ctx.physics.raycast(p.pos, dir, len + p.size * 0.5);
        if (hit) {
          if (p.explode) ctx.explode(hit.point, p.explode.radius, p.explode.max, p.explode.min, p.team, p.owner);
          else if (hit.inkable) ctx.paintBy(p.owner, InkSystem.pattern(hit.point, hit.normal, p.paintR, p.paintR > 0.5 ? 6 : 3));
          ctx.effects.burst(hit.point, hit.normal, ctx.colorOf(p.team), p.paintR > 0.5 ? 6 : 2, 3.5, 0.06);
          if (p.paintR > 0.5 && ctx.listener.distanceTo(hit.point) < 30) ctx.sfx.splat(ctx.listener.distanceTo(hit.point));
          remove = true;
        } else {
          p.pos.add(seg);
        }
      }
      if (!remove && p.drips) {
        p.dripT -= dt;
        if (p.dripT <= 0) {
          p.dripT = 0.07;
          this.list.push({
            ...p, vel: new THREE.Vector3(0, -2, 0), pos: p.pos.clone(), damage: 0, paintR: 0.38, size: 0.07,
            drips: false, gravDelay: 0, age: 0, dripT: 0, explode: null,
          });
        }
      }
      if (!remove && p.explode && p.age > p.maxAge) {
        ctx.explode(p.pos, p.explode.radius, p.explode.max, p.explode.min, p.team, p.owner);
        remove = true;
      }
      if (p.age > 3 || p.pos.y < -45) remove = true;
      if (remove) {
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
        continue;
      }
      const mesh = this.meshes[p.team];
      const n = counts[p.team]++;
      if (n < MAX_PER_TEAM) {
        dummy.position.copy(p.pos);
        const sp = p.vel.length();
        dummy.scale.set(p.size, p.size, p.size * (1 + Math.min(1.2, sp * 0.03)));
        if (sp > 0.01) dummy.lookAt(tmp.copy(p.pos).add(p.vel));
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
      }
    }
    for (const t of [0, 1] as const) {
      this.meshes[t].count = Math.min(MAX_PER_TEAM, counts[t]);
      this.meshes[t].instanceMatrix.needsUpdate = true;
    }
  }

  private hitCharacter(p: Proj, dir: THREE.Vector3, len: number, chars: Character[]): Character | null {
    let best: Character | null = null;
    let bestT = len;
    for (const c of chars) {
      if (!c.alive || c.team === p.team) continue;
      c.chestPoint(chest);
      const r = c.hitRadius() + p.size * 0.5;
      // segment-sphere
      const m = chest.sub(p.pos);
      const b = m.dot(dir);
      const cc = m.lengthSq() - r * r;
      if (cc > 0 && b < 0) continue;
      const disc = b * b - cc;
      if (disc < 0) continue;
      const t = Math.max(0, b - Math.sqrt(disc));
      if (t <= bestT) {
        bestT = t;
        best = c;
      }
    }
    return best;
  }
}
