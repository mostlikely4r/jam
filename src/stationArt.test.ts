/**
 * The things that stand still, drawn from their frames: the station, the pirate base and a field
 * deposit look exactly as the code drew them before they were frames.
 *
 * The old drawing is kept below as a fixture, the record of what they looked like. A recorder plays
 * both through a canvas that only remembers what ends up painted, worked through every translate,
 * turn and save, so two drawings that paint the same shapes in the same colours match however each
 * got there (a `fillRect` against a `rect` and a `fill`, a colour written `#rrggbb` against `rgb()`).
 */
import { describe, expect, it } from "vitest";
import { hullInfo, isFrame, shipModels, framesFor } from "./fitting";
import { SHIP_MODELS } from "./parts";
import { DEPOSIT_FRAME, DEPOSIT_HALF, PIRATE_BASE_FRAME, PIRATE_BASE_RADIUS, STATION_FRAME, STATION_HALF } from "./sim";
import { drawDepositArt, drawPirateBaseArt, drawStationArt } from "./stationArt";
import { frameMountSpot } from "./frameParts";

/** Where the station frame's dock sits from its middle, along its own axis. */
const DOCK_OFFSET = frameMountSpot("station", "dock")!.x;

// ---------- the old drawing, as `Renderer` had it ----------

const ORE_COLORS = ["#ff9d5c", "#6fe0c8", "#e9d36a"];
const PILE_ROWS = 12;
const PILE_ORE_PER_LUMP = 5;
const CRATE_ROWS = 4;
const CRATE_COLOR = "#7f93b5";
const CRATE_EDGE = "#c4d2ea";

function oldOrePile(ctx: CanvasRenderingContext2D, ore: number, half: number): void {
  const lumps = Math.min(PILE_ROWS * PILE_ROWS, Math.ceil(ore / PILE_ORE_PER_LUMP));
  const pitch = (half * 2) / (PILE_ROWS + 1);
  for (let i = 0; i < lumps; i++) {
    ctx.fillStyle = ORE_COLORS[(i * 7) % ORE_COLORS.length];
    const x = -half + pitch * ((i % PILE_ROWS) + 1);
    const y = half - pitch * (Math.floor(i / PILE_ROWS) + 1);
    ctx.fillRect(x - pitch * 0.3, y - pitch * 0.3, pitch * 0.6, pitch * 0.6);
  }
}

