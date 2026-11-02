// Shared types for the simulation, scoring and integration layers. No DOM here: usable from node tests.

export type Kind = 'slow' | 'fast' | 'boss';
export type EndReason = 'timeUp' | 'bloodOut' | 'gaveUp';

export interface Vec {
  x: number;
  y: number;
}

/** Resolved assignment: INIT `level` + `payload` after validation and defaults. */
export interface Settings {
  level: number;
  duration: number;
  blood: number;
}

export interface Mosquito {
  id: number;
  kind: Kind;
  alive: boolean;
  hp: number;
  maxHp: number;
  /** Spawn point; the path is the straight segment from here to the target. */
  sx: number;
  sy: number;
  /** Length of the straight path (world units). */
  len: number;
  /** Progress along the path, 0 = spawn, 1 = reached the target. */
  t: number;
  /** Speed along the path (world units per second). */
  speed: number;
  /** Zigzag phase (radians). */
  phase: number;
  x: number;
  y: number;
  /** Position one simulation step ago, used for render interpolation. */
  px: number;
  py: number;
}

export type SimEvent =
  | { type: 'hit'; id: number; kind: Kind; x: number; y: number; killed: boolean; hpLeft: number; points: number }
  | { type: 'miss'; x: number; y: number }
  | { type: 'streak'; x: number; y: number; streak: number; bonus: number }
  | { type: 'bite'; x: number; y: number; bloodLeft: number }
  | { type: 'spawn'; id: number; kind: Kind }
  | { type: 'lights' }
  | { type: 'end'; reason: EndReason };

/** Plain data describing a finished (or abandoned) round. */
export interface RoundResult {
  level: number;
  duration: number;
  bloodMax: number;
  reason: EndReason;
  survived: boolean;
  timeSurvivedSec: number;
  bloodLeft: number;
  bites: number;
  eliminated: number;
  bossesEliminated: number;
  score: number;
  bestStreak: number;
  streakBonuses: number;
  taps: number;
  hits: number;
  misses: number;
}

export interface HudState {
  timeLeft: number;
  blood: number;
  bloodMax: number;
  score: number;
  streak: number;
}
