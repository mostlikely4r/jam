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
  DAMAGED_AT,
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
  resetPartArt,
  SHIPPED_SHIPS,
  shipFileNow,
  twinOf,
  useShipFile,
  type ArtShape,
  type Hull,
  type ShapeBlink,
  type ShapeFade,
} from "./fitting";
import { SHIP_MODELS, type PartId } from "./parts";
import { drawDecal, drawHull, drawPartArt, drawShape, litAmount, mix, partPalette, setArtTime, type ShapePalette } from "./shipArt";

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
        PART_ART.gun1 = { shapes: bell };
      },
      () => {
        const file = shipFileNow();
        expect(file.partArt?.gun1?.shapes).toEqual(bell);
        useShipFile(file);
        expect(PART_ART.gun1?.shapes).toEqual(bell);
      },
    );
    // A part the file draws nothing for keeps the code's own art once the file is read back.
    expect(PART_ART.gun1).toBeUndefined();
  });
});

/** What one painting call drew: the path, and the colour (with its alpha) it was painted in. */
interface Painted {
  kind: "fill" | "stroke";
  path: (string | number)[][];
  colour: [number, number, number, number];
  /** A fill's rule, where one was given. */
  rule?: string;
  /** A stroke's width. */
  width?: number;
  /** The halo it cast, where it cast one: how far it blurred, and in what colour. */
  glow?: { blur: number; colour: [number, number, number, number] };
}

/**
 * A canvas that remembers what was painted rather than drawing it: each path as it ends up in the
 * ship's own frame, so a turned rect and a plain one compare, and each colour as four numbers.
 */
function painter(): { ctx: CanvasRenderingContext2D; painted: Painted[]; stops: (string | number)[][] } {
  const painted: Painted[] = [];
  const stops: (string | number)[][] = [];
  let path: (string | number)[][] = [];
  let fillStyle = "#000000";
  let strokeStyle = "#000000";
  let lineWidth = 1;
  let alpha = 1;
  let shadowBlur = 0;
  let shadowColor = "#000000";
  type Frame = { fillStyle: string; strokeStyle: string; lineWidth: number; alpha: number; shadowBlur: number; shadowColor: string; m: number[] };
  const stack: Frame[] = [];
  // a, b, c, d, e, f: x becomes a·x + c·y + e, y becomes b·x + d·y + f.
  let m = [1, 0, 0, 1, 0, 0];
  const at = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const turned = Math.atan2(m[1], m[0]);
  const corners = (x: number, y: number, w: number, h: number) => {
    const points = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => at(px, py));
    path = [["M", ...points[0]], ["L", ...points[1]], ["L", ...points[2]], ["L", ...points[3]], ["Z"]];
  };
  const colour = (css: string, a: number): [number, number, number, number] => {
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css.trim());
    if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16), a];
    const parts = /^rgba?\(([^)]+)\)$/.exec(css.trim());
    if (!parts) return [0, 0, 0, a];
    const numbers = parts[1].split(",").map((each) => Number(each.trim()));
    return [numbers[0], numbers[1], numbers[2], (numbers[3] ?? 1) * a];
  };
  const paint = (kind: "fill" | "stroke", rule?: string) => {
    painted.push({
      kind,
      path: [...path],
      colour: colour(kind === "fill" ? fillStyle : strokeStyle, alpha),
      ...(rule ? { rule } : {}),
      ...(kind === "stroke" ? { width: lineWidth } : {}),
      ...(shadowBlur > 0 ? { glow: { blur: shadowBlur, colour: colour(shadowColor, 1) } } : {}),
    });
  };
  const gradient = () =>
    ({
      addColorStop: (offset: number, css: string) => void stops.push([offset, css]),
    }) as unknown as CanvasGradient;
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, name: string) => {
      switch (name) {
        case "globalAlpha":
          return alpha;
        case "save":
          return () => stack.push({ fillStyle, strokeStyle, lineWidth, alpha, shadowBlur, shadowColor, m });
        case "restore":
          return () => {
            const frame = stack.pop();
            if (!frame) return;
            fillStyle = frame.fillStyle;
            strokeStyle = frame.strokeStyle;
            lineWidth = frame.lineWidth;
            alpha = frame.alpha;
            shadowBlur = frame.shadowBlur;
            shadowColor = frame.shadowColor;
            m = frame.m;
          };
        case "translate":
          return (x: number, y: number) => {
            m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
          };
        case "rotate":
          return (a: number) => {
            const cos = Math.cos(a);
            const sin = Math.sin(a);
            m = [m[0] * cos + m[2] * sin, m[1] * cos + m[3] * sin, -m[0] * sin + m[2] * cos, -m[1] * sin + m[3] * cos, m[4], m[5]];
          };
        case "scale":
          return (sx: number, sy: number) => {
            m = [m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]];
          };
        case "beginPath":
          return () => {
            path = [];
          };
        case "moveTo":
          return (x: number, y: number) => {
            path.push(["M", ...at(x, y)]);
          };
        case "lineTo":
          return (x: number, y: number) => {
            path.push(["L", ...at(x, y)]);
          };
        case "closePath":
          return () => {
            path.push(["Z"]);
          };
        case "arc":
          return (x: number, y: number, r: number, from: number, to: number) => {
            path.push(["A", ...at(x, y), r, from + turned, to + turned]);
          };
        case "ellipse":
          return (x: number, y: number, rx: number, ry: number, rotation: number) => {
            path.push(["E", ...at(x, y), rx, ry, rotation + turned]);
          };
        case "rect":
          return (x: number, y: number, w: number, h: number) => corners(x, y, w, h);
        case "roundRect":
          return (x: number, y: number, w: number, h: number, corner: number) => {
            corners(x, y, w, h);
            path.push(["C", corner]);
          };
        case "fillRect":
          return (x: number, y: number, w: number, h: number) => {
            corners(x, y, w, h);
            paint("fill");
          };
        case "strokeRect":
          return (x: number, y: number, w: number, h: number) => {
            corners(x, y, w, h);
            paint("stroke");
          };
        case "fill":
          return (rule?: string) => paint("fill", rule);
        case "stroke":
          return () => paint("stroke");
        case "createLinearGradient":
        case "createRadialGradient":
          return gradient;
        default:
          return () => {};
      }
    },
    set: (_target, name: string, value) => {
      if (name === "fillStyle") fillStyle = String(value);
      else if (name === "strokeStyle") strokeStyle = String(value);
      else if (name === "lineWidth") lineWidth = Number(value);
      else if (name === "globalAlpha") alpha = Number(value);
      else if (name === "shadowBlur") shadowBlur = Number(value);
      else if (name === "shadowColor") shadowColor = String(value);
      return true;
    },
  });
  return { ctx, painted, stops };
}

