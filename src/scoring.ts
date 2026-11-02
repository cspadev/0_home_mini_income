// scoring.ts – everything derived from a finished round: successRate, rank, blood-loss wording, commentary.
// Pure functions of RoundResult, so results are deterministic and testable.

import { CONFIG } from './config.ts';
import type { RoundResult } from './types.ts';

/**
 * successRate (0–1) = 0.5 · share of the night survived + 0.5 · share of blood kept (only when the night was survived).
 * A perfect night is 1, surviving with one drop left is just above 0.5, giving up is always 0.
 */
export function successRate(r: RoundResult): number {
  if (r.reason === 'gaveUp') return 0;
  const timePart = r.duration > 0 ? Math.min(1, Math.max(0, r.timeSurvivedSec / r.duration)) : 0;
  const bloodPart = r.survived && r.bloodMax > 0 ? Math.min(1, Math.max(0, r.bloodLeft / r.bloodMax)) : 0;
  const rate = 0.5 * timePart + 0.5 * bloodPart;
  return Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0;
}

export function rankTitle(r: RoundResult): string {
  const resolved = r.eliminated + r.bites;
  const ratio = resolved > 0 ? r.eliminated / resolved : 0;
  for (const rank of CONFIG.ranks) {
    if (ratio >= rank.minRatio && r.eliminated >= rank.minEliminated && (!rank.mustSurvive || r.survived)) {
      return rank.title;
    }
  }
  return CONFIG.fallbackRank;
}

/** Blood-loss wording derived from actual bites (and whether any blood is left). */
export function bloodLossText(r: RoundResult): string {
  if (r.bites === 0) return 'žádná';
  if (r.bloodLeft <= 0) return 'kritická';
  const share = r.bites / r.bloodMax;
  if (share <= 0.15) return 'zanedbatelná';
  if (share <= 0.4) return 'mírná';
  if (share <= 0.75) return 'citelná';
  return 'dramatická';
}

export const PSYCHIC_DAMAGE = 'katastrofální';

export function commentary(r: RoundResult): string {
  if (r.reason === 'gaveUp') return 'Vzdát se je taky strategie. Komáři děkují za večeři.';
  if (r.reason === 'bloodOut') return 'Komáři se nasytili. Ráno bude potřeba hodně kávy a železa.';
  if (r.bites === 0) return 'Ani jedno štípnutí. Komáři podali stížnost na špatný servis.';
  return 'Noc přežita. Spánek už méně.';
}

export function formatSummary(r: RoundResult) {
  return {
    eliminated: r.eliminated,
    bloodLoss: bloodLossText(r),
    psychic: PSYCHIC_DAMAGE,
    rank: rankTitle(r),
    comment: commentary(r),
  };
}

/** Output `payload` returned to the main game with FINISH. */
export function finishPayload(r: RoundResult) {
  return {
    level: r.level,
    survived: r.survived,
    endReason: r.reason,
    timeSurvivedSec: Math.round(r.timeSurvivedSec * 10) / 10,
    eliminated: r.eliminated,
    bossesEliminated: r.bossesEliminated,
    bites: r.bites,
    bloodLeft: r.bloodLeft,
    bloodMax: r.bloodMax,
    score: r.score,
    bestStreak: r.bestStreak,
    accuracy: r.taps > 0 ? Math.round((r.hits / r.taps) * 1000) / 1000 : 0,
    rank: rankTitle(r),
  };
}

/** Czech plural of "sekunda" for the intro text. */
export function secondsWord(n: number): string {
  if (n === 1) return 'sekundu';
  if (n >= 2 && n <= 4) return 'sekundy';
  return 'sekund';
}
