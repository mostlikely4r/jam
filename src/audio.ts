import type { SimEvent } from "./sim";

/** Placeholder synthesized sounds. Feel is hard to judge in silence. */
export class Audio {
  muted = false;
  /** Master volume, 0 to 1. */
  volume = 0.5;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Browsers only allow audio to start after a key press or click. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    const length = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 340;
    this.engine = ctx.createGain();
    this.engine.gain.value = 0;
    source.connect(filter).connect(this.engine).connect(this.master);
    source.start();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.applyGain();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.applyGain();
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setThrust(active: boolean): void {
    if (!this.ctx || !this.engine) return;
    this.engine.gain.setTargetAtTime(active ? 0.55 : 0, this.ctx.currentTime, 0.04);
  }

  /** A short radio blip, or a falling two-note alarm for a mayday. */
  beep(mayday: boolean): void {
    if (mayday) {
      this.tone(1320, 880, 0.18, 0.12, "square");
      return;
    }
    this.tone(1560, 1560, 0.05, 0.06, "sine");
  }

  play(events: SimEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "shot":
          this.tone(740, 240, 0.07, 0.1, "square");
          break;
        case "hit":
          this.burst(1800, 0.05, 0.16);
          break;
        case "break":
          this.burst(420 + 6000 / event.radius, 0.28, 0.5);
          break;
        case "pickup":
          this.tone(620 + event.kind * 110, 1180 + event.kind * 110, 0.1, 0.16, "triangle");
          break;
        case "sale":
          this.tone(980, 1460, 0.08, 0.14, "sine");
          break;
        case "impact":
          this.burst(240, 0.22, Math.min(0.9, 0.3 + event.damage / 25));
          break;
        case "wreck":
          this.burst(150, 0.9, 1);
          break;
      }
    }
  }

  private tone(
    from: number,
    to: number,
    seconds: number,
    volume: number,
    type: OscillatorType,
  ): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + seconds);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + seconds);
  }

  private burst(frequency: number, seconds: number, volume: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = 0.5 + Math.random() * 0.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + seconds);
  }
}