function oldCrates(ctx: CanvasRenderingContext2D, parts: number, half: number): void {
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

function oldTank(ctx: CanvasRenderingContext2D, x: number, y: number, share: number, w: number, h: number): void {
  ctx.strokeStyle = "rgba(200, 212, 232, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y - h / 2, w, h);
  const fill = Math.max(0, Math.min(1, share));
  if (fill <= 0) return;
  ctx.fillStyle = "#ffb03a";
  ctx.fillRect(x + 1.5, y + h / 2 - 1.5 - (h - 3) * fill, w - 3, (h - 3) * fill);
}

interface Station {
  x: number;
  y: number;
  rotation: number;
  docked: boolean;
  ore: number;
  parts: number;
  fuel: boolean;
}

function oldStation(ctx: CanvasRenderingContext2D, { x, y, rotation, docked, ore, parts, fuel }: Station): void {
  const size = STATION_HALF * 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  const dockX = DOCK_OFFSET - STATION_HALF;
  const dockY = -STATION_HALF;
  ctx.fillStyle = docked ? "rgba(143, 227, 161, 0.2)" : "rgba(143, 227, 161, 0.07)";
  ctx.fillRect(dockX, dockY, size, size);
  ctx.strokeStyle = "#8fe3a1";
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  ctx.strokeRect(dockX, dockY, size, size);
  ctx.setLineDash([]);
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(-STATION_HALF, -STATION_HALF, size, size);
  ctx.strokeStyle = "#aab1bd";
  ctx.lineWidth = 3;
  ctx.strokeRect(-STATION_HALF, -STATION_HALF, size, size);
  oldOrePile(ctx, ore, STATION_HALF);
  oldCrates(ctx, parts, STATION_HALF);
  if (fuel) oldTank(ctx, -STATION_HALF - 12, 0, 1, 10, STATION_HALF * 1.2);
  ctx.restore();
}

interface Deposit {
  x: number;
  y: number;
  partsLeft: number;
  partsUsed: number;
  here: boolean;
  ore: number;
}

const DEPOSIT_REACH = 150;

function oldDepositFrame(ctx: CanvasRenderingContext2D, x: number, y: number, built: number): void {
  const size = DEPOSIT_HALF * 2;
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(x - DEPOSIT_HALF, y + DEPOSIT_HALF - size * built, size, size * built);
  ctx.strokeStyle = "#aab1bd";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(x - DEPOSIT_HALF, y - DEPOSIT_HALF, size, size);
  ctx.setLineDash([]);
}

function oldDeposit(ctx: CanvasRenderingContext2D, deposit: Deposit): void {
  const { x, y } = deposit;
  if (deposit.partsLeft > 0) {
    oldDepositFrame(ctx, x, y, deposit.partsUsed / (deposit.partsUsed + deposit.partsLeft));
    return;
  }
  ctx.fillStyle = deposit.here ? "rgba(143, 227, 161, 0.14)" : "rgba(143, 227, 161, 0.05)";
  ctx.strokeStyle = "#8fe3a1";
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.arc(x, y, DEPOSIT_REACH, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(-DEPOSIT_HALF, -DEPOSIT_HALF, DEPOSIT_HALF * 2, DEPOSIT_HALF * 2);
  ctx.strokeStyle = "#aab1bd";
  ctx.lineWidth = 3;
  ctx.strokeRect(-DEPOSIT_HALF, -DEPOSIT_HALF, DEPOSIT_HALF * 2, DEPOSIT_HALF * 2);
  oldOrePile(ctx, deposit.ore, DEPOSIT_HALF);
  ctx.restore();
}

function oldPirateBase(ctx: CanvasRenderingContext2D, x: number, y: number, ore: number): void {
  ctx.fillStyle = "rgba(235, 90, 80, 0.08)";
  ctx.strokeStyle = "#eb5a50";
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.arc(x, y, PIRATE_BASE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.save();
  ctx.translate(x, y);
  oldOrePile(ctx, ore, PIRATE_BASE_RADIUS * 0.65);
  ctx.restore();
}

// ---------- the recorder ----------

/** A step of a path, in world units after every transform: a point, or an arc's middle, radius and angles. */
type Step = ["at", number, number] | ["arc", number, number, number, number, number];

/** What ends up painted: a filled or stroked path, in what colour, how wide, how dashed. */
interface Paint {
  op: "fill" | "stroke";
  colour: number[];
  width?: number;
  dash?: number[];
  path: { steps: Step[]; closed: boolean }[];
}

const round = (value: number) => Math.round(value * 1e4) / 1e4 + 0;

/** A canvas colour as red, green, blue and alpha, the alpha taken with the canvas's own. */
function colourOf(style: string, alpha: number): number[] {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(style);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16), round(alpha)];
  const fn = /^rgba?\(([^)]*)\)$/.exec(style.replace(/\s+/g, ""));
  if (!fn) throw new Error(`A colour the recorder can't read: ${style}`);
  const [r, g, b, a = 1] = fn[1].split(",").map(Number);
  return [r, g, b, round(a * alpha)];
}

/** A matrix, as the canvas keeps one: [a, b, c, d, e, f]. */
type Matrix = [number, number, number, number, number, number];

