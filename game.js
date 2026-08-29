"use strict";

/* =============================================================================
   CITADEL FALL — game.js
   Original citadel-defense arcade. One file, no libraries.
   Inspiration: Atari Missile Command (1980). Original names and look.

   File structure
   --------------
    1. CONFIG        Tuning values (cities, batteries, blasts, music).
    2. Seeded RNG    Deterministic random numbers from a seed.
    3. Audio         Web Audio SFX + MP3 music player. First key starts audio.
    4. Input         Mouse aim/fire, keys 1–3, touch aim + battery pad.
    5. Cities        Ground citadels (lives).
    6. Batteries     Ammo silos that fire ABMs.
    7. Warheads      Incoming polylines (stub MIRV / bomber hooks).
    8. Blasts        Expanding detonation circles.
    9. Game state    Title, play, pause, tally, win, game over, high score.
   10. Update        Move everything each frame.
   11. Draw          Field, units, HUD, overlays.
   12. Loop / boot   requestAnimationFrame, resize, startup.

   Where to tweak feel
   -------------------
   Change values in CONFIG below. Music paths live in MUSIC_TRACKS —
   drop MP3s into Music/ matching those filenames.
   ============================================================================= */

const CONFIG = {
  VERSION: "0.1.0-stub",
  WIDTH: 480,
  HEIGHT: 720,

  CITY_COUNT: 6,
  BATTERY_COUNT: 3,
  MISSILES_PER_BATTERY: 10,
  BLAST_GROW: 120,
  BLAST_HOLD: 0.35,
  BLAST_FADE: 0.45,
  SPLIT_CHANCE: 0.25,
  WAVE_SPEED_STEP: 0.08,
  BOMBER_FROM_WAVE: 3,
  WAVES_TO_WIN: 10,

  GROUND_Y: 640,
  WARHEAD_SPEED: 28,
  STUB_WARHEADS: 4,
  TALLY_TIME: 2.4,

  MUSIC_TRACKS: [
    "Music/Night Battery.mp3", // waves
    "Music/Last Citadel.mp3", // when 1 city left
  ],
  MUSIC_VOL: 0.35,

  PAD_H: 180,
  STEER_KEY: "citadelFallSteerRight",
  HS_KEY: "citadelFallHighScore",
  TITLE_PROMPT_DELAY: 3,
  HUD_BAR_H: 52,
};

const CITY_LABELS = ["AUREL", "NEXIS", "VORN", "KETH", "SOLUM", "RYNN"];

const COLORS = {
  sky: "#0c1018",
  star: "#5a6a78",
  ground: "#1a2830",
  groundLine: "#3a5060",
  city: "#8ab0c8",
  cityDead: "#2a3038",
  battery: "#c8a060",
  batteryDead: "#3a3830",
  ammo: "#e8d090",
  warhead: "#e07060",
  trail: "#a04038",
  blast: "#ffd080",
  blastRing: "#fff0c0",
  crosshair: "#e8f0ff",
  overlay: "rgba(8, 10, 14, 0.62)",
  text: "#f2efe4",
  accent: "#c8e0ff",
  bridge: "#8a8680",
  bridgeRail: "#4a4844",
  debug: "#c8f0a8",
  danger: "#d45444",
};

// -----------------------------------------------------------------------------
// 2. Seeded RNG
// -----------------------------------------------------------------------------

function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// -----------------------------------------------------------------------------
// 3. Audio  (silent until the first keypress)
// -----------------------------------------------------------------------------

const audio = {
  ctx: null,
  unlocked: false,
};

const music = {
  track: null,
  trackIndex: 0,
  on: true,
};

function canPlaySound() {
  return audio.unlocked && audio.ctx;
}

