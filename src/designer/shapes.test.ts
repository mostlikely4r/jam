/**
 * The shape editor's own rules, tested without a page: the shading a hull starts from, the gradient
 * a shape starts with, the handles that drag it, and where a click lands on it.
 */
import { describe, expect, it } from "vitest";
import { hullEdge, hullShapes, type ArtShape } from "../fitting";
import { defaultShade, dragHandle, fadeStart, hitShape, shapeBounds, shapeGrips } from "./shapes";

/** The shading the defender, the drone and the pirate already carry in the ship file. */
describe("the default shade", () => {
  it("is the one three of the game's own hulls are drawn with", () => {
    for (const model of ["defender", "drone", "pirate"]) {
      const shade = hullShapes(model).find((shape) => shape.role === "shade")!;
      const made = defaultShade(hullEdge(model));
      expect(made).not.toBeNull();
      // Six decimal places, the file's own rounding, so a fresh shading lands where it was measured.
      expect(made!.points).toEqual(shade.points);
      expect(made!.role).toBe("shade");
      expect(made!.clip).toBe(true);
    }
  });

  it("is the outline scaled to 60% about the origin, back a sixth and to one side five twenty-fourths", () => {
    const made = defaultShade([[1, 0], [0, 1], [-1, 0]]);
    expect(made!.points).toEqual([[0.433333, 0.208333], [-0.166667, 0.808333], [-0.766667, 0.208333]]);
  });

  it("has nothing to make from fewer than three points", () => {
    expect(defaultShade([[1, 0], [0, 1]])).toBeNull();
  });
});

describe("the gradient a shape starts with", () => {
  const circle: ArtShape = { kind: "circle", role: "body", x: 0.5, y: 0.2, r: 0.3 };

  it("runs from one side of the shape's box to the other, through its middle", () => {
    const box = shapeBounds(circle);
    // To six places, so a radius landing a hair off a round number doesn't fail the box.
    expect([box.x0, box.y0, box.x1, box.y1].map((each) => Number(each.toFixed(6)))).toEqual([0.2, -0.1, 0.8, 0.5]);
    expect(fadeStart(circle, "line")).toEqual({ type: "line", from: [0.2, 0.2], end: [0.8, 0.2] });
  });

  it("reaches half the box's diagonal from its middle when it's round", () => {
    // A 0.6 × 0.6 box: half its diagonal is 0.424.
    expect(fadeStart(circle, "round")).toEqual({ type: "round", x: 0.5, y: 0.2, reach: 0.424 });
  });

  it("takes its box from a turned ellipse's real extent", () => {
    const turned: ArtShape = { kind: "ellipse", role: "body", x: 0, y: 0, rx: 0.4, ry: 0.1, angle: 90 };
    // Turned a quarter, the long radius lies up and down.
    const box = shapeBounds(turned);
    expect(box.x1 - box.x0).toBeCloseTo(0.2, 3);
    expect(box.y1 - box.y0).toBeCloseTo(0.8, 3);
  });
});

