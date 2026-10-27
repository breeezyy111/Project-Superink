import * as THREE from 'three';
import type { InkPair, Team } from '../config';
import type { Sfx } from '../audio/Sfx';
import type { Renderer } from '../engine/Renderer';
import { InkSystem } from '../ink/InkSystem';
import type { Stage } from '../world/Stage';
import { Bot } from '../game/Bot';
import { Character } from '../game/Character';
import type { Look } from '../game/InkfinModel';
import { Kit, kit as kitById } from '../game/items';
import { randomLook } from '../game/Match';
import type { PlayerController } from '../game/PlayerController';
import { InkWorld } from '../game/World';
import { cheats } from '../game/cheats';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { LevelDef } from './levels';
import { checkpointModel, drGloopModel, gloopieModel, orbModel, padModel } from './models';

/** Story mode uses one fixed pair: your ink vs Dr. Gloop's purple goo. */
export const STORY_PAIR: InkPair = { name: 'Hero vs Gloop', alpha: '#ffd23f', bravo: '#9b3cff' };
const RESPAWN = 2.2;

export interface StoryEvents {
  onFeed(text: string, kind: 'good' | 'bad' | 'info'): void;
  onPlayerSplatted(by: string): void;
  onPlayerRespawn(): void;
  onHitMarker(): void;
  onHint(text: string): void;
  onCheckpoint(): void;
  /** boss health 0..1 (null hides the bar) */
  onBoss(frac: number | null): void;
  onComplete(stats: { time: number; deaths: number; splats: number }): void;
}

const V = (p: [number, number, number]) => new THREE.Vector3(p[0], p[1], p[2]);

/** A Gloopie turret: a Character so shots, bombs and damage all just work. */
class Gloopie extends Character {
  hitRadius() {
    return 0.85;
  }
  chestPoint(out: THREE.Vector3) {
    return out.copy(this.pos).add(new THREE.Vector3(0, 0.65, 0));
  }
}

/** Dr. Gloop in the Gloopmobile: only the open core takes damage. */
class GloopBoss extends Character {
  stunned = false;
  private hitCd = 0;
  onBlocked: () => void = () => {};
  hitRadius() {
    return 2.3;
  }
  update(dt: number) {
    this.hitCd -= dt;
    super.update(dt);
  }
  chestPoint(out: THREE.Vector3) {
    return out.copy(this.pos).add(new THREE.Vector3(0, 1.6, 0));
  }
  hurt(amount: number, attacker: Character) {
    if (!this.alive) return false;
    if (!this.stunned) {
      this.onBlocked();
      return false;
    }
    // one hit at a time (a roller pressed against him would otherwise hit every frame)
    if (this.hitCd > 0) return false;
    this.hitCd = 0.06;
    return super.hurt(Math.min(60, amount) * 0.03, attacker);
  }
}

interface Turret {
  ch: Gloopie;
  model: ReturnType<typeof gloopieModel>;
  weapon: 'shooter' | 'blaster' | 'charger';
  t: number;
  dead: number;
}

interface Mover {
  mesh: THREE.Mesh;
  collider: RAPIER.Collider;
  a: THREE.Vector3;
  b: THREE.Vector3;
  half: THREE.Vector3;
  speed: number;
  t: number;
  dir: number;
  top: THREE.Vector3;
}

export class StoryRun extends InkWorld {
  player: Character;
  pair = STORY_PAIR;
  phase: 'intro' | 'play' | 'done' = 'play';
  /** for the HUD: story has no clock or objective */
  timeLeft = 0;
  overtime = false;
  objective = null;
  tower = null;
  zones = null;
  mode = 'turf' as const;
  elapsed = 0;
  private turrets: Turret[] = [];
  private bots: Bot[] = [];
  private movers: Mover[] = [];
  private pads: { pos: THREE.Vector3; power: number; model: ReturnType<typeof padModel>; squash: number }[] = [];
  private checkpoints: { pos: THREE.Vector3; model: ReturnType<typeof checkpointModel>; on: boolean }[] = [];
  private hints: { pos: THREE.Vector3; r: number; text: string; shown: boolean }[] = [];
  private respawnAt: THREE.Vector3;
  private goal: { pos: THREE.Vector3; model: ReturnType<typeof orbModel> } | null = null;
  private splats = 0;
  private deaths = 0;
  private boss: { ch: GloopBoss; model: ReturnType<typeof drGloopModel>; state: string; t: number; air: boolean; leaps: number; volleyT: number } | null = null;
  private group = new THREE.Group();
  private shake = 0;