function unlockAudio() {
  if (audio.unlocked) {
    syncFileMusic();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audio.ctx = new AC();
  if (audio.ctx.state === "suspended") audio.ctx.resume();
  audio.unlocked = true;
  initFileMusic();
  syncFileMusic();
}

function initFileMusic() {
  if (music.track || !CONFIG.MUSIC_TRACKS.length) return;
  music.track = new Audio();
  music.track.loop = true;
  music.track.preload = "auto";
  loadMusicTrack(0, false);
}

function loadMusicTrack(index, playNow) {
  if (!music.track || !CONFIG.MUSIC_TRACKS.length) return;
  const count = CONFIG.MUSIC_TRACKS.length;
  const next = ((index % count) + count) % count;
  if (next === music.trackIndex && music.track.src) {
    if (playNow && music.on && audio.unlocked && music.track.paused) {
      music.track.play().catch(function () {});
    }
    return;
  }
  music.trackIndex = next;
  music.track.src = CONFIG.MUSIC_TRACKS[music.trackIndex];
  music.track.load();
  if (playNow && music.on && audio.unlocked) {
    music.track.play().catch(function () {});
  }
}

/** Switch track without restarting if already on that index. */
function setMusicBed(index) {
  if (!CONFIG.MUSIC_TRACKS.length) return;
  if (music.trackIndex === index && music.track && music.track.src) return;
  loadMusicTrack(index, true);
}

function musicDuckFactor() {
  return game.state === "tally" ? 0.5 : 1;
}

function syncFileMusic() {
  if (!music.track || !audio.unlocked) return;
  music.track.volume = music.on ? CONFIG.MUSIC_VOL * musicDuckFactor() : 0;
  if (music.on) {
    if (music.track.paused) music.track.play().catch(function () {});
  } else {
    music.track.pause();
  }
}

function toggleMusic() {
  music.on = !music.on;
  syncFileMusic();
}

function playTone(freq, dur, type, vol, slide, delay) {
  if (!canPlaySound()) return;
  const ctx = audio.ctx;
  const t = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function soundShoot() {
  playTone(880, 0.1, "square", 0.07, 220);
}

function soundBoom() {
  playTone(140, 0.36, "sawtooth", 0.12, 28);
}

function soundHit() {
  playTone(220, 0.2, "triangle", 0.08, 60);
}

function soundClear() {
  playTone(392, 0.12, "square", 0.07);
  playTone(523, 0.14, "square", 0.07, 0, 0.12);
}

// -----------------------------------------------------------------------------
// 4. Input
// -----------------------------------------------------------------------------

const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

const touchUi = {
  active: isTouchDevice,
  steerRight: true,
};

const touchLayout = {
  scale: 1,
  deckVisible: false,
};

const touchRoles = new Map();

const aim = {
  x: CONFIG.WIDTH / 2,
  y: CONFIG.HEIGHT / 2,
  selectedBattery: -1,
};

const padUi = {
  flash: [0, 0, 0],
};

function loadTouchPrefs() {
  try {
    const v = localStorage.getItem(CONFIG.STEER_KEY);
    if (v === "0") touchUi.steerRight = false;
    else if (v === "1") touchUi.steerRight = true;
  } catch (_e) {
    /* ignore */
  }
}

function saveTouchPrefs() {
  try {
    localStorage.setItem(CONFIG.STEER_KEY, touchUi.steerRight ? "1" : "0");
  } catch (_e) {
    /* ignore */
  }
}

function gamePointFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  return {
    x: (localX / rect.width) * CONFIG.WIDTH,
    y: (localY / rect.height) * CONFIG.HEIGHT,
  };
}

const hudButtons = {
  pause: { x: CONFIG.WIDTH - 60, y: 6, w: 52, h: 52 },
  music: { x: 6, y: 88, w: 52, h: 52 },
};

function hitHudButton(clientX, clientY) {
  if (!touchUi.active) return null;
  const p = gamePointFromClient(clientX, clientY);
  if (
    p.x >= hudButtons.pause.x &&
    p.x <= hudButtons.pause.x + hudButtons.pause.w &&
    p.y >= hudButtons.pause.y &&
    p.y <= hudButtons.pause.y + hudButtons.pause.h
  ) {
    return "pause";
  }
  if (
    p.x >= hudButtons.music.x &&
    p.x <= hudButtons.music.x + hudButtons.music.w &&
    p.y >= hudButtons.music.y &&
    p.y <= hudButtons.music.y + hudButtons.music.h
  ) {
    return "music";
  }
  return null;
}

function padBatteryFromClient(clientX, clientY) {
  if (!padCanvas || !touchLayout.deckVisible) return -1;
  const rect = padCanvas.getBoundingClientRect();
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return -1;
  }
  const localX = ((clientX - rect.left) / rect.width) * CONFIG.WIDTH;
  const slot = Math.floor(localX / (CONFIG.WIDTH / CONFIG.BATTERY_COUNT));
  return clamp(slot, 0, CONFIG.BATTERY_COUNT - 1);
}

function handleHudTap(name) {
  if (name === "pause") {
    if (game.state === "playing") game.state = "paused";
    else if (game.state === "paused") game.state = "playing";
    return;
  }
  if (name === "music") toggleMusic();
}

function clearTouchInput() {
  touchRoles.clear();
}

function swallowActiveTouches() {
  touchRoles.forEach(function (meta) {
    meta.role = "swallow";
  });
}

function bindPointerControls() {
  canvas.addEventListener("mousemove", function (event) {
    if (touchUi.active) return;
    const p = gamePointFromClient(event.clientX, event.clientY);
    aim.x = clamp(p.x, 0, CONFIG.WIDTH);
    aim.y = clamp(p.y, 0, CONFIG.HEIGHT);
  });

  canvas.addEventListener("mousedown", function (event) {
    unlockAudio();
    canvas.focus();
    if (touchUi.active) return;
    event.preventDefault();
    const p = gamePointFromClient(event.clientX, event.clientY);
    aim.x = clamp(p.x, 0, CONFIG.WIDTH);
    aim.y = clamp(p.y, 0, CONFIG.HEIGHT);

    if (game.state === "title" || game.state === "gameover" || game.state === "won") {
      startRun(true);
      return;
    }
    if (game.state === "paused") {
      game.state = "playing";
      return;
    }
    if (game.state === "playing") {
      tryFireAt(aim.x, aim.y, aim.selectedBattery);
    }
  });
}

