import { afterEach, describe, expect, it, vi } from "vitest";
import { POOL, ROLES, ROLLED_MOODS, build, rollFace, type Roll } from "./face-pool";
import { FACE_BOX, MOODS, renderFace, resolveFace, type Part, type Role } from "./faces";
import { readFileSync } from "node:fs";

/** A few hundred rolls of a role, from fixed seeds, so a failure names one to look at. */
function rolls(role: Role, count = 300): Roll[] {
  return Array.from({ length: count }, (_, i) => rollFace(1000 + i * 7919, role));
}

/** How far across a part is, the same measure faces.test.ts holds the hand-written faces to. */
function mass(part: Part): number {
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
      return 6;
  }
}

function points(part: Part): [number, number][] {
  return [...(part.at ? [part.at] : []), ...("from" in part ? [part.from, part.to] : [])];
}

afterEach(() => vi.restoreAllMocks());

describe("the face pool", () => {
  it("rolls the same face from the same seed and role", () => {
    for (const role of ROLES) {
      expect(rollFace(42, role)).toEqual(rollFace(42, role));
      expect(rollFace(42, role).face).not.toEqual(rollFace(43, role).face);
    }
    expect(rollFace(42, "traffic").face).not.toEqual(rollFace(42, "pirate").face);
  });

  it("builds the same face again from the picks it stored", () => {
    for (const roll of rolls("traffic", 40)) expect(build(roll.picks)).toEqual(roll.face);
  });

  it("writes all four moods, each with eyes and a mouth", () => {
    for (const role of ROLES) {
      for (const roll of rolls(role, 80)) {
        for (const mood of ROLLED_MOODS) {
          const face = roll.face.moods[mood];
          expect(face?.eyes?.length, `${role} ${roll.seed} ${mood} eyes`).toBeGreaterThan(0);
          expect(face?.mouth?.length, `${role} ${roll.seed} ${mood} mouth`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("gives every rolled face a mass in every mood", () => {
    for (const role of ROLES) {
      for (const roll of rolls(role)) {
        for (const mood of MOODS) {
          const face = resolveFace("roll", roll.face, mood);
          const heaviest = Math.max(...[...face.eyes, ...face.brows, ...face.mouth, ...face.marks].map(mass));
          expect(heaviest, `${role} ${roll.seed} ${mood}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("keeps the identity layers identical across moods", () => {
    for (const roll of rolls("pirate", 100)) {
      const first = resolveFace("roll", roll.face, "neutral");
      for (const mood of MOODS) {
        const face = resolveFace("roll", roll.face, mood);
        expect(face.over).toEqual(first.over);
        expect(face.under).toEqual(first.under);
        expect(face.color).toBe(first.color);
        expect(face.screen).toEqual(first.screen);
      }
    }
  });

  it("never puts a mood mark on a station", () => {
    for (const roll of rolls("station")) {
      for (const mood of MOODS) expect(resolveFace("roll", roll.face, mood).marks, `${roll.seed} ${mood}`).toEqual([]);
      expect(roll.picks.moodMarks).toEqual({});
    }
  });

  it("leans each role its own way", () => {
    const stations = rolls("station");
    // The station's own display, every time: the bezel, the flat mouth, its colours, no mark.
    expect(new Set(stations.map((r) => r.picks.screen))).toEqual(new Set(["bezel"]));
    expect(new Set(stations.map((r) => r.picks.mouth))).toEqual(new Set(["flat"]));
    expect(new Set(stations.map((r) => r.picks.mark))).toEqual(new Set(["none"]));
    for (const roll of stations) expect(POOL.roles.station.colors).toContain(roll.picks.color);

    const pirates = rolls("pirate");
    for (const roll of pirates) expect(POOL.roles.pirate.colors).toContain(roll.picks.color);
    const scarred = (list: Roll[]) => list.filter((r) => ["scar", "slash", "patch"].includes(r.picks.mark)).length;
    const defenders = rolls("defender");
    expect(scarred(pirates)).toBeGreaterThan(pirates.length / 3);
    expect(scarred(defenders)).toBe(0);
    for (const roll of defenders) expect(POOL.roles.defender.colors).toContain(roll.picks.color);
    // Defenders are steadier: their eyes differ less, and the face turns less.
    const crooked = (list: Roll[]) => list.reduce((sum, r) => sum + Math.abs(r.picks.dials.lift) + Math.abs(r.picks.dials.tilt), 0) / list.length;
    expect(crooked(defenders)).toBeLessThan(crooked(rolls("traffic")) * 0.7);

    // Traffic uses the full range: every eye and mouth it may pick shows up.
    const traffic = rolls("traffic");
    const eyes = POOL.eyes.filter((s) => (s.weights.traffic ?? 0) > 0).map((s) => s.id);
    expect(new Set(traffic.map((r) => r.picks.eyes))).toEqual(new Set(eyes));
  });

  it("gives every mood one quirk, and only ones the role and mood allow", () => {
    for (const role of ROLES) {
      for (const roll of rolls(role, 100)) {
        for (const mood of ROLLED_MOODS) {
          const quirk = roll.picks.quirks[mood];
          const style = POOL.quirks.find((q) => q.id === quirk.id);
          expect(style, `${role} ${roll.seed} ${mood} ${quirk.id}`).toBeDefined();
          expect(style!.moods).toContain(mood);
          expect(style!.weights[role] ?? 0).toBeGreaterThan(0);
          if (quirk.id === "brow") expect(roll.picks.brows).not.toBe("none");
        }
      }
    }
  });

  it("keeps every rolled part inside the box, with no broken numbers", () => {
    for (const role of ROLES) {
      for (const roll of rolls(role, 100)) {
        for (const mood of MOODS) {
          const face = resolveFace("roll", roll.face, mood);
          for (const part of [...face.under, ...face.eyes, ...face.brows, ...face.mouth, ...face.over, ...face.marks]) {
            for (const [x, y] of points(part)) {
              expect(x, `${role} ${roll.seed} ${mood} ${part.kind}`).toBeGreaterThanOrEqual(-5);
              expect(x).toBeLessThanOrEqual(FACE_BOX.w + 5);
              expect(y).toBeGreaterThanOrEqual(-5);
              expect(y).toBeLessThanOrEqual(FACE_BOX.h + 5);
            }
          }
          const markup = renderFace(face, { seed: `t-${roll.seed}` });
          expect(markup).not.toContain("undefined");
          expect(markup).not.toContain("NaN");
          expect(markup).not.toContain("@");
        }
      }
    }
  });

  it("writes only path commands the mirror understands", () => {
    const paths: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        const part = value as { kind?: string; d?: string };
        if (part.kind === "path" && part.d) paths.push(part.d);
        Object.values(value).forEach(walk);
      }
    };
    walk(POOL);
    expect(paths.length).toBeGreaterThan(0);
    for (const d of paths) expect(d, d).toMatch(/^[MLCQSTZmlcqstz0-9.\s,-]+$/);
  });

  it("never draws on the game's random numbers", () => {
    const math = vi.spyOn(Math, "random");
    for (const role of ROLES) rolls(role, 20);
    expect(math).not.toHaveBeenCalled();
    // Nor can it reach the sim's: the roll imports nothing but the pool and the face types.
    const source = readFileSync(new URL("./face-pool.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports).toEqual(["./face-pool.json", "./faces"]);
  });
});
