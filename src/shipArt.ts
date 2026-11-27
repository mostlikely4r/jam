/**
 * How ships and what's fitted on them look: vector shapes, drawn in the ship's own frame, nose
 * along +x, in world units. Parts are part of the outline (engine bells, nozzle nubs, a barrel, a
 * dish), each drawn where its mount sits, turned the way it faces and at its size; what's inside
 * the hull (computer, bay) doesn't show. Damaged parts are handed back so the caller can spark them.
 */
import { firedLit, isLow, quietState, type ArtState } from "./artState";
import { APPROACH_RANGE, DAMAGED_AT, decalOf, facing, hullEdge, hullMounts, hullShapes, isTurretGun, LOW_SHARE, PART_ART, spinPivot, type ArtShape, type HullPoint, type Module, type Mount, type MountId, type ShapeBlink, type ShapeDrive } from "./fitting";
import { partOf, type PartId, type PartKind, type ShipModel, type ThrusterRole } from "./parts";
import type { Box } from "./grid";

const R = 12;

type Point = [number, number];
/** A colour, red, green and blue, 0 to 255 each. */
export type Color = [number, number, number];

/** The most a hull can redden by, its own colour taken toward hot. */
const TINT = [55, -120, -150] as const;

/**
 * A hull's colour as it takes damage: its own colour while whole, further toward red the more of its
 * points it has lost. `max` is the ship's whole hull, so a 300-point hull reads the same as a
 * 100-point one at the same share, and starts at its own colour rather than somewhere past blue.
 */
export function hullTint(base: Color, hull: number, max: number): Color {
  const damage = max > 0 ? Math.max(0, Math.min(1, 1 - Math.max(0, hull) / max)) : 0;
  return [0, 1, 2].map((i) => Math.round(Math.max(0, Math.min(255, base[i] + damage * TINT[i])))) as Color;
}

/** The colours a hull or a part draws its shapes in, worked out once from the colour it starts from. */
export interface ShapePalette {
  body: Color;
  shade: Color;
  rim: Color;
  glass: Color;
  /**
   * How a colour a shape names itself is worn, on a part that takes damage: its blink's rest and
   * flash colours dim with the roles they sit beside. Hulls have none.
   */
  worn?: (colour: Color) => Color;
}

/** The lit edge's own weight, and how transparent it is.	*/
const EDGE_WIDTH = 0.7;
const EDGE_ALPHA = 0.85;

/**
 * The colours a hull draws in: its own body colour, and the shades the art works out from it. A
 * shape says which role it takes, so one drawing serves every hull colour.
 */
export function hullPalette(hull: Color): ShapePalette {
  return { body: hull, shade: mix(hull, [40, 50, 70], 0.22), rim: [240, 246, 255], glass: mix(hull, [110, 200, 255], 0.6) };
}

/**
 * The colours a part draws its own shapes in: its metal, its edge colour, and shades of those, or
 * the shade and glass it names itself.
 */
export function partPalette(colours: PartColors = {}): ShapePalette {
  const metal = colours.metal ?? METAL;
  const rim = colours.rim ?? RIM;
  return {
    body: metal,
    shade: colours.shade ?? mix(metal, [20, 24, 32], 0.4),
    rim,
    glass: colours.glass ?? mix(metal, [170, 255, 230], 0.5),
  };
}

/** Draw order, lower first, as a mount's. */
const byOrder = (a: ArtShape, b: ArtShape) => (a.order ?? 0) - (b.order ?? 0);

/** A shape's angles, in degrees clockwise, as canvas radians. */
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * The paint a shape draws with: a gradient from its colour to `to` or to clear where it has a fade,
 * else its flat colour. `palette` is already worn where the shape is on a part, and `lit` is how
 * lit its colour change is: 1 at the flash, 0 at rest.
 */
function paint(ctx: CanvasRenderingContext2D, shape: ArtShape, palette: ShapePalette, lit: number): string | CanvasGradient {
  const fade = shape.fade;
  const colour = shapeColour(shape, palette, lit);
  if (!fade) return rgb(colour);
  let gradient: CanvasGradient;
  if (fade.type === "line") {
    const [fx, fy] = fade.from ?? [0, 0];
    const [ex, ey] = fade.end ?? [1, 0];
    gradient = ctx.createLinearGradient(fx * R, fy * R, ex * R, ey * R);
  } else {
    const x = (fade.x ?? 0) * R;
    const y = (fade.y ?? 0) * R;
    gradient = ctx.createRadialGradient(x, y, 0, x, y, (fade.reach ?? 1) * R);
  }
  gradient.addColorStop(0, rgb(colour));
  gradient.addColorStop(1, fade.to ? rgb(palette[fade.to]) : rgba(palette[shape.role], 0));
  return gradient;
}

/**
 * A colour a shape names itself, as `#rrggbb`, worn as the roles are: a light on a damaged part dims
 * with it. `fallback` stands in for a colour the file has lost.
 */
function wornColour(palette: ShapePalette, colour: string, fallback: Color): Color {
  const named = colorOf(colour, fallback);
  return palette.worn?.(named) ?? named;
}

/**
 * The colour a shape draws in: its role's, or, where it changes colour, its rest colour carried
 * toward its flash colour by how lit it is. A shape's own colours are worn as the roles are.
 */
