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
import { Match, MatchSummary, MODE_COUNT, MODE_NAMES, randomLook } from './game/Match';
import { PlayerController } from './game/PlayerController';
import { addXp, defaultProfile, loadProfile, Profile, saveProfile, xpToNext } from './game/profile';
import { WEAPONS } from './game/weapons';
import { CUTTLE_SVG, Hud } from './ui/Hud';
import { LockerStage } from './ui/LockerStage';
import { Minimap } from './ui/Minimap';
import { Account, friendlyError } from './online/Account';
import { AccountPanel, AuthUI, toast } from './ui/AuthUI';
import { ShopUI } from './ui/Shops';
import { News } from './ui/News';
import { judgeJellySvg } from './ui/Mascots';
import { currentRotation, onRotation, ROTATION_BONUS } from './game/rotation';
import { Room, Msg } from './online/Room';
import { ClientSync, HostSync } from './online/NetGame';
import type { NetOpts, RosterSlot, Mode } from './game/Match';
import { KITS } from './game/items';
import { INK_PAIRS, TEAM_SIZE, Team } from './config';
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
  r.setQuality(profile.quality);
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
  let perfT = 0;
  let perfFrames = 0;
  let lastStageId = '';

  const show = (id: string, v: boolean) => $(id).classList.toggle('hidden', !v);
  const loading = (v: boolean) => show('loading', v);
  const unlockAudio = () => {
    sfx.unlock();
    music.attach(sfx.context);
  };

  const teardown = () => {
    netSync = null;
    minimap.hide();
    match?.dispose();
    match = null;
    hub?.dispose();
    hub = null;
    stage?.dispose(r.scene);
    stage = null;
  };

  const loadStage = async (def: StageDef, mode: Mode = 'turf') => {
    teardown();
    stage = await Stage.create(def, { towerLane: mode === 'tower' });
    r.scene.add(stage.group);
    return stage;
  };

  /** mode for a match against bots (?mode= overrides it for testing) */
  const soloMode = (): Mode => (params.get('mode') as Mode | null) ?? profile.mode;

  const pickStage = () => {
    if (params.get('stage')) return stageById(params.get('stage')!);
    if (profile.stage !== 'random') return stageById(profile.stage);
    // Random picks one of the stages on rotation for this mode
    const rot = currentRotation()[soloMode()];
    const pool = rot.filter((s) => s.id !== lastStageId);
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const newMatch = (st: Stage, demo: boolean, net?: NetOpts, netMode?: Mode) => {
    match = new Match(r, st, sfx, demo ? null : controller, {
      onFeed: (t, k) => hud.pushFeed(t, k),
      onPlayerSplatted: (by) => hud.showSplatted(by),
      onPlayerRespawn: () => hud.hideSplatted(),
      onHitMarker: () => hud.hitMarker(),
      onPhase: (p) => {
        if (demo || screen !== 'match') return;
        if (p === 'countdown') hud.bigText(match?.mode === 'zones' ? 'ZONE CONTROL!' : match?.mode === 'tower' ? 'TOWER CONTROL!' : 'READY?', false, 2600);
        if (p === 'play') hud.bigText('GO!', true, 900);
        if (p === 'finish') {
          hud.bigText('GAME!', false, 0);
          controller.releaseLock();
        }
        if (p === 'done') showResults();
      },
      onZone: (e) => {
        if (demo || screen !== 'match') return;
        const ours = e.team === match?.player.team;
        if (e.kind === 'captured') {
          hud.bigText(ours ? 'WE GOT THE ZONE!' : 'THEY TOOK THE ZONE!', !ours, 1600);
          if (ours) sfx.specialReady();
          else sfx.denied();
        } else if (e.kind === 'lost') {
          hud.pushFeed(ours ? 'We lost the zone!' : 'They lost the zone!', ours ? 'bad' : 'good');
        } else if (ours) hud.pushFeed('Our zone is under attack!', 'bad');
      },
      onTower: (e) => {
        if (demo || screen !== 'match') return;
        const ours = e.team === match?.player.team;
        if (e.kind === 'ride') {
          hud.pushFeed(ours ? 'We have the tower!' : 'They have the tower!', ours ? 'good' : 'bad');
          if (ours) sfx.specialReady();
        } else if (e.kind === 'checkpoint') {
          hud.bigText(ours ? `CHECKPOINT ${e.n}!` : `THEY HIT CHECKPOINT ${e.n}!`, !ours, 1400);
          sfx.beep(true);
        } else if (ours) hud.pushFeed('We lost the tower!', 'bad');
      },
      onOvertime: () => {
        if (demo || screen !== 'match') return;
        hud.bigText('OVERTIME!', true, 1600);
        sfx.whistle();
      },
    }, { look: profile.look, kit: kit(profile.kit), name: profile.name || 'Player', demo, difficulty: profile.difficulty, net,
      mode: netMode ?? (demo && !params.get('mode') ? 'turf' : soloMode()) });
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
    // Splashburg News when the stages changed since you last watched
    if (news.isNew(profile.newsSlot) && !params.has('nonews')) {
      await news.show();
      profile.newsSlot = news.slot();
      save();
      return;
    }
    if (lock) controller.requestLock();
  };
  const news = new News(sfx);
  $('btn-news').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (screen !== 'hub' || shop.open || news.open) return;
    controller.releaseLock();
    await news.show();
    profile.newsSlot = news.slot();
    save();
  });

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
      if (room?.isHost) startRoomMatch();
      else if (!room) startMatch();
    },
    friends: {
      room: () => room,
      create: async () => {
        setRoom(await Room.host(me(), { mode: profile.mode, stage: profile.stage }));
        toast(`Room ${room!.code} is open! Share the code with your friends.`);
      },
      join: async (code: string) => {
        setRoom(await Room.join(code, me()));
        toast(`Joined room ${room!.code}!`);
      },
      leave: () => {
        room?.leave();
      },
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
    const st = await loadStage(def, params.has('demo') && !params.get('mode') ? 'turf' : soloMode());
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
  const qualityChips = () => {
    document.querySelectorAll<HTMLElement>('#in-quality .chip').forEach((c) => c.classList.toggle('sel', c.dataset.q === profile.quality));
  };
  document.querySelectorAll<HTMLElement>('#in-quality .chip').forEach((c) => {
    c.onclick = () => {
      profile.quality = c.dataset.q as Profile['quality'];
      profile.qualityChosen = true;
      r.setQuality(profile.quality);
      qualityChips();
      sfx.ui();
      save();
    };
  });
  qualityChips();
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
    // online: the host ending the match ends it for everyone; a friend leaving leaves the room
    if (room && netSync) {
      if (room.isHost) room.broadcast({ t: 'abort' });
      else room.leave();
    }
    goHub(true);
  };
  $('btn-quit').addEventListener('click', exitMatch);
  $('btn-exit').addEventListener('click', exitMatch);

  // ---------- online friends rooms ----------
  let room: Room | null = null;
  let netSync: HostSync | ClientSync | null = null;
  const readyFrom = new Set<string>();
  const me = () => ({ name: profile.name || 'Player', look: profile.look, kit: profile.kit });

  const setRoom = (r: Room) => {
    room = r;
    r.onChange = () => {
      if (shop.zoneId === 'tower') shop.refresh();
    };
    r.onMessage = (from: string, msg: Msg) => {
      if (msg.t === 'ready') readyFrom.add(from);
      else if (msg.t === 'start' && !r.isHost) joinRoomMatch(msg as unknown as StartMsg);
      else if (msg.t === 'abort' && !r.isHost) {
        if (screen === 'match' || screen === 'results') {
          toast('The host ended the match.');
          goHub(true);
        }
      } else if (netSync instanceof HostSync) netSync.handle(from, msg);
      else if (netSync instanceof ClientSync) netSync.handle(msg);
    };
    r.onLeft = (id: string) => {
      if (netSync instanceof HostSync) netSync.left(id);
    };
    r.onClosed = (reason: string) => {
      const wasClient = !r.isHost;
      room = null;
      if (reason) toast(reason, true);
      shop.refresh();
      if (wasClient && netSync && (screen === 'match' || screen === 'results')) goHub(true);
    };
    shop.refresh();
  };

  interface StartMsg {
    t: 'start';
    stage: string;
    mode: Mode;
    pair: number;
    roster: RosterSlot[];
    peers: (string | null)[];
  }

  /** host: fill both teams with the room's players, then bots */
  const buildRoster = (r: Room) => {
    const roster: RosterSlot[] = [];
    const peers: (string | null)[] = [];
    const used = new Set(r.members.map((m) => m.name));
    const botNames = ['Squidge', 'Frilly', 'Nautia', 'Cuddle', 'Sepi', 'Murk', 'Zebra', 'Bubbs', 'Fizzy', 'Ruffle', 'Wiggs', 'Coral'].filter((n) => !used.has(n));
    for (const t of [0, 1] as Team[]) {
      const humans = r.members.filter((m) => m.team === t);
      for (const h of humans) {
        roster.push({ name: h.name, team: t, look: h.look, kit: h.kit, human: true });
        peers.push(h.id);
      }
      for (let i = humans.length; i < TEAM_SIZE; i++) {
        const k = KITS[Math.floor(Math.random() * KITS.length)];
        roster.push({ name: botNames.splice(Math.floor(Math.random() * botNames.length), 1)[0] ?? 'Bot', team: t, look: randomLook(), kit: k.id, human: false });
        peers.push(null);
      }
    }
    return { roster, peers };
  };

  const startRoomMatch = async () => {
    const r = room;
    if (!r || !r.isHost || busy) return;
    busy = true;
    loading(true);
    hideAll();
    shop.close();
    const mode = r.settings.mode;
    const def = r.settings.stage === 'random'
      ? currentRotation()[mode][Math.floor(Math.random() * 2)]
      : stageById(r.settings.stage);
    lastStageId = def.id;
    const { roster, peers } = buildRoster(r);
    const pair = Math.floor(Math.random() * INK_PAIRS.length);
    readyFrom.clear();
    r.broadcast({ t: 'start', stage: def.id, mode, pair, roster, peers });
    const st = await loadStage(def, mode);
    // wait (up to 20s) for everyone to load the stage
    const waiting = peers.filter((id): id is string => !!id && id !== r.myId);
    const t0 = performance.now();
    while (waiting.some((id) => !readyFrom.has(id) && r.members.some((m) => m.id === id)) && performance.now() - t0 < 20000) {
      await new Promise((res) => setTimeout(res, 100));
    }
    screen = 'match';
    paused = false;
    show('hud', true);
    newMatch(st, false, { role: 'host', roster, localSlot: peers.indexOf(r.myId), pairIndex: pair }, mode);
    netSync = new HostSync(r, match!, peers);
    // anyone who left while we loaded becomes a bot
    for (const id of waiting) if (!r.members.some((m) => m.id === id)) (netSync as HostSync).left(id);
    music.playRandomBattle();
    loading(false);
    busy = false;
    controller.requestLock();
  };

  const joinRoomMatch = async (msg: StartMsg) => {
    const r = room;
    if (!r) return;
    if (busy) await new Promise((res) => setTimeout(res, 300));
    busy = true;
    loading(true);
    hideAll();
    shop.close();
    accountPanel.close?.();
    const st = await loadStage(stageById(msg.stage), msg.mode);
    lastStageId = msg.stage;
    screen = 'match';
    paused = false;
    show('hud', true);
    newMatch(st, false, { role: 'client', roster: msg.roster, localSlot: msg.peers.indexOf(r.myId), pairIndex: msg.pair }, msg.mode);
    netSync = new ClientSync(r, match!);
    r.send({ t: 'ready' });
    music.playRandomBattle();
    loading(false);
    busy = false;
    controller.requestLock();
  };

  // ---------- results ----------
  const showResults = () => {
    if (!match) return;
    screen = 'results';
    controller.releaseLock();
    hud.hideBig();
    const m = match;
    const sum: MatchSummary = m.summary();
    // "a" is always your team
    const me = m.player.team, them = (1 - me) as Team;
    const a = sum.turf[me], b = sum.turf[them];
    const mine = m.colorOf(me), theirs = m.colorOf(them);
    show('results', true);
    show('hud', false);
    $('res-stage').textContent = `${MODE_NAMES[m.mode]} • ${m.stage.def.name}`;
    const again = $('btn-again') as HTMLButtonElement;
    again.disabled = !!room && !room.isHost;
    again.textContent = room ? (room.isHost ? 'BATTLE AGAIN' : 'WAITING FOR HOST...') : 'BATTLE AGAIN';
    // Judge Jelly looks back and forth while the bars fill, then raises the winner's flag
    const judge = $('res-judge');
    judge.className = 'judge thinking';
    judge.innerHTML = judgeJellySvg(mine, theirs) + '<div class="judge-say"></div>';
    const winner = $('res-winner');
    winner.textContent = sum.ko ? (sum.win ? 'KNOCKOUT! YOU WIN!' : 'KNOCKED OUT...') : sum.win ? 'YOUR TEAM WINS!' : 'DEFEAT...';
    winner.style.color = m.colorOf(sum.win ? 0 : 1);
    const fa = $('res-a'), fb = $('res-b');
    fa.style.background = mine;
    fb.style.background = theirs;
    fa.style.width = fb.style.width = '0%';
    $('res-a-pct').textContent = '';
    $('res-b-pct').textContent = '';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // bars show each team's share of the painted turf; labels show map coverage
        // (Zone Control: how far each team counted down)
        const zc = sum.zoneCount;
        const max = MODE_COUNT[m.mode];
        const [va, vb] = zc ? [max - zc[me], max - zc[them]] : [a, b];
        const total = Math.max(1e-6, va + vb);
        fa.style.width = `${Math.max(4, (va / total) * 100)}%`;
        fb.style.width = `${Math.max(4, (vb / total) * 100)}%`;
      }),
    );

    // rewards
    const bonus = onRotation(m.mode, m.stage.def.id);
    const coins = Math.round((sum.paintedM2 * 3 + (sum.win ? 400 : 120) + sum.splats * 30) * (bonus ? 1 + ROTATION_BONUS : 1));
    const xp = Math.round(sum.paintedM2 * 2 + (sum.win ? 300 : 100));
    profile.coins += coins;
    const levels = addXp(profile, xp);
    save();
    const rw = $('res-rewards');
    rw.innerHTML = '';
    setTimeout(() => {
      const zc = sum.zoneCount;
      $('res-a-pct').textContent = zc ? `${zc[me]} left` : `${(a * 100).toFixed(1)}%`;
      $('res-b-pct').textContent = zc ? `${zc[them]} left` : `${(b * 100).toFixed(1)}%`;
      sfx.whistle();
      judge.className = `judge decided ${sum.win ? 'win-a' : 'win-b'}`;
      (judge.querySelector('.judge-say') as HTMLElement).textContent = sum.win ? (sum.ko ? 'Knockout!' : 'Your team wins!') : 'The other team wins!';
      const items = [`${Math.round(sum.paintedM2)}p turf`, `<span class="coin-ico"></span>+${coins}`, `+${xp} XP`];
      if (bonus) items.push('★ Rotation bonus');
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
    // online friends get the host's numbers
    const statOf = (i: number) => m.netFinal?.stats[i] ?? m.characters[i];
    $('res-table').innerHTML = m.characters
      .map(
        (c, i) => `<tr class="${c.isPlayer ? 'me' : ''}"><td><span class="dot" style="background:${m.colorOf(c.team)}"></span></td>
        <td>${escapeHtml(c.name)}</td><td>${WEAPONS[c.weapon.kind].name}</td><td>${Math.round(statOf(i).painted / 9)}p</td><td>${statOf(i).splats} splats</td><td>${statOf(i).deaths} falls</td></tr>`,
      )
      .join('');
  };
  $('btn-again').addEventListener('click', () => {
    sfx.ui();
    if (room?.isHost) startRoomMatch();
    else if (!room) startMatch();
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
    const rawDt = timer.getDelta();
    const dt = Math.min(rawDt, 1 / 20);
    // auto-tune graphics once if the game is struggling (only until the player picks a level themselves)
    if ((screen === 'hub' || screen === 'match') && !profile.qualityChosen && r.quality !== 'low' && !document.hidden) {
      perfT += rawDt;
      perfFrames++;
      if (perfT > 5) {
        const fps = perfFrames / perfT;
        perfT = 0;
        perfFrames = 0;
        if (fps < 38) {
          profile.quality = r.quality === 'high' ? 'medium' : 'low';
          r.setQuality(profile.quality);
          qualityChips();
          save();
          toast(`Graphics set to ${profile.quality.toUpperCase()} for smoother play (change it with Esc)`);
        }
      }
    }
    controller.allowLock = (screen === 'match' && !paused && !params.has('demo')) || (screen === 'hub' && !shop.open && !accountPanel.open && !auth.open && !news.open);

    if (screen === 'hub' && hub) {
      const overlay = auth.open || accountPanel.open || news.open;
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

    // online matches keep running while the pause menu is open
    if (match && (!paused || netSync)) {
      match.update(dt);
      netSync?.update(dt);
    }
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
    get room() { return room; },
    get netSync() { return netSync; },
    startRoomMatch,
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
