// sprites.ts – canvas drawing of mosquitoes and the sleeper. Everything is procedural: no external assets.

import { CONFIG } from './config.ts';
import type { Kind } from './types.ts';

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

const PALETTE: Record<Kind, { body: string; stripe: string; glow: string; wing: string }> = {
  slow: { body: '#3d3350', stripe: '#c9b8ff', glow: 'rgba(210,190,255,0.30)', wing: 'rgba(235,245,255,0.78)' },
  fast: { body: '#2b1b1b', stripe: '#ffa13d', glow: 'rgba(255,170,70,0.34)', wing: 'rgba(255,240,220,0.72)' },
  boss: { body: '#4b1230', stripe: '#ff4d6d', glow: 'rgba(255,70,110,0.36)', wing: 'rgba(255,225,235,0.78)' },
};

export function outlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  maxWidth?: number,
): void {
  ctx.font = `800 ${size}px ${FONT}`;
  if (maxWidth) {
    const w = ctx.measureText(text).width;
    if (w > maxWidth) ctx.font = `800 ${Math.floor((size * maxWidth) / w)}px ${FONT}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.2);
  ctx.strokeStyle = 'rgba(12,6,24,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export interface MosquitoDraw {
  kind: Kind;
  x: number;
  y: number;
  /** Direction of flight, radians. */
  angle: number;
  hp: number;
  maxHp: number;
  /** 0–1: white hit flash. */
  flash: number;
  time: number;
  seed: number;
  reduced: boolean;
}

export function drawMosquito(ctx: CanvasRenderingContext2D, d: MosquitoDraw): void {
  const spec = CONFIG.kinds[d.kind];
  const pal = PALETTE[d.kind];
  const r = spec.drawRadius;

  ctx.save();
  ctx.translate(d.x, d.y);

  // Soft halo: keeps the silhouette readable on both the lit and the dark room.
  ctx.fillStyle = pal.glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
  ctx.fill();

  if (d.kind === 'fast' && !d.reduced) {
    ctx.strokeStyle = 'rgba(255,200,120,0.45)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const off of [-0.4, 0, 0.4]) {
      const a = d.angle + Math.PI;
      const sx = Math.cos(a) * r * 1.2 + Math.cos(a + Math.PI / 2) * r * off;
      const sy = Math.sin(a) * r * 1.2 + Math.sin(a + Math.PI / 2) * r * off;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * r * 1.3, sy + Math.sin(a) * r * 1.3);
      ctx.stroke();
    }
  }

  ctx.rotate(d.angle);

  // Wings (flap is a fast shimmer; static with reduced motion).
  const flap = d.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(d.time * 70 + d.seed);
  const wingSpread = 0.9 + flap * 0.35;
  ctx.fillStyle = pal.wing;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * wingSpread);
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, side * r * 0.1, r * 1.05, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Legs.
  ctx.strokeStyle = pal.body;
  ctx.lineWidth = d.kind === 'boss' ? 2.4 : 1.5;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (const lx of [-0.15, 0.15, 0.45]) {
      ctx.beginPath();
      ctx.moveTo(r * lx, 0);
      ctx.lineTo(r * (lx - 0.35), side * r * 0.95);
      ctx.stroke();
    }
  }

  // Body: abdomen, thorax, head, proboscis, with a light outline for contrast.
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#fff6d8';
  ctx.fillStyle = d.flash > 0 ? '#ffffff' : pal.body;
  ctx.beginPath();
  ctx.ellipse(-r * 0.6, 0, r * 0.85, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 0.3, 0, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 0.82, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (d.flash <= 0) {
    ctx.strokeStyle = pal.stripe;
    ctx.lineWidth = d.kind === 'boss' ? 3 : 2;
    for (const sx of [-0.95, -0.6, -0.25]) {
      ctx.beginPath();
      ctx.moveTo(r * sx, -r * 0.36);
      ctx.lineTo(r * sx, r * 0.36);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = '#fff6d8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(r * 1.08, 0);
  ctx.lineTo(r * 1.65, 0);
  ctx.stroke();

  // Eyes: angry red on the boss.
  ctx.fillStyle = d.kind === 'boss' ? '#ff2d4f' : '#fff6d8';
  const eye = d.kind === 'boss' ? r * 0.12 : r * 0.08;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(r * 0.92, side * r * 0.15, eye, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (d.kind === 'boss') drawBossPips(ctx, d, r);
}

function drawBossPips(ctx: CanvasRenderingContext2D, d: MosquitoDraw, r: number): void {
  const gap = 15;
  const y = d.y - r - 16;
  const pulse = 1 + d.flash * 0.6;
  for (let i = 0; i < d.maxHp; i++) {
    const px = d.x + (i - (d.maxHp - 1) / 2) * gap;
    const full = i < d.hp;
    ctx.save();
    ctx.translate(px, y);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = full ? '#ff3d5e' : 'rgba(20,10,30,0.7)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = full ? '#fff6d8' : 'rgba(255,246,216,0.5)';
    ctx.stroke();
    ctx.restore();
  }
}

export interface SleeperDraw {
  x: number;
  y: number;
  time: number;
  bites: number;
  flinch: number;
  lightsOut: boolean;
  reduced: boolean;
}

/** The target: a clearly marked sleeping head with a glowing, dashed ring. */
export function drawSleeper(ctx: CanvasRenderingContext2D, d: SleeperDraw): void {
  const breathe = d.reduced ? 1 : 1 + 0.025 * Math.sin(d.time * 2);
  const jx = d.reduced || d.flinch <= 0 ? 0 : (Math.random() - 0.5) * 6 * d.flinch;
  const jy = d.reduced || d.flinch <= 0 ? 0 : (Math.random() - 0.5) * 6 * d.flinch;

  ctx.save();
  ctx.translate(d.x + jx, d.y + jy);

  const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, 64);
  glow.addColorStop(0, d.lightsOut ? 'rgba(130,170,255,0.30)' : 'rgba(255,140,150,0.30)');
  glow.addColorStop(1, 'rgba(255,140,150,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 64, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(d.reduced ? 0 : d.time * 0.25);
  ctx.setLineDash([7, 7]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,236,200,0.75)';
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.scale(breathe, breathe);

  // Head.
  ctx.fillStyle = '#f3caa2';
  ctx.strokeStyle = '#7a4a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 2, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Nightcap.
  ctx.fillStyle = '#e04f6a';
  ctx.beginPath();
  ctx.moveTo(-22, -2);
  ctx.quadraticCurveTo(-18, -30, 6, -28);
  ctx.quadraticCurveTo(26, -26, 22, -2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath();
  ctx.arc(8, -30, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Closed eyes, cheeks, mouth.
  ctx.strokeStyle = '#4a2a28';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const sx of [-8, 8]) {
    ctx.beginPath();
    ctx.arc(sx, 4, 4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,120,130,0.45)';
  for (const sx of [-14, 14]) {
    ctx.beginPath();
    ctx.arc(sx, 11, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 13, 3, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // Bite marks accumulate on the face.
  ctx.fillStyle = '#d6324a';
  for (let i = 0; i < d.bites; i++) {
    const a = i * 2.4 + 0.7;
    const rr = 6 + ((i * 7) % 11);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rr, 2 + Math.sin(a) * rr, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Zzz.
  ctx.save();
  ctx.translate(d.x, d.y);
  for (let i = 0; i < 3; i++) {
    const phase = d.reduced ? 0.6 : (d.time * 0.5 + i / 3) % 1;
    ctx.globalAlpha = Math.sin(phase * Math.PI);
    ctx.fillStyle = '#e8f0ff';
    ctx.font = `800 ${12 + i * 4}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('Z', 34 + i * 10 + phase * 6, -20 - i * 12 - phase * 8);
  }
  ctx.restore();
}