function shapeColour(shape: ArtShape, palette: ShapePalette, lit: number): Color {
  const role = palette[shape.role];
  const blink = shape.blink;
  if (!blink) return role;
  // Without a rest colour of its own, the shape rests in the role's, which is already worn.
  const rest = blink.rest ? wornColour(palette, blink.rest, role) : role;
  return mix(rest, wornColour(palette, blink.colour, role), lit);
}

/**
 * How long into its cycle the art is drawn: seconds, or null for still art. Still art draws every
 * blinking shape at its rest colour with no glow of its own, which is what the icons, the menu's
 * ship cards and the ship screen's blueprint want. A steady glow still draws.
 */
let artTime: number | null = null;

/** Sets the art's clock, in seconds, or `null` to draw still art. */
export function setArtTime(seconds: number | null): void {
  artTime = seconds;
}

/**
 * How lit a shape's colour change is at `seconds`: 1 is the flash colour, 0 the rest colour. A snap
 * is full for `on` seconds and dark for `off`; a fade rises to full at half of `on` and back. With
 * `off` 0 a fade breathes with no flat part. The offset shifts the cycle, so lights can take turns.
 */
export function litAmount(blink: ShapeBlink, seconds: number): number {
  const cycle = blink.on + blink.off;
  // Wrapped into its cycle, taking a clock that runs before the shape started as the same cycle.
  let at = (seconds + (blink.offset ?? 0)) % cycle;
  if (at < 0) at += cycle;
  if (at >= blink.on) return 0;
  return blink.fade === true ? Math.sin((Math.PI * at) / blink.on) : 1;
}

/**
 * What's happening to the thing being drawn, for shapes driven by a state, or null for nothing at
 * all: no throttle, no approach, nothing low, no shots. Set beside the clock, the same way.
 */
let artState: ArtState | null = null;
/** Nothing happening, for a drawing that sets no state. */
const QUIET = quietState();

/** Sets what's happening to the thing being drawn, or `null` for nothing. */
export function setArtState(state: ArtState | null): void {
  artState = state;
}

/**
 * The mount the part being drawn sits on: a light on a part reads that part's own state, its
 * thruster's firing or its gun's shot. Null while the hull or a decal draws, which read the whole ship.
 */
export interface ArtMount {
  id: MountId;
  /** The thruster it is, where the mount is one. */
  role?: ThrusterRole;
  /** Whether a gun is what's drawn on it, so a shot light reads its own mount's shots. */
  gun: boolean;
}
let artMount: ArtMount | null = null;

/** Sets the mount the part being drawn sits on, or `null` for the hull's own shapes. Returns the one it replaces. */
export function setArtMount(mount: ArtMount | null): ArtMount | null {
  const was = artMount;
  artMount = mount;
  return was;
}

/** The throttle a shape reads: its own thruster's on a thruster's mount, else the main thruster's. */
function throttleNow(state: ArtState): number {
  const level = state.thrust[artMount?.role ?? "thrusterMain"] ?? 0;
  return Math.max(0, Math.min(1, level));
}

/** Seconds since the shot a shape reads: its own gun's on a gun's mount, else any gun's latest. */
function shotNow(state: ArtState): number | undefined {
  if (artMount?.gun) return state.shotAgo[artMount.id];
  let latest: number | undefined;
  for (const ago of Object.values(state.shotAgo)) if (ago !== undefined && (latest === undefined || ago < latest)) latest = ago;
  return latest;
}

/** Whether a switch is on: a dock near and closing within the shape's range, or its item low. */
function switchOn(drive: ShapeDrive, state: ArtState): boolean {
  if (drive.state === "approach") return state.approach <= (drive.range ?? APPROACH_RANGE);
  if (drive.state === "low") return isLow(state.supply[drive.item], drive.share ?? LOW_SHARE);
  return false;
}

/**
 * How lit a shape's colour change is now: on the clock, or as its drive says. An amount lights it as
 * much as it is; a switch lets it blink on its timing while on; a shot flashes it once. Still art
 * rests every one of them.
 */
function litNow(blink: ShapeBlink): number {
  if (artTime === null) return 0;
  const drive = blink.drive;
  if (!drive) return litAmount(blink, artTime);
  const state = artState ?? QUIET;
  switch (drive.state) {
    case "throttle":
      return throttleNow(state);
    case "fired":
      return firedLit(blink, shotNow(state));
    default:
      return switchOn(drive, state) ? litAmount(blink, artTime) : 0;
  }
}

/**
 * How far a spinning shape is turned now, degrees clockwise: a steady spin by the clock, a driven one
 * by where the state's memory has it. Still art, and a driven spin with no memory, turn nothing.
 */
function spinNow(shape: ArtShape): number {
  const spin = shape.spin;
  if (!spin || artTime === null) return 0;
  const drive = spin.drive;
  if (!drive) return (spin.speed * artTime) % 360;
  const state = artState ?? QUIET;
  if (!state.spins) return 0;
  const share = drive.state === "throttle" ? throttleNow(state) : switchOn(drive, state) ? 1 : 0;
  return state.spins.angle(shape, spin, artMount?.id ?? "", spin.speed * share, artTime);
}

