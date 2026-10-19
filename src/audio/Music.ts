import { mulberry } from '../world/Stage';

/**
 * Procedural band music. Each fictional Splashburg band has its own tempo, drum groove,
 * bass line, chords and a seeded melody, all synthesized live with WebAudio.
 */

export interface Band {
  id: string;
  band: string;
  song: string;
  genre: string;
  bpm: number;
  root: number; // midi note of the key
  minor: boolean;
  progression: number[]; // scale degrees per bar (0-based)
  kick: string; // 16-step patterns: x = hit, . = rest
  snare: string;
  hat: string;
  bass: string; // digits = scale-degree offsets above chord root, '.' rest, 'o' octave
  chordStyle: 'power' | 'stab' | 'pad' | 'keys';
  lead: OscillatorType;
  bassWave: OscillatorType;
  swing?: number;
  seed: number;
}

export const BANDS: Band[] = [
  {
    id: 'frillkillers', band: 'The Frillkillers', song: 'Ink Riot', genre: 'squid-punk',
    bpm: 172, root: 52, minor: false, progression: [0, 4, 5, 3],
    kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    bass: '0.0.0.0.0.0.0.o.', chordStyle: 'power', lead: 'sawtooth', bassWave: 'sawtooth', seed: 11,
  },
  {
    id: 'fintonic', band: 'Fin & Tonic', song: 'Bubble Pop Heart', genre: 'electro-pop',
    bpm: 126, root: 57, minor: true, progression: [0, 5, 2, 6],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...xx',
    bass: 'o.0.o.0.o.0.4.o.', chordStyle: 'stab', lead: 'square', bassWave: 'square', seed: 23,
  },
  {
    id: 'cuttlecrew', band: 'The Cuttle Crew', song: 'Slick Groove', genre: 'ink-funk',
    bpm: 108, root: 50, minor: true, progression: [0, 0, 3, 4],
    kick: 'x..x..x...x..x..', snare: '....x..x....x...', hat: 'xxxxxxxxxxxxxxxx',
    bass: '0..0o..4.0.2..4.', chordStyle: 'stab', lead: 'triangle', bassWave: 'sawtooth', swing: 0.12, seed: 37,
  },
  {
    id: 'tidepool', band: 'Tidepool Radio', song: 'Plaza Afternoon', genre: 'chill-hop',
    bpm: 88, root: 53, minor: false, progression: [0, 5, 3, 4],
    kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx',
    bass: '0.....4...2.....', chordStyle: 'keys', lead: 'sine', bassWave: 'triangle', swing: 0.18, seed: 5,
  },
];

