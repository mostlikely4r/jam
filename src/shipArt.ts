/**
 * How ships and what's fitted on them look: vector shapes, drawn in the ship's own frame, nose
 * along +x, in world units. Parts are part of the outline (engine bells, nozzle nubs, a barrel, a
 * dish), each drawn where its mount sits, turned the way it faces and at its size; what's inside
 * the hull (computer, bay) doesn't show. Damaged parts are handed back so the caller can spark them.
 */
import { DAMAGED_AT, decalOf, facing, HULL_MOUNTS, type Module, type Mount, type MountId } from "./fitting";
import { partOf, type PartId, type PartKind, type ShipModel } from "./parts";
import type { Box } from "./grid";

const R = 12;

type Point = [number, number];
type Color = [number, number, number];

export const HULL: Record<ShipModel, Point[]> = {
  racer: [[R * 1.25, 0], [-R, -R * 0.8], [-R * 0.55, 0], [-R, R * 0.8]],
  floater: [[R, -R * 0.7], [-R, -R], [-R, R], [R, R * 0.7]],
  // A broad shield of a hull.
  defender: [[R * 1.15, 0], [R * 0.35, -R * 0.95], [-R, -R * 0.8], [-R * 0.85, 0], [-R, R * 0.8], [R * 0.35, R * 0.95]],
  // A small boxy work pod.
  drone: [[R, 0], [R * 0.4, -R * 0.7], [-R * 0.9, -R * 0.7], [-R * 0.9, R * 0.7], [R * 0.4, R * 0.7]],
  // Jagged, with a spike on each side.
  pirate: [[R * 1.3, 0], [R * 0.1, -R * 0.4], [-R * 0.2, -R], [-R * 0.5, -R * 0.3], [-R, -R * 0.6], [-R * 0.8, 0], [-R, R * 0.6], [-R * 0.5, R * 0.3], [-R * 0.2, R], [R * 0.1, R * 0.4]],
};

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
const HOT: Color = [255, 138, 58];
const DEAD: Color = [46, 42, 40];

const rgb = (c: Color) => `rgb(${c[0]},${c[1]},${c[2]})`;
const mix = (a: Color, b: Color, t: number): Color => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Color;
const partColor = (wear: number, base: Color): Color => (wear >= 1 ? DEAD : wear >= DAMAGED_AT ? mix(base, HOT, 0.75) : base);

function path(ctx: CanvasRenderingContext2D, points: Point[]): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** The fitted modules worth drawing: everything on the outside, turret and its gun left to the caller. */
function outsideParts(ship: ArtShip): { id: MountId; x: number; y: number; angle: number; scale: number; kind: PartKind; wear: number; alpha: number; order: number }[] {
  const out: { id: MountId; x: number; y: number; angle: number; scale: number; kind: PartKind; wear: number; alpha: number; order: number }[] = [];
  for (const mount of HULL_MOUNTS[ship.model]) {
    const module = ship.fit[mount.id];
    if (!module) continue;
    const kind = partOf(module.part).kind;
    if (kind === "computer" || kind === "section" || kind === "tank" || kind === "turret" || mount.id === "turretGun") continue;
    // Destroyed, a bay carries nothing any more: see `bayBox`.
    out.push({ id: mount.id, x: mount.x * R, y: mount.y * R, angle: facing(mount), scale: mount.scale, kind, wear: module.wear, alpha: mount.alpha ?? 1, order: mount.order ?? 0 });
  }
  return out;
}

/**
 * One part, drawn at the origin facing +x: a thruster's flame and a gun's shot go that way.
 * `main`: the big engine bell rather than a nozzle nub.
 */
