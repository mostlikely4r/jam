import { describe, expect, it } from "vitest";
import { MUSIC_TIMING, type MusicInput, MusicScheduler, type Track } from "./music";

const track = (id: string, mood: Track["mood"] = "funk"): Track => ({
  id,
  file: `${id}.mp3`,
  title: id,
  artist: "someone",
  licence: "CC BY 4.0",
  source: "https://example.org",
  mood,
});

const work: MusicInput = { atWork: true, docked: false, paused: false, mode: "always", seconds: 1 };

/** Runs updates a second apart until a track starts, or gives up after `limit` seconds. */
function untilStart(music: MusicScheduler, limit = 1000, input: Partial<MusicInput> = {}): number | null {
  for (let second = 1; second <= limit; second++) {
    const action = music.update({ ...work, ...input });
    if (action?.type === "start") return second;
  }
  return null;
}

describe("music scheduler", () => {
  it("waits the first delay, then starts once at work", () => {
    const music = new MusicScheduler([track("a")], () => 0.5);
    const started = untilStart(music);
    const [low, high] = MUSIC_TIMING.firstDelay;
    expect(started).toBeGreaterThanOrEqual(low);
    expect(started).toBeLessThanOrEqual(high);
    expect(music.playing?.id).toBe("a");
    expect(music.update(work)).toBeNull();
  });

  it("doesn't count down while not at work", () => {
    const music = new MusicScheduler([track("a")], () => 0.5);
    expect(untilStart(music, 100, { atWork: false })).toBeNull();
  });

  it("holds the track on docking and picks it up on undocking", () => {
    const music = new MusicScheduler([track("a"), track("b")], () => 0.5);
    untilStart(music);
    const id = music.playing!.id;
    expect(music.update({ ...work, docked: true })).toEqual({ type: "hold" });
    expect(music.playing).toBeNull();
    expect(untilStart(music, 500, { docked: true })).toBeNull();
    // Out again, even before any work, the same track carries on at once.
    const back = music.update({ ...work, atWork: false });
    expect(back).toEqual({ type: "resume", track: expect.objectContaining({ id }) });
    expect(music.playing?.id).toBe(id);
  });

  it("starts fresh after docking when nothing was held", () => {
    const music = new MusicScheduler([track("a")], () => 0.5);
    untilStart(music);
    music.trackEnded("always");
    music.update({ ...work, docked: true });
    expect(untilStart(music)).toBeLessThanOrEqual(MUSIC_TIMING.firstDelay[1]);
  });

  it("drops a held track when the music is turned off", () => {
    const music = new MusicScheduler([track("a")], () => 0.5);
    untilStart(music);
    music.update({ ...work, docked: true });
    expect(music.update({ ...work, docked: true, mode: "off" })).toBeNull();
    expect(music.held).toBeNull();
    expect(music.update(work)).toBeNull();
  });

  it("forgets a held track that ran out while fading", () => {
    const music = new MusicScheduler([track("a")], () => 0.5);
    untilStart(music);
    music.update({ ...work, docked: true });
    music.trackEnded("always");
    expect(music.update(work)).toBeNull();
  });

  it("holds while paused", () => {
    const music = new MusicScheduler([track("a")], () => 0.5);
    expect(untilStart(music, 500, { paused: true })).toBeNull();
    untilStart(music);
    expect(music.update({ ...work, paused: true, docked: true })).toBeNull();
    expect(music.playing?.id).toBe("a");
  });

  it("never plays the same track twice in a row when there are two", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const music = new MusicScheduler([track("a"), track("b")], random);
    let last = "";
    for (let round = 0; round < 30; round++) {
      untilStart(music);
      const id = music.playing!.id;
      expect(id).not.toBe(last);
      last = id;
      music.trackEnded("always");
    }
  });

  it("plays the one track again when it's the only one", () => {
    const music = new MusicScheduler([track("a")], () => 0.5);
    untilStart(music);
    music.trackEnded("always");
    expect(untilStart(music)).not.toBeNull();
    expect(music.playing?.id).toBe("a");
  });

  it("never starts when off, and fades one out", () => {
    const music = new MusicScheduler([track("a")], () => 0.5);
    expect(untilStart(music, 500, { mode: "off" })).toBeNull();
    untilStart(music);
    expect(music.update({ ...work, mode: "off" })).toEqual({ type: "fadeOut" });
  });

  it("leaves longer gaps when occasional", () => {
    const gapAfter = (mode: MusicInput["mode"]) => {
      const music = new MusicScheduler([track("a")], () => 0.5);
      untilStart(music, 1000, { mode });
      music.trackEnded(mode);
      return untilStart(music, 1000, { mode });
    };
    const always = gapAfter("always")!;
    const occasional = gapAfter("occasional")!;
    expect(always).toBeGreaterThanOrEqual(MUSIC_TIMING.gap.always[0]);
    expect(always).toBeLessThanOrEqual(MUSIC_TIMING.gap.always[1]);
    expect(occasional).toBeGreaterThan(always);
  });

  it("skip fades the track and a gap follows before the next", () => {
    const music = new MusicScheduler([track("a"), track("b")], () => 0.5);
    untilStart(music);
    expect(music.skip("always")).toEqual({ type: "fadeOut" });
    expect(music.skip("always")).toBeNull();
    const next = untilStart(music)!;
    expect(next).toBeGreaterThanOrEqual(MUSIC_TIMING.gap.always[0]);
  });

  it("never starts with no tracks", () => {
    expect(untilStart(new MusicScheduler([]), 500)).toBeNull();
  });

  it("skips a track that failed and tries another", () => {
    const music = new MusicScheduler([track("a"), track("b")], () => 0.5);
    untilStart(music);
    const bad = music.playing!.id;
    music.fail(bad);
    expect(music.update(work)?.type).toBe("start");
    expect(music.playing?.id).not.toBe(bad);
    music.fail(music.playing!.id);
    expect(untilStart(music, 200)).toBeNull();
  });

  it("picks funk mostly and floaty now and then", () => {
    const pick = (roll: number) => {
      const music = new MusicScheduler([track("f"), track("s", "floaty")], () => roll);
      untilStart(music);
      return music.playing!.mood;
    };
    expect(pick(0.1)).toBe("floaty");
    expect(pick(0.9)).toBe("funk");
  });
});
