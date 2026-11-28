// SAFETY: the files are hand-authored (voices) and page-written (cast) data checked by
// faces.test.ts, which walks every voice and kept face at every mood and reads every part; the
// types below are the shapes they are written to.
import file from "./voices.json";
import castFile from "./cast.json";
import { DEFAULT_NOD, type Nod } from "./sway";

/**
 * Faces: the glowing picture a radio line puts before its name.
 *
 * A face is three layers, bottom to top: the dark screen, the identity marks a regular always
 * carries, and the mood's eyes, brows, mouth and marks. Identity is fixed per voice, so a regular
 * is recognised before the mood is read; the mood comes from what really happened.
 *
 * Shapes live in a 100 x 66 box. A part is a named shape with numbers, which is what can be
 * tuned, or a raw path for the one-off shape nothing else shares. Every shape that isn't a hole
 * is drawn twice, a wide faint copy under the crisp one, so the lines glow without an SVG filter.
 *
 * Pure: `faceFor` resolves the layers and `renderFaceSvg` turns them into markup. No DOM, no
 * clock, so the same call gives the same face.
 */

export type Pt = [number, number];

/**
 * Who a face belongs to: a hand-written voice in `src/voices.json`, or the id of a kept face in
 * `src/cast.json`. An id neither file has wears the generic face.
 */
export type Voice = "gus" | "pip" | "generic" | "station" | (string & {});
/** The hand-written voices. */
export const VOICES: Voice[] = ["gus", "pip", "generic", "station"];

/** What a cast member is for: the role a face is rolled for, which it keeps once kept. */
export type Role = "traffic" | "defender" | "pirate" | "station";

/** A face kept from the pool (docs/face-cast-plan.md), stored resolved with where it came from. */
export interface CastEntry {
  id: string;
  role: Role;
  status: "kept";
  face: VoiceFace;
  sway: Nod;
  /** The seed and the picks it was rolled from, so the roll can be read back or rolled again. */
  from: { seed: number; picks: unknown };
}

export type Mood = "neutral" | "happy" | "annoyed" | "tired" | "scared" | "angry";
export const MOODS: Mood[] = ["neutral", "happy", "annoyed", "tired", "scared", "angry"];

/** The box every face is drawn in, which the viewBox and the default size follow. */
export const FACE_BOX = { w: 100, h: 66 };

/**
 * How a mood falls back when a voice has nothing for it. Only the two the user called out are
 * special: angry reads as annoyed before it reads as plain, and tired as plain.
 */
const MOOD_CHAIN: Record<Mood, Mood[]> = {
  neutral: ["neutral"],
  happy: ["happy", "neutral"],
  annoyed: ["annoyed", "neutral"],
  tired: ["tired", "neutral"],
  scared: ["scared", "neutral"],
  angry: ["angry", "annoyed", "neutral"],
};

/** Everything a part may carry: where it sits, whether it turns, and a colour of its own. */
interface Placed {
  /** Middle of the shape in the box. Lines carry their own ends instead. */
  at?: Pt;
  /** Degrees clockwise. */
  rot?: number;
  /** Overrides the voice's colour, for marks with a colour of their own. */
  color?: string;
  /** Draws it in the screen's colour, cutting a hole: a glint, or the gap that makes a fang. */
  cut?: boolean;
}

/**
 * The shape vocabulary. Eighths are numbers in the box, `w` is a stroke width; everything with a
 * `w` is stroked and everything without it is filled.
 */
export type Part =
  | (Placed & { kind: "line"; from: Pt; to: Pt; w: number })
  /** A bowed stroke between two ends: a mouth, or a caret eye when both bows point up. */
  | (Placed & { kind: "arc"; half: number; bow: number; bow2?: number; w: number })
  /** A run of little waves: the wobbly mouth of somebody scared or confused. */
  | (Placed & { kind: "squiggle"; half: number; humps: number; amp: number; w: number })
  /** A ring, or a squashed one. Its hole is the eye of the shocked. */
  | (Placed & { kind: "ring"; rx: number; ry?: number; w: number })
  | (Placed & { kind: "oval"; rx: number; ry: number })
  /** Flat top, round bottom: the half-lidded eye, and a grin's solid mass. */
  | (Placed & { kind: "disc"; half: number; depth: number })
  /** Flat bottom, round top: a dome, a tongue, an open happy mouth. */
  | (Placed & { kind: "cap"; half: number; depth: number })
  | (Placed & { kind: "star"; r: number; inner?: number })
  /** A rounded square: the plain eye generic traffic gets, and a screen's bezel when stroked. */
  | (Placed & { kind: "square"; half: number; depth: number; round?: number; w?: number })
  | (Placed & { kind: "dot"; r: number })
  | (Placed & { kind: "poly"; points: Pt[] })
  /** The escape hatch: hand-drawn data, filled when it has no `w`. */
  | (Placed & { kind: "path"; d: string; w?: number });

