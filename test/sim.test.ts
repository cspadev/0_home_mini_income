import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONFIG } from '../src/config.ts';
import { RoundController } from '../src/controller.ts';
import { createRng } from '../src/rng.ts';
import { Sim } from '../src/sim.ts';
import type { RoundResult } from '../src/types.ts';
import { HEIGHT, placeStill, run, scriptedSim, settings } from './helpers.ts';

describe('boss', () => {
  it('needs three separate taps and counts as eliminated only after the last', () => {
    const sim = scriptedSim();
    placeStill(sim, 'boss', 100, 100);
    // Taps are spaced in sim time so none is treated as a duplicate.
    assert.equal(sim.tap(100, 100), 'hit');
    assert.equal(sim.eliminated, 0);
    run(sim, 0.2);
    assert.equal(sim.tap(100, 100), 'hit');
    assert.equal(sim.eliminated, 0);
    assert.equal(sim.mosquitoes.length, 1);
    run(sim, 0.2);
    assert.equal(sim.tap(100, 100), 'kill');
    assert.equal(sim.eliminated, 1);
    assert.equal(sim.bossesEliminated, 1);
    assert.equal(sim.mosquitoes.length, 0);
    assert.equal(sim.score, CONFIG.kinds.boss.points); // 3 hits: no streak bonus yet
  });

  it('reports remaining health on each hit', () => {
    const sim = scriptedSim();
    placeStill(sim, 'boss', 100, 100);
    sim.tap(100, 100);
    run(sim, 0.2);
    sim.tap(100, 100);
    const hits = sim.drainEvents().filter((e) => e.type === 'hit');
    assert.deepEqual(hits.map((e) => (e.type === 'hit' ? e.hpLeft : -1)), [2, 1]);
  });

  it('is only ever one on screen during a full idle round', () => {
    const sim = new Sim({ ...settings, blood: 20 }, createRng(7), HEIGHT);
    let maxBosses = 0;
    let bossSpawns = 0;
    while (!sim.ended) {
      sim.step();
      maxBosses = Math.max(maxBosses, sim.mosquitoes.filter((m) => m.kind === 'boss').length);
      bossSpawns += sim.drainEvents().filter((e) => e.type === 'spawn' && e.kind === 'boss').length;
    }
    assert.equal(maxBosses, 1);
    assert.ok(bossSpawns >= 1);
  });

  it('causes one bite like an ordinary mosquito when it reaches the target', () => {
    const sim = scriptedSim();
    const m = sim.addMosquito('boss', sim.target.x, sim.target.y - 50, 100);
    m.hp = 1; // damaged boss still bites once
    run(sim, 1);
    assert.equal(sim.bites, 1);
    assert.equal(sim.blood, settings.blood - 1);
    assert.equal(sim.eliminated, 0);
  });
});

describe('bites and blood', () => {
  it('a mosquito reaching the target removes one drop and disappears', () => {
    const sim = scriptedSim();
    sim.addMosquito('slow', sim.target.x, sim.target.y - 40, 80);
    run(sim, 1);
    assert.equal(sim.bites, 1);
    assert.equal(sim.blood, 7);
    assert.equal(sim.mosquitoes.length, 0);
    assert.equal(sim.eliminated, 0);
    assert.equal(sim.score, 0);
  });

  it('every bite takes exactly one drop', () => {
    const sim = scriptedSim();
    for (let i = 0; i < 3; i++) sim.addMosquito('slow', sim.target.x + i * 20, sim.target.y - 40 - i * 20, 80);
    run(sim, 2);
    assert.equal(sim.bites, 3);
    assert.equal(sim.blood, settings.blood - 3);
  });

  it('does not count mosquitoes still flying at the end as bites', () => {
    const sim = scriptedSim({ duration: 10 });
    sim.addMosquito('slow', 0, 0, 1); // far away, barely moving
    run(sim, 11);
    assert.equal(sim.ended, 'timeUp');
    const r = sim.result();
    assert.equal(r.bites, 0);
    assert.equal(r.bloodLeft, settings.blood);
  });

  it('misses never cost blood', () => {
    const sim = scriptedSim();
    for (let i = 0; i < 20; i++) {
      run(sim, 0.1);
      sim.tap(10, 10 + i);
    }
    assert.equal(sim.blood, settings.blood);
    assert.equal(sim.misses, 20);
  });
});

