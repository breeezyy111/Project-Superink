import * as THREE from 'three';
import type { Team } from '../config';
import type { SplatCircle } from '../ink/InkSystem';
import type { Character } from '../game/Character';
import type { Match, NetFinal, Phase } from '../game/Match';
import type { Msg, Room } from './Room';

/**
 * Keeping an online match in step.
 *
 * The host runs the real match (hits, splats, paint, the clock, bots).
 * Each friend moves their own Inkfin locally and sends where they are and what they're
 * pressing; the host sends back everyone's state 20x a second, plus every splat of ink.
 * Friends' browsers replay shots and bombs just for show: only the host's count.
 */

const PHASES: Phase[] = ['intro', 'countdown', 'play', 'finish', 'done'];
const SNAP_HZ = 20;
const INPUT_HZ = 30;
const F_FIRE = 1, F_SWIM = 2, F_ALIVE = 4, F_GROUND = 8, F_JUMP = 16;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** One character packed into a flat array. */
function packChar(c: Character): number[] {
  const i = c.input;
  const flags = (i.fire ? F_FIRE : 0) | (i.swim ? F_SWIM : 0) | (c.alive ? F_ALIVE : 0) | (c.grounded ? F_GROUND : 0) | (i.jump ? F_JUMP : 0);
  return [
    r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r2(c.vel.x), r2(c.vel.y), r2(c.vel.z),
    r2(i.aimYaw), r2(i.aimPitch), r2(i.aimPoint.x), r2(i.aimPoint.y), r2(i.aimPoint.z), r2(i.move.x), r2(i.move.y),
    flags, Math.round(c.hp), Math.round(c.ink), Math.round(c.special), r2(c.specialT),
    c.kitState.subUses, c.kitState.specialUses, c.life,
  ];
}

/** Apply someone's inputs/aim from a packed array (used both ways). */
function applyInput(c: Character, d: number[]) {
  const i = c.input;
  i.aimYaw = d[6];
  i.aimPitch = d[7];
  i.aimPoint.set(d[8], d[9], d[10]);
  i.move.set(d[11], d[12]);
  const f = d[13];
  i.fire = !!(f & F_FIRE);
  i.swim = !!(f & F_SWIM);
  i.jump = !!(f & F_JUMP);
  if (c.net) {
    c.net.pos.set(d[0], d[1], d[2]);
    c.net.vel.set(d[3], d[4], d[5]);
    c.net.grounded = !!(f & F_GROUND);
  }
}

/** Catch up on subs/specials someone used. */
function replayKit(c: Character, subs: number, specials: number, m: Match) {
  const k = c.kitState;
  // big gaps (joined late, lost packets): just sync the counter
  if (subs - k.subUses > 2) k.subUses = subs;
  if (specials - k.specialUses > 1) k.specialUses = specials;
  while (k.subUses < subs) k.forceSub(c, m);
  while (k.specialUses < specials) k.forceSpecial(c, m);
}

export class HostSync {
  private inkBuf: number[] = [];
  private snapT = 0;
  private slotOf = new Map<string, number>();

  constructor(private room: Room, private m: Match, peers: (string | null)[]) {
    peers.forEach((id, slot) => id && this.slotOf.set(id, slot));
    // record every bit of paint so friends can apply it too
    const ink = m.ink;
    const paint = ink.paint.bind(ink);
    ink.paint = (circles: SplatCircle[], team: Team) => {
      this.inkBuf.push(team, circles.length);
      for (const c of circles) this.inkBuf.push(r2(c.x), r2(c.y), r2(c.z), r2(c.r));
      return paint(circles, team);
    };
    m.netHooks = {
      splat: (t, a) => room.broadcast({ t: 'splat', v: m.characters.indexOf(t), a: a ? m.characters.indexOf(a) : -1 }),
      hit: (a) => {
        const id = peers[m.characters.indexOf(a)];
        if (id) room.sendTo(id, { t: 'hit' });
      },
    };
  }

  /** A friend left the room mid-match. */
  left(id: string) {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return;
    this.slotOf.delete(id);
    const c = this.m.characters[slot];
    this.m.events.onFeed(`${c.name} left. A bot takes over!`, 'info');
    this.m.replaceWithBot(c);
  }

