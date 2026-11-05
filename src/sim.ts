import { PARTS, partFits, type PartId, type ShipModel } from "./parts";
import { ClickPilot, DronePilot, FighterPilot } from "./pilot";
import { DEFAULTS, type ThrusterId, type Tuning } from "./tuning";

export const TICK = 1 / 120;
export const SHIP_RADIUS = 12;
export const MAX_HULL = 100;
const ORE_RADIUS = 5;
const PICKUP_MARGIN = 10;
const TIER_RADIUS = [18, 34, 60];
const ORE_KINDS = 3;
export const STATION_HALF = 150;
/** How far outside the field a pirate starts, on the far side from the station. */
const PIRATE_START_DISTANCE = 2000;
/** How long a hit ship keeps calling for help. */
const DISTRESS_SECONDS = 10;
/** Size of the pirates' round docking zone. */
export const PIRATE_BASE_RADIUS = 200;
/** How fast a wreck's cargo drifts away. */
const WRECK_ORE_SPEED = 15;
/** The dock box sits directly beside the solid box. */
export const DOCK_OFFSET = STATION_HALF * 2;
/** Far enough from the station's center to clear both boxes at any rotation. */
export const STATION_REACH = 450;
/** The station and dock together, along the station's own x axis. */
const STATION_SHAPE_CENTER = DOCK_OFFSET / 2;
const STATION_SHAPE_HALF = STATION_HALF + DOCK_OFFSET / 2;
const STILL = { vx: 0, vy: 0 };
const UNLOAD_SECONDS = 0.1;
/** How far outside the field a drifting-in rock starts, and how fast it comes. */
const INFLOW_START_DISTANCE = 1500;
const INFLOW_SPEED = 25;
/** A rock doesn't start closer to the player than this, so none appears on screen. */
const INFLOW_CLEAR_OF_PLAYER = 2000;
const INFLOW_TIER = 2;
/** Parts that add thrusters. Every ship has the main engine, rotation, and a gun. */
const THRUSTER_PARTS: Partial<Record<ThrusterId, PartId>> = {
  thrusterReverse: "reverse",
  thrusterStrafeLeft: "strafe",
  thrusterStrafeRight: "strafe",
};

export interface Controls {
  /** -1 (reverse) to 1 (forward). */
  thrust: number;
  /** -1 (left) to 1 (right), without turning. */
  strafe: number;
  /** -1 (left) to 1 (right). */
  turn: number;
  fire: boolean;
  /** Used by drones. The player's retro is the switch in the tuning panel. */
  retro: boolean;
  /** Whether a spin stabilizer, if fitted, may act when not turning. */
  stabilize: boolean;
}

interface Body {
  x: number;
  y: number;
  /** Velocity relative to the nearest POI, which also carries the body along. */
  vx: number;
  vy: number;
  /** Position at the previous tick, for render interpolation. */
  px: number;
  py: number;
}

export type Faction = "pirate" | "defender";

export interface Ship extends Body {
  model: ShipModel;
  /** Pirates and defenders. Everyone else is null. */
  faction: Faction | null;
  /** Where the last shot to hit this ship came from, until something reads it. */
  shotFrom: { x: number; y: number } | null;
  controls: Controls;
  parts: Set<PartId>;
  /** The ship whose account this one shares, or null if it keeps its own. */
  owner: Ship | null;
  /** Goes below zero when a wreck is rebuilt on credit. Earnings pay it back. */
  credits: number;
  /** All credits this ship has earned, whichever account they went to. */
  earned: number;
  /** All credits spent on repairs and rebuilds. */
  upkeep: number;
  repairTimer: number;
  trips: number;
  wrecks: number;
  damageTaken: number;
  /** The POI this ship currently moves relative to. */
  frame: Poi;
  ore: number;
  unloadTimer: number;
  angle: number;
  prevAngle: number;
  spin: number;
  hull: number;
  cooldown: number;
  /** Thrusters that fired on the last tick. */
  firing: Set<ThrusterId>;
}

export interface Rock extends Body {
  /** Still on its way in from outside the field. */
  arriving: boolean;
  tier: number;
  radius: number;
  hp: number;
  angle: number;
  prevAngle: number;
  spin: number;
  /** Radius multipliers around the outline. */
  shape: number[];
}

/** A point of interest: it orbits on a fixed path, spins, and carries nearby objects. */
export interface Poi {
  name: "field" | "station" | "pirate base";
  parent: Poi | null;
  x: number;
  y: number;
  px: number;
  py: number;
  orbitAngle: number;
  orbitRadius: number;
  rotation: number;
  prevRotation: number;
  /** Size used when working out which POI is nearest. */
  reach: number;
  /** Rotation made on the current tick. */
  turn: number;
}

export interface PoiReading {
  /** Direction from the ship to the marker's target. */
  dx: number;
  dy: number;
  /** How far until the POI comes into view. Zero when it's in view. */
  distance: number;
  /** Positive when the distance is shrinking. */
  closing: number;
}

export interface Shot extends Body {
  life: number;
  /** Fired by gun 2, so it may be a precision hit. */
  precise: boolean;
  /** Who fired it. Its own shots can't hit it. */
  from: Ship;
}

export interface Ore extends Body {
  kind: number;
}

export type SimEvent =
  | { type: "shot"; x: number; y: number }
  | { type: "hit"; x: number; y: number }
  | { type: "break"; x: number; y: number; radius: number }
  | { type: "pickup"; x: number; y: number; kind: number }
  | { type: "sale"; x: number; y: number }
  | { type: "impact"; x: number; y: number; damage: number; player: boolean }
  | { type: "wreck"; x: number; y: number; player: boolean };

export interface Stats {
  bestOre: number;
  topSpeed: number;
}

/** Small seeded generator, so a given seed always builds the same field. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Earliest fraction of the segment (0..1) that enters a circle centered on the
 * origin, or null. Sweeping keeps fast objects from passing through rocks.
 */
export function sweepCircle(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  radius: number,
): number | null {
  const c = ax * ax + ay * ay - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = ax * dx + ay * dy;
  if (b >= 0) return null;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t <= 1 ? t : null;
}

/**
 * Where a moving point first enters a box centered on the origin, and the face
 * it entered through, or null. A point already inside exits by the nearest face.
 */