/** A canvas that remembers what it painted, in world units, and nothing about how. */
function recorder(): { ctx: CanvasRenderingContext2D; painted: Paint[] } {
  const painted: Paint[] = [];
  interface State {
    m: Matrix;
    fill: string;
    stroke: string;
    width: number;
    alpha: number;
    dash: number[];
  }
  let state: State = { m: [1, 0, 0, 1, 0, 0], fill: "#000000", stroke: "#000000", width: 1, alpha: 1, dash: [] };
  const stack: State[] = [];
  let path: { steps: Step[]; closed: boolean }[] = [];
  const point = (x: number, y: number): [number, number] => {
    const [a, b, c, d, e, f] = state.m;
    return [round(a * x + c * y + e), round(b * x + d * y + f)];
  };
  const turn = () => Math.atan2(state.m[1], state.m[0]);
  const scale = () => Math.hypot(state.m[0], state.m[1]);
  const multiply = (n: Matrix) => {
    const [a, b, c, d, e, f] = state.m;
    state.m = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3], b * n[2] + d * n[3], a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f];
  };
  const current = () => {
    if (path.length === 0) path.push({ steps: [], closed: false });
    return path[path.length - 1];
  };
  const rectPath = (x: number, y: number, w: number, h: number) => ({
    steps: [["at", ...point(x, y)], ["at", ...point(x + w, y)], ["at", ...point(x + w, y + h)], ["at", ...point(x, y + h)]] as Step[],
    closed: true,
  });
  const paint = (op: "fill" | "stroke", shape: { steps: Step[]; closed: boolean }[]) => {
    painted.push({
      op,
      colour: colourOf(op === "fill" ? state.fill : state.stroke, state.alpha),
      ...(op === "stroke" ? { width: round(state.width * scale()), dash: [...state.dash] } : {}),
      path: shape.filter((each) => each.steps.length > 0).map((each) => ({ steps: [...each.steps], closed: each.closed })),
    });
  };
  const methods: Record<string, (...args: never[]) => unknown> = {
    save: () => void stack.push({ ...state, m: [...state.m] as Matrix, dash: [...state.dash] }),
    restore: () => void (state = stack.pop() ?? state),
    translate: (x: number, y: number) => multiply([1, 0, 0, 1, x, y]),
    rotate: (angle: number) => multiply([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]),
    scale: (x: number, y: number) => multiply([x, 0, 0, y, 0, 0]),
    setLineDash: (dash: number[]) => void (state.dash = [...dash]),
    beginPath: () => void (path = []),
    moveTo: (x: number, y: number) => void path.push({ steps: [["at", ...point(x, y)]], closed: false }),
    lineTo: (x: number, y: number) => void current().steps.push(["at", ...point(x, y)]),
    closePath: () => void (current().closed = true),
    rect: (x: number, y: number, w: number, h: number) => void path.push(rectPath(x, y, w, h)),
    arc: (x: number, y: number, r: number, from: number, to: number) =>
      void current().steps.push(["arc", ...point(x, y), round(r * scale()), round(from + turn()), round(to + turn())]),
    fill: () => paint("fill", path),
    stroke: () => paint("stroke", path),
    fillRect: (x: number, y: number, w: number, h: number) => paint("fill", [rectPath(x, y, w, h)]),
    strokeRect: (x: number, y: number, w: number, h: number) => paint("stroke", [rectPath(x, y, w, h)]),
    // A clip keeps a drawing inside an outline. Every clip here is a frame's own outline round
    // what it clips, so it changes nothing that's painted.
    clip: () => undefined,
  };
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, name: string) => {
      if (name === "globalAlpha") return state.alpha;
      if (name === "getTransform") return undefined;
      const method = methods[name];
      if (!method) throw new Error(`The recorder has no ${name}`);
      return method;
    },
    set: (_target, name: string, value) => {
      if (name === "fillStyle") state.fill = String(value);
      else if (name === "strokeStyle") state.stroke = String(value);
      else if (name === "lineWidth") state.width = Number(value);
      else if (name === "globalAlpha") state.alpha = Number(value);
      else throw new Error(`The recorder can't set ${name}`);
      return true;
    },
  });
  return { ctx, painted };
}

