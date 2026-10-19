import Peer, { DataConnection, PeerOptions } from 'peerjs';
import type { Team } from '../config';
import type { Look } from '../game/InkfinModel';
import type { Mode } from '../game/Match';

/**
 * Friends rooms over WebRTC (PeerJS). The host's browser is the room: friends join with a
 * 5-letter code. PeerJS's free cloud server only introduces the browsers to each other;
 * after that, game data goes straight between players (or through PeerJS's free relay
 * when a network blocks direct connections).
 */

export const MAX_PLAYERS = 8;
const PREFIX = 'superink-room-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface Member {
  id: string;
  name: string;
  team: Team;
  look: Look;
  kit: string;
  host: boolean;
}

export interface RoomSettings {
  mode: Mode;
  stage: string;
}

/** Messages between browsers. Short keys keep the packets small. */
export type Msg =
  | { t: 'hello'; name: string; look: Look; kit: string }
  | { t: 'room'; code: string; members: Member[]; settings: RoomSettings; you: string }
  | { t: 'full' }
  | { t: 'bye'; reason: string }
  | { t: string; [k: string]: unknown };

function peerOptions(): PeerOptions {
  // ?peerhost=localhost:9000 points at a self-hosted PeerJS server (used for local testing)
  const custom = new URLSearchParams(location.search).get('peerhost') || import.meta.env.VITE_PEER_HOST;
  if (custom) {
    const [host, port] = String(custom).split(':');
    return { host, port: Number(port) || 443, path: '/', secure: location.protocol === 'https:' && !port, debug: 1 };
  }
  return { debug: 1 };
}

function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function friendly(e: unknown) {
  const type = (e as { type?: string })?.type;
  if (type === 'peer-unavailable') return "Couldn't find that room. Check the code?";
  if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed')
    return "Couldn't reach the online service. Check your internet and try again.";
  if (type === 'browser-incompatible') return "This browser can't do online play.";
  if (type === 'unavailable-id') return 'That room code is taken. Try again.';
  return (e as Error)?.message || 'Something went wrong online.';
}

export class Room {
  members: Member[] = [];
  settings: RoomSettings = { mode: 'turf', stage: 'random' };
  myId = '';
  code = '';
  /** called when the member list or settings change */
  onChange: () => void = () => {};
  /** game messages (anything that isn't room bookkeeping) */
  onMessage: (from: string, msg: Msg) => void = () => {};
  /** host: a member left (so the game can swap them for a bot) */
  onLeft: (id: string) => void = () => {};
  /** the room closed (host left, kicked, network trouble) */
  onClosed: (reason: string) => void = () => {};
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private closed = false;

  private constructor(readonly role: 'host' | 'client', private peer: Peer) {}

  get isHost() {
    return this.role === 'host';
  }

  /** Create a room. Your browser hosts it. */
  static async host(me: { name: string; look: Look; kit: string }, settings: RoomSettings): Promise<Room> {
    for (let tries = 0; tries < 4; tries++) {
      const code = randomCode();
      try {
        const peer = await open(new Peer(PREFIX + code, peerOptions()));
        const room = new Room('host', peer);
        room.code = code;
        room.myId = peer.id;
        room.settings = { ...settings };
        room.members = [{ id: peer.id, name: me.name, look: me.look, kit: me.kit, team: 0, host: true }];
        peer.on('connection', (c) => room.accept(c));
        peer.on('error', (e) => console.warn('[room]', e.type));
        room.watchPeer();
        return room;
      } catch (e) {
        if ((e as { type?: string }).type !== 'unavailable-id') throw new Error(friendly(e));
      }
    }
    throw new Error("Couldn't make a room code. Try again.");
  }