export function sweepBox(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  halfWidth: number,
  halfHeight: number,
): { t: number; nx: number; ny: number } | null {
  if (Math.abs(ax) < halfWidth && Math.abs(ay) < halfHeight) {
    return halfWidth - Math.abs(ax) < halfHeight - Math.abs(ay)
      ? { t: 0, nx: Math.sign(ax) || 1, ny: 0 }
      : { t: 0, nx: 0, ny: Math.sign(ay) || 1 };
  }

  let enter = 0;
  let exit = 1;
  let nx = 0;
  let ny = 0;

  if (dx === 0) {
    if (Math.abs(ax) >= halfWidth) return null;
  } else {
    const near = ((dx > 0 ? -halfWidth : halfWidth) - ax) / dx;
    const far = ((dx > 0 ? halfWidth : -halfWidth) - ax) / dx;
    if (near >= enter) {
      enter = near;
      nx = -Math.sign(dx);
    }
    exit = Math.min(exit, far);
  }

  if (dy === 0) {
    if (Math.abs(ay) >= halfHeight) return null;
  } else {
    const near = ((dy > 0 ? -halfHeight : halfHeight) - ay) / dy;
    const far = ((dy > 0 ? halfHeight : -halfHeight) - ay) / dy;
    if (near >= enter) {
      enter = near;
      nx = 0;
      ny = -Math.sign(dy);
    }
    exit = Math.min(exit, far);
  }

  if (enter > exit || (nx === 0 && ny === 0)) return null;
  return { t: enter, nx, ny };
}

export class Sim {
  tuning: Tuning;
  controls: Controls = {
    thrust: 0,
    strafe: 0,
    turn: 0,
    fire: false,
    retro: false,
    stabilize: true,
  };
  ship!: Ship;
  /** Drones the player bought, plus any self-funded test drones. */
  drones: DronePilot[] = [];
  /** Other people's ships, going about their own business. The player has no readout of them. */
  traffic: DronePilot[] = [];
  fighters: FighterPilot[] = [];
  /** Where pirates dock. Only exists in a game with pirates. */
  pirateBase: Poi | null = null;
  /** The station's own money. Defenders earn it, and it pays for defenders. */
  stationAccount = { credits: 0 };
  /** Ore the station has bought and is holding. */
  stationOre = 0;
  /** The pirate base's ore. It pays for pirates' repairs, rebuilds and new ships. */
  pirateOre = 0;
  /** Traffic gone for good, waiting for the station to replace it. */
  lostTraffic: ShipModel[] = [];
  /** The ship most recently hit by a shot, if that was recent. */
  distress: { ship: Ship; age: number } | null = null;
  /** Flies the player's ship to a clicked spot, if it has the part. */
  clickPilot!: ClickPilot;
  rocks: Rock[] = [];
  shots: Shot[] = [];
  ores: Ore[] = [];
  field!: Poi;
  station!: Poi;
  events: SimEvent[] = [];
  stats: Stats = { bestOre: 0, topSpeed: 0 };
  private random: () => number = Math.random;
  /** Counts down to the next rock drifting in, in units of the average wait. */
  private inflowTimer = 1;

  constructor(seed = 1, tuning: Tuning = { ...DEFAULTS }) {
    this.tuning = tuning;
    this.reset(seed);
  }

  reset(seed: number): void {
    this.random = makeRandom(seed);
    this.rocks = [];
    this.shots = [];
    this.ores = [];
    this.events = [];
    this.stats = { bestOre: this.stats.bestOre, topSpeed: 0 };
    this.inflowTimer = 1;
    this.placePois();
    this.resetPlayerControls();
    const model = this.tuning.floaterStart ? "floater" : "racer";
    this.ship = this.makeShip(this.startX(), this.field.y, this.controls, model);
    if (model === "floater") {
      this.ship.parts.add("gun2");
      this.ship.parts.add("clickMove");
    }
    this.clickPilot = new ClickPilot(this.ship);
    this.drones = [];
    this.distress = null;
    this.stationAccount = { credits: this.tuning.stationStartCredits };
    this.stationOre = this.tuning.stationStartOre;
    this.pirateOre = this.tuning.pirateStartOre;
    this.lostTraffic = [];
    this.fighters = [];
    for (let i = 0; i < this.tuning.pirates; i++) {
      const start = this.homeOf(null, "pirate");
      this.addFighter(start.x, start.y, "pirate");
    }
    for (let i = 0; i < this.tuning.defenders; i++) {
      const dock = this.dockPoint();
      this.addFighter(dock.x, dock.y, "defender");
    }
    this.traffic = [];
    const models: ShipModel[] = [
      ...Array<ShipModel>(this.tuning.trafficRacers).fill("racer"),
      ...Array<ShipModel>(this.tuning.trafficFloaters).fill("floater"),
    ];
    const count = this.tuning.testDrones + models.length;
    for (let i = 0; i < count; i++) {
      const y = this.field.y + (i + 1) * 70 * (i % 2 === 0 ? 1 : -1);
      if (i < this.tuning.testDrones) this.addDrone(this.startX(), y);
      else this.addTraffic(this.startX(), y, models[i - this.tuning.testDrones]);
    }
    const clear = 260;
    for (let i = 0; i < this.tuning.rockCount; i++) {
      const dist = this.tuning.fieldRadius * Math.sqrt(this.random());
      const dir = this.random() * Math.PI * 2;
      const x = this.field.x + Math.cos(dir) * dist;
      const y = this.field.y + Math.sin(dir) * dist;
      if (Math.hypot(x - this.ship.x, y - this.ship.y) < clear) continue;
      const roll = this.random();
      const tier = roll < 0.3 ? 2 : roll < 0.7 ? 1 : 0;
      const drift = this.tuning.rockDrift * this.random();
      const driftDir = this.random() * Math.PI * 2;
      this.rocks.push(
        this.makeRock(tier, x, y, Math.cos(driftDir) * drift, Math.sin(driftDir) * drift),
      );
    }
  }

  private placePois(): void {
    const { tuning } = this;
    this.field = this.makePoi("field", null, tuning.fieldOrbitRadius, 0, tuning.fieldRadius);
    // Starts behind the ship's starting point, on the far side from the rocks.
    this.station = this.makePoi(
      "station",
      this.field,
      tuning.fieldRadius + tuning.stationDistance,
      Math.PI,
      STATION_REACH,
    );
    // Orbits at the same pace as the station, so it stays on the far side of the field.
    this.pirateBase =
      tuning.pirates > 0
        ? this.makePoi(
            "pirate base",
            this.field,
            tuning.fieldRadius + PIRATE_START_DISTANCE,
            0,
            PIRATE_BASE_RADIUS,
          )
        : null;
  }

  private makePoi(
    name: Poi["name"],
    parent: Poi | null,
    orbitRadius: number,
    orbitAngle: number,
    reach: number,
  ): Poi {
    const x = (parent?.x ?? 0) + Math.cos(orbitAngle) * orbitRadius;
    const y = (parent?.y ?? 0) + Math.sin(orbitAngle) * orbitRadius;
    return {
      name,
      parent,
      x,
      y,
      px: x,
      py: y,
      orbitAngle,
      orbitRadius,
      rotation: 0,
      prevRotation: 0,
      reach,
      turn: 0,
    };
  }

