/**
 * Ore in a ship's cargo bay, as the eye sees it: lumps loose in the bay's box that get thrown
 * about as the ship speeds up, slows, turns and spins, and settle into a packed block when
 * it's full. Looks only: the sim knows nothing of it, and every ship keeps its own.
 */

/** One lump, in the box's frame: x along the box's length, y across it. */
interface Lump {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
}

export interface Bin {
  lumps: Lump[];
  /** The ship's velocity and spin last time, for how it's changed. */
  vx: number;
  vy: number;
  spin: number;
  time: number;
}

/** The bay's box in the ship's frame, in world units: its middle, its turn, its size. */
export interface Box {
  x: number;
  y: number;
  angle: number;
  w: number;
  h: number;
}

/** An area of the box, in the box's own frame (centred on its middle): `x`, `y` is its low corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Each lump's size, and how much of the ship's push it feels: enough to slosh, not to vanish. */
const LUMP = 1.5;
const RADIUS = LUMP * 0.42;
const FEEL = 0.05;
/** A little shaking so loose ore never quite settles, more the emptier the bay. */
const RATTLE = 6;
const BOUNCE = 0.55;

/** How many lumps fill the box: a full bay is a packed grid of them. */
export function binRoom(box: Box): number {
  return Math.max(1, Math.floor(box.w / LUMP) * Math.floor(box.h / LUMP));
}

/**
 * Moves the lumps on to `now`. `share` is how full the bay is (0 to 1). The ship's velocity
 * and spin are in the world; `angle` turns them into the ship's frame.
 */