export const BATTLE_BANDS = ['frillkillers', 'fintonic', 'cuttlecrew'];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noiseBuf!: AudioBuffer;
  private dist!: WaveShaperNode;
  private band: Band | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private melody: (number | null)[] = [];
  private _volume = 0.45;
  onNowPlaying: ((b: Band) => void) | null = null;

  attach(ctx: AudioContext | null) {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this._volume * 0.5;
    this.out.connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.dist = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 4);
    }
    this.dist.curve = curve;
    this.dist.connect(this.out);
    if (this.band) this.start(this.band);
  }

  set volume(v: number) {
    this._volume = v;
    if (this.ctx) this.out.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.1);
  }

  get volume() {
    return this._volume;
  }

  play(id: string) {
    const b = BANDS.find((x) => x.id === id) ?? BANDS[0];
    if (this.band?.id === b.id && this.timer !== null) return;
    this.band = b;
    if (this.ctx) this.start(b);
  }

  playRandomBattle() {
    const ids = BATTLE_BANDS.filter((x) => x !== this.band?.id);
    this.play(ids[Math.floor(Math.random() * ids.length)]);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private start(b: Band) {
    this.stop();
    this.step = 0;
    this.nextTime = this.ctx!.currentTime + 0.1;
    this.melody = this.writeMelody(b);
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.onNowPlaying?.(b);
  }

  /** A catchy-ish seeded melody: pentatonic random walk, AABA phrase over 4 bars. */
  private writeMelody(b: Band) {
    const rnd = mulberry(b.seed);
    const phrase = (density: number) => {
      const out: (number | null)[] = [];
      let deg = 4;
      for (let i = 0; i < 32; i++) {
        if (rnd() > density || (i % 4 === 3 && rnd() < 0.5)) {
          out.push(null);
          continue;
        }
        deg += Math.floor(rnd() * 5) - 2;
        deg = Math.max(0, Math.min(9, deg));
        out.push(deg);
      }
      return out;
    };
    const dens = b.chordStyle === 'keys' ? 0.35 : b.bpm > 150 ? 0.45 : 0.6;
    const A = phrase(dens), B = phrase(dens);
    return [...A, ...A.slice(0, 16), ...B.slice(16), ...B, ...A];
  }

  private schedule() {
    const ctx = this.ctx!;
    const b = this.band!;
    const sixteenth = 60 / b.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16) % b.progression.length;
      const swing = s % 2 === 1 ? (b.swing ?? 0) * sixteenth : 0;
      this.playStep(b, s, bar, this.nextTime + swing, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  private note(deg: number, b: Band) {
    const scale = b.minor ? MINOR : MAJOR;
    const oct = Math.floor(deg / 7);
    const d = ((deg % 7) + 7) % 7;
    return b.root + scale[d] + oct * 12;
  }

  private playStep(b: Band, s: number, bar: number, t: number, len: number) {
    const chordDeg = b.progression[bar];
    if (b.kick[s] === 'x') this.kick(t);
    if (b.snare[s] === 'x') this.snare(t, b.chordStyle === 'power' ? 0.5 : 0.35);
    if (b.hat[s] === 'x') this.hat(t, s % 4 === 0 ? 0.12 : 0.07);
    // fill on the last bar of the loop
    if (bar === b.progression.length - 1 && s >= 12 && b.chordStyle !== 'keys') this.snare(t, 0.25);

    const bc = b.bass[s];
    if (bc !== '.' && bc !== undefined) {
      const off = bc === 'o' ? 7 : parseInt(bc, 10);
      this.bass(mtof(this.note(chordDeg + off, b) - 24), t, len * 1.6, b.bassWave);
    }
    // chords
    const triad = [0, 2, 4].map((k) => mtof(this.note(chordDeg + k, b) - 12));
    if (b.chordStyle === 'power' && s % 2 === 0) this.power(mtof(this.note(chordDeg, b) - 12), t, len * 1.8);
    if (b.chordStyle === 'stab' && (s === 2 || s === 6 || s === 10 || s === 14 || (b.swing && s === 7))) this.stab(triad, t, len * 1.2);
    if ((b.chordStyle === 'pad' || b.chordStyle === 'keys') && s === 0) this.keys(triad, t, len * 14);
    if (b.chordStyle === 'keys' && s === 8) this.keys(triad.slice(1), t, len * 6);

    // melody (enters after the first loop, takes a breather every 4th loop)
    const loop = Math.floor(this.step / (16 * b.progression.length));
    if (loop >= 1 && loop % 4 !== 3) {
      const m = this.melody[(this.step % 128) >> 1];
      if (m !== null && m !== undefined && this.step % 2 === 0) this.lead(mtof(this.note(m + chordDeg % 2, b) + 12), t, len * 2.2, b.lead);
    }
  }

  // ---------- instruments ----------
  private env(t: number, peak: number, dur: number, attack = 0.005) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  private kick(t: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = this.env(t, 0.9, 0.28, 0.002);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
  }

  private noiseHit(t: number, type: BiquadFilterType, f: number, peak: number, dur: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    const g = this.env(t, peak, dur, 0.002);
    src.connect(fl).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private snare(t: number, peak: number) {
    this.noiseHit(t, 'bandpass', 1900, peak, 0.16);
    const c = this.ctx!;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g = this.env(t, peak * 0.6, 0.1, 0.002);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, peak: number) {
    this.noiseHit(t, 'highpass', 7500, peak, 0.04);
  }

  private bass(f: number, t: number, dur: number, wave: OscillatorType) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = wave;
    o.frequency.value = f;
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(900, t);
    fl.frequency.exponentialRampToValueAtTime(220, t + dur);
    fl.Q.value = 6;
    const g = this.env(t, 0.32, dur, 0.004);
    o.connect(fl).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private power(f: number, t: number, dur: number) {
    const c = this.ctx!;
    for (const [mul, det] of [[1, -8], [1.5, 6], [2, 3]]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * mul;
      o.detune.value = det;
      const g = this.env(t, 0.06, dur, 0.004);
      o.connect(g).connect(this.dist);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private stab(freqs: number[], t: number, dur: number) {
    const c = this.ctx!;
    for (const f of freqs) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f * 2;
      const fl = c.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = 2200;
      const g = this.env(t, 0.045, dur, 0.003);
      o.connect(fl).connect(g).connect(this.out);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private keys(freqs: number[], t: number, dur: number) {
    const c = this.ctx!;
    for (const f of freqs) {
      for (const [type, mul, vol] of [['triangle', 2, 0.06], ['sine', 4, 0.02]] as [OscillatorType, number, number][]) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = f * mul;
        const g = this.env(t, vol, dur, 0.01);
        o.connect(g).connect(this.out);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  private lead(f: number, t: number, dur: number, wave: OscillatorType) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = wave;
    o.frequency.value = f;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = c.createGain();
    lg.gain.value = f * 0.012;
    lfo.connect(lg).connect(o.frequency);
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = wave === 'sawtooth' ? 2600 : 4000;
    const g = this.env(t, wave === 'sine' ? 0.12 : 0.07, dur, 0.01);
    o.connect(fl).connect(g).connect(this.out);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }
}
