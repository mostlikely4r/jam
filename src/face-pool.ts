// SAFETY: the pool is hand-authored data checked by face-pool.test.ts, which rolls hundreds of
// faces from it for every role and checks each against the face rules; the types below are the
// shape it is written to.
import file from "./face-pool.json";
import type { MoodFace, Part, Pt, Role, Screen, VoiceFace } from "./faces";

/**
 * The face pool (docs/face-cast-plan.md, step 1): a whole face rolled from named parts.
 *
 * Each part style knows how it looks in each mood, so a roll picks only the identity (colour,
 * screen, eyes, brows, mouth, a mark and the crookedness dials) and the moods follow from the
 * parts. Each mood adds one small quirk of its own, so the moods don't look stamped.
 *
 * An authoring tool, not a runtime generator: the dev faces page rolls, the user keeps the good
 * ones in `src/cast.json`, and play only ever shows kept faces, stored resolved. Pure, and on its
 * own seeded random: the same seed and role always give the same face, and the sim's random
 * numbers are never touched.
 */

/** The moods a roll writes. `tired` and `angry` fall back through the renderer's chain. */
export type RolledMood = "neutral" | "happy" | "annoyed" | "scared";
export const ROLLED_MOODS: RolledMood[] = ["neutral", "happy", "annoyed", "scared"];

export const ROLES: Role[] = ["traffic", "defender", "pirate", "station"];

/** A pool part: a face part that may keep its x when mirrored, and may name a colour by role. */
export type PoolPart = Part & { fixed?: boolean };

interface Weighted {
  id: string;
  /** How often each role picks it. A role it doesn't name never does. */
  weights: Partial<Record<Role, number>>;
}

export interface PartStyle extends Weighted {
  /** The left one, in its own frame, for each mood. A mood it doesn't write has none. */
  moods: Partial<Record<RolledMood, PoolPart[]>>;
}

export interface ScreenStyle extends Weighted {
  screen: Partial<Screen>;
  /** Drawn under the features, in box coordinates: the station's bezel. */
  under?: PoolPart[];
}

export interface MarkStyle extends Weighted {
  /** On one eye, on both, or on the face (one side of the box). */
  anchor: "eye" | "both" | "face";
  parts: PoolPart[];
}

export interface MoodMark extends Weighted {
  /** In box coordinates, written on the right; a roll may put it on the left. */
  parts: PoolPart[];
}

export interface Quirk extends Weighted {
  moods: RolledMood[];
}

export interface RoleLean {
  /** How crooked the dials run, 1 being the full measured range. */
  crook: number;
  /** The chance a mood that has marks wears one. */
  moodMarks: number;
  colors: string[];
}

export interface Pool {
  roles: Record<Role, RoleLean>;
  screens: ScreenStyle[];
  eyes: PartStyle[];
  brows: PartStyle[];
  mouths: PartStyle[];
  marks: MarkStyle[];
  moodMarks: Partial<Record<RolledMood, MoodMark[]>>;
  quirks: Quirk[];
  /** The closed eye a wink draws, in an eye's frame. */
  wink: PoolPart[];
}

export const POOL = file as unknown as Pool;

/** One mood's quirk: which, on which side, and how strong (0 to 1). */
export interface QuirkPick {
  id: string;
  side: -1 | 1;
  amount: number;
}

/** The crookedness dials, in box units and degrees. */
export interface Dials {
  /** Middle of the eye pair, half the gap between the eyes, and the pair's height. */
  eyeX: number;
  spread: number;
  eyeY: number;
  /** How much higher the right eye sits than the left (negative: lower). */
  lift: number;
  sizeLeft: number;
  sizeRight: number;
  mouthX: number;
  mouthY: number;
  mouthSize: number;
  /** The mouth drawn mirrored, so a lopsided mouth can lean either way. */
  mouthFlip: boolean;
  /** Degrees the whole face is turned, in every mood. */
  tilt: number;
}

export interface Picks {
  role: Role;
  color: string;
  screen: string;
  eyes: string;
  brows: string;
  mouth: string;
  mark: string;
  /** The side a one-sided piece sits on: the mark and the mood marks. */
  side: "left" | "right";
  moodMarks: Partial<Record<RolledMood, string>>;
  quirks: Record<RolledMood, QuirkPick>;
  dials: Dials;
}

export interface Roll {
  seed: number;
  face: VoiceFace;
  picks: Picks;
}

