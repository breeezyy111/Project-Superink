# Project SuperInk

A 4v4 ink-shooter inspired by Splatoon 2, built for the browser. Play against bots or with up to 7 friends online.

You play as an **Inkfin**, a cuttlefish kid from the city of **Splashburg**. Paint more of the map than the other team before time runs out. Dive into your own ink to swim fast, refill your tank and climb walls.

## Run it

```bash
npm install
npm run dev        # opens on http://localhost:5173
npm run build      # type-check + production build into dist/
```

## Play online (GitHub Pages)

`.github/workflows/pages.yml` builds the game and publishes it to GitHub Pages on every push to `main`
(or run it by hand from the Actions tab). One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
The site is then at `https://breeezyy111.github.io/Project-Superink/`.

## Accounts (PlayFab)

When you press PLAY, an optional (but recommended) **Splashburg ID** page lets you sign in or sign up, or **Play as Guest**.

- Guests get a PlayFab account tied to their browser, named `Guest0` + their number: `Guest01`, `Guest02`, ... `Guest010`, ...
- Signing up as a guest upgrades the same account, so you keep your coins, gear and level.
- Sign in with your username or email on any device. Progress is saved to your PlayFab account, and the game remembers you until you sign out.
- Click your profile in the top-left of the plaza to sign up, sign in or sign out.

The game uses PlayFab title `90E97` and needs no extra PlayFab setup. See [`playfab/SETUP.md`](playfab/SETUP.md).
If PlayFab can't be reached, the game still runs and saves progress in the browser only.

## Admin