/**
 * The scale the ship is being drawn at: a glow blurs in canvas pixels, so its size takes this.
 * One where the context can't say, as a test's own canvas can't.
 */
function artScale(ctx: CanvasRenderingContext2D): number {
  const t = typeof ctx.getTransform === "function" ? ctx.getTransform() : undefined;
  return t && Number.isFinite(t.a) && t.a > 0 ? Math.hypot(t.a, t.b) : 1;
}

/**
 * The halo round a shape: how far it blurs, in canvas pixels, and its colour. Null when the shape
 * has no glow, or blinks and is at rest. A shape with no colour change glows steadily in its own
 * colour; one that blinks glows in its flash colour, and its halo swells and shrinks with it.
 */
function halo(shape: ArtShape, palette: ShapePalette, lit: number, scale: number): { blur: number; colour: string } | null {
  const glow = shape.glow;
  if (glow === undefined || glow <= 0) return null;
  if (!shape.blink) return { blur: glow * R * scale, colour: rgb(shapeColour(shape, palette, 0)) };
  if (lit <= 0) return null;
  return { blur: glow * R * scale * lit, colour: rgba(wornColour(palette, shape.blink.colour, palette[shape.role]), lit) };
}

/** A polygon's lines through its points, closed back to the first unless it's an open line. */
function polygonPath(ctx: CanvasRenderingContext2D, points: HullPoint[], open: boolean): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x * R, y * R) : ctx.moveTo(x * R, y * R)));
  if (!open) ctx.closePath();
}

/** A ring's two circles, the hole taking the even-odd shape out of the middle. */
function ringPath(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number): void {
  ctx.beginPath();
  ctx.arc(x * R, y * R, outer * R, 0, Math.PI * 2);
  // Moved to the hole's edge, so no line joins the two circles.
  ctx.moveTo(x * R + inner * R, y * R);
  ctx.arc(x * R, y * R, inner * R, 0, Math.PI * 2);
}

/** A wedge: out from the middle along its start angle, round to its end, and back. */
function wedgePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, from: number, to: number): void {
  ctx.beginPath();
  ctx.moveTo(x * R, y * R);
  ctx.arc(x * R, y * R, r * R, radians(from), radians(to));
  ctx.closePath();
}

/** A rect in its own turned frame, its corners rounded where its `corner` says. */
function rectPath(ctx: CanvasRenderingContext2D, shape: ArtShape): void {
  const w = (shape.w ?? 0) * R;
  const h = (shape.h ?? 0) * R;
  ctx.beginPath();
  if (shape.corner !== undefined) {
    const corner = Math.min(shape.corner * R, Math.min(w, h) / 2);
    ctx.roundRect(-w / 2, -h / 2, w, h, corner);
  } else ctx.rect(-w / 2, -h / 2, w, h);
}

/**
 * One shape, in its role's colour or its own gradient: filled, or stroked along its line for the
 * rim, an arc, or an open polygon. `edge` is what it clips against, if it asks to be clipped and
 * there is one.
 */
