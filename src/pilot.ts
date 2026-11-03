import {
  type Ore,
  type Rock,
  SHIP_RADIUS,
  type Ship,
  type Sim,
  STATION_HALF,
  TICK,
} from "./sim";

/** Well under what the rotation thrusters can reach, so turns look unhurried. */
const SPIN_LIMIT = 3;
/** Plans to brake at this share of full thrust, as a margin for imperfect flips. */
const BRAKE_MARGIN = 0.5;
/** Starts a burn once the nose is this close to the needed direction, in radians. */
const BURN_START_ANGLE = 0.12;
/** Keeps an ongoing burn going within this angle, so it's one burn and not a flicker. */
const BURN_KEEP_ANGLE = 0.6;
const ORE_SIGHT = 800;
const PASS_THROUGH_ORE_SPEED = 45;
const FIRING_DISTANCE = 300;
const TOO_CLOSE_DISTANCE = 70;
const BACK_OFF_SPEED = 50;
const SETTLE_SPEED = 30;
/** While shooting, it brakes only if this many seconds of coasting would reach the rock. */
const COLLISION_WARNING_SECONDS = 5;
/** How much speed error to accept before turning to correct it, while traveling. */
const TRAVEL_TOLERANCE = 25;
/** The same, close to the target, where the aim has to be better. */
const NEAR_TOLERANCE = 10;
const NEAR_DISTANCE = 250;
/** Coasts instead of burning for speed as long as it keeps this share of the planned speed. */
const COAST_SHARE = 0.6;
/** Stops correcting once the error falls to this share of the tolerance. */
const SETTLED_SHARE = 0.3;
/** Spin eases off in proportion to the angle left, so the nose settles without wobbling. */
const SETTLE_RATE = 4;
/** Small spin errors aren't worth firing the rotation thrusters for. */
const QUIET_SPIN = 0.15;
const RETARGET_SECONDS = 0.5;
const GIVE_UP_SECONDS = 30;
const AVOID_LOOK_AHEAD = 500;
const AVOID_MARGIN = 30;
const DOCK_ARRIVAL_SLACK = 100;

interface Mover {
  x: number;
  y: number;
  px: number;
  py: number;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Flies a ship through the mining loop: shoot rocks, gather ore, haul it to the
 * dock, and go back. It only reads what a pilot can see and only sets the ship's
 * controls, so it obeys the same physics and fit as any other ship.
 */
export class DronePilot {
  /** What the drone is doing, in words for the display. */
  task = "starting";
  private hauling = false;
  private rock: Rock | null = null;
  private ore: Ore | null = null;
  private retarget = 0;
  private targetAge = 0;
  private ignored = new WeakSet<object>();
  /** Keeps a small speed error from causing a flip and burn until it's worth correcting. */
  private burning = false;
  private thrusting = false;

  constructor(readonly ship: Ship) {}

  update(sim: Sim): void {
    const { ship } = this;
    const { controls } = ship;
    controls.thrust = 0;
    controls.turn = 0;
    controls.fire = false;

    // Empty means delivered or wrecked. Either way, this load is over.
    if (ship.ore === 0) this.hauling = false;
    if (ship.ore >= sim.tuning.droneCargo) this.hauling = true;

    if (this.hauling) this.haul(sim);
    else this.mine(sim);
  }

  private haul(sim: Sim): void {
    const { ship } = this;
    if (sim.isDocked(ship)) {
      this.task = "unloading";
      this.hold(sim, sim.dockPoint(), sim.dockPoint(true));
      return;
    }
    this.task = "to station";
    const dock = sim.dockPoint();
    const before = sim.dockPoint(true);
    this.flyTo(sim, { x: dock.x, y: dock.y, px: before.x, py: before.y }, DOCK_ARRIVAL_SLACK, 0, null);
  }

  private mine(sim: Sim): void {
    const { ship } = this;
    this.chooseTargets(sim);

    if (this.ore) {
      this.task = "gathering";
      this.flyTo(sim, this.ore, 0, PASS_THROUGH_ORE_SPEED, this.ore);
      return;
    }
    if (this.rock) {
      this.attack(sim, this.rock);
      return;
    }
    if (ship.ore > 0) {
      this.hauling = true;
      return;
    }
    this.task = "idle";
    this.steer(sim, -ship.vx, -ship.vy, NEAR_TOLERANCE, null);
  }

