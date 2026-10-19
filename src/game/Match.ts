import * as THREE from 'three';
import { INK_PAIRS, InkPair, MATCH_SECONDS, RESPAWN_SECONDS, TEAM_SIZE, Team } from '../config';
import { InkSystem } from '../ink/InkSystem';
import type { Sfx } from '../audio/Sfx';
import type { Renderer } from '../engine/Renderer';
import type { Stage } from '../world/Stage';
import { Bot } from './Bot';
import { Character } from './Character';
import { EYE_COLORS, Look, SKIN_TONES } from './InkfinModel';
import { gearIn, Kit, KITS } from './items';
import type { PlayerController } from './PlayerController';
import type { Difficulty } from './profile';
import { InkWorld } from './World';

export type Phase = 'intro' | 'countdown' | 'play' | 'finish' | 'done';

export interface MatchEvents {
  onFeed(text: string, kind: 'good' | 'bad' | 'info'): void;
  onPlayerSplatted(by: string): void;
  onPlayerRespawn(): void;
  onHitMarker(): void;
  onPhase(p: Phase): void;
}

export interface MatchSummary {
  win: boolean;
  turf: [number, number];
  paintedM2: number;
  splats: number;
  deaths: number;
}

const BOT_NAMES = [
  'Squidge', 'Frilly', 'Nautia', 'Cuddle', 'Sepi', 'Murk', 'Zebra', 'Bubbs',
  'Fizzy', 'Ruffle', 'Wiggs', 'Coral', 'Drip', 'Skeet', 'Tako', 'Pip',
];

const SKILL: Record<Difficulty, [number, number]> = { easy: [0.15, 0.35], normal: [0.45, 0.7], hard: [0.75, 0.95] };

export function randomLook(): Look {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return {
    skin: pick(SKIN_TONES),
    hair: Math.floor(Math.random() * 4) as Look['hair'],
    eyes: pick(EYE_COLORS),
    mark: Math.floor(Math.random() * 3) as Look['mark'],
    head: pick(gearIn('head')).id,
    clothes: pick(gearIn('clothes')).id,
    shoes: pick(gearIn('shoes')).id,
  };
}

export class Match extends InkWorld {
  bots: Bot[] = [];
  player!: Character;
  pair: InkPair;
  phase: Phase = 'intro';
  timeLeft = MATCH_SECONDS;
  phaseT = 0;
  private lastBeep = 99;

