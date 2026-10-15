# Project SuperInk

A 4v4 ink-shooter inspired by Splatoon 2, built for the browser.

You play as an **Inkfin**, a cuttlefish kid from the city of **Splashburg**. Paint more of the map than the other team before time runs out. Dive into your own ink to swim fast, refill your tank and climb walls.

## Run it

```bash
npm install
npm run dev        # opens on http://localhost:5173
npm run build      # type-check + production build into dist/
```

## Controls (mouse + keyboard)

| Action | Input |
| --- | --- |
| Move | WASD |
| Aim | Mouse (click the game to lock the mouse) |
| Shoot / roll / charge | Left click (hold) |
| Swim form | Shift or right click (hold) |
| Jump | Space |
| Pause / settings | Esc |

## What's in v0.1

- **Turf War, 4v4 against bots.** 3-minute matches with a READY? / GO! countdown, respawns and a results screen.
- **Ink:**
  - Paint lands as thick, glossy blobs that merge together like goo.
  - Every inkable floor and wall keeps track of which team owns each spot.
  - Turf is counted on floors only, like Splatoon.
- **Movement:**
  - Your ink: swim fast, hide, refill your tank, and climb inked walls.
  - Enemy ink: slows you and chips away at your health (it can't splat you on its own).
- **Weapons:**
  - **Fizz Blaster:** full-auto shooter. Shots drip ink along their path.
  - **Grind Roller:** a flick that throws a heavy wave of ink, then roll to paint wide stripes and flatten enemies.
  - **Streak Charger:** hold to charge. A long-range shot that splats in one hit when fully charged and streaks ink along the floor.
- **Inkfins:**
  - Kid form with frilly fin hair, W-shaped cuttlefish pupils and an ink tank that shows how much ink you have left.
  - Swim form is a striped cuttlefish.
- **Locker:** pick your name, skin tone, three fin hairstyles, eye color, shirt and weapon on a 3D turntable. Your choices are saved.
- **Grindrail Skatepark:** a mirrored stage in Splashburg with ramps, a quarter pipe, a funbox, towers, un-inkable metal grates and graffiti.
- **Bots** paint unclaimed turf, fight what they can see, refill in their own ink and get unstuck on their own.
- **Ink colors** are a random pair each match (Citrus vs Tide, Lemon vs Grape, and others).
- **Sound effects** are synthesized in the browser, so there are no audio files yet.

## Code map

```
src/
  config.ts            tuning: speeds, health, ink tank, ink color pairs
  ink/InkSystem.ts     paintable faces, splats, ownership grid, turf %
  world/               Rapier physics wrapper, skatepark layout, procedural textures
  game/Character.ts    movement, swim/climb, health, ink tank
  game/weapons.ts      Fizz Blaster, Grind Roller, Streak Charger (+ models)
  game/Bot.ts          bot AI
  game/Match.ts        Turf War rules, splats, respawns, phases
  game/InkfinModel.ts  Inkfin kid + cuttlefish models and animation
  ui/                  HUD and Locker turntable
  audio/Sfx.ts         synthesized sound effects
```

### Dev URL flags

- `?play`: skip menus and start a match right away.
- `?play&demo`: bots control every character, with an overhead orbit camera.
- `?play&demo&follow`: same as above, with the camera chasing your bot-controlled character.
- `window.superink.step(frames)` in the browser console fast-forwards the simulation.

## Ideas for what's next

- Sub weapons (bombs) and specials
- More stages, plus a Splashburg hub plaza
- Gear with abilities (headgear, clothes, shoes)
- Music: several fictional Splashburg bands in different genres
- Other modes (Splat Zones-style), online multiplayer
- An Octo Expansion-style story mode (later!)