function bindTouchControls() {
  const frame = document.getElementById("frame");
  const opts = { passive: false };

  function ensureTouchUi() {
    if (!touchUi.active) {
      touchUi.active = true;
      loadTouchPrefs();
      fitLayout();
    }
  }

  function onTouchStart(event) {
    ensureTouchUi();
    unlockAudio();
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i += 1) {
      const t = event.changedTouches[i];
      if (touchRoles.has(t.identifier)) continue;

      const hud = hitHudButton(t.clientX, t.clientY);
      if (hud) {
        touchRoles.set(t.identifier, { role: "ui" });
        handleHudTap(hud);
        continue;
      }

      const bat = padBatteryFromClient(t.clientX, t.clientY);
      if (bat >= 0) {
        aim.selectedBattery = bat;
        padUi.flash[bat] = 0.15;
        touchRoles.set(t.identifier, { role: "ui" });
        continue;
      }

      if (game.state === "title" || game.state === "gameover" || game.state === "won") {
        startRun(true);
        touchRoles.set(t.identifier, { role: "swallow" });
        continue;
      }

      if (game.state === "paused") {
        game.state = "playing";
        touchRoles.set(t.identifier, { role: "swallow" });
        continue;
      }

      if (game.state !== "playing") continue;

      const p = gamePointFromClient(t.clientX, t.clientY);
      aim.x = clamp(p.x, 0, CONFIG.WIDTH);
      aim.y = clamp(p.y, 0, CONFIG.HEIGHT);
      touchRoles.set(t.identifier, {
        role: "aim",
        startX: t.clientX,
        startY: t.clientY,
        moved: false,
      });
    }
  }

  function onTouchMove(event) {
    if (!touchRoles.size) return;
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i += 1) {
      const t = event.changedTouches[i];
      const meta = touchRoles.get(t.identifier);
      if (!meta || meta.role !== "aim") continue;

      const dx = t.clientX - meta.startX;
      const dy = t.clientY - meta.startY;
      if (Math.hypot(dx, dy) > 8) meta.moved = true;

      const p = gamePointFromClient(t.clientX, t.clientY);
      aim.x = clamp(p.x, 0, CONFIG.WIDTH);
      aim.y = clamp(p.y, 0, CONFIG.HEIGHT);
    }
  }

  function onTouchEnd(event) {
    for (let i = 0; i < event.changedTouches.length; i += 1) {
      const t = event.changedTouches[i];
      const meta = touchRoles.get(t.identifier);
      if (!meta) continue;
      event.preventDefault();

      if (meta.role === "aim" && game.state === "playing") {
        const p = gamePointFromClient(t.clientX, t.clientY);
        aim.x = clamp(p.x, 0, CONFIG.WIDTH);
        aim.y = clamp(p.y, 0, CONFIG.HEIGHT);
        tryFireAt(aim.x, aim.y, aim.selectedBattery);
      }
      touchRoles.delete(t.identifier);
    }
  }

  frame.addEventListener("touchstart", onTouchStart, opts);
  frame.addEventListener("touchmove", onTouchMove, opts);
  frame.addEventListener("touchend", onTouchEnd, opts);
  frame.addEventListener("touchcancel", onTouchEnd, opts);

  frame.addEventListener("gesturestart", function (event) {
    event.preventDefault();
  });
  frame.addEventListener("dblclick", function (event) {
    event.preventDefault();
  });
}

function bindInput() {
  window.addEventListener("keydown", function (event) {
    unlockAudio();

    const block = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter"];
    if (block.indexOf(event.key) !== -1) event.preventDefault();

    if (event.key === "m" || event.key === "M") {
      toggleMusic();
      return;
    }

    if (event.key === "p" || event.key === "P" || event.key === "Escape") {
      if (game.state === "playing") game.state = "paused";
      else if (game.state === "paused") game.state = "playing";
      return;
    }

    if (event.key === "Enter" && !event.repeat) {
      if (game.state === "title" || game.state === "gameover" || game.state === "won") {
        startRun(true);
      } else if (game.state === "tally") {
        endTally();
      }
      return;
    }

    if (event.key === "f" || event.key === "F") {
      game.debug = !game.debug;
    }

    if (event.key === "1") aim.selectedBattery = 0;
    if (event.key === "2") aim.selectedBattery = 1;
    if (event.key === "3") aim.selectedBattery = 2;
  });

  window.addEventListener("blur", function () {
    clearTouchInput();
  });

  window.addEventListener("click", function () {
    canvas.focus();
    unlockAudio();
  });
}

// -----------------------------------------------------------------------------
// 5–8. Cities, batteries, warheads, blasts (STUB)
// -----------------------------------------------------------------------------

const cities = [];
const batteries = [];
const warheads = [];
const blasts = [];
const abms = [];

function livingCityCount() {
  let n = 0;
  for (let i = 0; i < cities.length; i += 1) {
    if (cities[i].alive) n += 1;
  }
  return n;
}