/** Whether two recorded values are the same to a tolerance, numbers included. */
function alike(a: unknown, b: unknown, tolerance = 1e-4): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= tolerance;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((each, i) => alike(each, b[i], tolerance));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => alike((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], tolerance));
  }
  return a === b;
}

/** The paints of one kind, in the order they were made: the rim always goes over everything. */
const ofKind = (painted: Painted[], kind: "fill" | "stroke") => painted.filter((each) => each.kind === kind);

/** The colours the code's own art draws a part in. */
const plainPalette = (): ShapePalette => ({ body: [111, 122, 140], shade: [75, 83, 97], rim: [190, 200, 216], glass: [141, 189, 185] });

describe("the shape kinds the editor adds", () => {
  /** What one shape paints, in a part's colours. */
  const draw = (shape: ArtShape) => {
    const canvas = painter();
    drawShape(canvas.ctx, shape, partPalette());
    return canvas;
  };

  it("draws an ellipse, turned and filled", () => {
    const { painted } = draw({ kind: "ellipse", role: "glass", x: 0.5, y: 0.1, rx: 0.2, ry: 0.1, angle: 30 });
    expect(painted).toHaveLength(1);
    expect(painted[0].kind).toBe("fill");
    // Its middle is ×12, as every hull unit is; its turn is the file's degrees in radians.
    expect(painted[0].path[0][0]).toBe("E");
    expect(alike(painted[0].path[0].slice(1, 5), [6, 1.2, 2.4, 1.2])).toBe(true);
    expect(painted[0].path[0][5]).toBeCloseTo(Math.PI / 6, 6);
  });

  it("draws an arc as a line, whatever its role, with its own width", () => {
    const { painted } = draw({ kind: "arc", role: "glass", x: 0, y: 0, r: 0.2, from: -45, to: 45, width: 0.6 });
    expect(painted).toHaveLength(1);
    const stroke = painted[0];
    expect(stroke.kind).toBe("stroke");
    expect(stroke.width).toBe(0.6);
    expect(stroke.path[0][0]).toBe("A");
    expect(stroke.path[0][3]).toBeCloseTo(2.4, 6);
    expect(stroke.path[0][4]).toBeCloseTo(-Math.PI / 4, 6);
    expect(stroke.path[0][5]).toBeCloseTo(Math.PI / 4, 6);
  });

  it("draws a ring with its hole taken out, and both its circles for a rim", () => {
    const filled = draw({ kind: "ring", role: "body", x: 0, y: 0, r: 0.3, inner: 0.1 });
    expect(filled.painted).toHaveLength(1);
    expect(filled.painted[0].rule).toBe("evenodd");
    // The outer circle, then the hole, with no line joining them.
    expect(filled.painted[0].path.map(([name]) => name)).toEqual(["A", "M", "A"]);
    expect(filled.painted[0].path[0][3]).toBeCloseTo(3.6, 6);
    expect(filled.painted[0].path[2][3]).toBeCloseTo(1.2, 6);
    const rimmed = draw({ kind: "ring", role: "rim", x: 0, y: 0, r: 0.3, inner: 0.1 });
    expect(rimmed.painted).toHaveLength(2);
    expect(rimmed.painted.every((each) => each.kind === "stroke")).toBe(true);
  });

  it("draws a wedge out from its middle, both of its straight sides", () => {
    const { painted } = draw({ kind: "wedge", role: "shade", x: 0.1, y: 0, r: 0.4, from: -30, to: 30 });
    expect(painted).toHaveLength(1);
    expect(painted[0].path.map(([name]) => name)).toEqual(["M", "A", "Z"]);
    expect(painted[0].path[0].slice(1)).toEqual(expect.arrayContaining([]));
    expect(alike(painted[0].path[0].slice(1), [1.2, 0])).toBe(true);
    expect(painted[0].path[2]).toEqual(["Z"]);
  });

  it("draws a rounded rect in its own turned frame, and a square one the same way", () => {
    const round = draw({ kind: "rect", role: "shade", x: 0, y: 0, w: 0.4, h: 0.2, corner: 0.05 });
    expect(round.painted).toHaveLength(1);
    expect(round.painted[0].path.at(-1)![0]).toBe("C");
    expect(Number(round.painted[0].path.at(-1)![1])).toBeCloseTo(0.6, 6);
    const square = draw({ kind: "rect", role: "shade", x: 0, y: 0, w: 0.4, h: 0.2 });
    expect(square.painted[0].path.some(([name]) => name === "C")).toBe(false);
    // A rect 60° round puts its corners where the turn does: the near corner moves from (2.4, 1.2)
    // to the side it turns to.
    const turned = draw({ kind: "rect", role: "shade", x: 0, y: 0, w: 0.4, h: 0.2, angle: 60 });
    const corner = turned.painted[0].path[0];
    expect(Number(corner[1])).toBeCloseTo(-2.4 * Math.cos(Math.PI / 3) + 1.2 * Math.sin(Math.PI / 3), 6);
  });

  it("draws an open line through its points, and closes the same polygon without `open`", () => {
    const line = draw({ kind: "polygon", role: "shade", points: [[0, -0.2], [0.4, 0], [0, 0.2]], open: true, width: 0.3 });
    expect(line.painted).toHaveLength(1);
    expect(line.painted[0].kind).toBe("stroke");
    expect(line.painted[0].path.some(([name]) => name === "Z")).toBe(false);
    expect(line.painted[0].width).toBe(0.3);
    const filled = draw({ kind: "polygon", role: "shade", points: [[0, -0.2], [0.4, 0], [0, 0.2]] });
    expect(filled.painted[0].kind).toBe("fill");
    expect(filled.painted[0].path.some(([name]) => name === "Z")).toBe(true);
  });

  it("paints in the gradient's own two colours, and fades to clear where it has no `to`", () => {
    const toGlass: ArtShape = { kind: "circle", role: "body", x: 0, y: 0, r: 0.3, fade: { type: "line", to: "glass", from: [-0.3, 0], end: [0.3, 0] } };
    const fading = painter();
    drawShape(fading.ctx, toGlass, partPalette());
    expect(fading.stops).toEqual([
      [0, "rgb(111,122,140)"],
      [1, "rgb(141,189,185)"],
    ]);
    const clear: ArtShape = { kind: "circle", role: "body", x: 0, y: 0, r: 0.3, fade: { type: "round", x: 0.1, y: 0, reach: 0.3 } };
    const round = painter();
    drawShape(round.ctx, clear, plainPalette());
    expect(round.stops.map(([, css]) => css)).toEqual(["rgb(111,122,140)", "rgba(111,122,140,0)"]);
  });
});