  private makePilot(x: number, y: number, model: ShipModel = "racer"): DronePilot {
    const controls = { thrust: 0, strafe: 0, turn: 0, fire: false, retro: false, stabilize: false };
    return new DronePilot(this.makeShip(x, y, controls, model));
  }

  private addDrone(x: number, y: number): DronePilot {
    const drone = this.makePilot(x, y);
    this.drones.push(drone);
    return drone;
  }

  /** Traffic flies as it starts out, and doesn't buy anything or grow in number. */
  private addTraffic(x: number, y: number, model: ShipModel): void {
    const pilot = this.makePilot(x, y, model);
    pilot.shops = false;
    pilot.flees = true;
    if (model === "floater") pilot.ship.parts.add("gun2");
    this.traffic.push(pilot);
  }

  /** Six thrusters and the first gun. */
  private addFighter(x: number, y: number, faction: Faction): void {
    const ship = this.makeShip(
      x,
      y,
      { thrust: 0, strafe: 0, turn: 0, fire: false, retro: false, stabilize: false },
    );
    ship.faction = faction;
    ship.parts.add("reverse");
    ship.parts.add("strafe");
    this.fighters.push(new FighterPilot(ship));
  }

  /** Where a ship docks: its faction's own place, now or as of the previous tick. */
  homeOf(ship: Ship | null, faction = ship?.faction, previous = false): { x: number; y: number } {
    const base = this.pirateBase;
    if (faction === "pirate" && base) {
      return previous ? { x: base.px, y: base.py } : { x: base.x, y: base.y };
    }
    return this.dockPoint(previous);
  }

  /** Whether a ship is where it can sell and repair. */
  isHome(ship: Ship): boolean {
    const base = this.pirateBase;
    if (ship.faction === "pirate" && base) {
      return Math.hypot(ship.x - base.x, ship.y - base.y) < PIRATE_BASE_RADIUS;
    }
    return this.isDocked(ship);
  }

  /** Everything that flies itself. */
  private get pilots(): (DronePilot | FighterPilot)[] {
    return [...this.drones, ...this.traffic, ...this.fighters];
  }

  /** Every ship in the world, the player's included. */
  get ships(): Ship[] {
    return [this.ship, ...this.pilots.map((pilot) => pilot.ship)];
  }

  /** Whether no rock stands between two points. */
  clearSight(fromX: number, fromY: number, toX: number, toY: number): boolean {
    if (!this.tuning.sightLines) return true;
    const dx = toX - fromX;
    const dy = toY - fromY;
    return this.rocks.every(
      (rock) => sweepCircle(fromX - rock.x, fromY - rock.y, dx, dy, rock.radius) === null,
    );
  }

  /** Whether the player has a line of sight to a ship, by the same rules ships use on each other. */
  playerSees(other: Ship): boolean {
    const { ship } = this;
    if (Math.hypot(other.x - ship.x, other.y - ship.y) > this.tuning.visionRange) return false;
    return this.clearSight(ship.x, ship.y, other.x, other.y);
  }

  /** A number from 0 to 1, from the same seeded generator as the rest of the world. */
  roll(): number {
    return this.random();
  }

  /** Keeps the same object, since the ship and the input code both hold it. */
  private resetPlayerControls(): void {
    Object.assign(this.controls, {
      thrust: 0,
      strafe: 0,
      turn: 0,
      fire: false,
      retro: false,
      stabilize: true,
    });
  }

  /** Sends the player's ship to a world position, if it has the part. Returns whether it did. */
  orderMove(x: number, y: number): boolean {
    if (!this.ship.parts.has("clickMove")) return false;
    this.clickPilot.moveTo(this, x, y);
    return true;
  }

  /** Cancels any click order, leaving the ship coasting. With the part, it also turns to face the spot. */
  orderTurn(x: number, y: number): boolean {
    this.clickPilot.cancel();
    if (!this.ship.parts.has("clickTurn")) return false;
    this.clickPilot.faceSpot(this, x, y);
    return true;
  }

  private startX(): number {
    return this.field.x - this.tuning.fieldRadius - 200;
  }

  private makeShip(x: number, y: number, controls: Controls, model: ShipModel = "racer"): Ship {
    return {
      model,
      faction: null,
      shotFrom: null,
      x,
      y,
      px: x,
      py: y,
      vx: 0,
      vy: 0,
      controls,
      parts: new Set(),
      owner: null,
      credits: 0,
      earned: 0,
      upkeep: 0,
      repairTimer: 0,
      trips: 0,
      wrecks: 0,
      damageTaken: 0,
      frame: this.field,
      ore: 0,
      unloadTimer: 0,
      angle: 0,
      prevAngle: 0,
      spin: 0,
      hull: MAX_HULL,
      cooldown: 0,
      firing: new Set(),
    };
  }

  /** The player restarts by the field. A drone restarts in the dock, where it would be rebuilt. */
  private respawn(ship: Ship): void {
    if (ship === this.ship) this.clickPilot.cancel();
    const home = this.homeOf(ship);
    ship.x = home.x;
    ship.y = home.y;
    ship.px = ship.x;
    ship.py = ship.y;
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = 0;
    ship.prevAngle = 0;
    ship.spin = 0;
    ship.hull = MAX_HULL;
    ship.cooldown = 0;
    ship.ore = 0;
    ship.unloadTimer = 0;
    ship.firing.clear();
  }

  /** Every part adds weight, which divides all of the ship's thrust. */
  shipWeight(ship: Ship): number {
    let weight = this.tuning.weight;
    for (const part of PARTS) {
      if (ship.parts.has(part.id)) weight += part.weight * this.tuning.partWeightScale;
    }
    return weight;
  }

  /** Acceleration per unit of thrust: the ship's engine power divided by its weight. */
  shipResponse(ship: Ship): number {
    const engine = ship.model === "floater" ? this.tuning.floaterEngine : 1;
    return engine / this.shipWeight(ship);
  }

  partPrice(id: PartId): number {
    const part = PARTS.find((candidate) => candidate.id === id)!;
    return Math.round(part.price * this.tuning.partPriceScale);
  }

  /** Parts are only sold in the dock. Returns whether the sale went through. */
  buyPart(ship: Ship, id: PartId): boolean {
    const price = this.partPrice(id);
    const part = PARTS.find((candidate) => candidate.id === id)!;
    if (!partFits(part, ship.model)) return false;
    if (!this.isDocked(ship) || ship.parts.has(id) || ship.credits < price) return false;
    if (!this.hasOreFor(price)) return false;
    this.chargeForService(ship, price);
    ship.parts.add(id);
    if (id === "retro" && ship === this.ship) this.tuning.retro = true;
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    return true;
  }

  /** Sells a part back at full price, so a ship can go back to being light. */
  sellPart(ship: Ship, id: PartId): boolean {
    if (!this.isDocked(ship) || !ship.parts.has(id)) return false;
    this.chargeForService(ship, -this.partPrice(id));
    ship.parts.delete(id);
    if ((id === "clickMove" || id === "clickTurn") && ship === this.ship) this.clickPilot.cancel();
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    return true;
  }

