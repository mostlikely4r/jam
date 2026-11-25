/**
 * Sway: how a face nods along with the music (docs/chatter-faces-sway-plan.md).
 *
 * Pure: a nod is data (`src/voices.json`), a tempo is data (`src/music.json`), and the phase is
 * the audio's own position, so the same numbers always give the same pose and the dip lands on
 * the real beat. No DOM and no clock of its own.
 *
 * The motion moves the face's features inside its glass, never the glass itself, and each voice
 * turns a different way: a head that goes up and down, one that turns left and right, one that
 * only tips. The squash that comes with a turn is what sells it as a turn rather than a slide.
 * Everything is in the face box's own units (100 x 66), so it reads the same at 26px and at 110px.
 */

/** How a voice moves its head. */
export type NodKind = "still" | "tilt" | "yaw" | "pitch";

/** One voice's nod: how often, which way, and how far. */
export interface Nod {
  /** Beats between nods: 1 nods on every beat, 2 on every other. */
  every: number;
  kind: NodKind;
  /** Degrees of roll for a tilt, or box units the features travel for a yaw or a pitch. */
  amount: number;
  /** How much the features squash at the accent, 0 to 0.5. What turns a slide into a turn. */
  turn?: number;
}

/** A tempo, by the numbers: outside this the track sways at the default. */
export const MIN_BPM = 50;
export const MAX_BPM = 200;

/** What a track sways at when its own tempo is missing or silly. */
export const DEFAULT_BPM = 100;

/** The nod used when a voice and the generic voice both have none. */
export const DEFAULT_NOD: Nod = { every: 1, kind: "tilt", amount: 1.4 };

/** A tempo that can be swayed to: anything missing, absurd or not a number is the default. */
export function clampBpm(bpm: unknown): number {
  const value = typeof bpm === "number" && Number.isFinite(bpm) ? bpm : Number.NaN;
  return value >= MIN_BPM && value <= MAX_BPM ? value : DEFAULT_BPM;
}

/** Seconds one nod takes: `every` beats of the track. */
export function cycleSeconds(nod: Nod, bpm: number): number {
  const beats = Number.isFinite(nod.every) && nod.every > 0 ? nod.every : 1;
  return (beats * 60) / clampBpm(bpm);
}

/** How far into the nod a track position is: 0 to 1, wrapping for negatives and long tracks. */
export function phaseAt(nod: Nod, bpm: number, position: number): number {
  const cycles = Number.isFinite(position) ? position / cycleSeconds(nod, bpm) : 0;
  return cycles - Math.floor(cycles);
}

/**
 * One rise and fall, 0 at both ends, peaking early: the shape of a nod's first half. The exponent
 * under the sine is what makes it quick off the beat and slow coming back.
 */
function lobe(part: number): number {
  const at = Math.min(1, Math.max(0, part));
  return Math.sin(Math.PI * at ** 0.7);
}

/**
 * The accent a nod sits on, -1 to 1: a rise and a fall in the first half of the nod, then the
 * same shape mirrored in the second, so a tilt tips one way and back and a yaw turns to each side.
 * Zero on the beat and again halfway through.
 */
export function accentAt(phase: number): number {
  return phase < 0.5 ? lobe(phase * 2) : -lobe((phase - 0.5) * 2);
}

/** Where a face's features sit: box units across and down, degrees of roll, and a squash each way. */
export interface Pose {
  dx: number;
  dy: number;
  rotate: number;
  /** 1 is unsquashed. */
  sx: number;
  sy: number;
}

const STILL: Pose = { dx: 0, dy: 0, rotate: 0, sx: 1, sy: 1 };

/** Keeps a hand-edited `turn` from folding the face in half. */
function turnOf(nod: Nod): number {
  const turn = nod.turn ?? 0;
  return Number.isFinite(turn) ? Math.min(0.5, Math.max(0, turn)) : 0;
}

/**
 * The pose `position` seconds into a track, in the face box's own units.
 *
 * A tilt rolls the features. A yaw slides them across and squashes them sideways, which reads as
 * a head turning to one side and back. A pitch lifts and drops them with a squash, which reads as
 * a head bobbing up and down.
 */
export function swayAt(nod: Nod, bpm: number, position: number): Pose {
  const accent = accentAt(phaseAt(nod, bpm, position));
  const amount = Number.isFinite(nod.amount) ? nod.amount : 0;
  const turn = turnOf(nod);
  switch (nod.kind) {
    case "tilt":
      return { ...STILL, rotate: amount * accent };
    case "yaw":
      return { ...STILL, dx: amount * accent, sx: 1 - turn * Math.abs(accent) };
    case "pitch":
      return { ...STILL, dy: amount * accent, sy: 1 - turn * Math.abs(accent) };
    default:
      return { ...STILL };
  }
}

/** Steps the pose is rounded to, so a still face writes nothing and a moving one writes little. */
const STEP = 0.02;
const SCALE_STEP = 0.005;

const quantize = (value: number, step: number): number => Math.round(value / step) * step;

/** A number as a short, stable string, so the same pose always gives the same markup. */
const show = (value: number): string => String(Math.round(value * 1000) / 1000);

/**
 * A pose as an SVG `transform` for the group holding a face's features, at `strength` from 0
 * (still) to 1 (full). Empty when the face doesn't move, so nothing is set between tracks.
 *
 * The numbers are the face box's own units, which is why the same pose holds at every size: the
 * group is rotated and squashed about the middle of the box, and the travel is in box units.
 */
export function poseTransform(pose: Pose, strength: number): string {
  const dx = quantize(pose.dx * strength, STEP);
  const dy = quantize(pose.dy * strength, STEP);
  const rotate = quantize(pose.rotate * strength, STEP);
  const sx = quantize(1 + (pose.sx - 1) * strength, SCALE_STEP);
  const sy = quantize(1 + (pose.sy - 1) * strength, SCALE_STEP);
  if (!dx && !dy && !rotate && sx === 1 && sy === 1) return "";
  return (
    `translate(${show(dx)} ${show(dy)}) translate(50 33) rotate(${show(rotate)}) ` +
    `scale(${show(sx)} ${show(sy)}) translate(-50 -33)`
  );
}
