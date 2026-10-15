/**
 * Tiny synthesized sound kit (no audio files needed yet).
 * Every sound is built from oscillators + filtered noise so it stays squishy and cartoony.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private rollT = 0;
  volume = 0.6;

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private att(dist: number) {
    return Math.max(0, 1 - dist / 35) ** 1.5;
  }

  private noise(t0: number, dur: number, f0: number, f1: number, gain: number, q = 1.2, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random() * 0.5, dur + 0.05);
  }

  private tone(t0: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine') {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private get now() {
    return this.ctx!.currentTime;
  }

  shoot(dist: number, mine: boolean) {
    if (!this.ctx) return;
    const a = mine ? 0.5 : this.att(dist) * 0.35;
    if (a < 0.02) return;
    const t = this.now;
    this.noise(t, 0.08, 2400, 700, a * 0.6, 2.5);
    this.tone(t, 0.07, 520 + Math.random() * 60, 180, a * 0.35, 'triangle');
  }

  splat(dist: number) {
    if (!this.ctx) return;
    const a = this.att(dist) * 0.25;
    if (a < 0.02) return;
    this.noise(this.now, 0.12, 900, 200, a, 1.5, 'lowpass');
  }

  flick(dist: number) {
    if (!this.ctx) return;
    const a = this.att(dist) * 0.7;
    const t = this.now;
    this.noise(t, 0.3, 300, 2500, a * 0.7, 0.8);
    this.noise(t + 0.08, 0.25, 1400, 200, a * 0.5, 1.2, 'lowpass');
  }

  roll(dt: number) {
    if (!this.ctx) return;
    this.rollT -= dt;
    if (this.rollT > 0) return;
    this.rollT = 0.09;
    this.noise(this.now, 0.12, 500, 350, 0.14, 1.0, 'lowpass');
  }

  charge(level: number) {
    if (!this.ctx) return;
    this.tone(this.now, 0.08, 300 + level * 900, 320 + level * 950, 0.08, 'sine');
  }

  chargeFull() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone(t, 0.12, 1400, 1500, 0.15, 'square');
    this.tone(t + 0.06, 0.12, 2100, 2200, 0.1, 'sine');
  }

  charger(dist: number, full: boolean) {
    if (!this.ctx) return;
    const a = Math.max(0.15, this.att(dist)) * (full ? 0.8 : 0.5);
    const t = this.now;
    this.noise(t, 0.35, 5000, 400, a * 0.7, 0.7);
    this.tone(t, 0.25, 900, 120, a * 0.5, 'sawtooth');
  }

  hit() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone(t, 0.06, 1800, 1700, 0.18, 'square');
  }

  hurt() {
    if (!this.ctx) return;
    this.noise(this.now, 0.15, 400, 120, 0.35, 1.2, 'lowpass');
  }

  splatted(dist: number, mine: boolean) {
    if (!this.ctx) return;
    const a = mine ? 0.8 : this.att(dist) * 0.7;
    const t = this.now;
    this.noise(t, 0.5, 1800, 80, a, 0.6, 'lowpass');
    this.tone(t, 0.4, 260, 40, a * 0.8, 'sine');
  }

  dive() {
    if (!this.ctx) return;
    const t = this.now;
    this.noise(t, 0.18, 2500, 300, 0.25, 1.4);
    this.tone(t, 0.1, 700, 200, 0.1, 'sine');
  }

  swim() {
    if (!this.ctx) return;
    this.noise(this.now, 0.1, 700 + Math.random() * 300, 300, 0.07, 3);
  }

  jump() {
    if (!this.ctx) return;
    this.tone(this.now, 0.12, 300, 700, 0.1, 'sine');
  }

  beep(high = false) {
    if (!this.ctx) return;
    this.tone(this.now, high ? 0.45 : 0.18, high ? 1320 : 880, high ? 1320 : 880, 0.25, 'square');
  }

  whistle() {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) this.tone(t + i * 0.18, 0.16, 2100, 2000, 0.2, 'triangle');
  }

  ui() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone(t, 0.06, 900, 1300, 0.12, 'triangle');
    this.noise(t, 0.05, 3000, 2000, 0.08, 2);
  }

  respawn() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone(t, 0.3, 300, 1200, 0.15, 'sine');
  }
}
