// scene.ts – the static bedroom, drawn once per size and lighting state into an offscreen canvas.

import { CONFIG } from './config.ts';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the room in world units (360 × h). `lightsOut` swaps the warm lamp for cold moonlight. */
export function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, lightsOut: boolean): void {
  const ty = h * CONFIG.world.targetY;
  const wallH = h * 0.56;

  // Wall.
  const wall = ctx.createLinearGradient(0, 0, 0, wallH);
  wall.addColorStop(0, lightsOut ? '#161430' : '#5a3452');
  wall.addColorStop(1, lightsOut ? '#1d1a36' : '#7b4a50');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, wallH);

  // Floor with planks.
  ctx.fillStyle = lightsOut ? '#14101c' : '#4a3226';
  ctx.fillRect(0, wallH, w, h - wallH);
  ctx.strokeStyle = lightsOut ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1.5;
  for (let y = wallH + 26; y < h; y += 34) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.fillStyle = lightsOut ? '#0e0a14' : '#33211a';
  ctx.fillRect(0, wallH - 4, w, 8);

  // Window: dark night with moon and stars, frame and curtains.
  const wx = 26;
  const wy = h * 0.07;
  const ww = 112;
  const wh = 150;
  ctx.fillStyle = '#0a1030';
  roundRect(ctx, wx, wy, ww, wh, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const [sx, sy] of [[18, 20], [44, 52], [80, 28], [92, 70], [30, 96], [66, 112], [96, 130], [14, 134]]) {
    ctx.fillRect(wx + sx, wy + sy, 2, 2);
  }
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(wx + 74, wy + 44, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a1030';
  ctx.beginPath();
  ctx.arc(wx + 80, wy + 40, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = lightsOut ? '#3a3050' : '#a77a55';
  ctx.lineWidth = 6;
  roundRect(ctx, wx, wy, ww, wh, 8);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy);
  ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.moveTo(wx, wy + wh / 2);
  ctx.lineTo(wx + ww, wy + wh / 2);
  ctx.stroke();
  ctx.fillStyle = lightsOut ? '#2a1e3c' : '#c4566a';
  ctx.beginPath();
  ctx.moveTo(wx - 12, wy - 8);
  ctx.lineTo(wx + 26, wy - 8);
  ctx.quadraticCurveTo(wx + 8, wy + wh / 2, wx + 26, wy + wh + 6);
  ctx.lineTo(wx - 12, wy + wh + 6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(wx + ww + 12, wy - 8);
  ctx.lineTo(wx + ww - 26, wy - 8);
  ctx.quadraticCurveTo(wx + ww - 8, wy + wh / 2, wx + ww - 26, wy + wh + 6);
  ctx.lineTo(wx + ww + 12, wy + wh + 6);
  ctx.closePath();
  ctx.fill();

  // Nightstand and lamp.
  const lampX = 314;
  const stand = ty - 14;
  ctx.fillStyle = lightsOut ? '#241a2c' : '#6b4630';
  roundRect(ctx, lampX - 28, stand, 56, 70, 6);
  ctx.fill();
  ctx.fillStyle = lightsOut ? '#171020' : '#4b2f20';
  ctx.fillRect(lampX - 22, stand + 22, 44, 3);
  ctx.fillStyle = lightsOut ? '#3a3350' : '#8a6a50';
  ctx.fillRect(lampX - 3, stand - 28, 6, 28);
  ctx.fillStyle = lightsOut ? '#4a4460' : '#ffd37a';
  ctx.beginPath();
  ctx.moveTo(lampX - 18, stand - 26);
  ctx.lineTo(lampX + 18, stand - 26);
  ctx.lineTo(lampX + 28, stand - 58);
  ctx.lineTo(lampX - 28, stand - 58);
  ctx.closePath();
  ctx.fill();

  // Bed: rug, frame, pillow, striped blanket.
  ctx.fillStyle = lightsOut ? '#201830' : '#7b3f4a';
  ctx.beginPath();
  ctx.ellipse(w / 2, ty + 60, 150, 56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lightsOut ? '#2a2038' : '#8a5a3c';
  roundRect(ctx, w / 2 - 112, ty - 66, 224, 150, 18);
  ctx.fill();
  ctx.fillStyle = lightsOut ? '#3a3050' : '#f4e7d3';
  roundRect(ctx, w / 2 - 98, ty - 54, 196, 128, 14);
  ctx.fill();
  ctx.fillStyle = lightsOut ? '#4a4366' : '#ffffff';
  roundRect(ctx, w / 2 - 58, ty - 38, 116, 56, 22);
  ctx.fill();
  ctx.save();
  roundRect(ctx, w / 2 - 98, ty + 22, 196, 52, 12);
  ctx.clip();
  const stripes = lightsOut ? ['#2c3a66', '#222a4e'] : ['#4a8fd0', '#3a74b0'];
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = stripes[i % 2];
    ctx.fillRect(w / 2 - 98 + i * 17, ty + 22, 17, 52);
  }
  ctx.restore();

  // Lighting.
  if (!lightsOut) {
    const lamp = ctx.createRadialGradient(lampX, stand - 40, 10, lampX, stand - 40, 300);
    lamp.addColorStop(0, 'rgba(255,200,110,0.55)');
    lamp.addColorStop(0.5, 'rgba(255,170,80,0.18)');
    lamp.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, w, h);
  } else {
    const moon = ctx.createLinearGradient(wx, wy, wx + 180, wy + 300);
    moon.addColorStop(0, 'rgba(150,180,255,0.22)');
    moon.addColorStop(1, 'rgba(150,180,255,0)');
    ctx.fillStyle = moon;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + ww, wy);
    ctx.lineTo(wx + ww + 150, wy + 330);
    ctx.lineTo(wx + 40, wy + 330);
    ctx.closePath();
    ctx.fill();
  }
  const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, lightsOut ? 'rgba(0,0,0,0.55)' : 'rgba(10,0,20,0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}
