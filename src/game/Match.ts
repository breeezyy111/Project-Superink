import * as THREE from 'three';
import { INK_PAIRS, InkPair, MATCH_SECONDS, RESPAWN_SECONDS, TEAM_SIZE, Team } from '../config';
import { InkSystem } from '../ink/InkSystem';
import type { Sfx } from '../audio/Sfx';
import type { Renderer } from '../engine/Renderer';
import type { Stage } from '../world/Stage';
import { Bot } from './Bot';
import { Character } from './Character';
import { EYE_COLORS, Look, SKIN_TONES } from './InkfinModel';
import { gearIn, Kit, kit as kitById, KITS } from './items';
import type { PlayerController } from './PlayerController';
import type { Difficulty } from './profile';
import { InkWorld } from './World';
import { ZoneControl, ZoneEvent } from './Zones';

export type Mode = 'turf' | 'zones';
export const MODE_NAMES: Record<Mode, string> = { turf: 'Turf War', zones: 'Zone Control' };

export type Phase = 'intro' | 'countdown' | 'play' | 'finish' | 'done';

export interface MatchEvents {
  onFeed(text: string, kind: 'good' | 'bad' | 'info'): void;
  onPlayerSplatted(by: string): void;
  onPlayerRespawn(): void;
  onHitMarker(): void;
  onPhase(p: Phase): void;
  onZone?(e: ZoneEvent): void;
  onOvertime?(): void;
}

export interface MatchSummary {
  mode: Mode;
  win: boolean;
  /** Zone Control: counts left per team, and whether it ended by knockout */
  zoneCount: [number, number] | null;
  ko: boolean;
  turf: [number, number];
  paintedM2: number;
  splats: number;
  deaths: number;
}

/** One of the 8 players in an online match (same order on every machine). */
export interface RosterSlot {
  name: string;
  team: Team;
  look: Look;
  kit: string;
  /** a person (true) or a bot filling the slot */
  human: boolean;
}

export interface NetOpts {
  role: 'host' | 'client';
  roster: RosterSlot[];
  localSlot: number;
  pairIndex: number;
}

/** Final numbers the host sends to everyone when an online match ends. */
export interface NetFinal {
  winner: Team;
  turf: [number, number];
  zoneCount: [number, number] | null;
  ko: boolean;
  stats: { painted: number; splats: number; deaths: number }[];
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
  readonly mode: Mode;
  zones: ZoneControl | null = null;
  overtime = false;
  ko = false;
  private overtimeT = 0;
  readonly net: NetOpts | null;
  /** online host: told about splats and hits so they can be sent to everyone */
  netHooks: { splat?(target: Character, attacker: Character | null): void; hit?(attacker: Character): void } = {};
  private difficulty: Difficulty;
  /** online client: final numbers from the host */
  netFinal: NetFinal | null = null;
  private lastBeep = 99;