  handle(from: string, msg: Msg) {
    const slot = this.slotOf.get(from);
    if (slot === undefined || msg.t !== 'in') return;
    const c = this.m.characters[slot];
    const d = msg.d as number[];
    // ignore updates from before a respawn, and from the dead
    if (!c.alive || d[20] !== c.life || !c.net) return;
    applyInput(c, d);
    replayKit(c, d[18], d[19], this.m);
  }

  private finalSent = false;

  /** Call once per frame after the match updates. */
  update(dt: number) {
    const m = this.m;
    if (this.inkBuf.length) {
      this.room.broadcast({ t: 'i', d: this.inkBuf });
      this.inkBuf = [];
    }
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 1 / SNAP_HZ;
      const z = m.zones;
      this.room.broadcast({
        t: 's',
        ph: PHASES.indexOf(m.phase),
        tl: r2(m.timeLeft),
        ot: m.overtime ? 1 : 0,
        z: z ? [r2(z.count[0]), r2(z.count[1]), r2(z.penalty[0]), r2(z.penalty[1]), z.owner, r2(z.share[0]), r2(z.share[1])] : 0,
        c: m.characters.map(packChar),
      });
    }
    if (!this.finalSent && (m.phase === 'finish' || m.phase === 'done')) {
      this.finalSent = true;
      this.room.broadcast({ t: 'end', f: m.final() });
    }
  }

}

export class ClientSync {
  private inT = 0;
  private wasOvertime = false;

  constructor(private room: Room, private m: Match) {}

  handle(msg: Msg) {
    const m = this.m;
    switch (msg.t) {
      case 'i': {
        const d = msg.d as number[];
        let k = 0;
        while (k < d.length) {
          const team = d[k] as Team, n = d[k + 1];
          k += 2;
          const circles: SplatCircle[] = [];
          for (let j = 0; j < n; j++, k += 4) circles.push({ x: d[k], y: d[k + 1], z: d[k + 2], r: d[k + 3] });
          if (circles.length) m.ink.paint(circles, team);
        }
        break;
      }
      case 's':
        this.snapshot(msg as Record<string, unknown>);
        break;
      case 'splat': {
        const v = m.characters[msg.v as number];
        const a = (msg.a as number) >= 0 ? m.characters[msg.a as number] : null;
        if (v?.alive) m.splatNet(v, a);
        break;
      }
      case 'hit':
        m.events.onHitMarker();
        m.sfx.hit();
        break;
      case 'end':
        m.netFinal = msg.f as NetFinal;
        break;
    }
  }

  private snapshot(msg: Record<string, unknown>) {
    const m = this.m;
    const ph = PHASES[msg.ph as number];
    if (ph) m.netPhase(ph);
    m.timeLeft = msg.tl as number;
    const ot = !!msg.ot;
    if (ot && !this.wasOvertime) m.events.onOvertime?.();
    this.wasOvertime = ot;
    m.overtime = ot;
    const z = msg.z as number[] | 0;
    if (z && m.zones) {
      for (const e of m.zones.applyNet([z[0], z[1]], [z[2], z[3]], z[4] as Team | -1, [z[5], z[6]])) m.events.onZone?.(e);
    }
    const list = msg.c as number[][];
    list.forEach((d, slot) => {
      const c = m.characters[slot];
      if (!c) return;
      const alive = !!(d[13] & F_ALIVE);
      if (alive && !c.alive) {
        m.netRespawn(c, new THREE.Vector3(d[0], d[1], d[2]));
        c.life = d[20];
      }
      c.hp = d[14];
      if (c.isPlayer) {
        // you drive your own Inkfin; only take what the host decides
        c.life = d[20];
        if (d[19] >= c.kitState.specialUses) c.special = d[16];
        return;
      }
      applyInput(c, d);
      c.ink = d[15];
      c.special = d[16];
      c.specialT = d[17];
      replayKit(c, d[18], d[19], m);
    });
  }

  /** Call once per frame after the match updates: send our position and buttons. */
  update(dt: number) {
    this.inT -= dt;
    if (this.inT > 0) return;
    this.inT = 1 / INPUT_HZ;
    const p = this.m.player;
    if (!p.alive) return;
    this.room.send({ t: 'in', d: packChar(p) });
  }

}