export function stepBin(
  bin: Bin,
  box: Box,
  share: number,
  ship: { vx: number; vy: number; spin: number; angle: number },
  now: number,
  blocked: Rect[] = [],
): void {
  // Parts of the box taken by items: lumps keep out, and the bay holds fewer.
  let taken = 0;
  for (const r of blocked) {
    const w = Math.min(r.x + r.w, box.w / 2) - Math.max(r.x, -box.w / 2);
    const h = Math.min(r.y + r.h, box.h / 2) - Math.max(r.y, -box.h / 2);
    if (w > 0 && h > 0) taken += w * h;
  }
  const freeShare = Math.max(0, 1 - taken / (box.w * box.h));
  const room = Math.round(binRoom(box) * freeShare);
  const want = share <= 0 ? 0 : Math.max(1, Math.min(room, Math.round(share * room)));
  const halfW = box.w / 2 - RADIUS;
  const halfH = box.h / 2 - RADIUS;
  const inside = (l: Lump, r: Rect) => l.x > r.x && l.x < r.x + r.w && l.y > r.y && l.y < r.y + r.h;
  // A lump whose middle is inside a blocked area goes out by the nearest edge, bouncing off it.
  const pushOut = (l: Lump) => {
    for (const r of blocked) {
      if (!inside(l, r)) continue;
      const edges = [
        { d: l.x - r.x, at: r.x, axis: 0, sign: -1 },
        { d: r.x + r.w - l.x, at: r.x + r.w, axis: 0, sign: 1 },
        { d: l.y - r.y, at: r.y, axis: 1, sign: -1 },
        { d: r.y + r.h - l.y, at: r.y + r.h, axis: 1, sign: 1 },
      ];
      // An edge beyond the box's walls would only push the lump out of the box.
      const usable = edges.filter((e) => Math.abs(e.at) <= (e.axis === 0 ? halfW : halfH));
      const pick = (usable.length > 0 ? usable : edges).reduce((a, b) => (b.d < a.d ? b : a));
      if (pick.axis === 0) (l.x = pick.at), (l.vx = pick.sign * Math.abs(l.vx) * BOUNCE);
      else (l.y = pick.at), (l.vy = pick.sign * Math.abs(l.vy) * BOUNCE);
    }
  };
  while (bin.lumps.length < want) {
    const lump = { x: 0, y: 0, vx: 0, vy: 0, color: Math.floor(Math.random() * 3) };
    for (let tries = 0; tries < 30; tries++) {
      lump.x = (Math.random() - 0.5) * 2 * halfW;
      lump.y = (Math.random() - 0.5) * 2 * halfH;
      if (!blocked.some((r) => inside(lump, r))) break;
    }
    bin.lumps.push(lump);
  }
  bin.lumps.length = want;
  const elapsed = Math.min(0.1, Math.max(0, (now - bin.time) / 1000));
  // The change in the ship's motion, into the box's frame: the lumps feel the opposite.
  const ax = elapsed > 0 ? (ship.vx - bin.vx) / elapsed : 0;
  const ay = elapsed > 0 ? (ship.vy - bin.vy) / elapsed : 0;
  const turn = ship.angle + box.angle;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const pushX = -(ax * cos + ay * sin) * FEEL;
  const pushY = -(-ax * sin + ay * cos) * FEEL;
  const spin = ship.spin;
  bin.vx = ship.vx;
  bin.vy = ship.vy;
  bin.spin = spin;
  bin.time = now;
  if (elapsed === 0 || want === 0) return;
  const rattle = RATTLE * (1 - share * 0.85);
  const steps = Math.ceil(elapsed / (1 / 120));
  const dt = elapsed / steps;
  // Measured from the ship's middle, so a spinning ship flings ore to the far side of the box.
  const offX = box.x;
  const offY = box.y;
  for (let step = 0; step < steps; step++) {
    for (const lump of bin.lumps) {
      const cx = offX + lump.x * Math.cos(box.angle) - lump.y * Math.sin(box.angle);
      const cy = offY + lump.x * Math.sin(box.angle) + lump.y * Math.cos(box.angle);
      const flingX = spin * spin * cx * FEEL * 4;
      const flingY = spin * spin * cy * FEEL * 4;
      const bx = flingX * Math.cos(box.angle) + flingY * Math.sin(box.angle);
      const by = -flingX * Math.sin(box.angle) + flingY * Math.cos(box.angle);
      lump.vx += (pushX + bx + (Math.random() - 0.5) * rattle) * dt * 10;
      lump.vy += (pushY + by + (Math.random() - 0.5) * rattle) * dt * 10;
      lump.vx *= 1 - 1.5 * dt;
      lump.vy *= 1 - 1.5 * dt;
      lump.x += lump.vx * dt;
      lump.y += lump.vy * dt;
      if (lump.x < -halfW) (lump.x = -halfW), (lump.vx = Math.abs(lump.vx) * BOUNCE);
      if (lump.x > halfW) (lump.x = halfW), (lump.vx = -Math.abs(lump.vx) * BOUNCE);
      if (lump.y < -halfH) (lump.y = -halfH), (lump.vy = Math.abs(lump.vy) * BOUNCE);
      if (lump.y > halfH) (lump.y = halfH), (lump.vy = -Math.abs(lump.vy) * BOUNCE);
      pushOut(lump);
    }
    // Lumps don't pass through each other: overlapping ones are pushed apart.
    const lumps = bin.lumps;
    for (let i = 0; i < lumps.length; i++) {
      for (let j = i + 1; j < lumps.length; j++) {
        const a = lumps[i];
        const b = lumps[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const least = RADIUS * 2;
        if (distance >= least) continue;
        const nx = distance > 1e-6 ? dx / distance : 1;
        const ny = distance > 1e-6 ? dy / distance : 0;
        const overlap = (least - distance) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (closing < 0) {
          a.vx += nx * closing * 0.5;
          a.vy += ny * closing * 0.5;
          b.vx -= nx * closing * 0.5;
          b.vy -= ny * closing * 0.5;
        }
      }
    }
    if (blocked.length > 0) for (const lump of lumps) pushOut(lump);
  }
}

export function newBin(now: number): Bin {
  return { lumps: [], vx: 0, vy: 0, spin: 0, time: now };
}

/** Draws the lumps, in the ship's frame. */
export function drawBin(ctx: CanvasRenderingContext2D, bin: Bin, box: Box, colors: string[], full: boolean): void {
  ctx.save();
  ctx.translate(box.x, box.y);
  ctx.rotate(box.angle);
  for (const lump of bin.lumps) {
    ctx.fillStyle = colors[lump.color % colors.length];
    ctx.fillRect(lump.x - LUMP * 0.45, lump.y - LUMP * 0.45, LUMP * 0.9, LUMP * 0.9);
  }
  if (full) {
    // A full bay: the box's rim lights up.
    ctx.strokeStyle = "rgba(255, 212, 121, 0.85)";
    ctx.lineWidth = 0.6;
    ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
  }
  ctx.restore();
}