  constructor(
    private r: Renderer,
    stage: Stage,
    sfx: Sfx,
    private controller: PlayerController,
    readonly level: LevelDef,
    private events: StoryEvents,
    opts: { look: Look; kit: Kit; name: string },
  ) {
    super(r.scene, stage, sfx);
    this.ink.setColors(this.pair.alpha, this.pair.bravo);
    this.ink.reset();
    this.projectiles.setColors(this.pair.alpha, this.pair.bravo);
    r.scene.add(this.group);

    this.player = new Character(opts.name, 0, true, opts.look, opts.kit, this, r.scene);
    this.characters.push(this.player);
    this.respawnAt = V(level.spawn).add(new THREE.Vector3(0, 0.1, 0));
    this.player.spawn(this.respawnAt, 0);
    controller.reset(0);
    controller.snapCamera(this.player);

    // Gloop's goo already covers parts of the level
    for (const [x, y, z, rad] of level.enemyInk ?? []) {
      this.ink.paint(InkSystem.pattern(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0), rad, 7), 1);
    }

    const kitFor = { shooter: 'kit_fizz', blaster: 'kit_boom', charger: 'kit_charger' } as const;
    for (const t of level.turrets ?? []) {
      const ch = new Gloopie('Gloopie', 1, false, randomLook(), kitById(kitFor[t.weapon]), this, r.scene);
      ch.regen = false;
      ch.spawn(V(t.at).add(new THREE.Vector3(0, 0.1, 0)), Math.PI);
      ch.model.root.visible = false;
      this.characters.push(ch);
      const model = gloopieModel(this.pair.bravo);
      this.group.add(model.root);
      this.turrets.push({ ch, model, weapon: t.weapon, t: Math.random() * 2, dead: 0 });
    }
    for (const t of level.troopers ?? []) {
      const ch = new Character('Hypno Inkfin', 1, false, randomLook(), kitById(t.kit), this, r.scene);
      ch.regen = false;
      ch.spawn(V(t.at).add(new THREE.Vector3(0, 0.1, 0)), Math.PI);
      this.characters.push(ch);
      const b = new Bot(ch, this, stage.info, 0.35);
      b.reset();
      this.bots.push(b);
    }
    for (const p of level.pads ?? []) {
      const model = padModel(this.pair.alpha);
      model.root.position.copy(V(p.at));
      this.group.add(model.root);
      this.physics.addCylinder(V(p.at).add(new THREE.Vector3(0, 0.15, 0)), new THREE.Quaternion(), 0.15, 1.1, model.root);
      this.pads.push({ pos: V(p.at), power: p.power, model, squash: 0 });
    }
    for (const m of level.movers ?? []) {
      const half = new THREE.Vector3(m.size[0] / 2, 0.3, m.size[1] / 2);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(m.size[0], 0.6, m.size[1]),
        new THREE.MeshPhysicalMaterial({ color: '#ffe14a', roughness: 0.3, clearcoat: 0.7 }),
      );
      mesh.castShadow = mesh.receiveShadow = true;
      const stripes = new THREE.Mesh(
        new THREE.BoxGeometry(m.size[0] + 0.02, 0.18, m.size[1] + 0.02),
        new THREE.MeshStandardMaterial({ color: '#2a2438' }),
      );
      stripes.position.y = -0.2;
      mesh.add(stripes);
      this.group.add(mesh);
      const a = V(m.from), b = V(m.to);
      const collider = this.physics.addBox(a.clone().setY(a.y - 0.3), new THREE.Quaternion(), half, mesh, false);
      this.movers.push({ mesh, collider, a, b, half, speed: m.speed, t: 0, dir: 1, top: a.clone() });
    }
    for (const c of level.checkpoints ?? []) {
      const model = checkpointModel();
      model.root.position.copy(V(c)).add(new THREE.Vector3(1.6, 0, 0));
      this.group.add(model.root);
      this.checkpoints.push({ pos: V(c), model, on: false });
    }
    for (const h of level.hints ?? []) this.hints.push({ pos: V(h.at), r: h.r, text: h.text, shown: false });

    if (level.boss) this.spawnBoss();
    else this.placeGoal(V(level.goal));
    this.updateMovers(0);
  }

  colorOf(team: Team) {
    return team === 0 ? this.pair.alpha : this.pair.bravo;
  }

  private placeGoal(p: THREE.Vector3) {
    const model = orbModel(!!this.level.boss);
    model.root.position.copy(p).add(new THREE.Vector3(0, 1.3, 0));
    this.group.add(model.root);
    this.goal = { pos: p, model };
  }

  private spawnBoss() {
    const ch = new GloopBoss('Dr. Gloop', 1, false, randomLook(), kitById('kit_boom'), this, this.r.scene);
    ch.regen = false;
    ch.spawn(new THREE.Vector3(0, 0.1, 6), Math.PI);
    ch.model.root.visible = false;
    ch.onBlocked = () => {
      if (Math.random() < 0.3) this.effects.burst(ch.chestPoint(new THREE.Vector3()), null, '#ffffff', 4, 4, 0.06);
    };
    this.characters.push(ch);
    const model = drGloopModel();
    this.group.add(model.root);
    this.boss = { ch, model, state: 'volley', t: 2.5, air: false, leaps: 0, volleyT: 0 };
    this.events.onBoss(1);
  }

  /** Enemies hit a bit softer than in a real battle: it's you against the whole lair. */
  damage(target: Character, amount: number, attacker: Character) {
    if (attacker.team === 1 && attacker !== this.boss?.ch) amount *= attacker instanceof Gloopie ? 0.6 : 0.7;
    super.damage(target, amount, attacker);
  }

  protected onHit(target: Character, attacker: Character, died: boolean) {
    if (attacker.isPlayer) {
      this.events.onHitMarker();
      this.sfx.hit();
    }
    if (target.isPlayer) this.sfx.hurt();
    if (died) this.splat(target, attacker);
  }

  private splat(target: Character, attacker: Character | null) {
    const color = this.colorOf(target.team === 0 ? 1 : 0);
    const center = target.chestPoint(new THREE.Vector3());
    this.effects.burst(center, null, color, 50, 9, 0.14);
    const hit = this.physics.raycast(center, new THREE.Vector3(0, -1, 0), 4);
    if (hit && hit.inkable) this.ink.paint(InkSystem.pattern(hit.point, hit.normal, 1.6, 8), target.team === 0 ? 1 : 0);
    this.sfx.splatted(this.listener.distanceTo(center), true);
    if (target.isPlayer) {
      target.die(RESPAWN);
      this.deaths++;
      this.events.onPlayerSplatted(attacker ? attacker.name : 'the goo');
      return;
    }
    target.die(1e9);
    this.splats++;
    if (target === this.boss?.ch) this.bossDown();
    else this.events.onFeed(target instanceof Gloopie ? 'Gloopie popped!' : `${target.name} snapped out of it!`, 'good');
  }

  private bossDown() {
    const b = this.boss!;
    this.events.onBoss(null);
    this.events.onFeed('Dr. Gloop is beaten! Grab the Great Ink Orb!', 'good');
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.effects.burst(b.ch.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4)), null, this.pair.alpha, 30, 10, 0.16), i * 180);
    }
    this.sfx.boom(0);
    b.model.root.visible = false;
    this.placeGoal(b.ch.pos.clone().setY(0));
    this.shake = 0.8;
  }

  // ---------- update ----------
  update(dt: number) {
    const p = this.player;
    const playing = this.phase === 'play';
    if (playing) this.elapsed += dt;
    this.controller.enabled = playing && p.alive;
    this.controller.update(dt, p, this.r.camera, this.physics);
    if (!playing) {
      p.input.fire = false;
      p.input.move.set(0, 0);
    }
    this.listener.copy(p.pos);

    this.updateMovers(dt);
    this.updatePads(dt);
    const frozen = cheats.freezeBots;
    for (const t of this.turrets) {
      this.turretBrain(t, dt);
      if (frozen) t.ch.input.fire = false;
    }
    for (const b of this.bots) {
      if (playing && !frozen && b.ch.alive && b.ch.pos.distanceTo(p.pos) < 26) b.update(dt);
      else b.idle();
    }
    if (this.boss && !frozen) this.bossBrain(dt);

    // falling into the goo
    for (const c of this.characters) {
      if (c.alive && c.pos.y < this.stage.info.killY) this.splat(c, null);
    }
    if (!p.alive && p.respawnT <= 0) {
      p.spawn(this.respawnAt, 0);
      this.controller.reset(0);
      this.controller.snapCamera(p);
      this.sfx.respawn();
      this.events.onPlayerRespawn();
    }
    // checkpoints + hints
    for (const c of this.checkpoints) {
      if (!c.on && p.alive && c.pos.distanceTo(p.pos) < 3) {
        c.on = true;
        c.model.flagMat.color.set(this.pair.alpha);
        this.respawnAt = c.pos.clone().add(new THREE.Vector3(0, 0.1, 0));
        this.sfx.specialReady();
        this.events.onCheckpoint();
      }
      c.model.flag.rotation.y = Math.sin(performance.now() / 300 + c.pos.z) * 0.25;
    }
    for (const h of this.hints) {
      if (!h.shown && p.alive && h.pos.distanceTo(p.pos) < h.r) {
        h.shown = true;
        this.events.onHint(h.text);
      }
    }
    // goal
    if (this.goal) {
      const g = this.goal.model;
      g.root.rotation.y += dt * 1.2;
      g.orb.position.y = Math.sin(performance.now() / 400) * 0.15;
      g.halo.rotation.z += dt;
      if (playing && p.alive && this.goal.pos.distanceTo(p.pos) < 1.8) {
        this.phase = 'done';
        this.sfx.whistle();
        this.sfx.coin();
        this.effects.burst(this.goal.pos.clone().setY(this.goal.pos.y + 1.3), null, '#5ff0d0', 60, 10, 0.16);
        g.root.visible = false;
        this.events.onComplete({ time: this.elapsed, deaths: this.deaths, splats: this.splats });
      }
    }
    // only the player and the troopers need ink refills; turrets never run dry
    for (const t of this.turrets) t.ch.ink = 100;
    this.simulate(dt, true);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.r.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
    }
  }

  private updateMovers(dt: number) {
    for (const m of this.movers) {
      const len = Math.max(0.01, m.a.distanceTo(m.b));
      m.t += (dt * m.speed * m.dir) / len;
      if (m.t >= 1) {
        m.t = 1;
        m.dir = -1;
      } else if (m.t <= 0) {
        m.t = 0;
        m.dir = 1;
      }
      // ease at the ends so it doesn't jerk riders around
      const e = 0.5 - 0.5 * Math.cos(m.t * Math.PI);
      const top = m.a.clone().lerp(m.b, e);
      const d = top.clone().sub(m.top);
      // carry anyone standing on it
      for (const c of this.characters) {
        if (!c.alive) continue;
        const dx = Math.abs(c.pos.x - m.top.x), dz = Math.abs(c.pos.z - m.top.z);
        if (dx < m.half.x + 0.2 && dz < m.half.z + 0.2 && Math.abs(c.pos.y - m.top.y) < 0.45) c.carry(d);
      }
      m.top.copy(top);
      m.mesh.position.copy(top).setY(top.y - 0.3);
      m.collider.setTranslation({ x: top.x, y: top.y - 0.3, z: top.z });
    }
  }

  private updatePads(dt: number) {
    const p = this.player;
    for (const pad of this.pads) {
      pad.squash = Math.max(0, pad.squash - dt * 4);
      pad.model.top.scale.y = 1 - pad.squash * 0.6;
      pad.model.arrow.position.y = 1.0 + Math.sin(performance.now() / 250) * 0.15;
      if (!p.alive) continue;
      const dx = p.pos.x - pad.pos.x, dz = p.pos.z - pad.pos.z;
      if (dx * dx + dz * dz < 1.1 && Math.abs(p.pos.y - (pad.pos.y + 0.3)) < 0.5 && p.vel.y <= 1) {
        p.vel.y = pad.power;
        // a forward boost in the direction you're heading
        const mv = p.input.move;
        p.vel.x += mv.x * 6;
        p.vel.z += mv.y * 6;
        p.grounded = false;
        p.model.stretch();
        pad.squash = 1;
        this.sfx.jump();
        this.effects.burst(pad.pos.clone().setY(pad.pos.y + 0.4), new THREE.Vector3(0, 1, 0), this.pair.alpha, 14, 6, 0.08);
      }
    }
  }

  private canSee(from: THREE.Vector3, to: THREE.Vector3) {
    const d = to.clone().sub(from);
    const dist = d.length();
    return !this.physics.raycast(from, d.divideScalar(dist), dist - 0.3);
  }

  private turretBrain(t: Turret, dt: number) {
    const ch = t.ch, m = t.model;
    if (!ch.alive) {
      t.dead = Math.min(1, t.dead + dt * 5);
      m.root.scale.setScalar(Math.max(0.001, 1 - t.dead));
      if (t.dead >= 1) m.root.visible = false;
      return;
    }
    const p = this.player;
    ch.input.move.set(0, 0);
    m.root.position.copy(ch.pos);
    const wob = Math.sin(performance.now() / 260 + ch.pos.x) * 0.05;
    m.body.scale.set(1 + wob, 1 - wob, 1 + wob);
    const range = t.weapon === 'charger' ? 34 : t.weapon === 'blaster' ? 20 : 18;
    const eye = ch.chestPoint(new THREE.Vector3());
    const target = p.chestPoint(new THREE.Vector3());
    const dist = eye.distanceTo(target);
    const sees = this.phase === 'play' && p.alive && dist < range && !(p.submerged && dist > 5) && this.canSee(eye, target);
    if (sees) {
      // lead a moving target a little (and miss a bit: they're blobs)
      const aim = target.clone().addScaledVector(p.vel, dist / 40).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4, 0));
      ch.input.aimPoint.copy(aim);
      const d = aim.clone().sub(eye);
      ch.input.aimYaw = Math.atan2(d.x, d.z);
      ch.input.aimPitch = Math.asin(THREE.MathUtils.clamp(d.y / d.length(), -1, 1));
      m.root.rotation.y += ((ch.input.aimYaw - m.root.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 6);
    }
    t.t += dt;
    if (t.weapon === 'charger') {
      // hold to charge, let go to snipe
      ch.input.fire = sees && t.t % 3 < 1.6;
    } else {
      const cycle = t.weapon === 'blaster' ? 3 : 2.6;
      ch.input.fire = sees && t.t % cycle < (t.weapon === 'blaster' ? 1.4 : 1.1);
    }
  }

  private bossBrain(dt: number) {
    const b = this.boss!;
    const ch = b.ch;
    const m = b.model;
    if (!ch.alive) return;
    const p = this.player;
    m.root.position.copy(ch.pos);
    const phase = ch.hp > 66 ? 1 : ch.hp > 33 ? 2 : 3;
    this.events.onBoss(ch.hp / 100);
    const toP = p.pos.clone().sub(ch.pos).setY(0);
    const yaw = Math.atan2(toP.x, toP.z);
    if (b.state !== 'stunned') m.root.rotation.y += ((yaw - m.root.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 3);
    ch.input.fire = false;
    ch.input.move.set(0, 0);
    const playing = this.phase === 'play' && p.alive;
    b.t -= dt;
    // little stompy walk + hover bob
    const tt = performance.now() / 1000;
    m.legs.forEach((leg, i) => (leg.rotation.x = b.state === 'chase' ? Math.sin(tt * 8 + i * Math.PI * 0.5) * 0.4 : 0));
    m.mobile.position.y = Math.sin(tt * 2) * 0.08;
    m.slug.rotation.z = Math.sin(tt * 3) * 0.06;

    switch (b.state) {
      case 'volley': {
        if (!playing) break;
        b.volleyT -= dt;
        if (b.volleyT <= 0) {
          b.volleyT = phase === 3 ? 0.22 : phase === 2 ? 0.28 : 0.36;
          const fwd = new THREE.Vector3(Math.sin(m.root.rotation.y), 0, Math.cos(m.root.rotation.y));
          const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
          const side = Math.random() < 0.5 ? -1 : 1;
          const muzzle = ch.pos.clone().addScaledVector(fwd, 1.9).addScaledVector(right, 1.7 * side).setY(ch.pos.y + 1.6);
          const aim = p.chestPoint(new THREE.Vector3()).addScaledVector(p.vel, 0.4);
          const dir = aim.sub(muzzle).normalize();
          for (const s of [-0.12, 0, 0.12]) {
            const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s);
            this.projectiles.spawn({ pos: muzzle, vel: d.multiplyScalar(26), team: 1, owner: ch, damage: 28, paintR: 0.9, size: 0.3, gravDelay: 0.15, falloff: 0.6 });
          }
          // later phases also lob big goo bombs
          if (phase >= 2 && Math.random() < 0.3) {
            const lob = p.pos.clone().sub(muzzle);
            const tFly = 1.1;
            const v = new THREE.Vector3(lob.x / tFly, (lob.y + 0.5 * 24 * tFly * tFly * 0.5) / tFly, lob.z / tFly);
            this.projectiles.spawn({ pos: muzzle, vel: v, team: 1, owner: ch, damage: 0, paintR: 1.4, size: 0.5, gravDelay: 0, falloff: 1, explode: { radius: 3, max: 90, min: 30 }, maxAge: 2.5 });
          }
          this.sfx.shoot(this.listener.distanceTo(muzzle), false);
        }
        if (b.t <= 0) {
          b.state = 'chase';
          b.t = 1.8;
        }
        break;
      }
      case 'chase':
        if (playing) ch.input.move.set(toP.x, toP.z).normalize().multiplyScalar(0.8);
        if (b.t <= 0 && ch.grounded) {
          // leap at the player and slam down
          b.state = 'leap';
          b.air = true;
          const dist = Math.min(14, toP.length());
          const air = 1.1;
          const dir = toP.normalize();
          ch.vel.set(dir.x * (dist / air), 13, dir.z * (dist / air));
          ch.grounded = false;
          this.sfx.special(this.listener.distanceTo(ch.pos), false);
        }
        break;
      case 'leap':
        if (ch.vel.y < 0 && ch.grounded) {
          this.explode(ch.pos.clone().setY(ch.pos.y + 0.3), 4.2, 90, 25, 1, ch, ch);
          this.shake = 0.5;
          b.leaps++;
          if (phase === 3 && b.leaps % 2 === 1) {
            b.state = 'chase';
            b.t = 0.6;
          } else {
            b.state = 'stunned';
            b.t = 4.5;
            ch.stunned = true;
            this.events.onFeed("He's dizzy! Shoot the glowing core!", 'info');
          }
        }
        break;
      case 'stunned': {
        // hatch flips open, core glows
        m.hatch.rotation.x = THREE.MathUtils.lerp(m.hatch.rotation.x, -Math.PI / 2 - 1.6, Math.min(1, dt * 8));
        m.coreMat.emissiveIntensity = 1.2 + Math.sin(tt * 12) * 0.5;
        m.slug.rotation.y += dt * 6;
        if (b.t <= 0) {
          ch.stunned = false;
          b.state = 'volley';
          b.t = phase === 3 ? 2.6 : 3.4;
        }
        break;
      }
    }
    if (b.state !== 'stunned') {
      m.hatch.rotation.x = THREE.MathUtils.lerp(m.hatch.rotation.x, -Math.PI / 2, Math.min(1, dt * 8));
      m.coreMat.emissiveIntensity = 0.6;
      m.slug.rotation.y = THREE.MathUtils.lerp(m.slug.rotation.y, 0, Math.min(1, dt * 4));
    }
  }

  /** Camera when splatted: hover above where you went down. */
  spectate(dt: number, cam: THREE.PerspectiveCamera) {
    const p = this.player;
    if (p.alive) return false;
    cam.position.lerp(p.pos.clone().add(new THREE.Vector3(0, 8, -7)), Math.min(1, dt * 2));
    cam.lookAt(p.pos);
    return true;
  }

  dispose() {
    this.r.scene.remove(this.group);
    this.events.onBoss(null);
    super.dispose();
  }
}