  /** Any ship in the dock can pay for a new drone, which starts there and earns for itself. */
  buyDrone(buyer: Ship): DronePilot | null {
    const { tuning } = this;
    if (!this.isDocked(buyer) || buyer.credits < tuning.dronePrice) return null;
    if (this.drones.length >= tuning.droneLimit || !this.hasOreFor(tuning.dronePrice)) return null;
    this.chargeForService(buyer, tuning.dronePrice);
    const dock = this.dockPoint();
    this.events.push({ type: "sale", x: dock.x, y: dock.y });
    const drone = this.addDrone(dock.x, dock.y);
    // The player's drones work for the player. Others' drones work for themselves.
    if (buyer === this.ship) drone.ship.owner = buyer;
    return drone;
  }

  /** The ore in the station's pile that a service worth this many credits uses up. */
  oreFor(credits: number): number {
    const { serviceCreditsPerOre } = this.tuning;
    return serviceCreditsPerOre > 0 ? credits / serviceCreditsPerOre : 0;
  }

  hasOreFor(credits: number): boolean {
    return this.stationOre >= this.oreFor(credits);
  }

  /** The buyer pays the station, and the service comes out of its pile, which stops at empty. */
  private chargeForService(buyer: { credits: number }, credits: number): void {
    buyer.credits -= credits;
    this.stationAccount.credits += credits;
    this.stationOre = Math.max(0, this.stationOre - this.oreFor(credits));
  }

  /** Whose credits this ship earns and spends: its owner's, the station's, or its own. */
  accountOf(ship: Ship): { credits: number } {
    if (ship.faction === "defender") return this.stationAccount;
    return ship.owner ?? ship;
  }

  /** Center of the dock, now or as of the previous tick. */
  dockPoint(previous = false): { x: number; y: number } {
    const { station } = this;
    const rotation = previous ? station.prevRotation : station.rotation;
    return {
      x: (previous ? station.px : station.x) + Math.cos(rotation) * DOCK_OFFSET,
      y: (previous ? station.py : station.y) + Math.sin(rotation) * DOCK_OFFSET,
    };
  }

  makeRock(tier: number, x: number, y: number, vx: number, vy: number): Rock {
    const points = 8 + Math.floor(this.random() * 4);
    const shape: number[] = [];
    for (let i = 0; i < points; i++) shape.push(0.84 + this.random() * 0.26);
    const radius = TIER_RADIUS[tier];
    const angle = this.random() * Math.PI * 2;
    return {
      x,
      y,
      px: x,
      py: y,
      vx,
      vy,
      arriving: false,
      tier,
      radius,
      hp: Math.ceil((this.tuning.rockToughness * radius) / 60),
      angle,
      prevAngle: angle,
      spin: (this.random() - 0.5) * (60 / radius),
      shape,
    };
  }

  /** Advance one fixed tick. Display rate and time speedup never change its size. */
  step(): void {
    const dt = TICK;
    if (this.distress) {
      this.distress.age += dt;
      if (this.distress.age > DISTRESS_SECONDS) this.distress = null;
    }
    this.clickPilot.update(this);
    const pilots = this.pilots;
    for (const pilot of pilots) pilot.update(this);
    this.movePois(dt);
    this.carryBodies();
    this.driftInRocks(dt);
    this.moveRocks(dt);
    this.pullOre(this.ship, dt);
    for (const pilot of pilots) this.pullOre(pilot.ship, dt);
    this.moveOres(dt);
    this.moveShip(this.ship, dt);
    for (const pilot of pilots) this.moveShip(pilot.ship, dt);
    this.moveShots(dt);
    this.fireShots(this.ship);
    this.collectOre(this.ship);
    this.unloadOre(this.ship, dt);
    this.repairHull(this.ship, dt);
    // Includes anything bought during the update above.
    for (const pilot of this.pilots) {
      this.fireShots(pilot.ship);
      this.collectOre(pilot.ship);
      this.unloadOre(pilot.ship, dt);
      this.repairHull(pilot.ship, dt);
    }
    this.spendStationOre();
    this.spendPirateOre();
  }

  /** Each POI follows a fixed circle around its parent, or the system's center. */
  private movePois(dt: number): void {
    const { tuning, field, station } = this;
    this.movePoi(field, tuning.fieldOrbitPeriod, tuning.fieldRotationPeriod, dt);
    this.movePoi(station, tuning.orbitPeriod, tuning.stationRotationPeriod, dt);
    if (this.pirateBase) this.movePoi(this.pirateBase, tuning.orbitPeriod, 0, dt);
  }

  private movePoi(poi: Poi, orbitPeriod: number, rotationPeriod: number, dt: number): void {
    const rate = (period: number) => (period > 0 ? (Math.PI * 2) / period : 0);
    poi.px = poi.x;
    poi.py = poi.y;
    poi.prevRotation = poi.rotation;
    poi.orbitAngle += rate(orbitPeriod) * dt;
    poi.turn = rate(rotationPeriod) * dt;
    poi.rotation += poi.turn;
    poi.x = (poi.parent?.x ?? 0) + Math.cos(poi.orbitAngle) * poi.orbitRadius;
    poi.y = (poi.parent?.y ?? 0) + Math.sin(poi.orbitAngle) * poi.orbitRadius;
  }

  /** Nearest by distance from each POI's edge, so a large field claims more space. */
  nearestPoi(x: number, y: number): Poi {
    const { field, station, pirateBase } = this;
    const toField = Math.hypot(x - field.px, y - field.py) - field.reach;
    const toStation = Math.hypot(x - station.px, y - station.py) - station.reach;
    const nearest = toStation < toField ? station : field;
    if (!pirateBase) return nearest;
    const toBase = Math.hypot(x - pirateBase.px, y - pirateBase.py) - pirateBase.reach;
    return toBase < Math.min(toField, toStation) ? pirateBase : nearest;
  }

  /**
   * Moves everything rigidly with its nearest POI. Velocities stay relative to
   * that POI, so crossing to another POI's zone keeps the ship's relative speed.
   */
  private carryBodies(): void {
    this.carryShip(this.ship);
    for (const pilot of this.pilots) this.carryShip(pilot.ship);
    for (const rock of this.rocks) {
      const frame = this.carry(rock);
      rock.prevAngle = rock.angle;
      rock.angle += frame.turn;
    }
    for (const ore of this.ores) this.carry(ore);
    for (const shot of this.shots) this.carry(shot);
  }

  private carryShip(ship: Ship): void {
    ship.frame = this.carry(ship);
    ship.prevAngle = ship.angle;
    ship.angle += ship.frame.turn;
  }

