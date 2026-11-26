/**
 * The shape editor's own rules, away from the page: where a shape's outline reaches, the handles
 * it's dragged by, the gradient it starts with, the shading a hull starts from, and whether a
 * click lands on it. Plain functions, so they test on their own, as `multiselect.ts` and
 * `undo.ts` do; `hulls.ts` draws the page around them.
 */
import { onGrid, type ArtShape, type HullPoint, type ShapeBlink, type ShapeFade } from "../fitting";

/** A handle a shape is dragged by: its middle, one of its sizes, an angle's end, or its fade's. */
export type ShapeHandle = "middle" | "rx" | "ry" | "outer" | "inner" | "radius" | "from" | "to" | "reach" | "fadeMiddle" | "fadeFrom" | "fadeEnd";

/** One handle on a shape, and where it sits in the shape's own units. */
export interface ShapeGrip {
  handle: ShapeHandle;
  at: HullPoint;
}

/** What a shape's outline covers: a box in its own units, the one its gradient starts across. */
export interface ShapeBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (radians: number) => (radians * 180) / Math.PI;
/** The file's own rounding for points, six places, so a shading lands where it was measured. */
const six = (value: number) => Math.round(value * 1e6) / 1e6;
/** The page's rounding for what's dragged, three places, as `clean` in `hulls.ts`. */
const tidy = (value: number) => Math.round(value * 1000) / 1000;
/** A turn's amount as a spot, whichever way round the angles run. */
const turnTo = (value: number) => (((value % 360) + 360) % 360);

