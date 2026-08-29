# Citadel Fall

Original citadel-defense arcade game (Missile Command–inspired). One file, no libraries.

## Run

Open `index.html` in a browser, or from this folder:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Controls

| Input | Action |
|-------|--------|
| Mouse move | Aim crosshair |
| Click | Fire from nearest living battery |
| 1 / 2 / 3 | Select battery (then click to fire from it) |
| M | Music on/off |
| P | Pause |
| Enter | Start / restart |

Touch: drag on the game canvas to aim, tap to fire. In portrait, the pad shows **BAT1 / BAT2 / BAT3**; in landscape the deck is hidden and aim/fire stays on the game canvas.

## Music

Drop MP3s into `Music/` matching names in `CONFIG.MUSIC_TRACKS` inside `game.js`:

- `Music/Night Battery.mp3` — waves
- `Music/Last Citadel.mp3` — when one city remains

Missing files are fine — the game still runs; music just stays silent. Volume ducks to 50% during the between-wave tally.

## Build from

Read [PROMPT.md](PROMPT.md). Enemies: rockets every wave (faster splits later), planes from wave 3, evasive drones from wave 5. Interceptor blasts are tight — aim carefully.
