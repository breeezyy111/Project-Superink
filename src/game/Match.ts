import * as THREE from 'three';
import { INK_PAIRS, InkPair, MATCH_SECONDS, RESPAWN_SECONDS, TEAM_SIZE, Team } from '../config';
import { InkSystem } from '../ink/InkSystem';
import type { Sfx } from '../audio/Sfx';
import type { Renderer } from '../engine/Renderer';
import type { Physics } from '../world/Physics';
import type { SkateparkMap } from '../world/SkateparkMap';
import { Bot } from './Bot';
import { Character } from './Character';
import { Effects } from './Effects';
import { EYE_COLORS, Look, SHIRT_COLORS, SKIN_TONES } from './InkfinModel';
import type { PlayerController } from './PlayerController';
import { Projectiles } from './Projectiles';
import type { GameCtx } from './types';
import type { WeaponKind } from './weapons';

export type Phase = 'intro' | 'countdown' | 'play' | 'finish' | 'done';

export interface MatchEvents {
  onFeed(text: string, kind: 'good' | 'bad' | 'info'): void;
  onPlayerSplatted(by: string): void;
  onPlayerRespawn(): void;
  onHitMarker(): void;
  onPhase(p: Phase): void;
}

const BOT_NAMES = [
  'Squidge', 'Frilly', 'Nautia', 'Cuddle', 'Sepi', 'Murk', 'Zebra', 'Bubbs',
  'Fizzy', 'Ruffle', 'Wiggs', 'Coral', 'Drip', 'Skeet', 'Tako', 'Pip',
];
const WEAPON_POOL: WeaponKind[] = ['shooter', 'shooter', 'roller', 'charger'];

function randomLook(): Look {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return {
    skin: pick(SKIN_TONES),
    hair: Math.floor(Math.random() * 3) as Look['hair'],
    eyes: pick(EYE_COLORS),
    shirt: pick(SHIRT_COLORS),
    shoes: pick(['#ffffff', '#222222', '#ffd23f', '#ff5c8a']),
  };
}

export class Match implements GameCtx {
  characters: Character[] = [];
  bots: Bot[] = [];
  player!: Character;
  projectiles: Projectiles;
  effects: Effects;
  listener = new THREE.Vector3();
  pair: InkPair;
  phase: Phase = 'intro';
  timeLeft = MATCH_SECONDS;
  phaseT = 0;
  private lastBeep = 99;

