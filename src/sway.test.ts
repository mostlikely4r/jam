import { describe, expect, it } from "vitest";
import {
  DEFAULT_BPM,
  DEFAULT_NOD,
  MAX_BPM,
  MIN_BPM,
  accentAt,
  clampBpm,
  cycleSeconds,
  phaseAt,
  poseTransform,
  swayAt,
  type Nod,
} from "./sway";

const gus: Nod = { every: 2, kind: "pitch", amount: 4.5, turn: 0.1 };
const pip: Nod = { every: 1, kind: "yaw", amount: 5, turn: 0.12 };
const generic: Nod = { every: 1, kind: "tilt", amount: 2.2 };
const station: Nod = { every: 4, kind: "still", amount: 0 };

/** Where the accent peaks in a nod, which is where the motion is deepest. */
const ACCENT = 0.5 ** (1 / 0.7) / 2;

describe("sway", () => {
  it("nods once every `every` beats", () => {
    expect(cycleSeconds(pip, 120)).toBeCloseTo(0.5, 10);
    expect(cycleSeconds(gus, 120)).toBeCloseTo(1, 10);
    expect(cycleSeconds(DEFAULT_NOD, 60)).toBeCloseTo(1, 10);
  });

  it("repeats exactly, one nod later", () => {
    for (const nod of [gus, pip, generic]) {
      const cycle = cycleSeconds(nod, 103);
      for (const at of [0.1, 3.3, 91.7]) {
        const once = swayAt(nod, 103, at);
        const later = swayAt(nod, 103, at + cycle);
        expect(later.dx).toBeCloseTo(once.dx, 9);
        expect(later.dy).toBeCloseTo(once.dy, 9);
        expect(later.rotate).toBeCloseTo(once.rotate, 9);
        expect(later.sx).toBeCloseTo(once.sx, 9);
        expect(later.sy).toBeCloseTo(once.sy, 9);
      }
    }
  });

  it("turns a head left and right, and squashes it as it turns", () => {
    const cycle = cycleSeconds(pip, 120);
    const right = swayAt(pip, 120, cycle * ACCENT);
    const left = swayAt(pip, 120, cycle * (0.5 + ACCENT));
    expect(right.dx).toBeGreaterThan(0);
    expect(left.dx).toBeLessThan(0);
    // The other way is as far, which is what makes it a turn and not a lean.
    expect(right.dx).toBeCloseTo(-left.dx, 6);
    expect(right.sx).toBeLessThan(1);
    expect(left.sx).toBeLessThan(1);
    expect(right.dx).toBeLessThanOrEqual(pip.amount);
    expect(right.sx).toBeGreaterThanOrEqual(1 - (pip.turn ?? 0) - 1e-9);
  });

  it("bobs a head down and back up, squashing as it goes", () => {
    const cycle = cycleSeconds(gus, 120);
    const down = swayAt(gus, 120, cycle * ACCENT);
    const up = swayAt(gus, 120, cycle * (0.5 + ACCENT));
    expect(swayAt(gus, 120, 0).dy).toBeCloseTo(0, 10);
    expect(down.dy).toBeGreaterThan(0);
    expect(up.dy).toBeLessThan(0);
    expect(down.dy).toBeCloseTo(-up.dy, 6);
    expect(down.dy).toBeLessThanOrEqual(gus.amount);
    expect(down.sy).toBeLessThan(1);
    expect(up.sy).toBeLessThan(1);
    expect(up.sy).toBeGreaterThanOrEqual(1 - (gus.turn ?? 0) - 1e-9);
  });

  it("rolls the plain traffic, and leaves the station alone", () => {
    const cycle = cycleSeconds(generic, 100);
    expect(Math.abs(swayAt(generic, 100, cycle * ACCENT).rotate)).toBeGreaterThan(0.5);
    for (let at = 0; at < 4; at += 0.05) expect(swayAt(station, 100, at)).toEqual({ dx: 0, dy: 0, rotate: 0, sx: 1, sy: 1 });
  });

  it("wraps negative and long positions instead of throwing", () => {
    for (const at of [-0.3, -91.7, 1e6]) {
      const pose = swayAt(gus, 100, at);
      for (const value of [pose.dx, pose.dy, pose.rotate, pose.sx, pose.sy]) expect(Number.isFinite(value)).toBe(true);
    }
    const cycle = cycleSeconds(gus, 100);
    expect(swayAt(gus, 100, -0.25).dy).toBeCloseTo(swayAt(gus, 100, cycle - 0.25).dy, 10);
    expect(phaseAt(gus, 100, -0.25)).toBeGreaterThanOrEqual(0);
    expect(phaseAt(gus, 100, -0.25)).toBeLessThan(1);
  });

  it("gives the same pose for the same numbers", () => {
    expect(swayAt(pip, 119, 7.25)).toEqual(swayAt(pip, 119, 7.25));
  });
});

