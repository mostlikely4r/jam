/**
 * Two candidate looks for ships and what's fitted on them, next to today's squares, so they
 * can be compared in flight (V, or Settings in the pause menu). Both draw in the ship's own frame, nose
 * along +x, in world units. Damaged parts are handed back so the caller can spark them.
 *
 * Vector: parts are part of the outline (engine bells, nozzle nubs, a barrel, a dish); what's
 * inside the hull (computer, bay) doesn't show. Pixel: one art pixel per world unit, shaded and
 * outlined, built from the same hull shape and mounts, and cached per look.
 */
import { DAMAGED_AT, HULL_MOUNTS, type Module, type MountId } from "./fitting";
import { partOf, type ShipModel } from "./parts";

const R = 12;

/** The looks to choose between, in the order V steps through them. */
export const SHIP_ARTS = ["squares", "vector", "pixel"] as const;
export type ShipArt = (typeof SHIP_ARTS)[number];
export const SHIP_ART_NAMES: Record<ShipArt, string> = { squares: "squares (today's)", vector: "vector shapes", pixel: "pixel art" };

type Point = [number, number];
type Color = [number, number, number];

const HULL: Record<ShipModel, Point[]> = {
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

function inside(points: Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The fitted modules worth drawing: everything on the outside, turret and its gun left to the caller. */
function outsideParts(ship: ArtShip): { id: MountId; x: number; y: number; kind: string; wear: number }[] {
  const out: { id: MountId; x: number; y: number; kind: string; wear: number }[] = [];
  for (const mount of HULL_MOUNTS[ship.model]) {
    const module = ship.fit[mount.id];
    if (!module) continue;
    const kind = partOf(module.part).kind;
    if (kind === "computer" || kind === "section" || kind === "turret" || mount.id === "turretGun") continue;
    out.push({ id: mount.id, x: mount.x * R, y: mount.y * R, kind, wear: module.wear });
  }
  return out;
}

/** Draws the vector look. Returns where broken-but-not-gone parts are, for sparks and smoke. */
export function drawVectorShip(ctx: CanvasRenderingContext2D, ship: ArtShip, hull: Color): Point[] {
  const { model } = ship;
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
  const broken: Point[] = [];
  ctx.lineJoin = "round";
  for (const { id, x, y, kind, wear } of outsideParts(ship)) {
    const c = partColor(wear, METAL);
    const rim = partColor(wear, RIM);
    if (id === "thrusterMain") {
      const back = model === "racer" ? x - 1.5 : x - 2.5;
      const front = model === "racer" ? x + 3 : x + 1.5;
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
        ctx.ellipse(back + 0.3, 0, 0.6, flare * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === "thruster") {
      // A small nozzle nub sticking out the way it fires.
      const len = wear >= 1 ? 0.8 : 1.9;
      const half = 1.3;
      ctx.fillStyle = rgb(c);
      if (id === "thrusterReverse") path(ctx, [[x - 1, y - half], [x + len, y - half * 1.25], [x + len, y + half * 1.25], [x - 1, y + half]]);
      else {
        const dy = y > 0 ? 1 : -1;
        path(ctx, [[x - half, y - dy], [x - half * 1.25, y + dy * len], [x + half * 1.25, y + dy * len], [x + half, y - dy]]);
      }
      ctx.fill();
      ctx.strokeStyle = rgb(rim);
      ctx.lineWidth = 0.45;
      ctx.stroke();
    } else if (kind === "gun") {
      ctx.fillStyle = rgb(partColor(wear, [90, 98, 114]));
      ctx.fillRect(x - 2, y - 1.6, 3.4, 3.2);
      ctx.strokeStyle = rgb(c);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (wear >= 1 ? 1.8 : 6.5), y);
      ctx.stroke();
      if (wear < 1) {
        ctx.strokeStyle = rgb(rim);
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(x + 5.8, y);
        ctx.lineTo(x + 6.6, y);
        ctx.stroke();
      }
    } else if (kind === "tractor") {
      ctx.fillStyle = rgb(partColor(wear, [70, 120, 112]));
      ctx.beginPath();
      ctx.arc(x, y, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgb(partColor(wear, [150, 230, 210]));
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(x - 0.4, y, 1.9, -1.1, 1.1);
      ctx.stroke();
      if (wear < DAMAGED_AT) {
        ctx.fillStyle = "rgba(170,255,230,0.9)";
        ctx.beginPath();
        ctx.arc(x + 0.4, y, 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (wear >= 1) {
      // Scorched round where it was.
      const scorch = ctx.createRadialGradient(x, y, 0, x, y, 3.4);
      scorch.addColorStop(0, "rgba(20,14,12,0.55)");
      scorch.addColorStop(1, "rgba(20,14,12,0)");
      ctx.fillStyle = scorch;
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
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

// ---------- pixel art ----------

const OX = -17;
const OY = -14;
const PW = 39;
const PH = 28;
const PIXEL = {
  outline: "#121826",
  glass: "#2b4a74",
  glassHi: "#9fd6ff",
  metal: "#6f7a8c",
  metalHi: "#b8c3d6",
  metalLo: "#474f5e",
  hole: "#1a1e27",
  hot: "#ff8a3a",
  hotHi: "#ffe08a",
  hotLo: "#b4501c",
  dead: "#2e2a28",
  scorch: "#4a3c36",
  teal: "#4f8a80",
  tealHi: "#a6f0dc",
};

const sprites = new Map<string, HTMLCanvasElement>();

function seeded(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 233280;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

function buildSprite(ship: ArtShip, hull: Color): HTMLCanvasElement {
  const { model } = ship;
  const grid: (string | null)[][] = Array.from({ length: PH }, () => Array<string | null>(PW).fill(null));
  const set = (wx: number, wy: number, c: string | null) => {
    const i = Math.floor(wx - OX);
    const j = Math.floor(wy - OY);
    if (i >= 0 && j >= 0 && i < PW && j < PH) grid[j][i] = c;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) set(x + 0.5, y + 0.5, c);
  };
  const points = HULL[model];
  const ins = (i: number, j: number) => i >= 0 && j >= 0 && i < PW && j < PH && inside(points, OX + i + 0.5, OY + j + 0.5);
  const base = rgb(hull);
  const shade = rgb(mix(hull, [40, 50, 70], 0.25));
  const dark = rgb(mix(hull, [20, 26, 40], 0.45));
  const light = rgb(mix(hull, [255, 255, 255], 0.55));
  for (let j = 0; j < PH; j++) {
    for (let i = 0; i < PW; i++) {
      if (!ins(i, j)) continue;
      let c = OY + j + 0.5 > 1 ? shade : base;
      if (!ins(i, j - 1)) c = light;
      else if (!ins(i, j + 1) || (!ins(i + 1, j) && OY + j + 0.5 > 0)) c = dark;
      grid[j][i] = c;
    }
  }
  // Panel line and cockpit.
  if (model === "racer") {
    for (let y = -3; y <= 3; y++) if (ins(Math.floor(-2 - OX), Math.floor(y - OY))) set(-1.5, y + 0.5, dark);
    rect(4, -1, 9, 1, PIXEL.glass);
    set(7.5, -0.5, PIXEL.glassHi);
    set(6.5, -0.5, PIXEL.glassHi);
  } else {
    for (let y = -9; y <= 8; y++) set(-0.5, y + 0.5, dark);
    rect(8, -5, 10, 5, PIXEL.glass);
    set(8.5, -4.5, PIXEL.glassHi);
    set(8.5, -3.5, PIXEL.glassHi);
  }
  for (const { id, x, y, kind, wear } of outsideParts(ship)) {
    const dead = wear >= 1;
    const hot = wear >= DAMAGED_AT && !dead;
    const m = dead ? PIXEL.dead : hot ? PIXEL.hot : PIXEL.metal;
    const mHi = dead ? PIXEL.dead : hot ? PIXEL.hotHi : PIXEL.metalHi;
    const mLo = dead ? PIXEL.dead : hot ? PIXEL.hotLo : PIXEL.metalLo;
    if (id === "thrusterMain") {
      const back = Math.round(model === "racer" ? x - 2 : x - 3);
      rect(back + 1, -2, back + 4, 2, m);
      rect(back, -3, back + 1, 3, mHi);
      set(back + 1.5, -2.5, mLo);
      set(back + 1.5, 2.5, mLo);
      if (!dead) rect(back + 1, -1, back + 2, 1, PIXEL.hole);
      else {
        set(back + 0.5, -2.5, null);
        set(back + 0.5, 1.5, null);
      }
    } else if (kind === "thruster") {
      if (id === "thrusterReverse") {
        rect(x - 1, y - 1, x + 1, y + 1, m);
        set(x + 0.5, y - 0.5, mHi);
      } else {
        const dy = y > 0 ? 1 : -1;
        rect(x - 1, y - (dy > 0 ? 0 : 1), x + 1, y + (dy > 0 ? 1 : 0), m);
        set(x - 0.5, y + dy * 1.2, dead ? null : mLo);
        set(x + 0.5, y + dy * 1.2, dead ? null : mLo);
      }
    } else if (kind === "gun") {
      rect(x - 2, y - 1, x + 1, y + 1, mLo);
      set(x - 1.5, y - 0.5, mHi);
      rect(x + 1, y - 0.5, x + (dead ? 2 : 6), y + 0.5, m);
      if (!dead) set(x + 6.5, y, mHi);
    } else if (kind === "tractor") {
      rect(x - 1, y - 1, x + 1, y + 1, dead ? PIXEL.dead : hot ? PIXEL.hot : PIXEL.teal);
      set(x + 0.5, y - 0.5, dead ? PIXEL.dead : hot ? PIXEL.hotHi : PIXEL.tealHi);
    }
    if (dead) {
      const random = seeded(x * 13 + y * 7 + 1000);
      for (let k = 0; k < 7; k++) {
        const sx = x + (random() - 0.5) * 6;
        const sy = y + (random() - 0.5) * 5;
        if (ins(Math.floor(sx - OX), Math.floor(sy - OY))) set(sx, sy, PIXEL.scorch);
      }
    }
  }
  // A dark outline round everything.
  const canvas = document.createElement("canvas");
  canvas.width = PW;
  canvas.height = PH;
  const out = canvas.getContext("2d")!;
  for (let j = 0; j < PH; j++) {
    for (let i = 0; i < PW; i++) {
      let c = grid[j][i];
      if (!c && (grid[j - 1]?.[i] || grid[j + 1]?.[i] || grid[j][i - 1] || grid[j][i + 1])) c = PIXEL.outline;
      if (!c) continue;
      out.fillStyle = c;
      out.fillRect(i, j, 1, 1);
    }
  }
  return canvas;
}

/** Draws the pixel look, from a sprite kept per model, colour and state of each part. */
export function drawPixelShip(ctx: CanvasRenderingContext2D, ship: ArtShip, hull: Color): Point[] {
  // Hull colour in steps, so a slowly rising damage tint doesn't make a new sprite every frame.
  const step = hull.map((v) => Math.round(v / 8) * 8) as Color;
  const parts = outsideParts(ship);
  const key = `${ship.model}|${step.join(",")}|${parts.map((p) => `${p.id}:${p.kind}:${p.wear >= 1 ? 2 : p.wear >= DAMAGED_AT ? 1 : 0}`).join(";")}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    if (sprites.size > 400) sprites.clear();
    sprite = buildSprite(ship, step);
    sprites.set(key, sprite);
  }
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, OX, OY, PW, PH);
  ctx.imageSmoothingEnabled = smooth;
  return parts.filter((p) => p.wear >= DAMAGED_AT && p.wear < 1).map((p) => [p.x, p.y]);
}
