// audio.ts – tiny WebAudio synth. No audio files. The context is created only from a user gesture and
// everything is a no-op while sound is off or unavailable, so the game is fully playable without it.

export class AudioFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private buzz: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private wantBuzz = false;

  /** Call from a pointer/click handler (first user gesture). Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.6 : 0;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    this.applyBuzz();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.02);
    this.applyBuzz();
  }

  /** Lets the round silence the buzz while paused and bring it back afterwards. */
  setBossBuzz(on: boolean): void {
    this.wantBuzz = on;
    this.applyBuzz();
  }

  suspend(): void {
    this.wantBuzz = false;
    this.applyBuzz();
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  slap(): void {
    this.noise(0.07, 1800, 0.5);
    this.tone(180, 90, 0.09, 'triangle', 0.5);
  }

  bossHit(): void {
    this.noise(0.09, 900, 0.5);
    this.tone(120, 60, 0.14, 'square', 0.3);
  }

  streak(): void {
    [523, 659, 784].forEach((f, i) => this.tone(f, f, 0.1, 'sine', 0.3, i * 0.07));
  }

  bite(): void {
    this.tone(320, 90, 0.25, 'sawtooth', 0.35);
  }

  lightsOut(): void {
    this.noise(0.05, 400, 0.4);
    this.tone(90, 45, 0.5, 'sine', 0.5);
  }

  end(win: boolean): void {
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.3, i * 0.12));
  }

  dispose(): void {
    this.stopBuzz();
    this.wantBuzz = false;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  private applyBuzz(): void {
    if (this.wantBuzz && this.enabled && this.ctx && this.master && this.ctx.state === 'running') this.startBuzz();
    else this.stopBuzz();
  }

  private startBuzz(): void {
    if (this.buzz || !this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 95;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 38;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.05;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.07;
    lfo.connect(lfoGain).connect(gain.gain);
    osc.connect(gain).connect(this.master);
    osc.start();
    lfo.start();
    this.buzz = { osc, lfo, gain };
  }

  private stopBuzz(): void {
    if (!this.buzz) return;
    const { osc, lfo, gain } = this.buzz;
    this.buzz = null;
    try {
      osc.stop();
      lfo.stop();
    } catch {
      /* already stopped */
    }
    gain.disconnect();
  }

  private ready(): boolean {
    return this.enabled && !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  private tone(from: number, to: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, cutoff: number, vol: number): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter).connect(g).connect(this.master!);
    src.start();
  }
}