  private chooseTargets(sim: Sim): void {
    const { ship } = this;
    this.targetAge += TICK;
    this.retarget -= TICK;

    if (this.targetAge > GIVE_UP_SECONDS) {
      if (this.ore) this.ignored.add(this.ore);
      if (this.rock) this.ignored.add(this.rock);
      this.ore = null;
      this.rock = null;
      this.retarget = 0;
    }
    if (this.ore && !sim.ores.includes(this.ore)) {
      this.ore = null;
      this.retarget = 0;
    }
    if (this.rock && !sim.rocks.includes(this.rock)) {
      this.rock = null;
      this.retarget = 0;
    }
    if (this.retarget > 0) return;
    this.retarget = RETARGET_SECONDS;

    const previousOre = this.ore;
    const previousRock = this.rock;
    this.ore = null;
    let best = ORE_SIGHT;
    for (const ore of sim.ores) {
      if (this.ignored.has(ore)) continue;
      const distance = Math.hypot(ore.x - ship.x, ore.y - ship.y);
      if (distance < best) {
        best = distance;
        this.ore = ore;
      }
    }

    // Stays with its rock until the rock breaks, instead of wandering between them.
    if (!this.rock) {
      best = Infinity;
      for (const rock of sim.rocks) {
        if (this.ignored.has(rock)) continue;
        const distance = Math.hypot(rock.x - ship.x, rock.y - ship.y) - rock.radius;
        if (distance < best) {
          best = distance;
          this.rock = rock;
        }
      }
    }
    if (this.ore !== previousOre || this.rock !== previousRock) this.targetAge = 0;
  }

  /** Gets within range, settles, then aims ahead of the rock and fires. */
  private attack(sim: Sim, rock: Rock): void {
    const { ship } = this;
    const { tuning } = sim;
    const dx = rock.x - ship.x;
    const dy = rock.y - ship.y;
    const distance = Math.hypot(dx, dy);
    const clearance = distance - rock.radius;

    if (clearance > FIRING_DISTANCE + 150) {
      this.task = "to rock";
      this.flyTo(sim, rock, rock.radius + FIRING_DISTANCE, 0, rock);
      return;
    }

    this.task = "shooting";
    const { vx, vy } = this.relativeVelocity(rock);
    const flightTime = distance / tuning.shotSpeed;
    const aim = Math.atan2(dy - vy * flightTime, dx - vx * flightTime);
    const closing = (vx * dx + vy * dy) / distance;
    if (clearance < TOO_CLOSE_DISTANCE) {
      this.steer(
        sim,
        (-dx / distance) * BACK_OFF_SPEED - vx,
        (-dy / distance) * BACK_OFF_SPEED - vy,
        SETTLE_SPEED,
        aim,
      );
    } else if (closing * COLLISION_WARNING_SECONDS > clearance - TOO_CLOSE_DISTANCE) {
      this.steer(sim, -vx, -vy, SETTLE_SPEED, aim);
    } else {
      // Coasting past is fine. The gun leads the rock.
      this.steer(sim, 0, 0, SETTLE_SPEED, aim);
    }

    const spread = Math.atan2(rock.radius * 0.7, distance);
    const aimed = Math.abs(wrapAngle(aim - ship.angle)) < spread;
    const inRange = distance < tuning.shotSpeed * tuning.shotLife * 0.9;
    ship.controls.fire = aimed && !this.burning && inRange;
  }

  /** Stays put relative to a moving point. */
  private hold(sim: Sim, now: { x: number; y: number }, before: { x: number; y: number }): void {
    const { vx, vy } = this.relativeVelocity({ x: now.x, y: now.y, px: before.x, py: before.y });
    this.steer(sim, -vx, -vy, NEAR_TOLERANCE, null);
  }

  /**
   * Heads for a target, arriving `slack` short of it, at `arrivalSpeed` or nearly
   * stopped. Burns to turn, coasts between burns, and allows time to flip for braking.
   */
  private flyTo(
    sim: Sim,
    target: Mover,
    slack: number,
    arrivalSpeed: number,
    exclude: object | null,
  ): void {
    const { ship } = this;
    const distance = Math.max(0, Math.hypot(target.x - ship.x, target.y - ship.y) - slack);
    const { vx, vy } = this.relativeVelocity(target);
    const limit = Math.min(this.speedLimitHere(sim), this.stoppingSpeed(sim, distance));
    const speed = Math.max(limit, arrivalSpeed);
    const heading = this.routeAround(sim, target, exclude);

    // Split the motion into along the heading and across it. Being a bit slow is fine.
    const along = vx * heading.x + vy * heading.y;
    const acrossX = vx - along * heading.x;
    const acrossY = vy - along * heading.y;
    const coasting = along <= speed && along >= speed * COAST_SHARE;
    const change = coasting ? 0 : speed - along;
    const tolerance = distance < NEAR_DISTANCE ? NEAR_TOLERANCE : TRAVEL_TOLERANCE;
    this.steer(sim, heading.x * change - acrossX, heading.y * change - acrossY, tolerance, null);
  }

