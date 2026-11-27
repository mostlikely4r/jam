/**
 * How the things that stand still look: a station, the pirate base and a field deposit, each drawn
 * from its frame (a hull in `src/hulls.json`) with what its parts show on top: the dock's box or
 * ring, the ore and crates in its storage, its tank. Drawn in the thing's own frame, its middle at
 * the origin, already turned: the caller translates and rotates, the way ships are drawn.
 *
 * What a frame's shapes can't carry (a dashed line, a pile that grows with what's stored, the dock
 * lighting up while someone is in it) is drawn here in code, as each part's art, until the part
 * gets art of its own.
 */
import { hullEdge, hullShapes } from "./fitting";
import type { ShipModel } from "./parts";
import { drawShapes, type Color, type ShapePalette } from "./shipArt";

/** The grey a station's deck is drawn in, and the paler grey of its edge. */
export const STATION_BODY: Color = [0x6b, 0x72, 0x80];
export const STATION_RIM: Color = [0xaa, 0xb1, 0xbd];

/** The colours a station, a deposit and the pirate base draw their frames in. */
export function standingPalette(): ShapePalette {
  return { body: STATION_BODY, shade: STATION_BODY, rim: STATION_RIM, glass: STATION_RIM };
}

const ORE_COLORS = ["#ff9d5c", "#6fe0c8", "#e9d36a"];
/** A storage pile is a grid this many lumps across. */
const PILE_ROWS = 12;
const PILE_ORE_PER_LUMP = 5;
/** Crates fill at most this many rows of the pile's grid. */
const CRATE_ROWS = 4;
const CRATE_COLOR = "#7f93b5";
const CRATE_EDGE = "#c4d2ea";
const DOCK_COLOR = "#8fe3a1";

const rgb = (c: Color) => `rgb(${c[0]},${c[1]},${c[2]})`;