describe("a usable tempo", () => {
  it("keeps a real tempo and sends anything else to the default", () => {
    expect(clampBpm(115)).toBe(115);
    expect(clampBpm(MIN_BPM)).toBe(MIN_BPM);
    expect(clampBpm(MAX_BPM)).toBe(MAX_BPM);
    for (const bad of [undefined, null, Number.NaN, Infinity, 0, 12, 900, "120"])
      expect(clampBpm(bad)).toBe(DEFAULT_BPM);
  });

  it("still nods with a silly tempo, beat count or turn", () => {
    const odd = swayAt({ ...pip, every: 0, turn: 9 }, 0, 1.5);
    expect(Number.isFinite(odd.dx)).toBe(true);
    // A turn of 9 would fold the face inside out: it's held to half.
    expect(odd.sx).toBeGreaterThanOrEqual(0.5);
    expect(cycleSeconds({ ...pip, every: Number.NaN }, Number.NaN)).toBeCloseTo(60 / DEFAULT_BPM, 10);
  });
});

describe("the accent", () => {
  it("is zero on the beat, positive after it, negative before the next", () => {
    expect(accentAt(0)).toBeCloseTo(0, 10);
    expect(accentAt(0.25)).toBeGreaterThan(0);
    expect(accentAt(0.5)).toBeCloseTo(0, 10);
    expect(accentAt(0.75)).toBeLessThan(0);
  });
});

describe("a pose as a transform", () => {
  it("writes nothing when the face is still", () => {
    expect(poseTransform({ dx: 0, dy: 0, rotate: 0, sx: 1, sy: 1 }, 1)).toBe("");
    expect(poseTransform(swayAt(pip, 120, 0), 1)).toBe("");
    expect(poseTransform(swayAt(station, 120, 3), 1)).toBe("");
    // Eased to nothing, a moving face is still.
    expect(poseTransform(swayAt(pip, 120, 0.1), 0)).toBe("");
  });

  it("turns the features about the middle of the box, in the box's own units", () => {
    const transform = poseTransform({ dx: 0, dy: 0, rotate: 2, sx: 1, sy: 1 }, 1);
    expect(transform).toBe("translate(0 0) translate(50 33) rotate(2) scale(1 1) translate(-50 -33)");
  });

  it("slides, drops and squashes as the pose asks", () => {
    const transform = poseTransform({ dx: 3, dy: -2, rotate: 0, sx: 0.9, sy: 1 }, 1);
    expect(transform).toContain("translate(3 -2)");
    expect(transform).toContain("scale(0.9 1)");
  });

  it("eases with the strength", () => {
    const half = poseTransform({ dx: 4, dy: 4, rotate: 4, sx: 0.9, sy: 0.9 }, 0.5);
    expect(half).toContain("translate(2 2)");
    expect(half).toContain("rotate(2)");
    expect(half).toContain("scale(0.95 0.95)");
  });
});
