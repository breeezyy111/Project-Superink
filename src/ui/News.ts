import type { Sfx } from '../audio/Sfx';
import { MODE_NAMES } from '../game/Match';
import { currentRotation, formatEndsIn, Rotation, ROTATION_MS } from '../game/rotation';
import { idolSvg, LUMI, SEPIA } from './Mascots';

type Speaker = 'lumi' | 'sepia' | 'both';
interface Line {
  who: Speaker;
  text: string;
}

const NAMES: Record<Speaker, string> = { lumi: 'Lumi', sepia: 'Sepia', both: 'Tide Pop' };
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Little flavor bits so the broadcast isn't the same every time. */
const BANTER: Line[][] = [
  [
    { who: 'lumi', text: "Sepia, did you see the new Splash Bucket? It's SO splashy!" },
    { who: 'sepia', text: "It's a bucket, Lumi. It's ink in a bucket." },
    { who: 'lumi', text: 'A FASHIONABLE bucket!' },
  ],
  [
    { who: 'sepia', text: 'Judge Jelly fell asleep in the Turf Tower again.' },
    { who: 'lumi', text: 'Aww, he works so hard! Someone get him a blanket!' },
  ],
  [
    { who: 'lumi', text: 'Twin Dualies tip: hit Jump while you shoot to roll!' },
    { who: 'sepia', text: 'Roll, shoot, roll. Like a fish doing taxes.' },
  ],
  [
    { who: 'sepia', text: 'Whoever keeps painting the plaza statue... we know it was you.' },
    { who: 'lumi', text: "It looks AMAZING though. Keep it up!" },
  ],
  [
    { who: 'lumi', text: "The Whirl Splatling just hit the shop! Spin it up, then let it rip!" },
    { who: 'sepia', text: 'Brrrrrrt.' },
  ],
];

/**
 * Splashburg News: Lumi and Sepia (the idol duo Tide Pop) announce the stages on rotation.
 * Shown when you arrive in the plaza and the rotation changed since you last watched.
 */
export class News {
  private root = document.getElementById('news')!;
  private lines: Line[] = [];
  private i = 0;
  private typing = 0;
  private typeTimer = 0;
  private resolve: (() => void) | null = null;
  private rot: Rotation = currentRotation();

  constructor(private sfx: Sfx) {
    this.root.querySelector('.news-lumi')!.innerHTML = idolSvg(LUMI);
    this.root.querySelector('.news-sepia')!.innerHTML = idolSvg(SEPIA);
    this.root.addEventListener('click', () => this.next());
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Escape') this.close();
      else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') this.next();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }

  get open() {
    return !this.root.classList.contains('hidden');
  }

  /** Has the rotation changed since the player last saw the news? */
  isNew(lastSlot: number) {
    return lastSlot !== this.slot();
  }

  slot() {
    return Math.floor(Date.now() / ROTATION_MS);
  }

  show(): Promise<void> {
    this.rot = currentRotation();
    const r = this.rot;
    const [t1, t2] = r.turf, [z1, z2] = r.zones;
    this.lines = [
      pick([
        { who: 'lumi', text: "Heyyy Splashburg! It's Lumi!" },
        { who: 'lumi', text: 'Hiii everyone! Lumi here, fresh and inky!' },
      ]),
      pick([
        { who: 'sepia', text: "...and I'm Sepia. This is Splashburg News." },
        { who: 'sepia', text: 'Sepia. Hi. Welcome to Splashburg News.' },
      ]),
      { who: 'lumi', text: `${MODE_NAMES.turf} is on ${t1.name} and ${t2.name}!` },
      { who: 'sepia', text: `${MODE_NAMES.zones} is at ${z1.name} and ${z2.name}. Hold that zone.` },
      { who: 'lumi', text: `And ${MODE_NAMES.tower} rolls through ${r.tower[0].name} and ${r.tower[1].name}!` },
      { who: 'lumi', text: 'Battle on those stages for bonus coins!' },
      ...pick(BANTER),
      { who: 'sepia', text: `New stages in ${formatEndsIn(r.endsIn)}.` },
      { who: 'both', text: pick(['Stay inky!', 'Stay fresh, stay inky!', 'See you in the ink!']) },
    ] as Line[];
    this.renderStages();
    this.i = 0;
    this.root.classList.remove('hidden');
    this.say();
    return new Promise((res) => (this.resolve = res));
  }

  private renderStages() {
    const r = this.rot;
    const card = (name: string, id: string) => `<div class="news-stage st-${id}"><span>${name}</span></div>`;
    this.root.querySelector('.news-stages')!.innerHTML = `
      <div class="news-mode"><div class="nm-title">${MODE_NAMES.turf}</div>${card(r.turf[0].name, r.turf[0].id)}${card(r.turf[1].name, r.turf[1].id)}</div>
      <div class="news-mode zones"><div class="nm-title">${MODE_NAMES.zones}</div>${card(r.zones[0].name, r.zones[0].id)}${card(r.zones[1].name, r.zones[1].id)}</div>
      <div class="news-mode tower"><div class="nm-title">${MODE_NAMES.tower}</div>${card(r.tower[0].name, r.tower[0].id)}${card(r.tower[1].name, r.tower[1].id)}</div>`;
  }

  private say() {
    const l = this.lines[this.i];
    const box = this.root.querySelector('.news-text') as HTMLElement;
    const tag = this.root.querySelector('.news-name') as HTMLElement;
    tag.textContent = NAMES[l.who];
    tag.className = `news-name ${l.who}`;
    this.root.querySelector('.news-lumi')!.classList.toggle('talking', l.who !== 'sepia');
    this.root.querySelector('.news-sepia')!.classList.toggle('talking', l.who !== 'lumi');
    // typewriter
    clearInterval(this.typeTimer);
    this.typing = 0;
    box.textContent = '';
    this.typeTimer = window.setInterval(() => {
      this.typing++;
      box.textContent = l.text.slice(0, this.typing);
      if (this.typing % 3 === 0) this.sfx.blip(l.who === 'sepia' ? 0.8 : 1.25);
      if (this.typing >= l.text.length) clearInterval(this.typeTimer);
    }, 24);
  }

  private next() {
    const l = this.lines[this.i];
    if (this.typing < l.text.length) {
      // finish the line first
      clearInterval(this.typeTimer);
      this.typing = l.text.length;
      (this.root.querySelector('.news-text') as HTMLElement).textContent = l.text;
      return;
    }
    this.i++;
    if (this.i >= this.lines.length) this.close();
    else this.say();
  }

  close() {
    clearInterval(this.typeTimer);
    this.root.classList.add('hidden');
    this.sfx.ui();
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }
}
