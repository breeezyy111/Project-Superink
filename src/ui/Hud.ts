import { INK_TANK, RESPAWN_SECONDS, Team } from '../config';
import type { Match } from '../game/Match';

/** What the HUD reads: a match, or a story level. */
export type HudSource = Pick<Match, 'pair' | 'player' | 'characters' | 'colorOf' | 'timeLeft' | 'overtime' | 'objective' | 'tower' | 'ink'> & { phase: string };
import { SPECIALS, SUBS } from '../game/items';
import { WEAPONS } from '../game/weapons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const CUTTLE_SVG = (color: string) => `
<svg viewBox="0 0 40 40"><g stroke="#15121c" stroke-width="2.2" stroke-linejoin="round">
<path d="M20 3c7 0 11 6 11 13 0 3-1 5-1 7 0 0 4 1 4 4s-3 3-4 2c0 3-2 7-4 7 0 0-1-4-2-4 0 2-1 5-4 5s-4-3-4-5c-1 0-2 4-2 4-2 0-4-4-4-7-1 1-4 1-4-2s4-4 4-4c0-2-1-4-1-7C9 9 13 3 20 3z" fill="${color}"/>
<ellipse cx="15" cy="18" rx="3" ry="3.6" fill="#fff"/><ellipse cx="25" cy="18" rx="3" ry="3.6" fill="#fff"/>
</g><path d="M13.5 18.5q1.5 2 3 0M23.5 18.5q1.5 2 3 0" stroke="#15121c" stroke-width="1.6" fill="none"/></svg>`;

export class Hud {
  private root = $('hud');
  private timer = $('timer');
  private teamA = $('team-a');
  private teamB = $('team-b');
  private inkRing = $('ch-ink') as unknown as SVGCircleElement;
  private chargeRing = $('ch-charge') as unknown as SVGCircleElement;
  private hitG = $('ch-hit') as unknown as SVGGElement;
  private inkLow = $('ink-low');
  private wcName = $('wc-name');
  private wcInk = $('wc-ink');
  private feed = $('feed');
  private big = $('big-text');
  private vignette = $('vignette');
  private splatted = $('splatted');
  private splName = $('spl-name');
  private splBar = $('spl-bar');
  private clickLock = $('click-lock');
  private crosshair = $('crosshair');
  private lastIconsKey = '';
  private sgFill = $('sg-fill') as unknown as SVGCircleElement;
  private sgLabel = $('sg-label');
  private sg = $('special-gauge');
  private turfA = $('turf-a');
  private turfB = $('turf-b');
  private turfAPct = $('turf-a-pct');
  private turfBPct = $('turf-b-pct');
  private turfT = 0;
  private turfBar = $('turf-bar');
  private zoneHud = $('zone-hud');
  private zcA = $('zc-a');
  private zcB = $('zc-b');
  private zpA = $('zp-a');
  private zpB = $('zp-b');
  private zIcon = $('zicon');
  private zsA = $('zs-a');
  private zsB = $('zs-b');

  show(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  setup(m: HudSource) {
    // "a" is always your team (left side), "b" the other team
    const me = m.player.team;
    const mine = m.colorOf(me), theirs = m.colorOf((1 - me) as Team);
    document.documentElement.style.setProperty('--ink-a', mine);
    document.documentElement.style.setProperty('--ink-b', theirs);
    this.wcName.textContent = WEAPONS[m.player.weapon.kind].name;
    const kit = m.player.kitState.kit;
    $('wc-sub').textContent = SUBS[kit.sub].name;
    $('wc-special').textContent = SPECIALS[kit.special].name;
    $('sg-name').textContent = SPECIALS[kit.special].name;
    $('wc-sub-mark').style.left = `${(SUBS[kit.sub].cost / INK_TANK.max) * 100}%`;
    this.wcInk.style.background = mine;
    this.vignette.style.setProperty('--hurt', hexA(theirs, 0.85));
    this.feed.innerHTML = '';
    this.splatted.classList.add('hidden');
    this.big.classList.add('hidden');
    this.lastIconsKey = '';
    this.turfT = 0;
    const zones = !!m.objective;
    this.turfBar.classList.toggle('hidden', zones);
    this.zoneHud.classList.toggle('hidden', !zones);
    this.timer.classList.remove('overtime');
  }

  bigText(text: string, pink = false, ms = 1200) {
    this.big.textContent = text;
    this.big.classList.toggle('pink', pink);
    this.big.classList.remove('hidden');
    // restart animation
    this.big.style.animation = 'none';
    void this.big.offsetWidth;
    this.big.style.animation = '';
    if (ms > 0) {
      const t = text;
      setTimeout(() => {
        if (this.big.textContent === t) this.big.classList.add('hidden');
      }, ms);
    }
  }

  hideBig() {
    this.big.classList.add('hidden');
  }

  pushFeed(text: string, kind: 'good' | 'bad' | 'info') {
    const d = document.createElement('div');
    d.className = `msg ${kind}`;
    d.textContent = text;
    this.feed.appendChild(d);
    setTimeout(() => d.remove(), 3700);
    while (this.feed.children.length > 5) this.feed.firstChild?.remove();
  }

  hitMarker() {
    this.hitG.classList.remove('on');
    void (this.hitG as unknown as HTMLElement).getBoundingClientRect();
    this.hitG.classList.add('on');
  }

  showSplatted(by: string) {
    this.splName.textContent = by;
    this.splatted.classList.remove('hidden');
  }

  hideSplatted() {
    this.splatted.classList.add('hidden');
  }

  setClickLock(v: boolean) {
    this.clickLock.classList.toggle('hidden', !v);
  }

  update(m: HudSource) {
    const t = Math.ceil(m.timeLeft);
    this.timer.textContent = m.overtime ? 'OVERTIME' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.timer.classList.toggle('overtime', m.overtime);
    this.timer.classList.toggle('hurry', m.timeLeft <= 30 && m.phase === 'play');

    const key = m.characters.map((c) => (c.alive ? 1 : 0)).join('');
    if (key !== this.lastIconsKey) {
      this.lastIconsKey = key;
      const icons = (team: 0 | 1) =>
        m.characters
          .filter((c) => c.team === team)
          .map((c) => `<div class="ticon ${c.alive ? '' : 'dead'} ${c.isPlayer ? 'me' : ''}" title="${c.name}">${CUTTLE_SVG(m.colorOf(team))}</div>`)
          .join('');
      this.teamA.innerHTML = icons(m.player.team);
      this.teamB.innerHTML = icons((1 - m.player.team) as Team);
    }

    const p = m.player;
    const inkFrac = p.ink / INK_TANK.max;
    this.inkRing.style.strokeDashoffset = String(138.2 * (1 - inkFrac));
    this.inkRing.style.stroke = inkFrac < 0.2 ? '#ff2fa8' : '#fff';
    this.chargeRing.style.strokeDashoffset = String(188.5 * (1 - p.weapon.charge));
    this.chargeRing.style.stroke = p.weapon.charge >= 1 ? '#ffffff' : m.colorOf(p.team);
    this.inkLow.classList.toggle('hidden', !(inkFrac < 0.12 && p.alive && m.phase === 'play'));
    this.wcInk.style.width = `${inkFrac * 100}%`;
    this.crosshair.style.opacity = p.alive && m.phase === 'play' ? (p.swimming ? '0.35' : '1') : '0';

    const z = m.objective;
    const me = p.team, them = (1 - me) as Team;
    if (z) {
      this.zcA.textContent = String(Math.ceil(z.count[me]));
      this.zcB.textContent = String(Math.ceil(z.count[them]));
      // zones: penalty count; tower: seconds stopped at a checkpoint
      const pen = (v: number) => (v <= 0 ? '' : m.tower ? `CHECKPOINT ${Math.ceil(v)}` : `+${Math.ceil(v)}`);
      this.zpA.textContent = pen(z.penalty[me]);
      this.zpB.textContent = pen(z.penalty[them]);
      this.zcA.parentElement!.classList.toggle('held', z.owner === me);
      this.zcB.parentElement!.classList.toggle('held', z.owner === them);
      this.zIcon.className = `zicon ${z.owner === me ? 'a' : z.owner === them ? 'b' : ''}`;
      this.zsA.style.width = `${z.share[me] * 100}%`;
      this.zsB.style.width = `${z.share[them] * 100}%`;
    }

    // live turf bar: your team fills from the left, theirs from the right
    this.turfT -= 1;
    if (!z && this.turfT <= 0) {
      this.turfT = 10;
      const turf = m.ink.turf();
      const a = turf[me], b = turf[them];
      this.turfA.style.width = `${a * 100}%`;
      this.turfB.style.width = `${b * 100}%`;
      this.turfAPct.textContent = `${(a * 100).toFixed(1)}%`;
      this.turfBPct.textContent = `${(b * 100).toFixed(1)}%`;
    }

    const sp = p.specialT > 0 ? 0 : p.special;
    this.sgFill.style.strokeDashoffset = String(263.9 * (1 - sp / 100));
    this.sgLabel.textContent = p.specialT > 0 ? 'GO!' : sp >= 100 ? 'Q!' : `${Math.floor(sp)}%`;
    this.sg.classList.toggle('ready', sp >= 100);

    const hurt = p.alive ? 1 - p.hp / 100 : 0;
    this.vignette.style.opacity = String(Math.min(1, hurt * 1.2));

    if (!p.alive) {
      this.splBar.style.width = `${(1 - Math.max(0, p.respawnT) / RESPAWN_SECONDS) * 100}%`;
    }
  }
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
