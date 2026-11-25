/**
 * Music: licensed tracks that play while the ship is at work (docs/music-plan.md).
 *
 * Two halves. `MusicScheduler` is pure and decides when a track starts or fades; it runs in
 * tests without a browser. `MusicPlayer` plays what the scheduler asks for through the game's
 * own audio graph, so the main volume and Mute cover music too.
 */
import { clampBpm } from "./sway";

/** The only licences a track may have: the repo is public, so every file in it is shared. */
export const LICENCES = ["CC0", "CC BY 3.0", "CC BY 4.0"] as const;
export type Licence = (typeof LICENCES)[number];

export type Mood = "funk" | "floaty";
export type MusicMode = "off" | "occasional" | "always";

export interface Track {
  id: string;
  /** Path under `public/music/`. */
  file: string;
  title: string;
  artist: string;
  licence: Licence;
  /** Where the track came from: a URL. */
  source: string;
  mood: Mood;
  /** The tempo the radio faces sway to, hand-set by ear. */
  bpm: number;
  /** Seconds before the first downbeat, when it isn't at 0:00; the sway's phase is offset by it. */
  beat?: number;
  /** The exact credit text, when the source asks for a particular one. */
  attribution?: string;
}

/** Seconds, all counted in real time while at work: fast-forward doesn't hurry the music. */
export const MUSIC_TIMING = {
  /** The first track after work begins. */
  firstDelay: [10, 20] as const,
  /** Between tracks, by mode. */
  gap: { always: [30, 90] as const, occasional: [180, 480] as const },
  fadeIn: 3,
  fadeOut: 5,
  /** How long anything the ship did keeps it "at work". */
  workMemory: 20,
  /** Slower than this (units a second, relative to the nearest body) isn't moving, for "at work". */
  crawl: 20,
  /** How often a floaty track is picked over a funk one, when both exist. */
  floatyShare: 0.25,
};

/**
 * `hold` fades a track out but keeps its place, and `resume` fades it back in from there: the
 * song waits in the dock and picks up on undocking.
 */
export type MusicAction =
  | { type: "start"; track: Track }
  | { type: "fadeOut" }
  | { type: "hold" }
  | { type: "resume"; track: Track }
  | null;

export interface MusicInput {
  /** The ship has done something lately: moved, thrusted, shot, picked up ore, flown a course. */
  atWork: boolean;
  docked: boolean;
  /** The pause menu, the start menu or a designer is up. */
  paused: boolean;
  mode: MusicMode;
  /** Real seconds since the last update. */
  seconds: number;
}

/** Decides when a track starts and when it fades. Knows nothing of the browser. */
export class MusicScheduler {
  /** The track playing now, or null. */
  playing: Track | null = null;
  /** The track faded out on docking, kept to pick up again on undocking. */
  held: Track | null = null;
  /** Seconds of work left before the next track, or null when no count has begun. */
  private wait: number | null = null;
  private last: Track | null = null;
  private readonly failed = new Set<string>();

  constructor(
    private readonly tracks: Track[],
    private readonly random: () => number = Math.random,
  ) {}

  update(input: MusicInput): MusicAction {
    if (input.paused) return null;
    if (input.mode === "off") {
      this.held = null;
      this.wait = null;
      if (!this.playing) return null;
      this.playing = null;
      return { type: "fadeOut" };
    }
    if (this.playing) {
      if (!input.docked) return null;
      this.held = this.playing;
      this.playing = null;
      return { type: "hold" };
    }
    if (input.docked) {
      this.wait = null;
      return null;
    }
    if (this.held) {
      const track = this.held;
      this.held = null;
      this.playing = track;
      return { type: "resume", track };
    }
    if (!input.atWork) return null;
    if (this.wait === null) this.wait = this.between(MUSIC_TIMING.firstDelay);
    this.wait -= input.seconds;
    if (this.wait > 0) return null;
    const track = this.pick();
    this.wait = null;
    if (!track) return null;
    this.playing = track;
    this.last = track;
    return { type: "start", track };
  }

  /** The track played to its end: a gap follows. */
  trackEnded(mode: MusicMode): void {
    this.playing = null;
    this.held = null;
    this.wait = this.gap(mode);
  }

  /** The player asked for the next one: the track fades and the gap begins. */
  skip(mode: MusicMode): MusicAction {
    if (!this.playing) return null;
    this.playing = null;
    this.wait = this.gap(mode);
    return { type: "fadeOut" };
  }

  /** A file that wouldn't play is left out for the rest of the session; another is tried at once. */
  fail(id: string): void {
    this.failed.add(id);
    if (this.playing?.id === id) this.playing = null;
    if (this.held?.id === id) this.held = null;
    this.wait = 0;
  }

  private gap(mode: MusicMode): number {
    return this.between(mode === "occasional" ? MUSIC_TIMING.gap.occasional : MUSIC_TIMING.gap.always);
  }

  private between([low, high]: readonly [number, number]): number {
    return low + (high - low) * this.random();
  }

  /** Funk most of the time, floaty now and then; never the last one again while there's another. */
  private pick(): Track | null {
    const usable = this.tracks.filter((track) => !this.failed.has(track.id));
    if (usable.length === 0) return null;
    const fresh = usable.length > 1 ? usable.filter((track) => track !== this.last) : usable;
    const mood: Mood = this.random() < MUSIC_TIMING.floatyShare ? "floaty" : "funk";
    const pool = fresh.filter((track) => track.mood === mood);
    const from = pool.length > 0 ? pool : fresh;
    return from[Math.min(from.length - 1, Math.floor(this.random() * from.length))];
  }
}

