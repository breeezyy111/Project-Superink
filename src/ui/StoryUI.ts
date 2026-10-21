import type { Sfx } from '../audio/Sfx';
import type { Profile } from '../game/profile';
import { LEVELS, LevelDef } from '../story/levels';
import { drGloopSvg } from './Mascots';

const $ = (id: string) => document.getElementById(id)!;

/** Level select for story mode, plus the "level clear" card. */
export class StoryUI {
  constructor(private profile: Profile, private sfx: Sfx, private onPlay: (l: LevelDef) => void, private onClose: () => void) {
    $('btn-story-close').addEventListener('click', () => this.close());
  }

  get open() {
    return !$('story-menu').classList.contains('hidden');
  }

  unlocked(i: number) {
    return i === 0 || this.profile.story.includes(LEVELS[i - 1].id);
  }

  show() {
    const list = $('story-levels');
    list.innerHTML = '';
    LEVELS.forEach((l, i) => {
      const done = this.profile.story.includes(l.id);
      const open = this.unlocked(i);
      const c = document.createElement('div');
      c.className = `story-card ${done ? 'done' : ''} ${open ? '' : 'locked'} ${l.boss ? 'boss' : ''}`;
      c.innerHTML = `<div class="sc-num">${l.boss ? '!' : i + 1}</div>
        <div class="sc-body"><div class="sc-name">${l.name}</div><div class="sc-blurb">${open ? l.blurb : 'Clear the level before this one to unlock.'}</div></div>
        <div class="sc-side">${done ? '<span class="sc-check">✔</span>' : open ? `<span class="coin-ico"></span>${l.coins}` : '🔒'}</div>`;
      if (open) {
        c.onclick = () => {
          this.sfx.ui();
          this.hide();
          this.onPlay(l);
        };
      }
      list.appendChild(c);
    });
    $('story-villain').innerHTML = drGloopSvg();
    $('story-menu').classList.remove('hidden');
  }

  private hide() {
    $('story-menu').classList.add('hidden');
  }

  close() {
    if (!this.open) return;
    this.hide();
    this.sfx.ui();
    this.onClose();
  }

  /** Level clear card. Returns once the player picks what to do next. */
  done(level: LevelDef, stats: { time: number; deaths: number; splats: number }, coins: number, first: boolean): Promise<'next' | 'hub' | 'again'> {
    const i = LEVELS.indexOf(level);
    const hasNext = i < LEVELS.length - 1;
    const m = Math.floor(stats.time / 60), s = Math.floor(stats.time % 60);
    $('sd-title').textContent = level.boss ? 'GREAT INK ORB RECOVERED!' : 'ORB SHARD GET!';
    $('sd-level').textContent = level.name;
    $('sd-stats').innerHTML = `
      <div><span>Time</span><b>${m}:${String(s).padStart(2, '0')}</b></div>
      <div><span>Splats</span><b>${stats.splats}</b></div>
      <div><span>Falls</span><b>${stats.deaths}</b></div>
      <div><span>Coins</span><b><span class="coin-ico"></span>+${coins}${first ? ' <em>first clear!</em>' : ''}</b></div>`;
    const next = $('btn-sd-next') as HTMLButtonElement;
    next.classList.toggle('hidden', !hasNext);
    next.textContent = LEVELS[i + 1]?.boss ? 'FACE DR. GLOOP!' : 'NEXT LEVEL';
    $('story-done').classList.remove('hidden');
    return new Promise((res) => {
      const pick = (v: 'next' | 'hub' | 'again') => () => {
        this.sfx.ui();
        $('story-done').classList.add('hidden');
        res(v);
      };
      next.onclick = pick('next');
      ($('btn-sd-hub') as HTMLButtonElement).onclick = pick('hub');
      ($('btn-sd-again') as HTMLButtonElement).onclick = pick('again');
    });
  }
}
