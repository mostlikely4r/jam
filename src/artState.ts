/**
 * What's happening to a ship, handed to its art: the snapshot shapes driven by a state read. The art
 * never reads a `Ship` (a station will draw through the same shapes), so each thing drawn hands it
 * one of these, built here. The rules it's built from sit beside it, plain, so they test without a
 * canvas: whether a ship is closing on a dock, what counts as running low, how a shot's flash dies
 * away, how a driven spin eases, and how an approach light holds on for a moment.
 */
import { LOW_SHARE, tankCapacity, type ArtShape, type MountId, type ShapeBlink, type ShapeSpin } from "./fitting";
import type { ThrusterRole } from "./parts";
import { TICK, type Ship, type Sim } from "./sim";

/** What's happening to the thing being drawn, for shapes driven by a state. */
export interface ArtState {
  /** Each thruster's firing, 0 to 1, by its role. Missing is 0. */
  thrust: Partial<Record<ThrusterRole, number>>;
  /** Distance to the nearest dock it's closing on (a station: to the nearest ship closing on its dock). Infinity for none. */
  approach: number;
  /** How full it is of each item it consumes, 0 to 1, by the item's id. An item it can't hold is missing. */
  supply: Partial<Record<string, number>>;
  /** Seconds since each gun mount last fired. Missing means never (or not since loading). */
  shotAgo: Partial<Record<MountId, number>>;
  /** Where its driven spins have got to, kept between frames by whoever draws it. None: they hold still. */
  spins?: SpinMemory;
}

/** Nothing happening: what still art and a ship with no state of its own are drawn with. */
export function quietState(): ArtState {
  return { thrust: {}, approach: Infinity, supply: {}, shotAgo: {} };
}

/**
 * The least a ship has to close on a dock by, in world units a second, to count as approaching: a
 * ship holding still beside a dock, or sitting in it, doesn't light up.
 */
export const APPROACH_MIN_CLOSING = 2;
/** Seconds an approach stays lit once it stops being true, so a light doesn't flicker at the edge. */
export const APPROACH_HOLD = 0.5;
/** Seconds a driven spin takes to wind from stopped to its full speed, and back down. */
export const SPIN_EASE = 1;

/** A point, as the docks and ships give theirs. */
interface Spot {
  x: number;
  y: number;
}

/**
 * How far the nearest dock a ship is closing on is, or Infinity where it's closing on none. Each
 * dock is given where it is now and a tick ago, `tick` seconds before, since stations orbit and
 * turn: closing is the ship's speed toward the dock, against the dock's own.
 */
export function closingDistance(ship: Spot & { vx: number; vy: number }, docks: { now: Spot; before: Spot }[], tick: number): number {
  let nearest = Infinity;
  for (const dock of docks) {
    const dx = dock.now.x - ship.x;
    const dy = dock.now.y - ship.y;
    const distance = Math.hypot(dx, dy);
    // Sitting on it, there's no way toward it left to close along.
    if (distance <= 0 || distance >= nearest) continue;
    const vx = ship.vx - (dock.now.x - dock.before.x) / tick;
    const vy = ship.vy - (dock.now.y - dock.before.y) / tick;
    const closing = (vx * dx + vy * dy) / distance;
    if (closing > APPROACH_MIN_CLOSING) nearest = distance;
  }
  return nearest;
}

/** Whether a share of an item is low: at or under its line, empty included. A share it hasn't got isn't. */
export function isLow(share: number | undefined, line = LOW_SHARE): boolean {
  return share !== undefined && share <= line;
}

/**
 * How lit a shot's flash is `t` seconds after the shot: full for `on` with a snap, falling from full
 * to nothing over `on` with a fade, so a faded flash dies away. Nothing after, or with no shot.
 */
export function firedLit(blink: ShapeBlink, t: number | undefined): number {
  if (t === undefined || !(t >= 0) || t >= blink.on) return 0;
  return blink.fade === true ? 1 - t / blink.on : 1;
}

/**
 * A driven spin's speed one step on: toward `target` at a rate that takes `full`, the spin's own
 * speed, up from stopped in `SPIN_EASE`, and never past it.
 */
export function easeSpeed(current: number, target: number, dt: number, full: number): number {
  const step = (Math.abs(full) * Math.max(0, dt)) / SPIN_EASE;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

/** An approach as it's held: the distance shown, and until when, in seconds, it holds once gone. */
export interface HeldApproach {
  distance: number;
  until: number;
}

/**
 * An approach with its hold: a ship closing on a dock shows its distance, and keeps showing the last
 * one for `APPROACH_HOLD` after it stops, so a light at the edge of its range doesn't flicker.
 */
export function holdApproach(now: number, held: HeldApproach | undefined, time: number): HeldApproach {
  if (Number.isFinite(now)) return { distance: now, until: time + APPROACH_HOLD };
  if (held && Number.isFinite(held.distance) && time < held.until) return held;
  return { distance: Infinity, until: -Infinity };
}

/**
 * Where each driven spin has got to: its angle and its speed, by the shape and the mount it sits on,
 * since one part's art can sit on two mounts. Kept by whoever draws: the renderer one for each ship,
 * the designer one for its preview. Not saved.
 */
export class SpinMemory {
  private turns = new WeakMap<ArtShape, Map<string, { angle: number; speed: number; at: number }>>();

  /**
   * The shape's angle, degrees, at `time` seconds, its speed eased toward `target` since it was last
   * drawn. A spin seen for the first time starts at its target's speed, as if it had always turned.
   */
  angle(shape: ArtShape, spin: ShapeSpin, mount: string, target: number, time: number): number {
    let byMount = this.turns.get(shape);
    if (!byMount) {
      byMount = new Map();
      this.turns.set(shape, byMount);
    }
    const was = byMount.get(mount);
    if (!was) {
      byMount.set(mount, { angle: 0, speed: target, at: time });
      return 0;
    }
    // A ship out of sight for a while picks up where it left off, not a minute's turning later.
    const dt = Math.min(0.25, Math.max(0, time - was.at));
    const speed = easeSpeed(was.speed, target, dt, spin.speed);
    const angle = (was.angle + ((was.speed + speed) / 2) * dt) % 360;
    byMount.set(mount, { angle, speed, at: time });
    return angle;
  }
}

/**
 * A ship's snapshot: its thrusters' firing, how near the nearest dock it's closing on is, how full
 * its tanks are (only with fuel on and a tank fitted), and its guns' last shots.
 */
export function shipArtState(sim: Sim, ship: Ship): ArtState {
  const thrust: ArtState["thrust"] = {};
  for (const [role, level] of ship.firing) thrust[role] = level;
  const docks = sim.docks.map((poi) => ({ now: sim.dockPoint(false, poi), before: sim.dockPoint(true, poi) }));
  const supply: ArtState["supply"] = {};
  if (sim.tuning.fuel) {
    const capacity = tankCapacity(ship);
    if (capacity > 0) supply.fuel = Math.max(0, Math.min(1, ship.fuel / capacity));
  }
  const shotAgo: ArtState["shotAgo"] = {};
  for (const [mount, ago] of ship.shotAgo) shotAgo[mount] = ago;
  return { thrust, approach: closingDistance(ship, docks, TICK), supply, shotAgo };
}
