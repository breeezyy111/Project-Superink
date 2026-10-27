import type { Sfx } from '../audio/Sfx';
import { cheats, resetCheats } from '../game/cheats';

/** The things the panel can do; main.ts wires them to the running game. */
export interface AdminActions {
  /** is the signed-in account an admin? */
  isAdmin(): boolean;
  equipGodGun(): void;
  addCoins(n: number): void;
  maxLevel(): void;
  unlockAll(): void;
  maxRank(): void;
  clearStory(): void;
  fillSpecial(): void;
  /** battle only */
  paintMap(): void;
  splatEnemies(): void;
  winNow(): void;
  /** story only */
  skipToGoal(): void;
  /** where we are, to grey out buttons that don't apply */
  where(): 'battle' | 'story' | 'plaza' | 'other';
  onOpen(): void;
  onClose(): void;
}

type Toggle = 'god' | 'oneHit' | 'infiniteInk' | 'infiniteSpecial' | 'freezeBots';

const TOGGLES: [Toggle, string, string][] = [
  ['god', 'God mode', 'Nothing can hurt you'],
  ['oneHit', 'One-hit splats', 'Every hit you land splats'],
  ['infiniteInk', 'Infinite ink', 'Your tank never runs dry'],
  ['infiniteSpecial', 'Infinite special', 'Special always ready (Q)'],
  ['freezeBots', 'Freeze bots', 'Enemies stand still'],
];

/** The overpowered admin panel. Opens with F2 or the ` key, only for the admin account. */
export class AdminPanel {
  private root: HTMLElement;
  private body: HTMLElement;
  readonly actions: AdminActions;

  constructor(private sfx: Sfx, private a: AdminActions, private toast: (t: string) => void) {
    this.actions = a;
    this.root = document.createElement('section');
    this.root.id = 'admin';
    this.root.className = 'admin hidden';
    this.root.innerHTML = `
      <div class="admin-card" role="dialog" aria-label="Admin panel">
        <div class="admin-head"><span class="admin-tag">ADMIN</span><h2>Admin Control Panel</h2>
          <button class="admin-x" id="admin-close" aria-label="Close admin panel">✕</button></div>
        <div class="admin-body"></div>
        <div class="admin-foot">F2 or <kbd>\`</kbd> to open and close. Cheats only affect you.</div>
      </div>`;
    document.body.appendChild(this.root);
    this.body = this.root.querySelector('.admin-body')!;
    this.root.querySelector('#admin-close')!.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F2' && e.code !== 'Backquote') return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (!this.a.isAdmin()) return;
      e.preventDefault();
      if (this.open) this.close();
      else this.show();
    });
  }

  get open() {
    return !this.root.classList.contains('hidden');
  }

  show() {
    this.render();
    this.root.classList.remove('hidden');
    this.sfx.ui();
    this.a.onOpen();
  }

  close() {
    if (!this.open) return;
    this.root.classList.add('hidden');
    this.sfx.ui();
    this.a.onClose();
  }

  private render() {
    const where = this.a.where();
    const b = this.body;
    b.innerHTML = '';
    const section = (title: string) => {
      const s = document.createElement('div');
      s.className = 'admin-sec';
      s.innerHTML = `<div class="admin-sec-title">${title}</div>`;
      const grid = document.createElement('div');
      grid.className = 'admin-grid';
      s.appendChild(grid);
      b.appendChild(s);
      return grid;
    };
    const button = (grid: HTMLElement, label: string, run: () => void, enabled = true, hot = false) => {
      const el = document.createElement('button');
      el.className = 'admin-btn' + (hot ? ' hot' : '');
      el.textContent = label;
      el.disabled = !enabled;
      el.onclick = () => {
        run();
        this.sfx.coin();
        this.render();
      };
      grid.appendChild(el);
    };

    // weapon
    const w = section('The god gun');
    button(w, 'Equip the Golden Godblaster', () => {
      this.a.equipGodGun();
      this.toast('Golden Godblaster equipped!');
    }, true, true);

    // cheats
    const c = section('Cheats');
    for (const [key, name, hint] of TOGGLES) {
      const el = document.createElement('button');
      el.className = 'admin-toggle';
      el.setAttribute('aria-pressed', String(cheats[key]));
      el.innerHTML = `<b>${name}</b><span>${hint}</span>`;
      el.onclick = () => {
        cheats[key] = !cheats[key];
        this.sfx.ui();
        this.render();
      };
      c.appendChild(el);
    }
    const mult = (label: string, key: 'speed' | 'jump') => {
      const row = document.createElement('div');
      row.className = 'admin-mult';
      row.innerHTML = `<b>${label}</b>`;
      for (const v of [1, 2, 3]) {
        const el = document.createElement('button');
        el.className = 'admin-chip';
        el.textContent = `x${v}`;
        el.setAttribute('aria-pressed', String(cheats[key] === v));
        el.onclick = () => {
          cheats[key] = v;
          this.sfx.ui();
          this.render();
        };
        row.appendChild(el);
      }
      c.appendChild(row);
    };
    mult('Speed', 'speed');
    mult('Jump', 'jump');
    const off = document.createElement('button');
    off.className = 'admin-btn';
    off.textContent = 'All cheats off';
    off.onclick = () => {
      resetCheats();
      this.sfx.ui();
      this.render();
    };
    c.appendChild(off);

    // right now
    const now = section(where === 'battle' ? 'This battle' : where === 'story' ? 'This level' : 'In a battle or level');
    button(now, 'Fill special', () => this.a.fillSpecial(), where === 'battle' || where === 'story');
    button(now, 'Paint the whole map', () => this.a.paintMap(), where === 'battle');
    button(now, 'Splat every enemy', () => this.a.splatEnemies(), where === 'battle' || where === 'story');
    button(now, 'Win right now', () => this.a.winNow(), where === 'battle', true);
    button(now, 'Skip to the goal', () => this.a.skipToGoal(), where === 'story');

    // progress
    const p = section('Your progress');
    button(p, '+10,000 coins', () => this.a.addCoins(10000));
    button(p, '+1,000,000 coins', () => this.a.addCoins(1000000));
    button(p, 'Max level', () => this.a.maxLevel());
    button(p, 'Unlock every item', () => this.a.unlockAll());
    button(p, 'Rank S+', () => this.a.maxRank());
    button(p, 'Clear all story levels', () => this.a.clearStory());
  }
}
