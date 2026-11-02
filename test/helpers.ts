import { CONFIG } from '../src/config.ts';
import { createRng } from '../src/rng.ts';
import { Sim } from '../src/sim.ts';
import type { Settings } from '../src/types.ts';

export const settings: Settings = { level: 1, duration: 30, blood: 8 };
export const HEIGHT = 640;

/** A Sim with automatic spawning off, so tests script exact encounters. */
export function scriptedSim(over: Partial<Settings> = {}): Sim {
  const sim = new Sim({ ...settings, ...over }, createRng(1), HEIGHT);
  sim.spawning = false;
  return sim;
}

/** Runs the sim for `seconds` of simulated time in fixed steps. */
export function run(sim: Sim, seconds: number): void {
  const steps = Math.round(seconds / CONFIG.stepSec);
  for (let i = 0; i < steps && !sim.ended; i++) sim.step(CONFIG.stepSec);
}

/** Places a mosquito mid-field, stationary enough to be tapped (speed tiny, far from the target). */
export function placeStill(sim: Sim, kind: 'slow' | 'fast' | 'boss', x: number, y: number) {
  return sim.addMosquito(kind, x, y, 0.001);
}