describe("reading the shapes the new kinds are stored as", () => {
  it("drops each one that can't draw, and keeps the ones that can", () => {
    const file = shipFileNow();
    try {
      file.hulls.racer.shapes = [
        { kind: "ellipse", role: "glass", x: 0, y: 0, rx: 0.3 } as ArtShape,
        { kind: "ellipse", role: "glass", x: 0, y: 0, rx: 0.3, ry: 0.2 },
        { kind: "arc", role: "rim", x: 0, y: 0, r: 0.3, from: 30, to: 30 } as ArtShape,
        { kind: "arc", role: "rim", x: 0, y: 0, r: 0.3, from: 0, to: 90, width: 0.5 },
        { kind: "ring", role: "shade", x: 0, y: 0, r: 0.3, inner: 0.3 } as ArtShape,
        { kind: "ring", role: "shade", x: 0, y: 0, r: 0.3, inner: 0.1 },
        { kind: "wedge", role: "shade", x: 0, y: 0, from: 0, to: 90 } as ArtShape,
        { kind: "polygon", role: "shade", open: true, points: [[0, 0]] } as ArtShape,
        { kind: "polygon", role: "shade", open: true, points: [[0, 0], [0.2, 0.2]], width: 0.4 },
        // A corner past half the shorter side comes back at half of it.
        { kind: "rect", role: "shade", x: 0, y: 0, w: 0.4, h: 0.2, corner: 0.9 },
        // A fade nobody can draw leaves the shape flat, but keeps the shape. The last one lies about
        // its role on purpose, the way a hand-edited file could.
        { kind: "circle", role: "body", x: 0, y: 0, r: 0.2, fade: { type: "line", from: [0, 0] } } as ArtShape,
        { kind: "circle", role: "body", x: 0, y: 0, r: 0.2, fade: { type: "round", x: 0, y: 0, reach: 0, to: "glass" } } as ArtShape,
        {
          kind: "circle",
          role: "body",
          x: 0,
          y: 0,
          r: 0.2,
          fade: { type: "round", x: 0, y: 0, reach: 0.2, to: "nonsense" } as unknown as ShapeFade,
        } as ArtShape,
      ];
      useShipFile(file);
      expect(hullShapes("racer").map((shape) => shape.kind)).toEqual(["ellipse", "arc", "ring", "polygon", "rect", "circle", "circle", "circle"]);
      expect(hullShapes("racer")[4].corner).toBeCloseTo(0.1, 6);
      expect(hullShapes("racer")[3].open).toBe(true);
      expect(hullShapes("racer")[3].width).toBeCloseTo(0.4, 6);
      // Each of the last three keeps its reach and loses the gradient it can't draw.
      for (const shape of hullShapes("racer").slice(5)) expect(shape.fade).toBeUndefined();
    } finally {
      useShipFile(file);
    }
  });

  it("keeps every new field through a save and a read", () => {
    const shapes: ArtShape[] = [
      { kind: "ellipse", role: "glass", x: 0.1, y: 0, rx: 0.3, ry: 0.2, angle: 30 },
      { kind: "arc", role: "rim", x: 0, y: 0, r: 0.3, from: -45, to: 45, width: 0.5 },
      { kind: "ring", role: "shade", x: 0, y: 0, r: 0.3, inner: 0.1 },
      { kind: "wedge", role: "glass", x: 0, y: 0, r: 0.4, from: 0, to: 90, alpha: 0.5, order: 2 },
      { kind: "rect", role: "shade", x: 0, y: 0, w: 0.4, h: 0.2, corner: 0.05 },
      { kind: "polygon", role: "glass", points: [[0, 0], [0.3, 0]], open: true, width: 0.4 },
      { kind: "circle", role: "body", x: 0, y: 0, r: 0.2, fade: { type: "line", to: "rim", from: [-0.2, 0], end: [0.2, 0] } },
      { kind: "circle", role: "body", x: 0.1, y: 0, r: 0.2, working: true, fade: { type: "round", x: 0.1, y: 0, reach: 0.2 } },
    ];
    withFile(
      () => HULL_SHAPES.racer.splice(0, HULL_SHAPES.racer.length, ...shapes),
      () => {
        const file = shipFileNow();
        useShipFile(file);
        expect(hullShapes("racer")).toEqual(shapes);
        expect(shipFileNow()).toEqual(file);
      },
    );
  });

  it("draws a shape only while its part works, and always on a hull, which has no wear", () => {
    const glow: ArtShape = { kind: "circle", role: "glass", x: 0.1, y: 0, r: 0.05, working: true };
    withFile(
      () => {
        PART_ART.gun1 = { shapes: [{ kind: "circle", role: "body", x: 0, y: 0, r: 0.1 }, glow] };
      },
      () => {
        const whole = painter();
        drawPartArt(whole.ctx, "gun1", 0);
        expect(ofKind(whole.painted, "fill")).toHaveLength(2);
        const damaged = painter();
        drawPartArt(damaged.ctx, "gun1", DAMAGED_AT);
        // The body is still there, scorched; the glow has gone out.
        expect(ofKind(damaged.painted, "fill")).toHaveLength(1);
      },
    );
    const hull = painter();
    drawShape(hull.ctx, glow, partPalette(), undefined);
    expect(ofKind(hull.painted, "fill")).toHaveLength(1);
  });

  it("keeps a part's own shade and glass, and mixes the code's without them", () => {
    expect(partPalette({ shade: [1, 2, 3], glass: [4, 5, 6] })).toMatchObject({ shade: [1, 2, 3], glass: [4, 5, 6] });
    expect(partPalette({ metal: [111, 122, 140] })).toMatchObject({ shade: [75, 83, 97], glass: [141, 189, 185] });
    withFile(
      () => {
        PART_ART.gun1 = { shade: "#010203", glass: "#040506" };
      },
      () => {
        useShipFile(shipFileNow());
        expect(PART_ART.gun1).toMatchObject({ shade: "#010203", glass: "#040506" });
      },
    );
  });
});

