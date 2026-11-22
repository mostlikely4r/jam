import { describe, expect, it } from "vitest";
// SAFETY: the file is the data under test; the test walks it as unknown parts and checks them.
import file from "./voices.json";
import {
  FACE_BOX,
  MOODS,
  VOICES,
  faceFor,
  renderFaceSvg,
  type FaceFile,
  type Mood,
  type MoodFace,
  type Part,
} from "./faces";

const DATA = file as unknown as FaceFile;

const LAYERS = ["eyes", "brows", "mouth", "marks"] as const;

/** Every mood face in the file, with where it came from, for the data checks. */
function everyMood(walk: (voice: string, mood: Mood, face: MoodFace) => void): void {
  for (const [voice, pack] of Object.entries(DATA)) {
    for (const [mood, face] of Object.entries(pack.face.moods)) walk(voice, mood as Mood, face);
  }
}

/** Every part in a face, with its layers, so a misplaced coordinate can be named. */
function everyPart(face: MoodFace): Part[] {
  return LAYERS.flatMap((layer) => face[layer] ?? []);
}

describe("faces", () => {
  it("resolves every voice at every mood, with eyes and a mouth", () => {
    for (const voice of VOICES) {
      for (const mood of MOODS) {
        const face = faceFor(voice, mood);
        expect(face.eyes.length, `${voice} ${mood} eyes`).toBeGreaterThan(0);
        expect(face.mouth.length, `${voice} ${mood} mouth`).toBeGreaterThan(0);
        expect(face.color, `${voice} ${mood} colour`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(face.screen.radius).toBeGreaterThan(0);
      }
    }
  });

  it("keeps a regular's identity layers the same in every mood", () => {
    for (const voice of ["gus", "pip"] as const) {
      const first = faceFor(voice, "neutral");
      for (const mood of MOODS) {
        const face = faceFor(voice, mood);
        expect(face.over, `${voice} ${mood} over`).toEqual(first.over);
        expect(face.under, `${voice} ${mood} under`).toEqual(first.under);
      }
      expect(first.over.length, `${voice} has an identity mark`).toBeGreaterThan(0);
    }
  });

  it("lets a voice's own layer beat the generic one", () => {
    const gus = DATA.gus.face.moods;
    expect(faceFor("gus", "happy").eyes).toEqual(gus.happy!.eyes);
    expect(faceFor("gus", "happy").eyes).not.toEqual(DATA.generic.face.moods.happy!.eyes);
    expect(faceFor("gus", "neutral").mouth).toEqual(gus.neutral!.mouth);
  });

  it("falls back to the generic face's mood before its own neutral one", () => {
    // The station wrote only a neutral face, so its scared face is the generic scared one, not
    // its own calm eyes with a scared mouth bolted on.
    expect(faceFor("station", "scared").eyes).toEqual(DATA.generic.face.moods.scared!.eyes);
    expect(faceFor("station", "scared").eyes).not.toEqual(DATA.station.face.moods.neutral!.eyes);
    // Where the generic has nothing either, the voice's own nearest mood answers.
    expect(faceFor("gus", "tired").eyes).toEqual(DATA.gus.face.moods.neutral!.eyes);
    expect(faceFor("gus", "tired").mouth).toEqual(DATA.gus.face.moods.neutral!.mouth);
  });

  it("walks the mood fallbacks the user called out", () => {
    // angry reads as annoyed before it reads as plain
    expect(faceFor("gus", "angry").mouth).toEqual(DATA.gus.face.moods.annoyed!.mouth);
    expect(faceFor("station", "angry").eyes).toEqual(DATA.generic.face.moods.annoyed!.eyes);
    // and a voice with nothing for it gets the plain face
    expect(faceFor("station", "tired").eyes).toEqual(DATA.station.face.moods.neutral!.eyes);
  });

  it("draws the same markup twice, at the size it was asked for", () => {
    const once = renderFaceSvg("gus", "neutral", { size: 60 });
    expect(renderFaceSvg("gus", "neutral", { size: 60 })).toBe(once);
    expect(once).toContain('height="60"');
    expect(once).toContain('viewBox="0 0 100 66"');
    // The width follows the box, so a face is never stretched.
    expect(once).toContain(`width="${Math.round((60 * FACE_BOX.w * 100) / FACE_BOX.h) / 100}"`);
    expect(renderFaceSvg("gus", "neutral", { size: 60, grade: 1 })).not.toBe(once);
  });

  it("draws every voice at every mood with no broken numbers", () => {
    for (const voice of VOICES) {
      for (const mood of MOODS) {
        for (const grade of [1, 2, 3] as const) {
          const markup = renderFaceSvg(voice, mood, { grade });
          expect(markup, `${voice} ${mood} ${grade}`).not.toContain("undefined");
          expect(markup, `${voice} ${mood} ${grade}`).not.toContain("NaN");
          expect(markup.startsWith("<svg")).toBe(true);
        }
      }
    }
  });

  it("keeps every part's numbers inside the box it is drawn in", () => {
    everyMood((voice, mood, face) => {
      for (const part of everyPart(face)) {
        const points = [
          ...(part.at ? [part.at] : []),
          ...("from" in part ? [part.from, part.to] : []),
          ...("points" in part ? part.points : []),
        ];
        for (const [x, y] of points) {
          const where = `${voice} ${mood} ${part.kind} ${x},${y}`;
          expect(Number.isFinite(x), where).toBe(true);
          expect(x).toBeGreaterThanOrEqual(-15);
          expect(x).toBeLessThanOrEqual(FACE_BOX.w + 15);
          expect(y).toBeGreaterThanOrEqual(-15);
          expect(y).toBeLessThanOrEqual(FACE_BOX.h + 15);
        }
      }
    });
  });

  it("gives every face a mass: a filled shape or a stroke thick enough to read at 26px", () => {
    /** How far across a part is, in box units: a stroke's width, or a shape's narrower side. */
    const mass = (part: Part): number => {
      const width = (part as { w?: number }).w;
      if (width !== undefined) return width;
      switch (part.kind) {
        case "dot":
          return part.r * 2;
        case "oval":
          return Math.min(part.rx, part.ry) * 2;
        case "disc":
        case "cap":
        case "square":
          return Math.min(part.half, part.depth) * 2;
        case "star":
          return part.r;
        default:
          // A hand-drawn mouth or mark is as wide as the face, by authorship.
          return 6;
      }
    };
    for (const voice of VOICES) {
      for (const mood of MOODS) {
        const face = faceFor(voice, mood);
        const parts = [...face.eyes, ...face.brows, ...face.mouth, ...face.marks];
        const heaviest = Math.max(...parts.map(mass));
        expect(heaviest, `${voice} ${mood} has a mass`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