/** A small seeded generator (mulberry32), apart from every other random number in the game. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A role as a number, so one seed rolls a different face for each role. */
function roleSalt(role: Role): number {
  let hash = 2166136261;
  for (const char of role) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function weighted<T extends Weighted>(list: T[], role: Role, random: () => number): T {
  const total = list.reduce((sum, item) => sum + (item.weights[role] ?? 0), 0);
  if (total <= 0) return list[0];
  let left = random() * total;
  for (const item of list) {
    left -= item.weights[role] ?? 0;
    if (left < 0 && (item.weights[role] ?? 0) > 0) return item;
  }
  return list.filter((item) => (item.weights[role] ?? 0) > 0).at(-1) ?? list[0];
}

const round = (n: number): number => Math.round(n * 100) / 100;

function hex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** `a` moved `amount` of the way towards `b`. */
function mix(a: string, b: string, amount: number): string {
  const from = hex(a);
  const to = hex(b);
  if (!from || !to) return a;
  const mixed = from.map((c, i) => Math.round(c + (to[i] - c) * amount));
  return `#${((mixed[0] << 16) | (mixed[1] << 8) | mixed[2]).toString(16).padStart(6, "0")}`;
}

const GLASS = "#0A1520";

/** Where a style is drawn: its middle, its size, and whether it is the mirrored (right) one. */
interface Frame {
  x: number;
  y: number;
  scale: number;
  flip: boolean;
  /** Degrees the whole style turns about its middle. */
  turn?: number;
}

/** Every point pair of a path through `map`; only the commands the pool uses (M L C Q S T Z). */
function mapPath(d: string, map: (point: Pt, relative: boolean) => Pt): string {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: string[] = [];
  let relative = false;
  let pending: number[] = [];
  for (const token of tokens) {
    if (/[A-Za-z]/.test(token)) {
      relative = token !== token.toUpperCase();
      out.push(token);
      continue;
    }
    pending.push(Number(token));
    if (pending.length === 2) {
      const [x, y] = map([pending[0], pending[1]], relative);
      out.push(String(round(x)), String(round(y)));
      pending = [];
    }
  }
  return out.join(" ");
}

function rotate([x, y]: Pt, degrees: number): Pt {
  if (!degrees) return [x, y];
  const a = (degrees * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

const SIZES = ["rx", "ry", "r", "inner", "half", "depth", "bow", "bow2", "amp", "round"] as const;

/**
 * A part from its style's own frame into the box: mirrored for the right side, scaled, turned
 * and moved. Stroke widths are never scaled, so a smaller eye keeps the mass the rules ask for.
 */
function place(part: PoolPart, frame: Frame, colors: Record<string, string>): Part {
  const { fixed, ...rest } = part;
  // SAFETY: a copy of the part being rewritten field by field; every field set below is one the
  // part's own kind carries.
  const out = { ...rest } as Record<string, unknown> & Part;
  const s = frame.scale;
  const turn = frame.turn ?? 0;
  const mirror = (x: number, keep = false): number => (frame.flip && !keep ? -x : x);
  const toBox = ([x, y]: Pt, keep = false): Pt => {
    const [tx, ty] = rotate([mirror(x, keep) * s, y * s], turn);
    return [round(frame.x + tx), round(frame.y + ty)];
  };
  for (const key of SIZES) {
    const value = out[key];
    if (typeof value === "number") out[key] = round(value * s);
  }
  if (frame.flip && out.kind === "arc" && out.bow2 !== undefined) [out.bow, out.bow2] = [out.bow2, out.bow];
  if (out.kind === "line") {
    out.from = toBox(out.from, fixed);
    out.to = toBox(out.to, fixed);
  } else {
    out.at = toBox(out.at ?? [0, 0], fixed);
    const rot = (frame.flip ? -(out.rot ?? 0) : out.rot ?? 0) + turn;
    if (rot) out.rot = round(rot);
    else delete out.rot;
    if (out.kind === "poly") out.points = out.points.map(([x, y]) => [round(mirror(x) * s), round(y * s)] as Pt);
    if (out.kind === "path") out.d = mapPath(out.d, ([x, y]) => [mirror(x) * s, y * s]);
  }
  if (out.color && out.color.startsWith("@")) out.color = colors[out.color] ?? undefined;
  if (out.color === undefined) delete out.color;
  return out;
}

/** A part written in box coordinates (the mood marks, a stud), put on the left or the right. */
function onSide(part: PoolPart, side: "left" | "right", colors: Record<string, string>): Part {
  // Written on the right of the box's middle; the left one is its mirror about x = 50.
  const flip = side === "left";
  const local = shift(part, -50);
  return place(local, { x: 50, y: 0, scale: 1, flip }, colors);
}

/** A box-coordinate part moved along x, so it can be mirrored about the box's middle. */
function shift(part: PoolPart, dx: number): PoolPart {
  if (part.kind === "line") return { ...part, from: [part.from[0] + dx, part.from[1]], to: [part.to[0] + dx, part.to[1]] };
  if (part.kind === "path" && !part.at) return { ...part, d: mapPath(part.d, ([x, y], relative) => [relative ? x : x + dx, y]) };
  const [x, y] = part.at ?? [0, 0];
  return { ...part, at: [x + dx, y] };
}

/** Each layer of a mood, in box coordinates, before the quirk. */
interface Layers {
  eyes: Part[];
  brows: Part[];
  mouth: Part[];
  marks: Part[];
  tilt: number;
}

/**
 * Rolls one whole face for a role. The same seed and role always give the same face, and a
 * change to the pool can change future rolls but never a face already kept, which is stored
 * resolved.
 */
export function rollFace(seed: number, role: Role, pool: Pool = POOL): Roll {
  const random = seeded((seed ^ roleSalt(role)) >>> 0);
  const between = (low: number, high: number): number => low + random() * (high - low);
  const sign = (): -1 | 1 => (random() < 0.5 ? -1 : 1);
  const lean = pool.roles[role];
  const c = lean.crook;

  const color = lean.colors[Math.floor(random() * lean.colors.length)];
  const screen = weighted(pool.screens, role, random);
  const eyes = weighted(pool.eyes, role, random);
  const brows = weighted(pool.brows, role, random);
  const mouth = weighted(pool.mouths, role, random);
  const mark = weighted(pool.marks, role, random);
  const side = random() < 0.5 ? "left" : "right";

  const bigger = 1 + between(0.1, 0.3) * c;
  const base = between(0.92, 1.12);
  const leftBigger = random() < 0.5;
  const dials: Dials = {
    eyeX: round(50 + between(-1.5, 1.5) * c),
    spread: round(between(14, 18)),
    eyeY: round(between(24, 27.5)),
    lift: round(between(1, 3) * c * sign()),
    sizeLeft: round(leftBigger ? base * bigger : base),
    sizeRight: round(leftBigger ? base : base * bigger),
    mouthX: round(50 + between(-4, 6) * c),
    mouthY: round(between(46, 49.5)),
    mouthSize: round(between(0.92, 1.12)),
    mouthFlip: random() < 0.5,
    tilt: round(between(-3, 3) * c),
  };

  const moodMarks: Partial<Record<RolledMood, string>> = {};
  const quirks = {} as Record<RolledMood, QuirkPick>;
  for (const mood of ROLLED_MOODS) {
    const marks = (pool.moodMarks[mood] ?? []).filter((m) => (m.weights[role] ?? 0) > 0);
    if (marks.length > 0 && random() < lean.moodMarks) moodMarks[mood] = weighted(marks, role, random).id;
    const fits = pool.quirks.filter(
      (q) => (q.weights[role] ?? 0) > 0 && q.moods.includes(mood) && (q.id !== "brow" || brows.moods[mood]?.length),
    );
    const quirk = fits.length > 0 ? weighted(fits, role, random).id : "none";
    quirks[mood] = { id: quirk, side: sign(), amount: round(random()) };
  }

  const picks: Picks = {
    role,
    color,
    screen: screen.id,
    eyes: eyes.id,
    brows: brows.id,
    mouth: mouth.id,
    mark: mark.id,
    side,
    moodMarks,
    quirks,
    dials,
  };
  return { seed, face: build(picks, pool), picks };
}

/**
 * The face a set of picks draws, resolved into the layers the renderer reads. Kept apart from
 * the roll so the page can show what a pick changes without rolling again.
 */
export function build(picks: Picks, pool: Pool = POOL): VoiceFace {
  const find = <T extends Weighted>(list: T[], id: string): T => list.find((item) => item.id === id) ?? list[0];
  const screen = find(pool.screens, picks.screen);
  const eyes = find(pool.eyes, picks.eyes);
  const brows = find(pool.brows, picks.brows);
  const mouth = find(pool.mouths, picks.mouth);
  const mark = find(pool.marks, picks.mark);
  const d = picks.dials;
  const glass = screen.screen.color ?? GLASS;
  const colors = { "@pale": mix(picks.color, "#FFFFFF", 0.6), "@dim": mix(picks.color, glass, 0.5) };

  const eyeFrame = (right: boolean, scale = 1, raise = 0): Frame => ({
    x: d.eyeX + (right ? d.spread : -d.spread),
    y: d.eyeY + (right ? -d.lift / 2 : d.lift / 2) - raise,
    scale: (right ? d.sizeRight : d.sizeLeft) * scale,
    flip: right,
  });
  const both = (parts: PoolPart[] | undefined, left: Frame, right: Frame): Part[] =>
    parts ? [...parts.map((p) => place(p, left, colors)), ...parts.map((p) => place(p, right, colors))] : [];

  const over: Part[] = [];
  if (mark.anchor === "face") over.push(...mark.parts.map((p) => onSide(p, picks.side, colors)));
  else if (mark.anchor === "both") over.push(...both(mark.parts, eyeFrame(false), eyeFrame(true)));
  else over.push(...mark.parts.map((p) => place(p, eyeFrame(picks.side === "right"), colors)));

  const moods: Partial<Record<RolledMood, MoodFace>> = {};
  for (const mood of ROLLED_MOODS) {
    const quirk = picks.quirks[mood] ?? { id: "none", side: 1, amount: 0 };
    const right = quirk.side === 1;
    const squint = quirk.id === "squint" ? 0.8 : 1;
    const raise = quirk.id === "brow" ? 3 + quirk.amount * 1.5 : 0;
    const left = eyeFrame(false, !right ? squint : 1);
    const rightFrame = eyeFrame(true, right ? squint : 1);
    let eyeParts = both(eyes.moods[mood], left, rightFrame);
    if (quirk.id === "wink") {
      const kept = (eyes.moods[mood] ?? []).map((p) => place(p, right ? left : rightFrame, colors));
      const closed = pool.wink.map((p) => place(p, right ? rightFrame : left, colors));
      eyeParts = right ? [...kept, ...closed] : [...closed, ...kept];
    }
    const browParts = both(
      brows.moods[mood],
      eyeFrame(false, 1, !right ? raise : 0),
      eyeFrame(true, 1, right ? raise : 0),
    );
    const lopsided = quirk.id === "lopsided";
    const mouthParts = (mouth.moods[mood] ?? []).map((p) =>
      place(p, {
        x: d.mouthX + (lopsided ? quirk.side * 2 : 0),
        y: d.mouthY,
        scale: d.mouthSize,
        flip: d.mouthFlip,
        turn: lopsided ? quirk.side * (4 + quirk.amount * 4) : 0,
      }, colors),
    );
    const marked = picks.moodMarks[mood];
    const moodMark = marked ? (pool.moodMarks[mood] ?? []).find((m) => m.id === marked) : undefined;
    const markParts = moodMark ? moodMark.parts.map((p) => onSide(p, picks.side === "left" ? "right" : "left", colors)) : [];
    let tilt = d.tilt;
    if (mood === "scared") tilt += 3 * (d.tilt < 0 ? -1 : 1);
    if (quirk.id === "lean") tilt += quirk.side * (2 + quirk.amount * 1.5);
    const layers: Layers = { eyes: eyeParts, brows: browParts, mouth: mouthParts, marks: markParts, tilt: round(tilt) };
    const face: MoodFace = { eyes: layers.eyes, mouth: layers.mouth };
    if (layers.brows.length > 0) face.brows = layers.brows;
    if (layers.marks.length > 0) face.marks = layers.marks;
    if (layers.tilt) face.tilt = layers.tilt;
    moods[mood] = face;
  }

  const face: VoiceFace = { color: picks.color, moods };
  if (Object.keys(screen.screen).length > 0) face.screen = { ...screen.screen };
  const under = (screen.under ?? []).map((p) => place(p, { x: 0, y: 0, scale: 1, flip: false }, colors));
  if (under.length > 0 || over.length > 0) {
    face.identity = {};
    if (under.length > 0) face.identity.under = under;
    if (over.length > 0) face.identity.over = over;
  }
  return face;
}