  constructor(
    private r: Renderer,
    stage: Stage,
    sfx: Sfx,
    private controller: PlayerController | null,
    readonly events: MatchEvents,
    opts: { look: Look; kit: Kit; name: string; demo?: boolean; difficulty: Difficulty; mode?: Mode; net?: NetOpts },
  ) {
    super(r.scene, stage, sfx);
    this.mode = opts.mode ?? 'turf';
    this.difficulty = opts.difficulty;
    this.net = opts.net ?? null;
    this.authority = this.net?.role !== 'client';
    this.pair = this.net ? INK_PAIRS[this.net.pairIndex % INK_PAIRS.length] : INK_PAIRS[Math.floor(Math.random() * INK_PAIRS.length)];
    this.ink.setColors(this.pair.alpha, this.pair.bravo);
    this.ink.reset();
    if (this.mode === 'zones') this.zones = new ZoneControl(r.scene, stage.def, this.ink, this.physics, (t) => this.colorOf(t));
    this.projectiles.setColors(this.pair.alpha, this.pair.bravo);

    const [lo, hi] = SKILL[opts.difficulty];
    if (this.net) {
      const net = this.net;
      net.roster.forEach((slot, i) => {
        const isPlayer = i === net.localSlot;
        const ch = new Character(slot.name, slot.team, isPlayer, slot.look, kitById(slot.kit), this, r.scene);
        this.characters.push(ch);
        if (isPlayer) this.player = ch;
        else if (net.role === 'client' || slot.human) ch.net = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), grounded: true };
        else this.bots.push(new Bot(ch, this, stage.info, THREE.MathUtils.lerp(lo, hi, Math.random()), this.zones));
      });
      this.spawnAll();
      this.setPhase('intro');
      return;
    }
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let t = 0 as Team; t <= 1; t = (t + 1) as Team) {
      for (let i = 0; i < TEAM_SIZE; i++) {
        const isPlayer = t === 0 && i === 0;
        const kit = isPlayer ? opts.kit : KITS[(i + t * 2 + Math.floor(Math.random() * 2)) % KITS.length];
        const ch = new Character(isPlayer ? opts.name : names.pop()!, t, isPlayer, isPlayer ? opts.look : randomLook(), kit, this, r.scene);
        this.characters.push(ch);
        if (isPlayer) this.player = ch;
        // allies are a touch weaker than enemies on each difficulty, so you matter
        const skill = isPlayer ? 0.8 : THREE.MathUtils.lerp(lo, hi, Math.random()) * (t === 0 ? 0.9 : 1);
        if (!isPlayer || opts.demo) this.bots.push(new Bot(ch, this, stage.info, skill, this.zones));
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
    this.controller?.reset(this.stage.info.spawnYaw[this.player.team]);
    this.controller?.snapCamera(this.player);
    for (const b of this.bots) b.reset();
  }

  /** Online client: follow the host's phase. */
  netPhase(p: Phase) {
    if (p !== this.phase) this.setPhase(p);
  }

  /** Public so the online client can replay the host's splats. */
  splatNet(target: Character, attacker: Character | null) {
    this.splat(target, attacker);
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
    this.events.onPhase(p);
  }

  /** Online host: a friend left mid-match, so a bot takes over their Inkfin. */
  replaceWithBot(ch: Character) {
    if (!ch.net) return;
    ch.net = null;
    const [lo, hi] = SKILL[this.difficulty];
    const b = new Bot(ch, this, this.stage.info, THREE.MathUtils.lerp(lo, hi, 0.5), this.zones);
    b.reset();
    this.bots.push(b);
  }

  /** Online client: the host respawned someone. */
  netRespawn(c: Character, pos: THREE.Vector3) {
    c.spawn(pos, this.stage.info.spawnYaw[c.team]);
    if (c.isPlayer) {
      this.controller?.reset(this.stage.info.spawnYaw[c.team]);
      this.controller?.snapCamera(c);
      this.sfx.respawn();
      this.events.onPlayerRespawn();
    }
  }

  protected onHit(target: Character, attacker: Character, died: boolean) {
    this.netHooks.hit?.(attacker);
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
    this.netHooks.splat?.(target, attacker);
    this.sfx.splatted(this.listener.distanceTo(center), target.isPlayer || attacker?.isPlayer === true);
    const by = attacker ? attacker.name : 'the abyss';
    if (target.isPlayer) this.events.onPlayerSplatted(by);
    else if (attacker?.isPlayer) this.events.onFeed(`You splatted ${target.name}!`, 'good');
    else this.events.onFeed(`${by} splatted ${target.name}`, target.team === this.player.team ? 'bad' : 'info');
  }

  update(dt: number) {
    this.phaseT += dt;
    const playing = this.phase === 'play';
    const frozen = this.phase === 'finish' || this.phase === 'done';
    if (!this.authority) {
      // online client: the host runs the clock, zone and respawns
      this.zones?.update(dt, false);
      if (this.controller) {
        this.controller.enabled = playing && this.player.alive;
        this.controller.update(dt, this.player, this.r.camera, this.physics);
      }
      if (!playing) this.player.input.fire = false;
      this.listener.copy(this.player.pos);
      this.simulate(dt, !frozen);
      return;
    }

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
    if (this.zones) for (const e of this.zones.update(dt, playing)) this.events.onZone?.(e);
    if (playing) {
      const before = this.timeLeft;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (Math.ceil(before) !== Math.ceil(this.timeLeft) && this.timeLeft <= 10 && this.timeLeft > 0) this.sfx.beep(false);
      const z = this.zones;
      if (z && (z.count[0] <= 0 || z.count[1] <= 0)) {
        this.ko = true;
        this.sfx.whistle();
        this.setPhase('finish');
      } else if (this.timeLeft <= 0) {
        // Overtime: the team holding the zone is behind (or tied) and gets a chance to catch up
        if (z && z.owner !== -1 && z.leader() !== z.owner && this.overtimeT < 60) {
          if (!this.overtime) {
            this.overtime = true;
            this.events.onOvertime?.();
          }
          this.overtimeT += dt;
        } else {
          this.sfx.whistle();
          this.setPhase('finish');
        }
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

  /** Winning team (Turf War: more turf. Zone Control: lower count, then more of the zone). */
  winner(): Team {
    if (this.netFinal) return this.netFinal.winner;
    const turf = this.ink.turf();
    const z = this.zones;
    if (z) {
      const l = z.leader();
      if (l !== null) return l;
      if (z.share[0] !== z.share[1]) return z.share[0] > z.share[1] ? 0 : 1;
    }
    return turf[0] >= turf[1] ? 0 : 1;
  }

  /** What the host tells everyone at the end of an online match. */
  final(): NetFinal {
    const z = this.zones;
    return {
      winner: this.winner(),
      turf: this.ink.turf(),
      zoneCount: z ? [z.shown(0), z.shown(1)] : null,
      ko: this.ko,
      stats: this.characters.map((c) => ({ painted: c.painted, splats: c.splats, deaths: c.deaths })),
    };
  }

  summary(): MatchSummary {
    const f = this.netFinal;
    if (f) {
      const me = f.stats[this.characters.indexOf(this.player)];
      // our team is whatever team we're on (online you can be on either)
      return {
        mode: this.mode, zoneCount: f.zoneCount, ko: f.ko, win: f.winner === this.player.team, turf: f.turf,
        paintedM2: me.painted / 9, splats: me.splats, deaths: me.deaths,
      };
    }
    const turf = this.ink.turf();
    const z = this.zones;
    return {
      mode: this.mode,
      zoneCount: z ? [z.shown(0), z.shown(1)] : null,
      ko: this.ko,
      win: this.winner() === this.player.team,
      turf,
      paintedM2: this.player.painted / 9,
      splats: this.player.splats,
      deaths: this.player.deaths,
    };
  }

  dispose() {
    this.zones?.dispose();
    super.dispose();
  }

  /** Camera used when the player isn't driving (intro, splatted). */
  spectate(dt: number, cam: THREE.PerspectiveCamera) {
    const p = this.player;
    if (this.phase === 'intro' || this.phase === 'countdown') {
      const t = Math.min(1, (this.phaseT + (this.phase === 'countdown' ? 1.2 : 0)) / 4.2);
      const e = 1 - (1 - t) ** 3;
      // mirrored for the team on the far side
      const f = p.team === 0 ? 1 : -1;
      const from = new THREE.Vector3(18 * f, 22, 10 * f);
      const sp = this.stage.info.spawns[p.team][0];
      const to = new THREE.Vector3(sp.x - 0.55 * f, sp.y + 2.1, sp.z - 3.2 * f);
      cam.position.lerpVectors(from, to, e);
      cam.lookAt(new THREE.Vector3(0, 1, 0).lerp(sp.clone().add(new THREE.Vector3(0, 1.6, 6 * f)), e));
      return true;
    }
    if (!p.alive) {
      const target = p.lastAttacker?.alive ? p.lastAttacker.pos : p.pos;
      const want = p.pos.clone().add(new THREE.Vector3(0, 9, p.team === 0 ? -7 : 7));
      cam.position.lerp(want, Math.min(1, dt * 2));
      cam.lookAt(target);
      return true;
    }
    return false;
  }
}
