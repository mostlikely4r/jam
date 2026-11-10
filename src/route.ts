/**
 * Routes between moving places with a body in the way. Pure maths, no world: the caller
 * works in the body's own frame (body at the origin, standing still) and hands in where
 * the start and the target are at any time.
 *
 * Used by the system designer to preview trips. Not yet used by any pilot.
 */

export interface Vec {
  x: number;
  y: number;
}

/** How a ship covers distance: its acceleration, and the speed it won't go past. */
export interface Flight {
  accel: number;
  /** Infinity burns halfway and brakes the rest, as the open world plan's trip times do. */
  cruise: number;
}

export interface Path {
  /** From start to end. Corners bend round the circle; every leg stays outside it. */
  points: Vec[];
  length: number;
  /** Whether it had to bend round the circle at all. */
  bends: boolean;
  /** An end was inside the circle, so it only keeps clear of a circle that fits between them. */
  clipped: boolean;
}

/** The largest step, in radians, between corners where a path follows the circle. */
const ARC_STEP = Math.PI / 12;
const TAU = Math.PI * 2;

function wrap(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

/** Closest a segment comes to the origin. */
function segmentDistance(a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSq));
  return Math.hypot(a.x + dx * t, a.y + dy * t);
}

function polylineLength(points: Vec[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return length;
}

/**
 * The shortest way from `a` to `b` that stays out of a circle of `radius` at the origin:
 * straight if that's clear, else along a tangent, round the circle, and off along another
 * tangent, on whichever side is shorter. The round part is a few straight legs that just
 * touch the circle, so a pilot can fly it as waypoints.
 */
export function pathAround(a: Vec, b: Vec, radius: number): Path {
  const da = Math.hypot(a.x, a.y);
  const db = Math.hypot(b.x, b.y);
  // A start or end inside the circle can't keep out of it: keep out of what fits instead.
  const r = Math.min(radius, da, db) * (radius > Math.min(da, db) ? 0.999 : 1);
  const clipped = r < radius;
  if (r <= 0 || segmentDistance(a, b) >= r) {
    return { points: [a, b], length: Math.hypot(b.x - a.x, b.y - a.y), bends: false, clipped };
  }
  const ta = Math.atan2(a.y, a.x);
  const tb = Math.atan2(b.y, b.x);
  const ha = Math.acos(Math.min(1, r / da));
  const hb = Math.acos(Math.min(1, r / db));
  const build = (direction: 1 | -1): Path => {
    // Where the tangent from `a` touches, and where the one to `b` leaves, going this way round.
    const from = ta + direction * ha;
    const to = tb - direction * hb;
    const sweep = direction === 1 ? wrap(to - from) : wrap(from - to);
    const steps = Math.max(1, Math.ceil(sweep / ARC_STEP));
    const step = sweep / steps;
    // Corners of legs that touch the circle at `from`, every `step`, and `to`.
    const corner = r / Math.cos(step / 2);
    const points: Vec[] = [a];
    for (let i = 0; i < steps; i++) {
      const angle = from + direction * step * (i + 0.5);
      points.push({ x: Math.cos(angle) * corner, y: Math.sin(angle) * corner });
    }
    points.push(b);
    return { points, length: polylineLength(points), bends: true, clipped };
  };
  const left = build(1);
  const right = build(-1);
  return left.length <= right.length ? left : right;
}

/** Seconds to cover a distance from rest to rest, flat out up to the cruise speed. */
export function travelTime(distance: number, flight: Flight): number {
  if (distance <= 0) return 0;
  const { accel, cruise } = flight;
  // Distance spent getting up to cruise speed and back down again.
  const ramps = (cruise * cruise) / accel;
  if (!Number.isFinite(cruise) || distance <= ramps) return 2 * Math.sqrt(distance / accel);
  return (distance - ramps) / cruise + (2 * cruise) / accel;
}

export interface Route {
  path: Path;
  /** Clock times of leaving and arriving. */
  depart: number;
  arrive: number;
  /** Where the target will be on arrival: what the route actually goes to. */
  aim: Vec;
  /** Seconds of it spent matching the target's speed, on top of the trip itself. */
  matching: number;
  /** Whether guessing the arrival time settled. If not, the target outruns the ship. */
  settled: boolean;
}

function velocity(at: (t: number) => Vec, t: number): Vec {
  const h = 0.5;
  const before = at(t - h);
  const after = at(t + h);
  return { x: (after.x - before.x) / (2 * h), y: (after.y - before.y) / (2 * h) };
}

/**
 * A trip leaving `start` now for `target`, both given as positions over time in the
 * body's frame, keeping out of a circle of `radius` round the body.
 *
 * The time is an estimate: a rest-to-rest burn along the path, plus the time to make up
 * the difference between the start's and the target's own motion. Turning, corners and any
 * pull are left out.
 */
export function planRoute(
  start: (t: number) => Vec,
  target: (t: number) => Vec,
  now: number,
  radius: number,
  flight: Flight,
): Route {
  const from = start(now);
  const leaving = velocity(start, now);
  let trip = 0;
  let route: Route | null = null;
  for (let i = 0; i < 40; i++) {
    const arrive = now + trip;
    const aim = target(arrive);
    const path = pathAround(from, aim, radius);
    const arriving = velocity(target, arrive);
    const matching = Math.hypot(arriving.x - leaving.x, arriving.y - leaving.y) / flight.accel;
    const next = travelTime(path.length, flight) + matching;
    const settled = Math.abs(next - trip) < 0.05;
    route = { path, depart: now, arrive, aim, matching, settled };
    if (settled) break;
    // Halfway steps after a while, so a guess that swings back and forth closes in.
    trip = i < 10 ? next : (trip + next) / 2;
  }
  return route!;
}
