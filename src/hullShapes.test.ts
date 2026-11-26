/**
 * Hulls as data: the five the game shipped with read from the file exactly as the code drew them,
 * the shape rules the editor works by, and copying a hull.
 *
 * The old code's outlines and bellies are kept below as fixtures: they are the record of what the
 * ships looked like before the shapes moved into `src/hulls.json`, and the file still has to match.
 */
import { describe, expect, it } from "vitest";
import {
  addPoint,
  copyHull,
  dragPoint,
  HULL_EDGE,
  HULL_SHAPES,
  hullDefaults,
  hullEdge,
  hullInfo,
  hullName,
  hullShapes,
  newFitting,
  onGrid,
  PART_ART,
  removePoint,
  shipFileNow,
  twinOf,
  useShipFile,
  type ArtShape,
  type Hull,
} from "./fitting";
import { SHIP_MODELS } from "./parts";
import { drawHull, drawPartArt } from "./shipArt";

/** A hull radius, in the world units the old `src/shipArt.ts` drew in. */
const R = 12;
/** The old `HULL`: each hull's outline, in world units. */
const OLD_HULL: Record<string, [number, number][]> = {
  racer: [[R * 1.25, 0], [-R, -R * 0.8], [-R * 0.55, 0], [-R, R * 0.8]],
  floater: [[R, -R * 0.7], [-R, -R], [-R, R], [R, R * 0.7]],
  defender: [[R * 1.15, 0], [R * 0.35, -R * 0.95], [-R, -R * 0.8], [-R * 0.85, 0], [-R, R * 0.8], [R * 0.35, R * 0.95]],
  drone: [[R, 0], [R * 0.4, -R * 0.7], [-R * 0.9, -R * 0.7], [-R * 0.9, R * 0.7], [R * 0.4, R * 0.7]],
  pirate: [[R * 1.3, 0], [R * 0.1, -R * 0.4], [-R * 0.2, -R], [-R * 0.5, -R * 0.3], [-R, -R * 0.6], [-R * 0.8, 0], [-R, R * 0.6], [-R * 0.5, R * 0.3], [-R * 0.2, R], [R * 0.1, R * 0.4]],
};
/** The old `BELLY`: a shape of its own for these two hulls only. */
const OLD_BELLY: Record<string, [number, number][]> = {
  racer: [[2, 1.2], [-12, 9.6], [-6.6, 0.2]],
  floater: [[12, 2], [-12, 4], [-12, 12], [12, 8.4]],
};
/** What the old code drew as the other three hulls' belly: the outline shrunk and shifted down. */
const oldShade = (model: string): [number, number][] =>
  OLD_BELLY[model] ?? OLD_HULL[model].map(([x, y]): [number, number] => [x * 0.6 - 2, y * 0.6 + 2.5]);

/** Runs `body` with the ship file changed, and puts it back after. */
function withFile(change: () => void, body: () => void): void {
  const was = shipFileNow();
  try {
    change();
    body();
  } finally {
    useShipFile(was);
  }
}

/** A canvas context that only remembers what was asked of it. */
function recorder(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  let alpha = 1;
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, name: string) => {
      if (name === "globalAlpha") return alpha;
      if (name === "createRadialGradient") return () => ({ addColorStop() {} });
      return () => void calls.push(`${name}()`);
    },
    set: (_target, name: string, value) => {
      if (name === "globalAlpha") alpha = value as number;
      else if (typeof value === "number" && name !== "lineWidth") return true;
      calls.push(`set:${name}=${String(value)}`);
      return true;
    },
  });
  return { ctx, calls };
}

/** Points in hull radii, to four places, so the file's own rounding isn't what fails a test. */
const radii = (points: [number, number][]): [number, number][] =>
  points.map(([x, y]): [number, number] => [Math.round((x / R) * 1e4) / 1e4, Math.round((y / R) * 1e4) / 1e4]);