/** Whether a spot is inside a polygon, by counting the edges a ray to the right crosses. */
export function insidePolygon(points: HullPoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether a spot is between two angles, going the way the shape's own angles do. */
function between(angle: number, from: number, to: number): boolean {
  const span = turnTo(to - from);
  return span > 0 && turnTo(angle - from) <= span;
}

/**
 * What a shape's outline covers. A polygon is its points; a round shape its reach; a turned
 * ellipse or rect the box its turn makes; an arc or a wedge the circle it's cut from.
 */
export function shapeBounds(shape: ArtShape): ShapeBox {
  const x = shape.x ?? 0;
  const y = shape.y ?? 0;
  const box = (halfWidth: number, halfHeight: number): ShapeBox => ({ x0: x - halfWidth, y0: y - halfHeight, x1: x + halfWidth, y1: y + halfHeight });
  if (shape.kind === "polygon") {
    const points = shape.points ?? [];
    if (points.length === 0) return box(0, 0);
    const xs = points.map(([px]) => px);
    const ys = points.map(([, py]) => py);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  if (shape.kind === "circle" || shape.kind === "ring" || shape.kind === "arc" || shape.kind === "wedge") {
    const r = shape.r ?? 0;
    return box(r, r);
  }
  const a = radians(shape.angle ?? 0);
  if (shape.kind === "ellipse") {
    const rx = shape.rx ?? 0;
    const ry = shape.ry ?? 0;
    return box(Math.hypot(rx * Math.cos(a), ry * Math.sin(a)), Math.hypot(rx * Math.sin(a), ry * Math.cos(a)));
  }
  const w = (shape.w ?? 0) / 2;
  const h = (shape.h ?? 0) / 2;
  return box(Math.hypot(w * Math.cos(a), h * Math.sin(a)), Math.hypot(w * Math.sin(a), h * Math.cos(a)));
}

/**
 * The shading a hull starts from: its outline scaled to 60% about the origin, back by a sixth of a
 * radius and to one side by five twenty-fourths, in the shade role and clipped to the outline.
 * That's what the defender, the drone and the pirate are drawn with.
 */
export function defaultShade(edge: HullPoint[]): ArtShape | null {
  if (edge.length < 3) return null;
  return { kind: "polygon", role: "shade", clip: true, points: edge.map(([x, y]): HullPoint => [six(x * 0.6 - 1 / 6), six(y * 0.6 + 5 / 24)]) };
}

/**
 * The gradient a shape starts with when one is picked: a line from its left edge to its right edge
 * through the middle, or a round one at its middle reaching half its box's diagonal.
 */
export function fadeStart(shape: ArtShape, type: ShapeFade["type"]): ShapeFade {
  const { x0, y0, x1, y1 } = shapeBounds(shape);
  const middleY = tidy((y0 + y1) / 2);
  if (type === "line") return { type, from: [tidy(x0), middleY], end: [tidy(x1), middleY] };
  return { type, x: tidy((x0 + x1) / 2), y: middleY, reach: tidy(Math.hypot(x1 - x0, y1 - y0) / 2) };
}

/** The flash colour a light starts with: a hot red, which is what a nav light mostly is. */
export const BLINK_FLASH = "#ff6a5c";

/**
 * The colour change a shape starts with when one is turned on: a hot red flashing on for a sixth of
 * a second and off for one and a fifth, resting in its role's colour until it's given one of its own.
 */
export function blinkStart(): ShapeBlink {
  return { colour: BLINK_FLASH, on: 0.15, off: 1.2 };
}

/** What the colour change block's fields say, to be read back into a shape's `blink`. */
export interface BlinkFields {
  /** The flash colour, `#rrggbb`. */
  colour: string;
  /** The rest colour, or null while the shape rests in its role's colour. */
  rest: string | null;
  on: number;
  off: number;
  offset: number;
  fade: boolean;
}

/**
 * The colour change a shape's fields make, or undefined where they can't work: it takes a flash
 * longer than nothing, since a shape that never comes on never changes colour, and a rest that is
 * nothing or more. Times are rounded as the panel's other numbers are.
 */
export function blinkOf(fields: BlinkFields): ShapeBlink | undefined {
  if (!(fields.on > 0) || !(fields.off >= 0)) return undefined;
  const blink: ShapeBlink = { colour: fields.colour.toLowerCase(), on: tidy(fields.on), off: tidy(fields.off) };
  if (fields.rest) blink.rest = fields.rest.toLowerCase();
  if (fields.offset !== 0) blink.offset = tidy(fields.offset);
  if (fields.fade) blink.fade = true;
  return blink;
}

/**
 * The rest colour a light starts with when it's given one of its own: its flash colour, kept dark,
 * so the lens reads as unlit rather than as another colour. A nav light's dark red lens.
 */
export function restFor(colour: string): string {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour.trim());
  if (!hex) return "#3a1a1a";
  const dim = hex.slice(1).map((part) => Math.round(parseInt(part, 16) * 0.35).toString(16).padStart(2, "0"));
  return `#${dim.join("")}`;
}

/** The handles a shape is dragged by. A polygon has none: its points are their own. */
export function shapeGrips(shape: ArtShape): ShapeGrip[] {
  if (shape.kind === "polygon") return [];
  const x = shape.x ?? 0;
  const y = shape.y ?? 0;
  const grips: ShapeGrip[] = [{ handle: "middle", at: [x, y] }];
  const a = radians(shape.angle ?? 0);
  if (shape.kind === "ellipse") {
    const rx = shape.rx ?? 0;
    const ry = shape.ry ?? 0;
    grips.push({ handle: "rx", at: [x + rx * Math.cos(a), y + rx * Math.sin(a)] });
    grips.push({ handle: "ry", at: [x - ry * Math.sin(a), y + ry * Math.cos(a)] });
  } else if (shape.kind === "ring") {
    const r = shape.r ?? 0;
    grips.push({ handle: "outer", at: [x + r, y] });
    grips.push({ handle: "inner", at: [x + (shape.inner ?? 0), y] });
  } else if (shape.kind === "arc" || shape.kind === "wedge") {
    const r = shape.r ?? 0;
    const from = shape.from ?? 0;
    const to = shape.to ?? 0;
    const along = (angle: number): HullPoint => [x + r * Math.cos(radians(angle)), y + r * Math.sin(radians(angle))];
    grips.push({ handle: "radius", at: along((from + to) / 2) });
    grips.push({ handle: "from", at: along(from) });
    grips.push({ handle: "to", at: along(to) });
  }
  const fade = shape.fade;
  if (fade?.type === "line" && fade.from && fade.end) {
    grips.push({ handle: "fadeFrom", at: fade.from });
    grips.push({ handle: "fadeEnd", at: fade.end });
  } else if (fade?.type === "round" && fade.reach !== undefined) {
    grips.push({ handle: "fadeMiddle", at: [fade.x ?? 0, fade.y ?? 0] });
    grips.push({ handle: "reach", at: [(fade.x ?? 0) + fade.reach, fade.y ?? 0] });
  }
  return grips;
}

/** The smallest a size handle may be dragged to, and the closest a ring's hole may come to its edge. */
const LEAST = 0.01;

/**
 * The shape with one handle dragged to a spot, as `dragPoint` moves a polygon's points: a new
 * shape, the one it was given left alone. `step`, when it isn't 0, snaps spots and sizes to the
 * grid and angles to whole degrees, as Shift does elsewhere on the page.
 */
export function dragHandle(shape: ArtShape, handle: ShapeHandle, at: HullPoint, step = 0): ArtShape {
  const next: ArtShape = { ...shape };
  const x = shape.x ?? 0;
  const y = shape.y ?? 0;
  const snap = (value: number) => (step > 0 ? onGrid(value, step) : value);
  const [sx, sy] = [snap(at[0]), snap(at[1])];
  const size = (value: number) => Math.max(LEAST, snap(value));
  const angleTo = (): number => {
    const turned = degrees(Math.atan2(sy - y, sx - x));
    return step > 0 ? Math.round(turned) : Math.round(turned * 10) / 10;
  };
  const fade = next.fade;
  switch (handle) {
    case "middle":
      next.x = sx;
      next.y = sy;
      break;
    case "rx":
    case "ry": {
      const a = radians(shape.angle ?? 0);
      const dx = sx - x;
      const dy = sy - y;
      const across = dx * Math.cos(a) + dy * Math.sin(a);
      const down = -dx * Math.sin(a) + dy * Math.cos(a);
      if (handle === "rx") next.rx = size(Math.abs(across));
      else next.ry = size(Math.abs(down));
      break;
    }
    case "outer":
    case "radius":
      next.r = size(Math.hypot(sx - x, sy - y));
      break;
    case "inner":
      next.inner = Math.min((shape.r ?? 0) - LEAST, size(Math.hypot(sx - x, sy - y)));
      break;
    case "from":
    case "to": {
      const angle = angleTo();
      // The two ends have to differ, or there's nothing to draw: the one dragged gives way.
      if (handle === "from") next.from = angle === shape.to ? angle - 1 : angle;
      else next.to = angle === shape.from ? angle + 1 : angle;
      break;
    }
    case "reach":
      if (fade) next.fade = { ...fade, reach: size(Math.hypot(sx - (fade.x ?? 0), sy - (fade.y ?? 0))) };
      break;
    case "fadeMiddle":
      if (fade) next.fade = { ...fade, x: sx, y: sy };
      break;
    case "fadeFrom":
      if (fade?.type === "line") next.fade = { ...fade, from: [sx, sy] };
      break;
    case "fadeEnd":
      if (fade?.type === "line") next.fade = { ...fade, end: [sx, sy] };
      break;
  }
  return next;
}

/** Whether a spot lies within `limit` of the line from `a` to `b`. */
function nearSegment(a: HullPoint, b: HullPoint, x: number, y: number, limit: number): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  // Where the spot falls along the line, kept to the segment's own ends.
  const along = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length));
  return Math.hypot(x - (a[0] + along * dx), y - (a[1] + along * dy)) <= limit;
}

