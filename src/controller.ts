// controller.ts – one round of play: owns the Sim, the fixed-step accumulator, pause, the end hold and teardown.
// DOM-free so restart/termination behaviour is testable in node. The browser glue lives in session.ts.

import { CONFIG } from './config.ts';
import type { Rng } from './rng.ts';
import { Sim } from './sim.ts';
import type { TapOutcome } from './sim.ts';
import type { HudState, RoundResult, Settings, SimEvent } from './types.ts';

export type Phase = 'playing' | 'ending' | 'done';

export class RoundController {
  readonly sim: Sim;
  phase: Phase = 'playing';
  paused = false;
  destroyed = false;

  private acc = 0;
  private endClock = 0;
  private doneFired = false;
  private readonly onDone: (result: RoundResult) => void;

  constructor(settings: Settings, rng: Rng, height: number, onDone: (result: RoundResult) => void) {
    this.sim = new Sim(settings, rng, height);
    this.onDone = onDone;
  }

  /** Fraction (0–1) of a step left in the accumulator, for render interpolation. */
  get alpha(): number {
    return Math.min(1, this.acc / CONFIG.stepSec);
  }

  /** Feeds a rendered frame of `frameSec` real seconds; runs as many fixed steps as fit. */
  advance(frameSec: number): void {
    if (this.destroyed || this.paused || this.phase === 'done') return;
    const frame = Math.min(CONFIG.maxFrameSec, Math.max(0, frameSec));

    if (this.phase === 'playing') {
      this.acc += frame;
      let steps = 0;
      while (this.acc >= CONFIG.stepSec - 1e-9 && steps < CONFIG.maxStepsPerFrame && !this.sim.ended) {
        this.sim.step(CONFIG.stepSec);
        this.acc -= CONFIG.stepSec;
        steps += 1;
      }
      if (this.acc < 0) this.acc = 0;
      if (steps >= CONFIG.maxStepsPerFrame) this.acc = 0;
      if (this.sim.ended) {
        this.phase = 'ending';
        this.endClock = 0;
        this.acc = 0;
      }
    } else {
      this.endClock += frame;
      if (this.endClock >= CONFIG.endHoldSec) this.complete();
    }
  }

  tap(x: number, y: number): TapOutcome {
    if (this.destroyed || this.paused || this.phase !== 'playing') return 'ignored';
    return this.sim.tap(x, y);
  }

  giveUp(): void {
    if (this.destroyed || this.phase === 'done') return;
    this.sim.giveUp();
    this.complete();
  }

  pause(): void {
    if (this.phase === 'playing') this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  resize(worldHeight: number): void {
    this.sim.resize(worldHeight);
  }

  drainEvents(): SimEvent[] {
    return this.sim.drainEvents();
  }

  hud(): HudState {
    const s = this.sim;
    return {
      timeLeft: Math.max(0, s.settings.duration - s.time),
      blood: Math.max(0, s.blood),
      bloodMax: s.settings.blood,
      score: s.score,
      streak: s.streak,
    };
  }

  /** Stops the round for good; no callback is fired afterwards. */
  destroy(): void {
    this.destroyed = true;
    this.sim.drainEvents();
  }

  private complete(): void {
    this.phase = 'done';
    if (this.doneFired || this.destroyed) return;
    this.doneFired = true;
    this.onDone(this.sim.result());
  }
}
