import { DRONE_BUY_ORDER, type PartId } from "./parts";
import {
  type Ore,
  type Poi,
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
/** Corrections up to this size are made without turning, if the thrusters allow it. */
const DIRECT_LIMIT = 80;
/** Time to bring the nose to bear when braking with the reverse thruster. */
const REVERSE_BRAKE_SECONDS = 0.3;
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
/** A push on the rotation thrusters carries on until the error is this share of the above. */
const SPIN_PUSH_FINISH = 0.2;
const RETARGET_SECONDS = 0.5;
const GIVE_UP_SECONDS = 30;
const AVOID_LOOK_AHEAD = 500;
const AVOID_MARGIN = 30;
const DOCK_ARRIVAL_SLACK = 100;
/** Below this it heads home early, as long as it can pay for the repair when it gets there. */
const LOW_HULL = 30;
/** Within this distance and under this speed, a click order stops flying and starts stopping. */
const ARRIVE_DISTANCE = 40;
const ARRIVE_SPEED = 20;
/** Under this speed it counts as stopped. */
const STOPPED_SPEED = 6;
const FACING_ANGLE = 0.05;
const FACING_SPIN = 0.1;
/** Gives up on a click order that gets no closer for this long, such as a spot inside a rock. */
const CLICK_STUCK_SECONDS = 30;
/** Closer than this counts as progress on a click order. */
const CLICK_PROGRESS = 10;
/** Under this speed there's no braking burn to get ready for. */
const COAST_TURN_SPEED = 10;

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

  constructor(readonly ship: Ship) {}

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
      null,
      this.coastNose(vx, vy),
    );
  }

  /** Where the nose goes while coasting, or null to leave it. */
  protected coastNose(_vx: number, _vy: number): number | null {
    return null;
  }

  /** Slower inside the field and when coming up on it, so an impact is only a dent. */
  protected speedLimitHere(sim: Sim): number {
    const { ship } = this;
    const { field, tuning } = sim;
    const outside = Math.hypot(ship.x - field.x, ship.y - field.y) - tuning.fieldRadius;
    const nearField = tuning.droneFieldSpeed + this.stoppingSpeed(sim, Math.max(0, outside));
    return Math.min(tuning.droneCruiseSpeed, nearField);
  }

  /** The fastest speed from which the ship can still turn and stop within a distance. */
  protected stoppingSpeed(sim: Sim, distance: number): number {
    const { ship } = this;
    const { tuning } = sim;
    const hasReverse = ship.parts.has("reverse");
    const thrust = hasReverse ? tuning.reverseThrust : tuning.thrust;
    const accel = thrust * sim.shipResponse(ship) * BRAKE_MARGIN;
    const spinAccel = ((tuning.rotationThrust * Math.PI) / 180) * sim.shipResponse(ship);
    const flipSeconds = hasReverse
      ? REVERSE_BRAKE_SECONDS
      : Math.max(Math.PI / SPIN_LIMIT + 0.5, 2.5 * Math.sqrt(Math.PI / spinAccel));
    const lead = accel * flipSeconds;
    return -lead + Math.sqrt(lead * lead + 2 * accel * distance);
  }

  /** Direction to fly: straight at the target, or past the first thing in the way. */
  protected routeAround(sim: Sim, target: Mover, exclude: object | null): { x: number; y: number } {
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

/** Flies a ship through the mining loop: shoot rocks, gather ore, haul it to the dock, and go back. */
export class DronePilot extends ShipPilot {
  /** What the drone is doing, in words for the display. */
  task = "starting";
  /** What it will buy with its earnings, in order. */
  wishlist: PartId[] = DRONE_BUY_ORDER;
  private hauling = false;
  private rock: Rock | null = null;
  private ore: Ore | null = null;
  private retarget = 0;
  private targetAge = 0;
  private ignored = new WeakSet<object>();

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

    // Empty means delivered or wrecked. Either way, this load is over.
    if (ship.ore === 0) this.hauling = false;
    if (ship.ore >= sim.tuning.droneCargo) this.hauling = true;
    const canAffordRepair =
      ship.ore > 0 || sim.accountOf(ship).credits >= sim.tuning.repairCost;
    if (ship.hull < LOW_HULL && canAffordRepair) this.hauling = true;

    // Repairs come before shopping, so it never spends its repair money on parts.
    if (ship.ore === 0 && sim.canRepair(ship)) {
      this.task = "repairing";
      this.hold(sim, sim.dockPoint(), sim.dockPoint(true));
      return;
    }
    if (ship.ore === 0 && sim.isDocked(ship)) this.shop(sim);

    if (this.hauling) this.haul(sim);
    else this.mine(sim);
  }

  /** Buys the next thing on its list if it has the money. Once that's done, a new drone. */
  private shop(sim: Sim): void {
    const { ship } = this;
    // It doesn't spend its owner's money without being asked.
    if (ship.owner) return;
    const allowed = this.wishlist.slice(0, sim.tuning.droneParts);
    const next = allowed.find((part) => !ship.parts.has(part));
    if (next) sim.buyPart(ship, next);
    else sim.buyDrone(ship);
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
    this.brake(sim, -ship.vx, -ship.vy, NEAR_TOLERANCE, null);
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
    // With nothing else left, what it gave up on is worth another try.
    if (!this.rock && sim.rocks.length > 0) this.ignored = new WeakSet();
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
      this.brake(sim, -vx, -vy, SETTLE_SPEED, aim);
    } else {
      // Coasting past is fine. The gun leads the rock.
      this.steer(sim, 0, 0, SETTLE_SPEED, aim);
    }

    const spread = Math.atan2(rock.radius * 0.7, distance);
    const aimed = Math.abs(wrapAngle(aim - ship.angle)) < spread;
    const inRange = distance < tuning.shotSpeed * tuning.shotLife * 0.9;
    ship.controls.fire = aimed && inRange && (!this.burning || this.correctingDirectly);
  }
}

