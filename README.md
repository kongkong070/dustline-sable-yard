# dustline-sable-yard

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/kongkong070/dustline-sable-yard/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/kongkong070/dustline-sable-yard/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

DUSTLINE — Sable Yard is a round-based tactical FPS in the browser, built with three.js 0.187.0. Two teams fight short rounds in an original dusk-desert freight yard: attackers plant the bomb at site A or B (or eliminate the Sable team), defenders hold the sites, and money earned between rounds buys rifles, SMGs, a DMR, grenades and armor. Gunfire rewards stopping to aim: headshots pay triple, recoil and spread punish firing on the move, and bots patrol lanes, hold angles, react to gunfire and rotate to a planted bomb.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome and click to play.

## How it plays

- **Rounds**: buy phase (15 s, press B), live round (100 s), bomb fuse (40 s). First to 5 rounds takes the match.
- **Objective**: hold E inside a bombsite to plant; defenders converge and one channels a 5 s defuse.
- **Economy**: $800 to start, +$300 per elimination, +$300 for planting, $3250 for a round win, $1900+ for a loss.
- **Arsenal**: P9 Sidearm, Kestrel-9 SMG ($1400), VK-7 Carbine ($2700), Longbow DMR ($3800), frag grenades ($300), Kevlar ($650).
- **Bots**: 5 Sable defenders hold sites and lanes; 2 squadmates push with you. They see, hear, strafe, burst-fire and rotate.

## Layout

- `game/` — the game itself: static ES modules, no build step, no network requests. three.js is vendored under `game/vendor/three/`.
- `game/src/` — one module per job: `main.js` (loop and wiring), `sim.js` (rounds and economy), `bots.js` (bot AI), `world.js` (the Sable Yard map), `weapons.js` (arsenal), `player.js` (movement and collision), `effects.js` (tracers and explosions), `audio.js` (procedural sound), `hud.js` (HUD and buy menu), `input.js` (keyboard and mouse).
- `screenshots/` — real renders of the game, taken in Chrome.
- `main.ts` — the make.fun entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1cpdpcxn&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
