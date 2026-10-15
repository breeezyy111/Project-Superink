import '@fontsource/titan-one';
import '@fontsource/baloo-2/600.css';
import '@fontsource/baloo-2/800.css';
import './style.css';
import * as THREE from 'three';
import { Sfx } from './audio/Sfx';
import { Renderer } from './engine/Renderer';
import { DEFAULT_LOOK, EYE_COLORS, HAIR_NAMES, Look, SHIRT_COLORS, SKIN_TONES } from './game/InkfinModel';
import { Match } from './game/Match';
import { PlayerController } from './game/PlayerController';
import { WeaponKind, WEAPONS } from './game/weapons';
import { InkSystem } from './ink/InkSystem';
import { CUTTLE_SVG, Hud } from './ui/Hud';
import { LockerStage } from './ui/LockerStage';
import { Physics } from './world/Physics';
import { SkateparkMap } from './world/SkateparkMap';

type Screen = 'title' | 'locker' | 'match' | 'results';

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);

interface Profile {
  name: string;
  look: Look;
  weapon: WeaponKind;
  sens: number;
  invert: boolean;
  volume: number;
}

function loadProfile(): Profile {
  const def: Profile = { name: 'Player', look: { ...DEFAULT_LOOK }, weapon: 'shooter', sens: 2.4, invert: false, volume: 0.6 };
  try {
    const raw = localStorage.getItem('superink.profile');
    if (raw) return { ...def, ...JSON.parse(raw), look: { ...def.look, ...JSON.parse(raw).look } };
  } catch {
    /* storage unavailable */
  }
  return def;
}
function saveProfile(p: Profile) {
  try {
    localStorage.setItem('superink.profile', JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

async function boot() {
  // make sure the display font is ready before graffiti textures are drawn
  try {
    await document.fonts.load('900 64px "Titan One"');
  } catch {
    /* fallback font is fine */
  }

  const r = new Renderer($('app'));
  const physics = await Physics.create();
  const ink = new InkSystem();
  const map = new SkateparkMap(physics, ink);
  r.scene.add(map.group);
  physics.step(); // build query structures for the static map

  const sfx = new Sfx();
  const hud = new Hud();
  const controller = new PlayerController(r.renderer.domElement);
  const profile = loadProfile();
  sfx.volume = profile.volume;
  controller.sensitivity = profile.sens / 1000;
  controller.invertY = profile.invert;

  const locker = new LockerStage(r.studioEnv, '#ff2fa8');
  locker.setLook(profile.look, profile.weapon);
  locker.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => locker.resize(window.innerWidth, window.innerHeight));

  let screen: Screen = 'title';
  let match: Match | null = null;
  let paused = false;
  let orbit = 0;

  const show = (id: string, v: boolean) => $(id).classList.toggle('hidden', !v);

  const newMatch = (demo: boolean) => {
    match?.dispose();
    match = new Match(r, physics, ink, map, sfx, demo ? null : controller, {
      onFeed: (t, k) => hud.pushFeed(t, k),
      onPlayerSplatted: (by) => hud.showSplatted(by),
      onPlayerRespawn: () => hud.hideSplatted(),
      onHitMarker: () => hud.hitMarker(),
      onPhase: (p) => {
        if (demo || screen !== 'match') return;
        if (p === 'countdown') hud.bigText('READY?', false, 2600);
        if (p === 'play') hud.bigText('GO!', true, 900);
        if (p === 'finish') {
          hud.bigText('GAME!', false, 0);
          controller.releaseLock();
        }
        if (p === 'done') showResults();
      },
    }, { look: profile.look, weapon: profile.weapon, name: profile.name || 'Player', demo });
    hud.setup(match);
  };

  // ---------- title ----------
  const goTitle = () => {
    screen = 'title';
    show('title', true);
    show('locker', false);
    show('hud', false);
    show('results', false);
    newMatch(true);
  };
  $('btn-start').addEventListener('click', () => {
    sfx.unlock();
    sfx.ui();
    goLocker();
  });

  // ---------- locker ----------
  const buildLocker = () => {
    const swatches = (el: HTMLElement, list: string[], get: () => string, set: (c: string) => void) => {
      el.innerHTML = '';
      for (const c of list) {
        const b = document.createElement('div');
        b.className = 'swatch' + (get() === c ? ' sel' : '');
        b.style.background = c;
        b.onclick = () => {
          set(c);
          sfx.ui();
          refresh();
        };
        el.appendChild(b);
      }
    };
    const refresh = () => {
      swatches($('sw-skin'), SKIN_TONES, () => profile.look.skin, (c) => (profile.look.skin = c));
      swatches($('sw-eyes'), EYE_COLORS, () => profile.look.eyes, (c) => (profile.look.eyes = c));
      swatches($('sw-shirt'), SHIRT_COLORS, () => profile.look.shirt, (c) => (profile.look.shirt = c));
      const hair = $('sw-hair');
      hair.innerHTML = '';
      HAIR_NAMES.forEach((n, i) => {
        const b = document.createElement('div');
        b.className = 'chip' + (profile.look.hair === i ? ' sel' : '');
        b.textContent = n;
        b.onclick = () => {
          profile.look.hair = i as Look['hair'];
          sfx.ui();
          refresh();
        };
        hair.appendChild(b);
      });
      const wl = $('weapons');
      wl.innerHTML = '';
      for (const w of Object.values(WEAPONS)) {
        const card = document.createElement('div');
        card.className = 'wcard' + (profile.weapon === w.kind ? ' sel' : '');
        const bar = (label: string, v: number) =>
          `<div class="stat"><span>${label}</span><div class="bar"><div style="width:${v * 100}%"></div></div></div>`;
        card.innerHTML = `<div class="wn">${w.name}</div><div class="wb">${w.blurb}</div>
          <div class="stats">${bar('RANGE', w.stats.range)}${bar('DAMAGE', w.stats.damage)}${bar('RATE', w.stats.fireRate)}${bar('MOBILITY', w.stats.mobility)}</div>`;
        card.onclick = () => {
          profile.weapon = w.kind;
          sfx.ui();
          refresh();
        };
        wl.appendChild(card);
      }
      locker.setLook(profile.look, profile.weapon);
      saveProfile(profile);
    };
    const nameIn = $('in-name') as HTMLInputElement;
    nameIn.value = profile.name;
    nameIn.oninput = () => {
      profile.name = nameIn.value.trim().slice(0, 12) || 'Player';
      saveProfile(profile);
    };
    refresh();
  };

  const goLocker = () => {
    screen = 'locker';
    match?.dispose();
    match = null;
    controller.releaseLock();
    show('title', false);
    show('hud', false);
    show('results', false);
    show('pause', false);
    show('locker', true);
    buildLocker();
  };

  const startMatch = () => {
    sfx.unlock();
    screen = 'match';
    paused = false;
    show('locker', false);
    show('results', false);
    show('pause', false);
    show('hud', true);
    newMatch(false);
    controller.requestLock();
  };
  $('btn-ready').addEventListener('click', () => {
    sfx.ui();
    startMatch();
  });

  // ---------- pause ----------
  const sens = $('in-sens') as HTMLInputElement;
  const inv = $('in-invert') as HTMLInputElement;
  const vol = $('in-vol') as HTMLInputElement;
  sens.value = String(profile.sens);
  inv.checked = profile.invert;
  vol.value = String(profile.volume);
  sens.oninput = () => {
    profile.sens = parseFloat(sens.value);
    controller.sensitivity = profile.sens / 1000;
    saveProfile(profile);
  };
  inv.onchange = () => {
    profile.invert = inv.checked;
    controller.invertY = inv.checked;
    saveProfile(profile);
  };
  vol.oninput = () => {
    profile.volume = parseFloat(vol.value);
    sfx.volume = profile.volume;
    saveProfile(profile);
  };
  controller.onPause = () => {
    if (screen === 'match' && match && match.phase !== 'finish' && match.phase !== 'done') {
      paused = true;
      show('pause', true);
    }
  };
  $('btn-resume').addEventListener('click', () => {
    paused = false;
    show('pause', false);
    controller.requestLock();
  });
  $('btn-quit').addEventListener('click', () => {
    paused = false;
    goLocker();
  });

  // ---------- results ----------
  const showResults = () => {
    if (!match) return;
    screen = 'results';
    controller.releaseLock();
    hud.hideBig();
    const m = match;
    const [a, b] = ink.turf();
    const win: 0 | 1 = a >= b ? 0 : 1;
    show('results', true);
    const winner = $('res-winner');
    winner.textContent = win === 0 ? 'YOUR TEAM WINS!' : 'DEFEAT...';
    winner.style.color = m.colorOf(win);
    const fa = $('res-a'), fb = $('res-b');
    fa.style.background = m.pair.alpha;
    fb.style.background = m.pair.bravo;
    fa.style.width = fb.style.width = '0%';
    $('res-a-pct').textContent = '';
    $('res-b-pct').textContent = '';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // bars show each team's share of the painted turf; labels show map coverage
        const total = Math.max(1e-6, a + b);
        fa.style.width = `${Math.max(4, (a / total) * 100)}%`;
        fb.style.width = `${Math.max(4, (b / total) * 100)}%`;
      }),
    );
    setTimeout(() => {
      $('res-a-pct').textContent = `${(a * 100).toFixed(1)}%`;
      $('res-b-pct').textContent = `${(b * 100).toFixed(1)}%`;
      sfx.whistle();
    }, 2300);
    const rows = m.characters
      .map(
        (c) => `<tr class="${c.isPlayer ? 'me' : ''}"><td><span class="dot" style="background:${m.colorOf(c.team)}"></span></td>
        <td>${escapeHtml(c.name)}</td><td>${WEAPONS[c.weapon.kind].name}</td><td>${c.splats} splats</td><td>${c.deaths} falls</td></tr>`,
      )
      .join('');
    $('res-table').innerHTML = rows;
  };
  $('btn-again').addEventListener('click', () => {
    sfx.ui();
    startMatch();
  });
  $('btn-locker').addEventListener('click', () => {
    sfx.ui();
    goLocker();
  });

  // little cuttlefish next to the PLAY button
  $('btn-start').insertAdjacentHTML('afterbegin', `<span style="display:inline-block;width:40px;height:40px;vertical-align:-6px;margin-right:10px">${CUTTLE_SVG('#ff2fa8')}</span>`);

  // ---------- main loop ----------
  const timer = new THREE.Timer();
  timer.connect(document);
  const tick = () => {
    requestAnimationFrame(tick);
    timer.update();
    const dt = Math.min(timer.getDelta(), 1 / 20);

    if (screen === 'locker') {
      locker.update(dt);
      r.renderer.render(locker.scene, locker.camera);
      return;
    }
    controller.allowLock = screen === 'match' && !paused && !params.has('demo');
    if (match && !paused) match.update(dt);
    if (match) {
      if (params.has('follow') && screen === 'match') {
        controller.follow(dt, match.player, r.camera, physics);
        hud.update(match);
      } else if (screen === 'title' || (params.has('demo') && screen === 'match')) {
        orbit += dt * 0.06;
        r.camera.position.set(Math.sin(orbit) * 42, 26, Math.cos(orbit) * 42);
        r.camera.lookAt(0, 0, 0);
      } else if (screen === 'match' || screen === 'results') {
        match.spectate(dt, r.camera);
        hud.update(match);
        hud.setClickLock(screen === 'match' && match.phase === 'play' && !controller.locked && !paused);
      }
    }
    r.render();
  };

  $('loading').classList.add('hidden');
  if (params.has('play')) {
    // dev shortcut: jump straight into a match (?play or ?play&demo)
    screen = 'match';
    show('title', false);
    show('hud', true);
    newMatch(params.has('demo'));
  } else {
    goTitle();
  }
  tick();

  // expose for debugging in the console
  (window as unknown as { superink: unknown }).superink = {
    get match() { return match; },
    ink, physics, r, locker,
    /** advance the simulation without rendering (for testing) */
    step(n = 60, dt = 1 / 60) {
      for (let i = 0; i < n; i++) match?.update(dt);
    },
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

boot();