interface ClickOrder {
  poi: Poi;
  /** The spot in the POI's own axes, so it turns with the POI. */
  x: number;
  y: number;
  /** Only turning to face the spot, without flying anywhere. */
  turnOnly: boolean;
  /** Where the nose ends up, or null to leave it where the stop left it. */
  face: number | null;
  stage: "flying" | "stopping" | "facing";
  closest: number;
  stuck: number;
}

/**
 * Flies to a clicked spot: rotate, thrust, coast, rotate to stop, thrust. Or turns to
 * face one. It leaves the gun alone, and only flies while it has an order, so the
 * player can always take over.
 */
export class ClickPilot extends ShipPilot {
  private order: ClickOrder | null = null;

  get active(): boolean {
    return this.order !== null;
  }

  /** What the order is doing, in words for the display. */
  get task(): string {
    return this.order?.stage ?? "";
  }

  /** Where a flight leads right now, or null without one. */
  target(): { x: number; y: number; px: number; py: number } | null {
    if (!this.order || this.order.turnOnly) return null;
    return this.spot(this.order.poi, this.order.x, this.order.y);
  }

  /** The spot the ship is turning to face, or null without one. */
  aim(): { x: number; y: number; px: number; py: number } | null {
    if (!this.order?.turnOnly) return null;
    return this.spot(this.order.poi, this.order.x, this.order.y);
  }

  private spot(poi: Poi, x: number, y: number): { x: number; y: number; px: number; py: number } {
    const at = (cx: number, cy: number, rotation: number) => ({
      x: cx + x * Math.cos(rotation) - y * Math.sin(rotation),
      y: cy + x * Math.sin(rotation) + y * Math.cos(rotation),
    });
    const now = at(poi.x, poi.y, poi.rotation);
    const before = at(poi.px, poi.py, poi.prevRotation);
    return { x: now.x, y: now.y, px: before.x, py: before.y };
  }