describe('streak and scoring', () => {
  it('a tap on empty field resets the streak', () => {
    const sim = scriptedSim();
    placeStill(sim, 'slow', 100, 100);
    placeStill(sim, 'slow', 250, 100);
    sim.tap(100, 100);
    run(sim, 0.1);
    assert.equal(sim.streak, 1);
    sim.tap(20, 400);
    assert.equal(sim.streak, 0);
    assert.equal(sim.bestStreak, 1);
  });

  it('awards a bonus every five consecutive successful taps', () => {
    const sim = scriptedSim();
    for (let i = 0; i < 10; i++) {
      placeStill(sim, 'slow', 60 + (i % 5) * 60, 100 + Math.floor(i / 5) * 100);
    }
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
      sim.tap(60 + (i % 5) * 60, 100 + Math.floor(i / 5) * 100);
      run(sim, 0.1);
      pts.push(sim.score);
    }
    assert.equal(sim.streakBonuses, 2);
    // 5 kills = 50 + 10 bonus; 10 kills = 100 + 20 bonus.
    assert.equal(pts[4], 60);
    assert.equal(sim.score, 120);
    const streakEvents = sim.drainEvents().filter((e) => e.type === 'streak');
    assert.equal(streakEvents.length, 2);
  });

  it('nonlethal boss hits build the streak', () => {
    const sim = scriptedSim();
    placeStill(sim, 'boss', 180, 100);
    for (let i = 0; i < 2; i++) {
      sim.tap(180, 100);
      run(sim, 0.1);
    }
    assert.equal(sim.streak, 2);
    assert.equal(sim.eliminated, 0);
  });

  it('a miss in the middle restarts the count toward the next bonus', () => {
    const sim = scriptedSim();
    for (let i = 0; i < 8; i++) placeStill(sim, 'slow', 40 + i * 40, 100);
    for (let i = 0; i < 4; i++) {
      sim.tap(40 + i * 40, 100);
      run(sim, 0.1);
    }
    sim.tap(20, 500); // miss
    run(sim, 0.1);
    for (let i = 4; i < 8; i++) {
      sim.tap(40 + i * 40, 100);
      run(sim, 0.1);
    }
    assert.equal(sim.streakBonuses, 0);
    assert.equal(sim.streak, 4);
    assert.equal(sim.score, 80);
  });
});

describe('duplicate input', () => {
  it('ignores the same input delivered twice', () => {
    const sim = scriptedSim();
    placeStill(sim, 'boss', 100, 100);
    assert.equal(sim.tap(100, 100), 'hit');
    assert.equal(sim.tap(100, 100), 'ignored');
    assert.equal(sim.tap(101, 100), 'ignored');
    assert.equal(sim.mosquitoes[0].hp, 2);
    assert.equal(sim.taps, 1);
  });

  it('one tap damages only the nearest of two overlapping mosquitoes', () => {
    const sim = scriptedSim();
    const a = placeStill(sim, 'slow', 100, 100);
    const b = placeStill(sim, 'slow', 130, 100);
    assert.equal(sim.tap(112, 100), 'kill'); // closer to a
    assert.equal(a.alive, false);
    assert.equal(b.alive, true);
    assert.equal(sim.eliminated, 1);
  });

  it('a later separate tap at the same place is accepted', () => {
    const sim = scriptedSim();
    placeStill(sim, 'boss', 100, 100);
    sim.tap(100, 100);
    run(sim, 0.1);
    assert.equal(sim.tap(100, 100), 'hit');
    assert.equal(sim.mosquitoes[0].hp, 1);
  });

  it('input is ignored after the round ended', () => {
    const sim = scriptedSim();
    sim.giveUp();
    assert.equal(sim.tap(10, 10), 'ignored');
  });
});

