/**
 * How ships and what's fitted on them look: vector shapes, drawn in the ship's own frame, nose
 * along +x, in world units. Parts are part of the outline (engine bells, nozzle nubs, a barrel, a
 * dish), each drawn where its mount sits, turned the way it faces and at its size; what's inside
 * the hull (computer, bay) doesn't show. Damaged parts are handed back so the caller can spark them.
 */
import { DAMAGED_AT, facing, HULL_MOUNTS, type Module, type MountId } from "./fitting";
import { partOf, type PartId, type PartKind, type ShipModel } from "./parts";
import { type Box } from "./cargoBin";

const R = 12;

type Point = [number, number];
type Color = [number, number, number];

export const HULL: Record<ShipModel, Point[]> = {
  racer: [[R * 1.25, 0], [-R, -R * 0.8], [-R * 0.55, 0], [-R, R * 0.8]],
  floater: [[R, -R * 0.7], [-R, -R], [-R, R], [R, R * 0.7]],
};

/** What the art needs to know about a ship. */
export interface ArtShip {
  model: ShipModel;
  fit: Partial<Record<MountId, Module>>;
}

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
function outsideParts(ship: ArtShip): { id: MountId; x: number; y: number; angle: number; scale: number; kind: PartKind; wear: number }[] {
  const out: { id: MountId; x: number; y: number; angle: number; scale: number; kind: PartKind; wear: number }[] = [];
  for (const mount of HULL_MOUNTS[ship.model]) {
    const module = ship.fit[mount.id];
    if (!module) continue;
    const kind = partOf(module.part).kind;
    if (kind === "computer" || kind === "section" || kind === "turret" || mount.id === "turretGun") continue;
    // Destroyed, a bay is just the hull's own hold again: see `bayBox`.
    out.push({ id: mount.id, x: mount.x * R, y: mount.y * R, angle: facing(mount), scale: mount.scale, kind, wear: module.wear });
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
  } else if (kind === "computer" || kind === "section") {
    // Inside the hull: only the designer shows these, as an outline.
    ctx.strokeStyle = "rgba(200,215,240,0.7)";
    ctx.lineWidth = 0.5;
    if (kind === "computer") ctx.strokeRect(-2, -2, 4, 4);
    else ctx.strokeRect(-3, -2.2, 6, 4.4);
  }
}

/** The bare hull: plates, edge and cockpit. */
export function drawHull(ctx: CanvasRenderingContext2D, model: ShipModel, hull: Color): void {
  ctx.fillStyle = rgb(hull);
  path(ctx, HULL[model]);
  ctx.fill();
  // A darker belly panel for depth, then a lit edge.
  ctx.save();
  path(ctx, HULL[model]);
  ctx.clip();
  ctx.fillStyle = rgb(mix(hull, [40, 50, 70], 0.22));
  path(ctx, model === "racer" ? [[2, 1.2], [-12, 9.6], [-6.6, 0.2]] : [[12, 2], [-12, 4], [-12, 12], [12, 8.4]]);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(240,246,255,0.85)";
  ctx.lineWidth = 0.7;
  path(ctx, HULL[model]);
  ctx.stroke();
  // Cockpit glass with a glint.
  ctx.fillStyle = "#2b4a74";
  path(ctx, model === "racer" ? [[9.5, 0], [5, -1.9], [3.6, 0], [5, 1.9]] : [[10.6, -5.2], [8.4, -5.6], [8.4, 5.6], [10.6, 5.2]]);
  ctx.fill();
  ctx.fillStyle = "rgba(160,215,255,0.7)";
  if (model === "racer") {
    path(ctx, [[8, -0.4], [5.4, -1.3], [5, -0.6]]);
    ctx.fill();
  } else ctx.fillRect(9, -4.8, 0.8, 3);
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
 * holds, or else the hull's own small hold, where the bay would go (the middle if there's no bay mount).
 */
export function bayBox(ship: ArtShip): Box & { part: PartId | null } {
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
  const cargo = part ? partOf(part).cargo ?? 0 : 0;
  const scale = spot?.scale ?? 1;
  return {
    x: (spot?.x ?? 0) * R,
    y: (spot?.y ?? 0) * R,
    angle: spot ? facing(spot) : 0,
    w: (4.6 + Math.min(4.6, cargo * 0.09)) * scale,
    h: (3.2 + Math.min(2.6, cargo * 0.05)) * scale,
    part,
  };
}

/** The bay's box: a dark well in the hull with a rim, a stronger one for a fitted bay. */
export function drawBay(ctx: CanvasRenderingContext2D, box: Box & { part: PartId | null }): void {
  ctx.save();
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

/** Draws a ship. Returns where broken-but-not-gone parts are, for sparks and smoke. */
export function drawVectorShip(ctx: CanvasRenderingContext2D, ship: ArtShip, hull: Color): Point[] {
  drawHull(ctx, ship.model, hull);
  drawBay(ctx, bayBox(ship));
  const broken: Point[] = [];
  for (const { id, x, y, angle, scale, kind, wear } of outsideParts(ship)) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    drawPart(ctx, kind, wear, id === "thrusterMain");
    ctx.restore();
    if (wear >= 1) {
      // Scorched round where it was.
      const reach = 3.4 * scale;
      const scorch = ctx.createRadialGradient(x, y, 0, x, y, reach);
      scorch.addColorStop(0, "rgba(20,14,12,0.55)");
      scorch.addColorStop(1, "rgba(20,14,12,0)");
      ctx.fillStyle = scorch;
      ctx.beginPath();
      ctx.arc(x, y, reach, 0, Math.PI * 2);
      ctx.fill();
    } else if (wear >= DAMAGED_AT) broken.push([x, y]);
  }
  // Thin smoke from what's broken, drifting off behind.
  const t = performance.now() / 1000;
  for (const [x, y] of broken) {
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.7 + i / 3) % 1;
      ctx.fillStyle = `rgba(150,150,160,${0.28 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(x - p * 9, y + Math.sin(p * 6 + i) * 1.2, 0.8 + p * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return broken;
}