export function drawPart(ctx: CanvasRenderingContext2D, kind: PartKind, wear: number, main = false): void {
  const c = partColor(wear, METAL);
  const rim = partColor(wear, RIM);
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
    ctx.fillStyle = rgb(partColor(wear, [90, 98, 114]));
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
  } else if (kind === "tractor") {
    ctx.fillStyle = rgb(partColor(wear, [70, 120, 112]));
    ctx.beginPath();
    ctx.arc(0, 0, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgb(partColor(wear, [150, 230, 210]));
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
  } else if (kind === "computer" || kind === "section" || kind === "tank") {
    // Inside the hull: only the designer shows these, as an outline.
    ctx.strokeStyle = "rgba(200,215,240,0.7)";
    ctx.lineWidth = 0.5;
    if (kind === "computer") ctx.strokeRect(-2, -2, 4, 4);
    else if (kind === "tank") ctx.strokeRect(-2.2, -1.4, 4.4, 2.8);
    else ctx.strokeRect(-3, -2.2, 6, 4.4);
  }
}

/** A darker belly panel for depth: a shape of its own for the first two hulls, else the hull's shrunk and shifted down. */
const BELLY: Partial<Record<ShipModel, Point[]>> = {
  racer: [[2, 1.2], [-12, 9.6], [-6.6, 0.2]],
  floater: [[12, 2], [-12, 4], [-12, 12], [12, 8.4]],
};

/** A decal part drawn at the origin facing +x. Cockpit glass has art of its own; any other part shows as it would fitted. */
export function drawDecal(ctx: CanvasRenderingContext2D, id: PartId): void {
  const glass = "#2b4a74";
  const glint = "rgba(160,215,255,0.7)";
  ctx.lineJoin = "round";
  if (id === "cockpitKite") {
    ctx.fillStyle = glass;
    path(ctx, [[3, 0], [-1.5, -1.9], [-2.9, 0], [-1.5, 1.9]]);
    ctx.fill();
    ctx.fillStyle = glint;
    path(ctx, [[1.5, -0.4], [-1.1, -1.3], [-1.5, -0.6]]);
    ctx.fill();
  } else if (id === "cockpitBar") {
    ctx.fillStyle = glass;
    path(ctx, [[1.1, -5.2], [-1.1, -5.6], [-1.1, 5.6], [1.1, 5.2]]);
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
    path(ctx, [[2.6, -0.5], [1.8, -0.9], [-2.6, -0.9], [-2.6, 0.9], [1.8, 0.9], [2.6, 0.5]]);
    ctx.fill();
    ctx.fillStyle = glint;
    ctx.fillRect(-1.8, -0.6, 2.6, 0.3);
  } else {
    const part = partOf(id);
    drawPart(ctx, part.kind, 0, part.engine !== undefined);
  }
}

/**
 * The ship's decals, each on its mount: they're looks only. `pick` says which part a mount shows.
 * `layer` picks by the mount's draw order: "below" the hull's own shape, or "above" it.
 */