  constructor(
    private r: Renderer,
    stage: Stage,
    sfx: Sfx,
    private controller: PlayerController | null,
    private events: MatchEvents,
    opts: { look: Look; kit: Kit; name: string; demo?: boolean; difficulty: Difficulty },
  ) {
    super(r.scene, stage, sfx);
    this.pair = INK_PAIRS[Math.floor(Math.random() * INK_PAIRS.length)];
    this.ink.setColors(this.pair.alpha, this.pair.bravo);
    this.ink.reset();
    this.projectiles.setColors(this.pair.alpha, this.pair.bravo);

    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const [lo, hi] = SKILL[opts.difficulty];
    for (let t = 0 as Team; t <= 1; t = (t + 1) as Team) {
      for (let i = 0; i < TEAM_SIZE; i++) {
        const isPlayer = t === 0 && i === 0;
        const kit = isPlayer ? opts.kit : KITS[(i + t * 2 + Math.floor(Math.random() * 2)) % KITS.length];
        const ch = new Character(isPlayer ? opts.name : names.pop()!, t, isPlayer, isPlayer ? opts.look : randomLook(), kit, this, r.scene);
        this.characters.push(ch);
        if (isPlayer) this.player = ch;
        // allies are a touch weaker than enemies on each difficulty, so you matter
        const skill = isPlayer ? 0.8 : THREE.MathUtils.lerp(lo, hi, Math.random()) * (t === 0 ? 0.9 : 1);
        if (!isPlayer || opts.demo) this.bots.push(new Bot(ch, this, stage.info, skill));
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
      list.forEach((c, i) => c.spawn(this.stage.info.spawns[t][i % this.stage.info.spawns[t].length], this.stage.info.spawnYaw[t]));
    }
    this.controller?.reset(this.stage.info.spawnYaw[0]);
    this.controller?.snapCamera(this.player);
    for (const b of this.bots) b.reset();
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
    this.events.onPhase(p);
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
    const color = attacker ? this.colorOf(attacker.team) : this.colorOf(target.team === 0 ? 1 : 0);
    const center = target.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
    this.effects.burst(center, null, color, 50, 9, 0.14);
    const hit = this.physics.raycast(center, new THREE.Vector3(0, -1, 0), 4);
    if (hit && hit.inkable && attacker) this.ink.paint(InkSystem.pattern(hit.point, hit.normal, 1.6, 8), attacker.team);
    target.die(RESPAWN_SECONDS);
    if (attacker) attacker.splats++;
    this.sfx.splatted(this.listener.distanceTo(center), target.isPlayer || attacker?.isPlayer === true);
    const by = attacker ? attacker.name : 'the abyss';
    if (target.isPlayer) this.events.onPlayerSplatted(by);
    else if (attacker?.isPlayer) this.events.onFeed(`You splatted ${target.name}!`, 'good');
    else this.events.onFeed(`${by} splatted ${target.name}`, target.team === 0 ? 'bad' : 'info');
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

    if (this.controller && !this.bots.some((b) => b.ch === this.player)) {
      this.controller.enabled = playing && this.player.alive;
      this.controller.update(dt, this.player, this.r.camera, this.physics);
    }
    for (const b of this.bots) {
      if (playing) b.update(dt);
      else b.idle();
    }
    if (!playing) {
      this.player.input.fire = false;
      this.player.input.sub = false;
      this.player.input.special = false;
    }
    this.listener.copy(this.player.pos);

    if (!frozen) {
      for (const c of this.characters) {
        if (c.alive && c.pos.y < this.stage.info.killY) this.splat(c, null);
        if (!c.alive && c.respawnT <= 0 && playing) {
          const t = c.team;
          const i = this.characters.filter((x) => x.team === t).indexOf(c);
          c.spawn(this.stage.info.spawns[t][i % this.stage.info.spawns[t].length], this.stage.info.spawnYaw[t]);
          if (c.isPlayer) {
            this.controller?.reset(this.stage.info.spawnYaw[t]);
            this.controller?.snapCamera(c);
            this.sfx.respawn();
            this.events.onPlayerRespawn();
          }
        }
      }
    }
    this.simulate(dt, !frozen);
  }

  summary(): MatchSummary {
    const turf = this.ink.turf();
    return {
      win: turf[0] >= turf[1],
      turf,
      paintedM2: this.player.painted / 9,
      splats: this.player.splats,
      deaths: this.player.deaths,
    };
  }

  /** Camera used when the player isn't driving (intro, splatted). */
  spectate(dt: number, cam: THREE.PerspectiveCamera) {
    const p = this.player;
    if (this.phase === 'intro' || this.phase === 'countdown') {
      const t = Math.min(1, (this.phaseT + (this.phase === 'countdown' ? 1.2 : 0)) / 4.2);
      const e = 1 - (1 - t) ** 3;
      const from = new THREE.Vector3(18, 22, 10);
      const sp = this.stage.info.spawns[0][0];
      const to = new THREE.Vector3(sp.x - 0.55, sp.y + 2.1, sp.z - 3.2);
      cam.position.lerpVectors(from, to, e);
      cam.lookAt(new THREE.Vector3(0, 1, 0).lerp(sp.clone().add(new THREE.Vector3(0, 1.6, 6)), e));
      return true;
    }
    if (!p.alive) {
      const target = p.lastAttacker?.alive ? p.lastAttacker.pos : p.pos;
      const want = p.pos.clone().add(new THREE.Vector3(0, 9, -7));
      cam.position.lerp(want, Math.min(1, dt * 2));
      cam.lookAt(target);
      return true;
    }
    return false;
  }
}
