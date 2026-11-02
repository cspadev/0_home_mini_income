import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AudioFx } from './audio.ts';
import { CONFIG, WORLD_WIDTH } from './config.ts';
import { GameSession } from './session.ts';
import { clampWorldHeight } from './sim.ts';
import type { HudState, RoundResult, Settings } from './types.ts';
import { SoundToggle } from './ui.tsx';

interface Props {
  settings: Settings;
  audio: AudioFx;
  soundOn: boolean;
  onToggleSound: () => void;
  onDone: (result: RoundResult) => void;
}

function Drops({ blood, max }: { blood: number; max: number }) {
  if (max > 10) {
    return (
      <span className="drops-num" aria-label={`Krevní kapky: ${blood} z ${max}`}>
        🩸 {blood}/{max}
      </span>
    );
  }
  return (
    <span className="drops" role="img" aria-label={`Krevní kapky: ${blood} z ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 20 26" className={i < blood ? 'drop' : 'drop lost'} aria-hidden="true">
          <path d="M10 1 C10 1 2 11 2 17 a8 8 0 0 0 16 0 C18 11 10 1 10 1 Z" />
        </svg>
      ))}
    </span>
  );
}

export function Game({ settings, audio, soundOn, onToggleSound, onDone }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [hud, setHud] = useState<HudState>({
    timeLeft: settings.duration,
    blood: settings.blood,
    bloodMax: settings.blood,
    score: 0,
    streak: 0,
  });
  const [paused, setPaused] = useState(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const session = new GameSession(canvas, settings, audio, {
      onHud: setHud,
      onPause: setPaused,
      onDone: (r) => doneRef.current(r),
    });
    sessionRef.current = session;

    const layout = () => {
      const bw = wrap.clientWidth;
      const bh = wrap.clientHeight;
      if (bw <= 0 || bh <= 0) return;
      const worldH = clampWorldHeight((WORLD_WIDTH * bh) / bw);
      const scale = Math.min(bw / WORLD_WIDTH, bh / worldH);
      const w = Math.floor(WORLD_WIDTH * scale);
      const h = Math.floor(worldH * scale);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      session.resize(w, h);
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(wrap);
    session.start();

    return () => {
      ro.disconnect();
      session.destroy();
      sessionRef.current = null;
    };
  }, [settings, audio]);

  useEffect(() => {
    audio.setEnabled(soundOn);
  }, [audio, soundOn]);

  const secondsLeft = Math.ceil(hud.timeLeft);
  const danger = secondsLeft <= CONFIG.countdownSec;

  return (
    <div className="game">
      <header className="hud">
        <div className={danger ? 'hud-cell time danger' : 'hud-cell time'} aria-label={`Zbývá ${secondsLeft} sekund`}>
          <span className="hud-icon" aria-hidden="true">⏱</span>
          {secondsLeft}
        </div>
        <div className="hud-cell blood">
          <Drops blood={hud.blood} max={hud.bloodMax} />
        </div>
        <div className="hud-cell score" aria-label={`Skóre ${hud.score}`}>
          <span>⭐ {hud.score}</span>
          <small className={hud.streak >= 2 ? 'streak on' : 'streak'}>Série {hud.streak}</small>
        </div>
      </header>

      <div className="field" ref={wrapRef}>
        <canvas ref={canvasRef} className="canvas" aria-label="Herní plocha: klepáním zastav komáry" />
        {paused && (
          <div className="overlay" role="dialog" aria-label="Pauza">
            <div className="overlay-card">
              <h2>Pauza</h2>
              <p>Komáři čekají. Hra pokračuje, až klepneš.</p>
              <button className="btn primary" autoFocus onClick={() => sessionRef.current?.resume()}>
                Hrát dál
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="controls">
        <SoundToggle on={soundOn} onToggle={onToggleSound} compact />
        <button className="btn ghost" onClick={() => sessionRef.current?.giveUp()}>
          Vzdát se
        </button>
      </footer>
    </div>
  );
}
