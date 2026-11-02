// sim.ts – the whole game simulation. Pure TypeScript, no DOM/React: deterministic given a seeded RNG.
// Rendering reads `mosquitoes` every frame; React only sees HUD snapshots and the final result.

import { CONFIG, WORLD_WIDTH } from './config.ts';
import { pacingAt } from './pacing.ts';
import type { Rng } from './rng.ts';
import type { EndReason, Kind, Mosquito, RoundResult, Settings, SimEvent, Vec } from './types.ts';

export type TapOutcome = 'kill' | 'hit' | 'miss' | 'ignored';

export function clampWorldHeight(h: number): number {
  return Math.min(CONFIG.world.maxHeight, Math.max(CONFIG.world.minHeight, h));
}

export class Sim {
  readonly width = WORLD_WIDTH;
  height: number;
  time = 0;
  blood: number;
  score = 0;
  streak = 0;
  bestStreak = 0;
  streakBonuses = 0;
  bites = 0;
  eliminated = 0;
  bossesEliminated = 0;
  taps = 0;
  hits = 0;
  misses = 0;
  ended: EndReason | null = null;
  mosquitoes: Mosquito[] = [];
  /** Automatic spawning; tests switch it off to script exact encounters. */
  spawning = true;
  readonly settings: Settings;

  private readonly rng: Rng;
  private events: SimEvent[] = [];
  private nextId = 1;
  private nextSpawnAt: number = CONFIG.firstSpawnSec;
  private bossIndex = 0;
  private bossRetryAt = 0;
  private lightsOut = false;
  private lastTapTime = -Infinity;
  private lastTapPos: Vec = { x: 0, y: 0 };

  constructor(settings: Settings, rng: Rng, height: number) {
    this.settings = settings;
    this.rng = rng;
    this.height = clampWorldHeight(height);
    this.blood = settings.blood;
  }

  get target(): Vec {
    return { x: this.width / 2, y: this.height * CONFIG.world.targetY };
  }

  get bossAlive(): boolean {
    return this.mosquitoes.some((m) => m.kind === 'boss');
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Advances the simulation by one fixed step. */
  step(dt: number = CONFIG.stepSec): void {
    if (this.ended) return;
    this.time += dt;

    if (!this.lightsOut && this.time >= this.settings.duration * CONFIG.lightsOutAt) {
      this.lightsOut = true;
      this.events.push({ type: 'lights' });
    }

    this.spawnLogic();

    for (const m of this.mosquitoes) {
      m.px = m.x;
      m.py = m.y;
      m.t += (m.speed * dt) / m.len;
      m.phase += CONFIG.kinds[m.kind].zigzagFreq * dt;
      this.place(m);
    }

    for (const m of this.mosquitoes) {
      if (m.t < 1) continue;
      m.alive = false;
      this.blood -= 1;
      this.bites += 1;
      this.events.push({ type: 'bite', x: this.target.x, y: this.target.y, bloodLeft: this.blood });
      if (this.blood <= 0) {
        this.mosquitoes = this.mosquitoes.filter((q) => q.alive);
        this.end('bloodOut');
        return;
      }
    }
    this.mosquitoes = this.mosquitoes.filter((q) => q.alive);

    if (this.time >= this.settings.duration) {
      this.time = this.settings.duration;
      this.end('timeUp');
    }
  }

  /** Handles one tap at world coordinates. A tap damages at most one mosquito. */
  tap(x: number, y: number): TapOutcome {
    if (this.ended) return 'ignored';
    const { debounceSec, debounceDist } = CONFIG.tap;
    if (
      this.time - this.lastTapTime < debounceSec &&
      Math.hypot(x - this.lastTapPos.x, y - this.lastTapPos.y) < debounceDist
    ) {
      return 'ignored';
    }
    this.lastTapTime = this.time;
    this.lastTapPos = { x, y };
    this.taps += 1;

    let best: Mosquito | null = null;
    let bestDist = Infinity;
    for (const m of this.mosquitoes) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d <= CONFIG.kinds[m.kind].hitRadius && d < bestDist) {
        best = m;
        bestDist = d;
      }
    }

    if (!best) {
      this.misses += 1;
      this.streak = 0;
      this.events.push({ type: 'miss', x, y });
      return 'miss';
    }

    best.hp -= 1;
    this.hits += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const killed = best.hp <= 0;
    let points = 0;
    if (killed) {
      best.alive = false;
      this.mosquitoes = this.mosquitoes.filter((q) => q !== best);
      this.eliminated += 1;
      if (best.kind === 'boss') this.bossesEliminated += 1;
      points = CONFIG.kinds[best.kind].points;
      this.score += points;
    }
    this.events.push({ type: 'hit', id: best.id, kind: best.kind, x: best.x, y: best.y, killed, hpLeft: Math.max(0, best.hp), points });