function livingBatteryCount() {
  let n = 0;
  for (let i = 0; i < batteries.length; i += 1) {
    if (batteries[i].alive && batteries[i].ammo > 0) n += 1;
  }
  return n;
}

function resetCities() {
  cities.length = 0;
  const gap = CONFIG.WIDTH / (CONFIG.CITY_COUNT + 1);
  for (let i = 0; i < CONFIG.CITY_COUNT; i += 1) {
    cities.push({
      x: gap * (i + 1),
      y: CONFIG.GROUND_Y,
      alive: true,
      label: CITY_LABELS[i] || "C" + (i + 1),
    });
  }
}

function resetBatteries() {
  batteries.length = 0;
  const xs = [48, CONFIG.WIDTH / 2, CONFIG.WIDTH - 48];
  for (let i = 0; i < CONFIG.BATTERY_COUNT; i += 1) {
    batteries.push({
      x: xs[i],
      y: CONFIG.GROUND_Y + 8,
      ammo: CONFIG.MISSILES_PER_BATTERY,
      alive: true,
    });
  }
}

function clearProjectiles() {
  warheads.length = 0;
  blasts.length = 0;
  abms.length = 0;
}

function seedStubWarheads() {
  warheads.length = 0;
  const rng = makeRng(game.seed ^ (game.wave * 9973));
  const speed = CONFIG.WARHEAD_SPEED * (1 + (game.wave - 1) * CONFIG.WAVE_SPEED_STEP);
  for (let i = 0; i < CONFIG.STUB_WARHEADS; i += 1) {
    const tx = 40 + rng() * (CONFIG.WIDTH - 80);
    const sx = 20 + rng() * (CONFIG.WIDTH - 40);
    warheads.push({
      x: sx,
      y: -10 - rng() * 80,
      sx: sx,
      sy: -20,
      tx: tx,
      ty: CONFIG.GROUND_Y,
      speed: speed * (0.85 + rng() * 0.3),
      split: rng() < CONFIG.SPLIT_CHANCE,
      alive: true,
    });
  }
}

