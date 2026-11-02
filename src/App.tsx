import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AudioFx } from './audio.ts';
import { Game } from './Game.tsx';
import { resolveInit } from './init.ts';
import type { InitResult } from './init.ts';
import { fail, finish, startMinihra } from './minihra-protokol.ts';
import { finishPayload, successRate } from './scoring.ts';
import type { RoundResult } from './types.ts';
import { ErrorScreen, Intro, Loading, Results } from './ui.tsx';

type Phase = 'loading' | 'intro' | 'playing' | 'results' | 'error';

const embedded = window.parent !== window;

class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: unknown) {
    fail('INTERNAL', String(error));
  }
  render() {
    return this.state.error ? <ErrorScreen message="Hru se nepodařilo spustit. Zkus ji načíst znovu." /> : this.props.children;
  }
}

function Root() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [init, setInit] = useState<InitResult | null>(null);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [sent, setSent] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [errorText, setErrorText] = useState('');
  const audio = useMemo(() => new AudioFx(), []);
  const resultRef = useRef<RoundResult | null>(null);
  resultRef.current = result;

  useEffect(() => () => audio.dispose(), [audio]);

  // A new INIT (also after FINISH) restarts everything from the intro.
  useEffect(() => {
    startMinihra((level, payload) => {
      const resolved = resolveInit(level, payload);
      if (resolved.error) {
        fail(resolved.error.code, resolved.error.message);
        setErrorText('Zadání hry má nesprávný tvar, proto se hra nespustila.');
        setPhase('error');
        return;
      }
      setInit(resolved);
      setResult(null);
      setSent(false);
      setRound((n) => n + 1);
      setPhase('intro');
    });
  }, []);

  const start = useCallback(() => {
    audio.unlock();
    setPhase('playing');
  }, [audio]);

  const onDone = useCallback((r: RoundResult) => {
    setResult(r);
    setSent(false);
    setPhase('results');
  }, []);

  const onContinue = useCallback(() => {
    const r = resultRef.current;
    if (!r) return;
    setSent(true);
    finish(successRate(r), finishPayload(r));
  }, []);

  const onReplay = useCallback(() => {
    audio.unlock();
    setResult(null);
    setSent(false);
    setRound((n) => n + 1);
    setPhase('playing');
  }, [audio]);

  const toggleSound = useCallback(() => setSoundOn((v) => !v), []);

  let screen: ReactNode;
  if (phase === 'loading' || !init) {
    screen = phase === 'error' ? <ErrorScreen message={errorText} /> : <Loading />;
  } else if (phase === 'error') {
    screen = <ErrorScreen message={errorText} />;
  } else if (phase === 'intro') {
    screen = <Intro duration={init.settings.duration} soundOn={soundOn} onToggleSound={toggleSound} onStart={start} />;
  } else if (phase === 'playing') {
    screen = <Game key={round} settings={init.settings} audio={audio} soundOn={soundOn} onToggleSound={toggleSound} onDone={onDone} />;
  } else if (result) {
    // Embedded, a replay is only offered if the main game allows it and before the result was sent.
    const canReplay = embedded ? init.allowReplay && !sent : true;
    screen = <Results result={result} sent={sent} canReplay={canReplay} onContinue={onContinue} onReplay={onReplay} />;
  } else {
    screen = <Loading />;
  }

  return <div className="app">{screen}</div>;
}

export default function App() {
  return (
    <Boundary>
      <Root />
    </Boundary>
  );
}