  /** A world position in a POI's own axes, so it turns with the POI. */
  private toPoiAxes(poi: Poi, x: number, y: number): { x: number; y: number } {
    const dx = x - poi.x;
    const dy = y - poi.y;
    const cos = Math.cos(poi.rotation);
    const sin = Math.sin(poi.rotation);
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  }

  moveTo(sim: Sim, x: number, y: number): void {
    const { ship } = this;
    const poi = sim.nearestPoi(x, y);
    this.order = {
      poi,
      ...this.toPoiAxes(poi, x, y),
      turnOnly: false,
      face: sim.tuning.clickFaceTravel ? Math.atan2(y - ship.y, x - ship.x) : null,
      stage: "flying",
      closest: Infinity,
      stuck: 0,
    };
  }

  /** Starts turning to face a spot, in place of any other order. */
  faceSpot(sim: Sim, x: number, y: number): void {
    const poi = sim.nearestPoi(x, y);
    this.order = {
      poi,
      ...this.toPoiAxes(poi, x, y),
      turnOnly: true,
      face: null,
      stage: "facing",
      closest: Infinity,
      stuck: 0,
    };
  }

  cancel(): void {
    this.order = null;
    this.burning = false;
    this.thrusting = false;
    this.clearControls();
    this.ship.controls.stabilize = true;
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
    if (!ship.parts.has(order.turnOnly ? "clickTurn" : "clickMove")) {
      this.cancel();
      return;
    }
    this.clearControls();
    this.correctingDirectly = false;
    // Everything near the POI turns with it, so the nose's goal does too.
    if (order.face !== null) order.face += order.poi.turn;

    const target = this.spot(order.poi, order.x, order.y);
    const distance = Math.hypot(target.x - ship.x, target.y - ship.y);
    const { vx, vy } = this.relativeVelocity(target);
    const speed = Math.hypot(vx, vy);

    if (distance < order.closest - CLICK_PROGRESS) {
      order.closest = distance;
      order.stuck = 0;
    }
    order.stuck += TICK;
    if (order.stuck > CLICK_STUCK_SECONDS) {
      this.cancel();
      return;
    }

    if (order.stage === "flying") {
      if (distance < ARRIVE_DISTANCE && speed < ARRIVE_SPEED) order.stage = "stopping";
      else this.flyTo(sim, target, 0, 0, null);
    }
    if (order.stage === "stopping") {
      if (speed < STOPPED_SPEED) order.stage = "facing";
      else this.brake(sim, -vx, -vy, STOPPED_SPEED, null);
    }
    if (order.stage === "facing") {
      const face = order.turnOnly
        ? Math.atan2(target.y - ship.y, target.x - ship.x)
        : order.face;
      if (face === null) {
        this.cancel();
        return;
      }
      const off = Math.abs(wrapAngle(face - ship.angle));
      if (off < FACING_ANGLE && Math.abs(ship.spin) < FACING_SPIN) this.cancel();
      else this.turnTo(sim, face);
    }
  }

  protected override speedLimitHere(sim: Sim): number {
    return sim.tuning.clickSpeed;
  }

  /** Straight at the spot, whatever is in the way, unless it has the route planner. */
  protected override routeAround(
    sim: Sim,
    target: { x: number; y: number; px: number; py: number },
    exclude: object | null,
  ): { x: number; y: number } {
    const { ship } = this;
    if (ship.parts.has("clickRoute")) return super.routeAround(sim, target, exclude);
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    const distance = Math.hypot(dx, dy) || 1;
    return { x: dx / distance, y: dy / distance };
  }

  /** Gets ready for the braking burn: nose against the motion, or along it with a reverse thruster. */
  protected override coastNose(vx: number, vy: number): number | null {
    const { ship } = this;
    if (Math.hypot(vx, vy) < COAST_TURN_SPEED) return null;
    const braking = Math.atan2(-vy, -vx);
    if (!ship.parts.has("reverse")) return braking;
    const reversing = braking + Math.PI;
    const shorter =
      Math.abs(wrapAngle(reversing - ship.angle)) < Math.abs(wrapAngle(braking - ship.angle));
    return shorter ? reversing : braking;
  }
}