/**
 * A frame's shapes, in its own palette, with no outline filled under them: a ship's hull fills its
 * outline first (`drawHull`), but a frame is only its shapes, so it looks exactly as they say.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, model: ShipModel, palette: ShapePalette = standingPalette()): void {
  drawShapes(ctx, hullShapes(model), palette, hullEdge(model));
}

/** A frame's box, from its outline, in world units. */
function frameBox(model: ShipModel): { x: number; y: number; w: number; h: number } {
  const edge = hullEdge(model);
  if (edge.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = edge.map(([x]) => x * 12);
  const ys = edge.map(([, y]) => y * 12);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * A frame under construction: its outline dashed, its body filling in from the bottom as `built`
 * goes from 0 to 1, clipped to the outline.
 */
export function drawConstruction(ctx: CanvasRenderingContext2D, model: ShipModel, built: number, palette: ShapePalette = standingPalette()): void {
  const edge = hullEdge(model);
  if (edge.length < 3) return;
  const box = frameBox(model);
  const outline = () => {
    ctx.beginPath();
    edge.forEach(([x, y], i) => (i ? ctx.lineTo(x * 12, y * 12) : ctx.moveTo(x * 12, y * 12)));
    ctx.closePath();
  };
  ctx.save();
  outline();
  ctx.clip();
  ctx.fillStyle = rgb(palette.body);
  ctx.fillRect(box.x, box.y + box.h - box.h * built, box.w, box.h * built);
  ctx.restore();
  ctx.strokeStyle = rgb(palette.rim);
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  outline();
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Parts as crates along the far edge of a deck `half` across, in front of any ore that reaches them. */
export function drawCrates(ctx: CanvasRenderingContext2D, parts: number, half: number): void {
  const crates = Math.min(PILE_ROWS * CRATE_ROWS, Math.ceil(parts / PILE_ORE_PER_LUMP));
  const pitch = (half * 2) / (PILE_ROWS + 1);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = CRATE_EDGE;
  for (let i = 0; i < crates; i++) {
    ctx.fillStyle = CRATE_COLOR;
    const x = -half + pitch * ((i % PILE_ROWS) + 1);
    const y = -half + pitch * (Math.floor(i / PILE_ROWS) + 1);
    ctx.fillRect(x - pitch * 0.36, y - pitch * 0.36, pitch * 0.72, pitch * 0.72);
    ctx.strokeRect(x - pitch * 0.36, y - pitch * 0.36, pitch * 0.72, pitch * 0.72);
  }
}

/** Ore as lumps on a deck `half` across round the origin, filling up row by row, with no number to read. */
export function drawOrePile(ctx: CanvasRenderingContext2D, ore: number, half: number): void {
  const lumps = Math.min(PILE_ROWS * PILE_ROWS, Math.ceil(ore / PILE_ORE_PER_LUMP));
  const pitch = (half * 2) / (PILE_ROWS + 1);
  for (let i = 0; i < lumps; i++) {
    ctx.fillStyle = ORE_COLORS[(i * 7) % ORE_COLORS.length];
    const x = -half + pitch * ((i % PILE_ROWS) + 1);
    const y = half - pitch * (Math.floor(i / PILE_ROWS) + 1);
    ctx.fillRect(x - pitch * 0.3, y - pitch * 0.3, pitch * 0.6, pitch * 0.6);
  }
}

/** A tank gauge: its outline, and its fuel from the bottom up by `share`. */
export function drawTankGauge(ctx: CanvasRenderingContext2D, x: number, y: number, share: number, w: number, h: number): void {
  ctx.strokeStyle = "rgba(200, 212, 232, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y - h / 2, w, h);
  const fill = Math.max(0, Math.min(1, share));
  if (fill <= 0) return;
  ctx.fillStyle = "#ffb03a";
  ctx.fillRect(x + 1.5, y + h / 2 - 1.5 - (h - 3) * fill, w - 3, (h - 3) * fill);
}

/** A dock's box: a square `half` across each way round its middle, brighter while a ship is in it. */
export function drawDockBox(ctx: CanvasRenderingContext2D, x: number, y: number, half: number, inUse: boolean): void {
  const size = half * 2;
  ctx.fillStyle = inUse ? "rgba(143, 227, 161, 0.2)" : "rgba(143, 227, 161, 0.07)";
  ctx.fillRect(x - half, y - half, size, size);
  ctx.strokeStyle = DOCK_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  ctx.strokeRect(x - half, y - half, size, size);
  ctx.setLineDash([]);
}

/** A round zone, dashed: a deposit's trading ring, the pirate base's docking ring. */
export function drawZone(ctx: CanvasRenderingContext2D, radius: number, fill: string, edge: string): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

/** What a station shows: its frame, whether a ship is in its dock, what it stores, and its tank. */
export interface StationLook {
  frame: ShipModel;
  /** The dock's middle and half its size, in the station's frame. */
  dock: { x: number; y: number; half: number };
  docked: boolean;
  /** Its storage: how much ore and how many parts, on a deck `half` across. */
  ore: number;
  parts: number;
  half: number;
  /** Its own tank, where fuel is on: full, out on the side away from the dock. */
  tank: boolean;
}

/** A station: its dock, its frame, the ore and crates it stores, and its tank. */
export function drawStationArt(ctx: CanvasRenderingContext2D, look: StationLook): void {
  drawDockBox(ctx, look.dock.x, look.dock.y, look.dock.half, look.docked);
  drawFrame(ctx, look.frame);
  drawOrePile(ctx, look.ore, look.half);
  drawCrates(ctx, look.parts, look.half);
  if (look.tank) drawTankGauge(ctx, -look.half - 12, 0, 1, 10, look.half * 1.2);
}

/** What a deposit shows: its frame, how built it is, its trading ring, and the ore it holds. */
export interface DepositLook {
  frame: ShipModel;
  /** 0 to 1: under 1 it is a construction site. */
  built: number;
  /** Its trading ring's radius, and whether the player is inside it. */
  reach: number;
  here: boolean;
  ore: number;
  half: number;
}

/** A deposit: a construction site while it's built, then its trading ring, its deck and the ore on it. */
export function drawDepositArt(ctx: CanvasRenderingContext2D, look: DepositLook): void {
  if (look.built < 1) {
    drawConstruction(ctx, look.frame, look.built);
    return;
  }
  drawZone(ctx, look.reach, look.here ? "rgba(143, 227, 161, 0.14)" : "rgba(143, 227, 161, 0.05)", DOCK_COLOR);
  drawFrame(ctx, look.frame);
  drawOrePile(ctx, look.ore, look.half);
}

/** What the pirate base shows: its frame, its docking ring and the ore it holds. */
export interface PirateBaseLook {
  frame: ShipModel;
  radius: number;
  ore: number;
}

/** The pirate base: its docking ring, its frame (bare as shipped), and its ore. */
export function drawPirateBaseArt(ctx: CanvasRenderingContext2D, look: PirateBaseLook): void {
  drawZone(ctx, look.radius, "rgba(235, 90, 80, 0.08)", "#eb5a50");
  drawFrame(ctx, look.frame);
  drawOrePile(ctx, look.ore, look.radius * 0.65);
}