describe("today's hulls, read from the file", () => {
  /** The hulls that predate the file: the only ones with a drawing in the code to match. */
  const drawnBefore = (): string[] => SHIP_MODELS.filter((model) => model in OLD_HULL);

  it("has the same outlines as the code drew, hull for hull", () => {
    expect([...SHIP_MODELS].sort()).toEqual(["defender", "drone", "floater", "floaterCopy", "pirate", "racer"]);
    for (const model of drawnBefore()) {
      expect(hullEdge(model)).toHaveLength(OLD_HULL[model].length);
      radii(OLD_HULL[model]).forEach(([x, y], i) => {
        expect(hullEdge(model)[i][0]).toBeCloseTo(x, 4);
        expect(hullEdge(model)[i][1]).toBeCloseTo(y, 4);
      });
    }
  });

  it("shades each hull exactly as the belly did", () => {
    for (const model of drawnBefore()) {
      const shade = hullShapes(model).find((shape) => shape.role === "shade");
      expect(shade?.kind).toBe("polygon");
      expect(shade?.clip).toBe(true);
      expect(shade?.points).toHaveLength(oldShade(model).length);
      radii(oldShade(model)).forEach(([x, y], i) => {
        expect(shade!.points![i][0]).toBeCloseTo(x, 4);
        expect(shade!.points![i][1]).toBeCloseTo(y, 4);
      });
    }
  });

  it("keeps the floater's pale front edge, as a lit edge of its own", () => {
    const rim = hullShapes("floater").find((shape) => shape.role === "rim");
    expect(rim?.kind).toBe("polygon");
    expect(rim?.width).toBeCloseTo(1.4, 5);
    expect(rim?.points).toEqual([[1, -0.7], [1, 0.7]]);
    // No other hull has one: their lit edge is their outline.
    for (const model of SHIP_MODELS.filter((each) => each !== "floater")) {
      expect(hullShapes(model).some((shape) => shape.role === "rim")).toBe(false);
    }
  });

  it("draws the body, then the shapes under it, then the lit edge, then its own lit edges", () => {
    const { ctx, calls } = recorder();
    drawHull(ctx, "floater", [120, 150, 190]);
    const at = (needle: string) => calls.indexOf(needle);
    // The belly clips to the outline and fills under the lit edge.
    expect(at("clip()")).toBeGreaterThanOrEqual(0);
    expect(at("clip()")).toBeLessThan(calls.lastIndexOf("stroke()"));
    // The outline is stroked at the hull's own weight, then the front edge at 1.4 over it.
    expect(calls).toContain("set:lineWidth=0.7");
    expect(calls).toContain("set:lineWidth=1.4");
    expect(calls.indexOf("set:lineWidth=1.4")).toBeGreaterThan(calls.indexOf("set:lineWidth=0.7"));
    expect(calls.lastIndexOf("stroke()")).toBeGreaterThan(calls.indexOf("set:lineWidth=1.4"));
    // The racer has no lit edge of its own, so it never draws one.
    const racer = recorder();
    drawHull(racer.ctx, "racer", [120, 150, 190]);
    expect(racer.calls).not.toContain("set:lineWidth=1.4");
  });
});

describe("the shape rules the editor works by", () => {
  const diamond: [number, number][] = [[1, 0], [0, -0.5], [-1, 0], [0, 0.5]];
  /** An even shape with nothing on the middle line, so its twins are easy to name. */
  const even: [number, number][] = [[1, 0], [0.5, -0.5], [0, -0.4], [0, 0.4], [0.5, 0.5]];

  it("finds a point's twin across the middle line, and none for a point on it", () => {
    expect(twinOf(diamond, 0)).toBe(-1);
    expect(twinOf(even, 0)).toBe(-1);
    expect(twinOf(even, 1)).toBe(4);
    expect(twinOf(even, 2)).toBe(3);
    expect(twinOf(diamond, 1)).toBe(3);
  });

  it("moves a point's twin with it, and leaves a point on the line single", () => {
    const moved = dragPoint(diamond, 1, [0.2, -0.7], true);
    expect(moved[1]).toEqual([0.2, -0.7]);
    expect(moved[3]).toEqual([0.2, 0.7]);
    // The points it wasn't dragging are its own business, and the old list is left as it was.
    expect(moved[0]).toEqual([1, 0]);
    expect(diamond[1]).toEqual([0, -0.5]);
    // Dragged onto the line, a point stands alone there.
    const flat = dragPoint(diamond, 1, [0.4, 0], true);
    expect(flat[1]).toEqual([0.4, 0]);
    expect(flat[3]).toEqual([0.4, -0]);
    // Without mirroring the twin stays where it was.
    expect(dragPoint(diamond, 1, [0.2, -0.7], false)[3]).toEqual([0, 0.5]);
  });

  it("snaps to a grid, a twentieth of a radius at a time", () => {
    expect(onGrid(0.37, 0.05)).toBeCloseTo(0.35, 6);
    expect(onGrid(-0.62, 0.05)).toBeCloseTo(-0.6, 6);
    const snapped = dragPoint(diamond, 1, [0.234, -0.717], true, 0.05);
    expect(snapped[1]).toEqual([0.25, -0.7]);
    expect(snapped[3]).toEqual([0.25, 0.7]);
    // Without the grid, the point goes exactly where it was dragged.
    expect(dragPoint(diamond, 1, [0.234, -0.717], true)[1]).toEqual([0.234, -0.717]);
  });

  it("adds a point and its twin on the segment that mirrors it, so the shape stays even", () => {
    expect(addPoint(even, 1, [0.4, -0.6], true)).toEqual([[1, 0], [0.5, -0.5], [0.4, -0.6], [0, -0.4], [0, 0.4], [0.4, 0.6], [0.5, 0.5]]);
    // The twin's own middle line is the one it mirrors: it crosses no middle line of its own.
    expect(addPoint(even, 1, [0.4, -0.6], false)).toHaveLength(6);
    // A point added on the middle line gets no twin.
    expect(addPoint(even, 0, [0.8, 0], true)).toHaveLength(6);
  });

  it("removes a point with its twin, and keeps a polygon at three", () => {
    const hexagon: [number, number][] = [[1, -0.5], [0, -1], [-1, -0.5], [-1, 0.5], [0, 1], [1, 0.5]];
    // One point off on its own.
    expect(removePoint(hexagon, 0, false)).toHaveLength(5);
    // The twin went with it.
    const both = removePoint(hexagon, 1, true);
    expect(both).toHaveLength(4);
    expect(both).not.toContainEqual([0, 1]);
    // Two off four would leave two points: nothing goes.
    const square: [number, number][] = [[1, -0.5], [1, 0.5], [-1, 0.5], [-1, -0.5]];
    expect(removePoint(square, 0, true)).toBe(square);
    expect(removePoint(square, 0, false)).toHaveLength(3);
    // And a triangle keeps its three.
    const triangle: [number, number][] = [[1, 0], [0, -0.5], [-1, 0]];
    expect(removePoint(triangle, 0, false)).toBe(triangle);
  });
});