export function drawDecals(ctx: CanvasRenderingContext2D, model: ShipModel, pick: (mount: Mount) => PartId | null, layer: "below" | "above" = "above"): void {
  for (const mount of HULL_MOUNTS[model]) {
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

/** The bare hull: plates and edge. Decals, such as the cockpit, go on top (`drawDecals`). */
export function drawHull(ctx: CanvasRenderingContext2D, model: ShipModel, hull: Color): void {
  ctx.fillStyle = rgb(hull);
  path(ctx, HULL[model]);
  ctx.fill();
  ctx.save();
  path(ctx, HULL[model]);
  ctx.clip();
  ctx.fillStyle = rgb(mix(hull, [40, 50, 70], 0.22));
  path(ctx, BELLY[model] ?? HULL[model].map(([x, y]): Point => [x * 0.6 - 2, y * 0.6 + 2.5]));
  ctx.fill();
  ctx.restore();
  // The lit edge.
  ctx.strokeStyle = "rgba(240,246,255,0.85)";
  ctx.lineWidth = 0.7;
  path(ctx, HULL[model]);
  ctx.stroke();
  if (model === "floater") {
    // The pale front edge that shows which way it faces.
    ctx.strokeStyle = "#f4f8ff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(R, -R * 0.7);
    ctx.lineTo(R, R * 0.7);
    ctx.stroke();
  }
}

/**
 * The box the ship's ore rides in, in the ship's frame: a fitted cargo bay, sized by how much it
 * holds, or else the empty well where a bay would go (the middle if there's no bay mount).
 * A ship without a bay carries nothing at all.
 */
export function bayBox(ship: ArtShip): Box & { part: PartId | null; alpha: number } {
  const mounts = HULL_MOUNTS[ship.model];
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
  return {
    x: (spot?.x ?? 0) * R,
    y: (spot?.y ?? 0) * R,
    angle: spot ? facing(spot) : 0,
    w: (4.6 + Math.min(4.6, cargo * 0.09)) * scale,
    h: (3.2 + Math.min(2.6, cargo * 0.05)) * scale,
    part,
    // How transparent its mount draws it, as in game.
    alpha: spot?.alpha ?? 1,
  };
}

/** The bay's box: a dark well in the hull with a rim, a stronger one for a fitted bay. */
export function drawBay(ctx: CanvasRenderingContext2D, box: Box & { part: PartId | null; alpha?: number }): void {
  ctx.save();
  if ((box.alpha ?? 1) < 1) ctx.globalAlpha = box.alpha!;
  ctx.translate(box.x, box.y);
  ctx.rotate(box.angle);
  ctx.fillStyle = "rgba(14, 18, 28, 0.85)";
  ctx.fillRect(-box.w / 2, -box.h / 2, box.w, box.h);
  ctx.strokeStyle = box.part ? "rgba(200, 212, 232, 0.9)" : "rgba(160, 172, 192, 0.5)";
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
}

/**
 * The fuel tanks a ship has fitted and not destroyed, each where its mount sits, in the ship's
 * frame. `fill` is the ship's own level: what its tanks hold between them, against all they could.
 */
export function tankBoxes(ship: ArtShip, fill: number): TankBox[] {
  const boxes: TankBox[] = [];
  for (const mount of HULL_MOUNTS[ship.model]) {
    const module = ship.fit[mount.id];
    if (!module || module.wear >= 1) continue;
    const capacity = partOf(module.part).tank ?? 0;
    if (capacity <= 0) continue;
    boxes.push({
      x: mount.x * R,
      y: mount.y * R,
      angle: facing(mount),
      // Drawn a little bigger the more it holds, as a bay is.
      w: (1.9 + Math.min(1.5, capacity * 0.035)) * mount.scale,
      h: (1.4 + Math.min(1.0, capacity * 0.02)) * mount.scale,
      capacity,
      fill: Math.max(0, Math.min(1, fill)),
      alpha: mount.alpha ?? 1,
    });
  }
  return boxes;
}

/**
 * Each tank's box on the hull: a dark well filled amber from the bottom as it holds fuel, red when
 * nearly empty. It sits inside the hull, faded by its mount, so the level reads through it.
 */
export function drawTanks(ctx: CanvasRenderingContext2D, boxes: TankBox[]): void {
  for (const box of boxes) {
    ctx.save();
    if (box.alpha < 1) ctx.globalAlpha = box.alpha;
    ctx.translate(box.x, box.y);
    ctx.rotate(box.angle);
    ctx.fillStyle = "rgba(14, 18, 28, 0.8)";
    ctx.fillRect(-box.w / 2, -box.h / 2, box.w, box.h);
    const inner = { w: box.w - 0.7, h: box.h - 0.7 };
    if (box.fill > 0) {
      ctx.fillStyle = box.fill < 0.25 ? "#ff6b5c" : "#ffb03a";
      ctx.fillRect(-inner.w / 2, inner.h / 2 - inner.h * box.fill, inner.w, inner.h * box.fill);
    }
    ctx.strokeStyle = "rgba(200, 212, 232, 0.75)";
    ctx.lineWidth = 0.45;
    ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
    ctx.restore();
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
function drawFitted(ctx: CanvasRenderingContext2D, part: { id: MountId; x: number; y: number; angle: number; scale: number; kind: PartKind; wear: number; alpha: number }): Point | null {
  ctx.save();
  ctx.translate(part.x, part.y);
  ctx.rotate(part.angle);
  ctx.scale(part.scale, part.scale);
  if (part.alpha < 1) ctx.globalAlpha = part.alpha;
  drawPart(ctx, part.kind, part.wear, part.id === "thrusterMain");
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