  /** Join a friend's room by code. */
  static async join(code: string, me: { name: string; look: Look; kit: string }): Promise<Room> {
    code = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) throw new Error('Room codes are 5 letters/numbers.');
    let peer: Peer;
    try {
      peer = await open(new Peer(peerOptions()));
    } catch (e) {
      throw new Error(friendly(e));
    }
    const room = new Room('client', peer);
    room.code = code;
    room.myId = peer.id;
    try {
      await new Promise<void>((resolve, reject) => {
        const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        const timer = setTimeout(() => reject(new Error("Couldn't connect to that room. Is the host still there?")), 15000);
        peer.on('error', (e) => {
          clearTimeout(timer);
          reject(new Error(friendly(e)));
        });
        c.on('open', () => {
          room.hostConn = c;
          c.send({ t: 'hello', ...me });
        });
        c.on('data', (d) => {
          const msg = d as Msg;
          if (msg.t === 'full') {
            clearTimeout(timer);
            reject(new Error('That room is full (8 players).'));
            return;
          }
          if (msg.t === 'room') {
            const r = msg as Extract<Msg, { t: 'room' }>;
            room.members = r.members;
            room.settings = r.settings;
            room.myId = r.you;
            clearTimeout(timer);
            resolve();
            room.onChange();
            return;
          }
          if (msg.t === 'bye') {
            room.close((msg as Extract<Msg, { t: 'bye' }>).reason);
            return;
          }
          room.onMessage('host', msg);
        });
        c.on('close', () => room.close('The host closed the room.'));
      });
    } catch (e) {
      peer.destroy();
      throw e;
    }
    room.watchPeer();
    return room;
  }

  private watchPeer() {
    this.peer.on('disconnected', () => {
      // lost the signaling server; existing connections keep working, so just try to reconnect
      if (!this.closed && !this.peer.destroyed) this.peer.reconnect();
    });
  }

  private accept(c: DataConnection) {
    c.on('data', (d) => {
      const msg = d as Msg;
      if (msg.t === 'hello') {
        if (this.members.length >= MAX_PLAYERS && !this.conns.has(c.peer)) {
          c.send({ t: 'full' });
          setTimeout(() => c.close(), 300);
          return;
        }
        const h = msg as Extract<Msg, { t: 'hello' }>;
        const known = this.members.find((m) => m.id === c.peer);
        if (known) {
          // a member changed their name / look / kit
          Object.assign(known, { name: String(h.name).slice(0, 20), look: h.look, kit: String(h.kit) });
          this.sync();
          return;
        }
        // put newcomers on the smaller team
        const t0 = this.members.filter((m) => m.team === 0).length;
        const t1 = this.members.length - t0;
        const team: Team = t1 < t0 ? 1 : 0;
        this.conns.set(c.peer, c);
        this.members.push({ id: c.peer, name: String(h.name).slice(0, 20), look: h.look, kit: String(h.kit), team, host: false });
        this.sync();
        return;
      }
      if (this.conns.has(c.peer)) this.onMessage(c.peer, msg);
    });
    c.on('close', () => this.drop(c.peer));
    c.on('error', () => this.drop(c.peer));
  }

  private drop(id: string) {
    if (!this.conns.has(id)) return;
    this.conns.delete(id);
    this.members = this.members.filter((m) => m.id !== id);
    this.onLeft(id);
    this.sync();
  }

  /** host: push the member list + settings to everyone */
  sync() {
    if (!this.isHost) return;
    for (const [id, c] of this.conns) {
      if (c.open) c.send({ t: 'room', code: this.code, members: this.members, settings: this.settings, you: id });
    }
    this.onChange();
  }

  setTeam(id: string, team: Team) {
    const m = this.members.find((x) => x.id === id);
    if (!m || !this.isHost) return;
    if (team !== m.team && this.members.filter((x) => x.team === team).length >= MAX_PLAYERS / 2) return;
    m.team = team;
    this.sync();
  }

  setSettings(s: Partial<RoomSettings>) {
    if (!this.isHost) return;
    Object.assign(this.settings, s);
    this.sync();
  }

  /** client: update your look/kit/name for the next match */
  updateMe(me: { name: string; look: Look; kit: string }) {
    if (this.isHost) {
      Object.assign(this.members[0], me);
      this.sync();
    } else this.send({ t: 'hello', ...me });
  }

  /** client → host */
  send(msg: Msg) {
    if (this.hostConn?.open) this.hostConn.send(msg);
  }

  /** host → one member */
  sendTo(id: string, msg: Msg) {
    const c = this.conns.get(id);
    if (c?.open) c.send(msg);
  }

  /** host → every member */
  broadcast(msg: Msg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  get peerCount() {
    return this.conns.size;
  }

  leave() {
    if (this.isHost) this.broadcast({ t: 'bye', reason: 'The host closed the room.' });
    this.close('');
  }

  private close(reason: string) {
    if (this.closed) return;
    this.closed = true;
    setTimeout(() => this.peer.destroy(), 200);
    this.onClosed(reason);
  }
}

function open(peer: Peer): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      peer.destroy();
      reject({ type: 'network' });
    }, 12000);
    const onError = (e: unknown) => {
      clearTimeout(timer);
      peer.destroy();
      reject(e);
    };
    peer.on('open', () => {
      clearTimeout(timer);
      peer.off('error', onError);
      resolve(peer);
    });
    peer.on('error', onError);
  });
}