  private carry(body: Body): Poi {
    const poi = this.nearestPoi(body.x, body.y);
    const cos = Math.cos(poi.turn);
    const sin = Math.sin(poi.turn);
    const dx = body.x - poi.px;
    const dy = body.y - poi.py;
    body.px = body.x;
    body.py = body.y;
    body.x = poi.x + dx * cos - dy * sin;
    body.y = poi.y + dx * sin + dy * cos;
    const { vx, vy } = body;
    body.vx = vx * cos - vy * sin;
    body.vy = vx * sin + vy * cos;
    return poi;
  }

  /**
   * Where a POI's marker should lead, how far until the POI's edge enters a view of
   * the given half size in world units, and how fast that distance is closing.
   * Closing speed comes from real positions, so it includes all carrying by POIs.
   */
  readPoi(poi: Poi, viewHalfWidth: number, viewHalfHeight: number): PoiReading {
    const { ship, station, tuning } = this;
    const gapToView = (shipX: number, shipY: number, x: number, y: number, rotation: number) => {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      // The field is a circle. The station and its dock are a box, measured by its current extents.
      const isStation = poi === station;
      const centerX = isStation ? x + cos * STATION_SHAPE_CENTER : x;
      const centerY = isStation ? y + sin * STATION_SHAPE_CENTER : y;
      const extentX = isStation ? Math.abs(cos) * STATION_SHAPE_HALF + Math.abs(sin) * STATION_HALF : 0;
      const extentY = isStation ? Math.abs(sin) * STATION_SHAPE_HALF + Math.abs(cos) * STATION_HALF : 0;
      const radius = isStation ? 0 : tuning.fieldRadius;
      const viewX = shipX + ship.vx * tuning.lookahead;
      const viewY = shipY + ship.vy * tuning.lookahead;
      const outX = Math.max(0, Math.abs(centerX - viewX) - viewHalfWidth - extentX);
      const outY = Math.max(0, Math.abs(centerY - viewY) - viewHalfHeight - extentY);
      return Math.hypot(outX, outY) - radius;
    };
    const gap = gapToView(ship.x, ship.y, poi.x, poi.y, poi.rotation);
    const previousGap = gapToView(ship.px, ship.py, poi.px, poi.py, poi.prevRotation);
    const leadX = poi === station ? Math.cos(poi.rotation) * DOCK_OFFSET : 0;
    const leadY = poi === station ? Math.sin(poi.rotation) * DOCK_OFFSET : 0;
    return {
      dx: poi.x + leadX - ship.x,
      dy: poi.y + leadY - ship.y,
      distance: Math.max(0, gap),
      closing: (previousGap - gap) / TICK,
    };
  }

  /** Direction to another ship, how far until it comes into view, and how fast that's closing. */
  readShip(other: Ship, viewHalfWidth: number, viewHalfHeight: number): PoiReading {
    const { ship, tuning } = this;
    const gapToView = (fromX: number, fromY: number, x: number, y: number) =>
      Math.hypot(
        Math.max(0, Math.abs(x - fromX - ship.vx * tuning.lookahead) - viewHalfWidth),
        Math.max(0, Math.abs(y - fromY - ship.vy * tuning.lookahead) - viewHalfHeight),
      );
    const gap = gapToView(ship.x, ship.y, other.x, other.y);
    return {
      dx: other.x - ship.x,
      dy: other.y - ship.y,
      distance: gap,
      closing: (gapToView(ship.px, ship.py, other.px, other.py) - gap) / TICK,
    };
  }

  /** Converts a world position's offset from the station into the station's own axes. */
  private toStationAxes(dx: number, dy: number): { x: number; y: number } {
    const cos = Math.cos(this.station.rotation);
    const sin = Math.sin(this.station.rotation);
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  }

  private fromStationAxes(x: number, y: number): { x: number; y: number } {
    const cos = Math.cos(this.station.rotation);
    const sin = Math.sin(this.station.rotation);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  }

  isDocked(ship: Ship = this.ship): boolean {
    const { station } = this;
    const local = this.toStationAxes(ship.x - station.x, ship.y - station.y);
    return Math.abs(local.x - DOCK_OFFSET) < STATION_HALF && Math.abs(local.y) < STATION_HALF;
  }

  /**
   * Stands in for a distant belt that the field slowly gathers rocks from. Rocks
   * start out of sight and drift in, and stop coming once the field is full.
   */
  private driftInRocks(dt: number): void {
    const { tuning, field, ship } = this;
    if (tuning.rockInflow <= 0 || this.rocks.length >= tuning.rockCount) return;
    this.inflowTimer -= (dt * tuning.rockInflow) / 60;
    if (this.inflowTimer > 0) return;

    const distance = tuning.fieldRadius + INFLOW_START_DISTANCE;
    for (let attempt = 0; attempt < 8; attempt++) {
      const dir = this.random() * Math.PI * 2;
      const x = field.x + Math.cos(dir) * distance;
      const y = field.y + Math.sin(dir) * distance;
      if (Math.hypot(x - ship.x, y - ship.y) < INFLOW_CLEAR_OF_PLAYER) continue;
      const rock = this.makeRock(
        INFLOW_TIER,
        x,
        y,
        -Math.cos(dir) * INFLOW_SPEED,
        -Math.sin(dir) * INFLOW_SPEED,
      );
      rock.arriving = true;
      this.rocks.push(rock);
      this.inflowTimer += 0.75 + this.random() * 0.5;
      return;
    }
  }

  private moveRocks(dt: number): void {
    const edge = this.tuning.fieldRadius;
    for (const rock of this.rocks) {
      if (rock.arriving) {
        // The field's pull would speed it up all the way in.
        rock.arriving = Math.hypot(rock.x - this.field.x, rock.y - this.field.y) > edge;
      } else {
        this.containInField(rock, edge, dt);
      }
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      rock.angle += rock.spin * dt;
    }
  }

  /** Steers loose ore in range toward the ship, so it arrives instead of circling it. */
  private pullOre(ship: Ship, dt: number): void {
    if (!ship.parts.has("tractor")) return;
    const { tractorRange, tractorPull, tractorSpeed } = this.tuning;
    const most = tractorPull * dt;
    for (const ore of this.ores) {
      const dx = ship.x - ore.x;
      const dy = ship.y - ore.y;
      const distance = Math.hypot(dx, dy);
      if (distance > tractorRange || distance === 0) continue;
      const changeX = ship.vx + (dx / distance) * tractorSpeed - ore.vx;
      const changeY = ship.vy + (dy / distance) * tractorSpeed - ore.vy;
      const change = Math.hypot(changeX, changeY);
      const share = change > most ? most / change : 1;
      ore.vx += changeX * share;
      ore.vy += changeY * share;
    }
  }

