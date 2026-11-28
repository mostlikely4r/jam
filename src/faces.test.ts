import { describe, expect, it, vi } from "vitest";
// SAFETY: the file is the data under test; the test walks it as unknown parts and checks them.
import file from "./voices.json";
import {
  FACE_BOX,
  MOODS,
  VOICES,
  faceFor,
  renderFaceSvg,
  swayFor,
  type FaceFile,
  type Mood,
  type MoodFace,
  type Part,
  type Voice,
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

  it("draws the same markup twice, at the size it was asked for", () => {    const once = renderFaceSvg("gus", "neutral", { size: 60 });
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

describe("the nod a face sways with", () => {
  it("has one for every voice, in numbers the box can hold", () => {
    for (const voice of VOICES) {
      const nod = swayFor(voice);
      expect(nod.every, `${voice} every`).toBeGreaterThanOrEqual(1);
      expect(nod.every, `${voice} every`).toBeLessThanOrEqual(8);
      expect(["still", "tilt", "yaw", "pitch"], `${voice} kind`).toContain(nod.kind);
      expect(Math.abs(nod.amount), `${voice} amount`).toBeLessThanOrEqual(FACE_BOX.h / 4);
      expect(nod.turn ?? 0, `${voice} turn`).toBeGreaterThanOrEqual(0);
      expect(nod.turn ?? 0, `${voice} turn`).toBeLessThanOrEqual(0.5);
    }
  });

  it("turns the regulars different ways, and leaves the station still", () => {
    // The character is what the nod says: Gus up and down, Pip left and right.
    expect(swayFor("gus").kind).toBe("pitch");
    expect(swayFor("pip").kind).toBe("yaw");
    expect(swayFor("station").kind).toBe("still");
    expect(swayFor("station").amount).toBe(0);
  });

  it("is the voice's own when the file wrote one", () => {
    expect(swayFor("gus")).toEqual(DATA.gus.sway);
    expect(swayFor("pip")).toEqual(DATA.pip.sway);
    // A regular and plain traffic don't nod alike: the character is what the nod says.
    expect(swayFor("gus")).not.toEqual(swayFor("generic"));
  });

  it("falls back to the generic nod for a voice the file doesn't have", () => {
    // SAFETY: a voice the file doesn't have is exactly the fallback under test.
    expect(swayFor("nosuchvoice" as Voice)).toEqual(DATA.generic.sway);
    expect(swayFor("nosuchvoice" as Voice)).toEqual(swayFor("generic"));
  });
});

describe("kept faces from src/cast.json", () => {
  it("resolve and draw like a voice, and a missing id falls back to the generic face", async () => {
    const { rollFace } = await import("./face-pool");
    const roll = rollFace(7, "pirate");
    const entry = { id: "pirate-7", role: "pirate", status: "kept", face: roll.face, sway: { every: 2, kind: "yaw", amount: 3 }, from: { seed: 7, picks: roll.picks } };
    vi.resetModules();
    vi.doMock("./cast.json", () => ({ default: [entry] }));
    try {
      const faces = await import("./faces");
      expect(faces.CAST.map((e) => e.id)).toEqual(["pirate-7"]);
      const face = faces.faceFor("pirate-7", "annoyed");
      expect(face).toEqual(faces.resolveFace("pirate-7", roll.face, "annoyed"));
      expect(face.color).toBe(roll.face.color);
      expect(face.eyes).toEqual(roll.face.moods.annoyed!.eyes);
      expect(faces.swayFor("pirate-7")).toEqual(entry.sway);
      const markup = faces.renderFaceSvg("pirate-7", "angry", { size: 26 });
      expect(markup).toBe(faces.renderFace(faces.resolveFace("pirate-7", roll.face, "angry"), { size: 26 }));
      expect(markup).not.toContain("NaN");
      // An id no file holds wears the generic face, mood by mood.
      expect(faces.faceFor("nobody-kept", "scared").eyes).toEqual(faces.faceFor("generic", "scared").eyes);
      // And a kept id never takes over a hand-written voice.
      expect(faces.faceFor("gus", "neutral")).toEqual(faceFor("gus", "neutral"));
    } finally {
      vi.doUnmock("./cast.json");
      vi.resetModules();
    }
  });
});
