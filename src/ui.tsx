import type { RoundResult } from './types.ts';
import { formatSummary, secondsWord } from './scoring.ts';

export function SoundToggle({ on, onToggle, compact = false }: { on: boolean; onToggle: () => void; compact?: boolean }) {
  return (
    <button
      className={compact ? 'btn ghost' : 'btn secondary'}
      aria-pressed={on}
      onClick={onToggle}
      aria-label={on ? 'Zvuk zapnutý, klepnutím vypneš' : 'Zvuk vypnutý, klepnutím zapneš'}
    >
      {on ? '🔊 Zvuk' : '🔇 Ticho'}
    </button>
  );
}

export function Loading() {
  return (
    <main className="screen center">
      <p className="muted">Načítám…</p>
    </main>
  );
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="screen center">
      <div className="card">
        <h1>Něco se pokazilo</h1>
        <p>{message}</p>
      </div>
    </main>
  );
}

export function Intro({
  duration,
  soundOn,
  onToggleSound,
  onStart,
}: {
  duration: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onStart: () => void;
}) {
  return (
    <main className="screen center">
      <div className="card intro">
        <div className="mosq" aria-hidden="true">🦟</div>
        <h1>Komáří nálet</h1>
        <p>
          Přežij {duration} {secondsWord(duration)}. Komáry zastav tapnutím. Pozor na velkého: potřebuje tři zásahy!
        </p>
        <button className="btn primary big" onClick={onStart}>
          Začít
        </button>
        <SoundToggle on={soundOn} onToggle={onToggleSound} />
      </div>
    </main>
  );
}

export function Results({
  result,
  sent,
  canReplay,
  onContinue,
  onReplay,
}: {
  result: RoundResult;
  sent: boolean;
  canReplay: boolean;
  onContinue: () => void;
  onReplay: () => void;
}) {
  const s = formatSummary(result);
  return (
    <main className="screen center">
      <div className="card results">
        <h1>{result.survived ? 'Noc přežita' : result.reason === 'gaveUp' ? 'Vzdáno' : 'Komáři zvítězili'}</h1>
        <ul className="stats">
          <li>🦟 Zlikvidováno: <b>{s.eliminated}</b></li>
          <li>🩸 Krevní ztráta: <b>{s.bloodLoss}</b></li>
          <li>😤 Psychická újma: <b>{s.psychic}</b></li>
          <li>⭐ Hodnocení: <b>{s.rank}</b></li>
        </ul>
        <p className="muted small">
          Skóre {result.score} · nejdelší série {result.bestStreak} · štípnutí {result.bites}
        </p>
        <p className="comment">{s.comment}</p>
        <div className="actions">
          <button className="btn primary big" disabled={sent} onClick={onContinue}>
            {sent ? 'Výsledek odeslán' : 'Pokračovat'}
          </button>
          {canReplay && (
            <button className="btn secondary" onClick={onReplay}>
              Ještě jednu noc
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