    const { streakStep, streakBonus } = CONFIG.scoring;
    if (this.streak % streakStep === 0) {
      this.score += streakBonus;
      this.streakBonuses += 1;
      this.events.push({ type: 'streak', x: best.x, y: best.y, streak: this.streak, bonus: streakBonus });
    }
    return killed ? 'kill' : 'hit';
  }

  giveUp(): void {
    this.end('gaveUp');
  }

  /**
   * Rescales to a new world height. Progress along each path is preserved, so mosquitoes never jump
   * toward (or into) the target when the window changes.
   */
  resize(height: number): void {
    const next = clampWorldHeight(height);
    if (next === this.height) return;
    const k = next / this.height;
    this.height = next;
    const tg = this.target;
    for (const m of this.mosquitoes) {
      m.sy *= k;
      m.len = Math.hypot(tg.x - m.sx, tg.y - m.sy);
      this.place(m);
      m.px = m.x;
      m.py = m.y;
    }
  }

  result(): RoundResult {
    const { duration, blood, level } = this.settings;
    return {
      level,
      duration,
      bloodMax: blood,
      reason: this.ended ?? 'gaveUp',
      survived: this.ended === 'timeUp',
      timeSurvivedSec: Math.min(duration, this.time),
      bloodLeft: Math.max(0, this.blood),
      bites: this.bites,
      eliminated: this.eliminated,
      bossesEliminated: this.bossesEliminated,
      score: this.score,
      bestStreak: this.bestStreak,
      streakBonuses: this.streakBonuses,
      taps: this.taps,
      hits: this.hits,
      misses: this.misses,
    };
  }

  private end(reason: EndReason): void {
    if (this.ended) return;
    this.ended = reason;
    this.events.push({ type: 'end', reason });
  }

  private spawnLogic(): void {
    if (!this.spawning) return;
    const pace = pacingAt(this.time / this.settings.duration, this.settings);

    const bossTimes = CONFIG.bossAt;
    if (
      this.bossIndex < bossTimes.length &&
      this.time >= bossTimes[this.bossIndex] * this.settings.duration &&
      this.time >= this.bossRetryAt &&
      !this.bossAlive
    ) {
      if (this.trySpawn('boss', pace.speedMul)) this.bossIndex += 1;
      else this.bossRetryAt = this.time + CONFIG.spawn.retrySec;
    }

    if (this.time >= this.nextSpawnAt) {
      const ordinary = this.mosquitoes.filter((m) => m.kind !== 'boss').length;
      const kind: Kind = this.rng() < pace.fastShare ? 'fast' : 'slow';
      if (ordinary < CONFIG.spawn.maxAlive && this.trySpawn(kind, pace.speedMul)) {
        this.nextSpawnAt = this.time + pace.interval * (0.85 + 0.3 * this.rng());
      } else {
        this.nextSpawnAt = this.time + CONFIG.spawn.retrySec;
      }
    }
  }

  private trySpawn(kind: Kind, speedMul: number): boolean {
    const spec = CONFIG.kinds[kind];
    const tg = this.target;
    for (let i = 0; i < CONFIG.spawn.attempts; i++) {
      const p = this.pickSpawnPoint();
      const len = Math.hypot(tg.x - p.x, tg.y - p.y);
      const jitter = 1 + (this.rng() * 2 - 1) * CONFIG.spawn.speedJitter;
      const speed = Math.min(spec.speed * speedMul * jitter, len / spec.minTravelSec);
      const eta = len / speed;

      const clear = this.mosquitoes.every((m) => {
        if (Math.hypot(m.x - p.x, m.y - p.y) < CONFIG.spawn.minSeparation) return false;
        const otherEta = ((1 - m.t) * m.len) / m.speed;
        return Math.abs(otherEta - eta) >= CONFIG.spawn.minEtaGapSec;
      });
      if (!clear) continue;

      this.addMosquito(kind, p.x, p.y, speed);
      return true;
    }
    return false;
  }

  /** Adds a mosquito at a spawn point flying straight to the target at `speed` units per second. */
  addMosquito(kind: Kind, sx: number, sy: number, speed: number): Mosquito {
    const spec = CONFIG.kinds[kind];
    const tg = this.target;
    const m: Mosquito = {
      id: this.nextId++,
      kind,
      alive: true,
      hp: spec.hp,
      maxHp: spec.hp,
      sx,
      sy,
      len: Math.hypot(tg.x - sx, tg.y - sy),
      t: 0,
      speed,
      phase: this.rng() * Math.PI * 2,
      x: sx,
      y: sy,
      px: sx,
      py: sy,
    };
    this.place(m);
    m.px = m.x;
    m.py = m.y;
    this.mosquitoes.push(m);
    this.events.push({ type: 'spawn', id: m.id, kind });
    return m;
  }

  private pickSpawnPoint(): Vec {
    const w = this.width;
    const h = this.height;
    const margin = CONFIG.world.spawnMargin;
    const weights = CONFIG.spawn.edgeWeights;
    let r = this.rng() * (weights.top + weights.left + weights.right + weights.bottom);
    if ((r -= weights.top) < 0) return { x: 20 + this.rng() * (w - 40), y: -margin };
    const sideY = h * (0.05 + this.rng() * 0.6);
    if ((r -= weights.left) < 0) return { x: -margin, y: sideY };
    if ((r -= weights.right) < 0) return { x: w + margin, y: sideY };
    const cornerX = this.rng() < 0.5 ? w * (0.05 + this.rng() * 0.2) : w * (0.75 + this.rng() * 0.2);
    return { x: cornerX, y: h + margin };
  }

  /** Writes the current position of a mosquito from its path progress and zigzag. */
  private place(m: Mosquito): void {
    const tg = this.target;
    const t = Math.min(1, m.t);
    const dx = tg.x - m.sx;
    const dy = tg.y - m.sy;
    const spec = CONFIG.kinds[m.kind];
    const remaining = (1 - t) * m.len;
    const fade = Math.min(1, remaining / CONFIG.spawn.zigzagFade);
    const off = spec.zigzagAmp * Math.sin(m.phase) * fade;
    m.x = m.sx + dx * t + (-dy / m.len) * off;
    m.y = m.sy + dy * t + (dx / m.len) * off;
  }
}