/**
 * How the code drew each cockpit and the tractor, kept as the record the file's own art has to
 * match: the same paths, in the same colours, at rest and damaged.
 */
function codedArt(ctx: CanvasRenderingContext2D, id: PartId, wear = 0): void {
  const glass = "#2b4a74";
  const glint = "rgba(160,215,255,0.7)";
  const hot: [number, number, number] = [255, 138, 58];
  const dead: [number, number, number] = [46, 42, 40];
  const worn = (base: [number, number, number]) => (wear >= 1 ? dead : wear >= DAMAGED_AT ? mix(base, hot, 0.75) : base);
  const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const path = (points: [number, number][]) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  ctx.lineJoin = "round";
  if (id === "cockpitKite") {
    ctx.fillStyle = glass;
    path([[3, 0], [-1.5, -1.9], [-2.9, 0], [-1.5, 1.9]]);
    ctx.fill();
    ctx.fillStyle = glint;
    path([[1.5, -0.4], [-1.1, -1.3], [-1.5, -0.6]]);
    ctx.fill();
  } else if (id === "cockpitBar") {
    ctx.fillStyle = glass;
    path([[1.1, -5.2], [-1.1, -5.6], [-1.1, 5.6], [1.1, 5.2]]);
    ctx.fill();
    ctx.fillStyle = glint;
    ctx.fillRect(-0.5, -4.8, 0.8, 3);
  } else if (id === "cockpitDome") {
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.4, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = glint;
    ctx.beginPath();
    ctx.ellipse(-0.5, -0.6, 0.9, 0.45, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === "cockpitVisor") {
    ctx.fillStyle = glass;
    path([[2.6, -0.5], [1.8, -0.9], [-2.6, -0.9], [-2.6, 0.9], [1.8, 0.9], [2.6, 0.5]]);
    ctx.fill();
    ctx.fillStyle = glint;
    ctx.fillRect(-1.8, -0.6, 2.6, 0.3);
  } else {
    ctx.fillStyle = rgb(worn([70, 120, 112]));
    ctx.beginPath();
    ctx.arc(0, 0, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgb(worn([150, 230, 210]));
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(-0.4, 0, 1.9, -1.1, 1.1);
    ctx.stroke();
    if (wear < DAMAGED_AT) {
      ctx.fillStyle = "rgba(170,255,230,0.9)";
      ctx.beginPath();
      ctx.arc(0.4, 0, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

describe("the art the file now draws for the cockpits and the tractor", () => {
  const cockpits: PartId[] = ["cockpitKite", "cockpitBar", "cockpitDome", "cockpitVisor"];

  it("draws the cockpit glass and its glint as the code did", () => {
    for (const id of cockpits) {
      const was = painter();
      codedArt(was.ctx, id);
      const now = painter();
      drawDecal(now.ctx, id);
      expect(alike(now.painted, was.painted)).toBe(true);
    }
  });

  it("draws the tractor as the code did, at rest and damaged", () => {
    for (const wear of [0, DAMAGED_AT, 1]) {
      const was = painter();
      codedArt(was.ctx, "tractor", wear);
      const now = painter();
      drawPartArt(now.ctx, "tractor", wear);
      // The rim always draws over everything, so the fills keep their own order and so do the
      // strokes: the glow sits inside the arc's circle, so which of them goes first isn't seen.
      expect(alike(ofKind(now.painted, "fill"), ofKind(was.painted, "fill"))).toBe(true);
      expect(alike(ofKind(now.painted, "stroke"), ofKind(was.painted, "stroke"))).toBe(true);
    }
  });

  it("draws the clamp and the all-round tractor the same way, as they shared one drawing", () => {
    for (const id of ["tractorAll", "clamp"] as PartId[]) {
      const now = painter();
      drawPartArt(now.ctx, id, 0);
      const was = painter();
      codedArt(was.ctx, "tractor", 0);
      expect(alike(ofKind(now.painted, "fill"), ofKind(was.painted, "fill"))).toBe(true);
      expect(alike(ofKind(now.painted, "stroke"), ofKind(was.painted, "stroke"))).toBe(true);
    }
  });

  it("puts a part back to the shipped drawing when its art is reset", () => {
    withFile(
      () => {
        PART_ART.tractor = { metal: "#000000" };
        PART_ART.gun1 = { metal: "#000000" };
      },
      () => {
        resetPartArt("tractor");
        // The shipped file's shapes come back, not nothing: the code's tractor drawing is gone.
        expect(PART_ART.tractor).toEqual(SHIPPED_SHIPS.partArt?.tractor);
        // A part the file draws nothing for goes back to the code's art.
        resetPartArt("gun1");
        expect(PART_ART.gun1).toBeUndefined();
      },
    );
  });
});

describe("live shapes: a colour change and a glow", () => {
  /** A nav light: a small circle on the nose, flashing red from a dark lens. */
  const light = (over: Partial<ArtShape> = {}): ArtShape => ({
    kind: "circle",
    role: "body",
    x: 0.1,
    y: 0,
    r: 0.05,
    blink: { colour: "#ff0000", rest: "#330000", on: 0.2, off: 0.8 },
    ...over,
  });
  /** The colour a drawing's one fill came out, as red, green, blue and alpha. */
  const filled = (canvas: { painted: Painted[] }) => canvas.painted[0].colour;
  /** One shape drawn in a part's colours, with the art's clock at `at` seconds or still at null. */
  const drawn = (shape: ArtShape, at: number | null, palette: ShapePalette = partPalette()) => {
    setArtTime(at);
    try {
      const canvas = painter();
      drawShape(canvas.ctx, shape, palette);
      return canvas;
    } finally {
      setArtTime(null);
    }
  };

  it("blinks and fades by the clock, and takes its offset", () => {
    const snap: ShapeBlink = { colour: "#ff0000", on: 0.2, off: 0.8 };
    expect([0, 0.1, 0.2, 0.5, 0.99, 1].map((at) => litAmount(snap, at))).toEqual([1, 1, 0, 0, 0, 1]);
    // An offset shifts the whole cycle, so a second light takes its turn.
    expect(litAmount({ ...snap, offset: 0.3 }, 0)).toBe(0);
    expect(litAmount({ ...snap, offset: 0.3 }, 0.7)).toBe(1);
    const fade: ShapeBlink = { colour: "#ff0000", on: 0.4, off: 0.6, fade: true };
    expect(litAmount(fade, 0)).toBe(0);
    expect(litAmount(fade, 0.2)).toBeCloseTo(1, 6);
    expect(litAmount(fade, 0.4)).toBe(0);
    expect(litAmount(fade, 0.7)).toBe(0);
    // With no rest between, it breathes without a pause.
    const breathing: ShapeBlink = { colour: "#ff0000", on: 0.4, off: 0, fade: true };
    expect(litAmount(breathing, 0)).toBe(0);
    expect(litAmount(breathing, 0.2)).toBeCloseTo(1, 6);
    expect(litAmount(breathing, 0.4)).toBe(0);
  });

  it("draws a light at rest in its lens colour, and at its flash in the flash colour", () => {
    expect(filled(drawn(light(), null))).toEqual([51, 0, 0, 1]);
    expect(filled(drawn(light(), 0))).toEqual([255, 0, 0, 1]);
    // A light with no lens colour of its own rests in its role's colour.
    const bare = light({ blink: { colour: "#ff0000", on: 0.2, off: 0.8 } });
    expect(filled(drawn(bare, 0.5))).toEqual([111, 122, 140, 1]);
  });

  it("casts a halo round a steady glow, and ties a light's halo to its flash", () => {
    const steady = drawn({ kind: "circle", role: "glass", x: 0, y: 0, r: 0.05, glow: 0.08 }, null);
    expect(steady.painted[0].glow).toEqual({ blur: 0.08 * R, colour: [141, 189, 185, 1] });
    const flashing = drawn(light({ glow: 0.08 }), 0);
    expect(flashing.painted[0].glow).toEqual({ blur: 0.08 * R, colour: [255, 0, 0, 1] });
    // At rest there's no halo at all, and none on a shape that never asked for one.
    expect(drawn(light({ glow: 0.08 }), null).painted[0].glow).toBeUndefined();
    expect(drawn(light(), 0).painted[0].glow).toBeUndefined();
  });

  it("starts a fading shape's gradient in the colour its light is now", () => {
    const shape = light({ fade: { type: "line", to: "glass", from: [-0.05, 0], end: [0.05, 0] } });
    expect(drawn(shape, null).stops).toEqual([
      [0, "rgb(51,0,0)"],
      [1, "rgb(141,189,185)"],
    ]);
    expect(drawn(shape, 0).stops[0]).toEqual([0, "rgb(255,0,0)"]);
  });

  it("wears a light's own colours as it wears the roles, and puts a working one out", () => {
    withFile(
      () => {
        PART_ART.gun1 = { shapes: [light({ glow: 0.08 }), light({ working: true })] };
      },
      () => {
        const whole = painter();
        setArtTime(0);
        drawPartArt(whole.ctx, "gun1", 0);
        setArtTime(null);
        expect(whole.painted.map((each) => each.colour)).toEqual([
          [255, 0, 0, 1],
          [255, 0, 0, 1],
        ]);
        const damaged = painter();
        setArtTime(0);
        drawPartArt(damaged.ctx, "gun1", DAMAGED_AT);
        setArtTime(null);
        // The light dims to the part's hot colour, and the one that only works while it does is gone.
        expect(damaged.painted).toHaveLength(1);
        const scorched = mix([255, 0, 0], [255, 138, 58], 0.75);
        expect(damaged.painted[0].colour).toEqual([...scorched, 1]);
        // Its halo is worn the same way: a damaged part's light doesn't glow brighter than it looks.
        expect(damaged.painted[0].glow).toEqual({ blur: 0.08 * R, colour: [...scorched, 1] });
      },
    );
  });

  it("gives each ship its own time, and two lights on one ship their turns", () => {
    // The renderer adds a phase of its own to each ship's clock, so the same light at two phases is
    // two colours at one moment: that's what makes a field twinkle.
    const shape = light();
    expect(filled(drawn(shape, 0.05))).toEqual([255, 0, 0, 1]);
    expect(filled(drawn(shape, 0.05 + 0.5))).toEqual([51, 0, 0, 1]);
    // And an offset puts the light on the other wingtip out of step with this one.
    const twin = light({ blink: { colour: "#00ff00", rest: "#003300", on: 0.2, off: 0.8, offset: 0.5 } });
    expect(filled(drawn(shape, 0.1))).toEqual([255, 0, 0, 1]);
    expect(filled(drawn(twin, 0.1))).toEqual([0, 51, 0, 1]);
  });

  it("reads a colour change and a glow, and drops the ones that can't draw", () => {
    const file = shipFileNow();
    try {
      file.hulls.racer.shapes = [
        { kind: "circle", role: "body", x: 0, y: 0, r: 0.2, blink: { colour: "#FF0000", on: 0.2, off: 0.8 } },
        // A flash of nothing leaves it still; the glow it also asked for stands on its own.
        { kind: "circle", role: "body", x: 0, y: 0, r: 0.2, blink: { colour: "#ff0000", on: 0, off: 0.8 }, glow: 0.2 },
        { kind: "circle", role: "body", x: 0, y: 0, r: 0.2, blink: { colour: "red", on: 0.2, off: 0.8 } },
        { kind: "circle", role: "body", x: 0, y: 0, r: 0.2, blink: { colour: "#ff0000", on: 0.2, off: -1 } },
        // A rest colour it can't read is left out, so it rests in its role's colour.
        { kind: "circle", role: "body", x: 0, y: 0, r: 0.2, blink: { colour: "#ff0000", on: 0.2, off: 0.8, rest: "nope", offset: 2, fade: true } },
        { kind: "circle", role: "body", x: 0, y: 0, r: 0.2, glow: 0.1 },
        { kind: "circle", role: "body", x: 0, y: 0, r: 0.2, glow: -2 },
      ] as unknown as ArtShape[];
      useShipFile(file);
      const shapes = hullShapes("racer");
      expect(shapes[0].blink).toEqual({ colour: "#ff0000", on: 0.2, off: 0.8 });
      expect(shapes[1].blink).toBeUndefined();
      expect(shapes[1].glow).toBeCloseTo(0.2, 6);
      expect(shapes.slice(2, 4).map((shape) => shape.blink)).toEqual([undefined, undefined]);
      expect(shapes[4].blink).toEqual({ colour: "#ff0000", on: 0.2, off: 0.8, offset: 2, fade: true });
      expect(shapes[5].glow).toBeCloseTo(0.1, 6);
      expect(shapes[6].glow).toBeUndefined();
    } finally {
      useShipFile(file);
    }
  });

  it("keeps a light's fields through a save and a read", () => {
    const shapes: ArtShape[] = [
      {
        kind: "circle",
        role: "glass",
        x: 0.1,
        y: 0,
        r: 0.05,
        glow: 0.08,
        blink: { colour: "#ff0000", rest: "#330000", on: 0.15, off: 1.2, offset: 0.6, fade: true },
      },
      { kind: "circle", role: "body", x: -0.1, y: 0, r: 0.05, blink: { colour: "#00ff00", on: 0.2, off: 0 } },
      { kind: "rect", role: "shade", x: 0, y: 0, w: 0.2, h: 0.1, glow: 1.5 },
    ];
    withFile(
      () => HULL_SHAPES.racer.splice(0, HULL_SHAPES.racer.length, ...shapes),
      () => {
        const file = shipFileNow();
        useShipFile(file);
        expect(hullShapes("racer")).toEqual(shapes);
        expect(shipFileNow()).toEqual(file);
      },
    );
  });

  it("draws every hull and part in the file the same with the art's clock set as still", () => {
    for (const model of SHIP_MODELS) {
      const still = painter();
      setArtTime(null);
      drawHull(still.ctx, model, [120, 150, 190]);
      const moving = painter();
      setArtTime(1.7);
      drawHull(moving.ctx, model, [120, 150, 190]);
      setArtTime(null);
      expect(moving.painted).toEqual(still.painted);
    }
    for (const id of Object.keys(PART_ART) as PartId[]) {
      const still = painter();
      setArtTime(null);
      drawPartArt(still.ctx, id, 0);
      const moving = painter();
      setArtTime(1.7);
      drawPartArt(moving.ctx, id, 0);
      setArtTime(null);
      expect(moving.painted).toEqual(still.painted);
    }
  });
});