/** What a drawing paints, played through the recorder. */
function paints(draw: (ctx: CanvasRenderingContext2D) => void): Paint[] {
  const { ctx, painted } = recorder();
  draw(ctx);
  return painted;
}

// ---------- the tests ----------

describe("the things that stand still, as frames", () => {
  it("draws the station exactly as the code did: dock, deck, ore, crates and tank, at any turn", () => {
    const cases: Station[] = [
      { x: 1200, y: -400, rotation: 0.7, docked: false, ore: 0, parts: 0, fuel: false },
      { x: -50, y: 80, rotation: -2.1, docked: true, ore: 123, parts: 37, fuel: true },
      { x: 0, y: 0, rotation: 0, docked: false, ore: 5000, parts: 900, fuel: true },
    ];
    for (const station of cases) {
      const before = paints((ctx) => oldStation(ctx, station));
      const now = paints((ctx) => {
        ctx.save();
        ctx.translate(station.x, station.y);
        ctx.rotate(station.rotation);
        drawStationArt(ctx, {
          frame: STATION_FRAME,
          dock: { x: DOCK_OFFSET, y: 0, half: STATION_HALF },
          docked: station.docked,
          ore: station.ore,
          parts: station.parts,
          half: STATION_HALF,
          tank: station.fuel,
        });
        ctx.restore();
      });
      expect(now.length).toBeGreaterThan(3);
      expect(now).toEqual(before);
    }
  });

  it("draws a deposit exactly as the code did at nothing, half and fully built", () => {
    const cases: Deposit[] = [
      { x: 300, y: -900, partsLeft: 6, partsUsed: 0, here: false, ore: 0 },
      { x: 300, y: -900, partsLeft: 3, partsUsed: 3, here: false, ore: 0 },
      { x: -700, y: 40, partsLeft: 0, partsUsed: 6, here: false, ore: 48 },
      { x: -700, y: 40, partsLeft: 0, partsUsed: 6, here: true, ore: 2000 },
    ];
    for (const deposit of cases) {
      const before = paints((ctx) => oldDeposit(ctx, deposit));
      const now = paints((ctx) => {
        ctx.save();
        ctx.translate(deposit.x, deposit.y);
        drawDepositArt(ctx, {
          frame: DEPOSIT_FRAME,
          built: deposit.partsLeft > 0 ? deposit.partsUsed / (deposit.partsUsed + deposit.partsLeft) : 1,
          reach: DEPOSIT_REACH,
          here: deposit.here,
          ore: deposit.ore,
          half: DEPOSIT_HALF,
        });
        ctx.restore();
      });
      expect(now).toEqual(before);
    }
  });

  it("draws the pirate base exactly as the code did: its ring and its ore", () => {
    for (const ore of [0, 77, 4000]) {
      const before = paints((ctx) => oldPirateBase(ctx, 2500, 1800, ore));
      const now = paints((ctx) => {
        ctx.save();
        ctx.translate(2500, 1800);
        drawPirateBaseArt(ctx, { frame: PIRATE_BASE_FRAME, radius: PIRATE_BASE_RADIUS, ore });
        ctx.restore();
      });
      expect(now).toEqual(before);
    }
  });

  it("keeps the frames out of every list of ships, and offers each to its own kind of node", () => {
    for (const frame of [STATION_FRAME, PIRATE_BASE_FRAME, DEPOSIT_FRAME]) {
      expect(SHIP_MODELS).toContain(frame);
      expect(isFrame(frame)).toBe(true);
      expect(shipModels()).not.toContain(frame);
      expect(hullInfo(frame).usedBy).not.toContain("newGame");
    }
    expect(framesFor("station")).toEqual([STATION_FRAME]);
    expect(framesFor("pirateBase")).toEqual([PIRATE_BASE_FRAME]);
    expect(framesFor("deposit")).toEqual([DEPOSIT_FRAME]);
    expect(shipModels().sort()).toEqual(["defender", "drone", "floater", "floaterCopy", "pirate", "racer"]);
  });
});
