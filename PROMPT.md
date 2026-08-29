# Citadel Fall — Master Prompt

## HOUSE STYLE — match Delta Run

Build a complete, original browser game. Not a ROM, not a sprite rip, not the original title or characters.

### Stack

- `index.html`, `style.css`, `game.js` only. No npm, no libraries, no bundler.
- Canvas 480×720, `image-rendering: pixelated`. Same `#frame` + `#game` + `#pad` layout as Delta Run.
- Mobile: two-thumb / battery touch pad canvas (`PAD_H` 180), keyboard + mouse on desktop.
- `"use strict";` `CONFIG` object at top of `game.js` for every tunable; `COLORS` object next to it.
- Seeded RNG (mulberry-style). Web Audio SFX; optional `Music/` folder + **M** mute; first key/tap unlocks audio.
- States: title, play, pause (P or Escape), between-wave tally, game over, win if the design has one. `localStorage` high score.
- Draw with canvas primitives (rects, circles, paths). Geometric 8-bit look. No images required for v1.
- Comment a file-structure map at the top of `game.js` like Delta Run.
- Original name in `<title>` and on the title screen. Never use the inspiration’s trademarks, character names, or logo.

### Feel

- Instant to start. Readable at a glance. Harsh but fair. Tunable from `CONFIG` without hunting.
- Cities are lives — show a citadel row, not a numeric LIVES counter.
- Ship a playable loop first, then polish HUD, particles, and juice.

### MUSIC — same wiring as Delta Run

Create a `Music/` folder in the project root even if it is empty.

```
MUSIC_TRACKS: [
  "Music/Night Battery.mp3",   // default waves
  "Music/Last Citadel.mp3",    // when 1 city left
],
MUSIC_VOL: 0.35,
```

Implement: `music = { track, trackIndex, on: true }`, `initFileMusic` / `loadMusicTrack` / `syncFileMusic` / `toggleMusic`, unlock on first key/tap, **M** key and HUD music button. Loop + preload. Empty `MUSIC_TRACKS` skips the player; SFX still work. Never throw if an MP3 is missing (`play().catch`). Use `setMusicBed(index)` so swapping to an already-active track does not restart. Duck volume to 50% during between-wave tally.

SFX: Web Audio tones only (`playTone`). Do not wait for MP3s to exist.

---

## GAME: Citadel Fall

**Inspiration:** Atari Missile Command (1980).

### Pitch

3 batteries defend 6 citadels. Tap blast points; MIRVs split; cities are lives.

### CONFIG

```
CITY_COUNT: 6,
BATTERY_COUNT: 3,
MISSILES_PER_BATTERY: 10,
BLAST_GROW: 120,
BLAST_HOLD: 0.35,
SPLIT_CHANCE: 0.25,
WAVE_SPEED_STEP: 0.08,
BOMBER_FROM_WAVE: 3,
WAVES_TO_WIN: 15,
MUSIC_TRACKS: ["Music/Night Battery.mp3", "Music/Last Citadel.mp3"],
MUSIC_VOL: 0.35,
HS_KEY: "citadelFallHighScore",
STEER_KEY: "citadelFallSteerRight",
```

### Music

- Track 0 during waves.
- Track 1 when 1 city left.
- Duck volume 50% during between-wave tally.

### Legal

No Missile Command / Atari city names. Invented citadel labels OK.

© 2026 MACIEJ TUREK

### Current stub status

This repo ships a **runnable harness** (title, pause, music toggle, crosshair aim/fire, cities, batteries, incoming warheads, blast circles). Implement full MIRV splits, bombers, wave clear scoring, and tally polish from this prompt.
