import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveInit } from '../src/init.ts';
import { bloodLossText, commentary, finishPayload, rankTitle, secondsWord, successRate } from '../src/scoring.ts';
import type { RoundResult } from '../src/types.ts';

const base: RoundResult = {
  level: 1,
  duration: 30,
  bloodMax: 8,
  reason: 'timeUp',
  survived: true,
  timeSurvivedSec: 30,
  bloodLeft: 8,
  bites: 0,
  eliminated: 20,
  bossesEliminated: 2,
  score: 300,
  bestStreak: 10,
  streakBonuses: 3,
  taps: 25,
  hits: 22,
  misses: 3,
};
const r = (over: Partial<RoundResult>): RoundResult => ({ ...base, ...over });

describe('init', () => {
  it('works with no level and no payload', () => {
    const i = resolveInit(undefined, undefined);
    assert.deepEqual(i.settings, { level: 1, duration: 30, blood: 8 });
    assert.equal(i.error, undefined);
  });

  it('replaces invalid single values with defaults and ignores unknown fields', () => {
    const i = resolveInit('x', { duration: 500, blood: -2, foo: 1 });
    assert.deepEqual(i.settings, { level: 1, duration: 30, blood: 8 });
    assert.equal(i.error, undefined);
    assert.deepEqual(resolveInit(NaN, undefined).settings.level, 1);
    assert.deepEqual(resolveInit(7, undefined).settings.level, 1);
    assert.deepEqual(resolveInit(2.5, undefined).settings.level, 1);
  });

  it('accepts valid values', () => {
    const i = resolveInit(3, { duration: 45, blood: 5, allowReplay: true });
    assert.deepEqual(i.settings, { level: 3, duration: 45, blood: 5 });
    assert.equal(i.allowReplay, true);
  });

  it('reports INVALID_PAYLOAD for a payload of the wrong shape', () => {
    for (const bad of ['abc', 5, [1, 2], true]) assert.equal(resolveInit(1, bad).error?.code, 'INVALID_PAYLOAD');
    assert.equal(resolveInit(1, null).error, undefined);
  });
});

describe('scoring', () => {
  it('successRate is always finite and within 0–1', () => {
    const cases = [
      r({}),
      r({ survived: false, reason: 'gaveUp', timeSurvivedSec: 0, bloodLeft: 8 }),
      r({ survived: false, reason: 'bloodOut', timeSurvivedSec: 12, bloodLeft: 0 }),
      r({ duration: 0, timeSurvivedSec: 0 }),
      r({ bloodMax: 0, bloodLeft: 0 }),
    ];
    for (const c of cases) {
      const v = successRate(c);
      assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
    }
    assert.equal(successRate(r({})), 1);
    assert.equal(successRate(cases[1]), 0);
    assert.equal(successRate(r({ survived: false, reason: 'gaveUp', timeSurvivedSec: 20, bloodLeft: 8 })), 0);
    assert.equal(successRate(r({ survived: false, reason: 'bloodOut', timeSurvivedSec: 15, bloodLeft: 0 })), 0.25);
    assert.equal(successRate(r({ bloodLeft: 4 })), 0.75);
  });

  it('derives blood loss wording from actual bites', () => {
    assert.equal(bloodLossText(r({ bites: 0 })), 'žádná');
    assert.equal(bloodLossText(r({ bites: 1, bloodLeft: 7 })), 'zanedbatelná');
    assert.equal(bloodLossText(r({ bites: 3, bloodLeft: 5 })), 'mírná');
    assert.equal(bloodLossText(r({ bites: 5, bloodLeft: 3 })), 'citelná');
    assert.equal(bloodLossText(r({ bites: 7, bloodLeft: 1 })), 'dramatická');
    assert.equal(bloodLossText(r({ bites: 8, bloodLeft: 0, survived: false, reason: 'bloodOut' })), 'kritická');
  });

  it('derives rank deterministically from performance', () => {
    assert.equal(rankTitle(r({ eliminated: 27, bites: 1, bloodLeft: 7 })), 'Postrach večerního bzučení');
    assert.equal(rankTitle(r({ eliminated: 20, bites: 4, bloodLeft: 4 })), 'Plácačkový specialista');
    assert.equal(rankTitle(r({ eliminated: 12, bites: 8, bloodLeft: 0, survived: false, reason: 'bloodOut' })), 'Lovec komárů III. třídy');
    assert.equal(rankTitle(r({ eliminated: 2, bites: 8, bloodLeft: 0, survived: false, reason: 'bloodOut' })), 'Dobrovolný dárce krve');
    assert.equal(rankTitle(r({ eliminated: 0, bites: 0, survived: false, reason: 'gaveUp' })), 'Dobrovolný dárce krve');
    assert.equal(rankTitle(r({ eliminated: 27, bites: 1 })), rankTitle(r({ eliminated: 27, bites: 1 })));
  });

  it('commentary depends on how the round ended', () => {
    assert.notEqual(commentary(r({ reason: 'gaveUp', survived: false })), commentary(r({ reason: 'bloodOut', survived: false })));
    assert.ok(commentary(r({ bites: 0 })).includes('Ani jedno'));
  });

  it('builds the FINISH payload from the real round', () => {
    const p = finishPayload(r({ eliminated: 27, bites: 1, bloodLeft: 7 }));
    assert.equal(p.eliminated, 27);
    assert.equal(p.bites, 1);
    assert.equal(p.accuracy, 0.88);
  });

  it('uses correct Czech plural for seconds', () => {
    assert.equal(secondsWord(30), 'sekund');
    assert.equal(secondsWord(22), 'sekund');
    assert.equal(secondsWord(3), 'sekundy');
    assert.equal(secondsWord(10), 'sekund');
  });
});