/** Whether a spot, in the shape's own units, is on it: inside it, or along a line of it. */
export function hitShape(shape: ArtShape, x: number, y: number): boolean {
  if (shape.kind === "polygon") {
    const points = shape.points ?? [];
    if (points.length === 0) return false;
    // A line through its points is picked along the line, not in the middle of what it would
    // enclose if it closed: nothing is drawn there. A rim line of two points is the same thing.
    if (shape.open === true || points.length === 2) {
      const limit = Math.max(0.03, (shape.width ?? 0) / 2);
      const last = points.length - 2;
      for (let i = 0; i <= last; i++) {
        if (nearSegment(points[i], points[i + 1], x, y, limit)) return true;
      }
      return false;
    }
    return insidePolygon(points, x, y);
  }
  const cx = shape.x ?? 0;
  const cy = shape.y ?? 0;
  const a = radians(shape.angle ?? 0);
  const dx = x - cx;
  const dy = y - cy;
  // Turned into the shape's own frame, so a turned ellipse or rect is a plain one.
  const across = dx * Math.cos(a) + dy * Math.sin(a);
  const down = -dx * Math.sin(a) + dy * Math.cos(a);
  const reach = Math.hypot(across, down);
  if (shape.kind === "circle") return reach <= (shape.r ?? 0);
  if (shape.kind === "ring") {
    // A ring's hole is empty: a click in it goes through to whatever is under the ring.
    return reach <= (shape.r ?? 0) && reach >= (shape.inner ?? 0);
  }
  if (shape.kind === "ellipse") {
    const rx = shape.rx ?? 0;
    const ry = shape.ry ?? 0;
    return (across * across) / (rx * rx) + (down * down) / (ry * ry) <= 1;
  }
  if (shape.kind === "arc") {
    const onCircle = Math.abs(reach - (shape.r ?? 0)) <= Math.max(0.03, (shape.width ?? 0.05) / 2);
    return onCircle && between(degrees(Math.atan2(down, across)), shape.from ?? 0, shape.to ?? 0);
  }
  if (shape.kind === "wedge") {
    return reach <= (shape.r ?? 0) && between(degrees(Math.atan2(down, across)), shape.from ?? 0, shape.to ?? 0);
  }
  return Math.abs(across) <= (shape.w ?? 0) / 2 && Math.abs(down) <= (shape.h ?? 0) / 2;
}
