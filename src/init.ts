// init.ts – validation of the INIT assignment (`level` + `payload`) with defaults for every value.

import { CONFIG } from './config.ts';
import type { Settings } from './types.ts';

export interface InitResult {
  settings: Settings;
  /** Whether the results screen may offer "Ještě jednu noc" when embedded (standalone always may). */
  allowReplay: boolean;
  /** Set when the payload has the wrong shape; the game reports ERROR INVALID_PAYLOAD and does not start. */
  error?: { code: 'INVALID_PAYLOAD'; message: string };
}

function intInRange(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/** Resolves INIT values. Invalid single values fall back to defaults; unknown fields are ignored. */
export function resolveInit(level: unknown, payload: unknown): InitResult {
  const { defaults, limits } = CONFIG;
  const base: Settings = {
    level: intInRange(level, limits.level, defaults.level),
    duration: defaults.duration,
    blood: defaults.blood,
  };

  if (payload === undefined || payload === null) return { settings: base, allowReplay: false };
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      settings: base,
      allowReplay: false,
      error: { code: 'INVALID_PAYLOAD', message: 'Payload musí být objekt, např. {"duration":30,"blood":8}.' },
    };
  }

  const p = payload as Record<string, unknown>;
  return {
    settings: {
      level: base.level,
      duration: intInRange(p.duration, limits.duration, defaults.duration),
      blood: intInRange(p.blood, limits.blood, defaults.blood),
    },
    allowReplay: p.allowReplay === true,
  };
}