export interface Screen {
  /** The screen's own colour, which holes are cut in. */
  color: string;
  /** The lighter middle, and the darker edge, of the glass. */
  middle: string;
  edge: string;
  /** The faint line of the rim. */
  rim: string;
  /** Corner radius: the station's screen is squarer than a regular's. */
  radius: number;
}

/** One mood's layers. Anything missing falls back, layer by layer. */
export interface MoodFace {
  /** Degrees the whole face is turned, the crookedness that keeps it from looking like a chart. */
  tilt?: number;
  eyes?: Part[];
  brows?: Part[];
  mouth?: Part[];
  marks?: Part[];
}

export interface VoiceFace {
  color: string;
  screen?: Partial<Screen>;
  identity?: { under?: Part[]; over?: Part[] };
  moods: Partial<Record<Mood, MoodFace>>;
}

export interface FaceFile {
  [voice: string]: { face: VoiceFace; sway?: Nod };
}

/** The kept faces, as the page last saved them. */
export const CAST = castFile as unknown as CastEntry[];

/**
 * Every face by who wears it: the hand-written voices, then the kept faces. A kept id never
 * takes over a hand-written voice's name.
 */
const DATA: FaceFile = { ...(file as unknown as FaceFile) };
for (const entry of CAST) DATA[entry.id] ??= { face: entry.face, sway: entry.sway };

const SCREEN: Screen = { color: "#0A1520", middle: "#16293C", edge: "#070D16", rim: "#2A4A66", radius: 10 };

/**
 * The nod a voice sways with: its own, else the generic voice's, else the built-in one. Something
 * to sway with is always found, so a new voice moves before anyone writes a nod for it.
 */
export function swayFor(voice: Voice): Nod {
  return DATA[voice]?.sway ?? DATA.generic?.sway ?? DEFAULT_NOD;
}

function faceOf(voice: Voice): VoiceFace | undefined {
  return DATA[voice]?.face;
}

/** The generic face every missing layer comes from. */
function genericFace(): VoiceFace {
  return DATA.generic?.face ?? { color: "#4FE3F0", moods: {} };
}

/** A mood layer that holds parts, as opposed to the face's own `tilt`. */
type LayerName = "eyes" | "brows" | "mouth" | "marks";

/**
 * The first of `chain` that has a layer for it: on each rung the voice's own parts win over the
 * generic voice's, so a voice that wrote only a neutral face still wears the generic scared eyes
 * rather than its own neutral ones.
 */
function pick(face: VoiceFace | undefined, chain: Mood[], layer: LayerName): Part[] | undefined {
  for (const mood of chain) {
    const parts = own(face, mood, layer) ?? own(faceOf("generic"), mood, layer);
    if (parts) return parts;
  }
  return undefined;
}

function own(face: VoiceFace | undefined, mood: Mood, layer: LayerName): Part[] | undefined {
  const parts = face?.moods[mood]?.[layer];
  return parts && parts.length > 0 ? parts : undefined;
}

export interface Face {
  voice: Voice;
  mood: Mood;
  color: string;
  screen: Screen;
  under: Part[];
  eyes: Part[];
  brows: Part[];
  mouth: Part[];
  over: Part[];
  marks: Part[];
  tilt: number;
}

/**
 * The face a voice wears in a mood, every layer resolved: the voice's own layer for the nearest
 * mood it has, else the generic voice's, with the identity layers always the voice's own.
 */
export function faceFor(voice: Voice, mood: Mood): Face {
  return resolveFace(voice, faceOf(voice), mood);
}

/**
 * A face that no file holds yet resolved the same way, layer by layer: a roll on the dev page
 * before it is kept. `voice` only names it.
 */
