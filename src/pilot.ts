import { DRONE_BUY_ORDER, type PartId } from "./parts";
import { planRoute, type Route, type Vec } from "./route";
import {
  type Base,
  type Body,
  type Deposit,
  DOCK_OFFSET,

  type MiningField,
  type Ore,
  type Poi,
  type Rock,
  SHIP_RADIUS,
  type Ship,
  type Sim,
  STATION_HALF,
  TICK,
  type TripRecord,
} from "./sim";

/** Well under what the rotation thrusters can reach, so turns look unhurried. */
const SPIN_LIMIT = 3;
/** Plans to brake at this share of full thrust, as a margin for imperfect flips. */
const BRAKE_MARGIN = 0.5;
/** Starts a burn once the nose is this close to the needed direction, in radians. */
const BURN_START_ANGLE = 0.12;
/** Keeps an ongoing burn going within this angle, so it's one burn and not a flicker. */
const BURN_KEEP_ANGLE = 0.6;
/** Corrections up to this size are made without turning, if the thrusters allow it. */
const DIRECT_LIMIT = 80;
/** Time to bring the nose to bear when braking with the reverse thruster. */
const REVERSE_BRAKE_SECONDS = 0.3;
const ORE_SIGHT = 800;
const PASS_THROUGH_ORE_SPEED = 45;

/** Added to a field's cost when it's empty or feared, so it's only picked when every field is. */
const LAST_RESORT = 1e6;
/** Flying to a field, it stops this share of the field's radius in from the middle: well inside. */
const FIELD_ARRIVAL_SHARE = 0.7;

