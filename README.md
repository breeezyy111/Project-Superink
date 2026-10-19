# Project SuperInk

A 4v4 ink-shooter inspired by Splatoon 2, built for the browser.

You play as an **Inkfin**, a cuttlefish kid from the city of **Splashburg**. Paint more of the map than the other team before time runs out. Dive into your own ink to swim fast, refill your tank and climb walls.

## Run it

```bash
npm install
npm run dev        # opens on http://localhost:5173
npm run build      # type-check + production build into dist/
```

## Accounts (PlayFab)

When you press PLAY, an optional (but recommended) **Splashburg ID** page lets you sign in or sign up, or **Play as Guest**.

- Guests get a PlayFab account tied to their browser, named `Guest0` + their number: `Guest01`, `Guest02`, ... `Guest010`, ...
- Signing up as a guest upgrades the same account, so you keep your coins, gear and level.
- Sign in with your username or email on any device. Progress is saved to your PlayFab account, and the game remembers you until you sign out.
- Click your profile in the top-left of the plaza to sign up, sign in or sign out.

The game uses PlayFab title `90E97` and needs no extra PlayFab setup. See [`playfab/SETUP.md`](playfab/SETUP.md).
If PlayFab can't be reached, the game still runs and saves progress in the browser only.

## Controls (mouse + keyboard)

| Action | Input |
| --- | --- |
| Move | WASD |
| Aim / look | Mouse (click the game to lock the mouse) |
| Shoot / roll / charge | Left click (hold) |
| Swim form | Shift or right click (hold) |
| Jump | Space |
| Sub weapon | E or middle click |
| Special (when the gauge is full) | Q |
| Enter a shop (in Splashburg) | E |
| Pause / settings | Esc |

## How it plays

1. **Splashburg Plaza** is the hub. Run around as your Inkfin, paint the plaza, and walk up to a door and press **E**:
   - **Turf Tower** is the lobby. Pick a stage (or Random) and the bot difficulty, then hit **BATTLE!**
   - **Fizz & Splash Arms** sells weapon kits.
   - **Frill Threads** sells headgear, clothes and shoes, and you can try things on before buying.
   - **Fin Studio** is the salon: name, skin, fin hair, face marking and eyes. It's free.
   - **Your Locker** holds everything you own, so you can swap gear quickly.
2. **Turf War** is 4v4 against bots for 3 minutes. Paint the most floor to win.
3. **Rewards:** you earn coins and XP from the turf you painted, splats, and winning. Leveling up unlocks more items.

## Weapon kits

Every kit is a main weapon plus its own sub weapon and special. Painting fills your special gauge.

| Kit | Main | Sub | Special |
| --- | --- | --- | --- |
| Fizz Blaster (Lv 1) | full-auto shooter | **Fizz Burst**: pops on impact | **Squall Cloud**: storm cloud that rains your ink |
| Grind Roller (Lv 2) | flick, then roll | **Slide Bomb**: skids along the floor painting a lane | **Ink Tsunami**: giant wave that rolls forward |
| Streak Charger (Lv 3) | long-range charge shot | **Ink Mine**: hidden trap | **Shell Shield**: bubble dome that blocks enemy ink |
| Boom Blaster (Lv 4) | slow, exploding shells | **Pop Bomb**: bouncy, big blast | **Turbo Jet**: fly up and rain explosive shots |

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
  game/weapons.ts      Fizz Blaster, Grind Roller, Streak Charger, Boom Blaster (+ models)
  game/Bot.ts          bot AI
  game/World.ts        shared ink world (painting credit, explosions, damage)
  game/Match.ts        Turf War rules, splats, respawns, phases, rewards summary
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
playfab/               CloudScript (guest names) and setup guide
```

### Dev URL flags

- `?play`: skip menus and start a match right away (add `&stage=yard` etc. to pick one).
- `?hub`: start in Splashburg Plaza.
- `?play&demo`: bots control every character, with an overhead orbit camera.
- `?play&demo&follow`: same as above, with the camera chasing your bot-controlled character.
- `window.superink.step(frames)` in the browser console fast-forwards the simulation.

## Ideas for what's next

- Gear abilities (like Splatoon's main/sub abilities)
- Our own mascot / announcers (Judge Jelly is a placeholder name)
- Other modes (Splat Zones-style), online multiplayer
- Performance pass (merge character meshes)
- An Octo Expansion-style story mode (later!)
