import type { Sfx } from '../audio/Sfx';
import { EYE_COLORS, HAIR_NAMES, Look, MARK_NAMES, SKIN_TONES } from '../game/InkfinModel';
import { gear, GearItem, gearIn, kit, Kit, KITS, Slot, SPECIALS, SUBS } from '../game/items';
import type { Difficulty, Profile } from '../game/profile';
import type { Team } from '../config';
import type { ZoneId } from '../game/Hub';
import { Mode, MODE_NAMES } from '../game/Match';
import { currentRotation, ROTATION_BONUS } from '../game/rotation';
import { RANKED_LEVEL, rankedMode, RANKS } from '../game/ranked';
import { WEAPONS } from '../game/weapons';
import { STAGES } from '../world/stages';
import type { LockerStage } from './LockerStage';
import { MAX_PLAYERS, Room } from '../online/Room';

const $ = (id: string) => document.getElementById(id)!;

export interface ShopDeps {
  profile: Profile;
  sfx: Sfx;
  preview: LockerStage;
  save(): void;
  onLookChanged(): void;
  /** change the in-game name; null when names are locked (guests) */
  rename: ((name: string) => Promise<string>) | null;
  onClose(): void;
  onBattle(ranked?: boolean): void;
  friends: FriendsApi;
}

/** Online friends rooms, as seen from the Turf Tower. */
export interface FriendsApi {
  room(): Room | null;
  create(): Promise<void>;
  join(code: string): Promise<void>;
  leave(): void;
}