function minus(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** How close the straight line from `a` to `b` comes to a point. */
function passesWithin(a: { x: number; y: number }, b: { x: number; y: number }, point: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(a.x + dx * t - point.x, a.y + dy * t - point.y);
}
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
/** A push on the rotation thrusters carries on until the error is this share of the above. */
const SPIN_PUSH_FINISH = 0.2;
const RETARGET_SECONDS = 0.5;
const GIVE_UP_SECONDS = 30;
const AVOID_LOOK_AHEAD = 500;
const AVOID_MARGIN = 30;
const DOCK_ARRIVAL_SLACK = 100;
/** Below this it heads home early, as long as it can pay for the repair when it gets there. */
export const LOW_HULL = 30;
/** How close to a deposit it aims for. Trading starts as soon as it's in reach. */
const DEPOSIT_ARRIVAL = 60;
/** Within this distance and under this speed, a click order stops flying and starts stopping. */
const ARRIVE_DISTANCE = 40;
const ARRIVE_SPEED = 20;
/** Under this speed it counts as stopped. */
const STOPPED_SPEED = 6;
/** The last gentle stretch of a move that ends at rest: how fast, how quickly it changes, and how close counts. */
const EASE_SPEED = 12;
const EASE_ACCELERATION = 40;
const EASE_RATE = 2;
/** Without side thrusters braking means turning the nose around first: it eases this many flips' time out. */
const EASE_FLIPS = 1;
/** How close counts as on the spot for a ship that has to turn to brake. */
const LANDING_TURNING = 2;
/** How far off its spot a hull that had to brake onto it may call itself landed: it can't hover. */
const BRAKE_MISS = 8;
/** A trim burns along the nose once it points this close to the need, and leaves the rest for the next. */
const TRIM_ANGLE = 0.2;
/** It never eases slower than this, so the last stretch doesn't drag on. */
const EASE_FLOOR = 0.6;
const SETTLED_DISTANCE = 0.5;
/** Settling ends once the speed left to fix is below this: a fraction of a unit a minute. */
const REST_SPEED = 0.002;
/** Slow enough over the spot to count as there. */
const LANDING_SPEED = 1;
const FACING_ANGLE = 0.05;
const FACING_SPIN = 0.1;
/** Gives up on a click order that gets no closer for this long, such as a spot inside a rock. */
const CLICK_STUCK_SECONDS = 30;
/** Closer than this counts as progress on a click order. */
const CLICK_PROGRESS = 10;
/** How long after the last flight key an order takes back over. */
const HANDS_OFF_SECONDS = 1;
/** Under this speed there's no braking burn to get ready for. */
const COAST_TURN_SPEED = 10;
/** How long after its last sight of a pirate a sheltering ship goes back out. */
const FLEE_CALM_SECONDS = 15;

interface Mover {
  x: number;
  y: number;
  px: number;
  py: number;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Where a spot held in a POI's own axes is now, and was a tick ago. */
function poiSpot(poi: Poi, x: number, y: number): Mover {
  const at = (cx: number, cy: number, rotation: number) => ({
    x: cx + x * Math.cos(rotation) - y * Math.sin(rotation),
    y: cy + x * Math.sin(rotation) + y * Math.cos(rotation),
  });
  const now = at(poi.x, poi.y, poi.rotation);
  const before = at(poi.px, poi.py, poi.prevRotation);
  return { x: now.x, y: now.y, px: before.x, py: before.y };
}

/** A world position in a POI's own axes, so it turns with the POI. */
function toPoiAxes(poi: Poi, x: number, y: number): { x: number; y: number } {
  const dx = x - poi.x;
  const dy = y - poi.y;
  const cos = Math.cos(poi.rotation);
  const sin = Math.sin(poi.rotation);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

/** Whether a trip is to this station's berth: a spot within the dock's own box. */
function aimsAtBerth(station: Poi, target: { x: number; y: number }): boolean {
  const local = toPoiAxes(station, target.x, target.y);
  return Math.abs(local.x - DOCK_OFFSET) <= STATION_HALF && Math.abs(local.y) <= STATION_HALF;
}

/**
 * Whether a spot is past a station's dock face, in the station's own axes. From there the
 * straight line to the berth can't touch the solid box, so the ring has nothing left to guard.
 */
function pastDockFace(station: Poi, x: number, y: number): boolean {
  return toPoiAxes(station, x, y).x >= STATION_HALF + SHIP_RADIUS;
}

/**
 * Flying skills any automated pilot can use. It only reads what a pilot can see and
 * only sets the ship's controls, so it obeys the same physics and fit as any other ship.
 */
class ShipPilot {
  /** Keeps a small speed error from causing a flip and burn until it's worth correcting. */
  protected burning = false;
  protected thrusting = false;
  /** The current correction doesn't need the nose, so the gun stays usable. */
  protected correctingDirectly = false;
  /** The direction the rotation thrusters are pushing, or 0. */
  private spinPush = 0;

  /**
   * Set while it's far from the camera: it isn't flown, just a trip from one stop to the
   * next on the clock (see `Sim.recordTraffic` and `Sim.recordFighters`). Its decisions at
   * each stop are still its own.
   */
  record: TripRecord | null = null;

  constructor(readonly ship: Ship) {}

  /** Whether another ship is in range with no rock in the way, whichever way the nose points. */
  protected inView(sim: Sim, other: Ship): boolean {
    const { ship } = this;
    if (Math.hypot(other.x - ship.x, other.y - ship.y) > sim.tuning.visionRange) return false;
    return sim.clearSight(ship.x, ship.y, other.x, other.y);
  }

  /** Gets within range, settles, then aims ahead of the rock and fires. Says which it's doing. */
  protected attack(sim: Sim, rock: Rock): "to rock" | "shooting" {
    const { ship } = this;
    const { tuning } = sim;
    const dx = rock.x - ship.x;
    const dy = rock.y - ship.y;
    const distance = Math.hypot(dx, dy);
    const clearance = distance - rock.radius;

    if (clearance > FIRING_DISTANCE + 150) {
      this.flyTo(sim, rock, rock.radius + FIRING_DISTANCE, 0, rock);
      return "to rock";
    }

    const { vx, vy } = this.relativeVelocity(rock);
    const flightTime = distance / tuning.shotSpeed;
    const aim = Math.atan2(dy - vy * flightTime, dx - vx * flightTime);
    const closing = (vx * dx + vy * dy) / distance;
    // A turret does the aiming, so the nose is free.
    const turret = ship.parts.has("turret");
    const nose = turret ? null : aim;
    if (turret) {
      ship.aim = { x: ship.x + Math.cos(aim) * distance, y: ship.y + Math.sin(aim) * distance };
    }
    if (clearance < TOO_CLOSE_DISTANCE) {
      this.steer(
        sim,
        (-dx / distance) * BACK_OFF_SPEED - vx,
        (-dy / distance) * BACK_OFF_SPEED - vy,
        SETTLE_SPEED,
        nose,
      );
    } else if (closing * COLLISION_WARNING_SECONDS > clearance - TOO_CLOSE_DISTANCE) {
      this.brake(sim, -vx, -vy, SETTLE_SPEED, nose);
    } else {
      // Coasting past is fine. The gun leads the rock.
      this.steer(sim, 0, 0, SETTLE_SPEED, nose);
    }

    const gun = ship.angle + (turret ? ship.turretAngle : 0);
    const spread = Math.atan2(rock.radius * 0.7, distance);
    const aimed = Math.abs(wrapAngle(aim - gun)) < spread;
    const range = tuning.shotSpeed * tuning.shotLife * (turret ? tuning.turretRange : 1);
    const inRange = distance < range * 0.9;
    const steady = turret || !this.burning || this.correctingDirectly;
    ship.controls.fire = aimed && inRange && steady;
    return "shooting";
  }

  /** Stays put relative to a moving point. */
  protected hold(sim: Sim, now: { x: number; y: number }, before: { x: number; y: number }): void {
    const { vx, vy } = this.relativeVelocity({ x: now.x, y: now.y, px: before.x, py: before.y });
    this.brake(sim, -vx, -vy, NEAR_TOLERANCE, null);
  }

  /** Comes to a stop: with retro when the thrusters cover every direction, or by hand. */
  protected brake(
    sim: Sim,
    needX: number,
    needY: number,
    tolerance: number,
    hold: number | null,
  ): void {
    const { parts } = this.ship;
    if (parts.has("retro") && parts.has("reverse") && parts.has("strafe")) {
      this.ship.controls.retro = true;
      this.burning = false;
      this.thrusting = false;
      this.correctingDirectly = true;
      if (hold !== null) this.turnTo(sim, hold);
      return;
    }
    this.steer(sim, needX, needY, tolerance, hold);
  }

  /**
   * Heads for a target, arriving `slack` short of it, at `arrivalSpeed` or nearly
   * stopped. Burns to turn, coasts between burns, and allows time to flip for braking.
   */
  protected flyTo(
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
    this.steer(
      sim,
      heading.x * change - acrossX,
      heading.y * change - acrossY,
      tolerance,
      this.flightNose(heading),
      this.coastNose(vx, vy),
    );
  }

  /**
   * Like `flyTo`, but the long way round any body whose pull lies across the straight line:
   * it steers for the next corner of a path round it without slowing, then goes on as usual.
   */
  protected travel(sim: Sim, target: Mover, slack: number, arrivalSpeed: number, exclude: object | null): void {
    const { ship } = this;
    const corner = sim.cornerToward(ship.x, ship.y, target.x, target.y);
    if (!corner) {
      this.flyTo(sim, target, slack, arrivalSpeed, exclude);
      return;
    }
    const still = { x: corner.x, y: corner.y, px: corner.x, py: corner.y };
    this.flyTo(sim, still, 0, this.speedLimitHere(sim), null);
  }

  /**
   * A trip by the route planner from one moving spot to another, round the body in the way
   * nearest the start. The route is in that body's own frame, where it stands still, however
   * it moves along its orbit: `centre` is where the body is now, and `world` is the route's
   * corners and aim back in the world, each where the body is when the ship gets there.
   */
  plan(sim: Sim, start: (t: number) => Vec, end: (t: number) => Vec): { route: Route; centre: Vec; world: { path: Vec[]; aim: Vec } } {
    const { ship } = this;
    const flight = { accel: sim.tuning.thrust * sim.shipResponse(ship), cruise: this.cruiseSpeed(sim) };
    const from = start(sim.now);
    const to = end(sim.now);
    // Round the body nearest the station of those across the way, in that body's frame.
    let centre = { x: 0, y: 0 };
    let at = (_t: number): Vec => centre;
    let radius = 0;
    let nearest = Infinity;
    for (const body of sim.bodies) {
      const circle = sim.keepOutAt(body);
      const distance = Math.hypot(circle.x - from.x, circle.y - from.y);
      if (distance < nearest && passesWithin(from, to, circle) < circle.radius) {
        nearest = distance;
        centre = circle;
        radius = circle.radius;
        at = (t) => sim.keepOutAt(body, t);
      }
    }
    const route = planRoute(
      (t) => minus(start(t), at(t)),
      (t) => minus(end(t), at(t)),
      sim.now,
      radius,
      flight,
    );
    // The way points are reached part-way through the trip, by how far along the path they are.
    const total = route.path.length;
    let done = 0;
    const path = route.path.points.map((point, i, points) => {
      if (i > 0) done += Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y);
      const where = at(route.depart + (total > 0 ? done / total : 0) * (route.arrive - route.depart));
      return { x: point.x + where.x, y: point.y + where.y };
    });
    const arriving = at(route.arrive);
    return { route, centre, world: { path, aim: { x: route.aim.x + arriving.x, y: route.aim.y + arriving.y } } };
  }

  /** The speed it flies at between places. */
  protected cruiseSpeed(sim: Sim): number {
    return this.ship.model === "floater" ? sim.tuning.clickSpeed : sim.tuning.droneCruiseSpeed;
  }

  /** Where the nose stays throughout a flight, or null if it's free to turn for burns. */
  protected flightNose(_heading: { x: number; y: number }): number | null {
    return null;
  }

  /** Where the nose goes while coasting, or null to leave it. */
  protected coastNose(_vx: number, _vy: number): number | null {
    return null;
  }

  /** Slower inside the field and when coming up on it, so an impact is only a dent. */
  protected speedLimitHere(sim: Sim): number {
    const { ship } = this;
    const { tuning } = sim;
    if (ship.model === "floater") return tuning.clickSpeed;
    const field = sim.extraFields.length > 0 ? sim.miningFieldAt(ship.x, ship.y) : sim.miningFields()[0];
    const outside = Math.hypot(ship.x - field.poi.x, ship.y - field.poi.y) - field.radius;
    const nearField = tuning.droneFieldSpeed + this.stoppingSpeed(sim, Math.max(0, outside));
    return Math.min(tuning.droneCruiseSpeed, nearField);
  }

  /** The braking acceleration, and the time it takes to turn for it: the two stopping sums share these. */
  private braking(sim: Sim): { accel: number; flipSeconds: number } {
    const { ship } = this;
    const { tuning } = sim;
    const hasReverse = ship.parts.has("reverse");
    const thrust = hasReverse ? tuning.reverseThrust : tuning.thrust;
    const accel = thrust * sim.shipResponse(ship) * BRAKE_MARGIN;
    const spinAccel = ((tuning.rotationThrust * Math.PI) / 180) * sim.shipResponse(ship);
    const flipSeconds = hasReverse
      ? REVERSE_BRAKE_SECONDS
      : Math.max(Math.PI / SPIN_LIMIT + 0.5, 2.5 * Math.sqrt(Math.PI / spinAccel));
    return { accel, flipSeconds };
  }

  /** The fastest speed from which the ship can still turn and stop within a distance. */
  protected stoppingSpeed(sim: Sim, distance: number): number {
    const { accel, flipSeconds } = this.braking(sim);
    const lead = accel * flipSeconds;
    return -lead + Math.sqrt(lead * lead + 2 * accel * distance);
  }

  /** How far it takes to turn and stop from a speed: the inverse of `stoppingSpeed`. */
  protected stoppingDistance(sim: Sim, speed: number): number {
    const { accel, flipSeconds } = this.braking(sim);
    const lead = accel * flipSeconds;
    return (speed * speed + 2 * speed * lead) / (2 * accel);
  }

  /**
   * Direction to fly: straight at the target, or past the first thing in the way. With
   * `rocks` off it only keeps clear of stations, which is all a plain click on a pad needs.
   */
  protected routeAround(sim: Sim, target: Mover, exclude: object | null, rocks = true): { x: number; y: number } {
    const { ship } = this;
    const toX = target.x - ship.x;
    const toY = target.y - ship.y;
    const distance = Math.hypot(toX, toY) || 1;
    const dirX = toX / distance;
    const dirY = toY / distance;

    // It looks ahead as far as it would take to stop from the speed it is at, and never less
    // than the old fixed reach: a slow flight sees exactly what it saw before, and a fast
    // course meets a rock with time to turn its nose round and brake.
    const { vx, vy } = this.relativeVelocity(target);
    const lookAhead = Math.max(AVOID_LOOK_AHEAD, this.stoppingDistance(sim, Math.hypot(vx, vy)));

    let along = Math.min(distance, lookAhead);
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
    for (const station of sim.docks) {
      // Coming in to a station's own berth, its ring stops guarding once the way in is clear:
      // past the dock's face the straight run in clears the solid box, so holding the ship out
      // on the ring there only keeps it off the dock. Other stations keep their rings.
      if (aimsAtBerth(station, target) && pastDockFace(station, ship.x, ship.y)) continue;
      consider(station.x, station.y, stationRadius, Math.min(distance, Math.max(AVOID_LOOK_AHEAD * 3, lookAhead)));
    }
    for (const rock of sim.rocks) {
      if (!rocks || rock === exclude) continue;
      consider(rock.x, rock.y, rock.radius + SHIP_RADIUS + AVOID_MARGIN, along);
    }
    if (blockRadius === 0) return { x: dirX, y: dirY };

    const offX = blockX - ship.x;
    const offY = blockY - ship.y;
    const gap = Math.hypot(offX, offY) || 1;

    // The tangent past the obstacle, on the side the ship is already on. Inside the circle
    // there is no tangent point, so it takes the tangent where it stands, and that fades to
    // straight out nearer the middle, where out is the only way out. Either side of the edge
    // the heading is the tangent, so crossing it doesn't flip the nose: that flip is what
    // stalled a ship coming round a station to its dock from the far side.
    const side = offX * dirY - offY * dirX >= 0 ? 1 : -1;
    const center = Math.atan2(offY, offX);
    // How much of the tangent to take: none in the middle, all of it at the circle's edge.
    const out = Math.min(1, gap / blockRadius);
    const angle = center + side * Math.asin(Math.min(1, blockRadius / gap)) * out;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  /** Measured from real positions, so it includes all carrying by POIs. */
  protected relativeVelocity(target: Mover): { vx: number; vy: number } {
    const { ship } = this;
    return {
      vx: (ship.x - ship.px - (target.x - target.px)) / TICK,
      vy: (ship.y - ship.py - (target.y - target.py)) / TICK,
    };
  }

  /**
   * Applies a needed velocity change. Small ones go straight to the thrusters if
   * they cover that direction. Otherwise it turns the nose and burns. With a reverse
   * thruster it may turn the nose away from the need and burn backward, if that's
   * the shorter turn. When there's nothing to correct it coasts, with the nose on
   * `hold` if there's somewhere to look.
   */
  protected steer(
    sim: Sim,
    needX: number,
    needY: number,
    tolerance: number,
    hold: number | null,
    coast: number | null = null,
  ): void {
    const { ship } = this;
    const need = Math.hypot(needX, needY);
    if (need > tolerance) this.burning = true;
    else if (need < tolerance * SETTLED_SHARE) this.burning = false;

    if (this.burning) {
      if (this.correctDirectly(sim, needX, needY, need, tolerance, hold)) return;
      const needAngle = Math.atan2(needY, needX);
      const backward = needAngle + Math.PI;
      const useReverse =
        ship.parts.has("reverse") &&
        Math.abs(wrapAngle(backward - ship.angle)) < Math.abs(wrapAngle(needAngle - ship.angle));
      const burnAngle = useReverse ? backward : needAngle;
      this.turnTo(sim, burnAngle);
      const off = Math.abs(wrapAngle(burnAngle - ship.angle));
      this.thrusting = off < (this.thrusting ? BURN_KEEP_ANGLE : BURN_START_ANGLE);
      if (this.thrusting) ship.controls.thrust = useReverse ? -1 : 1;
      return;
    }
    this.thrusting = false;
    this.turnTo(sim, hold ?? coast ?? ship.angle);
  }

  /** Makes a correction without turning. Returns false if the thrusters can't cover it. */
  protected correctDirectly(
    sim: Sim,
    needX: number,
    needY: number,
    need: number,
    tolerance: number,
    hold: number | null,
  ): boolean {
    const { ship } = this;
    if (!ship.parts.has("strafe") || (need > DIRECT_LIMIT && hold === null)) return false;
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    const forward = needX * cos + needY * sin;
    const side = -needX * sin + needY * cos;
    const small = tolerance * SETTLED_SHARE;
    if (forward < -small && !ship.parts.has("reverse")) return false;

    if (Math.abs(forward) > small) ship.controls.thrust = Math.sign(forward);
    if (Math.abs(side) > small) ship.controls.strafe = Math.sign(side);
    this.thrusting = false;
    this.correctingDirectly = true;
    this.turnTo(sim, hold ?? ship.angle);
    return true;
  }

  protected turnTo(sim: Sim, angle: number): void {
    const { ship } = this;
    const { tuning } = sim;
    const accel = ((tuning.rotationThrust * Math.PI) / 180) * sim.shipResponse(ship);
    const error = wrapAngle(angle - ship.angle);
    const size = Math.abs(error);
    const braking = Math.sqrt(2 * accel * 0.7 * size);
    const wanted = Math.sign(error) * Math.min(SPIN_LIMIT, braking, size * SETTLE_RATE);
    const change = wanted - ship.spin;
    // Once firing it finishes the correction, so it's one push and not a flicker.
    const direction = Math.sign(change);
    const finishing = direction === this.spinPush && Math.abs(change) > QUIET_SPIN * SPIN_PUSH_FINISH;
    if (Math.abs(change) > QUIET_SPIN || finishing) {
      ship.controls.turn = direction;
      this.spinPush = direction;
    } else {
      this.spinPush = 0;
      if (Math.abs(wanted) < QUIET_SPIN) ship.controls.stabilize = true;
    }
  }
}

/**
 * The Face target program's hands: turns the nose toward a spot with the turning thrusters the
 * ship owns, the way a click order's facing hold does, and never thrusts. Once the nose is there
 * and the spin is quiet it lets go, as the click pilot's own facing does.
 */
export class FacePilot extends ShipPilot {
  face(sim: Sim, angle: number): void {
    const { ship } = this;
    if (Math.abs(wrapAngle(angle - ship.angle)) < FACING_ANGLE && Math.abs(ship.spin) < FACING_SPIN) return;
    this.turnTo(sim, angle);
  }
}

/** What traffic turned away at a full station does instead: wait, a deposit, more mining, or the next station over. */
export type TurnAway = "wait" | "deposit" | "mine" | "station";
export const TURN_AWAYS: TurnAway[] = ["wait", "deposit", "mine", "station"];

/** The hauler is close enough to be worth waiting for, or so far off it isn't. Seconds. */
const HAULER_SOON = 120;
const HAULER_LATE = 360;
/** Traffic with fewer credits than this, and nothing left to buy, is short of money. */
const SHORT_CREDITS = 100;
/** A trip to the next station over this long, in seconds, puts traffic off it. */
const LONG_TRIP = 180;
/** How many times one load may be turned away and still try another station. */
const MOST_TRIES = 2;

/**
 * Picks one choice by its weight, with a roll from 0 to 1. With every weight 0 it waits, so a
 * ship never wanders for want of anything better.
 */
export function pickTurnAway(weights: Record<TurnAway, number>, roll: number): TurnAway {
  const total = TURN_AWAYS.reduce((sum, choice) => sum + Math.max(0, weights[choice]), 0);
  if (!(total > 0)) return "wait";
  let left = roll * total;
  let last: TurnAway = "wait";
  for (const choice of TURN_AWAYS) {
    const weight = Math.max(0, weights[choice]);
    if (weight <= 0) continue;
    if (left < weight) return choice;
    left -= weight;
    last = choice;
  }
  // A roll of exactly 1: the last one with any weight.
  return last;
}

/** Flies a ship through the mining loop: shoot rocks, gather ore, haul it to the dock, and go back. */
export class DronePilot extends ShipPilot {
  /** What the drone is doing, in words for the display. */
  task = "starting";
  /** What it will buy with its earnings, in order. */
  wishlist: PartId[] = DRONE_BUY_ORDER;
  /**
   * What it spends on: a test drone buys its list and then more drones, traffic and the
   * player's drones buy the upgrades they can use and keep a buffer, or nothing at all.
   */
  buys: "drones" | "upgrades" | "nothing" = "drones";
  /** Whether it runs for the station when it sees a pirate. */
  flees = false;
  /** A ship that attacked it, which it's running home to report. */
  private reporting: Ship | null = null;
  private fleeing = false;
  private sinceSighting = 0;
  private hauling = false;
  /** Whether this load goes to a deposit to save the trip. */
  private dropsThisLoad = false;
  /** Where it's going to buy a load, if it's making a buying run. */
  trading: Deposit | "pirate base" | null = null;
  /** Whether it has decided on this stay at the dock whether to make a buying run. */
  private decidedTrade = false;
  /** The field it mines this trip, by id. Traffic picks one each time it leaves the dock. None yet: the field by its own base. */
  working = "";
  /** The field it last mined, which it's a little drawn back to. */
  habit: string | null = null;
  /** Whether it has picked a field on this stay at the dock. */
  private decidedField = false;
  private rock: Rock | null = null;
  private ore: Ore | null = null;
  private retarget = 0;
  private targetAge = 0;
  private ignored = new WeakSet<object>();
  /** Seconds it has sat at this stop with ore the station has no room for. */
  private turnedFor = 0;
  /** Turned away at this stop, it chose to wait for room: no new roll until it leaves. */
  private waitsHere = false;
  /** Turned away at this stop, it chose to go elsewhere: a record's stay ends there. */
  private leftStop = false;
  /** Times this load has been turned away, and by which bases (by id). */
  private turnAways = 0;
  private turnedAwayBy = new Set<string>();
  /** The base this load goes to instead of the nearest (by id), or the deposit it sells at. */
  sellAt: string | null = null;
  sellDeposit: Deposit | null = null;
  /** Back to the field with ore aboard, to mine a fuller load: it flies there even laden. */
  private backToRocks = false;
  /** What it chose the last time it was turned away, for the tests. */
  lastTurnAway: TurnAway | null = null;
  /** Running from danger or home to report: it stays a ship until that's over. */
  get busy(): boolean {
    return this.fleeing || this.reporting !== null;
  }

  /** Taking its load to sell. */
  get isHauling(): boolean {
    return this.hauling;
  }

  /** A record has come in to dock: a new stay, so it decides afresh where to go next. */
  newStay(): void {
    this.decidedField = false;
    this.decidedTrade = false;
    this.leftStop = false;
  }

  /** Turned away at this stop and leaving for elsewhere with its ore: a record's stay is over. */
  get leavesStop(): boolean {
    return this.leftStop;
  }

  /** Done mining this load, full or not: it takes what it has home. */
  startHauling(): void {
    this.hauling = true;
    this.dropsThisLoad = false;
  }

  update(sim: Sim): void {
    const { ship } = this;
    const { controls } = ship;
    controls.thrust = 0;
    controls.strafe = 0;
    controls.turn = 0;
    controls.fire = false;
    controls.retro = false;
    controls.stabilize = false;
    this.correctingDirectly = false;
    ship.aim = null;

    this.watchForPirates(sim);
    if (this.fleeing) {
      this.flee(sim);
      return;
    }

    // Empty means delivered or wrecked. Either way, this load is over.
    if (sim.oreIn(ship) === 0) {
      this.hauling = false;
      this.dropsThisLoad = false;
      this.endLoad();
    }
    // Out of the dock, the next dock is a new stop.
    if (!sim.isDocked(ship)) {
      this.turnedFor = 0;
      this.waitsHere = false;
      this.leftStop = false;
    }
    if (sim.oreIn(ship) >= sim.deliveryLoad(ship) && !this.hauling) {
      this.backToRocks = false;
      this.hauling = true;
      this.dropsThisLoad = sim.deposits.length > 0 && sim.roll() < sim.tuning.depositDropChance;
    }
    const canAffordRepair = sim.oreIn(ship) > 0 || sim.canPayRepair(ship);
    if ((ship.hull < LOW_HULL || sim.crippled(ship)) && canAffordRepair) this.hauling = true;

    // Repairs come before shopping, so it never spends its repair money on parts.
    if (sim.oreIn(ship) === 0 && sim.canRepair(ship)) {
      this.task = "repairing";
      const dock = sim.dockedAt(ship) ?? sim.homeBaseOf(ship).poi;
      this.hold(sim, sim.dockPoint(false, dock), sim.dockPoint(true, dock));
      return;
    }
    if (sim.oreIn(ship) === 0 && sim.atShop(ship)) this.shop(sim);

    if (!this.hauling && sim.oreIn(ship) === 0) {
      this.chooseField(sim);
      this.chooseTrade(sim);
      if (this.trading) {
        this.trade(sim);
        return;
      }
    }
    if (this.hauling) this.haul(sim);
    else this.mine(sim);
  }

  /**
   * Leaving the dock with an empty hold, traffic sometimes buys a load to bring back
   * instead of mining one. It decides once per stay.
   */
  private chooseTrade(sim: Sim): void {
    const { ship } = this;
    const docked = sim.atShop(ship);
    if (!docked) this.decidedTrade = false;
    if (!docked || this.decidedTrade || this.trading || ship.owner || this.buys !== "upgrades") return;
    this.decidedTrade = true;
    const source = sim.tradeSource(ship);
    if (source && sim.roll() < sim.tuning.tradeChance) this.trading = source;
  }

  /**
   * Leaving the dock with an empty hold, traffic picks a field to mine. Each field costs
   * the round trip from the route planner. An empty field, or one where pirates killed it
   * lately (some trips), costs so much it's the last resort. Going back to its last field
   * is a little cheaper, and luck takes a little off each. The cheapest wins. Now and then
   * it heads for any other field just to see. Docked at a base not its own, it goes back to
   * the field by its own base.
   */
  private chooseField(sim: Sim): void {
    const { ship } = this;
    const docked = sim.isDocked(ship);
    if (!docked) this.decidedField = false;
    if (!docked || this.decidedField || ship.owner || this.buys !== "upgrades") return;
    this.decidedField = true;
    const fields = sim.miningFields();
    if (fields.length === 1) {
      this.working = fields[0].id;
      return;
    }
    const { tuning } = sim;
    const open = fields.filter((field) => !sim.fieldEmpty(field));
    const current = this.workingField(sim).id;
    const elsewhere = open.filter((field) => field.id !== current);
    if (elsewhere.length > 0 && sim.roll() < tuning.fieldWanderChance) {
      this.working = elsewhere[Math.floor(sim.roll() * elsewhere.length)].id;
      return;
    }
    // Selling away from its own base, it goes back to the field by its own.
    const own = sim.homeBaseOf(ship);
    if (sim.dockedAt(ship) !== own.poi) {
      const home = sim.miningFieldAt(own.poi.x, own.poi.y);
      if (open.includes(home)) {
        this.working = home.id;
        return;
      }
    }
    const lately = ship.pirateKilledAt !== null && sim.now - ship.pirateKilledAt < tuning.fieldFearSeconds;
    const feared = lately && sim.roll() < tuning.fieldFearChance ? ship.pirateKilledIn : null;
    const here = sim.dockedAt(ship) ?? sim.homeBaseOf(ship).poi;
    let best = fields[0];
    let bestCost = Infinity;
    for (const field of fields) {
      const back = sim.nearestDock(field.poi.x, field.poi.y);
      let cost = this.tripSeconds(sim, here, field.poi) + this.tripSeconds(sim, field.poi, back) - sim.roll() * tuning.fieldLuckSeconds;
      if (!open.includes(field)) cost += LAST_RESORT;
      if (field.id === feared) cost += LAST_RESORT;
      if (field.id === this.habit) cost -= tuning.fieldHabitSeconds;
      if (cost < bestCost) {
        bestCost = cost;
        best = field;
      }
    }
    this.working = best.id;
  }

  /** Seconds from one place to another, by the route planner, round any body in the way. */
  tripSeconds(sim: Sim, start: Poi, end: Poi): number {
    const { route } = this.plan(
      sim,
      (t) => sim.poiAt(start, t),
      (t) => sim.poiAt(end, t),
    );
    return route.arrive - route.depart;
  }

  /** The field it's working this trip, or the one by its own base if that one's gone. */
  private workingField(sim: Sim): MiningField {
    return sim.miningFields().find((field) => field.id === this.working) ?? sim.ownField(this.ship);
  }

  /** Flies to where it's buying, buys a full hold, and from there it's an ordinary haul home. */
  private trade(sim: Sim): void {
    const { ship } = this;
    const source = this.trading!;
    this.task = "to buy";
    if (source === "pirate base") {
      const base = sim.pirateBase;
      if (!base || sim.oreCount(sim.pirateOre) < sim.cargoSpace(ship)) {
        this.trading = null;
        return;
      }
      if (sim.atPirateBase(ship)) this.bought(sim.buyFromPirateBase(ship));
      else this.travel(sim, base, sim.tuning.pirateBaseReach / 2, 0, null);
      return;
    }
    if (!sim.deposits.includes(source) || sim.oreCount(source.ore) < sim.cargoSpace(ship)) {
      this.trading = null;
      return;
    }
    if (sim.depositAt(ship) === source) this.bought(sim.buyFromDeposit(ship, source));
    else this.travel(sim, source, DEPOSIT_ARRIVAL, 0, null);
  }

  private bought(amount: number): void {
    this.trading = null;
    if (amount <= 0) return;
    // A bought load goes home to sell, not into the next deposit.
    this.hauling = true;
    this.dropsThisLoad = false;
  }

  /** Runs home to tell the station who attacked it. */
  report(attacker: Ship): void {
    this.reporting = attacker;
    this.fleeing = true;
    this.sinceSighting = 0;
  }

  /** Flees anything in view that's a danger to it: a pirate, if it carries ore or is marked, or a wanted ship. */
  private watchForPirates(sim: Sim): void {
    if (this.reporting) {
      // Meets a defender on the way, such as one coming to its call: it tells that one.
      if (sim.defenderNear(this.ship)) {
        sim.reportWanted(this.reporting, this.ship);
        this.reporting = null;
      } else {
        this.fleeing = true;
        return;
      }
    }
    if (!this.flees || !sim.tuning.trafficFlees) {
      this.fleeing = false;
      return;
    }
    this.sinceSighting += TICK;
    const sighted = sim.ships.some((other) => sim.threatens(other, this.ship) && this.inView(sim, other));
    if (sighted) {
      this.fleeing = true;
      this.sinceSighting = 0;
    }
  }

  /** Runs for the dock, whether or not the pirate is still in view, and waits there until it's clear. */
  private flee(sim: Sim): void {
    // A load banked on the way can't be lost.
    if (this.dropLoad(sim)) return;
    const station = sim.dockedAt(this.ship) ?? sim.nearestDock(this.ship.x, this.ship.y);
    const dock = sim.dockPoint(false, station);
    const before = sim.dockPoint(true, station);
    if (!sim.isDocked(this.ship)) {
      this.task = "fleeing";
      this.travel(sim, { x: dock.x, y: dock.y, px: before.x, py: before.y }, DOCK_ARRIVAL_SLACK, 0, null);
      return;
    }
    this.task = "sheltering";
    this.hold(sim, dock, before);
    if (this.reporting) {
      sim.reportWanted(this.reporting, this.ship);
      this.reporting = null;
      this.sinceSighting = 0;
    }
    if (this.sinceSighting > FLEE_CALM_SECONDS) {
      // What it was doing before has gone stale, and isn't its own fault.
      this.fleeing = false;
      this.rock = null;
      this.ore = null;
      this.targetAge = 0;
      this.retarget = 0;
    }
  }

  /** Buys the next thing on its list if it has the money. A test drone then buys a new drone. */
  private shop(sim: Sim): void {
    const { ship } = this;
    if (this.buys === "nothing") return;
    if (this.buys === "upgrades") {
      const next = sim.wishlistFor(ship)[0];
      if (!next) return;
      // The player's drones spend the player's money, so they leave it a bigger cushion.
      const buffer = ship.owner ? sim.tuning.droneBuffer : sim.tuning.trafficBuffer;
      if (sim.accountOf(ship).credits - sim.partPrice(next) >= buffer) sim.buyPart(ship, next);
      return;
    }
    if (ship.owner) return;
    const allowed = this.wishlist.slice(0, sim.tuning.droneParts);
    const next = allowed.find((part) => sim.wouldUse(ship, part));
    if (next) sim.buyPart(ship, next);
    else sim.buyDrone(ship);
  }

  /** The load is sold or lost: what it chose for that load is over too. */
  private endLoad(): void {
    this.turnAways = 0;
    this.turnedAwayBy.clear();
    this.sellAt = null;
    this.sellDeposit = null;
    this.backToRocks = false;
  }

  /**
   * Takes its ore to a deposit: the one it chose when turned away, or one nearer than the dock.
   * Returns whether it's doing that. What the chosen one won't take goes to a dock as usual.
   */
  private dropLoad(sim: Sim): boolean {
    const { ship } = this;
    if (sim.oreIn(ship) === 0) return false;
    if (this.sellDeposit && (!sim.deposits.includes(this.sellDeposit) || sim.depositRoom(this.sellDeposit) <= 0)) this.sellDeposit = null;
    const deposit = this.sellDeposit ?? sim.depositFor(ship);
    if (!deposit) return false;
    this.task = "to deposit";
    if (sim.depositAt(ship) === deposit) {
      sim.sellToDeposit(ship, deposit);
      if (deposit === this.sellDeposit) {
        this.sellDeposit = null;
        this.dropsThisLoad = false;
      }
    } else this.travel(sim, deposit, DEPOSIT_ARRIVAL, 0, null);
    return true;
  }

  /** The station this load is bound for instead of the nearest, while that base still stands. */
  private boundFor(sim: Sim): Poi | null {
    if (this.sellAt === null) return null;
    const base = sim.bases.find((each) => each.id === this.sellAt);
    if (!base) this.sellAt = null;
    return base?.poi ?? null;
  }

  private haul(sim: Sim): void {
    const { ship } = this;
    if (this.sellDeposit && this.dropLoad(sim)) return;
    // A damaged ship is going to the station for repairs anyway, so it sells its load there too.
    if (this.dropsThisLoad && ship.hull >= LOW_HULL && this.dropLoad(sim)) return;
    const bound = this.boundFor(sim);
    const docked = sim.dockedAt(ship);
    if (docked && (!bound || docked === bound)) {
      this.task = "unloading";
      if (this.turnsAway(sim, docked)) return;
      this.hold(sim, sim.dockPoint(false, docked), sim.dockPoint(true, docked));
      return;
    }
    // Sells at whichever station is nearest, or the one it chose when turned away.
    this.task = "to station";
    const station = bound ?? sim.nearestDock(ship.x, ship.y);
    const dock = sim.dockPoint(false, station);
    const before = sim.dockPoint(true, station);
    this.travel(sim, { x: dock.x, y: dock.y, px: before.x, py: before.y }, DOCK_ARRIVAL_SLACK, 0, null);
  }

  /**
   * Traffic docked with ore the station has no room for holds a few seconds, then rolls once for
   * this stop: wait, a deposit, back to mining, or the next station over. Returns whether it's
   * leaving, in which case it's already on its way.
   */
  private turnsAway(sim: Sim, docked: Poi): boolean {
    const { ship } = this;
    if (ship.owner || this.buys !== "upgrades" || this.waitsHere) return false;
    const base = sim.baseOf(docked);
    if (!base || sim.oreSale(base, ship).takes) {
      this.turnedFor = 0;
      return false;
    }
    this.turnedFor += TICK;
    if (this.turnedFor < sim.tuning.turnAwaySeconds) return false;
    this.turnedFor = 0;
    this.turnAways++;
    this.turnedAwayBy.add(base.id);
    const { weights, deposit, station } = this.turnAwayWeights(sim, base);
    const choice = pickTurnAway(weights, sim.roll());
    this.lastTurnAway = choice;
    if (choice === "wait") {
      this.waitsHere = true;
      sim.turnedAway(this, choice, base, null);
      return false;
    }
    this.leftStop = true;
    if (choice === "deposit" && deposit) {
      this.sellDeposit = deposit;
      sim.turnedAway(this, choice, base, { deposit });
      this.dropLoad(sim);
      return true;
    }
    if (choice === "station" && station) {
      this.sellAt = station.id;
      sim.turnedAway(this, choice, base, { poi: station.poi });
      return true;
    }
    // Back to the rocks with what it has: a field picked as on any stay.
    this.hauling = false;
    this.dropsThisLoad = false;
    this.backToRocks = true;
    this.retarget = 0;
    this.decidedField = false;
    this.chooseField(sim);
    sim.turnedAway(this, "mine", base, { poi: this.workingField(sim).poi });
    this.mine(sim);
    return true;
  }

  /**
   * How much each choice appeals to a ship turned away at a base, and where a deposit or another
   * station would take it. Each reason shows: a hauler due soon is worth waiting for, a ship
   * short of money takes the deposit's price, a ship with room mines more, and a long trip puts
   * it off another station.
   */
  turnAwayWeights(sim: Sim, base: Base): { weights: Record<TurnAway, number>; deposit: Deposit | null; station: Base | null } {
    const { ship } = this;
    const weights: Record<TurnAway, number> = { wait: 1, deposit: 1, mine: 1, station: 1 };

    const eta = sim.haulerEta(base);
    if (eta !== null && eta < HAULER_SOON) weights.wait *= 4;
    else if (eta === null || eta > HAULER_LATE) weights.wait *= 0.3;

    const deposit = sim.depositWithRoom(ship);
    if (!deposit) weights.deposit = 0;
    else {
      const next = sim.wishlistFor(ship)[0];
      const credits = sim.accountOf(ship).credits;
      if (credits < (next ? sim.partPrice(next) : SHORT_CREDITS)) weights.deposit *= 3;
    }

    const ore = sim.oreIn(ship);
    // A damaged ship turns for the dock again at once, so it doesn't go mining.
    if (ore >= sim.deliveryLoad(ship) || ship.hull < LOW_HULL || sim.crippled(ship)) weights.mine = 0;
    else if (ore < sim.cargoSpace(ship) / 2) weights.mine *= 2;

    const station = this.turnAways > MOST_TRIES ? null : sim.otherBase(base, this.turnedAwayBy);
    if (!station) weights.station = 0;
    else if (this.tripSeconds(sim, base.poi, station.poi) > LONG_TRIP) weights.station *= 0.5;

    return { weights, deposit, station };
  }

  private mine(sim: Sim): void {
    const { ship } = this;
    const field = this.workingField(sim);
    // Nearer another field than its own, or with a body still in the way, it's a trip there
    // first. So is a field still asleep: it wakes as the ship comes near, before it arrives.
    const away =
      sim.extraFields.length > 0 &&
      (sim.miningFieldAt(ship.x, ship.y).id !== field.id ||
        sim.sleeping.has(field.id) ||
        sim.cornerToward(ship.x, ship.y, field.poi.x, field.poi.y) !== null);
    if (away && (sim.oreIn(ship) === 0 || this.backToRocks)) {
      this.task = field.id === sim.ownField(ship).id ? "to field" : "to far field";
      this.travel(sim, field.poi, field.radius * FIELD_ARRIVAL_SHARE, 0, null);
      return;
    }
    this.habit = field.id;
    this.backToRocks = false;
    this.chooseTargets(sim, field);

    if (this.ore) {
      this.task = "gathering";
      this.flyTo(sim, this.ore, 0, PASS_THROUGH_ORE_SPEED, this.ore);
      return;
    }
    if (this.rock) {
      this.task = this.attack(sim, this.rock);
      return;
    }
    if (sim.oreIn(ship) > 0) {
      this.hauling = true;
      return;
    }
    // Mined out: back to the field by its own base.
    const own = sim.ownField(ship);
    if (field.id !== own.id) {
      this.working = own.id;
      return;
    }
    this.task = "idle";
    this.brake(sim, -ship.vx, -ship.vy, NEAR_TOLERANCE, null);
  }

  /**
   * Traffic leaves ore near the player alone unless its own shot broke it loose. The
   * player's drones work for the player, so they take it.
   */
  private leavesForPlayer(sim: Sim, ore: Ore): boolean {
    const { ship } = this;
    if (ship.owner || ore.from === ship) return false;
    return Math.hypot(ore.x - sim.ship.x, ore.y - sim.ship.y) < sim.tuning.trafficOreGap;
  }

  private chooseTargets(sim: Sim, field: MiningField): void {
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
    if (this.ore && (!sim.ores.includes(this.ore) || this.leavesForPlayer(sim, this.ore))) {
      this.ore = null;
      this.retarget = 0;
    }
    const elsewhere = (rock: Rock) => sim.extraFields.length > 0 && !sim.rockIn(field, rock);
    if (this.rock && (!sim.rocks.includes(this.rock) || elsewhere(this.rock))) {
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
      if (this.ignored.has(ore) || this.leavesForPlayer(sim, ore)) continue;
      const distance = Math.hypot(ore.x - ship.x, ore.y - ship.y);
      if (distance < best) {
        best = distance;
        this.ore = ore;
      }
    }

    // Stays with its rock until the rock breaks, instead of wandering between them. Only
    // its own field's: another field's rocks are a trip, not a target.
    if (!this.rock) {
      best = Infinity;
      for (const rock of sim.rocks) {
        if (this.ignored.has(rock) || elsewhere(rock)) continue;
        const distance = Math.hypot(rock.x - ship.x, rock.y - ship.y) - rock.radius;
        if (distance < best) {
          best = distance;
          this.rock = rock;
        }
      }
    }
    // With nothing else left, what it gave up on is worth another try.
    if (!this.rock && sim.rocks.length > 0) this.ignored = new WeakSet();
    if (this.ore !== previousOre || this.rock !== previousRock) this.targetAge = 0;
  }

}

/**
 * A place a course follows. The order holds it by reference and reads where it is now, so
 * the destination stays at a fixed spot in the place's own axes while it moves and turns.
 * A Poi or a Deposit, by shape: where it is now and last tick, and how it's turned, if it turns.
 */
export interface CourseTarget {
  x: number;
  y: number;
  px: number;
  py: number;
  rotation?: number;
  prevRotation?: number;
}

/** Where in the place's own axes the course ends, and how short of the centre it stops. */
interface CourseFollow {
  poi: CourseTarget;
  ox: number;
  oy: number;
  slack: number;
}

interface ClickOrder {
  /**
   * The destination. The sim moves and carries it like any loose body, so a spot at rest
   * stays put against whatever carries things there, and a drawn velocity drifts it on.
   * A course instead reads its place live, through `follow`.
   */
  spot: Body;
  /** The place this course flies to and keeps, in place of a carried spot. */
  follow?: CourseFollow;
  /** The spot was given a velocity of its own. */
  drifts: boolean;
  /** Flies to the destination. Without it the order only stops or turns, where the ship is. */
  move: boolean;
  /** The facing held whenever no burn needs the nose, or null to leave the nose be. */
  face: number | null;
  stage: "flying" | "stopping" | "settling" | "facing";
  /** Reached its spot while settling, so from then on it only stops. */
  landed?: boolean;
  /** A hull without side thrusters has begun the one brake that ends it on its spot. */
  braking?: boolean;
  closest: number;
  stuck: number;
  /** How far the move had to go when it was ordered, for scaling its top speed. */
  trip?: number;
  /** Flies the straight line whatever is in the way, even with the route planner. */
  straight?: boolean;
}

/** A click move's speed ceiling, as a share of the peak it would reach burning full to the halfway point. */
const TRIP_CEILING = 0.75;

/**
 * Carries out the player's orders: fly to a spot (rotate, thrust, coast, rotate to stop,
 * thrust), leave it drifting at a drawn speed, stop, or hold a facing. Flight keys take over
 * while held, and the order picks up again from wherever the ship is once they're let go.
 */
export class ClickPilot extends ShipPilot {
  private order: ClickOrder | null = null;
  /** Seconds until the order takes back over from the keys. */
  private handsOff = 0;

  get active(): boolean {
    return this.order !== null;
  }

  /** Whether the order is a course for a place, rather than a click order in the world. */
  get isCourse(): boolean {
    return !!this.order?.follow;
  }

  /** Has an order and is flying it, not waiting out the player's hands on the keys. */
  get flying(): boolean {
    return this.order !== null && this.handsOff <= 0;
  }

  /** What the order is doing, in words for the display. */
  get task(): string {
    const { order } = this;
    if (!order) return "";
    if (this.handsOff > 0) return "waiting for the keys";
    if (order.follow) return order.stage === "flying" ? "on course" : "coming in";
    return order.stage;
  }

  /** Where a flight leads right now, or null without one. */
  target(): Mover | null {
    const { order } = this;
    if (!order?.move) return null;
    return order.follow ? this.courseSpot(order.follow) : order.spot;
  }

  /** The destination for the sim to move and carry, or null without an order. */
  get spot(): Body | null {
    return this.order?.spot ?? null;
  }

  /** Whether the destination drifts along rather than staying put. */
  get drifting(): boolean {
    return !!this.order?.move && this.order.drifts;
  }

  /** The facing the order holds, or null. */
  facing(): number | null {
    return this.order?.face ?? null;
  }

  /**
   * Flies to a world spot. With a drawn velocity the spot moves on after the order and
   * the ship ends up moving along with it. The drawn velocity is on top of the ship's own,
   * or with `absolute`, against whatever carries things at the spot. A drawn facing
   * carries over from the order before.
   */
  moveTo(_sim: Sim, x: number, y: number, vx = 0, vy = 0, absolute = false, straight = false): void {
    const { ship } = this;
    const drifts = vx !== 0 || vy !== 0;
    const base = drifts && !absolute ? ship : { vx: 0, vy: 0 };
    this.order = {
      spot: { x, y, px: x, py: y, vx: base.vx + vx, vy: base.vy + vy },
      drifts,
      move: true,
      face: this.order?.face ?? null,
      stage: "flying",
      closest: Infinity,
      stuck: 0,
      trip: Math.hypot(x - ship.x, y - ship.y),
      straight,
    };
    this.handsOff = 0;
  }

  /**
   * Sets a course for a place, ending `slack` short of its centre (or at the spot `ox, oy`
   * in its own axes, for a dock). The course chases the place as it moves and turns.
   */
  travelTo(poi: CourseTarget, ox = 0, oy = 0, slack = 0): void {
    this.order = {
      spot: { x: poi.x, y: poi.y, px: poi.px, py: poi.py, vx: 0, vy: 0 },
      follow: { poi, ox, oy, slack },
      drifts: false,
      move: true,
      face: this.order?.face ?? null,
      stage: "flying",
      closest: Infinity,
      stuck: 0,
    };
    this.handsOff = 0;
  }

  /** Where the course's place is now, and was a tick ago, at the order's spot in its axes. */
  private courseSpot(follow: CourseFollow): Mover {
    const { poi } = follow;
    if (follow.ox === 0 && follow.oy === 0) return poi;
    return poiSpot(poi as Poi, follow.ox, follow.oy);
  }

  /**
   * Corrects the destination's drift by a small velocity, without starting over. Says the
   * same thing whatever the ship is doing, since it's measured against the destination.
   */
  nudge(vx: number, vy: number): boolean {
    const { order } = this;
    // A course's destination is its place, not a spot a drift can be drawn onto.
    if (!order?.move || order.follow) return false;
    order.spot.vx += vx;
    order.spot.vy += vy;
    order.drifts = true;
    // Flies again from wherever it is, so it ends up matching the new drift.
    order.stage = "flying";
    order.closest = Infinity;
    order.stuck = 0;
    return true;
  }

  /** Comes to rest against whatever carries things where the ship is. */
  stop(_sim: Sim): void {
    this.order = {
      spot: this.restingSpot(),
      drifts: false,
      move: false,
      face: this.order?.face ?? null,
      stage: "stopping",
      closest: Infinity,
      stuck: 0,
    };
    this.handsOff = 0;
  }

  /**
   * Holds a facing: for the rest of a move, during coasts and after arriving. Without a
   * move it just turns there.
   */
  face(_sim: Sim, angle: number): void {
    if (this.order) {
      this.order.face = angle;
      return;
    }
    this.order = {
      spot: this.restingSpot(),
      drifts: false,
      move: false,
      face: angle,
      stage: "facing",
      closest: Infinity,
      stuck: 0,
    };
    this.handsOff = 0;
  }

  /** The player is on the keys: they fly, and the order waits until they've let go a while. */
  handsOn(): void {
    if (!this.order) return;
    if (this.handsOff <= 0) {
      this.clearControls();
      this.ship.controls.stabilize = true;
    }
    this.handsOff = HANDS_OFF_SECONDS;
  }

  cancel(): void {
    this.order = null;
    this.handsOff = 0;
    this.burning = false;
    this.thrusting = false;
    this.clearControls();
    this.ship.controls.stabilize = true;
  }

  /** A spot at rest where the ship is now. */
  private restingSpot(): Body {
    const { x, y } = this.ship;
    return { x, y, px: x, py: y, vx: 0, vy: 0 };
  }

  private clearControls(): void {
    const { controls } = this.ship;
    controls.thrust = 0;
    controls.strafe = 0;
    controls.turn = 0;
    controls.retro = false;
    controls.stabilize = false;
  }

  update(sim: Sim): void {
    const { order, ship } = this;
    if (!order) return;
    const stopping = order.stage === "stopping" || order.stage === "settling";
    const needs = order.follow ? "autopilot" : order.move || stopping ? "clickMove" : "clickTurn";
    if (!ship.parts.has(needs)) {
      this.cancel();
      return;
    }
    // Whatever turns the ship turns the nose's goal too.
    if (order.face !== null) order.face += ship.carriedTurn;

    if (this.handsOff > 0) {
      // The keys fly. Once they're let go, the order plans again from wherever that left it.
      this.handsOff -= TICK;
      if (order.move) order.stage = "flying";
      order.closest = Infinity;
      order.stuck = 0;
      this.burning = false;
      this.thrusting = false;
      return;
    }

    this.clearControls();
    this.correctingDirectly = false;
    const target = order.follow ? this.courseSpot(order.follow) : order.spot;
    const distance = Math.hypot(target.x - ship.x, target.y - ship.y);
    const { vx, vy } = this.relativeVelocity(target);
    const speed = Math.hypot(vx, vy);

    // Settling makes no headway on purpose once it's on the spot, so that isn't being stuck.
    if (order.move && order.stage !== "settling") {
      if (distance < order.closest - CLICK_PROGRESS) {
        order.closest = distance;
        order.stuck = 0;
      }
      order.stuck += TICK;
      if (order.stuck > CLICK_STUCK_SECONDS) {
        this.cancel();
        return;
      }
    }

    if (order.stage === "flying") {
      if (order.follow) {
        const at = distance - order.follow.slack;
        if (at < ARRIVE_DISTANCE && speed < ARRIVE_SPEED) order.stage = "stopping";
        else this.travel(sim, target, order.follow.slack, 0, null);
      } else if (distance < ARRIVE_DISTANCE && speed < ARRIVE_SPEED) {
        order.stage = "stopping";
      } else this.flyTo(sim, target, 0, 0, null);
    }
    // A hull that has to turn round to brake doesn't stop the moment it is in range: it
    // coasts in and makes that one turn and one burn, so the last of the way is flown rather
    // than eased. See `coastIn`.
    if (this.coastsIn(order) && order.stage === "stopping") {
      if (this.coastIn(sim, order, distance, vx, vy, target)) return;
    }
    if (order.stage === "stopping") {
      // Either way it trims what speed is left: to rest, or to exactly the drawn drift.
      if (speed < STOPPED_SPEED) order.stage = "settling";
      // The retro switch stops dead against the POI, not against a drifting spot.
      else if (order.drifts) this.steer(sim, -vx, -vy, STOPPED_SPEED, order.face);
      else this.brake(sim, -vx, -vy, STOPPED_SPEED, order.face);
    }
    if (order.stage === "settling") this.settle(sim, order, target, distance, vx, vy);
    if (order.stage === "facing") {
      const { face } = order;
      if (face === null) {
        this.cancel();
        return;
      }
      const off = Math.abs(wrapAngle(face - ship.angle));
      if (off < FACING_ANGLE && Math.abs(ship.spin) < FACING_SPIN) this.cancel();
      else this.turnTo(sim, face);
    }
  }

  /** A plain click move on a hull with no side thrusters: the one that has to turn to brake. */
  private coastsIn(order: ClickOrder): boolean {
    const { ship } = this;
    if (order.follow || !order.move || order.drifts || ship.parts.has("strafe")) return false;
    // Coasting in means the line to the spot stays a line, with the same motion carrying the
    // ship and everything around it. A deposit's ring swings it by itself, and a POI's carry
    // fades with distance, and either way that line turns as the ship comes in. The ease flies
    // those, the way it always has.
    if (ship.frameShare > 0 && ship.frameShare < 1) return false;
    return ship.frame === null || ship.frame.name !== "field deposit";
  }

  /**
   * How a hull without side thrusters is stopped. It can only push along its nose, so stopping
   * means putting the nose against its motion and burning, and that turn takes seconds the
   * hull spends coasting. So the move coasts in at the speed it came in at, until the turn and
   * the burn together end it on its spot, and takes the one brake from there.
   *
   * The older way, stopping as soon as it was in range and easing the rest of the way, turned
   * the nose for every flicker of the correction. A hull with nothing to damp a spin tumbled
   * there instead: twenty to forty seconds of it, and the order never finished
   * (docs/dock-click-plan.md, finding 2).
   */
  private coastIn(sim: Sim, order: ClickOrder, off: number, vx: number, vy: number, target: Mover): boolean {
    const { ship } = this;
    const speed = Math.hypot(vx, vy);
    if (!order.braking) {
      // On the spot already, or nothing to brake: the settle eases it the way it always has.
      if (off < LANDING_TURNING || speed < REST_SPEED) return false;
      // The nose has to come round against the motion first, and the hull coasts while it
      // does, so the brake starts where the turn and the burn end it on its spot.
      const turn = (Math.abs(wrapAngle(Math.atan2(-vy, -vx) - ship.angle)) / Math.PI) * this.flipSeconds(sim);
      const accel = sim.tuning.thrust * sim.shipResponse(ship);
      const closing = (vx * (target.x - ship.x) + vy * (target.y - ship.y)) / (off || 1);
      // Passing it without touching it: brake anyway, so the ship ends near its spot.
      if (closing > 0 && off > speed * turn + (speed * speed) / (2 * accel)) return true;
      order.braking = true;
    }
    this.brake(sim, -vx, -vy, LANDING_SPEED, order.face);
    if (speed >= LANDING_SPEED) return true;
    // Stopped. Within reach of its spot is landed; a hull that can't hover needs a wider
    // reach than one that can, and a few units of a click isn't worth more turning for.
    if (off <= BRAKE_MISS) {
      order.stage = "facing";
      return true;
    }
    return false;
  }

  /**
   * The last few units of speed, trimmed away at part throttle: a move eases onto its spot,
   * and either way the ship ends at rest against what carries it. Once on the spot it only
   * stops, wherever that leaves it.
   */
  private settle(sim: Sim, order: ClickOrder, target: Mover, distance: number, vx: number, vy: number): void {
    // A course stops `slack` short of its place, so the distance left is less the slack.
    const slack = order.follow?.slack ?? 0;
    const off = Math.max(0, distance - slack);
    // Without side thrusters it eases in more gently and lands less exactly: slow enough
    // that the drift while it turns around to brake stays inside the landing circle.
    const direct = this.ship.parts.has("strafe");
    const flip = this.flipSeconds(sim);
    const landing = direct ? SETTLED_DISTANCE : LANDING_TURNING;
    if (off < landing && Math.hypot(vx, vy) < LANDING_SPEED) order.landed = true;
    // A drifting destination isn't eased onto, just matched: it carries on moving.
    const easing = order.move && !order.drifts && !order.landed;
    let wantX = 0;
    let wantY = 0;
    if (easing) {
      const rate = direct ? EASE_RATE : 1 / (EASE_FLIPS * flip);
      const floor = direct ? EASE_FLOOR : landing / flip;
      const speed = Math.min(EASE_SPEED, Math.max(floor, off * rate));
      wantX = ((target.x - this.ship.x) / distance) * speed;
      wantY = ((target.y - this.ship.y) / distance) * speed;
    }
    const needX = wantX - vx;
    const needY = wantY - vy;
    if (!easing && Math.hypot(needX, needY) < REST_SPEED) {
      order.stage = "facing";
      return;
    }
    const most = EASE_ACCELERATION * TICK;
    const need = Math.hypot(needX, needY);
    const share = need > most ? most / need : 1;
    this.trim(sim, needX * share, needY * share, order.face);
  }

  /** About how long it takes to turn the nose around, from its rotation thrust and top spin. */
  private flipSeconds(sim: Sim): number {
    const accel = ((sim.tuning.rotationThrust * Math.PI) / 180) * sim.shipResponse(this.ship);
    const peak = Math.sqrt(accel * Math.PI);
    if (peak <= SPIN_LIMIT) return (2 * peak) / accel;
    return Math.PI / SPIN_LIMIT + SPIN_LIMIT / accel;
  }

  /**
   * Makes a small velocity change this tick at part throttle, so it gets just what it asks
   * for. Side and reverse thrusters do it without turning; otherwise the nose turns to it.
   */
  private trim(sim: Sim, needX: number, needY: number, hold: number | null): void {
    const { ship } = this;
    const { tuning } = sim;
    const perTick = TICK * sim.shipResponse(ship);
    const throttle = (change: number, full: number) => Math.max(-1, Math.min(1, change / full));
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    const forward = needX * cos + needY * sin;
    const side = -needX * sin + needY * cos;
    const { parts } = ship;
    if (parts.has("strafe") && (forward >= 0 || parts.has("reverse"))) {
      const full = forward >= 0 ? tuning.thrust : tuning.reverseThrust;
      ship.controls.thrust = throttle(forward, full * perTick);
      ship.controls.strafe = throttle(side, tuning.sideThrust * perTick);
      this.turnTo(sim, hold ?? ship.angle);
      return;
    }
    const needAngle = Math.atan2(needY, needX);
    const backward = needAngle + Math.PI;
    const useReverse =
      parts.has("reverse") &&
      Math.abs(wrapAngle(backward - ship.angle)) < Math.abs(wrapAngle(needAngle - ship.angle));
    const burnAngle = useReverse ? backward : needAngle;
    this.turnTo(sim, burnAngle);
    const off = Math.abs(wrapAngle(burnAngle - ship.angle));
    if (off >= TRIM_ANGLE) return;
    // Only the part along the nose; what's left over waits for the next turn.
    const along = Math.hypot(needX, needY) * Math.cos(off);
    const full = (useReverse ? tuning.reverseThrust : tuning.thrust) * perTick;
    ship.controls.thrust = (useReverse ? -1 : 1) * throttle(along, full);
  }

  protected override speedLimitHere(sim: Sim): number {
    // A course is in it for the distance: the burn out and brake in set the pace, and the
    // cap only keeps a crossing between stars sane.
    if (this.order?.follow) return sim.tuning.autopilotSpeed;
    // A click move's ceiling comes from the trip: full thrust to the halfway point and brake
    // for the rest peaks at sqrt(accel * distance), and it stays at 75% of that.
    const accel = sim.tuning.thrust * sim.shipResponse(this.ship);
    const peak = Math.sqrt(accel * (this.order?.trip ?? 0));
    const scaled = peak * TRIP_CEILING;
    return Math.min(sim.tuning.autopilotSpeed, scaled);
  }

  /**
   * Straight at the spot, whatever is in the way, unless it has the route planner or a course.
   * A click on a station's pad is the one straight line that isn't: from the far side of the
   * station it runs through the solid box, so it takes the ring round the station it is going
   * to. Rocks stay out of it, so an order without the planner decides a line and keeps it.
   */
  protected override routeAround(
    sim: Sim,
    target: { x: number; y: number; px: number; py: number },
    exclude: object | null,
  ): { x: number; y: number } {
    const { ship } = this;
    if ((ship.parts.has("clickRoute") && !this.order?.straight) || this.order?.follow) return super.routeAround(sim, target, exclude);
    if (!this.order?.straight && sim.docks.some((station) => aimsAtBerth(station, target))) {
      return super.routeAround(sim, target, exclude, false);
    }
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    const distance = Math.hypot(dx, dy) || 1;
    return { x: dx / distance, y: dy / distance };
  }

  /**
   * A drawn facing, or else gets ready for the braking burn: nose against the motion,
   * or along it with a reverse thruster.
   */
  protected override coastNose(vx: number, vy: number): number | null {
    const { ship } = this;
    if (this.order && this.order.face !== null) return this.order.face;
    if (Math.hypot(vx, vy) < COAST_TURN_SPEED) return null;
    const braking = Math.atan2(-vy, -vx);
    if (!ship.parts.has("reverse")) return braking;
    const reversing = braking + Math.PI;
    const shorter =
      Math.abs(wrapAngle(reversing - ship.angle)) < Math.abs(wrapAngle(braking - ship.angle));
    return shorter ? reversing : braking;
  }
}

/** How close it gets to a target before it stops closing in. */
const FIGHT_DISTANCE = 300;
const PATROL_TRIES = 8;
/** Close enough to a spot it was checking. */
const SPOT_REACHED = 120;
/** Keeps moving through patrol points rather than stopping at each. */
const PATROL_PASS_SPEED = 60;
const PATROL_GIVE_UP_SECONDS = 60;
const HOME_SLACK = 50;
/** How long it chases one piece of ore before trying another. */
const ORE_GIVE_UP_SECONDS = 30;

/**
 * A pirate or a defender. It looks where its nose points and chases what it sees.
 * When that leaves its view it goes to where it last saw it, then back to patrolling
 * the field. A pirate hunts any ship. A defender hunts pirates, and goes to ships under fire.
 */
export class FighterPilot extends ShipPilot {
  /** What it's doing, in words for the display. */
  task = "patrolling";
  private target: Ship | null = null;
  /** How long each ship has been in view, rising in view and falling out of it. */
  private spotting = new WeakMap<Ship, number>();
  private lastSeen: { poi: Poi; x: number; y: number } | null = null;
  private patrol: { poi: Poi; x: number; y: number } | null = null;
  private patrolAge = 0;
  private wrecks = 0;
  private headingHome = false;
  private ore: Ore | null = null;
  private oreAge = 0;
  private ignoredOre = new WeakSet<object>();
  private rock: Rock | null = null;
  private rockAge = 0;
  private ignoredRocks = new WeakSet<object>();
  /** Where the nose should stay this tick, or null to look where it's going. */
  private look: number | null = null;

  /**
   * Nothing on its mind but its round: no target, nobody to look for, no call to answer and
   * no loose ore to pick up. Only then can it be a record.
   */
  get calm(): boolean {
    return this.target === null && this.lastSeen === null && this.ore === null && this.task !== "responding";
  }

  /** After a ship or looking for one, or answering a call: anything but its round. */
  get fighting(): boolean {
    return this.target !== null || this.lastSeen !== null || this.task === "responding";
  }

  /** Going home to sell or be repaired. */
  get isHeadingHome(): boolean {
    return this.headingHome;
  }

  /** The field it keeps watch over: a defender's is the one by its base. */
  patrolField(sim: Sim): MiningField {
    if (this.ship.faction === "defender") {
      const home = sim.homeBaseOf(this.ship).poi;
      return sim.miningFieldAt(home.x, home.y);
    }
    return sim.miningFields()[0];
  }

  /** Done with its load: it takes it home. */
  headHome(): void {
    this.headingHome = true;
  }

  /** Home with its load sold and its hull seen to, as far as it could pay. */
  cameHome(): void {
    this.headingHome = false;
  }

  /**
   * A record turned back into a ship: what it was doing as a record isn't anything it
   * remembers as a ship, so it picks its next rock and patrol spot afresh.
   */
  wake(): void {
    this.patrol = null;
    this.rock = null;
    this.ore = null;
    this.look = null;
  }

  /** Woken out of view by catching sight of a ship: it goes after it as if just spotted. */
  spot(sim: Sim, other: Ship): void {
    this.spotting.set(other, sim.tuning.detectSeconds);
    this.remember(sim, other.x, other.y);
  }

  /** Whether it goes after a ship when it sees one. */
  goesAfter(sim: Sim, other: Ship): boolean {
    return this.wants(sim, other);
  }

  /** Whether another ship is inside this one's cone of vision, in range, with no rock in the way. */
  sees(sim: Sim, other: Ship): boolean {
    const { ship } = this;
    const direction = Math.atan2(other.y - ship.y, other.x - ship.x);
    const off = Math.abs(wrapAngle(direction - ship.angle));
    if (off > ((sim.tuning.visionAngle / 2) * Math.PI) / 180) return false;
    return this.inView(sim, other);
  }

  /** How close it is to spotting a ship, from 0 to 1. */
  spotted(sim: Sim, other: Ship): number {
    if (this.target === other) return 1;
    const { detectSeconds } = sim.tuning;
    if (detectSeconds <= 0) return 0;
    return Math.min(1, (this.spotting.get(other) ?? 0) / detectSeconds);
  }

  update(sim: Sim): void {
    const { ship } = this;
    const { controls } = ship;
    controls.thrust = 0;
    controls.strafe = 0;
    controls.turn = 0;
    controls.fire = false;
    controls.retro = false;
    controls.stabilize = false;
    this.correctingDirectly = false;
    this.look = null;

    // A rebuilt ship starts over, with nothing to remember.
    if (ship.wrecks !== this.wrecks) {
      this.wrecks = ship.wrecks;
      this.target = null;
      this.lastSeen = null;
      this.patrol = null;
      this.headingHome = false;
      this.ore = null;
      this.rock = null;
      ship.shotFrom = null;
    }

    // A shot from out of view is worth checking, whoever is under fire elsewhere.
    if (ship.shotFrom) {
      if (!this.target) this.remember(sim, ship.shotFrom.x, ship.shotFrom.y);
      ship.shotFrom = null;
    }

    if (this.shouldRetreat(sim)) {
      this.target = null;
      this.lastSeen = null;
      this.headingHome = true;
      if (this.goHome(sim)) return;
    }

    this.chooseTarget(sim);
    if (this.target) {
      this.fight(sim, this.target);
      return;
    }
    if (this.lastSeen) {
      this.search(sim);
      return;
    }
    const distress = sim.distress;
    // A defender answers a call near its own base: the nearest base answers each call.
    const ours = (other: Ship) => sim.nearestDock(other.x, other.y) === sim.homeBaseOf(ship).poi;
    if (ship.faction === "defender" && distress && distress.ship !== ship && ours(distress.ship)) {
      this.task = "responding";
      this.flyTo(sim, distress.ship, FIGHT_DISTANCE, PATROL_PASS_SPEED, null);
      return;
    }
    if (this.goHome(sim)) return;
    if (this.gather(sim)) return;
    if (ship.faction === "pirate" && this.mine(sim)) return;
    if (sim.oreIn(ship) > 0) {
      this.headingHome = true;
      this.goHome(sim);
      return;
    }
    this.fly(sim);
  }

  private get isPirate(): boolean {
    return this.ship.faction === "pirate";
  }

  /** A hurt pirate breaks off even mid-fight, as long as going home would get it fixed. */
  private shouldRetreat(sim: Sim): boolean {
    const { ship } = this;
    if (!this.isPirate || !sim.tuning.pirateRetreats || (ship.hull >= LOW_HULL && !sim.crippled(ship))) return false;
    return sim.oreIn(ship) > 0 || sim.canPayRepair(ship);
  }

  /** Whether a pirate should stay clear of a spot: it only goes under the guns on a chase. */
  private keepsClear(sim: Sim, x: number, y: number): boolean {
    return this.isPirate && sim.inGuardRange(x, y);
  }

  /** Goes home to sell a full load or repair a low hull. Returns whether it's doing that. */
  private goHome(sim: Sim): boolean {
    const { ship } = this;
    const canPay = sim.oreIn(ship) > 0 || sim.canPayRepair(ship);
    if (sim.oreIn(ship) >= sim.deliveryLoad(ship) || ((ship.hull < LOW_HULL || sim.crippled(ship)) && canPay)) {
      this.headingHome = true;
    }
    const busy = sim.oreIn(ship) > 0 || sim.canRepair(ship);
    if (sim.isHome(ship) && busy) {
      this.task = "at home";
      this.hold(sim, sim.homeOf(ship), sim.homeOf(ship, ship.faction, true));
      this.headingHome = true;
      return true;
    }
    if (sim.isHome(ship)) this.headingHome = false;
    if (!this.headingHome) return false;
    this.task = "heading home";
    const home = sim.homeOf(ship);
    const before = sim.homeOf(ship, ship.faction, true);
    this.flyTo(sim, { x: home.x, y: home.y, px: before.x, py: before.y }, HOME_SLACK, 0, null);
    return true;
  }

  /** Flies through the nearest loose ore in range. Returns whether there is any. */
  private gather(sim: Sim): boolean {
    const { ship } = this;
    if (this.ore && !sim.ores.includes(this.ore)) this.ore = null;
    this.oreAge += TICK;
    if (this.ore && this.oreAge > ORE_GIVE_UP_SECONDS) {
      this.ignoredOre.add(this.ore);
      this.ore = null;
    }
    if (!this.ore) {
      let best = sim.tuning.visionRange;
      for (const ore of sim.ores) {
        if (this.ignoredOre.has(ore) || this.keepsClear(sim, ore.x, ore.y)) continue;
        const distance = Math.hypot(ore.x - ship.x, ore.y - ship.y);
        if (distance < best) {
          best = distance;
          this.ore = ore;
        }
      }
      this.oreAge = 0;
    }
    if (!this.ore) return false;
    this.task = "gathering";
    this.flyTo(sim, this.ore, 0, PASS_THROUGH_ORE_SPEED, this.ore);
    return true;
  }

  /** Works the nearest rock until it breaks. Returns whether there is one to work. */
  private mine(sim: Sim): boolean {
    const { ship } = this;
    if (this.rock && !sim.rocks.includes(this.rock)) this.rock = null;
    this.rockAge += TICK;
    if (this.rock && this.rockAge > GIVE_UP_SECONDS) {
      this.ignoredRocks.add(this.rock);
      this.rock = null;
    }
    if (!this.rock) {
      let best = Infinity;
      for (const rock of sim.rocks) {
        if (this.ignoredRocks.has(rock) || this.keepsClear(sim, rock.x, rock.y)) continue;
        const distance = Math.hypot(rock.x - ship.x, rock.y - ship.y) - rock.radius;
        if (distance < best) {
          best = distance;
          this.rock = rock;
        }
      }
      this.rockAge = 0;
    }
    if (!this.rock) return false;
    const stage = this.attack(sim, this.rock);
    this.task = stage === "shooting" ? "mining" : "to rock";
    return true;
  }

  private wants(sim: Sim, other: Ship): boolean {
    if (other === this.ship || other.hull <= 0 || sim.isDocked(other)) return false;
    // A pirate goes for cargo, or for whoever marked themselves by shooting one.
    if (this.ship.faction === "pirate") return sim.threatens(this.ship, other);
    return other.faction === "pirate" || other.wanted;
  }

  /** Stays on its target while it can see it. Otherwise the nearest thing in view long enough. */
  private chooseTarget(sim: Sim): void {
    const { ship } = this;
    if (this.target) {
      if (this.wants(sim, this.target) && this.sees(sim, this.target)) {
        this.remember(sim, this.target.x, this.target.y);
        return;
      }
      // Gone from view. The last sight of it is what `lastSeen` already holds.
      this.target = null;
    }
    let best = Infinity;
    for (const other of sim.ships) {
      if (!this.wants(sim, other)) {
        this.spotting.delete(other);
        continue;
      }
      const seen = this.sees(sim, other);
      const time = Math.max(0, (this.spotting.get(other) ?? 0) + (seen ? TICK : -TICK));
      this.spotting.set(other, time);
      if (!seen || time < sim.tuning.detectSeconds || this.keepsClear(sim, other.x, other.y)) continue;
      const distance = Math.hypot(other.x - ship.x, other.y - ship.y);
      if (distance < best) {
        best = distance;
        this.target = other;
      }
    }
    if (this.target) this.remember(sim, this.target.x, this.target.y);
  }

  private remember(sim: Sim, x: number, y: number): void {
    const poi = sim.nearestPoi(x, y);
    this.lastSeen = { poi, ...toPoiAxes(poi, x, y) };
  }

  /** Closes to fighting distance with its nose leading the target, and fires when lined up. */
  private fight(sim: Sim, target: Ship): void {
    const { ship } = this;
    const { tuning } = sim;
    this.task = "attacking";
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    const distance = Math.hypot(dx, dy) || 1;
    const { vx, vy } = this.relativeVelocity(target);
    const flightTime = distance / tuning.shotSpeed;
    this.look = Math.atan2(dy - vy * flightTime, dx - vx * flightTime);
    this.flyTo(sim, target, FIGHT_DISTANCE, 0, target);
    const aimedWithin = Math.atan2(SHIP_RADIUS * 2, distance);
    const lined = Math.abs(wrapAngle(this.look - ship.angle)) < aimedWithin;
    ship.controls.fire = lined && distance < tuning.shotSpeed * tuning.shotLife * 0.9;
  }

  /** Goes to where it last saw something, looking that way. */
  private search(sim: Sim): void {
    const { ship } = this;
    const { poi, x, y } = this.lastSeen!;
    const spot = poiSpot(poi, x, y);
    if (Math.hypot(spot.x - ship.x, spot.y - ship.y) < SPOT_REACHED || this.keepsClear(sim, spot.x, spot.y)) {
      this.lastSeen = null;
      this.fly(sim);
      return;
    }
    this.task = "searching";
    this.flyTo(sim, spot, 0, PATROL_PASS_SPEED, null);
  }

  /** Flies from one random spot in the field to the next: a defender's is the one by its base. */
  private fly(sim: Sim): void {
    const { ship } = this;
    const { poi: field, radius } = this.patrolField(sim);
    this.task = "patrolling";
    this.patrolAge += TICK;
    const reached =
      this.patrol &&
      Math.hypot(
        poiSpot(this.patrol.poi, this.patrol.x, this.patrol.y).x - ship.x,
        poiSpot(this.patrol.poi, this.patrol.x, this.patrol.y).y - ship.y,
      ) < SPOT_REACHED;
    if (!this.patrol || reached || this.patrolAge > PATROL_GIVE_UP_SECONDS) {
      // A few tries at a spot clear of any turrets. A field that's all covered gets patrolled anyway.
      for (let tries = 0; tries < PATROL_TRIES; tries++) {
        const distance = radius * Math.sqrt(sim.roll());
        const dir = sim.roll() * Math.PI * 2;
        const x = Math.cos(dir) * distance;
        const y = Math.sin(dir) * distance;
        this.patrol = { poi: field, x, y };
        const spot = poiSpot(field, x, y);
        if (!this.keepsClear(sim, spot.x, spot.y)) break;
      }
      this.patrolAge = 0;
    }
    this.flyTo(sim, poiSpot(field, this.patrol!.x, this.patrol!.y), 0, PATROL_PASS_SPEED, null);
  }

  /** Always looking at its target, or else where it's going, so it sees what's ahead. */
  protected override flightNose(heading: { x: number; y: number }): number | null {
    return this.look ?? Math.atan2(heading.y, heading.x);
  }
}