/**
 * The track list, checked: entries with a licence off the list are dropped, with a warning, and
 * every tempo is made usable, so a hand-edited `bpm` can never stop the faces swaying.
 */
export function usableTracks(list: unknown[]): Track[] {
  return (list as Track[])
    .filter((track) => {
      const ok = (LICENCES as readonly string[]).includes(track.licence);
      if (!ok) console.warn(`music: ${track.id} left out, licence "${track.licence}" isn't allowed`);
      return ok;
    })
    .map((track) => ({ ...track, bpm: clampBpm(track.bpm) }));
}

/** The music settings from a saved settings object; an older save without them gets the defaults. */
export function musicSettingsFrom(saved: Record<string, unknown>): { musicMode: MusicMode; musicVolume: number } {
  const mode = saved.musicMode;
  const volume = saved.musicVolume;
  return {
    musicMode: mode === "off" || mode === "occasional" || mode === "always" ? mode : "always",
    musicVolume: typeof volume === "number" && volume >= 0 && volume <= 1 ? volume : 0.6,
  };
}

/** The line shown when a track starts, which doubles as its attribution. */
export function nowPlayingText(track: Track): string {
  return `♪ ${track.title} · ${track.artist} · ${track.licence}`;
}

/**
 * Plays the scheduler's tracks through one reused `<audio>` element, into a music gain that
 * feeds the game's master gain. `output` is null until the browser allows audio (a click or key).
 */
export class MusicPlayer {
  private element: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private ctx: AudioContext | null = null;
  private current: Track | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private wasPaused = false;
  private readonly warned = new Set<string>();

  constructor(
    readonly scheduler: MusicScheduler,
    /** The music gain's level, 0 to 1, under the main volume. */
    public level: number,
    private readonly onStart: (track: Track) => void,
  ) {}

  /** Hooks into the game's audio once it exists. Safe to call every frame. */
  connect(output: { ctx: AudioContext; destination: AudioNode } | null): void {
    if (this.ctx || !output) return;
    this.ctx = output.ctx;
    this.gain = output.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(output.destination);
    const element = document.createElement("audio");
    element.preload = "auto";
    element.addEventListener("ended", () => {
      // A held track can still run out during its fade: then there's nothing to pick up.
      if (!this.current && !this.scheduler.held) return;
      this.current = null;
      this.scheduler.trackEnded(this.mode);
    });
    element.addEventListener("error", () => {
      const track = this.current;
      if (!track) return;
      this.current = null;
      if (!this.warned.has(track.id)) {
        this.warned.add(track.id);
        console.warn(`music: ${track.file} wouldn't play, skipped for this session`);
      }
      this.scheduler.fail(track.id);
    });
    output.ctx.createMediaElementSource(element).connect(this.gain);
    this.element = element;
  }

  mode: MusicMode = "always";

  /** The track playing now, paused with the menu or not; null between tracks and while held in the dock. */
  get playing(): Track | null {
    return this.scheduler.playing;
  }

  /**
   * Where the playing track is, in its own seconds; null when nothing is playing. The radio faces
   * sway to this, so the dip lands on the real beat and freezes with a pause, like the audio.
   */
  get position(): number | null {
    if (!this.current || !this.element) return null;
    return this.element.currentTime;
  }

  update(input: Omit<MusicInput, "mode">): void {
    if (!this.element) return;
    if (input.paused !== this.wasPaused) {
      this.wasPaused = input.paused;
      if (input.paused) this.element.pause();
      else if (this.current) this.play(this.current);
    }
    this.apply(this.scheduler.update({ ...input, mode: this.mode }));
  }

  skip(): void {
    this.apply(this.scheduler.skip(this.mode));
  }

  setLevel(level: number): void {
    this.level = level;
    if (this.gain && this.ctx && this.current) this.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.1);
  }

  private apply(action: MusicAction): void {
    const { element, gain, ctx } = this;
    if (!action || !element || !gain || !ctx) return;
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    if (action.type === "fadeOut" || action.type === "hold") {
      // A held track keeps its src and place, so `resume` carries on from where it faded.
      this.current = null;
      gain.gain.linearRampToValueAtTime(0, now + MUSIC_TIMING.fadeOut);
      this.stopTimer = setTimeout(() => element.pause(), MUSIC_TIMING.fadeOut * 1000);
      return;
    }
    if (action.type === "resume") {
      this.current = action.track;
      gain.gain.linearRampToValueAtTime(this.level, now + MUSIC_TIMING.fadeIn);
      this.play(action.track);
      return;
    }
    this.current = action.track;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.level, now + MUSIC_TIMING.fadeIn);
    element.src = new URL(`music/${action.track.file}`, document.baseURI).href;
    this.play(action.track);
    this.onStart(action.track);
  }

  /**
   * Plays, and if the browser refuses (not a broken file, which the `error` event handles) the
   * track counts as ended so a gap and another try follow, instead of waiting on it forever. An
   * abort is only a newer src or a pause cutting in.
   */
  private play(track: Track): void {
    this.element?.play().catch((error: unknown) => {
      const name = (error as { name?: string })?.name;
      // A broken or missing file also fires `error`, which leaves it out for good.
      if (name === "AbortError" || name === "NotSupportedError" || this.current !== track) return;
      this.current = null;
      this.scheduler.trackEnded(this.mode);
    });
  }
}
