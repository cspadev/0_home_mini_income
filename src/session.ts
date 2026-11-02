// session.ts – browser glue for one round: canvas, pointer input, requestAnimationFrame loop, page visibility,
// reduced-motion preference and audio. Everything it registers is released in destroy().

import type { AudioFx } from './audio.ts';
import { WORLD_WIDTH } from './config.ts';
import { RoundController } from './controller.ts';
import { Renderer } from './renderer.ts';
import { createRng } from './rng.ts';
import type { HudState, RoundResult, Settings } from './types.ts';

export interface SessionCallbacks {
  onHud(hud: HudState): void;
  onPause(paused: boolean): void;
  onDone(result: RoundResult): void;
}

export class GameSession {
  private readonly controller: RoundController;
  private readonly renderer: Renderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly audio: AudioFx;
  private readonly cb: SessionCallbacks;
  private readonly cleanups: Array<() => void> = [];
  private raf = 0;
  private last: number | null = null;
  private hudKey = '';
  private buzzing = false;
  private lastPointer = { id: -1, stamp: -1 };
  private destroyed = false;
  private clock = 0;

  constructor(canvas: HTMLCanvasElement, settings: Settings, audio: AudioFx, cb: SessionCallbacks) {
    this.canvas = canvas;
    this.audio = audio;
    this.cb = cb;
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.renderer = new Renderer(canvas, reducedQuery.matches);
    this.controller = new RoundController(
      settings,
      createRng((Math.random() * 0x7fffffff) | 0),
      640,
      (result) => {
        this.stopLoop();
        this.setBuzz(false);
        this.cb.onDone(result);
      },
    );

    const onReduced = () => {
      this.renderer.reduced = reducedQuery.matches;
    };
    reducedQuery.addEventListener('change', onReduced);
    this.cleanups.push(() => reducedQuery.removeEventListener('change', onReduced));

    canvas.addEventListener('pointerdown', this.onPointerDown);
    this.cleanups.push(() => canvas.removeEventListener('pointerdown', this.onPointerDown));

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') this.pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);
    this.cleanups.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
    });
  }

  /** CSS-pixel size of the stage. The world height follows its aspect ratio (clamped by the simulation). */
  resize(cssW: number, cssH: number): void {
    if (this.destroyed || cssW <= 0 || cssH <= 0) return;
    this.controller.resize((cssH / cssW) * WORLD_WIDTH);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(cssW, cssH, dpr, this.controller.sim.height);
    this.drawFrame();
  }

  start(): void {
    if (this.destroyed) return;
    this.emitHud(true);
    this.drawFrame();
    this.startLoop();
  }

  pause(): void {
    if (this.destroyed || this.controller.phase !== 'playing' || this.controller.paused) return;
    this.controller.pause();
    this.stopLoop();
    this.setBuzz(false);
    this.audio.suspend();
    this.cb.onPause(true);
  }

  /** Must be called from a user gesture (it re-enables audio). */
  resume(): void {
    if (this.destroyed || !this.controller.paused) return;
    this.audio.unlock();
    this.controller.resume();
    this.cb.onPause(false);
    this.startLoop();
  }

  giveUp(): void {
    if (this.destroyed) return;
    this.controller.giveUp();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopLoop();
    this.setBuzz(false);
    this.cleanups.splice(0).forEach((fn) => fn());
    this.controller.destroy();
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerId === this.lastPointer.id && e.timeStamp === this.lastPointer.stamp) return;
    this.lastPointer = { id: e.pointerId, stamp: e.timeStamp };
    e.preventDefault();
    this.audio.unlock();
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const sim = this.controller.sim;
    this.controller.tap(((e.clientX - rect.left) / rect.width) * WORLD_WIDTH, ((e.clientY - rect.top) / rect.height) * sim.height);
    this.flushEvents();
  };

  private startLoop(): void {
    if (this.raf || this.destroyed) return;
    this.last = null;
    this.raf = requestAnimationFrame(this.frame);
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly frame = (ts: number): void => {
    this.raf = 0;
    if (this.destroyed) return;
    const dt = this.last === null ? 0 : (ts - this.last) / 1000;
    this.last = ts;
    this.clock += Math.min(dt, 0.25);

    this.controller.advance(dt);
    this.flushEvents();
    this.renderer.update(Math.min(dt, 0.1));
    this.drawFrame();
    this.emitHud(false);
    this.setBuzz(this.controller.phase === 'playing' && this.controller.sim.bossAlive);

    if (this.controller.phase === 'done' || this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawFrame(): void {
    this.renderer.draw(this.controller.sim, this.controller.alpha, this.clock);
  }

  private flushEvents(): void {
    const events = this.controller.drainEvents();
    if (events.length === 0) return;
    this.renderer.handleEvents(events);
    for (const e of events) {
      if (e.type === 'hit') {
        if (e.kind === 'boss' && !e.killed) this.audio.bossHit();
        else this.audio.slap();
      } else if (e.type === 'streak') this.audio.streak();
      else if (e.type === 'bite') this.audio.bite();
      else if (e.type === 'lights') this.audio.lightsOut();
      else if (e.type === 'end' && e.reason !== 'gaveUp') this.audio.end(e.reason === 'timeUp');
    }
  }

  private emitHud(force: boolean): void {
    const hud = this.controller.hud();
    const key = `${Math.ceil(hud.timeLeft)}|${hud.blood}|${hud.score}|${hud.streak}`;
    if (!force && key === this.hudKey) return;
    this.hudKey = key;
    this.cb.onHud(hud);
  }

  private setBuzz(on: boolean): void {
    if (on === this.buzzing) return;
    this.buzzing = on;
    this.audio.setBossBuzz(on);
  }
}