function nearestLivingBattery(tx, preferIndex) {
  if (preferIndex >= 0 && preferIndex < batteries.length) {
    const b = batteries[preferIndex];
    if (b.alive && b.ammo > 0) return preferIndex;
  }
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < batteries.length; i += 1) {
    const b = batteries[i];
    if (!b.alive || b.ammo <= 0) continue;
    const d = Math.hypot(b.x - tx, b.y - CONFIG.GROUND_Y * 0.5);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function spawnBlast(x, y) {
  blasts.push({
    x: x,
    y: y,
    r: 4,
    maxR: CONFIG.BLAST_GROW * 0.35,
    grow: true,
    hold: CONFIG.BLAST_HOLD,
    fade: CONFIG.BLAST_FADE,
    alpha: 1,
  });
  soundBoom();
}

function tryFireAt(tx, ty, preferBattery) {
  if (game.state !== "playing") return;
  const idx = nearestLivingBattery(tx, preferBattery == null ? -1 : preferBattery);
  if (idx < 0) return;

  const bat = batteries[idx];
  bat.ammo -= 1;
  padUi.flash[idx] = 0.12;
  soundShoot();

  abms.push({
    x: bat.x,
    y: bat.y - 10,
    tx: tx,
    ty: ty,
    speed: 380,
    alive: true,
  });
}

function updateAbms(dt) {
  for (let i = abms.length - 1; i >= 0; i -= 1) {
    const m = abms[i];
    if (!m.alive) {
      abms.splice(i, 1);
      continue;
    }
    const dx = m.tx - m.x;
    const dy = m.ty - m.y;
    const d = Math.hypot(dx, dy) || 1;
    const step = m.speed * dt;
    if (step >= d) {
      spawnBlast(m.tx, m.ty);
      abms.splice(i, 1);
    } else {
      m.x += (dx / d) * step;
      m.y += (dy / d) * step;
    }
  }
}

function updateWarheads(dt) {
  for (let i = warheads.length - 1; i >= 0; i -= 1) {
    const w = warheads[i];
    if (!w.alive) {
      warheads.splice(i, 1);
      continue;
    }
    const dx = w.tx - w.sx;
    const dy = w.ty - w.sy;
    const pathLen = Math.hypot(dx, dy) || 1;
    const ux = dx / pathLen;
    const uy = dy / pathLen;
    w.x += ux * w.speed * dt;
    w.y += uy * w.speed * dt;

    // Blast intercept (stub)
    for (let j = 0; j < blasts.length; j += 1) {
      const b = blasts[j];
      if (Math.hypot(w.x - b.x, w.y - b.y) < b.r) {
        w.alive = false;
        addScore(25);
        soundHit();
        break;
      }
    }
    if (!w.alive) {
      warheads.splice(i, 1);
      continue;
    }

    if (w.y >= CONFIG.GROUND_Y - 2) {
      // Hit ground — destroy nearest living city (stub)
      let hit = null;
      let best = Infinity;
      for (let c = 0; c < cities.length; c += 1) {
        if (!cities[c].alive) continue;
        const d = Math.abs(cities[c].x - w.x);
        if (d < best) {
          best = d;
          hit = cities[c];
        }
      }
      if (hit && best < 70) {
        hit.alive = false;
        soundBoom();
        refreshMusicBed();
      } else {
        // Maybe hit a battery
        for (let b = 0; b < batteries.length; b += 1) {
          if (!batteries[b].alive) continue;
          if (Math.abs(batteries[b].x - w.x) < 36) {
            batteries[b].alive = false;
            batteries[b].ammo = 0;
            soundBoom();
            break;
          }
        }
      }
      warheads.splice(i, 1);
    }
  }
}

function updateBlasts(dt) {
  for (let i = blasts.length - 1; i >= 0; i -= 1) {
    const b = blasts[i];
    if (b.grow) {
      b.r += (b.maxR / 0.22) * dt;
      if (b.r >= b.maxR) {
        b.r = b.maxR;
        b.grow = false;
      }
    } else if (b.hold > 0) {
      b.hold -= dt;
    } else {
      b.fade -= dt;
      b.alpha = clamp(b.fade / CONFIG.BLAST_FADE, 0, 1);
      if (b.fade <= 0) blasts.splice(i, 1);
    }
  }
}

function refreshMusicBed() {
  const citiesLeft = livingCityCount();
  if (citiesLeft === 1) setMusicBed(1);
  else setMusicBed(0);
}

// -----------------------------------------------------------------------------
// 9. Game state
// -----------------------------------------------------------------------------

const game = {
  state: "title",
  seed: 1,
  time: 0,
  score: 0,
  highScore: 0,
  wave: 1,
  tallyTimer: 0,
  tallyBonus: 0,
  newRecord: false,
  startHigh: 0,
  debug: false,
  fps: 0,
  fpsAccum: 0,
  fpsFrames: 0,
};

function newSeed() {
  return (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0;
}

function loadHighScore() {
  try {
    const n = parseInt(localStorage.getItem(CONFIG.HS_KEY), 10);
    if (n > 0) game.highScore = n;
  } catch (_err) {
    /* ignore */
  }
}

function saveHighScore() {
  if (game.score > game.highScore) game.highScore = game.score;
  if (game.score > game.startHigh) game.newRecord = true;
  try {
    localStorage.setItem(CONFIG.HS_KEY, String(game.highScore));
  } catch (_err) {
    /* ignore */
  }
}

function addScore(points) {
  game.score += points;
  if (game.score > game.highScore) {
    game.highScore = game.score;
    game.newRecord = true;
    saveHighScore();
  }
}

function startWave() {
  clearProjectiles();
  for (let i = 0; i < batteries.length; i += 1) {
    if (batteries[i].alive) batteries[i].ammo = CONFIG.MISSILES_PER_BATTERY;
  }
  seedStubWarheads();
  game.state = "playing";
  aim.selectedBattery = -1;
  refreshMusicBed();
}

function beginTally() {
  const citiesLeft = livingCityCount();
  const ammoLeft = batteries.reduce(function (sum, b) {
    return sum + (b.alive ? b.ammo : 0);
  }, 0);
  game.tallyBonus = citiesLeft * 100 + ammoLeft * 5;
  addScore(game.tallyBonus);
  game.tallyTimer = CONFIG.TALLY_TIME;
  game.state = "tally";
  soundClear();
  syncFileMusic();
}

function endTally() {
  if (game.wave >= CONFIG.WAVES_TO_WIN) {
    saveHighScore();
    game.state = "won";
    setMusicBed(0);
    syncFileMusic();
    return;
  }
  game.wave += 1;
  startWave();
  syncFileMusic();
}

function startRun(freshSeed) {
  if (freshSeed) game.seed = newSeed();
  resetCities();
  resetBatteries();
  clearProjectiles();
  game.state = "playing";
  game.time = 0;
  game.score = 0;
  game.wave = 1;
  game.tallyTimer = 0;
  game.tallyBonus = 0;
  game.newRecord = false;
  game.startHigh = game.highScore;
  aim.x = CONFIG.WIDTH / 2;
  aim.y = CONFIG.HEIGHT * 0.4;
  aim.selectedBattery = -1;
  swallowActiveTouches();
  startWave();
}

function checkWaveClearOrLoss() {
  if (livingCityCount() <= 0) {
    saveHighScore();
    game.state = "gameover";
    setMusicBed(0);
    return;
  }
  if (warheads.length === 0 && abms.length === 0 && blasts.length === 0) {
    beginTally();
  }
}

function updateFps(dt) {
  game.fpsAccum += dt;
  game.fpsFrames += 1;
  if (game.fpsAccum >= 0.5) {
    game.fps = Math.round(game.fpsFrames / game.fpsAccum);
    game.fpsAccum = 0;
    game.fpsFrames = 0;
  }
}

// -----------------------------------------------------------------------------
// 10. Update
// -----------------------------------------------------------------------------

function update(dt) {
  game.time += dt;
  syncFileMusic();

  for (let i = 0; i < padUi.flash.length; i += 1) {
    if (padUi.flash[i] > 0) padUi.flash[i] -= dt;
  }

  if (game.state === "title") return;
  if (game.state === "paused" || game.state === "gameover" || game.state === "won") return;

  if (game.state === "tally") {
    game.tallyTimer -= dt;
    if (game.tallyTimer <= 0) endTally();
    return;
  }

  if (game.state !== "playing") return;

  updateAbms(dt);
  updateWarheads(dt);
  updateBlasts(dt);
  checkWaveClearOrLoss();
}

// -----------------------------------------------------------------------------
// 11. Draw
// -----------------------------------------------------------------------------

function drawSky(ctx) {
  ctx.fillStyle = COLORS.sky;
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  ctx.fillStyle = COLORS.star;
  const rng = makeRng(game.seed ^ 0x55aa);
  for (let i = 0; i < 70; i += 1) {
    const x = rng() * CONFIG.WIDTH;
    const y = rng() * (CONFIG.GROUND_Y - 40);
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawGround(ctx) {
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, CONFIG.GROUND_Y, CONFIG.WIDTH, CONFIG.HEIGHT - CONFIG.GROUND_Y);
  ctx.strokeStyle = COLORS.groundLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, CONFIG.GROUND_Y);
  ctx.lineTo(CONFIG.WIDTH, CONFIG.GROUND_Y);
  ctx.stroke();
}

function drawCities(ctx) {
  for (let i = 0; i < cities.length; i += 1) {
    const c = cities[i];
    ctx.fillStyle = c.alive ? COLORS.city : COLORS.cityDead;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - 22);
    ctx.lineTo(c.x + 14, c.y);
    ctx.lineTo(c.x - 14, c.y);
    ctx.closePath();
    ctx.fill();
    if (c.alive) {
      ctx.fillStyle = COLORS.text;
      ctx.font = "8px Courier New, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(c.label, c.x, c.y + 4);
    }
  }
}

function drawBatteries(ctx) {
  for (let i = 0; i < batteries.length; i += 1) {
    const b = batteries[i];
    const selected = aim.selectedBattery === i;
    ctx.fillStyle = b.alive ? COLORS.battery : COLORS.batteryDead;
    ctx.fillRect(b.x - 14, b.y - 18, 28, 18);
    if (selected && b.alive) {
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x - 16, b.y - 20, 32, 22);
    }
    ctx.fillStyle = b.alive ? COLORS.ammo : COLORS.cityDead;
    ctx.font = "bold 12px Courier New, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(String(b.ammo), b.x, b.y - 22);
  }
}