describe("the handles a shape is dragged by", () => {
  const ellipse: ArtShape = { kind: "ellipse", role: "glass", x: 0.1, y: 0, rx: 0.3, ry: 0.2 };

  it("gives an ellipse its middle and one handle at the end of each radius", () => {
    for (const grip of shapeGrips(ellipse)) {
      expect(() => grip.at[0]).not.toThrow();
    }
    const rx = shapeGrips(ellipse).find((grip) => grip.handle === "rx")!;
    const ry = shapeGrips(ellipse).find((grip) => grip.handle === "ry")!;
    expect(rx.at[0]).toBeCloseTo(0.4, 6);
    expect(rx.at[1]).toBeCloseTo(0, 6);
    expect(ry.at[0]).toBeCloseTo(0.1, 6);
    expect(ry.at[1]).toBeCloseTo(0.2, 6);
  });

  it("drags an ellipse's radius out to where the pointer is, and leaves the other alone", () => {
    const wider = dragHandle(ellipse, "rx", [0.7, 0.15]);
    expect(wider.rx).toBeCloseTo(0.6, 6);
    expect(wider.ry).toBe(0.2);
    // The shape it was given is untouched, as `dragPoint` leaves its points.
    expect(ellipse.rx).toBe(0.3);
  });

  it("reads a turned ellipse's radius along its own two axes", () => {
    const turned: ArtShape = { ...ellipse, angle: 90 };
    // Straight up from the middle is along the ellipse's own x, once it's a quarter turn round.
    const dragged = dragHandle(turned, "rx", [0.1, 0.5]);
    expect(dragged.rx).toBeCloseTo(0.5, 6);
    expect(dragged.ry).toBe(0.2);
  });

  it("drags an arc's ends to the pointer's angle, and never lets the two meet", () => {
    const arc: ArtShape = { kind: "arc", role: "rim", x: 0, y: 0, r: 0.4, from: -45, to: 45 };
    const down = dragHandle(arc, "to", [0, -0.4]);
    expect(down.to).toBeCloseTo(-90, 6);
    expect(down.from).toBe(-45);
    // Dragged onto the other end, this one gives way by a degree: two ends that meet draw nothing.
    const met = dragHandle(arc, "to", [0.283, -0.283]);
    expect(met.to).toBeCloseTo(-44, 6);
    expect(met.from).toBe(-45);
  });

  it("sizes a ring's outer edge and its hole, and keeps the hole inside", () => {
    const ring: ArtShape = { kind: "ring", role: "shade", x: 0, y: 0, r: 0.3, inner: 0.1 };
    expect(dragHandle(ring, "outer", [0.5, 0]).r).toBeCloseTo(0.5, 6);
    expect(dragHandle(ring, "inner", [0.2, 0]).inner).toBeCloseTo(0.2, 6);
    // A hole dragged out past the edge stops just inside it.
    expect(dragHandle(ring, "inner", [0.9, 0]).inner).toBeCloseTo(0.29, 6);
  });

  it("moves a middle, snaps to the grid with the key that snaps, and leaves the shape it was given alone", () => {
    const moved = dragHandle(ellipse, "middle", [0.234, -0.717], 0.05);
    expect([moved.x, moved.y]).toEqual([0.25, -0.7]);
    expect([ellipse.x, ellipse.y]).toEqual([0.1, 0]);
  });

  it("walks a gradient's own ends without touching the shape", () => {
    const faded: ArtShape = { ...ellipse, fade: { type: "line", from: [0.2, 0], end: [0.4, 0] } };
    const moved = dragHandle(faded, "fadeEnd", [0.6, 0.1]);
    expect(moved.fade).toEqual({ type: "line", from: [0.2, 0], end: [0.6, 0.1] });
    expect(moved.rx).toBe(0.3);
    // A polygon has no handles of its own: its points are dragged as they were.
    expect(shapeGrips({ kind: "polygon", role: "shade", points: [[0, 0], [1, 0], [0, 1]] })).toEqual([]);
  });
});

describe("where a click lands on a shape", () => {
  it("leaves a ring's hole empty, so a click there goes through it", () => {
    const ring: ArtShape = { kind: "ring", role: "shade", x: 0, y: 0, r: 0.3, inner: 0.1 };
    expect(hitShape(ring, 0.25, 0)).toBe(true);
    expect(hitShape(ring, 0.35, 0)).toBe(false);
    expect(hitShape(ring, 0, 0)).toBe(false);
  });

  it("picks an open line along the line it draws, not inside what it would enclose", () => {
    const open: ArtShape = { kind: "polygon", role: "shade", points: [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2]], open: true };
    expect(hitShape(open, 0.2, 0)).toBe(true);
    // Along the first segment, which runs across the bottom.
    expect(hitShape(open, 0, -0.2)).toBe(true);
    // The middle of the triangle it would close is drawn on by nothing.
    expect(hitShape(open, 0.1, -0.1)).toBe(false);
    // Its second segment, and the gap back to the first point that an open line leaves.
    expect(hitShape(open, 0.2, 0.15)).toBe(true);
    expect(hitShape(open, 0, 0.1)).toBe(false);
    // Closed, the same points are picked from inside.
    const closed: ArtShape = { ...open, open: false };
    expect(hitShape(closed, 0.1, 0)).toBe(true);
  });

  it("lands on the other new kinds inside them, and on an arc only along its line", () => {
    const wedge: ArtShape = { kind: "wedge", role: "shade", x: 0, y: 0, r: 0.3, from: -45, to: 45 };
    expect(hitShape(wedge, 0.2, 0)).toBe(true);
    // Behind the wedge's own diagonal.
    expect(hitShape(wedge, -0.2, 0)).toBe(false);
    const arc: ArtShape = { kind: "arc", role: "rim", x: 0, y: 0, r: 0.3, from: 0, to: 90, width: 0.05 };
    expect(hitShape(arc, 0.3, 0)).toBe(true);
    expect(hitShape(arc, 0.15, 0)).toBe(false);
    expect(hitShape(arc, 0.3, -0.02)).toBe(false);
    const corner: ArtShape = { kind: "rect", role: "shade", x: 0, y: 0, w: 0.4, h: 0.2, corner: 0.05 };
    expect(hitShape(corner, 0.1, 0)).toBe(true);
    expect(hitShape(corner, 0.1, 0.2)).toBe(false);
  });
});