Signing in with the **Breezy** Splashburg ID unlocks an admin panel (press **F2** or **`**): the Golden Godblaster, god mode, one-hit splats, infinite ink and special, freeze bots, speed and jump boosts, coins, levels, ranks, unlocks and instant wins. Cheats only affect the admin's own Inkfin.

## Controls (mouse + keyboard)

| Action | Input |
| --- | --- |
| Move | WASD |
| Aim / look | Mouse (click the game to lock the mouse) |
| Shoot / roll / charge / spin up | Left click (hold) |
| Swim form | Shift or right click (hold) |
| Jump (with Dualies: dodge roll while shooting and moving) | Space |
| Sub weapon | E or middle click |
| Special (when the gauge is full) | Q |
| Enter a shop (in Splashburg) | E |
| Pause / settings / exit match | Esc |

## How it plays

1. **Splashburg Plaza** is the hub. Run around as your Inkfin, paint the plaza, and walk up to a door and press **E**:
   - **Turf Tower** is the lobby. Pick a mode, a stage (or Random) and the bot difficulty, then hit **BATTLE!** You can also make or join a friends room here.
   - **Fizz & Splash Arms** sells weapon kits.
   - **Frill Threads** sells headgear, clothes and shoes, and you can try things on before buying.
   - **Fin Studio** is the salon: name, skin, fin hair, face marking and eyes. It's free.
   - **Your Locker** holds everything you own, so you can swap gear quickly.
2. **Battle modes** (4v4, 3 minutes):
   - **Turf War:** paint the most floor to win.
   - **Tower Control:** a tower sits in the middle. Stand on it and it rolls toward the other team's base (it stops while both teams are on it, and pauses at 2 checkpoints). Push it all the way for a knockout; otherwise the team that pushed it furthest wins.
   - **Zone Control:** a zone sits in the middle of the stage. Cover 60% of it with your ink to take it. While your team holds it, your count drops from 60. First to 0 wins by knockout; otherwise the lower count wins at the buzzer. Retaking the zone adds a penalty, and the match goes to overtime if the team holding the zone is behind.
   - **Ranked battles** (from Lv 3, in the Turf Tower): ranks go from **C-** up to **S+**. Win to fill your rank meter, lose and it drains. Ranked plays Zone Control or Tower Control (it switches with each stage rotation), and the bots get tougher as you climb.
   - **Daily challenges:** 3 new challenges every day (shown in the plaza and after each battle) give bonus coins.
3. **Story mode: The Great Ink Orb.** Dr. Gloop, a grumpy sea slug scientist, stole the Orb that powers Splashburg's fountain. Jump into the **Gloop Hatch** at the south end of the plaza:
   - 5 levels (Gloop Gate, Bounce Bay, Murky Mills, Gloop Towers, The Gauntlet) with bounce pads, moving platforms, ink walls to climb, Gloopie turrets, enemy goo, hypnotized Inkfins and checkpoints.
   - Then the boss fight in **Dr. Gloop's Lab**: dodge his slam, and shoot the glowing core while he's dizzy.
   - Each level gives coins the first time you clear it.
4. **Splashburg News:** when you arrive in the plaza, Lumi and Sepia (the idol duo **Tide Pop**) announce the stages on rotation. Stages change every 2 hours. Playing a mode on one of its rotation stages earns **+25% coins**. Press **NEWS** in the top-right of the plaza to watch it again.
5. **Results:** your team lines up and dances (or sulks), and **Judge Jelly** raises the winning team's flag.
6. **Rewards:** you earn coins and XP from the turf you painted, splats, and winning. Leveling up unlocks more items.

## Playing with friends (online)

In the **Turf Tower**, press **CREATE ROOM** and share the 5-letter code. Friends type the code and press **JOIN**.
- Up to 8 players. Bots fill the empty spots, so 2 friends can still play a full 4v4.
- The host picks the mode and stage, and can click a name to move that player to the other team.
- The host's browser runs the match. If a friend leaves, a bot takes over for them. If the host ends the match, it ends for everyone.
- Rooms connect browsers directly with WebRTC ([PeerJS](https://peerjs.com)). PeerJS's free public server only introduces the players; very strict networks fall back to PeerJS's free relay. Nothing to set up.
- To use your own PeerJS server instead, set `VITE_PEER_HOST=host:port` when building (or add `?peerhost=host:port` to the URL).

## Weapon kits

Every kit is a main weapon plus its own sub weapon and special. Painting fills your special gauge.

| Kit | Main | Sub | Special |
| --- | --- | --- | --- |
| Fizz Blaster (Lv 1) | full-auto shooter | **Fizz Burst**: pops on impact | **Squall Cloud**: storm cloud that rains your ink |
| Grind Roller (Lv 2) | flick, then roll | **Slide Bomb**: skids along the floor painting a lane | **Ink Tsunami**: giant wave that rolls forward |
| Streak Charger (Lv 3) | long-range charge shot | **Ink Mine**: hidden trap | **Shell Shield**: bubble dome that blocks enemy ink |
| Twin Dualies (Lv 3) | two quick pistols; Jump while shooting to dodge-roll (2 in a row) | **Slide Bomb** | **Turbo Jet** |
| Boom Blaster (Lv 4) | slow, exploding shells | **Pop Bomb**: bouncy, big blast | **Turbo Jet**: fly up and rain explosive shots |
| Splash Bucket (Lv 4) | a slosher: lobs a heavy wave of ink over walls | **Fizz Burst** | **Ink Tsunami** |
| Whirl Splatling (Lv 5) | hold to spin up, release to unload a long stream | **Ink Mine** | **Squall Cloud** |

## Stages

- **Grindrail Skatepark:** ramps, rails and a quarter pipe.
- **Splashburg Galleria:** a shopping plaza with a fountain, kiosks and upstairs walkways.
- **Dockside Container Yard:** stacked shipping containers under gantry cranes, by the water.
- **Skyline Courts:** two rooftops and a basketball court linked by narrow bridges. Falling off the edge splats you.
- **Seaside Boardwalk:** piers, beach huts and an arcade. Falling into the sea splats you.

## Music

The bands are made up, and the music is generated live in the browser:
- The Frillkillers (squid-punk)
- Fin & Tonic (electro-pop)
- The Cuttle Crew (ink-funk)
- Tidepool Radio (chill-hop in the plaza)

## Code map

```
src/
  config.ts            tuning: speeds, health, ink tank, ink color pairs
  ink/InkSystem.ts     paintable faces, splats, ownership grid, turf %
  world/Stage.ts       stage builder (boxes, ramps, decor) -> meshes + physics + ink
  world/stages.ts      the five battle stages
  world/textures.ts    procedural textures (tiles, planks, containers, signs, water...)
  game/Character.ts    movement, swim/climb, health, ink tank
  game/weapons.ts      all main weapons (shooter, roller, charger, blaster, slosher, splatling, dualies) + models
  game/Bot.ts          bot AI
  game/World.ts        shared ink world (painting credit, explosions, damage)
  game/Match.ts        Turf War / Zone Control rules, splats, respawns, phases, online roster
  game/Zones.ts        Zone Control: zone area, capture, counts, penalty, outline
  game/Tower.ts        Tower Control: the moving tower, route, checkpoints
  game/ranked.ts       ranks C- to S+, rank meter, ranked bot skill
  game/daily.ts        daily challenges
  story/               story mode: levels, StoryRun (enemies, pads, platforms, boss), models
  game/rotation.ts     stage rotation (every 2 hours, same for everyone)
  game/Hub.ts          Splashburg Plaza: shops, NPCs, door zones
  game/kit.ts          subs + specials (bombs, mines, cloud, wave, shield, jet)
  game/items.ts        weapon kits and gear catalog
  game/profile.ts      coins, XP, levels, inventory (saved in the browser)
  game/InkfinModel.ts  Inkfin kid + cuttlefish models and animation
  ui/                  HUD, shop screens, 3D try-on turntable
  audio/Sfx.ts         synthesized sound effects
  audio/Music.ts       procedural band music
  online/PlayFab.ts    PlayFab Client API over REST
  online/Account.ts    guest / sign up / sign in / remember me / cloud save
  ui/AuthUI.ts         Splashburg ID page + account panel
  ui/News.ts           Splashburg News broadcast (Tide Pop)
  ui/Mascots.ts        SVG art: Judge Jelly, Lumi and Sepia
  online/Room.ts       friends rooms over WebRTC (PeerJS)
  online/NetGame.ts    online match sync (host snapshots + ink, friends' input)
playfab/               CloudScript (guest names) and setup guide
```

### Dev URL flags

- `?play`: skip menus and start a match right away (add `&stage=yard` etc. to pick one, `&mode=zones` for Zone Control).
- `?nonews`: skip Splashburg News.
- `?play&mode=tower` / `?play&ranked`: start a Tower Control / Ranked battle.
- `?story=gate` (or `bounce`, `mills`, `towers`, `gauntlet`, `lab`): jump straight into a story level.
- `?hub`: start in Splashburg Plaza.
- `?play&demo`: bots control every character, with an overhead orbit camera.
- `?play&demo&follow`: same as above, with the camera chasing your bot-controlled character.
- `window.superink.step(frames)` in the browser console fast-forwards the simulation.

## Ideas for what's next

- Gear abilities (like Splatoon's main/sub abilities)
- More modes (Rainmaker-style)
- More story worlds
- Online matchmaking with strangers (rooms are friends-only for now)
- Performance pass (merge character meshes)

## License

Copyright © 2026 Max Sabato. All rights reserved. See [LICENSE](LICENSE).
Not affiliated with Nintendo.