describe("a hull copied from another", () => {
  it("copies the outline, shapes, mounts and stats, with nothing it's used for yet", () => {
    withFile(
      () => {
        copyHull("racer", "racerCopy");
        // The copy is a hull the file knows, and a new ship of it flies.
        expect(SHIP_MODELS).toContain("racerCopy");
        expect(hullEdge("racerCopy")).toEqual(hullEdge("racer"));
        expect(hullShapes("racerCopy")).toEqual(hullShapes("racer"));
        expect(hullDefaults("racerCopy")).toEqual(hullDefaults("racer"));
        expect(newFitting("racerCopy").fit.thrusterMain).toBeDefined();
        expect(hullInfo("racerCopy").usedBy).toEqual([]);
        expect(shipFileNow().hulls.racerCopy.edge).toEqual(shipFileNow().hulls.racer.edge);
        expect(shipFileNow().hulls.racerCopy.mounts).toEqual(shipFileNow().hulls.racer.mounts);
      },
      () => expect(SHIP_MODELS).toContain("racerCopy"),
    );
    // And it is gone again once the file is read back as it was.
    expect(SHIP_MODELS).not.toContain("racerCopy");
  });

  it("is its own hull: changing the copy leaves the hull it came from alone", () => {
    withFile(
      () => copyHull("racer", "racerCopy"),
      () => {
        hullEdge("racerCopy")[0] = [2, 0];
        hullShapes("racerCopy")[0].points = [[0, 0], [1, 0], [0, 1]];
        hullInfo("racerCopy").hull = 250;
        expect(hullEdge("racer")[0]).toEqual([1.25, 0]);
        expect(hullShapes("racer")[0].points).toHaveLength(3);
        expect(hullShapes("racer")[0].role).toBe("shade");
        expect(hullInfo("racer").hull).toBeUndefined();
      },
    );
  });

  it("is not made twice over an existing name", () => {
    withFile(
      () => {
        copyHull("racer", "racerCopy");
        const before = shipFileNow().hulls.racerCopy;
        copyHull("floater", "racerCopy");
        expect(shipFileNow().hulls.racerCopy).toEqual(before);
      },
      () => undefined,
    );
  });

  it("names the copy in words", () => {
    expect(hullName("racer")).toBe("Racer");
    expect(hullName("racerCopy")).toBe("Racer Copy");
    expect(hullName("racerCopy2")).toBe("Racer Copy2");
  });
});