export function resolveFace(voice: Voice, own: VoiceFace | undefined, mood: Mood): Face {
  const chain = MOOD_CHAIN[mood];
  let tilt = 0;
  if (own) for (const m of chain) if (own.moods[m]?.tilt !== undefined) { tilt = own.moods[m]!.tilt!; break; }
  return {
    voice,
    mood,
    color: own?.color ?? genericFace().color,
    screen: { ...SCREEN, ...own?.screen },
    under: own?.identity?.under ?? [],
    eyes: pick(own, chain, "eyes") ?? [],
    brows: pick(own, chain, "brows") ?? [],
    mouth: pick(own, chain, "mouth") ?? [],
    over: own?.identity?.over ?? [],
    marks: pick(own, chain, "marks") ?? [],
    tilt,
  };
}

/**
 * How much of the look a face is drawn with, for comparing the jumps the reference makes:
 * `1` is `^_^` grade (outlines only, thin, straight, no marks), `2` adds mass, `3` adds the
 * crookedness and the mood marks.
 */
export type Grade = 1 | 2 | 3;

export interface FaceRender {
  /** Height in pixels. The width follows the box. */
  size?: number;
  grade?: Grade;
  /** A stable id seed, so two faces on one page don't share a gradient. */
  seed?: string;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * A shape's paint. A stroked shape keeps the width it was given; a filled one is filled. Grade 1
 * outlines everything thinly, which is `^_^` grade. A glow copy is the shape's outline at over
 * `glow` times the width, so a filled shape glows outside its edge and not through it.
 */
function paint(part: Part, grade: Grade, glowWidth: number | null): string {
  const caps = ` stroke-linecap="round" stroke-linejoin="round"`;
  const authored = (part as { w?: number }).w;
  if (grade === 1) return ` fill="none" stroke="currentColor" stroke-width="2.2"${caps}`;
  if (glowWidth !== null) return ` fill="none" stroke="currentColor" stroke-width="${round(glowWidth)}"${caps}`;
  if (authored !== undefined) return ` fill="none" stroke="currentColor" stroke-width="${round(authored)}"${caps}`;
  return ` fill="currentColor"`;
}

/** A colour mixed towards white, for the bloom: a glow brighter than the screen, never darker. */
function lighten(hex: string, amount: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${((mix((value >> 16) & 255) << 16) | (mix((value >> 8) & 255) << 8) | mix(value & 255)).toString(16).padStart(6, "0")}`;
}

/** One shape's geometry, in the shape's own frame (its middle at 0,0). */
function geometry(part: Part, attrs: string): string {
  switch (part.kind) {
    case "line":
      return `<path d="M ${part.from[0]} ${part.from[1]} L ${part.to[0]} ${part.to[1]}"${attrs}/>`;
    case "arc": {
      const { half, bow } = part;
      const bow2 = part.bow2 ?? bow;
      return `<path d="M ${-half} 0 C ${round(-half / 2)} ${round(-bow)} ${round(half / 2)} ${round(-bow2)} ${half} 0"${attrs}/>`;
    }
    case "squiggle": {
      const step = round((part.half * 2) / part.humps);
      let d = `M ${-part.half} 0`;
      for (let i = 0; i < part.humps; i++) {
        const up = i % 2 === 0 ? -part.amp : part.amp;
        d += ` q ${round(step / 2)} ${round(up)} ${step} 0`;
      }
      return `<path d="${d}"${attrs}/>`;
    }
    case "ring":
      return `<ellipse cx="0" cy="0" rx="${part.rx}" ry="${part.ry ?? part.rx}"${attrs}/>`;
    case "oval":
      return `<ellipse cx="0" cy="0" rx="${part.rx}" ry="${part.ry}"${attrs}/>`;
    case "disc":
      // Flat along the top, bulging down: the lid that makes a half-closed eye.
      return `<path d="M ${-part.half} 0 C ${round(-part.half)} ${round(part.depth * 1.1)} ${round(part.half)} ${round(part.depth * 1.1)} ${part.half} 0 Z"${attrs}/>`;
    case "cap":
      return `<path d="M ${-part.half} 0 C ${round(-part.half)} ${round(-part.depth * 1.1)} ${round(part.half)} ${round(-part.depth * 1.1)} ${part.half} 0 Z"${attrs}/>`;
    case "star": {
      const inner = part.inner ?? part.r * 0.3;
      const points: string[] = [];
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? part.r : inner;
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        points.push(`${round(Math.cos(a) * r)} ${round(Math.sin(a) * r)}`);
      }
      return `<polygon points="${points.join(" ")}"${attrs}/>`;
    }
    case "square":
      return `<rect x="${-part.half}" y="${-part.depth}" width="${round(part.half * 2)}" height="${round(part.depth * 2)}" rx="${part.round ?? 3}"${attrs}/>`;
    case "dot":
      return `<circle cx="0" cy="0" r="${part.r}"${attrs}/>`;
    case "poly":
      return `<polygon points="${part.points.map(([x, y]) => `${x} ${y}`).join(" ")}"${attrs}/>`;
    case "path":
      return `<path d="${part.d}"${attrs}/>`;
  }
}

function partSvg(part: Part, face: Face, grade: Grade, glowWidth: number | null = null): string {
  const base = part.cut ? face.screen.color : part.color ?? face.color;
  const color = glowWidth === null || part.cut ? base : lighten(base, 0.35);
  const turn = part.rot ? ` rotate(${part.rot})` : "";
  let transform = "";
  if (part.kind === "line") {
    if (part.rot) transform = ` transform="rotate(${part.rot} ${part.from[0]} ${part.from[1]})"`;
  } else {
    const [x, y] = part.at ?? [0, 0];
    if (x !== 0 || y !== 0 || part.rot) transform = ` transform="translate(${x} ${y})${turn}"`;
  }
  return `<g${transform} color="${color}">${geometry(part, paint(part, grade, glowWidth))}</g>`;
}

/**
 * One layer's markup. At grade 2 and 3 every shape gets two faint copies under it, one wide and
 * one narrow, which reads as a glow without an SVG filter. A filled shape glows from its edge,
 * so its halo is kept narrow: a fixed width wide enough to bloom would swallow a small mouth.
 */
function layer(parts: Part[], face: Face, grade: Grade): string {
  return parts
    .map((part) => {
      const crisp = partSvg(part, face, grade);
      if (grade === 1 || part.cut) return crisp;
      const authored = (part as { w?: number }).w;
      const wide = authored !== undefined ? authored * 2.8 : 4.2;
      const tight = authored !== undefined ? authored * 1.6 : 2.2;
      return (
        `<g opacity="0.16">${partSvg(part, face, grade, wide)}</g>` +
        `<g opacity="0.34">${partSvg(part, face, grade, tight)}</g>` +
        crisp
      );
    })
    .join("");
}

/** A resolved face as inline SVG, for a gallery trying shapes out that no voice has yet. */
export function renderFace(face: Face, render: FaceRender = {}): string {
  const grade = render.grade ?? 3;
  const size = render.size ?? 30;
  const width = round((size * FACE_BOX.w) / FACE_BOX.h);
  const screen = face.screen;
  const id = `face-${render.seed ?? `${face.voice}-${face.mood}-${grade}-${size}`}`;
  const tilt = grade === 1 ? 0 : face.tilt;
  const open = tilt ? `<g transform="rotate(${tilt} 50 33)">` : "";
  const close = tilt ? "</g>" : "";
  const glass =
    `<rect width="${FACE_BOX.w}" height="${FACE_BOX.h}" rx="${screen.radius}" fill="url(#${id})"/>` +
    `<rect x="0.75" y="0.75" width="${round(FACE_BOX.w - 1.5)}" height="${round(FACE_BOX.h - 1.5)}" rx="${round(screen.radius - 0.75)}" fill="none" stroke="${screen.rim}" stroke-width="1.2" opacity="0.55"/>`;
  const body = [
    glass,
    // Everything but the glass, in one group: the sway moves this, so the face turns inside its
    // screen and the screen itself stays where it is.
    `<g class="features">`,
    layer(face.under, face, grade),
    open,
    layer(face.eyes, face, grade),
    layer(face.brows, face, grade),
    layer(face.mouth, face, grade),
    layer(face.over, face, grade),
    layer(face.marks, face, grade),
    close,
    `</g>`,
  ].join("");
  const defs =
    `<defs><radialGradient id="${id}" cx="50%" cy="45%" r="70%">` +
    `<stop offset="0" stop-color="${screen.middle}"/><stop offset="1" stop-color="${screen.edge}"/>` +
    `</radialGradient></defs>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FACE_BOX.w} ${FACE_BOX.h}" width="${width}" height="${size}"` +
    ` style="color:${face.color}">${defs}${body}</svg>`
  );
}

/**
 * A voice's face as inline SVG. `size` is its height in pixels, so a face is as tall as it is asked
 * to be, and the same call always gives the same markup.
 */
export function renderFaceSvg(voice: Voice, mood: Mood, render: FaceRender = {}): string {
  return renderFace(faceFor(voice, mood), render);
}
