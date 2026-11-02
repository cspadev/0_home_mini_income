// renderer.ts – canvas rendering plus purely cosmetic effects (particles, splats, banners).
// Reads the Sim every frame; never mutates it. Effects age in real frame time.

import { CONFIG, WORLD_WIDTH } from './config.ts';
import { drawScene } from './scene.ts';
import type { Sim } from './sim.ts';
import { drawMosquito, drawSleeper, outlinedText } from './sprites.ts';
import type { EndReason, Kind, SimEvent } from './types.ts';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; color: string }
interface Splat {
  x: number; y: number; life: number; max: number; r: number; color: string;
  lobes: number[];
  drops: { a: number; d: number; r: number }[];
}
interface Ring { x: number; y: number; life: number; max: number; r: number; color: string }
interface Float { x: number; y: number; text: string; life: number; max: number; color: string; size: number }
interface Banner { text: string; y: number; size: number; color: string; life: number; max: number }

const SPLAT_COLORS: Record<Kind, string> = { slow: '#d81f26', fast: '#e8322f', boss: '#a50f1a' };
const END_TEXT: Record<EndReason, string> = { timeUp: 'Noc přežita!', bloodOut: 'Krev došla!', gaveUp: '' };

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private bgOn: HTMLCanvasElement | null = null;
  private bgOff: HTMLCanvasElement | null = null;
  private bgKey = '';
  private pxW = 0;
  private pxH = 0;
  private worldH = 0;

  private particles: Particle[] = [];
  private splats: Splat[] = [];
  private rings: Ring[] = [];
  private floats: Float[] = [];
  private banners: Banner[] = [];
  private endBanner: Banner | null = null;
  private flash = new Map<number, number>();
  private biteFlash = 0;
  private flinch = 0;
  private lightsFade = 0;
  private lightsOut = false;
  reduced: boolean;

  constructor(private readonly canvas: HTMLCanvasElement, reduced: boolean) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D není k dispozici.');
    this.ctx = ctx;
    this.reduced = reduced;
  }

  /** Sizes the backing store. pxW/pxH are CSS pixels of the stage; the world is always 360 units wide. */
  resize(pxW: number, pxH: number, dpr: number, worldH: number): void {
    this.pxW = Math.max(1, Math.round(pxW * dpr));
    this.pxH = Math.max(1, Math.round(pxH * dpr));
    this.worldH = worldH;
    this.canvas.width = this.pxW;
    this.canvas.height = this.pxH;
    this.buildBackgrounds();
  }

  handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          this.onHit(e);
          break;
        case 'miss':
          this.rings.push({ x: e.x, y: e.y, life: 0.25, max: 0.25, r: 16, color: 'rgba(255,255,255,0.45)' });
          break;
        case 'streak':
          this.banners.push({ text: 'Plácací série!', y: this.worldH * 0.2, size: 26, color: '#ffd84d', life: 1.0, max: 1.0 });
          this.floats.push({ x: e.x, y: e.y - 34, text: `+${e.bonus}`, life: 0.8, max: 0.8, color: '#ffd84d', size: 18 });
          break;
        case 'bite':
          this.biteFlash = 0.4;
          this.flinch = 0.35;
          this.floats.push({ x: e.x, y: e.y - 64, text: 'Au!', life: 0.7, max: 0.7, color: '#ff6b81', size: 20 });
          this.burst(e.x, e.y, '#ff6b81', 8, 120);
          break;
        case 'lights':
          this.lightsOut = true;
          this.banners.push({ text: 'Zhasnuto. Začíná peklo.', y: this.worldH * 0.3, size: 28, color: '#ffffff', life: 2.4, max: 2.4 });
          break;
        case 'end': {
          const text = END_TEXT[e.reason];
          if (text) this.endBanner = { text, y: this.worldH * 0.4, size: 38, color: e.reason === 'timeUp' ? '#9dff9d' : '#ff6b81', life: 5, max: 5 };
          break;
        }
        case 'spawn':
          break;
      }
    }
  }

  /** Ages cosmetic effects by real frame time. */
  update(dt: number): void {
    const age = <T extends { life: number }>(list: T[]): T[] => {
      for (const i of list) i.life -= dt;
      return list.filter((i) => i.life > 0);
    };
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
    }
    this.particles = age(this.particles);
    this.splats = age(this.splats);
    this.rings = age(this.rings);
    this.floats = age(this.floats);
    this.banners = age(this.banners);
    for (const [id, t] of this.flash) {
      if (t - dt <= 0) this.flash.delete(id);
      else this.flash.set(id, t - dt);
    }
    this.biteFlash = Math.max(0, this.biteFlash - dt);
    this.flinch = Math.max(0, this.flinch - dt);
    if (this.lightsOut && this.lightsFade < 1) this.lightsFade = Math.min(1, this.lightsFade + dt / 0.6);
    if (this.endBanner) this.endBanner.life -= dt;
  }

  draw(sim: Sim, alpha: number, time: number): void {
    const ctx = this.ctx;
    const scale = this.pxW / WORLD_WIDTH;
    if (!this.bgOn || this.worldH !== sim.height) {
      this.worldH = sim.height;
      this.buildBackgrounds();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.bgOn!, 0, 0);
    if (this.lightsFade > 0) {
      ctx.globalAlpha = this.lightsFade;
      ctx.drawImage(this.bgOff!, 0, 0);
      ctx.globalAlpha = 1;
    }

    const shake = !this.reduced && this.biteFlash > 0 ? this.biteFlash * 10 : 0;
    ctx.setTransform(scale, 0, 0, scale, shake ? (Math.random() - 0.5) * shake * scale : 0, shake ? (Math.random() - 0.5) * shake * scale : 0);
    const tg = sim.target;

    drawSleeper(ctx, {
      x: tg.x,
      y: tg.y,
      time,
      bites: sim.bites,
      flinch: this.flinch / 0.35,
      lightsOut: this.lightsOut,
      reduced: this.reduced,
    });

    // Text sits under the mosquitoes, so it can never hide a target.
    this.drawCountdown(sim);
    for (const b of this.banners) this.drawBanner(b);

    for (const m of sim.mosquitoes) {
      const x = m.px + (m.x - m.px) * alpha;
      const y = m.py + (m.y - m.py) * alpha;
      drawMosquito(ctx, {
        kind: m.kind,
        x,
        y,
        angle: Math.atan2(tg.y - y, tg.x - x),
        hp: m.hp,
        maxHp: m.maxHp,
        flash: (this.flash.get(m.id) ?? 0) / 0.14,
        time,
        seed: m.id * 1.7,
        reduced: this.reduced,
      });
    }

    this.drawEffects();
    if (this.endBanner && this.endBanner.life > 0) this.drawBanner(this.endBanner, true);

    if (this.biteFlash > 0) {
      const k = this.biteFlash / 0.4;
      const g = ctx.createRadialGradient(WORLD_WIDTH / 2, sim.height / 2, sim.height * 0.25, WORLD_WIDTH / 2, sim.height / 2, sim.height * 0.7);
      g.addColorStop(0, 'rgba(255,40,70,0)');
      g.addColorStop(1, `rgba(255,40,70,${(this.reduced ? 0.15 : 0.4) * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD_WIDTH, sim.height);
    }
  }

  private onHit(e: Extract<SimEvent, { type: 'hit' }>): void {
    if (e.killed) {
      this.flash.delete(e.id);
      this.splats.push({
        x: e.x,
        y: e.y,
        life: this.reduced ? 0.5 : 1.1,
        max: this.reduced ? 0.5 : 1.1,
        r: e.kind === 'boss' ? 30 : 19,
        color: SPLAT_COLORS[e.kind],
        lobes: Array.from({ length: 14 }, (_, i) => (i % 3 === 0 ? 1.3 + Math.random() * 0.7 : 0.6 + Math.random() * 0.4)),
        drops: Array.from({ length: e.kind === 'boss' ? 12 : 8 }, () => ({ a: Math.random() * Math.PI * 2, d: 1.3 + Math.random() * 1.0, r: 0.1 + Math.random() * 0.14 })),
      });
      this.burst(e.x, e.y, SPLAT_COLORS[e.kind], e.kind === 'boss' ? 18 : 10, e.kind === 'boss' ? 220 : 160);
      this.floats.push({ x: e.x, y: e.y - 20, text: `+${e.points}`, life: 0.6, max: 0.6, color: '#fff6d8', size: e.kind === 'boss' ? 22 : 16 });
    } else {
      this.flash.set(e.id, 0.14);
      this.rings.push({ x: e.x, y: e.y, life: 0.3, max: 0.3, r: 22, color: 'rgba(255,230,120,0.9)' });
      this.burst(e.x, e.y, '#ffe27a', 7, 150);
    }
  }

  private burst(x: number, y: number, color: string, n: number, speed: number): void {
    if (this.reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      const life = 0.3 + Math.random() * 0.3;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life, max: life, r: 2 + Math.random() * 2.5, color });
    }
  }

  private drawCountdown(sim: Sim): void {
    const left = sim.settings.duration - sim.time;
    if (sim.ended || left > CONFIG.countdownSec || left <= 0) return;
    const n = Math.ceil(left);
    const frac = left - Math.floor(left);
    const pulse = this.reduced ? 1 : 1 + 0.18 * frac;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(WORLD_WIDTH / 2, sim.height * 0.15);
    ctx.scale(pulse, pulse);
    outlinedText(ctx, String(n), 0, 0, 96, '#ff8a8a');
    ctx.restore();
  }

  private drawBanner(b: Banner, solid = false): void {
    const ctx = this.ctx;
    const fadeIn = Math.min(1, (b.max - b.life) / 0.12);
    const fadeOut = Math.min(1, b.life / 0.3);
    ctx.save();
    ctx.globalAlpha = solid ? Math.min(fadeIn, fadeOut) : Math.min(fadeIn, fadeOut) * 0.9;
    const pop = this.reduced ? 1 : 1 + 0.15 * Math.max(0, 1 - (b.max - b.life) / 0.2);
    ctx.translate(WORLD_WIDTH / 2, b.y);
    ctx.scale(pop, pop);
    outlinedText(ctx, b.text, 0, 0, b.size, b.color, WORLD_WIDTH - 40);
    ctx.restore();
  }

  private drawEffects(): void {
    const ctx = this.ctx;
    for (const s of this.splats) {
      const k = s.life / s.max;
      const grow = this.reduced ? 1 : Math.min(1, 0.45 + (1 - k) * 5);
      const r = s.r * grow;
      const n = s.lobes.length;
      const pt = (i: number): [number, number] => {
        const a = (i / n) * Math.PI * 2;
        return [Math.cos(a) * r * s.lobes[i % n], Math.sin(a) * r * s.lobes[i % n]];
      };
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.globalAlpha = Math.min(1, k * 2.5) * 0.92;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      const [sx, sy] = pt(0);
      const [ex, ey] = pt(n - 1);
      ctx.moveTo((sx + ex) / 2, (sy + ey) / 2);
      for (let i = 0; i < n; i++) {
        const [cx, cy] = pt(i);
        const [nx, ny] = pt(i + 1);
        ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
      }
      ctx.closePath();
      ctx.fill();
      for (const d of s.drops) {
        ctx.beginPath();
        ctx.arc(Math.cos(d.a) * r * d.d, Math.sin(d.a) * r * d.d, s.r * d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (this.reduced ? 1 : 0.5 + k), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of this.floats) {
      const k = 1 - f.life / f.max;
      ctx.globalAlpha = Math.min(1, f.life / (f.max * 0.4));
      outlinedText(ctx, f.text, f.x, f.y - (this.reduced ? 0 : k * 22), f.size, f.color);
    }
    ctx.globalAlpha = 1;
  }

  private buildBackgrounds(): void {
    const key = `${this.pxW}x${this.pxH}@${this.worldH}`;
    if (key === this.bgKey && this.bgOn && this.bgOff) return;
    this.bgKey = key;
    const make = (lightsOut: boolean): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = this.pxW;
      c.height = this.pxH;
      const cx = c.getContext('2d')!;
      const s = this.pxW / WORLD_WIDTH;
      cx.setTransform(s, 0, 0, s, 0, 0);
      drawScene(cx, WORLD_WIDTH, this.worldH, lightsOut);
      return c;
    };
    this.bgOn = make(false);
    this.bgOff = make(true);
  }
}