  private moveOres(dt: number): void {
    const edge = this.tuning.fieldRadius;
    for (const ore of this.ores) {
      this.containInField(ore, edge, dt);
      ore.x += ore.vx * dt;
      ore.y += ore.vy * dt;
    }
  }

  /** Gentle pull so drifting pieces stay in the field during long sessions. */
  private containInField(body: Body, edge: number, dt: number): void {
    const dx = body.x - this.field.x;
    const dy = body.y - this.field.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= edge) return;
    const pull = 6 * dt;
    body.vx -= (dx / dist) * pull;
    body.vy -= (dy / dist) * pull;
  }

  private moveShip(ship: Ship, dt: number): void {
    const { tuning } = this;
    const { controls } = ship;

    const perTick = dt * this.shipResponse(ship);
    ship.firing.clear();
    // On a click order the pilot decides, or the retro switch would fight its coasting.
    const usesSwitch = ship === this.ship && !this.clickPilot.active;
    const retro = ship.parts.has("retro") && (usesSwitch ? tuning.retro : controls.retro);
    const spinAssist = retro || (ship.parts.has("spinStabilizer") && controls.stabilize);

    const spinChange = ((tuning.rotationThrust * Math.PI) / 180) * perTick;
    ship.spin += this.fireAxis(
      ship,
      controls.turn,
      ship.spin,
      "thrusterRotateRight",
      "thrusterRotateLeft",
      spinChange,
      spinChange,
      spinAssist,
    );
    ship.angle += ship.spin * dt;

    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    const forwardChange = this.fireAxis(
      ship,
      controls.thrust,
      ship.vx * cos + ship.vy * sin,
      "thrusterMain",
      "thrusterReverse",
      tuning.thrust * perTick,
      tuning.reverseThrust * perTick,
      retro,
    );
    const sideChange = this.fireAxis(
      ship,
      controls.strafe,
      -ship.vx * sin + ship.vy * cos,
      "thrusterStrafeRight",
      "thrusterStrafeLeft",
      tuning.sideThrust * perTick,
      tuning.sideThrust * perTick,
      retro,
    );
    ship.vx += cos * forwardChange - sin * sideChange;
    ship.vy += sin * forwardChange + cos * sideChange;

    if (this.isDocked(ship)) {
      const keep = Math.exp(-tuning.dockDrag * dt);
      ship.vx *= keep;
      ship.vy *= keep;
    }

    this.moveShipWithCollision(ship, dt);

    if (ship === this.ship) {
      this.stats.topSpeed = Math.max(this.stats.topSpeed, Math.hypot(ship.vx, ship.vy));
    }
    ship.cooldown = Math.max(0, ship.cooldown - dt);
  }

  /**
   * The velocity change one pair of opposed thrusters makes this tick. With no
   * pilot input on this axis, `assist` fires whichever thruster opposes the motion.
   * It uses the real thrusters, so a missing one leaves that motion uncorrected.
   */
  private fireAxis(
    ship: Ship,
    command: number,
    velocity: number,
    positive: ThrusterId,
    negative: ThrusterId,
    positiveChange: number,
    negativeChange: number,
    assist: boolean,
  ): number {
    let direction = Math.sign(command);
    let limit = Infinity;
    if (direction === 0) {
      if (!assist || Math.abs(velocity) < 1e-6) return 0;
      direction = velocity < 0 ? 1 : -1;
      limit = Math.abs(velocity);
    }
    const thruster = direction > 0 ? positive : negative;
    if (!this.canFire(ship, thruster)) return 0;
    ship.firing.add(thruster);
    return direction * Math.min(direction > 0 ? positiveChange : negativeChange, limit);
  }

  /** A thruster needs its part. The panel's switches can also turn off the player's. */
  private canFire(ship: Ship, thruster: ThrusterId): boolean {
    if (ship === this.ship && !this.tuning[thruster]) return false;
    const part = THRUSTER_PARTS[thruster];
    return part === undefined || ship.parts.has(part);
  }

  private moveShipWithCollision(ship: Ship, dt: number): void {
    let hit: Rock | null = null;
    let hitT = Infinity;

    for (const rock of this.rocks) {
      const relX = ship.x - rock.x;
      const relY = ship.y - rock.y;
      const dx = (ship.vx - rock.vx) * dt;
      const dy = (ship.vy - rock.vy) * dt;
      const reach = rock.radius + SHIP_RADIUS;
      const t = sweepCircle(relX, relY, dx, dy, reach);
      // Already overlapping and moving out: let it leave. Holding it here while
      // two overlapping rocks trade it back and forth would let thrust build unseen.
      const leaving = t === 0 && relX * dx + relY * dy > dt * reach;
      if (t !== null && t < hitT && !leaving) {
        hitT = t;
        hit = rock;
      }
    }

    const { station } = this;
    const stationReach = STATION_HALF + SHIP_RADIUS;
    const from = this.toStationAxes(ship.x - station.x, ship.y - station.y);
    const move = this.toStationAxes(ship.vx * dt, ship.vy * dt);
    const stationHit = sweepBox(from.x, from.y, move.x, move.y, stationReach, stationReach);
    if (stationHit && stationHit.t < hitT) {
      // Rest on the surface, so a ship never stays stuck inside the station.
      const restX = stationHit.nx !== 0
        ? stationHit.nx * (stationReach + 0.01)
        : from.x + move.x * stationHit.t;
      const restY = stationHit.ny !== 0
        ? stationHit.ny * (stationReach + 0.01)
        : from.y + move.y * stationHit.t;
      const rest = this.fromStationAxes(restX, restY);
      ship.x = station.x + rest.x;
      ship.y = station.y + rest.y;
      const normal = this.fromStationAxes(stationHit.nx, stationHit.ny);
      this.bounceOff(ship, normal.x, normal.y, STILL, 0);
      return;
    }

    if (!hit) {
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      return;
    }

    ship.x += ship.vx * dt * hitT;
    ship.y += ship.vy * dt * hitT;
    this.resolveImpact(ship, hit);
  }

  private resolveImpact(ship: Ship, rock: Rock): void {
    let nx = ship.x - rock.x;
    let ny = ship.y - rock.y;
    const dist = Math.hypot(nx, ny) || 1;
    nx /= dist;
    ny /= dist;

    // Push out of any overlap, so a ship never stays stuck inside a rock.
    const reach = rock.radius + SHIP_RADIUS + 0.01;
    ship.x = rock.x + nx * reach;
    ship.y = rock.y + ny * reach;

    const rockMass = (rock.radius * rock.radius) / 400;
    this.bounceOff(ship, nx, ny, rock, 1 / rockMass);
  }

  /** `otherInverseMass` of 0 means the other body can't be pushed. The ship's mass is 1. */
  private bounceOff(
    ship: Ship,
    nx: number,
    ny: number,
    other: { vx: number; vy: number },
    otherInverseMass: number,
  ): void {
    const { tuning } = this;
    const closing = (ship.vx - other.vx) * nx + (ship.vy - other.vy) * ny;
    if (closing >= 0) return;

    const impulse = (-(1 + tuning.bounce) * closing) / (1 + otherInverseMass);
    ship.vx += impulse * nx;
    ship.vy += impulse * ny;
    other.vx -= impulse * otherInverseMass * nx;
    other.vy -= impulse * otherInverseMass * ny;

    const damage = Math.max(0, -closing - tuning.safeImpactSpeed) * tuning.damagePerSpeed;
    if (damage > 0) {
      ship.hull -= damage;
      ship.damageTaken += damage;
      const player = ship === this.ship;
      this.events.push({ type: "impact", x: ship.x, y: ship.y, damage, player });
      if (ship.hull <= 0) this.wreckShip(ship);
    }
  }

  private wreckShip(ship: Ship): void {
    const player = ship === this.ship;
    this.events.push({ type: "wreck", x: ship.x, y: ship.y, player });
    ship.wrecks++;
    this.dropOre(ship);
    const { rebuildCost } = this.tuning;
    const account = this.accountOf(ship);
    // A pirate is rebuilt from its base's pile, or it's gone for good.
    if (ship.faction === "pirate") {
      if (this.pirateOre < this.oreFor(rebuildCost)) {
        this.removeShip(ship);
        return;
      }
      this.pirateOre -= this.oreFor(rebuildCost);
      ship.upkeep += rebuildCost;
      this.respawn(ship);
      return;
    }
    // A defender is never rebuilt. The station builds a new one when lost traffic calls for it.
    if (ship.faction === "defender") {
      this.removeShip(ship);
      return;
    }
    // Only the player can always rebuild. Anyone else needs the money, and the station the ore.
    if (!player && rebuildCost > 0) {
      if (account.credits < rebuildCost || !this.hasOreFor(rebuildCost)) {
        this.removeShip(ship);
        return;
      }
    }
    this.chargeForService(account, rebuildCost);
    ship.upkeep += rebuildCost;
    this.respawn(ship);
  }

  /** A wreck's cargo stays in the world for anyone to collect. */
  private dropOre(ship: Ship): void {
    for (let i = 0; i < ship.ore; i++) {
      const dir = this.random() * Math.PI * 2;
      const kick = WRECK_ORE_SPEED * (0.5 + this.random() * 0.5);
      this.ores.push({
        x: ship.x,
        y: ship.y,
        px: ship.x,
        py: ship.y,
        vx: ship.vx + Math.cos(dir) * kick,
        vy: ship.vy + Math.sin(dir) * kick,
        kind: Math.floor(this.random() * ORE_KINDS),
      });
    }
    ship.ore = 0;
  }

  private removeShip(ship: Ship): void {
    if (this.traffic.some((pilot) => pilot.ship === ship)) this.lostTraffic.push(ship.model);
    const others = (pilots: DronePilot[]) => pilots.filter((pilot) => pilot.ship !== ship);
    this.drones = others(this.drones);
    this.traffic = others(this.traffic);
    this.fighters = this.fighters.filter((pilot) => pilot.ship !== ship);
    if (this.distress?.ship === ship) this.distress = null;
  }

  /** The pirate base builds more pirates from ore beyond its reserve, up to its limit. */
  private spendPirateOre(): void {
    const { tuning, pirateBase } = this;
    if (!pirateBase || tuning.defenderPrice <= 0) return;
    const pirates = this.fighters.filter((pilot) => pilot.ship.faction === "pirate").length;
    if (pirates >= tuning.pirateLimit) return;
    const price = this.oreFor(tuning.defenderPrice);
    if (this.pirateOre - tuning.stationReserveOre < price) return;
    this.pirateOre -= price;
    this.addFighter(pirateBase.x, pirateBase.y, "pirate");
  }

  /**
   * The station only spends ore beyond its reserve, and only in response to lost traffic:
   * first a defender if it has none, then the lost ship. It saves up for the defender
   * rather than spending on the ship.
   */
  private spendStationOre(): void {
    const { tuning } = this;
    if (this.lostTraffic.length === 0) return;
    const spare = this.stationOre - tuning.stationReserveOre;
    const dock = this.dockPoint();
    const hasDefender = this.fighters.some((pilot) => pilot.ship.faction === "defender");
    if (!hasDefender && tuning.defenderPrice > 0) {
      if (spare < this.oreFor(tuning.defenderPrice)) return;
      this.chargeForService(this.stationAccount, tuning.defenderPrice);
      this.addFighter(dock.x, dock.y, "defender");
    } else {
      if (spare < this.oreFor(tuning.rebuildCost)) return;
      this.chargeForService(this.stationAccount, tuning.rebuildCost);
      this.addTraffic(dock.x, dock.y, this.lostTraffic.shift()!);
    }
    this.events.push({ type: "sale", x: dock.x, y: dock.y });
  }

  private moveShots(dt: number): void {
    const remaining: Shot[] = [];
    for (const shot of this.shots) {
      shot.life -= dt;
      if (shot.life <= 0) continue;

      const from = this.toStationAxes(shot.x - this.station.x, shot.y - this.station.y);
      const move = this.toStationAxes(shot.vx * dt, shot.vy * dt);
      const stationHit = sweepBox(from.x, from.y, move.x, move.y, STATION_HALF, STATION_HALF);

      let hit: Rock | null = null;
      let hitT = Infinity;
      for (const rock of this.rocks) {
        const t = sweepCircle(
          shot.x - rock.x,
          shot.y - rock.y,
          (shot.vx - rock.vx) * dt,
          (shot.vy - rock.vy) * dt,
          rock.radius,
        );
        if (t !== null && t < hitT) {
          hitT = t;
          hit = rock;
        }
      }

      let hitShip: Ship | null = null;
      for (const ship of this.ships) {
        if (ship === shot.from) continue;
        const t = sweepCircle(
          shot.x - ship.x,
          shot.y - ship.y,
          (shot.vx - ship.vx) * dt,
          (shot.vy - ship.vy) * dt,
          SHIP_RADIUS,
        );
        if (t !== null && t < hitT) {
          hitT = t;
          hit = null;
          hitShip = ship;
        }
      }

      if (stationHit && stationHit.t < hitT) {
        const x = shot.x + shot.vx * dt * stationHit.t;
        const y = shot.y + shot.vy * dt * stationHit.t;
        this.events.push({ type: "hit", x, y });
        continue;
      }

      if (hitShip) {
        const x = shot.x + shot.vx * dt * hitT;
        const y = shot.y + shot.vy * dt * hitT;
        this.events.push({ type: "hit", x, y });
        this.shootShip(hitShip, shot);
        continue;
      }

      if (hit) {
        const x = shot.x + shot.vx * dt * hitT;
        const y = shot.y + shot.vy * dt * hitT;
        this.events.push({ type: "hit", x, y });
        hit.hp -= 1;
        if (shot.precise && this.random() < this.tuning.preciseChance) {
          this.releaseOre(x, y, hit);
        }
        if (hit.hp <= 0) this.breakRock(hit);
        continue;
      }

      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      remaining.push(shot);
    }
    this.shots = remaining;
  }

  /** A ship in the dock is safe: shots pass through. Anywhere else, hits do damage. */
  private shootShip(ship: Ship, shot: Shot): void {
    if (this.isDocked(ship)) return;
    const damage = this.tuning.shotDamage;
    ship.hull -= damage;
    ship.damageTaken += damage;
    ship.shotFrom = { x: shot.from.x, y: shot.from.y };
    this.distress = { ship, age: 0 };
    const player = ship === this.ship;
    this.events.push({ type: "impact", x: ship.x, y: ship.y, damage, player });
    if (ship.hull <= 0) this.wreckShip(ship);
  }

  private fireShots(ship: Ship): void {
    const { tuning } = this;
    if (!ship.controls.fire || ship.cooldown > 0) return;
    const precise = ship.parts.has("gun2");
    ship.cooldown = 1 / (precise ? tuning.gun2ShotsPerSecond : tuning.shotsPerSecond);
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    const x = ship.x + cos * (SHIP_RADIUS + 4);
    const y = ship.y + sin * (SHIP_RADIUS + 4);
    this.shots.push({
      x,
      y,
      px: x,
      py: y,
      vx: ship.vx + cos * tuning.shotSpeed,
      vy: ship.vy + sin * tuning.shotSpeed,
      life: tuning.shotLife,
      precise,
      from: ship,
    });
    this.events.push({ type: "shot", x, y });
  }

  /** A precision hit: ore comes loose where the shot landed, moving slowly in any direction. */
  private releaseOre(x: number, y: number, rock: Rock): void {
    const dir = this.random() * Math.PI * 2;
    const kick = this.tuning.preciseOreSpeed * (0.5 + this.random() * 0.5);
    this.ores.push({
      x,
      y,
      px: x,
      py: y,
      vx: rock.vx + Math.cos(dir) * kick,
      vy: rock.vy + Math.sin(dir) * kick,
      kind: Math.floor(this.random() * ORE_KINDS),
    });
  }

  breakRock(rock: Rock): void {
    this.rocks.splice(this.rocks.indexOf(rock), 1);
    this.events.push({ type: "break", x: rock.x, y: rock.y, radius: rock.radius });

    if (rock.tier > 0) {
      const pieces = 2 + Math.floor(this.random() * 2);
      for (let i = 0; i < pieces; i++) {
        const dir = (i / pieces) * Math.PI * 2 + this.random();
        const kick = 20 + this.random() * 40;
        const offset = TIER_RADIUS[rock.tier - 1] * 0.8;
        this.rocks.push(
          this.makeRock(
            rock.tier - 1,
            rock.x + Math.cos(dir) * offset,
            rock.y + Math.sin(dir) * offset,
            rock.vx + Math.cos(dir) * kick,
            rock.vy + Math.sin(dir) * kick,
          ),
        );
      }
    }

    const rolls = rock.tier + 1;
    for (let i = 0; i < rolls; i++) {
      if (this.random() >= this.tuning.oreChance) continue;
      const dir = this.random() * Math.PI * 2;
      const kick = 15 + this.random() * 45;
      const x = rock.x + Math.cos(dir) * rock.radius * 0.4;
      const y = rock.y + Math.sin(dir) * rock.radius * 0.4;
      this.ores.push({
        x,
        y,
        px: x,
        py: y,
        vx: rock.vx + Math.cos(dir) * kick,
        vy: rock.vy + Math.sin(dir) * kick,
        kind: Math.floor(this.random() * ORE_KINDS),
      });
    }
  }

  /** Ore turns into credits one piece at a time while in the dock. */
  private unloadOre(ship: Ship, dt: number): void {
    if (ship.ore <= 0 || !this.isHome(ship)) {
      ship.unloadTimer = 0;
      return;
    }
    ship.unloadTimer += dt;
    while (ship.unloadTimer >= UNLOAD_SECONDS && ship.ore > 0) {
      ship.unloadTimer -= UNLOAD_SECONDS;
      ship.ore--;
      if (ship.faction === "pirate") {
        this.pirateOre++;
      } else {
        this.accountOf(ship).credits += this.tuning.creditsPerOre;
        this.stationOre++;
        this.stationAccount.credits -= this.tuning.creditsPerOre;
      }
      ship.earned += this.tuning.creditsPerOre;
      this.events.push({ type: "sale", x: ship.x, y: ship.y });
      if (ship.ore === 0) ship.trips++;
    }
  }

  /** Whether the ship has the money for a hull point, and its dock the ore. */
  canPayRepair(ship: Ship): boolean {
    const { repairCost } = this.tuning;
    if (ship.faction === "pirate") return this.pirateOre >= this.oreFor(repairCost);
    if (!this.hasOreFor(repairCost)) return false;
    return ship.faction === "defender" || this.accountOf(ship).credits >= repairCost;
  }

  /** Whether the dock could repair this ship right now. */
  canRepair(ship: Ship): boolean {
    return this.isHome(ship) && ship.hull < MAX_HULL && this.canPayRepair(ship);
  }

  /** The dock repairs a hull point at a time, for as long as the ship can pay. */
  private repairHull(ship: Ship, dt: number): void {
    const { tuning } = this;
    if (!this.canRepair(ship)) {
      ship.repairTimer = 0;
      return;
    }
    ship.repairTimer += dt * tuning.repairSpeed;
    while (ship.repairTimer >= 1 && this.canRepair(ship)) {
      ship.repairTimer -= 1;
      ship.hull = Math.min(MAX_HULL, ship.hull + 1);
      if (ship.faction === "pirate") this.pirateOre -= this.oreFor(tuning.repairCost);
      else this.chargeForService(this.accountOf(ship), tuning.repairCost);
      ship.upkeep += tuning.repairCost;
    }
  }

  private collectOre(ship: Ship): void {
    const reach = SHIP_RADIUS + ORE_RADIUS + PICKUP_MARGIN;
    this.ores = this.ores.filter((ore) => {
      const segment = sweepCircle(
        ore.px - ship.px,
        ore.py - ship.py,
        ore.x - ore.px - (ship.x - ship.px),
        ore.y - ore.py - (ship.y - ship.py),
        reach,
      );
      if (segment === null) return true;
      ship.ore++;
      if (ship === this.ship) this.stats.bestOre = Math.max(this.stats.bestOre, ship.ore);
      this.events.push({ type: "pickup", x: ore.x, y: ore.y, kind: ore.kind });
      return false;
    });
  }
}