describe('round termination', () => {
  it('ends at zero blood and ignores mosquitoes still flying', () => {
    const sim = scriptedSim({ blood: 2 });
    for (let i = 0; i < 3; i++) sim.addMosquito('slow', sim.target.x + i * 10, sim.target.y - 40 - i * 30, 80);
    sim.addMosquito('slow', 0, 0, 1);
    run(sim, 10);
    assert.equal(sim.ended, 'bloodOut');
    assert.equal(sim.blood, 0);
    assert.equal(sim.bites, 2);
    assert.equal(sim.result().survived, false);
  });

  it('ends when the timer reaches zero', () => {
    const sim = scriptedSim({ duration: 10 });
    run(sim, 10.5);
    assert.equal(sim.ended, 'timeUp');
    assert.equal(sim.result().survived, true);
    assert.equal(sim.result().timeSurvivedSec, 10);
  });

  it('giving up ends the round immediately', () => {
    const sim = scriptedSim();
    run(sim, 3);
    sim.giveUp();
    assert.equal(sim.ended, 'gaveUp');
    assert.equal(sim.result().survived, false);
  });

  it('emits exactly one end event and stops simulating', () => {
    const sim = scriptedSim({ duration: 10 });
    run(sim, 10.5);
    sim.step();
    sim.giveUp();
    assert.equal(sim.drainEvents().filter((e) => e.type === 'end').length, 1);
    assert.equal(sim.ended, 'timeUp');
  });

  it('an idle player always loses blood and the round ends on its own', () => {
    const sim = new Sim(settings, createRng(3), HEIGHT);
    while (!sim.ended) sim.step();
    assert.equal(sim.ended, 'bloodOut');
  });
});

describe('controller: clean restart and lifecycle', () => {
  const make = (done: (r: RoundResult) => void, seed = 5) => new RoundController(settings, createRng(seed), HEIGHT, done);

  it('reports the result exactly once, after the end hold', () => {
    const results: RoundResult[] = [];
    const c = make((r) => results.push(r));
    c.giveUp();
    c.giveUp();
    c.advance(1);
    assert.equal(results.length, 1);
    assert.equal(c.phase, 'done');
  });

  it('plays an ending hold before reporting a natural end', () => {
    const results: RoundResult[] = [];
    const c = make((r) => results.push(r));
    for (let i = 0; i < 60 * 40 && c.phase === 'playing'; i++) c.advance(1 / 60);
    assert.equal(c.phase, 'ending');
    assert.equal(results.length, 0);
    for (let i = 0; i < 120; i++) c.advance(1 / 60);
    assert.equal(results.length, 1);
  });

  it('a new controller starts from a completely fresh state', () => {
    const results: RoundResult[] = [];
    const first = make((r) => results.push(r));
    for (let i = 0; i < 600; i++) first.advance(1 / 60);
    first.sim.tap(10, 10);
    first.destroy();

    const second = make(() => undefined, 5);
    const s = second.sim;
    assert.equal(s.time, 0);
    assert.equal(s.blood, settings.blood);
    assert.equal(s.score, 0);
    assert.equal(s.streak, 0);
    assert.equal(s.bites, 0);
    assert.equal(s.mosquitoes.length, 0);
    assert.equal(s.ended, null);
    assert.equal(second.phase, 'playing');
    assert.equal(second.drainEvents().length, 0);
  });

  it('a destroyed controller neither advances nor reports', () => {
    const results: RoundResult[] = [];
    const c = make((r) => results.push(r));
    c.advance(1);
    const t = c.sim.time;
    c.destroy();
    c.advance(5);
    c.giveUp();
    assert.equal(c.sim.time, t);
    assert.equal(results.length, 0);
    assert.equal(c.tap(10, 10), 'ignored');
  });

  it('is deterministic for the same seed after a restart', () => {
    const play = () => {
      const c = make(() => undefined, 11);
      for (let i = 0; i < 900; i++) c.advance(1 / 60);
      return c.sim.mosquitoes.map((m) => [m.kind, Math.round(m.x), Math.round(m.y)]);
    };
    assert.deepEqual(play(), play());
  });

  it('does not advance while paused, and returning does not cause a burst of time', () => {
    const c = make(() => undefined);
    c.advance(1 / 60);
    c.pause();
    const t = c.sim.time;
    c.advance(60); // the page was hidden for a minute
    assert.equal(c.sim.time, t);
    c.resume();
    c.advance(60); // first frame after returning has a huge delta
    assert.ok(c.sim.time - t <= CONFIG.maxStepsPerFrame * CONFIG.stepSec + 1e-9);
  });

  it('simulates the same time at 60, 120 and 144 Hz', () => {
    const elapsed = (hz: number) => {
      const c = make(() => undefined);
      for (let i = 0; i < hz * 5; i++) c.advance(1 / hz);
      return c.sim.time;
    };
    for (const hz of [60, 120, 144]) assert.ok(Math.abs(elapsed(hz) - 5) <= CONFIG.stepSec + 1e-9, `${hz} Hz`);
  });
});

