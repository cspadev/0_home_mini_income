import { CONFIG } from './config.ts';
import type { Settings } from './types.ts';

export interface Pace {
  /** Seconds between ordinary spawns. */
  interval: number;
  /** Multiplier applied to base mosquito speeds. */
  speedMul: number;
  /** Share (0–1) of fast mosquitoes among ordinary spawns. */
  fastShare: number;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Pacing at a given fraction (0–1) of the round, including the level multipliers. */
export function pacingAt(fraction: number, settings: Settings): Pace {
  const f = Math.min(1, Math.max(0, fraction));
  let start = 0;
  let stage: (typeof CONFIG.stages)[number] = CONFIG.stages[CONFIG.stages.length - 1];
  for (const s of CONFIG.stages) {
    if (f < s.until) {
      stage = s;
      break;
    }
    start = s.until;
  }
  const local = stage.until > start ? Math.min(1, Math.max(0, (f - start) / (stage.until - start))) : 1;
  const li = Math.min(CONFIG.levelSpeedMul.length, Math.max(1, settings.level)) - 1;
  return {
    interval: lerp(stage.interval[0], stage.interval[1], local) / CONFIG.levelSpawnMul[li],
    speedMul: lerp(stage.speedMul[0], stage.speedMul[1], local) * CONFIG.levelSpeedMul[li],
    fastShare: stage.fastShare,
  };
}
