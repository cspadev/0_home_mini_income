// config.ts – every balance parameter of the game in one place. Distances are in world units
// (the playfield is always WORLD_WIDTH wide; its height follows the screen aspect), times in seconds.
// All pacing timestamps are FRACTIONS of the round duration, so a shorter or longer round keeps the same shape.

export const WORLD_WIDTH = 360;

export const CONFIG = {
  /** Simulation runs at a fixed step, independent of display refresh rate (60 vs 120 Hz). */
  stepSec: 1 / 60,
  /** Max simulation steps per rendered frame; the rest of a long frame is dropped (no catch-up spiral). */
  maxStepsPerFrame: 5,
  /** A frame longer than this (tab switch, debugger) is treated as this long. */
  maxFrameSec: 0.25,

  /** Assignment defaults and allowed ranges (INIT `level`, `payload.duration`, `payload.blood`). */
  defaults: { level: 1, duration: 30, blood: 8 },
  limits: { level: [1, 3], duration: [10, 120], blood: [1, 20] },
  /** Per-level multipliers, indexed by level - 1. Level 1 is the standard tuning from the brief. */
  levelSpeedMul: [1, 1.15, 1.3],
  levelSpawnMul: [1, 1.2, 1.4],

  world: {
    /** The world height follows the screen aspect, clamped to this range (the stage is letterboxed beyond it). */
    minHeight: 480,
    maxHeight: 900,
    /** Sleeper (target) vertical position as a fraction of the world height. */
    targetY: 0.7,
    /** Mosquitoes spawn this far outside the playfield edge and fly in. HUD and controls are outside the playfield. */
    spawnMargin: 28,
  },

  kinds: {
    slow: {
      speed: 80, // predictable straight flight
      hp: 1,
      points: 10,
      hitRadius: 30, // generous invisible hit area
      drawRadius: 15,
      zigzagAmp: 0,
      zigzagFreq: 0,
      minTravelSec: 2.4, // spawn → target is never faster than this, so the player can react
    },
    fast: {
      speed: 130,
      hp: 1,
      points: 10,
      hitRadius: 30,
      drawRadius: 13,
      zigzagAmp: 14, // gentle sideways wobble that fades out near the target
      zigzagFreq: 4.5,
      minTravelSec: 1.6,
    },
    boss: {
      speed: 56,
      hp: 3,
      points: 30,
      hitRadius: 42,
      drawRadius: 27,
      zigzagAmp: 0,
      zigzagFreq: 0,
      minTravelSec: 4.0,
    },
  },

  /**
   * Pacing stages. Each stage lasts until `until` (fraction of the round). Inside a stage the spawn
   * interval and the speed multiplier are interpolated from the first to the second value.
   * `fastShare` is the share of fast mosquitoes among ordinary spawns.
   * At 30 s: 0–5 s intro, 5–15 s mixed, 15–25 s escalation (steps up at 15 s), 25–30 s final push.
   */
  stages: [
    { until: 1 / 6, interval: [1.5, 1.4], speedMul: [1, 1], fastShare: 0.1 },
    { until: 1 / 2, interval: [1.3, 1.1], speedMul: [1, 1.08], fastShare: 0.5 },
    { until: 5 / 6, interval: [0.8, 0.55], speedMul: [1.2, 1.5], fastShare: 0.7 },
    { until: 1, interval: [0.5, 0.42], speedMul: [1.5, 1.6], fastShare: 0.75 },
  ],
  /** Boss spawn times (fraction of the round). Only one boss at a time; a late boss waits for the previous one. */
  bossAt: [0.25, 0.6, 0.85],
  /** The lights go out and "Zhasnuto. Začíná peklo." appears at this fraction of the round. */
  lightsOutAt: 0.5,
  /** The last N seconds show the big countdown. */
  countdownSec: 5,
  /** Delay before the first ordinary spawn. */
  firstSpawnSec: 0.6,

  spawn: {
    /** Relative chance of each spawn edge. Bottom spawns only in the corners, away from the bed. */
    edgeWeights: { top: 0.3, left: 0.28, right: 0.28, bottom: 0.14 },
    /** Candidate positions tried before a spawn is postponed. */
    attempts: 12,
    retrySec: 0.1,
    /** Ordinary mosquitoes alive at once (the boss is not limited by this). */
    maxAlive: 7,
    /** A new mosquito spawns at least this far from every living one (no overlap). */
    minSeparation: 70,
    /** Arrival times at the target differ by at least this much, so bites are never unavoidable. */
    minEtaGapSec: 0.4,
    /** Random ± speed variation. */
    speedJitter: 0.08,
    /** Zigzag amplitude fades out over the last N units of the path. */
    zigzagFade: 80,
  },

  /** A repeated pointer event this close in time and space is the same input delivered twice. */
  tap: { debounceSec: 0.04, debounceDist: 6 },

  scoring: { streakStep: 5, streakBonus: 10 },

  /**
   * Rank is derived from the share of resolved mosquitoes that were eliminated (eliminated / (eliminated + bites))
   * and the number eliminated. Checked from the best rank down; the first match wins.
   */
  ranks: [
    { title: 'Postrach večerního bzučení', minRatio: 0.9, minEliminated: 8, mustSurvive: true },
    { title: 'Plácačkový specialista', minRatio: 0.75, minEliminated: 6, mustSurvive: true },
    { title: 'Lovec komárů III. třídy', minRatio: 0.5, minEliminated: 4, mustSurvive: false },
  ],
  fallbackRank: 'Dobrovolný dárce krve',

  /** After blood runs out or time is up the final effects play this long before the results appear. */
  endHoldSec: 0.9,
} as const;