  constructor(
    private r: Renderer,
    readonly physics: Physics,
    readonly ink: InkSystem,
    readonly map: SkateparkMap,
    readonly sfx: Sfx,
    private controller: PlayerController | null,
    private events: MatchEvents,
    opts: { look: Look; weapon: WeaponKind; name: string; demo?: boolean },
  ) {
    this.pair = INK_PAIRS[Math.floor(Math.random() * INK_PAIRS.length)];
    ink.setColors(this.pair.alpha, this.pair.bravo);
    ink.reset();
    this.projectiles = new Projectiles(r.scene);
    this.projectiles.setColors(this.pair.alpha, this.pair.bravo);
    this.effects = new Effects(r.scene);

    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let t = 0 as Team; t <= 1; t = (t + 1) as Team) {
      for (let i = 0; i < TEAM_SIZE; i++) {
        const isPlayer = t === 0 && i === 0;
        const ch = new Character(
          isPlayer ? opts.name : names.pop()!,
          t,
          isPlayer,
          isPlayer ? opts.look : randomLook(),
          isPlayer ? opts.weapon : WEAPON_POOL[(i + t) % WEAPON_POOL.length],
          this,
          r.scene,
        );
        this.characters.push(ch);
        if (isPlayer) this.player = ch;
        if (!isPlayer || opts.demo) this.bots.push(new Bot(ch, this, map.info, isPlayer ? 0.8 : 0.45 + Math.random() * 0.35));
      }
    }
    this.spawnAll();
    this.setPhase('intro');
  }

  colorOf(team: Team) {
    return team === 0 ? this.pair.alpha : this.pair.bravo;
  }

  private spawnAll() {
    for (const t of [0, 1] as Team[]) {
      const list = this.characters.filter((c) => c.team === t);
      list.forEach((c, i) => c.spawn(this.map.info.spawns[t][i], this.map.info.spawnYaw[t]));
    }
    this.controller?.reset(this.map.info.spawnYaw[0]);
    this.controller?.snapCamera(this.player);
    for (const b of this.bots) b.reset();
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
    this.events.onPhase(p);
  }

  damage(target: Character, amount: number, attacker: Character) {
    if (!target.alive || target.team === attacker.team) return;
    const died = target.hurt(amount, attacker);
    if (attacker.isPlayer) {
      this.events.onHitMarker();
      this.sfx.hit();
    }
    if (target.isPlayer) this.sfx.hurt();
    if (died) this.splat(target, attacker);
  }

  private splat(target: Character, attacker: Character | null) {
    const color = attacker ? this.colorOf(attacker.team) : this.colorOf(target.team === 0 ? 1 : 0);
    const center = target.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
    this.effects.burst(center, null, color, 50, 9, 0.14);
    // a big splat of the attacker's ink where they fell
    const hit = this.physics.raycast(center, new THREE.Vector3(0, -1, 0), 4);
    if (hit && hit.inkable && attacker) this.ink.paint(InkSystem.pattern(hit.point, hit.normal, 1.6, 8), attacker.team);
    target.die(RESPAWN_SECONDS);
    if (attacker) attacker.splats++;
    this.sfx.splatted(this.listener.distanceTo(center), target.isPlayer || attacker?.isPlayer === true);
    const by = attacker ? attacker.name : 'the abyss';
    if (target.isPlayer) {
      this.events.onPlayerSplatted(by);
    } else if (attacker?.isPlayer) {
      this.events.onFeed(`You splatted ${target.name}!`, 'good');
    } else {
      this.events.onFeed(`${by} splatted ${target.name}`, target.team === 0 ? 'bad' : 'info');
    }
  }

  update(dt: number) {
    this.phaseT += dt;
    const playing = this.phase === 'play';
    const frozen = this.phase === 'finish' || this.phase === 'done';

    if (this.phase === 'intro' && this.phaseT > 1.2) this.setPhase('countdown');
    if (this.phase === 'countdown') {
      const n = Math.ceil(3 - this.phaseT);
      if (n !== this.lastBeep && n > 0) {
        this.lastBeep = n;
        this.sfx.beep(false);
      }
      if (this.phaseT >= 3) {
        this.sfx.beep(true);
        this.setPhase('play');
      }
    }
    if (playing) {
      const before = this.timeLeft;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (Math.ceil(before) !== Math.ceil(this.timeLeft) && this.timeLeft <= 10 && this.timeLeft > 0) this.sfx.beep(false);
      if (this.timeLeft <= 0) {
        this.sfx.whistle();
        this.setPhase('finish');
      }
    }
    if (this.phase === 'finish' && this.phaseT > 2.6) this.setPhase('done');

    // inputs
    if (this.controller && !this.bots.some((b) => b.ch === this.player)) {
      this.controller.enabled = playing && this.player.alive;
      this.controller.update(dt, this.player, this.r.camera, this.physics);
    }
    for (const b of this.bots) {
      if (playing) b.update(dt);
      else {
        b.ch.input.fire = false;
        b.ch.input.move.set(0, 0);
        b.ch.input.swim = false;
      }
    }
    if (!playing) this.player.input.fire = false;
    this.listener.copy(this.player.pos);

    if (!frozen) {
      for (const c of this.characters) {
        c.update(dt);
        if (c.alive && c.pos.y < this.map.info.killY) this.splat(c, null);
        if (!c.alive && c.respawnT <= 0 && playing) {
          const t = c.team;
          const i = this.characters.filter((x) => x.team === t).indexOf(c);
          c.spawn(this.map.info.spawns[t][i], this.map.info.spawnYaw[t]);
          if (c.isPlayer) {
            this.controller?.reset(this.map.info.spawnYaw[t]);
            this.controller?.snapCamera(c);
            this.sfx.respawn();
            this.events.onPlayerRespawn();
          }
        }
      }
      this.physics.step();
      this.projectiles.update(dt, this);
    }
    this.effects.update(dt);
    this.ink.flush();
  }

  /** Camera used when the player isn't driving (intro, demo, splatted). */
  spectate(dt: number, cam: THREE.PerspectiveCamera) {
    const p = this.player;
    if (this.phase === 'intro' || this.phase === 'countdown') {
      // sweeping fly-in to the spawn
      const t = Math.min(1, (this.phaseT + (this.phase === 'countdown' ? 1.2 : 0)) / 4.2);
      const e = 1 - (1 - t) ** 3;
      const from = new THREE.Vector3(18, 22, 10);
      const sp = this.map.info.spawns[0][0];
      const back = this.map.info.spawnYaw[0] === 0 ? -1 : 1;
      const to = new THREE.Vector3(sp.x - 0.55, sp.y + 2.1, sp.z + back * 3.2);
      cam.position.lerpVectors(from, to, e);
      cam.lookAt(new THREE.Vector3(0, 1, 0).lerp(sp.clone().add(new THREE.Vector3(0, 1.6, 6)), e));
      return true;
    }
    if (!p.alive) {
      // look at where you were splatted from above
      const target = p.lastAttacker?.alive ? p.lastAttacker.pos : p.pos;
      const want = p.pos.clone().add(new THREE.Vector3(0, 9, -7));
      cam.position.lerp(want, Math.min(1, dt * 2));
      cam.lookAt(target);
      return true;
    }
    void dt;
    return false;
  }

  dispose() {
    for (const c of this.characters) c.dispose(this.r.scene);
    this.projectiles.dispose(this.r.scene);
    this.effects.dispose();
  }
}
