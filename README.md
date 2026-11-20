# Dusthaven

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/robiyal/gta6-01-entry/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/robiyal/gta6-01-entry/reward.svg)](https://make.fun/bounty/gta6-01)

**Dusthaven** is a complete open-world crime game for the desktop browser,
built for the [make.fun](https://make.fun/bounty/gta6-01) **gta6-01 "Make GTA 6"**
bounty. You are Rook, a getaway driver in Dusthaven — a sun-soaked desert
highway town at golden hour, where the dust hides everything, including you.

## What is in the game

- **A city on foot and by car** — walk the sidewalks or steal any car on the
  street (the sheriff notices) and drive the grid, the highway ring and the
  desert outskirts.
- **Traffic and pedestrians** — cars follow the road grid, pedestrians stroll
  the sidewalks and flee from a fast car.
- **Wanted level and police** — 5 stars of heat, sheriff cruisers that chase
  and ram, deputies on foot, busts, and heat that decays when you vanish.
- **Missions and a story** — three jobs from Delia Voss: a getaway, a desert
  delivery through a dust storm, and stealing the Collector's gold coupe.
- **Combat** — fists and a pistol, with a wanted price for using them.
- **HUD with a live minimap** — health, cash, wanted stars, speed, objective,
  timer, and a minimap showing roads, police, traffic and the mission beacon.
- **Start, pause, game over and restart** — plus a save that persists cash and
  finished jobs in localStorage.
- **Sound and music** — all synthesized with WebAudio: engine hum, skids,
  sirens, gunshots and a desert-blues loop. No audio files.

## How to play

Open `game/index.html` in desktop Chrome, or serve it locally:

```sh
node serve.ts
# then open http://localhost:8080
```

Controls: **WASD** drive / walk · **E** enter and steal cars · **Space** brake ·
**F** punch · **Click** shoot · **R** reload · **P** pause · **M** mute.

## How it is built

- **three.js r187**, vendored as a single minified file under `game/vendor/`
  (the game loads nothing over the network).
- **PBR everywhere**: MeshStandardMaterial with roughness/metalness variation,
  a golden-hour sun with PCFSoft shadows that follow the player, hemisphere
  fill, ACES filmic tone mapping, fog, drifting dust, god-ray shafts and a
  procedural gradient sky.
- **All art procedural** — the city, cars, characters and signs are generated
  in code; no external assets, no Rockstar material of any kind.
- Source is split into files with one clear job each under `game/src/`
  (`main`, `world`, `city`, `vehicles`, `traffic`, `police`, `missions`,
  `combat`, `input`, `audio`, `render`, `ui`, `save`, `player`, `config`).

## License

MIT — see [LICENSE](LICENSE).