function drawWarheads(ctx) {
  for (let i = 0; i < warheads.length; i += 1) {
    const w = warheads[i];
    ctx.strokeStyle = COLORS.trail;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w.sx, w.sy);
    ctx.lineTo(w.x, w.y);
    ctx.stroke();
    ctx.fillStyle = COLORS.warhead;
    ctx.beginPath();
    ctx.arc(w.x, w.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAbms(ctx) {
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < abms.length; i += 1) {
    const m = abms[i];
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    const dx = m.tx - m.x;
    const dy = m.ty - m.y;
    const d = Math.hypot(dx, dy) || 1;
    ctx.lineTo(m.x - (dx / d) * 10, m.y - (dy / d) * 10);
    ctx.stroke();
    ctx.fillStyle = COLORS.crosshair;
    ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
  }
}

function drawBlasts(ctx) {
  for (let i = 0; i < blasts.length; i += 1) {
    const b = blasts[i];
    ctx.globalAlpha = b.alpha * 0.85;
    ctx.strokeStyle = COLORS.blastRing;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.blast;
    ctx.globalAlpha = b.alpha * 0.25;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawCrosshair(ctx) {
  if (game.state !== "playing" && game.state !== "paused") return;
  const x = aim.x;
  const y = aim.y;
  ctx.strokeStyle = COLORS.crosshair;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 10, y);
  ctx.lineTo(x - 3, y);
  ctx.moveTo(x + 3, y);
  ctx.lineTo(x + 10, y);
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x, y - 3);
  ctx.moveTo(x, y + 3);
  ctx.lineTo(x, y + 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCitadelRow(ctx) {
  const startX = CONFIG.WIDTH / 2 - (CONFIG.CITY_COUNT * 14) / 2;
  const y = 34;
  for (let i = 0; i < cities.length; i += 1) {
    const cx = startX + i * 16 + 6;
    ctx.fillStyle = cities[i].alive ? COLORS.city : COLORS.cityDead;
    ctx.beginPath();
    ctx.moveTo(cx, y - 8);
    ctx.lineTo(cx + 6, y);
    ctx.lineTo(cx - 6, y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHud(ctx) {
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HUD_BAR_H);
  ctx.fillStyle = COLORS.text;
  ctx.font = "bold 14px Courier New, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("SCORE " + game.score, 8, 8);
  ctx.fillText("HI " + game.highScore, 8, 28);
  ctx.textAlign = "right";
  ctx.fillText("WAVE " + game.wave + "/" + CONFIG.WAVES_TO_WIN, CONFIG.WIDTH - 8, 8);
  drawCitadelRow(ctx);

  if (touchUi.active) {
    const pb = hudButtons.pause;
    const mb = hudButtons.music;
    ctx.fillStyle = COLORS.bridgeRail;
    ctx.fillRect(pb.x, pb.y, pb.w, pb.h);
    ctx.fillStyle = music.on ? COLORS.accent : COLORS.bridgeRail;
    ctx.fillRect(mb.x, mb.y, mb.w, mb.h);
    ctx.fillStyle = COLORS.text;
    ctx.font = "10px Courier New, monospace";
    ctx.textAlign = "center";
    ctx.fillText("II", pb.x + pb.w / 2, pb.y + 22);
    ctx.fillText(music.on ? "MUS" : "OFF", mb.x + mb.w / 2, mb.y + 22);
  } else if (CONFIG.MUSIC_TRACKS.length) {
    ctx.fillStyle = music.on ? COLORS.text : COLORS.danger;
    ctx.font = "11px Courier New, monospace";
    ctx.textAlign = "left";
    ctx.fillText(music.on ? "MUSIC ON" : "MUSIC OFF", 8, 58);
  }
}

function drawTitle(ctx) {
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  ctx.fillStyle = COLORS.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 40px Courier New, monospace";
  ctx.fillText("CITADEL FALL", CONFIG.WIDTH / 2, 180);
  ctx.fillStyle = COLORS.text;
  ctx.font = "16px Courier New, monospace";
  ctx.fillText("defend the six · hold the sky", CONFIG.WIDTH / 2, 230);
  ctx.font = "14px Courier New, monospace";
  ctx.fillText("mouse aim · click fire · 1/2/3 batteries", CONFIG.WIDTH / 2, 300);
  ctx.fillText("M music  P pause  Enter start", CONFIG.WIDTH / 2, 324);
  if (game.time >= CONFIG.TITLE_PROMPT_DELAY && Math.floor(game.time * 3) % 2 === 0) {
    ctx.font = "bold 18px Courier New, monospace";
    ctx.fillText(isTouchDevice ? "TAP TO START" : "PRESS ENTER", CONFIG.WIDTH / 2, 390);
  }
  ctx.fillStyle = COLORS.accent;
  ctx.font = "bold 16px Courier New, monospace";
  ctx.textBaseline = "bottom";
  ctx.fillText("© 2026 MACIEJ TUREK", CONFIG.WIDTH / 2, CONFIG.HEIGHT - 14);
}

function drawPause(ctx) {
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 28px Courier New, monospace";
  ctx.fillText("PAUSED", CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 10);
  ctx.font = "16px Courier New, monospace";
  ctx.fillText(
    isTouchDevice ? "tap to continue" : "press P to continue",
    CONFIG.WIDTH / 2,
    CONFIG.HEIGHT / 2 + 24
  );
}

function drawTally(ctx) {
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  ctx.fillStyle = COLORS.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 28px Courier New, monospace";
  ctx.fillText("WAVE " + game.wave + " CLEAR", CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 40);
  ctx.fillStyle = COLORS.text;
  ctx.font = "18px Courier New, monospace";
  ctx.fillText("BONUS +" + game.tallyBonus, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 + 4);
  ctx.font = "14px Courier New, monospace";
  ctx.fillText(
    isTouchDevice ? "…" : "Enter to continue",
    CONFIG.WIDTH / 2,
    CONFIG.HEIGHT / 2 + 40
  );
}

function drawGameOver(ctx) {
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 32px Courier New, monospace";
  ctx.fillText("CITADELS FALLEN", CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 62);
  ctx.font = "18px Courier New, monospace";
  ctx.fillText("SCORE " + game.score, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 16);
  ctx.fillText("HI " + game.highScore, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 + 12);
  if (game.newRecord) {
    ctx.fillStyle = COLORS.accent;
    ctx.font = "bold 16px Courier New, monospace";
    ctx.fillText("NEW RECORD", CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 + 40);
  }
  ctx.fillStyle = COLORS.text;
  ctx.font = "16px Courier New, monospace";
  ctx.fillText(
    isTouchDevice ? "tap to restart" : "press Enter to restart",
    CONFIG.WIDTH / 2,
    CONFIG.HEIGHT / 2 + 72
  );
}

function drawWin(ctx) {
  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  ctx.fillStyle = COLORS.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 36px Courier New, monospace";
  ctx.fillText("SKY HELD", CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 70);
  ctx.fillStyle = COLORS.text;
  ctx.font = "18px Courier New, monospace";
  ctx.fillText("SCORE " + game.score, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 16);
  ctx.fillText("HI " + game.highScore, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 + 12);
  ctx.font = "16px Courier New, monospace";
  ctx.fillText(
    isTouchDevice ? "tap to restart" : "press Enter to restart",
    CONFIG.WIDTH / 2,
    CONFIG.HEIGHT / 2 + 72
  );
}

function drawDebug(ctx) {
  ctx.fillStyle = COLORS.debug;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "12px Courier New, monospace";
  ctx.fillText("FPS " + game.fps, 8, 66);
  ctx.fillText("SEED " + game.seed, 8, 82);
  ctx.fillText("CITIES " + livingCityCount(), 8, 98);
  ctx.fillText("STUB — see PROMPT.md", 8, 114);
}

function drawPad(padCtx) {
  if (!touchUi.active || !touchLayout.deckVisible) return;

  const w = CONFIG.WIDTH;
  const h = CONFIG.PAD_H;
  const playing = game.state === "playing";
  const dim = playing ? 1 : 0.55;

  padCtx.setTransform(1, 0, 0, 1, 0, 0);
  padCtx.globalAlpha = dim;
  padCtx.imageSmoothingEnabled = false;

  padCtx.fillStyle = "#0e1814";
  padCtx.fillRect(0, 0, w, h);
  padCtx.fillStyle = COLORS.bridgeRail;
  padCtx.fillRect(0, 0, w, 3);

  const slotW = w / CONFIG.BATTERY_COUNT;
  for (let i = 0; i < CONFIG.BATTERY_COUNT; i += 1) {
    const cx = slotW * i + slotW / 2;
    const bat = batteries[i];
    const alive = bat && bat.alive && bat.ammo > 0;
    const lit = padUi.flash[i] > 0 || aim.selectedBattery === i;
    padCtx.fillStyle = lit ? COLORS.accent : alive ? COLORS.bridge : COLORS.bridgeRail;
    padCtx.beginPath();
    padCtx.arc(cx, h * 0.48, 46, 0, Math.PI * 2);
    padCtx.fill();
    padCtx.fillStyle = COLORS.text;
    padCtx.font = "bold 16px Courier New, monospace";
    padCtx.textAlign = "center";
    padCtx.textBaseline = "middle";
    padCtx.fillText("BAT" + (i + 1), cx, h * 0.42);
    padCtx.font = "12px Courier New, monospace";
    padCtx.fillText(bat ? String(bat.ammo) : "0", cx, h * 0.58);
  }

  padCtx.globalAlpha = 1;
}

function draw(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSky(ctx);

  if (game.state !== "title") {
    drawGround(ctx);
    drawCities(ctx);
    drawBatteries(ctx);
    drawWarheads(ctx);
    drawAbms(ctx);
    drawBlasts(ctx);
    drawCrosshair(ctx);
  }

  if (game.state === "title") drawTitle(ctx);
  if (game.state === "paused") drawPause(ctx);
  if (game.state === "tally") drawTally(ctx);
  if (game.state === "gameover") drawGameOver(ctx);
  if (game.state === "won") drawWin(ctx);

  if (game.state !== "title") drawHud(ctx);
  if (game.debug) drawDebug(ctx);
}

// -----------------------------------------------------------------------------
// 12. Loop / boot
// -----------------------------------------------------------------------------

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const padCanvas = document.getElementById("pad");
const padCtx = padCanvas ? padCanvas.getContext("2d") : null;
if (padCtx) padCtx.imageSmoothingEnabled = false;

function fitLayout() {
  const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const landscape = vh < vw;
  // Portrait + touch: show BAT1/2/3 deck. Landscape: hide deck, aim on canvas.
  const showDeck = touchUi.active && !landscape;

  if (showDeck && padCanvas) {
    const totalH = CONFIG.HEIGHT + CONFIG.PAD_H;
    const scale = Math.min(vw / CONFIG.WIDTH, vh / totalH);
    touchLayout.scale = scale;
    touchLayout.deckVisible = true;
    padCanvas.style.display = "block";
    canvas.style.width = Math.floor(CONFIG.WIDTH * scale) + "px";
    canvas.style.height = Math.floor(CONFIG.HEIGHT * scale) + "px";
    padCanvas.style.width = Math.floor(CONFIG.WIDTH * scale) + "px";
    padCanvas.style.height = Math.floor(CONFIG.PAD_H * scale) + "px";
  } else {
    const scale = Math.min(vw / CONFIG.WIDTH, vh / CONFIG.HEIGHT);
    touchLayout.scale = scale;
    touchLayout.deckVisible = false;
    if (padCanvas) padCanvas.style.display = "none";
    canvas.style.width = Math.floor(CONFIG.WIDTH * scale) + "px";
    canvas.style.height = Math.floor(CONFIG.HEIGHT * scale) + "px";
  }
}

let lastTime = 0;

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  let dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  if (dt > 0.05) dt = 0.05;

  update(dt);
  updateFps(dt);
  draw(ctx);
  if (padCtx) drawPad(padCtx);
  requestAnimationFrame(loop);
}

function boot() {
  loadTouchPrefs();
  bindInput();
  bindPointerControls();
  bindTouchControls();
  window.addEventListener("resize", fitLayout);
  window.addEventListener("orientationchange", fitLayout);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitLayout);
  }
  fitLayout();
  game.seed = newSeed();
  game.state = "title";
  resetCities();
  resetBatteries();
  loadHighScore();
  canvas.focus();
  requestAnimationFrame(loop);
}

boot();