describe('resize', () => {
  it('keeps progress along the path, so nothing teleports into the target', () => {
    const sim = scriptedSim();
    const m = sim.addMosquito('slow', 20, 0, 40);
    run(sim, 2);
    const t = m.t;
    assert.ok(t > 0 && t < 0.5);
    sim.resize(900);
    assert.equal(m.t, t);
    assert.equal(sim.bites, 0);
    assert.ok(Math.hypot(m.x - sim.target.x, m.y - sim.target.y) > 100);
    sim.resize(480);
    assert.equal(m.t, t);
    assert.equal(sim.bites, 0);
  });
});

describe('spawning and pacing', () => {
  it('spawns outside the playfield on several edges', () => {
    const sim = new Sim({ ...settings, blood: 20 }, createRng(21), HEIGHT);
    const edges = new Set<string>();
    const seen = new Set<number>();
    for (let i = 0; i < 60 * 30 && !sim.ended; i++) {
      sim.step();
      for (const m of sim.mosquitoes) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const outside = m.sx < 0 || m.sx > sim.width || m.sy < 0 || m.sy > sim.height;
        assert.ok(outside, 'spawned inside the field');
        edges.add(m.sx < 0 ? 'left' : m.sx > sim.width ? 'right' : m.sy < 0 ? 'top' : 'bottom');
      }
    }
    assert.ok(edges.size >= 3, `edges: ${[...edges].join(',')}`);
  });

  it('every mosquito gets at least its minimum travel time', () => {
    const sim = new Sim({ ...settings, blood: 20 }, createRng(4), HEIGHT);
    const seen = new Set<number>();
    while (!sim.ended) {
      sim.step();
      for (const m of sim.mosquitoes) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        assert.ok(m.len / m.speed >= CONFIG.kinds[m.kind].minTravelSec - 1e-6, `${m.kind} too fast`);
      }
    }
    assert.ok(seen.size > 15);
  });

  it('shows the lights-out event at half time and first boss between 5 and 15 s', () => {
    const sim = new Sim({ ...settings, blood: 20 }, createRng(9), HEIGHT);
    let lightsAt = -1;
    let firstBossAt = -1;
    while (!sim.ended) {
      sim.step();
      for (const e of sim.drainEvents()) {
        if (e.type === 'lights') lightsAt = sim.time;
        if (e.type === 'spawn' && e.kind === 'boss' && firstBossAt < 0) firstBossAt = sim.time;
      }
    }
    assert.ok(Math.abs(lightsAt - 15) < 0.05);
    assert.ok(firstBossAt >= 5 && firstBossAt <= 15, `first boss at ${firstBossAt}`);
  });

  it('spawns more often and faster in the second half', async () => {
    const { pacingAt } = await import('../src/pacing.ts');
    const a = pacingAt(10 / 30, settings);
    const b = pacingAt(16 / 30, settings);
    const c = pacingAt(28 / 30, settings);
    assert.ok(b.interval < a.interval && c.interval < b.interval);
    assert.ok(b.speedMul > a.speedMul && c.speedMul > b.speedMul);
    assert.ok(pacingAt(2 / 30, settings).fastShare < 0.2);
  });

  it('is not unavoidable: a competent bot survives, with and without help being needed', () => {
    // Bot reacts 0.35 s after each spawn and hits 85% of the time.
    const wins = [1, 2, 3, 4, 5, 6].map((seed) => {
      const sim = new Sim(settings, createRng(seed), HEIGHT);
      const rng = createRng(seed + 100);
      const due = new Map<number, number>();
      while (!sim.ended) {
        sim.step();
        for (const m of sim.mosquitoes) if (!due.has(m.id)) due.set(m.id, sim.time + 0.3 + rng() * 0.3);
        for (const m of [...sim.mosquitoes]) {
          const at = due.get(m.id)!;
          if (sim.time >= at) {
            due.set(m.id, sim.time + 0.28);
            if (rng() < 0.85) sim.tap(m.x, m.y);
            else sim.tap(m.x + 200, m.y);
          }
        }
        sim.drainEvents();
      }
      return sim.result();
    });
    const survived = wins.filter((r) => r.survived).length;
    assert.ok(survived >= 5, `bot survived ${survived}/6`);
    for (const r of wins) assert.ok(r.eliminated > 15, `bot eliminated ${r.eliminated}`);
  });
});