  /** Slower inside the field and when coming up on it, so an impact is only a dent. */
  private speedLimitHere(sim: Sim): number {
    const { ship } = this;
    const { field, tuning } = sim;
    const outside = Math.hypot(ship.x - field.x, ship.y - field.y) - tuning.fieldRadius;
    const nearField = tuning.droneFieldSpeed + this.stoppingSpeed(sim, Math.max(0, outside));
    return Math.min(tuning.droneCruiseSpeed, nearField);
  }

  /** The fastest speed from which the ship can still flip and stop within a distance. */
  private stoppingSpeed(sim: Sim, distance: number): number {
    const { tuning } = sim;
    const accel = (tuning.thrust / tuning.weight) * BRAKE_MARGIN;
    const flipSeconds = Math.PI / SPIN_LIMIT + 0.5;
    const lead = accel * flipSeconds;
    return -lead + Math.sqrt(lead * lead + 2 * accel * distance);
  }

  /** Direction to fly: straight at the target, or past the first thing in the way. */
  private routeAround(sim: Sim, target: Mover, exclude: object | null): { x: number; y: number } {
    const { ship } = this;
    const { station } = sim;
    const toX = target.x - ship.x;
    const toY = target.y - ship.y;
    const distance = Math.hypot(toX, toY) || 1;
    const dirX = toX / distance;
    const dirY = toY / distance;

    let along = Math.min(distance, AVOID_LOOK_AHEAD);
    let blockX = 0;
    let blockY = 0;
    let blockRadius = 0;
    const consider = (x: number, y: number, radius: number, range: number) => {
      const offX = x - ship.x;
      const offY = y - ship.y;
      const ahead = offX * dirX + offY * dirY;
      if (ahead <= 0 || ahead >= range) return;
      if (Math.abs(offX * dirY - offY * dirX) >= radius) return;
      along = ahead;
      range = ahead;
      blockX = x;
      blockY = y;
      blockRadius = radius;
    };

    // The station is big enough to plan around from further away.
    // Clears its corners, while the dock's center stays outside this radius.
    const stationRadius = Math.hypot(STATION_HALF, STATION_HALF) + SHIP_RADIUS + 30;
    consider(station.x, station.y, stationRadius, Math.min(distance, AVOID_LOOK_AHEAD * 3));
    for (const rock of sim.rocks) {
      if (rock === exclude) continue;
      consider(rock.x, rock.y, rock.radius + SHIP_RADIUS + AVOID_MARGIN, along);
    }
    if (blockRadius === 0) return { x: dirX, y: dirY };

    const offX = blockX - ship.x;
    const offY = blockY - ship.y;
    const gap = Math.hypot(offX, offY) || 1;
    if (gap <= blockRadius) return { x: -offX / gap, y: -offY / gap };

    // The tangent past the obstacle, on the side the ship is already on.
    const side = offX * dirY - offY * dirX >= 0 ? 1 : -1;
    const center = Math.atan2(offY, offX);
    const angle = center + side * Math.asin(blockRadius / gap);
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  /** Measured from real positions, so it includes all carrying by POIs. */
  private relativeVelocity(target: Mover): { vx: number; vy: number } {
    const { ship } = this;
    return {
      vx: (ship.x - ship.px - (target.x - target.px)) / TICK,
      vy: (ship.y - ship.py - (target.y - target.py)) / TICK,
    };
  }

  /**
   * Applies a needed velocity change with the only engine it has: turn toward it,
   * then burn. Otherwise it coasts, with the nose on `hold` if there's somewhere to look.
   */
  private steer(
    sim: Sim,
    needX: number,
    needY: number,
    tolerance: number,
    hold: number | null,
  ): void {
    const { ship } = this;
    const need = Math.hypot(needX, needY);
    if (need > tolerance) this.burning = true;
    else if (need < tolerance * SETTLED_SHARE) this.burning = false;

    if (this.burning) {
      const burnAngle = Math.atan2(needY, needX);
      this.turnTo(sim, burnAngle);
      const off = Math.abs(wrapAngle(burnAngle - ship.angle));
      this.thrusting = off < (this.thrusting ? BURN_KEEP_ANGLE : BURN_START_ANGLE);
      if (this.thrusting) ship.controls.thrust = 1;
      return;
    }
    this.thrusting = false;
    this.turnTo(sim, hold ?? ship.angle);
  }

  private turnTo(sim: Sim, angle: number): void {
    const { ship } = this;
    const { tuning } = sim;
    const accel = ((tuning.rotationThrust * Math.PI) / 180) / tuning.weight;
    const error = wrapAngle(angle - ship.angle);
    const size = Math.abs(error);
    const braking = Math.sqrt(2 * accel * 0.7 * size);
    const wanted = Math.sign(error) * Math.min(SPIN_LIMIT, braking, size * SETTLE_RATE);
    const change = wanted - ship.spin;
    if (Math.abs(change) > QUIET_SPIN) ship.controls.turn = Math.sign(change);
  }
}