export function drawShape(ctx: CanvasRenderingContext2D, shape: ArtShape, palette: ShapePalette, edge?: HullPoint[]): void {
  ctx.save();
  if (shape.alpha !== undefined) ctx.globalAlpha *= shape.alpha;
  if (shape.clip && edge && edge.length >= 3) {
    path(ctx, edge.map(([x, y]): Point => [x * R, y * R]));
    ctx.clip();
  }
  // Turned about its pivot where it spins, after the clip, which stays the hull's.
  const turn = shape.spin ? spinNow(shape) : 0;
  if (turn !== 0) {
    const [px, py] = spinPivot(shape);
    ctx.translate(px * R, py * R);
    ctx.rotate(radians(turn));
    ctx.translate(-px * R, -py * R);
  }
  // How lit its colour change is right now: still art rests every blinking shape, so drawings that
  // know nothing about time keep looking as they did.
  const lit = shape.blink ? litNow(shape.blink) : 0;
  const colour = paint(ctx, shape, palette, lit);
  const glow = shape.glow === undefined ? null : halo(shape, palette, lit, artScale(ctx));
  if (glow) {
    ctx.shadowBlur = glow.blur;
    ctx.shadowColor = glow.colour;
  }
  const x = (shape.x ?? 0) * R;
  const y = (shape.y ?? 0) * R;
  // A line through its points is stroked whatever its role: the rim's, an arc's, an open polygon's.
  const line = shape.role === "rim" || shape.kind === "arc" || (shape.kind === "polygon" && (shape.open === true || (shape.points?.length ?? 0) === 2));
  if (line) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = shape.width ?? EDGE_WIDTH;
    switch (shape.kind) {
      case "polygon":
        if (shape.points) polygonPath(ctx, shape.points, shape.open === true || shape.points.length === 2);
        ctx.stroke();
        break;
      case "circle":
        ctx.beginPath();
        ctx.arc(x, y, (shape.r ?? 0) * R, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "ellipse":
        ctx.beginPath();
        ctx.ellipse(x, y, (shape.rx ?? 0) * R, (shape.ry ?? 0) * R, radians(shape.angle ?? 0), 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "arc":
        ctx.beginPath();
        ctx.arc(x, y, (shape.r ?? 0) * R, radians(shape.from ?? 0), radians(shape.to ?? 0));
        ctx.stroke();
        break;
      case "ring":
        // Both circles of it, the hole's and the outer one's.
        for (const r of [shape.r ?? 0, shape.inner ?? 0]) {
          ctx.beginPath();
          ctx.arc(x, y, r * R, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      case "wedge":
        wedgePath(ctx, shape.x ?? 0, shape.y ?? 0, shape.r ?? 0, shape.from ?? 0, shape.to ?? 0);
        ctx.stroke();
        break;
      case "rect":
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(radians(shape.angle ?? 0));
        rectPath(ctx, shape);
        ctx.stroke();
        ctx.restore();
        break;
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = colour;
  switch (shape.kind) {
    case "polygon":
      if (shape.points && shape.points.length >= 3) {
        polygonPath(ctx, shape.points, false);
        ctx.fill();
      }
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(x, y, (shape.r ?? 0) * R, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(x, y, (shape.rx ?? 0) * R, (shape.ry ?? 0) * R, radians(shape.angle ?? 0), 0, Math.PI * 2);
      ctx.fill();
      break;
    case "ring":
      ringPath(ctx, shape.x ?? 0, shape.y ?? 0, shape.r ?? 0, shape.inner ?? 0);
      ctx.fill("evenodd");
      break;
    case "wedge":
      wedgePath(ctx, shape.x ?? 0, shape.y ?? 0, shape.r ?? 0, shape.from ?? 0, shape.to ?? 0);
      ctx.fill();
      break;
    case "rect":
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(radians(shape.angle ?? 0));
      rectPath(ctx, shape);
      ctx.fill();
      ctx.restore();
      break;
    case "arc":
      // An arc is only ever a line: the branch above never falls through to here.
      break;
  }
  ctx.restore();
}

/**
 * Shapes drawn as a hull draws them: the ones that aren't lit edges first, in order, then the
 * rim ones, which are lit edges and go over everything. `edge` is there so clipped shapes can clip;
 * `wear` skips the shapes that only show while the part works.
 */
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: ArtShape[], palette: ShapePalette, edge?: HullPoint[], wear = 0): void {
  const shown = shapes.filter((each) => !(each.working === true && wear >= DAMAGED_AT));
  for (const shape of shown.filter((each) => each.role !== "rim").sort(byOrder)) drawShape(ctx, shape, palette, edge);
  for (const shape of shown.filter((each) => each.role === "rim").sort(byOrder)) drawShape(ctx, shape, palette, edge);
}

/** What the art needs to know about a ship. */
export interface ArtShip {
  model: ShipModel;
  fit: Partial<Record<MountId, Module>>;
  /** The decal each decal mount shows. */
  decals?: Partial<Record<MountId, PartId>>;
}

/** How the fuel in a ship's tanks reads: how full they are, 0 to 1, or null to draw no tank at all. */
export type TankFill = number | null;

const METAL: Color = [111, 122, 140];
const RIM: Color = [190, 200, 216];

/** The colours a part's art starts from, as `#rrggbb`, for the designer's colour pickers. */
export const METAL_HEX = "#6f7a8c";
export const RIM_HEX = "#bec8d8";
const HOT: Color = [255, 138, 58];
const DEAD: Color = [46, 42, 40];

const rgb = (c: Color) => `rgb(${c[0]},${c[1]},${c[2]})`;
const rgba = (c: Color, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/**
 * The dark a tank's or a bay's well is filled with: the part's own metal, kept dark so what it holds
 * reads, or the code's near-black where its art names no metal.
 */
const wellColor = (colours: PartColors | undefined): Color => (colours?.metal ? mix(colours.metal, [14, 18, 28], 0.7) : [14, 18, 28]);

/** A `#rrggbb` colour as the triple the art works in, or `fallback` for anything else. */
export function colorOf(css: string, fallback: Color = METAL): Color {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css.trim());
  return hex ? [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)] : fallback;
}
/** One colour part of the way to another, as the art blends its shades. */
export const mix = (a: Color, b: Color, t: number): Color => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Color;

/** A colour as `#rrggbb`, the way the file and the pickers write it. */
const hex = (c: Color) => `#${c.map((each) => each.toString(16).padStart(2, "0")).join("")}`;

/** The shade and glass a part's art starts from, mixed from its metal: the pickers show these. */
export const SHADE_HEX = hex(partPalette().shade);
export const GLASS_HEX = hex(partPalette().glass);
const partColor = (wear: number, base: Color): Color => (wear >= 1 ? DEAD : wear >= DAMAGED_AT ? mix(base, HOT, 0.75) : base);

function path(ctx: CanvasRenderingContext2D, points: Point[]): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/**
 * The fitted modules worth drawing: everything on the outside, turret and its gun left to
 * `drawTurret`. `main` is a mount whose role is the main thruster, whatever its id, so a mirrored
 * or renamed main mount draws the big engine bell too.
 */
function outsideParts(ship: ArtShip): { id: MountId; part: PartId; x: number; y: number; angle: number; scale: number; kind: PartKind; wear: number; alpha: number; order: number; main: boolean; role?: ThrusterRole }[] {
  const out: { id: MountId; part: PartId; x: number; y: number; angle: number; scale: number; kind: PartKind; wear: number; alpha: number; order: number; main: boolean; role?: ThrusterRole }[] = [];
  for (const mount of hullMounts(ship.model)) {
    const module = ship.fit[mount.id];
    if (!module) continue;
    const kind = partOf(module.part).kind;
    if (kind === "computer" || kind === "section" || kind === "tank" || kind === "turret" || isTurretGun(mount.id)) continue;
    // Destroyed, a bay carries nothing any more: see `bayBox`.
    out.push({ id: mount.id, part: module.part, x: mount.x * R, y: mount.y * R, angle: facing(mount), scale: mount.scale, kind, wear: module.wear, alpha: mount.alpha ?? 1, order: mount.order ?? 0, main: mount.role === "thrusterMain", role: mount.role });
  }
  return out;
}

/** The colours a part's own art names for itself: its metal, its edge, its shade and its glass. */
export interface PartColors {
  metal?: Color;
  rim?: Color;
  shade?: Color;
  glass?: Color;
}

/**
 * One part, drawn at the origin facing +x: a thruster's flame and a gun's shot go that way.
 * `main`: the big engine bell rather than a nozzle nub. `colours`: the part's own, where its art has some.
 */
export function drawPart(ctx: CanvasRenderingContext2D, kind: PartKind, wear: number, main = false, colours: PartColors = {}): void {
  const c = partColor(wear, colours.metal ?? METAL);
  const rim = partColor(wear, colours.rim ?? RIM);
  ctx.lineJoin = "round";
  if (kind === "thruster" && main) {
    const front = -2.5;
    const back = 2;
    const flare = wear >= 1 ? 2.4 : 3.8;
    ctx.fillStyle = rgb(c);
    path(ctx, [[front, -2], [back, -flare], [back, flare], [front, 2]]);
    ctx.fill();
    ctx.strokeStyle = rgb(rim);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(back, -flare);
    ctx.lineTo(back, flare);
    ctx.stroke();
    if (wear < 1) {
      ctx.fillStyle = "#1a1e27";
      ctx.beginPath();
      ctx.ellipse(back - 0.3, 0, 0.6, flare * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "thruster") {
    // A small nozzle nub sticking out the way it fires.
    const len = wear >= 1 ? 0.8 : 1.9;
    const half = 1.3;
    ctx.fillStyle = rgb(c);
    path(ctx, [[-1, -half], [len, -half * 1.25], [len, half * 1.25], [-1, half]]);
    ctx.fill();
    ctx.strokeStyle = rgb(rim);
    ctx.lineWidth = 0.45;
    ctx.stroke();
  } else if (kind === "gun") {
    ctx.fillStyle = rgb(partColor(wear, colours.metal ?? [90, 98, 114]));
    ctx.fillRect(-2, -1.6, 3.4, 3.2);
    ctx.strokeStyle = rgb(c);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(wear >= 1 ? 1.8 : 6.5, 0);
    ctx.stroke();
    if (wear < 1) {
      ctx.strokeStyle = rgb(rim);
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(5.8, 0);
      ctx.lineTo(6.6, 0);
      ctx.stroke();
    }
  } else if (kind === "computer" || kind === "section" || kind === "tank") {
    // Inside the hull: only the designer shows these, as an outline.
    ctx.strokeStyle = "rgba(200,215,240,0.7)";
    ctx.lineWidth = 0.5;
    if (kind === "computer") ctx.strokeRect(-2, -2, 4, 4);
    else if (kind === "tank") ctx.strokeRect(-2.2, -1.4, 4.4, 2.8);
    else ctx.strokeRect(-3, -2.2, 6, 4.4);
  }
}

/**
 * The colours a part's own art draws it in, or none where the art sets none of its own. Shared by
 * everything that draws a part, whether through `drawPartArt` or in its own code.
 */
function artColours(id: PartId): PartColors | undefined {
  const art = PART_ART[id];
  const colours: PartColors = {};
  if (art?.metal) colours.metal = colorOf(art.metal, METAL);
  if (art?.rim) colours.rim = colorOf(art.rim, RIM);
  if (art?.shade) colours.shade = colorOf(art.shade, METAL);
  if (art?.glass) colours.glass = colorOf(art.glass, METAL);
  return colours.metal || colours.rim || colours.shade || colours.glass ? colours : undefined;
}

/**
 * A part drawn as its own art has it: stretched, faded and in its own colours, over whatever the
 * mount or the ship already scales and fades it by. Draws nothing for a part that has no art of its own.
 */
export function drawPartArt(ctx: CanvasRenderingContext2D, id: PartId, wear: number, main = false): void {
  const part = partOf(id);
  const art = PART_ART[id];
  ctx.save();
  if (art?.scaleX !== undefined || art?.scaleY !== undefined) ctx.scale(art.scaleX ?? 1, art.scaleY ?? 1);
  if (art?.alpha !== undefined) ctx.globalAlpha *= art.alpha;
  const colours = artColours(id) ?? {};
  // A part with shapes of its own drawn in the file uses those, worn and scorched as the code's art is.
  if (art?.shapes && art.shapes.length > 0) {
    const palette = partPalette(colours);
    const worn: ShapePalette = {
      body: partColor(wear, palette.body),
      shade: partColor(wear, palette.shade),
      rim: partColor(wear, palette.rim),
      glass: partColor(wear, palette.glass),
      // A light's own colours dim with the part they sit on, as the roles do.
      worn: (colour: Color) => partColor(wear, colour),
    };
    drawShapes(ctx, art.shapes, worn, undefined, wear);
  } else drawPart(ctx, part.kind, wear, main, colours);
  ctx.restore();
}

/**
 * A decal part drawn at the origin facing +x: its shapes in the file, drawn as any fitted part is,
 * at no wear. Cockpit glass and every other decal come through here.
 */
export function drawDecal(ctx: CanvasRenderingContext2D, id: PartId): void {
  ctx.lineJoin = "round";
  const part = partOf(id);
  drawPartArt(ctx, id, 0, part.engine !== undefined);
}

/**
 * The ship's decals, each on its mount: they're looks only. `pick` says which part a mount shows.
 * `layer` picks by the mount's draw order: "below" the hull's own shape, or "above" it.
 */
export function drawDecals(ctx: CanvasRenderingContext2D, model: ShipModel, pick: (mount: Mount) => PartId | null, layer: "below" | "above" = "above"): void {
  for (const mount of hullMounts(model)) {
    if (!mount.decal) continue;
    if (((mount.order ?? 0) < 0) !== (layer === "below")) continue;
    const id = pick(mount);
    if (!id) continue;
    ctx.save();
    ctx.translate(mount.x * R, mount.y * R);
    ctx.rotate(facing(mount));
    ctx.scale(mount.scale, mount.scale);
    if ((mount.alpha ?? 1) < 1) ctx.globalAlpha = mount.alpha!;
    drawDecal(ctx, id);
    ctx.restore();
  }
}

/**
 * A turret mount: a circle on the mount, with the gun fitted on it turning to the aim. Drawn in
 * the ship's own frame, so the caller has already turned the world to the ship's nose.
 */
export interface TurretArt {
  /** Where the mount sits in the ship's frame, world units. */
  x: number;
  y: number;
  /** Where the gun points, in the ship's frame: the mount's resting way, or its aim. */
  angle: number;
  scale: number;
  /** Its mount's transparency. */
  alpha?: number;
  /** The gun fitted on it, if one is, and how worn. */
  gun: Module | null;
  /** The gun's own mount (`turretGunId`), so a light on the gun flashes on that gun's shots. */
  gunMount?: MountId;
  /** The turret's own part, whose art stretches and fades its base; without it the base draws as the code has it. */
  part?: PartId;
  /** The turret's own colours, where it's damaged or tinted; the code's metal and rim otherwise. */
  colours?: PartColors;
}

/** How far a turret's circle reaches, and how big the gun drawn on it is against its own art. */
const TURRET_RADIUS = 4.2;
const TURRET_GUN = 1.8;

export function drawTurret(ctx: CanvasRenderingContext2D, art: TurretArt): void {
  ctx.save();
  if (art.alpha !== undefined && art.alpha < 1) ctx.globalAlpha *= art.alpha;
  ctx.translate(art.x, art.y);
  // The base first, so the gun reads as turning on it. Its own art stretches and fades it, as it
  // stretches and fades the part on any other mount; the gun keeps to its own art.
  const own = art.part ? PART_ART[art.part] : undefined;
  ctx.save();
  if (own?.alpha !== undefined) ctx.globalAlpha *= own.alpha;
  if (own?.scaleX !== undefined || own?.scaleY !== undefined) ctx.scale(own.scaleX ?? 1, own.scaleY ?? 1);
  ctx.fillStyle = rgb(art.colours?.metal ?? METAL);
  ctx.beginPath();
  ctx.arc(0, 0, TURRET_RADIUS * art.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgb(art.colours?.rim ?? RIM);
  ctx.lineWidth = 0.6 * art.scale;
  ctx.stroke();
  ctx.restore();
  if (art.gun) {
    ctx.rotate(art.angle);
    ctx.scale(art.scale * TURRET_GUN, art.scale * TURRET_GUN);
    const was = setArtMount(art.gunMount ? { id: art.gunMount, gun: true } : null);
    drawPartArt(ctx, art.gun.part, art.gun.wear);
    setArtMount(was);
  }
  ctx.restore();
}

/** The bare hull: plates and edge. Decals, such as the cockpit, go on top (`drawDecals`). */
export function drawHull(ctx: CanvasRenderingContext2D, model: ShipModel, hull: Color): void {
  // The outline is the body: what the hull is filled with, and what everything else clips to.
  const edge = hullEdge(model);
  if (edge.length < 3) return;
  const palette = hullPalette(hull);
  ctx.fillStyle = rgb(palette.body);
  path(ctx, edge.map(([x, y]): Point => [x * R, y * R]));
  ctx.fill();
  // Shading, panels and decals over it, in their own order, then the shapes that are lit edges
  // over the lit edge itself, which is the outline.
  const shapes = hullShapes(model);
  drawShapes(ctx, shapes.filter((each) => each.role !== "rim"), palette, edge);
  ctx.strokeStyle = `rgba(${palette.rim[0]},${palette.rim[1]},${palette.rim[2]},${EDGE_ALPHA})`;
  ctx.lineWidth = EDGE_WIDTH;
  path(ctx, edge.map(([x, y]): Point => [x * R, y * R]));
  ctx.stroke();
  // Anything drawn over the lit edge, such as the floater's pale front edge.
  drawShapes(ctx, shapes.filter((each) => each.role === "rim"), palette, edge);
}

/**
 * The box the ship's ore rides in, in the ship's frame: a fitted cargo bay, sized by how much it
 * holds, or else the empty well where a bay would go (the middle if there's no bay mount).
 * A ship without a bay carries nothing at all.
 */
export function bayBox(ship: ArtShip): Box & { part: PartId | null; alpha: number; colours?: PartColors } {
  const mounts = hullMounts(ship.model);
  let spot = mounts.find((mount) => mount.types.includes("cargo bay"));
  let part: PartId | null = null;
  for (const mount of mounts) {
    const module = ship.fit[mount.id];
    if (module && module.wear < 1 && partOf(module.part).kind === "section") {
      spot = mount;
      part = module.part;
      break;
    }
  }
  const bay = part ? partOf(part).bay : undefined;
  // Drawn bigger the more cells it has.
  const cargo = bay ? bay.w * bay.h : 0;
  const scale = spot?.scale ?? 1;
  // And stretched, faded and coloured as its own part's art says, as any other part on a mount is.
  const art = part ? PART_ART[part] : undefined;
  return {
    x: (spot?.x ?? 0) * R,
    y: (spot?.y ?? 0) * R,
    angle: spot ? facing(spot) : 0,
    w: (4.6 + Math.min(4.6, cargo * 0.09)) * scale * (art?.scaleX ?? 1),
    h: (3.2 + Math.min(2.6, cargo * 0.05)) * scale * (art?.scaleY ?? 1),
    part,
    // How transparent its mount draws it, as in game.
    alpha: (spot?.alpha ?? 1) * (art?.alpha ?? 1),
    colours: part ? artColours(part) : undefined,
  };
}

/** The bay's box: a dark well in the hull with a rim, a stronger one for a fitted bay. */
export function drawBay(ctx: CanvasRenderingContext2D, box: Box & { part: PartId | null; alpha?: number; colours?: PartColors }): void {
  ctx.save();
  if ((box.alpha ?? 1) < 1) ctx.globalAlpha = box.alpha!;
  ctx.translate(box.x, box.y);
  ctx.rotate(box.angle);
  ctx.fillStyle = rgba(wellColor(box.colours), 0.85);
  ctx.fillRect(-box.w / 2, -box.h / 2, box.w, box.h);
  ctx.strokeStyle = rgba(box.colours?.rim ?? (box.part ? [200, 212, 232] : [160, 172, 192]), box.part ? 0.9 : 0.5);
  ctx.lineWidth = box.part ? 0.6 : 0.4;
  ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
  if (box.part) {
    // Ribs across a fitted bay.
    ctx.strokeStyle = "rgba(200, 212, 232, 0.25)";
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    for (let x = -box.w / 2 + box.w / 3; x < box.w / 2 - 0.1; x += box.w / 3) {
      ctx.moveTo(x, -box.h / 2);
      ctx.lineTo(x, box.h / 2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** A tank's box on the hull: where its mount sits, how big what it holds draws, and how full it is. */
export interface TankBox extends Box {
  /** How much fuel it holds, full: a bigger tank draws bigger. */
  capacity: number;
  /** How full the ship's tanks are, 0 to 1: a hull with two of them shows the same level in each. */
  fill: number;
  alpha: number;
  /** The tank's own colours, where its art names any. */
  colours?: PartColors;
  /** The tank part and its mount, so shapes drawn on its own art (a running-low lamp) draw over the box. */
  part?: PartId;
  mount?: MountId;
  /** Its mount's size and transparency, which its own art's shapes take as any part's do. */
  scale?: number;
  mountAlpha?: number;
  wear?: number;
}

/**
 * The fuel tanks a ship has fitted and not destroyed, each where its mount sits, in the ship's
 * frame. `fill` is the ship's own level: what its tanks hold between them, against all they could.
 */
export function tankBoxes(ship: ArtShip, fill: number): TankBox[] {
  const boxes: TankBox[] = [];
  for (const mount of hullMounts(ship.model)) {
    const module = ship.fit[mount.id];
    if (!module || module.wear >= 1) continue;
    const capacity = partOf(module.part).tank ?? 0;
    if (capacity <= 0) continue;
    // Stretched, faded and coloured as its own part's art says, as any other part on a mount is.
    const art = PART_ART[module.part];
    boxes.push({
      x: mount.x * R,
      y: mount.y * R,
      angle: facing(mount),
      // Drawn a little bigger the more it holds, as a bay is.
      w: (1.9 + Math.min(1.5, capacity * 0.035)) * mount.scale * (art?.scaleX ?? 1),
      h: (1.4 + Math.min(1.0, capacity * 0.02)) * mount.scale * (art?.scaleY ?? 1),
      capacity,
      fill: Math.max(0, Math.min(1, fill)),
      alpha: (mount.alpha ?? 1) * (art?.alpha ?? 1),
      colours: artColours(module.part),
      part: module.part,
      mount: mount.id,
      scale: mount.scale,
      mountAlpha: mount.alpha ?? 1,
      wear: module.wear,
    });
  }
  return boxes;
}

/**
 * Each tank's box on the hull: a dark well filled amber along its length as it holds fuel, red when
 * nearly empty. It sits inside the hull, faded by its mount, so the level reads through it.
 */
export function drawTanks(ctx: CanvasRenderingContext2D, boxes: TankBox[]): void {
  for (const box of boxes) {
    ctx.save();
    if (box.alpha < 1) ctx.globalAlpha = box.alpha;
    ctx.translate(box.x, box.y);
    ctx.rotate(box.angle);
    ctx.fillStyle = rgba(wellColor(box.colours), 0.8);
    ctx.fillRect(-box.w / 2, -box.h / 2, box.w, box.h);
    const inner = { w: box.w - 0.7, h: box.h - 0.7 };
    if (box.fill > 0) {
      ctx.fillStyle = box.fill < 0.25 ? "#ff6b5c" : "#ffb03a";
      // The level runs the tank's length, its own facing: the fuel sits against the back of it and
      // the front goes dark first as the tank empties.
      ctx.fillRect(-inner.w / 2, -inner.h / 2, inner.w * box.fill, inner.h);
    }
    ctx.strokeStyle = rgba(box.colours?.rim ?? [200, 212, 232], 0.75);
    ctx.lineWidth = 0.45;
    ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
    ctx.restore();
    // Shapes drawn on the tank's own art go over its box, on its mount as any part's do: a lamp
    // that reads the ship's fuel. A tank without shapes of its own draws only the box.
    const shapes = box.part ? PART_ART[box.part]?.shapes : undefined;
    if (box.part && shapes && shapes.length > 0) {
      ctx.save();
      if ((box.mountAlpha ?? 1) < 1) ctx.globalAlpha = box.mountAlpha!;
      ctx.translate(box.x, box.y);
      ctx.rotate(box.angle);
      ctx.scale(box.scale ?? 1, box.scale ?? 1);
      const was = setArtMount(box.mount ? { id: box.mount, gun: false } : null);
      drawPartArt(ctx, box.part, box.wear ?? 0);
      setArtMount(was);
      ctx.restore();
    }
  }
}

/** Draws a ship. Returns where broken-but-not-gone parts are, for sparks and smoke. */
export function drawVectorShip(ctx: CanvasRenderingContext2D, ship: ArtShip, hull: Color, tankFill: TankFill = null): Point[] {
  const parts = outsideParts(ship);
  const drawn: Point[] = [];
  // What sits under the hull itself, then the hull, then everything at the hull level and above,
  // in draw order, so what sticks out past the hull's edge is all that shows of the layers below.
  drawDecals(ctx, ship.model, (mount) => decalOf(ship, mount), "below");
  for (const part of parts.filter((each) => each.order < 0)) {
    const spot = drawFitted(ctx, part);
    if (spot) drawn.push(spot);
  }
  drawHull(ctx, ship.model, hull);
  drawDecals(ctx, ship.model, (mount) => decalOf(ship, mount), "above");
  drawBay(ctx, bayBox(ship));
  if (tankFill !== null) drawTanks(ctx, tankBoxes(ship, tankFill));
  for (const part of parts.filter((each) => each.order >= 0).sort((a, b) => a.order - b.order)) {
    const spot = drawFitted(ctx, part);
    if (spot) drawn.push(spot);
  }
  // Thin smoke from what's broken, drifting off behind.
  const t = performance.now() / 1000;
  for (const [x, y] of drawn) {
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.7 + i / 3) % 1;
      ctx.fillStyle = `rgba(150,150,160,${0.28 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(x - p * 9, y + Math.sin(p * 6 + i) * 1.2, 0.8 + p * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return drawn;
}

/** One fitted module at its mount, with its transparency, and where it sits if it's broken. */
function drawFitted(ctx: CanvasRenderingContext2D, part: { id: MountId; part: PartId; x: number; y: number; angle: number; scale: number; kind: PartKind; wear: number; alpha: number; main: boolean; role?: ThrusterRole }): Point | null {
  ctx.save();
  ctx.translate(part.x, part.y);
  ctx.rotate(part.angle);
  ctx.scale(part.scale, part.scale);
  if (part.alpha < 1) ctx.globalAlpha = part.alpha;
  // Its lights read its own mount: its thruster's firing, its gun's shots.
  const was = setArtMount({ id: part.id, role: part.role, gun: part.kind === "gun" });
  drawPartArt(ctx, part.part, part.wear, part.main);
  setArtMount(was);
  ctx.restore();
  if (part.wear < DAMAGED_AT) return null;
  const x = part.x;
  const y = part.y;
  if (part.wear >= 1) {
    // Scorched round where it was.
    const reach = 3.4 * part.scale;
    ctx.save();
    if (part.alpha < 1) ctx.globalAlpha = part.alpha;
    const scorch = ctx.createRadialGradient(x, y, 0, x, y, reach);
    scorch.addColorStop(0, "rgba(20,14,12,0.55)");
    scorch.addColorStop(1, "rgba(20,14,12,0)");
    ctx.fillStyle = scorch;
    ctx.beginPath();
    ctx.arc(x, y, reach, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return null;
  }
  return [x, y];
}
