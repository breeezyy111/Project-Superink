import { INK_TANK, RESPAWN_SECONDS } from '../config';
import type { Match } from '../game/Match';
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

  show(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  setup(m: Match) {
    document.documentElement.style.setProperty('--ink-a', m.pair.alpha);
    document.documentElement.style.setProperty('--ink-b', m.pair.bravo);
    this.wcName.textContent = WEAPONS[m.player.weapon.kind].name;
    this.wcInk.style.background = m.pair.alpha;
    this.vignette.style.setProperty('--hurt', hexA(m.pair.bravo, 0.85));
    this.feed.innerHTML = '';
    this.splatted.classList.add('hidden');
    this.big.classList.add('hidden');
    this.lastIconsKey = '';
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

  update(m: Match) {
    const t = Math.ceil(m.timeLeft);
    this.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.timer.classList.toggle('hurry', m.timeLeft <= 30 && m.phase === 'play');

    const key = m.characters.map((c) => (c.alive ? 1 : 0)).join('');
    if (key !== this.lastIconsKey) {
      this.lastIconsKey = key;
      const icons = (team: 0 | 1) =>
        m.characters
          .filter((c) => c.team === team)
          .map((c) => `<div class="ticon ${c.alive ? '' : 'dead'} ${c.isPlayer ? 'me' : ''}" title="${c.name}">${CUTTLE_SVG(m.colorOf(team))}</div>`)
          .join('');
      this.teamA.innerHTML = icons(0);
      this.teamB.innerHTML = icons(1);
    }

    const p = m.player;
    const inkFrac = p.ink / INK_TANK.max;
    this.inkRing.style.strokeDashoffset = String(138.2 * (1 - inkFrac));
    this.inkRing.style.stroke = inkFrac < 0.2 ? '#ff2fa8' : '#fff';
    this.chargeRing.style.strokeDashoffset = String(188.5 * (1 - p.weapon.charge));
    this.chargeRing.style.stroke = p.weapon.charge >= 1 ? '#ffffff' : m.pair.alpha;
    this.inkLow.classList.toggle('hidden', !(inkFrac < 0.12 && p.alive && m.phase === 'play'));
    this.wcInk.style.width = `${inkFrac * 100}%`;
    this.crosshair.style.opacity = p.alive && m.phase === 'play' ? (p.swimming ? '0.35' : '1') : '0';

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
