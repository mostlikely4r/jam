import { DRONE_BUY_ORDER, type PartId } from "./parts";
import {
  type Body,
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
/** How close to a deposit it aims for. Trading starts as soon as it's in reach. */
const DEPOSIT_ARRIVAL = 60;
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
    const { field, tuning } = sim;
    if (ship.model === "floater") return tuning.clickSpeed;
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
  /**
   * What it spends on: a test drone buys its list and then more drones, traffic and the
   * player's drones buy the upgrades they can use and keep a buffer, or nothing at all.
   */
  buys: "drones" | "upgrades" | "nothing" = "drones";
  /** Whether it runs for the station when it sees a pirate. */
  flees = false;
  private fleeing = false;
  private sinceSighting = 0;
  private hauling = false;
  /** Whether this load goes to a deposit to save the trip. */
  private dropsThisLoad = false;
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
    ship.aim = null;

    this.watchForPirates(sim);
    if (this.fleeing) {
      this.flee(sim);
      return;
    }

    // Empty means delivered or wrecked. Either way, this load is over.
    if (ship.ore === 0) {
      this.hauling = false;
      this.dropsThisLoad = false;
    }
    if (ship.ore >= sim.deliveryLoad(ship) && !this.hauling) {
      this.hauling = true;
      this.dropsThisLoad = sim.deposits.length > 0 && sim.roll() < sim.tuning.depositDropChance;
    }
    const canAffordRepair = ship.ore > 0 || sim.canPayRepair(ship);
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

  private watchForPirates(sim: Sim): void {
    if (!this.flees || !sim.tuning.trafficFlees) {
      this.fleeing = false;
      return;
    }
    this.sinceSighting += TICK;
    const sighted = sim.fighters.some(
      ({ ship }) => ship.faction === "pirate" && this.inView(sim, ship),
    );
    if (sighted) {
      this.fleeing = true;
      this.sinceSighting = 0;
    }
  }

  /** Runs for the dock, whether or not the pirate is still in view, and waits there until it's clear. */
  private flee(sim: Sim): void {
    // A load banked on the way can't be lost.
    if (this.dropLoad(sim)) return;
    const dock = sim.dockPoint();
    const before = sim.dockPoint(true);
    if (!sim.isDocked(this.ship)) {
      this.task = "fleeing";
      this.flyTo(sim, { x: dock.x, y: dock.y, px: before.x, py: before.y }, DOCK_ARRIVAL_SLACK, 0, null);
      return;
    }
    this.task = "sheltering";
    this.hold(sim, dock, before);
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
    const next = allowed.find((part) => !ship.parts.has(part));
    if (next) sim.buyPart(ship, next);
    else sim.buyDrone(ship);
  }

  /** Takes its ore to a deposit nearer than the dock, if there is one. Returns whether it's doing that. */
  private dropLoad(sim: Sim): boolean {
    const { ship } = this;
    if (ship.ore === 0) return false;
    const deposit = sim.depositFor(ship);
    if (!deposit) return false;
    this.task = "to deposit";
    if (sim.depositAt(ship) === deposit) sim.sellToDeposit(ship, deposit);
    else this.flyTo(sim, deposit, DEPOSIT_ARRIVAL, 0, null);
    return true;
  }

  private haul(sim: Sim): void {
    const { ship } = this;
    if ((this.dropsThisLoad || ship.hull < LOW_HULL) && this.dropLoad(sim)) return;
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
      this.task = this.attack(sim, this.rock);
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

}

interface ClickOrder {
  /**
   * The destination. The sim moves and carries it like any loose body, so a spot at rest
   * stays put against whatever carries things there, and a drawn velocity drifts it on.
   */
  spot: Body;
  /** The spot was given a velocity of its own. */
  drifts: boolean;
  /** Flies to the destination. Without it the order only stops or turns, where the ship is. */
  move: boolean;
  /** The facing held whenever no burn needs the nose, or null to leave the nose be. */
  face: number | null;
  stage: "flying" | "stopping" | "facing";
  closest: number;
  stuck: number;
}

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

  /** Has an order and is flying it, not waiting out the player's hands on the keys. */
  get flying(): boolean {
    return this.order !== null && this.handsOff <= 0;
  }

  /** What the order is doing, in words for the display. */
  get task(): string {
    if (!this.order) return "";
    return this.handsOff > 0 ? "waiting for the keys" : this.order.stage;
  }

  /** Where a flight leads right now, or null without one. */
  target(): Mover | null {
    if (!this.order?.move) return null;
    return this.order.spot;
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
  moveTo(_sim: Sim, x: number, y: number, vx = 0, vy = 0, absolute = false): void {
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
    };
    this.handsOff = 0;
  }

  /**
   * Corrects the destination's drift by a small velocity, without starting over. Says the
   * same thing whatever the ship is doing, since it's measured against the destination.
   */
  nudge(vx: number, vy: number): boolean {
    const { order } = this;
    if (!order?.move) return false;
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
    const needs = order.move || order.stage === "stopping" ? "clickMove" : "clickTurn";
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
    const target = order.spot;
    const distance = Math.hypot(target.x - ship.x, target.y - ship.y);
    const { vx, vy } = this.relativeVelocity(target);
    const speed = Math.hypot(vx, vy);

    if (order.move) {
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
      if (distance < ARRIVE_DISTANCE && speed < ARRIVE_SPEED) order.stage = "stopping";
      else this.flyTo(sim, target, 0, 0, null);
    }
    if (order.stage === "stopping") {
      if (speed < STOPPED_SPEED) order.stage = "facing";
      // The retro switch stops dead against the POI, not against a drifting spot.
      else if (order.drifts) this.steer(sim, -vx, -vy, STOPPED_SPEED, order.face);
      else this.brake(sim, -vx, -vy, STOPPED_SPEED, order.face);
    }
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
    if (ship.faction === "defender" && distress && distress.ship !== ship) {
      this.task = "responding";
      this.flyTo(sim, distress.ship, FIGHT_DISTANCE, PATROL_PASS_SPEED, null);
      return;
    }
    if (this.goHome(sim)) return;
    if (this.gather(sim)) return;
    if (ship.faction === "pirate" && this.mine(sim)) return;
    if (ship.ore > 0) {
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
    if (!this.isPirate || !sim.tuning.pirateRetreats || ship.hull >= LOW_HULL) return false;
    return ship.ore > 0 || sim.canPayRepair(ship);
  }

  /** Whether a pirate should stay clear of a spot: it only goes under the guns on a chase. */
  private keepsClear(sim: Sim, x: number, y: number): boolean {
    return this.isPirate && sim.inGuardRange(x, y);
  }

  /** Goes home to sell a full load or repair a low hull. Returns whether it's doing that. */
  private goHome(sim: Sim): boolean {
    const { ship } = this;
    const canPay = ship.ore > 0 || sim.canPayRepair(ship);
    if (ship.ore >= sim.deliveryLoad(ship) || (ship.hull < LOW_HULL && canPay)) {
      this.headingHome = true;
    }
    const busy = ship.ore > 0 || sim.canRepair(ship);
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
    return this.ship.faction !== other.faction && (this.ship.faction === "pirate" || other.faction === "pirate");
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

  /** Flies from one random spot in the field to the next. */
  private fly(sim: Sim): void {
    const { ship } = this;
    const { field, tuning } = sim;
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
        const distance = tuning.fieldRadius * Math.sqrt(sim.roll());
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
