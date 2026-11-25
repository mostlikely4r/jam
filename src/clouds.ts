/**
 * Clouds: soft, see-through places you fly into. The look and, later, whatever a cloud does to
 * a ship read one strength from 0 to 1 at every point, worked out here from the shape alone, so
 * the drawing and the effect agree. Pure: nothing here reads the sim (docs/clouds-plan.md).
 */
import { orbitsAt, type Orbit } from "./sim";

/** A cloud's shape: its ellipse, its hole and its fade, as the world file and the game both hold it. */
export interface CloudShape {
  /** The seed its puffs and specks come from: the same cloud is drawn the same every frame. */
  id: string;
  look: "gas" | "dust";
  /** The ellipse's full width and height. */
  width: number;
  height: number;
  /** The hole's edge, as a share of the distance to the cloud's edge. 0 is no hole. */
  ringInner: number;
  /** How far the fade runs, as the same share. 0 is a hard edge, inside and out. */
  falloff: number;
}

/** Where a cloud is at a moment: its centre, and how far it has turned. */
export interface CloudAt {
  x: number;
  y: number;
  /** Radians, turning the same way as every other turn in the game. */
  turn: number;
}

/** A puff inside a gas cloud, or a speck inside a dusty one: the cloud's own unit circle, 0 to 1. */
export interface CloudPuff {
  x: number;
  y: number;
  /** Gas: the puff's radius, as a share of the cloud's. Dust: the speck's size, in screen pixels. */
  size: number;
  /** How bright it is against the cloud at that spot, 0 to 1. */
  brightness: number;
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** How close to a hard edge two gradient stops sit, in edge units: near enough to read as a step. */
const HAIR = 1e-3;

/**
 * The strength at a distance `d` from the centre in edge units, where `d` 1 is the edge. It starts
 * at 0 in a hole, rises from `ringInner` to 1 over `falloff`, holds, then falls from `1 − falloff`
 * to 0 at the edge. Both are shares of the same distance, so a stretched cloud keeps its shape.
 */
export function strengthAt(shape: Pick<CloudShape, "ringInner" | "falloff">, d: number): number {
  if (!(d < 1)) return 0;
  const ring = clamp01(shape.ringInner);
  const fade = clamp01(shape.falloff);
  // With no hole nothing rises, and the cloud is full from the middle out.
  const rising = ring <= 0 ? 1 : fade <= 0 ? (d > ring ? 1 : 0) : clamp01((d - ring) / fade);
  const falling = fade <= 0 ? 1 : clamp01((1 - d) / fade);
  return Math.min(rising, falling);
}

/**
 * The strength of a cloud at a point of the world. The shape is built once, so a turn of the
 * cloud, a stretch of it and a later effect all read the same number.
 */
export function cloudStrength(shape: CloudShape, at: CloudAt, x: number, y: number): number {
  const halfWidth = Math.max(1e-6, shape.width / 2);
  const halfHeight = Math.max(1e-6, shape.height / 2);
  const dx = x - at.x;
  const dy = y - at.y;
  const cos = Math.cos(at.turn);
  const sin = Math.sin(at.turn);
  // Into the cloud's own frame, where the ellipse lies along its own axes.
  const along = (dx * cos + dy * sin) / halfWidth;
  const across = (-dx * sin + dy * cos) / halfHeight;
  return strengthAt(shape, Math.hypot(along, across));
}

/** How far a cloud has turned at a time on the clock, in radians. 0 period stands still. */
export function cloudTurn(spinPeriod: number, spinPhase: number, time: number): number {
  return spinPhase + (spinPeriod === 0 ? 0 : (Math.PI * 2 * time) / spinPeriod);
}

/** Where a cloud is at a time on the clock: its centre from its orbits, and its turn. */
export function cloudAt(cloud: { orbits: Orbit[]; spinPeriod: number; spinPhase: number }, time: number): CloudAt {
  const { x, y } = orbitsAt(cloud.orbits, time);
  return { x, y, turn: cloudTurn(cloud.spinPeriod, cloud.spinPhase, time) };
}

/**
 * The gradient's stops, in edge units, in order: the shape's own corners, plus the crossing where
 * the two fades meet, so a filled gradient is the same rule `strengthAt` gives.
 */
export function cloudStops(shape: Pick<CloudShape, "ringInner" | "falloff">): number[] {
  const ring = clamp01(shape.ringInner);
  const fade = clamp01(shape.falloff);
  const points = [0, 1];
  if (fade > 0) {
    if (ring > 0) points.push(ring, ring + fade);
    points.push(1 - fade);
    // Past the middle of the cloud, the inner fade and the outer one are both running: the
    // smaller of them turns over where they meet, so that is a stop of its own.
    if (ring + fade > 1 - fade) points.push((1 + ring) / 2);
  } else {
    // A hard edge: two stops a hair apart, so it reads as a step rather than a long fade.
    if (ring > 0) points.push(Math.max(0, ring - HAIR), Math.min(1, ring + HAIR));
    points.push(1 - HAIR);
  }
  const inside = points.map((point) => Math.min(1, Math.max(0, point)));
  return [...new Set(inside)].sort((a, b) => a - b);
}

/** The same numbers from the same text every time, so a cloud's inside never changes. */
function seeded(text: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < text.length; i++) state = Math.imul(state ^ text.charCodeAt(i), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A cloud's inside: a few soft puffs for gas, a few hundred specks for dust. Seeded from the
 * cloud's id, so the same cloud looks the same every frame, and kept inside the edge.
 */
export function cloudPuffs(cloud: Pick<CloudShape, "id" | "look">): CloudPuff[] {
  const random = seeded(cloud.id);
  const gas = cloud.look === "gas";
  const puffs: CloudPuff[] = [];
  const count = gas ? 14 : 320;
  for (let i = 0; i < count; i++) {
    const reach = Math.sqrt(random()) * 0.85;
    const angle = random() * Math.PI * 2;
    puffs.push({
      x: Math.cos(angle) * reach,
      y: Math.sin(angle) * reach,
      size: gas ? 0.2 + random() * 0.3 : 0.8 + random() * 1.4,
      brightness: gas ? 0.3 + random() * 0.5 : 0.35 + random() * 0.65,
    });
  }
  return puffs;
}