describe("a hull the file hasn't got", () => {
  it("falls back on the racer rather than crashing", () => {
    expect(hullEdge("noSuchHull")).toEqual(hullEdge("racer"));
    expect(hullShapes("noSuchHull")).toEqual(hullShapes("racer"));
    expect(newFitting("noSuchHull").fit.thrusterMain).toBeDefined();
  });
});

describe("shapes in the ship file", () => {
  it("round trips a hull's outline and shapes", () => {
    withFile(
      () => {
        HULL_EDGE.racer.splice(0, HULL_EDGE.racer.length, [1, 0], [0, 1], [-1, 0]);
        HULL_SHAPES.racer.splice(
          0,
          HULL_SHAPES.racer.length,
          { kind: "circle", role: "glass", x: 0.1, y: 0, r: 0.3, alpha: 0.5 },
          { kind: "rect", role: "shade", x: 0, y: 0.2, w: 0.4, h: 0.2, angle: 30, clip: true },
          { kind: "polygon", role: "rim", points: [[0.5, -0.2], [0.5, 0.2]], width: 1.1 },
        );
      },
      () => {
        const file = shipFileNow();
        useShipFile(file);
        expect(hullEdge("racer")).toEqual([[1, 0], [0, 1], [-1, 0]]);
        expect(hullShapes("racer")).toEqual([
          { kind: "circle", role: "glass", x: 0.1, y: 0, r: 0.3, alpha: 0.5 },
          { kind: "rect", role: "shade", x: 0, y: 0.2, w: 0.4, h: 0.2, angle: 30, clip: true },
          { kind: "polygon", role: "rim", points: [[0.5, -0.2], [0.5, 0.2]], width: 1.1 },
        ]);
        // What it reads back is what is saved, so a second read changes nothing.
        expect(shipFileNow()).toEqual(file);
      },
    );
  });

  it("drops a shape that says nothing, and keeps a hull's own outline if the file's is broken", () => {
    const file = shipFileNow();
    try {
      const racer = file.hulls.racer as Hull;
      racer.edge = [[1, 0], [0, 1]];
      racer.shapes = [
        { kind: "polygon", role: "shade", points: [[0, 0], [1, 0]] } as ArtShape,
        { kind: "circle", role: "shade", x: 0, y: 0 } as ArtShape,
        { kind: "circle", role: "shade", x: 0, y: 0, r: -0.2 } as ArtShape,
        { kind: "sausage", role: "shade" } as unknown as ArtShape,
        { kind: "circle", role: "nonsense" as unknown as ArtShape["role"], x: 0, y: 0, r: 0.2 },
      ];
      useShipFile(file);
      // Two points is no outline: the shipped one stands in.
      expect(hullEdge("racer")).toHaveLength(4);
      // A polygon needs three points, a circle a reach; a role nobody knows is the body.
      expect(hullShapes("racer")).toEqual([{ kind: "circle", role: "body", x: 0, y: 0, r: 0.2 }]);
    } finally {
      useShipFile(file);
    }
  });
});

describe("a part drawn with shapes of its own", () => {
  const bell: ArtShape[] = [
    { kind: "polygon", role: "body", points: [[-0.2, -0.3], [0.2, -0.25], [0.2, 0.25], [-0.2, 0.3]] },
    { kind: "circle", role: "glass", x: 0.15, y: 0, r: 0.05 },
  ];

  it("draws them instead of the code's art, and keeps the code's art without them", () => {
    const drawn = recorder();
    drawPartArt(drawn.ctx, "gun1", 0);
    // The code's gun is a block and a barrel: it fills a rect.
    expect(drawn.calls).toContain("fillRect()");

    withFile(
      () => {
        PART_ART.gun1 = { shapes: bell };
      },
      () => {
        const shapes = recorder();
        drawPartArt(shapes.ctx, "gun1", 0);
        expect(shapes.calls).not.toContain("fillRect()");
        // Its two shapes: the body, and the circle of glass over it.
        expect(shapes.calls.filter((call) => call === "fill()")).toHaveLength(2);
      },
    );
    const back = recorder();
    drawPartArt(back.ctx, "gun1", 0);
    expect(back.calls).toContain("fillRect()");
  });

  it("keeps a part's shapes in the ship file", () => {
    withFile(
      () => {
        PART_ART.tractor = { shapes: bell };
      },
      () => {
        const file = shipFileNow();
        expect(file.partArt?.tractor?.shapes).toEqual(bell);
        useShipFile(file);
        expect(PART_ART.tractor?.shapes).toEqual(bell);
      },
    );
    expect(PART_ART.tractor).toBeUndefined();
  });
});