const INFO: Record<ZoneId, { tag: string; name: string; quotes: string[] }> = {
  arms: { tag: 'WEAPONS', name: 'Fizz & Splash Arms', quotes: ['"Every kit comes with a sub AND a special. No refunds on splats!" — Gil', '"Hot off the line, still dripping!" — Gil'] },
  threads: { tag: 'GEAR', name: 'Frill Threads', quotes: ['"Fresh fits for fresh fins, darling." — Mimi', '"Try it on! The mirror never lies." — Mimi'] },
  studio: { tag: 'SALON', name: 'Fin Studio', quotes: ['"Sit down, let\'s fluff those frills." — Coco', '"Stripes are SO in this season." — Coco'] },
  locker: { tag: 'INVENTORY', name: 'Your Locker', quotes: ['Everything you own, all in one place.'] },
  tower: { tag: 'LOBBY', name: 'Turf Tower', quotes: ['"Four on four. Three minutes. Most turf wins!" — Judge Jelly', '"Hold the zone, hold your nerve!" — Judge Jelly', '"Ride that tower all the way home!" — Judge Jelly'] },
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class ShopUI {
  private zone: ZoneId = 'arms';
  private tab: string = '';
  private selected: string | null = null;

  constructor(private d: ShopDeps) {
    $('btn-leave').addEventListener('click', () => this.close());
  }

  get open() {
    return !$('shop').classList.contains('hidden');
  }

  show(zone: ZoneId) {
    this.zone = zone;
    this.selected = null;
    this.tab = zone === 'threads' ? 'head' : zone === 'locker' ? 'kits' : '';
    const info = INFO[zone];
    $('shop-tag').textContent = info.tag;
    $('shop-name').textContent = info.name;
    $('shop-quote').textContent = pick(info.quotes);
    $('shop').classList.remove('hidden');
    this.render();
  }

  close() {
    if (!this.open) return;
    $('shop').classList.add('hidden');
    this.d.preview.setLook(this.d.profile.look, kit(this.d.profile.kit).main);
    this.d.sfx.ui();
    this.d.onClose();
  }

  private owned(id: string) {
    return this.d.profile.owned.includes(id);
  }

  /** re-draw the open shop (e.g. when the friends room changes) */
  refresh() {
    if (this.open) this.render();
  }

  get zoneId() {
    return this.zone;
  }

  private render() {
    const p = this.d.profile;
    $('shop-coins').textContent = p.coins.toLocaleString();
    const tabs = $('shop-tabs');
    tabs.innerHTML = '';
    const body = $('shop-body');
    body.innerHTML = '';
    const tabList: [string, string][] =
      this.zone === 'threads' ? [['head', 'HEADGEAR'], ['clothes', 'CLOTHES'], ['shoes', 'SHOES']]
        : this.zone === 'locker' ? [['kits', 'WEAPONS'], ['head', 'HEADGEAR'], ['clothes', 'CLOTHES'], ['shoes', 'SHOES']]
          : [];
    for (const [id, label] of tabList) {
      const t = document.createElement('div');
      t.className = 'tab' + (this.tab === id ? ' sel' : '');
      t.textContent = label;
      t.onclick = () => {
        this.tab = id;
        this.selected = null;
        this.d.sfx.ui();
        this.render();
      };
      tabs.appendChild(t);
    }
    switch (this.zone) {
      case 'arms': this.renderKits(body, KITS); break;
      case 'threads': this.renderGear(body, gearIn(this.tab as Slot)); break;
      case 'locker':
        if (this.tab === 'kits') this.renderKits(body, KITS.filter((k) => this.owned(k.id)));
        else this.renderGear(body, gearIn(this.tab as Slot).filter((g) => this.owned(g.id)));
        break;
      case 'studio': this.renderStudio(body); break;
      case 'tower': this.renderTower(body); break;
    }
  }

  // ---------- weapons ----------
  private renderKits(body: HTMLElement, list: Kit[]) {
    const p = this.d.profile;
    const sel = kit(this.selected ?? p.kit);
    const grid = document.createElement('div');
    grid.className = 'items';
    for (const k of list) {
      const w = WEAPONS[k.main];
      const el = this.itemCard(k.id, w.name, `${SUBS[k.sub].name} • ${SPECIALS[k.special].name}`, k.price, k.level, p.kit === k.id, sel.id === k.id);
      el.onclick = () => {
        this.selected = k.id;
        this.d.preview.setLook(p.look, k.main);
        this.d.sfx.ui();
        this.render();
      };
      grid.appendChild(el);
    }
    body.appendChild(grid);
    const w = WEAPONS[sel.main];
    const bar = (label: string, v: number) => `<div class="stat"><span>${label}</span><div class="bar"><div style="width:${v * 100}%"></div></div></div>`;
    const det = document.createElement('div');
    det.className = 'detail';
    det.innerHTML = `<h3>${w.name}</h3><div>${w.blurb}</div>
      <div class="kitline">Sub: <b>${SUBS[sel.sub].name}</b> — ${SUBS[sel.sub].blurb}</div>
      <div class="kitline">Special: <b>${SPECIALS[sel.special].name}</b> — ${SPECIALS[sel.special].blurb}</div>
      <div class="wcard" style="cursor:default"><div class="stats" style="grid-column:1/3;grid-row:auto">${bar('RANGE', w.stats.range)}${bar('DAMAGE', w.stats.damage)}${bar('RATE', w.stats.fireRate)}${bar('MOBILITY', w.stats.mobility)}</div></div>`;
    det.appendChild(this.actionRow(sel.id, sel.price, sel.level, p.kit === sel.id, () => {
      p.kit = sel.id;
    }));
    body.appendChild(det);
  }

  // ---------- gear ----------
  private renderGear(body: HTMLElement, list: GearItem[]) {
    const p = this.d.profile;
    const slot = this.tab as Slot;
    const equippedId = p.look[slot];
    const sel = gear(this.selected ?? equippedId);
    const grid = document.createElement('div');
    grid.className = 'items';
    for (const g of list) {
      const el = this.itemCard(g.id, g.name, g.brand, g.price, g.level, equippedId === g.id, sel.id === g.id, [g.color, g.accent]);
      el.onclick = () => {
        this.selected = g.id;
        // try it on!
        this.d.preview.setLook({ ...p.look, [slot]: g.id } as Look, kit(p.kit).main);
        this.d.sfx.ui();
        this.render();
      };
      grid.appendChild(el);
    }
    if (!list.length) grid.innerHTML = '<div class="hint">Nothing here yet. Visit Frill Threads!</div>';
    body.appendChild(grid);
    if (sel.slot !== slot) return;
    const det = document.createElement('div');
    det.className = 'detail';
    det.innerHTML = `<h3>${sel.name}</h3><div>${sel.brand} • ${slotName(slot)}</div>`;
    det.appendChild(this.actionRow(sel.id, sel.price, sel.level, equippedId === sel.id, () => {
      (p.look as unknown as Record<string, string>)[slot] = sel.id;
    }));
    body.appendChild(det);
  }

  private itemCard(id: string, name: string, sub: string, price: number, level: number, equipped: boolean, sel: boolean, colors?: string[]) {
    const p = this.d.profile;
    const el = document.createElement('div');
    const locked = level > p.level && !this.owned(id);
    el.className = 'item' + (sel ? ' sel' : '') + (locked ? ' locked' : '');
    const badge = equipped ? '<span class="ibadge on">ON</span>' : this.owned(id) ? '<span class="ibadge" style="background:#3a3350">OWNED</span>' : locked ? `<span class="ibadge">Lv ${level}</span>` : '';
    const sw = colors ? `<div class="swatch-row">${colors.map((c) => `<i style="background:${c}"></i>`).join('')}</div>` : '';
    const priceTag = this.owned(id) ? '' : `<div class="iprice"><span class="coin-ico"></span>${price.toLocaleString()}</div>`;
    el.innerHTML = `${badge}<div class="iname">${name}</div><div class="ibrand">${sub}</div>${sw}${priceTag}`;
    return el;
  }

  private actionRow(id: string, price: number, level: number, equipped: boolean, equip: () => void) {
    const p = this.d.profile;
    const row = document.createElement('div');
    row.className = 'row';
    const btn = document.createElement('button');
    btn.className = 'blob-btn small';
    if (this.owned(id)) {
      btn.textContent = equipped ? 'EQUIPPED' : 'EQUIP';
      btn.disabled = equipped;
      btn.onclick = () => {
        equip();
        this.d.save();
        this.d.onLookChanged();
        this.d.sfx.ui();
        this.render();
      };
    } else if (level > p.level) {
      btn.textContent = `UNLOCKS AT LV ${level}`;
      btn.disabled = true;
      btn.classList.add('alt');
    } else {
      btn.textContent = `BUY • ${price.toLocaleString()}`;
      btn.onclick = () => {
        if (p.coins < price) {
          this.d.sfx.denied();
          btn.textContent = 'NOT ENOUGH COINS';
          return;
        }
        p.coins -= price;
        p.owned.push(id);
        equip();
        this.d.save();
        this.d.onLookChanged();
        this.d.sfx.coin();
        this.render();
      };
    }
    row.appendChild(btn);
    return row;
  }

  // ---------- salon ----------
  private renderStudio(body: HTMLElement) {
    const p = this.d.profile;
    const apply = () => {
      this.d.save();
      this.d.onLookChanged();
      this.d.preview.setLook(p.look, kit(p.kit).main);
      this.d.sfx.ui();
      this.render();
    };
    const field = (label: string, inner: HTMLElement) => {
      const f = document.createElement('div');
      f.className = 'field';
      f.innerHTML = `<span>${label}</span>`;
      f.appendChild(inner);
      body.appendChild(f);
    };
    const name = document.createElement('input');
    name.value = p.name;
    name.maxLength = 20;
    const rename = this.d.rename;
    if (!rename) {
      // guests keep their Guest0N name; signing up lets them choose one
      name.disabled = true;
      field('Name <i style="text-transform:none;opacity:.7">(sign up to choose your own)</i>', name);
    } else {
      name.onchange = async () => {
        const wanted = name.value.trim().slice(0, 20);
        if (wanted.length < 3 || wanted === p.name) {
          name.value = p.name;
          return;
        }
        try {
          p.name = await rename(wanted);
          name.value = p.name;
          this.d.save();
          this.d.onLookChanged();
          this.d.sfx.coin();
        } catch (e) {
          name.value = p.name;
          this.d.sfx.denied();
          name.setCustomValidity((e as Error).message);
          name.reportValidity();
          setTimeout(() => name.setCustomValidity(''), 2500);
        }
      };
      field('Name', name);
    }
    const swatches = (list: string[], get: () => string, set: (c: string) => void) => {
      const el = document.createElement('div');
      el.className = 'swatches';
      for (const c of list) {
        const b = document.createElement('div');
        b.className = 'swatch' + (get() === c ? ' sel' : '');
        b.style.background = c;
        b.onclick = () => {
          set(c);
          apply();
        };
        el.appendChild(b);
      }
      return el;
    };
    const chips = (names: string[], get: () => number, set: (i: number) => void) => {
      const el = document.createElement('div');
      el.className = 'chips';
      names.forEach((n, i) => {
        const b = document.createElement('div');
        b.className = 'chip' + (get() === i ? ' sel' : '');
        b.textContent = n;
        b.onclick = () => {
          set(i);
          apply();
        };
        el.appendChild(b);
      });
      return el;
    };
    field('Skin', swatches(SKIN_TONES, () => p.look.skin, (c) => (p.look.skin = c)));
    field('Fin Hair', chips(HAIR_NAMES, () => p.look.hair, (i) => (p.look.hair = i as Look['hair'])));
    field('Face Marking', chips(MARK_NAMES, () => p.look.mark, (i) => (p.look.mark = i as Look['mark'])));
    field('Eyes', swatches(EYE_COLORS, () => p.look.eyes, (c) => (p.look.eyes = c)));
  }

  // ---------- lobby ----------
  private renderTower(body: HTMLElement) {
    const p = this.d.profile;
    const k = kit(p.kit);
    const kitEl = document.createElement('div');
    kitEl.className = 'detail';
    kitEl.innerHTML = `<div class="kitline">Your kit: <b>${WEAPONS[k.main].name}</b> + ${SUBS[k.sub].name} + ${SPECIALS[k.special].name}</div>`;
    body.appendChild(kitEl);
    const room = this.d.friends.room();
    const guest = !!room && !room.isHost;
    const go = document.createElement('button');
    go.className = 'blob-btn';
    go.textContent = room ? (guest ? 'WAITING FOR HOST...' : 'BATTLE WITH FRIENDS!') : 'BATTLE!';
    go.style.alignSelf = 'flex-start';
    go.disabled = guest;
    go.onclick = () => {
      if (guest) return;
      this.d.sfx.ui();
      $('shop').classList.add('hidden');
      this.d.onBattle();
    };
    body.appendChild(go);
    if (!room) this.renderRanked(body);
    this.renderFriends(body, room);
    if (guest) {
      const info = document.createElement('div');
      info.className = 'detail';
      const st = room.settings.stage === 'random' ? 'Random Stage' : STAGES.find((x) => x.id === room.settings.stage)?.name ?? '';
      info.innerHTML = `<div class="kitline">The host picks: <b>${MODE_NAMES[room.settings.mode]}</b> on <b>${st}</b></div>`;
      body.appendChild(info);
      return;
    }

    const modes = document.createElement('div');
    modes.className = 'card-list';
    const MODE_INFO: { id: Mode; blurb: string }[] = [
      { id: 'turf', blurb: 'Paint the most floor in 3 minutes.' },
      { id: 'zones', blurb: 'Take the zone in the middle and hold it. Your count drops while you own it. First to 0 wins!' },
      { id: 'tower', blurb: 'Ride the tower in the middle toward their base. It stops at checkpoints. Push it all the way to win!' },
    ];
    for (const o of MODE_INFO) {
      const c = document.createElement('div');
      c.className = 'stage-card' + (p.mode === o.id ? ' sel' : '');
      c.innerHTML = `<div class="sn">${MODE_NAMES[o.id]}</div><div class="sb">${o.blurb}</div>`;
      c.onclick = () => {
        p.mode = o.id;
        room?.setSettings({ mode: o.id });
        this.d.save();
        this.d.sfx.ui();
        this.render();
      };
      modes.appendChild(c);
    }
    const f0 = document.createElement('div');
    f0.className = 'field';
    f0.innerHTML = '<span>Mode</span>';
    f0.appendChild(modes);
    body.appendChild(f0);

    const rot = currentRotation()[p.mode];
    const stagesEl = document.createElement('div');
    stagesEl.className = 'card-list';
    const options: { id: string; name: string; blurb: string }[] = [
      { id: 'random', name: 'Random Stage', blurb: 'Picks one of the stages on rotation for you.' },
      ...STAGES.map((s) => ({ id: s.id, name: s.name, blurb: s.blurb })),
    ];
    for (const o of options) {
      const c = document.createElement('div');
      c.className = 'stage-card' + (p.stage === o.id ? ' sel' : '');
      const star = rot.some((st) => st.id === o.id) ? `<span class="rot-badge">★ ON ROTATION +${ROTATION_BONUS * 100}%</span>` : '';
      c.innerHTML = `<div class="sn">${o.name}${star}</div><div class="sb">${o.blurb}</div>`;
      c.onclick = () => {
        p.stage = o.id;
        room?.setSettings({ stage: o.id });
        this.d.save();
        this.d.sfx.ui();
        this.render();
      };
      stagesEl.appendChild(c);
    }
    const f1 = document.createElement('div');
    f1.className = 'field';
    f1.innerHTML = '<span>Stage</span>';
    f1.appendChild(stagesEl);
    body.appendChild(f1);

    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const dId of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const b = document.createElement('div');
      b.className = 'chip' + (p.difficulty === dId ? ' sel' : '');
      b.textContent = dId.toUpperCase();
      b.onclick = () => {
        p.difficulty = dId;
        this.d.save();
        this.d.sfx.ui();
        this.render();
      };
      seg.appendChild(b);
    }
    const f2 = document.createElement('div');
    f2.className = 'field';
    f2.innerHTML = '<span>Bot difficulty</span>';
    f2.appendChild(seg);
    body.appendChild(f2);
  }

  private renderRanked(body: HTMLElement) {
    const p = this.d.profile;
    const f = document.createElement('div');
    f.className = 'field';
    f.innerHTML = '<span>Ranked battle</span>';
    const box = document.createElement('div');
    box.className = 'ranked';
    if (p.level < RANKED_LEVEL) {
      box.innerHTML = `<div class="hint">Reach Lv ${RANKED_LEVEL} to unlock Ranked battles.</div>`;
    } else {
      const mode = rankedMode();
      const stages = currentRotation()[mode];
      box.innerHTML = `<div class="rk-row"><span class="rank-badge r${Math.floor(p.rank / 3)}">${RANKS[p.rank]}</span>
        <div class="rk-meter"><div class="rk-fill" style="width:${p.rankPts}%"></div></div></div>
        <div class="hint">Now: <b>${MODE_NAMES[mode]}</b> on ${stages[0].name} / ${stages[1].name}. Win to fill your meter, lose and it drains. Bots get tougher as you climb.</div>`;
      const btn = document.createElement('button');
      btn.className = 'blob-btn small ranked-btn';
      btn.textContent = 'RANKED BATTLE!';
      btn.onclick = () => {
        this.d.sfx.ui();
        $('shop').classList.add('hidden');
        this.d.onBattle(true);
      };
      box.appendChild(btn);
    }
    f.appendChild(box);
    body.appendChild(f);
  }

  private renderFriends(body: HTMLElement, room: Room | null) {
    const f = document.createElement('div');
    f.className = 'field';
    f.innerHTML = '<span>Play with friends (online)</span>';
    const box = document.createElement('div');
    box.className = 'friends';
    f.appendChild(box);
    body.appendChild(f);
    const err = document.createElement('div');
    err.className = 'friends-err';
    const busy = (b: HTMLButtonElement, p: Promise<void>, label: string) => {
      const old = b.textContent;
      b.disabled = true;
      b.textContent = label;
      err.textContent = '';
      p.catch((e) => {
        err.textContent = (e as Error).message;
        b.disabled = false;
        b.textContent = old;
      });
    };
    if (!room) {
      box.innerHTML = `<div class="hint">Make a room and share the code. Up to ${MAX_PLAYERS} players; bots fill empty spots.</div>`;
      const row = document.createElement('div');
      row.className = 'friends-row';
      const create = document.createElement('button');
      create.className = 'blob-btn small';
      create.textContent = 'CREATE ROOM';
      create.onclick = () => {
        this.d.sfx.ui();
        busy(create, this.d.friends.create(), 'CREATING...');
      };
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 5;
      input.placeholder = 'CODE';
      input.className = 'code-input';
      input.addEventListener('input', () => (input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
      const join = document.createElement('button');
      join.className = 'blob-btn small alt';
      join.textContent = 'JOIN';
      const doJoin = () => {
        this.d.sfx.ui();
        busy(join, this.d.friends.join(input.value), 'JOINING...');
      };
      join.onclick = doJoin;
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') doJoin();
      });
      row.append(create, input, join);
      box.append(row, err);
      return;
    }
    const head = document.createElement('div');
    head.className = 'friends-row';
    head.innerHTML = `<div class="room-code">Room <b>${room.code}</b></div>`;
    const copy = document.createElement('button');
    copy.className = 'chip';
    copy.textContent = 'COPY';
    copy.onclick = () => {
      navigator.clipboard?.writeText(room.code).catch(() => {});
      copy.textContent = 'COPIED!';
    };
    const leave = document.createElement('button');
    leave.className = 'chip';
    leave.textContent = 'LEAVE ROOM';
    leave.onclick = () => {
      this.d.sfx.ui();
      this.d.friends.leave();
    };
    head.append(copy, leave);
    const teams = document.createElement('div');
    teams.className = 'room-teams';
    for (const t of [0, 1] as Team[]) {
      const col = document.createElement('div');
      col.className = `room-team t${t}`;
      col.innerHTML = `<div class="rt-title">Team ${t + 1}</div>`;
      const ms = room.members.filter((m) => m.team === t);
      for (const m of ms) {
        const el = document.createElement('div');
        el.className = 'room-member' + (m.id === room.myId ? ' me' : '') + (room.isHost ? ' can-move' : '');
        el.textContent = `${m.host ? '★ ' : ''}${m.name}`;
        if (room.isHost) {
          el.title = 'Click to switch team';
          el.onclick = () => {
            this.d.sfx.ui();
            room.setTeam(m.id, (1 - m.team) as Team);
          };
        }
        col.appendChild(el);
      }
      for (let i = ms.length; i < MAX_PLAYERS / 2; i++) {
        const el = document.createElement('div');
        el.className = 'room-member bot';
        el.textContent = 'Bot';
        col.appendChild(el);
      }
      teams.appendChild(col);
    }
    box.append(head, teams);
    if (room.isHost) {
      const h = document.createElement('div');
      h.className = 'hint';
      h.textContent = 'Click a name to switch their team. You pick the mode and stage below.';
      box.appendChild(h);
    }
  }
}

function slotName(s: Slot) {
  return s === 'head' ? 'Headgear' : s === 'clothes' ? 'Clothes' : 'Shoes';
}

