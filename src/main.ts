import '@fontsource/titan-one';
import '@fontsource/baloo-2/600.css';
import '@fontsource/baloo-2/800.css';
import './style.css';
import * as THREE from 'three';
import { Music } from './audio/Music';
import { Sfx } from './audio/Sfx';
import { Renderer } from './engine/Renderer';
import { Hub, HUB_DEF, ZONES } from './game/Hub';
import { kit } from './game/items';
import { Match, MatchSummary } from './game/Match';
import { PlayerController } from './game/PlayerController';
import { addXp, defaultProfile, loadProfile, Profile, saveProfile, xpToNext } from './game/profile';
import { WEAPONS } from './game/weapons';
import { CUTTLE_SVG, Hud } from './ui/Hud';
import { LockerStage } from './ui/LockerStage';
import { Minimap } from './ui/Minimap';
import { Account, friendlyError } from './online/Account';
import { AccountPanel, AuthUI, toast } from './ui/AuthUI';
import { ShopUI } from './ui/Shops';
import { Stage, StageDef } from './world/Stage';
import { stageById, STAGES } from './world/stages';

type Screen = 'title' | 'hub' | 'match' | 'results';

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);

async function boot() {
  // make sure the display font is ready before signs and graffiti are drawn
  try {
    await document.fonts.load('900 64px "Titan One"');
  } catch {
    /* fallback font is fine */
  }

  const r = new Renderer($('app'));
  const sfx = new Sfx();
  const music = new Music();
  const hud = new Hud();
  const minimap = new Minimap($('minimap'));
  const controller = new PlayerController(r.renderer.domElement);
  const profile = loadProfile();
  const account = new Account();
  const save = () => {
    saveProfile(profile);
    account.queueSync(profile);
  };
  /** Bring in the cloud copy of your progress after signing in (or upload this one if there is none). */
  const adoptRemote = (remote: Profile | null) => {
    if (remote) {
      const def = defaultProfile();
      Object.assign(profile, def, remote, { look: { ...def.look, ...remote.look } });
      for (const id of def.owned) if (!profile.owned.includes(id)) profile.owned.push(id);
    }
    if (account.online && account.displayName) profile.name = account.displayName;
    save();
    sfx.volume = profile.volume;
    music.volume = profile.music;
    controller.sensitivity = profile.sens / 1000;
    controller.invertY = profile.invert;
  };
  sfx.volume = profile.volume;
  music.volume = profile.music;
  controller.sensitivity = profile.sens / 1000;
  controller.invertY = profile.invert;
  music.onNowPlaying = (b) => {
    const el = $('now-playing');
    el.textContent = `♪ ${b.band} — "${b.song}"`;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  };

  const preview = new LockerStage(r.studioEnv, '#ff2fa8');
  preview.setLook(profile.look, kit(profile.kit).main);
  preview.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => preview.resize(window.innerWidth, window.innerHeight));

  let screen: Screen = 'title';
  let stage: Stage | null = null;
  let match: Match | null = null;
  let hub: Hub | null = null;
  let paused = false;
  let busy = false;
  let lookDirty = false;
  let orbit = 0;
  let lastStageId = '';

  const show = (id: string, v: boolean) => $(id).classList.toggle('hidden', !v);
  const loading = (v: boolean) => show('loading', v);
  const unlockAudio = () => {
    sfx.unlock();
    music.attach(sfx.context);
  };

  const teardown = () => {
    minimap.hide();
    match?.dispose();
    match = null;
    hub?.dispose();
    hub = null;
    stage?.dispose(r.scene);
    stage = null;
  };

  const loadStage = async (def: StageDef) => {
    teardown();
    stage = await Stage.create(def);
    r.scene.add(stage.group);
    return stage;
  };

  const pickStage = () => {
    if (params.get('stage')) return stageById(params.get('stage')!);
    if (profile.stage !== 'random') return stageById(profile.stage);
    const pool = STAGES.filter((s) => s.id !== lastStageId);
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const newMatch = (st: Stage, demo: boolean) => {
    match = new Match(r, st, sfx, demo ? null : controller, {
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
    }, { look: profile.look, kit: kit(profile.kit), name: profile.name || 'Player', demo, difficulty: profile.difficulty });
    hud.setup(match);
    if (!demo) minimap.setup(match);
  };

  const hideAll = () => {
    for (const id of ['title', 'hub-hud', 'shop', 'hud', 'results', 'pause']) show(id, false);
  };

  // ---------- title ----------
  const goTitle = async () => {
    screen = 'title';
    hideAll();
    show('title', true);
    const st = await loadStage(STAGES[Math.floor(Math.random() * STAGES.length)]);
    newMatch(st, true);
    loading(false);
  };
  const auth = new AuthUI({
    account,
    sfx,
    onDone: (remote) => {
      adoptRemote(remote);
      goHub(true);
    },
    onBack: () => {
      if (screen === 'hub') controller.requestLock();
      else show('title', true);
    },
  });
  $('btn-start').addEventListener('click', async () => {
    unlockAudio();
    sfx.ui();
    if (busy) return;
    // returning players are signed straight back in; everyone else sees the (optional) sign-in page
    if (account.online) return goHub(true);
    if (account.hasSavedSession && account.configured) {
      busy = true;
      loading(true);
      try {
        const remote = await account.resume();
        busy = false;
        if (account.online) {
          adoptRemote(remote);
          toast(`Welcome back, ${account.displayName}!`);
          return goHub(true);
        }
      } catch (e) {
        busy = false;
        toast(friendlyError(e), true);
      }
      loading(false);
    }
    show('title', false);
    auth.show();
  });
  $('btn-start').insertAdjacentHTML('afterbegin', `<span style="display:inline-block;width:40px;height:40px;vertical-align:-6px;margin-right:10px">${CUTTLE_SVG('#ff2fa8')}</span>`);

  // ---------- hub ----------
  const accountPanel = new AccountPanel(account, auth, sfx, () => {
    // signed out: back to the title, local progress stays in this browser
    profile.name = 'Player';
    saveProfile(profile);
    teardown();
    goTitle();
  }, () => controller.requestLock());
  $('profile-chip').addEventListener('click', () => {
    if (screen !== 'hub' || shop.open) return;
    controller.releaseLock();
    accountPanel.show();
  });

  const updateProfileChip = () => {
    $('pc-level').textContent = String(profile.level);
    $('pc-name').textContent = profile.name;
    $('pc-coins').textContent = profile.coins.toLocaleString();
    $('pc-xp').style.width = `${Math.min(100, (profile.xp / xpToNext(profile.level)) * 100)}%`;
  };

  const goHub = async (lock = false) => {
    if (busy) return;
    busy = true;
    loading(true);
    controller.releaseLock();
    hideAll();
    const st = await loadStage(HUB_DEF);
    hub = new Hub(r, st, sfx, controller, { look: profile.look, kit: kit(profile.kit), name: profile.name });
    screen = 'hub';
    paused = false;
    show('hub-hud', true);
    updateProfileChip();
    music.play('tidepool');
    loading(false);
    busy = false;
    if (lock) controller.requestLock();
  };

  const shop = new ShopUI({
    profile,
    sfx,
    preview,
    save,
    get rename() {
      if (account.mode === 'guest') return null;
      return async (name: string) => {
        if (!/^[A-Za-z0-9 _-]{3,20}$/.test(name)) throw new Error('Names are 3–20 letters, numbers, spaces, - or _.');
        try {
          return account.online ? await account.rename(name) : name;
        } catch (e) {
          throw new Error(friendlyError(e));
        }
      };
    },
    onLookChanged: () => {
      lookDirty = true;
      updateProfileChip();
    },
    onClose: () => {
      if (!hub) return;
      hub.inShop = false;
      if (lookDirty) hub.refreshPlayer(profile.look, kit(profile.kit), profile.name);
      lookDirty = false;
      show('hub-hud', true);
      controller.requestLock();
    },
    onBattle: () => {
      unlockAudio();
      startMatch();
    },
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && shop.open) shop.close();
  });

  // ---------- match ----------
  const startMatch = async () => {
    if (busy) return;
    busy = true;
    loading(true);
    hideAll();
    const def = pickStage();
    lastStageId = def.id;
    const st = await loadStage(def);
    screen = 'match';
    paused = false;
    show('hud', true);
    newMatch(st, params.has('demo'));
    music.playRandomBattle();
    loading(false);
    busy = false;
    controller.requestLock();
  };

  // ---------- pause ----------
  const sens = $('in-sens') as HTMLInputElement;
  const inv = $('in-invert') as HTMLInputElement;
  const vol = $('in-vol') as HTMLInputElement;
  const mus = $('in-music') as HTMLInputElement;
  sens.value = String(profile.sens);
  inv.checked = profile.invert;
  vol.value = String(profile.volume);
  mus.value = String(profile.music);
  sens.oninput = () => {
    profile.sens = parseFloat(sens.value);
    controller.sensitivity = profile.sens / 1000;
    save();
  };
  inv.onchange = () => {
    profile.invert = inv.checked;
    controller.invertY = inv.checked;
    save();
  };
  vol.oninput = () => {
    profile.volume = parseFloat(vol.value);
    sfx.volume = profile.volume;
    save();
  };
  mus.oninput = () => {
    profile.music = parseFloat(mus.value);
    music.volume = profile.music;
    save();
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
  const exitMatch = () => {
    if (screen !== 'match') return;
    sfx.ui();
    goHub(true);
  };
  $('btn-quit').addEventListener('click', exitMatch);
  $('btn-exit').addEventListener('click', exitMatch);

  // ---------- results ----------
  const showResults = () => {
    if (!match) return;
    screen = 'results';
    controller.releaseLock();
    hud.hideBig();
    const m = match;
    const sum: MatchSummary = m.summary();
    const [a, b] = sum.turf;
    show('results', true);
    $('res-stage').textContent = m.stage.def.name;
    const winner = $('res-winner');
    winner.textContent = sum.win ? 'YOUR TEAM WINS!' : 'DEFEAT...';
    winner.style.color = m.colorOf(sum.win ? 0 : 1);
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

    // rewards
    const coins = Math.round(sum.paintedM2 * 3 + (sum.win ? 400 : 120) + sum.splats * 30);
    const xp = Math.round(sum.paintedM2 * 2 + (sum.win ? 300 : 100));
    profile.coins += coins;
    const levels = addXp(profile, xp);
    save();
    const rw = $('res-rewards');
    rw.innerHTML = '';
    setTimeout(() => {
      $('res-a-pct').textContent = `${(a * 100).toFixed(1)}%`;
      $('res-b-pct').textContent = `${(b * 100).toFixed(1)}%`;
      sfx.whistle();
      const items = [`${Math.round(sum.paintedM2)}p turf`, `<span class="coin-ico"></span>+${coins}`, `+${xp} XP`];
      items.forEach((t, i) => {
        const el = document.createElement('div');
        el.className = 'rw';
        el.style.animationDelay = `${i * 0.15}s`;
        el.innerHTML = t;
        rw.appendChild(el);
      });
      if (levels > 0) {
        const el = document.createElement('div');
        el.className = 'rw lvl';
        el.style.animationDelay = '0.5s';
        el.textContent = `LEVEL UP! Lv ${profile.level}`;
        rw.appendChild(el);
      }
      sfx.coin();
    }, 2300);
    $('res-table').innerHTML = m.characters
      .map(
        (c) => `<tr class="${c.isPlayer ? 'me' : ''}"><td><span class="dot" style="background:${m.colorOf(c.team)}"></span></td>
        <td>${escapeHtml(c.name)}</td><td>${WEAPONS[c.weapon.kind].name}</td><td>${Math.round(c.painted / 9)}p</td><td>${c.splats} splats</td><td>${c.deaths} falls</td></tr>`,
      )
      .join('');
  };
  $('btn-again').addEventListener('click', () => {
    sfx.ui();
    startMatch();
  });
  $('btn-hub').addEventListener('click', () => {
    sfx.ui();
    goHub(true);
  });

  // ---------- main loop ----------
  const timer = new THREE.Timer();
  timer.connect(document);
  const tick = () => {
    requestAnimationFrame(tick);
    timer.update();
    const dt = Math.min(timer.getDelta(), 1 / 20);
    controller.allowLock = (screen === 'match' && !paused && !params.has('demo')) || (screen === 'hub' && !shop.open && !accountPanel.open && !auth.open);

    if (screen === 'hub' && hub) {
      const overlay = auth.open || accountPanel.open;
      if (overlay) controller.consume('KeyE');
      if (!overlay && !shop.open && hub.nearZone && controller.consume('KeyE')) {
        hub.inShop = true;
        controller.releaseLock();
        show('hub-hud', false);
        preview.setLook(profile.look, kit(profile.kit).main);
        shop.show(hub.nearZone.id);
        sfx.ui();
      }
      hub.update(dt);
      const z = hub.nearZone;
      show('hub-prompt', !!z && !shop.open);
      if (z) $('hub-prompt-text').textContent = z.id === 'tower' ? 'Enter Turf Tower (Battle!)' : `Enter ${z.name}`;
      show('hub-lock', !controller.locked && !shop.open && !overlay);
      if (shop.open) {
        preview.update(dt);
        r.renderer.render(preview.scene, preview.camera);
        return;
      }
      r.render();
      return;
    }

    if (match && !paused) match.update(dt);
    if (match) {
      if (params.has('follow') && screen === 'match') {
        controller.follow(dt, match.player, r.camera, match.physics);
        hud.update(match);
        minimap.update(dt);
      } else if (screen === 'title' || (params.has('demo') && screen === 'match')) {
        orbit += dt * 0.06;
        const info = match.stage.info.bounds;
        const rad = Math.max(info.maxX, info.maxZ) * 0.95;
        r.camera.position.set(Math.sin(orbit) * rad, 26, Math.cos(orbit) * rad);
        r.camera.lookAt(0, 0, 0);
      } else if (screen === 'match' || screen === 'results') {
        match.spectate(dt, r.camera);
        hud.update(match);
        minimap.update(dt);
        hud.setClickLock(screen === 'match' && match.phase === 'play' && !controller.locked && !paused);
      }
    }
    r.render();
  };

  // expose for debugging/testing in the console
  (window as unknown as { superink: unknown }).superink = {
    get match() { return match; },
    get hub() { return hub; },
    get screen() { return screen; },
    r, preview, profile, save, shop, controller, music, account, auth, zones: ZONES,
    goHub, startMatch,
    step(n = 60, dt = 1 / 60) {
      for (let i = 0; i < n; i++) {
        match?.update(dt);
        hub?.update(dt);
      }
    },
  };

  tick();
  if (params.has('play')) {
    await startMatch();
  } else if (params.has('hub')) {
    await goHub();
  } else {
    await goTitle();
  }
  loading(false);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

boot();
