import { Chatter } from "./chatter";
import { type BlueprintId, isProject, PARTS, partFits, PROJECTS, TRAFFIC_BUY_ORDER, type PartId, type ShipModel } from "./parts";
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
export const DEPOSIT_HALF = 70;
/** How far from a turret's center its shots start. */
const GUARD_BARREL = 30;
/** How far outside the field a pirate starts, on the far side from the station. */
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

export interface Body {
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
  /** What carries this ship the most: an open deposit it's inside, or a POI, or the nearest if none does. */
  frame: Poi | Deposit;
  /** How much of that POI's motion carried the ship on the last tick, from 0 to 1. */
  frameShare: number;
  /** How far the POIs turned the ship on the last tick. */
  carriedTurn: number;
  /** How hard it's burning in a body's air this tick, 0 to 1, for drawing. */
  burning: number;
  ore: number;
  unloadTimer: number;
  angle: number;
  prevAngle: number;
  spin: number;
  hull: number;
  cooldown: number;
  /** Which way the turret points, relative to the nose. 0 without a turret. */
  turretAngle: number;
  prevTurretAngle: number;
  /** The world spot the turret turns toward, or null to face forward. */
  aim: { x: number; y: number } | null;
  /** Thrusters that fired on the last tick, and how hard: 0 to 1 of their full output. */
  firing: Map<ThrusterId, number>;
  /** It hit a pirate, so every pirate attacks it on sight, cargo or not. Until it dies. */
  marked: boolean;
  /** Reported for attacking traffic: defenders come for it and traffic flees it. Until it dies. */
  wanted: boolean;
  /** When a pirate last wrecked it, or null. It won't trade with pirates for a while after. */
  pirateKilledAt: number | null;
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

/**
 * A big freighter that comes from far away to buy the station's ore. It flies free of the
 * POIs' carrying, matches the station's turn to lock on at its berth, and unlocks to leave.
 */
export interface Hauler {
  stage: "arriving" | "docking" | "loading" | "undocking" | "leaving";
  /** Seconds into the current stage. */
  time: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  angle: number;
  prevAngle: number;
  /** Where it was relative to the berth when docking began, in the station's axes. */
  dockOffset: { x: number; y: number; angle: number };
  /** Which thrusters fired this tick, for drawing: forward and side push, and turning. */
  thrust: { forward: number; side: number; turn: number };
  cargo: number;
  /** Parts still aboard, for sale to the station. */
  parts: number;
  /** Credits paid for ore this visit and not yet spent on parts. */
  earned: number;
  /** Seconds at the berth with nothing to load. */
  idle: number;
  loadTimer: number;
}

/**
 * The black market's freighter. It calls at the pirate base now and then, buys the ore the
 * base hasn't sold, and sells the pirates parts and new hulls. Everything it pays comes from
 * outside, and everything it's paid leaves with it.
 */
export interface BlackMarket {
  stage: "arriving" | "berthed" | "leaving";
  /** Seconds into the current stage. */
  time: number;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Which way it points, along its lane. */
  angle: number;
  /** Speed along its lane, away from the base. */
  speed: number;
  /** Whether it's burning this tick: 1 speeding up, -1 braking, 0 coasting. */
  burn: number;
  cargo: number;
  loadTimer: number;
}

export const BLACK_MARKET_LENGTH = 220;
export const BLACK_MARKET_WIDTH = 70;
/** Where it berths, beyond the base's edge on the far side from the station. */
const BLACK_MARKET_BERTH = PIRATE_BASE_RADIUS + BLACK_MARKET_WIDTH;
/** It comes in from this far out and is gone again beyond it. */
const BLACK_MARKET_APPROACH = 6000;
const BLACK_MARKET_SPEED = 300;
const BLACK_MARKET_ACCELERATION = 60;
/** How long it stays to trade. */
const BLACK_MARKET_STAY = 60;
const BLACK_MARKET_LOAD_RATE = 10;
/** What pirates fit, in the order they buy it. */
const PIRATE_PARTS: PartId[] = ["spinStabilizer", "reverse", "strafe", "retro"];

export const HAULER_LENGTH = 300;
export const HAULER_WIDTH = 100;
/** Beside the station, on the side away from the dock, its long side along the station's. */
const HAULER_BERTH_X = -(STATION_HALF + 40 + HAULER_WIDTH / 2);
/** It starts this far out, on the side of the station away from the field. */
const HAULER_APPROACH = 9000;
/** The braking it plans for on the way in, and the most it can push in any direction. */
const HAULER_BRAKE = 4;
const HAULER_MAX_ACCEL = 6;
const HAULER_MAX_SPEED = 300;
/** Close and slow enough to begin matching the station's turn. */
const HAULER_DOCK_DISTANCE = 40;
const HAULER_DOCK_SPEED = 4;
const HAULER_DOCK_SECONDS = 20;
/** It stops this far out from its berth, then slides in sideways. */
const HAULER_STANDOFF = 500;
/** It keeps its center at least this far from the station's while flying. */
const HAULER_CLEARANCE = 500;
/** The least speed it keeps while heading for a detour point, so it flows around. */
const HAULER_DETOUR_SPEED = 60;
const HAULER_UNDOCK_SECONDS = 8;
/** Push away from the station while undocking. */
const HAULER_UNDOCK_PUSH = 2;
const HAULER_TURN_RATE = 0.15;
const HAULER_LEAVE_ACCEL = 3;
/** Gone once this far from the station. */
const HAULER_GONE = 15000;
/** It leaves after waiting this long with nothing to load. */
const HAULER_WAIT_SECONDS = 15;
/** If it hasn't reached the berth by then, it docks from wherever it is. */
const HAULER_ARRIVAL_LIMIT = 400;

/** Radians per second for a period in seconds. Zero or less stands still, as it always has here. */
/** Burning this much faster than a body's burn speed glows as bright as it gets. */
const BURN_GLOW_SPEED = 300;

/** How far beyond a station or base things count as being there, when the layout moves it. */
const LAYOUT_NEIGHBOURHOOD = 500;

function orbitRate(period: number): number {
  return period !== 0 ? (Math.PI * 2) / period : 0;
}

/** A point of interest: it orbits on a fixed path, spins, and carries nearby objects. */
/** A storage platform out by a POI. Any ship can sell ore into it or buy ore out of it. */
export interface Deposit {
  name: "field deposit";
  /** The POI it stands by, and the one whose side of that POI it keeps to. */
  at: Poi;
  toward: Poi;
  x: number;
  y: number;
  px: number;
  py: number;
  ore: number;
  /** Put there by the testing switch, so it goes when the switch does. */
  fromSwitch: boolean;
  /** Parts still to come before it opens, and the parts already built into it. */
  partsLeft: number;
  partsUsed: number;
}

/** One gun of a battery. */
export interface Guard {
  x: number;
  y: number;
  px: number;
  py: number;
  angle: number;
  prevAngle: number;
  cooldown: number;
  /** Stands in as the ship its shots came from. It's never in the world itself. */
  gun: Ship;
}

/** A set of turrets standing on one thing, built as one project. */
export interface Battery {
  id: "stationGuards" | "depositGuards";
  host: Poi | Deposit;
  guns: Guard[];
  fromSwitch: boolean;
  partsLeft: number;
  partsUsed: number;
}

export interface Poi {
  name: "field" | "station" | "pirate base";
  parent: Poi | null;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Where it is on its orbit now. Worked out from the clock each tick, never added up. */
  orbitAngle: number;
  orbitRadius: number;
  /** The orbit angle at clock 0, so the angle at any time is phase + rate × time. */
  orbitPhase: number;
  /** The period the phase was worked out for. A change of period moves the phase, not the POI. */
  orbitPeriod: number;
  rotation: number;
  prevRotation: number;
  /** Size used when working out which POI is nearest. */
  reach: number;
  /** Rotation made on the current tick. */
  turn: number;
  /** A field from the designer beyond the first: placed by its chain of orbits instead. */
  orbits?: Orbit[];
  /** Its own carrying ranges, instead of the tuning's. */
  carry?: { full: number; none: number };
}

/**
 * A field from the designer beyond the first: rocks and nothing else. Not saved: the
 * designer hands them over each time, and the rocks in them are saved like any other.
 */
export interface FieldSpec {
  id: string;
  name: string;
  radius: number;
  rocks: number;
  rockDrift: number;
  rockInflow: number;
  /** Carries fully within `carryFull` of its edge, fading out by `carryNone`. Infinity: everywhere. */
  carryFull: number;
  carryNone: number;
  rotationPeriod: number;
  orbits: Orbit[];
}

interface ExtraField {
  spec: FieldSpec;
  poi: Poi;
  /** Counts down to the next big rock drifting in. */
  inflowTimer: number;
}

/** What touching a body's ground does: nothing, a bounce that hurts like a rock's, or the end. */
export type Surface = "none" | "damage" | "death";

/** One circle in a body's motion: a radius, seconds per turn, the angle at clock 0, and which way it counts. */
export interface Orbit {
  radius: number;
  period: number;
  phase: number;
  sign: 1 | -1;
}

/**
 * A star, planet, moon or asteroid from the system designer. Its place relative to the
 * game's centre is the sum of its orbits. Not saved: the designer hands them over each time.
 */
export interface SolidBody {
  name: string;
  kind: string;
  radius: number;
  surface: Surface;
  /** Pull starts at `pullStart` from the centre, grows evenly to `pullAccel` at `pullFull`, and holds from there down. */
  pullStart: number;
  pullFull: number;
  pullAccel: number;
  /** In the air, out to `atmosphere` from the centre, faster than `burnSpeed` against the ground burns. */
  atmosphere: number;
  burnSpeed: number;
  spinPeriod: number;
  orbits: Orbit[];
}

/** A body's pull, in units/s², at a distance from its centre. */
export function pullAt(body: SolidBody, distance: number): number {
  const { pullStart, pullFull, pullAccel } = body;
  if (pullAccel <= 0 || distance >= pullStart) return 0;
  if (distance <= pullFull || pullStart <= pullFull) return pullAccel;
  return (pullAccel * (pullStart - distance)) / (pullStart - pullFull);
}

/** Where a body is at a time on the clock, and how fast it's going. */
export function bodyAt(body: SolidBody, time: number): { x: number; y: number; vx: number; vy: number } {
  return orbitsAt(body.orbits, time);
}

/** A new game's start for one ship, from the system designer. */
export interface Spawn {
  ship: ShipModel;
  orbits: Orbit[];
}

/** Where a chain of orbits puts something at a time on the clock, and how fast it's going. */
export function orbitsAt(orbits: Orbit[], time: number): { x: number; y: number; vx: number; vy: number } {
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  for (const { radius, period, phase, sign } of orbits) {
    const rate = orbitRate(period);
    const angle = phase + rate * time;
    x += sign * Math.cos(angle) * radius;
    y += sign * Math.sin(angle) * radius;
    vx -= sign * Math.sin(angle) * radius * rate;
    vy += sign * Math.cos(angle) * radius * rate;
  }
  return { x, y, vx, vy };
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
  /** From a turret: it only hits pirates and rocks, and clears the station. */
  guard?: boolean;
}

export interface Ore extends Body {
  kind: number;
  /** How much ore picking it up gives. Flung ore is worth more. */
  amount: number;
  /** Whose shot broke it loose, if anyone's. */
  from?: Ship | null;
}

export type SimEvent =
  | { type: "shot"; x: number; y: number }
  | { type: "hit"; x: number; y: number }
  | { type: "break"; x: number; y: number; radius: number }
  | { type: "pickup"; x: number; y: number; kind: number }
  | { type: "sale"; x: number; y: number }
  | { type: "impact"; x: number; y: number; damage: number; player: boolean }
  | { type: "wreck"; x: number; y: number; player: boolean }
  | {
      type: "chatter";
      x: number;
      y: number;
      /** The ship talking, or null for the station. */
      speaker: Ship | null;
      name: string;
      text: string;
      /** Heard at any distance. */
      mayday: boolean;
      /** Station news for everyone: heard at any distance, without the alarm. */
      broadcast: boolean;
    };

export interface Stats {
  bestOre: number;
  topSpeed: number;
}

/** Small seeded generator, so a given seed always builds the same field. */
/** The next number from 0 to 1 for a generator's state, which it moves on. */
function nextRandom(state: { a: number }): number {
  state.a = (state.a + 0x6d2b79f5) >>> 0;
  let t = state.a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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
  /** Ore the station has bought and is holding for the next hauler. */
  stationOre = 0;
  /** Parts the station holds. Every service it sells uses them up. */
  stationParts = 0;
  hauler: Hauler | null = null;
  /** Blueprints the station has, so its shop can sell those things. */
  blueprints = new Set<BlueprintId>();
  /** Credits paid toward blueprints the station doesn't have yet. */
  blueprintPaid = new Map<BlueprintId, number>();
  /** Blueprints paid in full, waiting for the next hauler to bring them. */
  blueprintsOrdered = new Set<BlueprintId>();
  deposits: Deposit[] = [];
  batteries: Battery[] = [];
  /** Seconds until the next hauler sets out. */
  haulerTimer = 0;
  /** Ore at the pirate base, for sale to empty holds and to the black market. */
  pirateOre = 0;
  /** The pirate base's money. It pays for repairs, rebuilds, new pirates and parts. */
  pirateCredits = 0;
  /** How many pirates the base fields. It grows once every pirate is fully fitted. */
  pirateCap = 0;
  blackMarket: BlackMarket | null = null;
  /** Seconds until the black market next sets out. */
  blackMarketTimer = 0;
  /** Traffic gone for good, waiting for the station to replace it. */
  lostTraffic: ShipModel[] = [];
  /** The ship most recently hit by a shot, if that was recent. */
  distress: { ship: Ship; age: number } | null = null;
  /** Seconds since the world began, for things that fade. */
  private clock = 0;

  get now(): number {
    return this.clock;
  }
  /** When each ship was hit by each other ship, for the hits not yet forgotten. */
  private grudges = new WeakMap<Ship, Map<Ship, number[]>>();
  /** Flies the player's ship to a clicked spot, if it has the part. */
  clickPilot!: ClickPilot;
  rocks: Rock[] = [];
  /** Stars, planets, moons and asteroids, from the system designer. None without it. */
  bodies: SolidBody[] = [];
  /** Where new games start, by ship. Several for one ship: one is picked at random. None: by the field. */
  spawns: Spawn[] = [];
  /** Each POI's angle at clock 0 for new games, from the designer. Missing: the game's own start. */
  startPhases: Partial<Record<Poi["name"], number>> = {};
  /** Fields beyond the first, from the designer. Rocks only: no station, deposit or traffic of their own. */
  extraFields: ExtraField[] = [];
  /** Where each body is this tick. */
  private bodySpots: { body: SolidBody; x: number; y: number; vx: number; vy: number }[] = [];
  shots: Shot[] = [];
  ores: Ore[] = [];
  field!: Poi;
  station!: Poi;
  events: SimEvent[] = [];
  stats: Stats = { bestOre: 0, topSpeed: 0 };
  /** Places the player has found: the dock, a deposit, a seller. What help shows grows with it. */
  discovered = new Set<string>();
  /** The world's own random numbers, from a state that can be saved. */
  private randomState = { a: 1 };
  private random = (): number => nextRandom(this.randomState);
  chatter = new Chatter(1);
  /** Counts down to the next rock drifting in, in units of the average wait. */
  private inflowTimer = 1;

  constructor(seed = 1, tuning: Tuning = { ...DEFAULTS }) {
    this.tuning = tuning;
    this.reset(seed);
  }

  /**
   * Everything needed to carry on later, as plain data. Pilots keep only whom they fly and
   * how they're set up: like anyone coming back to a job, they plan their next step afresh.
   */
  snapshot(): object {
    const pilot = (each: DronePilot) => ({ ship: each.ship, buys: each.buys, flees: each.flees, wishlist: each.wishlist });
    return {
      tuning: this.tuning,
      controls: this.controls,
      ship: this.ship,
      drones: this.drones.map(pilot),
      traffic: this.traffic.map(pilot),
      fighters: this.fighters.map((each) => each.ship),
      pirateBase: this.pirateBase,
      stationAccount: this.stationAccount,
      stationOre: this.stationOre,
      stationParts: this.stationParts,
      hauler: this.hauler,
      blueprints: this.blueprints,
      blueprintPaid: this.blueprintPaid,
      blueprintsOrdered: this.blueprintsOrdered,
      deposits: this.deposits,
      batteries: this.batteries,
      haulerTimer: this.haulerTimer,
      pirateOre: this.pirateOre,
      pirateCredits: this.pirateCredits,
      pirateCap: this.pirateCap,
      blackMarket: this.blackMarket,
      blackMarketTimer: this.blackMarketTimer,
      lostTraffic: this.lostTraffic,
      distress: this.distress,
      clock: this.clock,
      rocks: this.rocks,
      shots: this.shots,
      ores: this.ores,
      field: this.field,
      station: this.station,
      stats: this.stats,
      discovered: this.discovered,
      inflowTimer: this.inflowTimer,
      randomState: this.randomState,
    };
  }

  /** Picks up from a snapshot. Anything a newer ship has that the saved one lacks starts as new. */
  restore(saved: unknown): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = saved as any;
    for (const key of Object.keys(this.tuning) as (keyof Tuning)[]) {
      if (key in data.tuning) Object.assign(this.tuning, { [key]: data.tuning[key] });
    }
    const template = this.makeShip(0, 0, this.controls);
    const fill = (ship: Ship): Ship => {
      for (const [key, value] of Object.entries(template)) {
        if (!(key in ship)) Object.assign(ship, { [key]: value instanceof Set || value instanceof Map ? new (value.constructor as typeof Set)() : value });
      }
      return ship;
    };
    this.controls = data.controls;
    this.ship = fill(data.ship);
    const pilot = (each: { ship: Ship; buys: DronePilot["buys"]; flees: boolean; wishlist: PartId[] }) => {
      const made = new DronePilot(fill(each.ship));
      made.buys = each.buys;
      made.flees = each.flees;
      made.wishlist = each.wishlist;
      return made;
    };
    this.drones = data.drones.map(pilot);
    this.traffic = data.traffic.map(pilot);
    this.fighters = data.fighters.map((ship: Ship) => new FighterPilot(fill(ship)));
    for (const battery of data.batteries as Battery[]) for (const guard of battery.guns) fill(guard.gun);
    const plain = [
      "pirateBase", "stationAccount", "stationOre", "stationParts", "hauler", "blueprints", "blueprintPaid",
      "blueprintsOrdered", "deposits", "batteries", "haulerTimer", "pirateOre", "pirateCredits", "pirateCap",
      "blackMarket", "blackMarketTimer", "lostTraffic", "distress", "clock", "rocks", "shots", "ores", "field",
      "station", "stats", "inflowTimer", "randomState",
    ] as const;
    for (const key of plain) if (key in data) Object.assign(this, { [key]: data[key] });
    this.discovered = data.discovered ?? new Set();
    this.clickPilot = new ClickPilot(this.ship);
    this.chatter = new Chatter(this.randomState.a);
    this.grudges = new WeakMap();
    this.events = [];
  }

  reset(seed: number): void {
    this.randomState = { a: seed >>> 0 };
    this.chatter = new Chatter(seed);
    this.rocks = [];
    this.shots = [];
    this.ores = [];
    this.events = [];
    this.stats = { bestOre: this.stats.bestOre, topSpeed: 0 };
    this.discovered = new Set();
    this.inflowTimer = 1;
    this.placePois();
    this.resetPlayerControls();
    const model = this.tuning.floaterStart ? "floater" : "racer";
    this.ship = this.makeShip(this.startX(), this.field.y, this.controls, model);
    const spawns = this.spawns.filter((spawn) => spawn.ship === model);
    if (spawns.length > 0) {
      const at = orbitsAt(spawns[Math.floor(this.random() * spawns.length)].orbits, this.clock);
      Object.assign(this.ship, { x: at.x, y: at.y, px: at.x, py: at.y });
    }
    if (model === "floater") {
      this.ship.parts.add("gun2");
      this.ship.parts.add("clickMove");
      this.ship.parts.add("clickTurn");
    }
    this.clickPilot = new ClickPilot(this.ship);
    this.drones = [];
    this.distress = null;
    this.stationAccount = { credits: this.tuning.stationStartCredits };
    this.stationOre = this.tuning.stationStartOre;
    this.stationParts = this.tuning.stationStartParts;
    this.hauler = null;
    this.blueprints = new Set();
    this.blueprintPaid = new Map();
    this.blueprintsOrdered = new Set();
    this.deposits = [];
    this.haulerTimer = this.tuning.haulerFirst;
    this.pirateOre = this.tuning.pirateStartOre;
    this.pirateCredits = this.tuning.pirateStartCredits;
    this.pirateCap = this.tuning.pirateLimit;
    this.blackMarket = null;
    this.blackMarketTimer = this.tuning.blackMarketFirst;
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
      else this.addTraffic(this.trafficStartX(), y, models[i - this.tuning.testDrones]);
    }
    this.layRocks(this.field, this.tuning.fieldRadius, this.tuning.rockCount, this.tuning.rockDrift);
    for (const extra of this.extraFields) {
      this.fitExtraField(extra);
      extra.inflowTimer = 1;
      this.layRocks(extra.poi, extra.spec.radius, extra.spec.rocks, extra.spec.rockDrift);
    }
  }

  /** Scatters a field's rocks, clear of the player's ship. */
  private layRocks(field: Poi, radius: number, count: number, rockDrift: number): void {
    const clear = 260;
    for (let i = 0; i < count; i++) {
      const dist = radius * Math.sqrt(this.random());
      const dir = this.random() * Math.PI * 2;
      const x = field.x + Math.cos(dir) * dist;
      const y = field.y + Math.sin(dir) * dist;
      if (Math.hypot(x - this.ship.x, y - this.ship.y) < clear) continue;
      const roll = this.random();
      const tier = roll < 0.3 ? 2 : roll < 0.7 ? 1 : 0;
      const drift = rockDrift * this.random();
      const driftDir = this.random() * Math.PI * 2;
      this.rocks.push(
        this.makeRock(tier, x, y, Math.cos(driftDir) * drift, Math.sin(driftDir) * drift),
      );
    }
  }

  /** Puts an extra field where its orbits say now, with its spec's size and carrying. */
  private fitExtraField(extra: ExtraField): void {
    const { spec, poi } = extra;
    const at = orbitsAt(spec.orbits, this.clock);
    poi.orbits = spec.orbits;
    poi.reach = spec.radius;
    poi.carry = { full: spec.carryFull, none: Math.max(spec.carryFull, spec.carryNone) };
    poi.x = poi.px = at.x;
    poi.y = poi.py = at.y;
  }

  /** Every field with its size: the first, from the tuning, then the designer's others. */
  private rockFields(): { poi: Poi; radius: number }[] {
    return [{ poi: this.field, radius: this.tuning.fieldRadius }, ...this.extraFields.map(({ poi, spec }) => ({ poi, radius: spec.radius }))];
  }

  /** The field a spot belongs to: the one whose edge is nearest. */
  private fieldAt(fields: { poi: Poi; radius: number }[], x: number, y: number): number {
    if (fields.length === 1) return 0;
    let best = 0;
    let bestDistance = Infinity;
    fields.forEach(({ poi, radius }, i) => {
      const distance = Math.hypot(x - poi.x, y - poi.y) - radius;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    return best;
  }

  private placePois(): void {
    const { tuning } = this;
    // The designer's angles, as they stand now. Without them, the game's own start.
    const angle = (name: Poi["name"], own: number, period: number) => {
      const phase = this.startPhases[name];
      return phase === undefined ? own : phase + orbitRate(period) * this.clock;
    };
    this.field = this.makePoi("field", null, tuning.fieldOrbitRadius, angle("field", 0, tuning.fieldOrbitPeriod), tuning.fieldOrbitPeriod, tuning.fieldRadius);
    // Starts behind the ship's starting point, on the far side from the rocks.
    this.station = this.makePoi(
      "station",
      this.field,
      tuning.fieldRadius + tuning.stationDistance,
      angle("station", Math.PI, tuning.orbitPeriod),
      tuning.orbitPeriod,
      STATION_REACH,
    );
    // By default it orbits at the same pace as the station, so it stays on the far side of the field.
    this.pirateBase =
      tuning.pirates > 0
        ? this.makePoi(
            "pirate base",
            this.field,
            tuning.fieldRadius + tuning.pirateBaseDistance,
            angle("pirate base", 0, tuning.pirateOrbitPeriod),
            tuning.pirateOrbitPeriod,
            PIRATE_BASE_RADIUS,
          )
        : null;
  }

  private makePoi(
    name: Poi["name"],
    parent: Poi | null,
    orbitRadius: number,
    orbitAngle: number,
    orbitPeriod: number,
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
      // The clock keeps running through a restart, so the phase counts back from now.
      orbitPhase: orbitAngle - orbitRate(orbitPeriod) * this.clock,
      orbitPeriod,
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
    pilot.buys = "upgrades";
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

  /** Where the hauler is in the world, now or as of the previous tick, and which way it points. */
  haulerSpot(previous = false): { x: number; y: number; angle: number } | null {
    const { hauler } = this;
    if (!hauler) return null;
    return previous
      ? { x: hauler.px, y: hauler.py, angle: hauler.prevAngle }
      : { x: hauler.x, y: hauler.y, angle: hauler.angle };
  }

  /** The berth: where a docked hauler sits and which way it points, now or a tick ago. */
  haulerBerth(previous = false): { x: number; y: number; angle: number } {
    const { station } = this;
    const rotation = previous ? station.prevRotation : station.rotation;
    const cx = previous ? station.px : station.x;
    const cy = previous ? station.py : station.y;
    return {
      x: cx + HAULER_BERTH_X * Math.cos(rotation),
      y: cy + HAULER_BERTH_X * Math.sin(rotation),
      angle: rotation + Math.PI / 2,
    };
  }

  /** Where a hauler stops before sliding into its berth: straight out from it. */
  haulerStandoff(previous = false): { x: number; y: number } {
    const { station } = this;
    const rotation = previous ? station.prevRotation : station.rotation;
    const cx = previous ? station.px : station.x;
    const cy = previous ? station.py : station.y;
    const out = HAULER_BERTH_X - HAULER_STANDOFF;
    return { x: cx + out * Math.cos(rotation), y: cy + out * Math.sin(rotation) };
  }

  /**
   * The point to steer for on the way to a goal: the goal itself, or if the straight line
   * would pass through the station, a point beside the station on the near side.
   */
  private haulerWaypoint(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number; detour: boolean } {
    const { station } = this;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((station.x - fromX) * dx + (station.y - fromY) * dy) / length2));
    const cx = fromX + dx * t;
    const cy = fromY + dy * t;
    if (Math.hypot(cx - station.x, cy - station.y) >= HAULER_CLEARANCE) return { x: toX, y: toY, detour: false };
    // Go around on the side the line already passes, or the hauler's own side if it's dead on.
    let ox = cx - station.x;
    let oy = cy - station.y;
    if (Math.hypot(ox, oy) < 1) {
      ox = -dy;
      oy = dx;
    }
    const length = Math.hypot(ox, oy) || 1;
    const reach = HAULER_CLEARANCE * 1.6;
    return { x: station.x + (ox / length) * reach, y: station.y + (oy / length) * reach, detour: true };
  }

  /** The way out and in for haulers: from the station, away from the field. */
  private haulerLane(): { x: number; y: number } {
    const dx = this.station.x - this.field.x;
    const dy = this.station.y - this.field.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  /**
   * Rough seconds until a hauler is at the berth: 0 while one is there, null if none is coming.
   * It brakes all the way in, so the time left follows from the distance left.
   */
  haulerEta(): number | null {
    const { hauler, tuning } = this;
    const inbound = (distance: number) => Math.sqrt((2 * distance) / HAULER_BRAKE) + HAULER_DOCK_SECONDS;
    const fromLaunch = tuning.haulerInterval + inbound(HAULER_APPROACH);
    if (!hauler) return tuning.haulers ? this.haulerTimer + inbound(HAULER_APPROACH) : null;
    switch (hauler.stage) {
      case "arriving": {
        const standoff = this.haulerStandoff();
        return inbound(Math.hypot(standoff.x - hauler.x, standoff.y - hauler.y));
      }
      case "docking":
        return Math.max(0, HAULER_DOCK_SECONDS - hauler.time);
      case "loading":
        return 0;
      default: {
        if (!tuning.haulers) return null;
        // The next one only sets out its interval after this one is out of sight.
        const left = Math.max(0, HAULER_GONE - Math.hypot(hauler.x - this.station.x, hauler.y - this.station.y));
        const speed = Math.hypot(hauler.vx, hauler.vy);
        return (Math.sqrt(speed * speed + 2 * HAULER_LEAVE_ACCEL * left) - speed) / HAULER_LEAVE_ACCEL + fromLaunch;
      }
    }
  }

  /**
   * A hauler sets out on a schedule. It comes in from beyond the station, braking all the
   * way, then matches the station's turn and locks on. It loads ore above what the station
   * keeps back and pays for it, then unlocks, pushes clear, turns away from the field and
   * leaves slowly.
   */
  private moveHauler(dt: number): void {
    const { tuning } = this;
    if (!this.hauler) {
      if (!tuning.haulers) {
        // With no haulers running, nothing would ever bring them.
        this.deliverBlueprints();
        return;
      }
      this.haulerTimer -= dt;
      if (this.haulerTimer > 0) return;
      this.haulerTimer = tuning.haulerInterval;
      const berth = this.haulerBerth();
      const lane = this.haulerLane();
      const x = berth.x + lane.x * HAULER_APPROACH;
      const y = berth.y + lane.y * HAULER_APPROACH;
      const speed = Math.min(HAULER_MAX_SPEED, Math.sqrt(2 * HAULER_BRAKE * HAULER_APPROACH));
      const angle = Math.atan2(-lane.y, -lane.x);
      this.hauler = {
        stage: "arriving",
        time: 0,
        x,
        y,
        px: x,
        py: y,
        vx: (this.station.x - this.station.px) / dt - lane.x * speed,
        vy: (this.station.y - this.station.py) / dt - lane.y * speed,
        angle,
        prevAngle: angle,
        dockOffset: { x: 0, y: 0, angle: 0 },
        thrust: { forward: 0, side: 0, turn: 0 },
        cargo: 0,
        parts: tuning.haulerPartsLoad,
        earned: 0,
        idle: 0,
        loadTimer: 0,
      };
      return;
    }
    const hauler = this.hauler;
    hauler.px = hauler.x;
    hauler.py = hauler.y;
    hauler.prevAngle = hauler.angle;
    hauler.time += dt;
    hauler.thrust = { forward: 0, side: 0, turn: 0 };
    const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
    const berth = this.haulerBerth();

    switch (hauler.stage) {
      case "arriving": {
        // Flies its own course to a stop just outside its berth: the station's carrying doesn't touch it.
        const standoff = this.haulerStandoff();
        const standoffBefore = this.haulerStandoff(true);
        const goalVx = (standoff.x - standoffBefore.x) / dt;
        const goalVy = (standoff.y - standoffBefore.y) / dt;
        const goal = this.haulerWaypoint(hauler.x, hauler.y, standoff.x, standoff.y);
        const dx = goal.x - hauler.x;
        const dy = goal.y - hauler.y;
        const distance = Math.hypot(dx, dy) || 1;
        const relVx = hauler.vx - goalVx;
        const relVy = hauler.vy - goalVy;
        const braking = Math.sqrt(2 * HAULER_BRAKE * distance);
        const wanted = Math.min(HAULER_MAX_SPEED, goal.detour ? Math.max(HAULER_DETOUR_SPEED, braking) : braking);
        let ax = ((dx / distance) * wanted - relVx) / dt;
        let ay = ((dy / distance) * wanted - relVy) / dt;
        const push = Math.hypot(ax, ay);
        if (push > HAULER_MAX_ACCEL) {
          ax *= HAULER_MAX_ACCEL / push;
          ay *= HAULER_MAX_ACCEL / push;
        }
        hauler.vx += ax * dt;
        hauler.vy += ay * dt;
        hauler.x += hauler.vx * dt;
        hauler.y += hauler.vy * dt;
        this.recordHaulerThrust(hauler, ax, ay);
        const slow = Math.hypot(relVx, relVy) < HAULER_DOCK_SPEED;
        const there = !goal.detour && distance < HAULER_DOCK_DISTANCE;
        if ((there && slow) || hauler.time > HAULER_ARRIVAL_LIMIT) {
          this.startDocking(hauler, berth);
        }
        return;
      }
      case "docking": {
        // Rotation and side thrusters ease it onto the berth while matching the station's turn.
        const share = Math.min(1, hauler.time / HAULER_DOCK_SECONDS);
        const left = 1 - share * share * (3 - 2 * share);
        const rotation = this.station.rotation;
        const ox = hauler.dockOffset.x * left;
        const oy = hauler.dockOffset.y * left;
        hauler.x = berth.x + ox * Math.cos(rotation) - oy * Math.sin(rotation);
        hauler.y = berth.y + ox * Math.sin(rotation) + oy * Math.cos(rotation);
        hauler.angle = berth.angle + hauler.dockOffset.angle * left;
        hauler.vx = (hauler.x - hauler.px) / dt;
        hauler.vy = (hauler.y - hauler.py) / dt;
        if (share < 1) {
          hauler.thrust.side = -Math.sign(hauler.dockOffset.x) || 0;
          hauler.thrust.turn = -Math.sign(hauler.dockOffset.angle) || 0;
          return;
        }
        hauler.stage = "loading";
        hauler.time = 0;
        if (tuning.chatter) this.chatter.haulerBerthed(this);
        this.deliverBlueprints();
        return;
      }
      case "loading": {
        hauler.x = berth.x;
        hauler.y = berth.y;
        hauler.angle = berth.angle;
        hauler.vx = (hauler.x - hauler.px) / dt;
        hauler.vy = (hauler.y - hauler.py) / dt;
        const account = this.stationAccount;
        const canLoad = () => hauler.cargo < tuning.haulerCapacity && this.stationOre >= 1;
        // This visit's ore always pays for this visit's parts, even for a station in debt.
        const canUnload = () =>
          hauler.parts >= 1 &&
          tuning.stationPartsTarget - this.stationParts >= 1 &&
          (account.credits >= tuning.haulerPartPrice || hauler.earned >= tuning.haulerPartPrice);
        if (!canLoad() && !canUnload()) {
          hauler.idle += dt;
        } else {
          hauler.idle = 0;
          hauler.loadTimer += dt * tuning.haulerLoadRate;
          while (hauler.loadTimer >= 1 && (canLoad() || canUnload())) {
            hauler.loadTimer -= 1;
            if (canLoad()) {
              hauler.cargo++;
              this.stationOre--;
              account.credits += tuning.haulerPrice;
              hauler.earned += tuning.haulerPrice;
            }
            if (canUnload()) {
              hauler.parts--;
              this.stationParts++;
              account.credits -= tuning.haulerPartPrice;
              hauler.earned = Math.max(0, hauler.earned - tuning.haulerPartPrice);
            }
          }
        }
        if ((hauler.cargo >= tuning.haulerCapacity && !canUnload()) || hauler.idle >= HAULER_WAIT_SECONDS) {
          hauler.stage = "undocking";
          hauler.time = 0;
          if (tuning.chatter) this.chatter.haulerLeaving(this, hauler.cargo);
        }
        return;
      }
      case "undocking": {
        // Unlocked: it keeps the motion it had, stops its turn and pushes clear of the station.
        const away = hauler.angle + Math.PI / 2;
        const ax = Math.cos(away) * HAULER_UNDOCK_PUSH;
        const ay = Math.sin(away) * HAULER_UNDOCK_PUSH;
        hauler.vx += ax * dt;
        hauler.vy += ay * dt;
        hauler.x += hauler.vx * dt;
        hauler.y += hauler.vy * dt;
        hauler.thrust.side = 1;
        if (hauler.time >= HAULER_UNDOCK_SECONDS) {
          hauler.stage = "leaving";
          hauler.time = 0;
        }
        return;
      }
      case "leaving": {
        // Turns toward open space, away from the field and around the station, and only then accelerates.
        const lane = this.haulerLane();
        const far = { x: this.station.x + lane.x * HAULER_GONE * 2, y: this.station.y + lane.y * HAULER_GONE * 2 };
        const goal = this.haulerWaypoint(hauler.x, hauler.y, far.x, far.y);
        const want = Math.atan2(goal.y - hauler.y, goal.x - hauler.x);
        const off = wrap(want - hauler.angle);
        const turn = Math.max(-HAULER_TURN_RATE * dt, Math.min(HAULER_TURN_RATE * dt, off));
        hauler.angle += turn;
        if (Math.abs(off) > 0.01) hauler.thrust.turn = Math.sign(off);
        if (Math.abs(off) < 0.35) {
          const ax = Math.cos(hauler.angle) * HAULER_LEAVE_ACCEL;
          const ay = Math.sin(hauler.angle) * HAULER_LEAVE_ACCEL;
          hauler.vx += ax * dt;
          hauler.vy += ay * dt;
          hauler.thrust.forward = 1;
        }
        hauler.x += hauler.vx * dt;
        hauler.y += hauler.vy * dt;
        if (Math.hypot(hauler.x - this.station.x, hauler.y - this.station.y) > HAULER_GONE) {
          this.hauler = null;
        }
        return;
      }
    }
  }

  private startDocking(hauler: Hauler, berth: { x: number; y: number; angle: number }): void {
    const rotation = this.station.rotation;
    const dx = hauler.x - berth.x;
    const dy = hauler.y - berth.y;
    hauler.dockOffset = {
      x: dx * Math.cos(rotation) + dy * Math.sin(rotation),
      y: -dx * Math.sin(rotation) + dy * Math.cos(rotation),
      angle: Math.atan2(Math.sin(hauler.angle - berth.angle), Math.cos(hauler.angle - berth.angle)),
    };
    hauler.stage = "docking";
    hauler.time = 0;
  }

  /** Which way its thrusters push, in its own axes, for drawing the flames. */
  private recordHaulerThrust(hauler: Hauler, ax: number, ay: number): void {
    const cos = Math.cos(hauler.angle);
    const sin = Math.sin(hauler.angle);
    const forward = ax * cos + ay * sin;
    const side = -ax * sin + ay * cos;
    hauler.thrust.forward = Math.abs(forward) > 0.3 ? Math.sign(forward) : 0;
    hauler.thrust.side = Math.abs(side) > 0.3 ? Math.sign(side) : 0;
  }

  /** Whether the player picks up a radio line: anything in range, and maydays and station news from anywhere. */
  hears(line: { x: number; y: number; mayday: boolean; broadcast?: boolean }): boolean {
    if (line.mayday || line.broadcast) return true;
    return Math.hypot(line.x - this.ship.x, line.y - this.ship.y) <= this.tuning.chatterRange;
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

  /**
   * Sends the player's ship to a world position, if it has the part. With a velocity it
   * arrives moving at that much on top of its velocity now. Returns whether it did.
   */
  orderMove(x: number, y: number, vx = 0, vy = 0): boolean {
    if (!this.ship.parts.has("clickMove")) return false;
    this.clickPilot.moveTo(this, x, y, vx, vy, this.tuning.dragAbsolute);
    return true;
  }

  /** Shifts the ship to a world position and leaves it moving just as it is now. Returns whether it did. */
  orderTranslate(x: number, y: number): boolean {
    if (!this.ship.parts.has("clickMove")) return false;
    this.clickPilot.moveTo(this, x, y, this.ship.vx, this.ship.vy, true);
    return true;
  }

  /** Adds to the drift of the current move's destination. Returns whether there was one. */
  orderNudge(vx: number, vy: number): boolean {
    return this.clickPilot.nudge(vx, vy);
  }

  /** Holds a facing, during a move's coasts and after it, or turns there if there's no move. */
  orderFace(angle: number): boolean {
    if (!this.ship.parts.has("clickTurn")) return false;
    this.clickPilot.face(this, angle);
    return true;
  }

  /** Cancels the order and coasts, or with no order, stops. Returns whether it did either. */
  orderStop(): boolean {
    if (this.clickPilot.active) {
      this.clickPilot.cancel();
      return true;
    }
    if (!this.ship.parts.has("clickMove")) return false;
    this.clickPilot.stop(this);
    return true;
  }

  private startX(): number {
    return this.field.x - this.tuning.fieldRadius - 200;
  }

  /**
   * Traffic starts at work deep in the field, well out of the player's sight, so the world
   * shows itself bit by bit: first on the radio, then in person.
   */
  private trafficStartX(): number {
    return this.field.x + this.tuning.fieldRadius * this.tuning.trafficStartShare;
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
      frameShare: 1,
      carriedTurn: 0,
      burning: 0,
      ore: 0,
      unloadTimer: 0,
      angle: 0,
      prevAngle: 0,
      spin: 0,
      hull: MAX_HULL,
      cooldown: 0,
      turretAngle: 0,
      prevTurretAngle: 0,
      aim: null,
      firing: new Map(),
      marked: false,
      wanted: false,
      pirateKilledAt: null,
    };
  }

  /** A rebuilt ship starts in the station's dock, where it was rebuilt. A pirate starts at its base. */
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
    // A new ship starts with a clean name.
    ship.marked = false;
    ship.wanted = false;
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

  private blueprintTier(id: BlueprintId): number {
    if (isProject(id)) return 3;
    return id === "drone" ? 2 : PARTS.find((part) => part.id === id)!.tier;
  }

  /** Whether the station's shop can sell this. The first tier never needs a blueprint. */
  unlocked(id: BlueprintId): boolean {
    if (id === "deposit") return this.deposits.some((deposit) => deposit.partsLeft <= 0);
    if (id === "stationGuards" || id === "depositGuards") {
      return this.batteries.some((battery) => battery.id === id && battery.partsLeft <= 0);
    }
    return !this.tuning.stationUnlocks || this.blueprintTier(id) === 0 || this.blueprints.has(id);
  }

  blueprintPrice(id: BlueprintId): number {
    if (id === "deposit") return this.tuning.depositPrice;
    if (id === "stationGuards") return this.tuning.stationGuardPrice;
    if (id === "depositGuards") return this.tuning.depositGuardPrice;
    const price = id === "drone" ? this.tuning.dronePrice : this.partPrice(id);
    return Math.round(price * this.tuning.blueprintScale);
  }

  /** What's still owed on a blueprint. */
  blueprintLeft(id: BlueprintId): number {
    return Math.max(0, this.blueprintPrice(id) - (this.blueprintPaid.get(id) ?? 0));
  }

  /** The blueprints still to get, next first: most paid toward, then by tier, then cheapest. */
  blueprintQueue(): BlueprintId[] {
    if (!this.tuning.stationUnlocks) return [];
    const paid = (id: BlueprintId) => this.blueprintPaid.get(id) ?? 0;
    const ids: BlueprintId[] = [...PARTS.map((part) => part.id), "drone", ...PROJECTS];
    return ids
      .filter((id) => this.canOrder(id))
      .sort(
        (a, b) =>
          paid(b) - paid(a) ||
          this.blueprintTier(a) - this.blueprintTier(b) ||
          this.blueprintPrice(a) - this.blueprintPrice(b),
      );
  }

  /** Whether this can be paid toward now. Turrets for the deposit need a deposit to stand on. */
  private canOrder(id: BlueprintId): boolean {
    if (id === "depositGuards" && !this.unlocked("deposit")) return false;
    return !this.unlocked(id) && !this.blueprintsOrdered.has(id);
  }

  /** Puts the ship owner's credits toward a blueprint, as far as they go. Returns whether any went in. */
  fundBlueprint(ship: Ship, id: BlueprintId): boolean {
    if (!this.canOrder(id) || !this.isDocked(ship)) return false;
    const account = this.accountOf(ship);
    const amount = Math.min(account.credits, this.blueprintLeft(id));
    if (amount <= 0) return false;
    account.credits -= amount;
    this.blueprintPaid.set(id, (this.blueprintPaid.get(id) ?? 0) + amount);
    if (this.blueprintLeft(id) === 0) this.orderBlueprint(id);
    return true;
  }

  private orderBlueprint(id: BlueprintId): void {
    this.blueprintPaid.delete(id);
    this.blueprintsOrdered.add(id);
    if (id === "deposit") this.addDeposit(false, this.tuning.depositParts);
    if (id === "stationGuards") this.addBattery(id, false, this.tuning.stationGuardParts);
    if (id === "depositGuards") this.addBattery(id, false, this.tuning.depositGuardParts);
  }

  /** Everything on order arrives at once, and the shop can stock it from then on. */
  private deliverBlueprints(): void {
    // A project is built here, not brought in.
    const arrived = [...this.blueprintsOrdered].filter((id) => !isProject(id));
    if (arrived.length === 0) return;
    for (const id of arrived) {
      this.blueprintsOrdered.delete(id);
      this.blueprints.add(id);
    }
    if (!this.tuning.chatter) return;
    this.chatter.unlocked(
      this,
      arrived.map((id) => (id === "drone" ? "drones" : PARTS.find((part) => part.id === id)!.label.toLowerCase())),
    );
  }

  /** Whatever the station can spare past its cash buffer finishes paying for the next blueprint. */
  private buyBlueprints(): void {
    const next = this.blueprintQueue()[0];
    if (!next) return;
    const left = this.blueprintLeft(next);
    if (this.stationAccount.credits - this.tuning.stationCashBuffer < left) return;
    this.stationAccount.credits -= left;
    this.orderBlueprint(next);
  }

  private depositSpot(at: Poi, toward: Poi): { x: number; y: number } {
    const dx = toward.x - at.x;
    const dy = toward.y - at.y;
    const distance = Math.hypot(dx, dy) || 1;
    const out = at.reach + this.tuning.depositGap;
    return { x: at.x + (dx / distance) * out, y: at.y + (dy / distance) * out };
  }

  private addDeposit(fromSwitch: boolean, partsLeft: number): Deposit {
    const { field: at, station: toward } = this;
    const { x, y } = this.depositSpot(at, toward);
    const name = "field deposit";
    const deposit: Deposit = { name, at, toward, x, y, px: x, py: y, ore: 0, fromSwitch, partsLeft, partsUsed: 0 };
    this.deposits.push(deposit);
    return deposit;
  }

  /** Keeps each deposit at its spot by its POI, and in step with the testing switch. */
  private moveDeposits(): void {
    if (this.tuning.depositFree && this.deposits.length === 0) this.addDeposit(true, 0);
    if (this.tuning.depositFree) {
      for (const deposit of this.deposits) if (deposit.partsLeft > 0) this.finishDeposit(deposit);
    }
    if (!this.tuning.depositFree) this.deposits = this.deposits.filter((deposit) => !deposit.fromSwitch);
    for (const deposit of this.deposits) {
      deposit.px = deposit.x;
      deposit.py = deposit.y;
      Object.assign(deposit, this.depositSpot(deposit.at, deposit.toward));
    }
  }

  private finishDeposit(deposit: Deposit): void {
    deposit.partsLeft = 0;
    this.blueprintsOrdered.delete("deposit");
    if (this.tuning.chatter) this.chatter.depositBuilt(this);
  }

  private addBattery(id: Battery["id"], fromSwitch: boolean, partsLeft: number): void {
    const host = id === "stationGuards" ? this.station : this.deposits.find((deposit) => deposit.partsLeft <= 0);
    if (!host) return;
    const { stationGuardCount, depositGuardCount } = this.tuning;
    const count = id === "stationGuards" ? stationGuardCount : depositGuardCount;
    const guns: Guard[] = [];
    for (let i = 0; i < count; i++) {
      const controls = { thrust: 0, strafe: 0, turn: 0, fire: false, retro: false, stabilize: false };
      const gun = this.makeShip(host.x, host.y, controls);
      gun.faction = "defender";
      guns.push({ x: host.x, y: host.y, px: host.x, py: host.y, angle: 0, prevAngle: 0, cooldown: 0, gun });
    }
    const battery: Battery = { id, host, guns, fromSwitch, partsLeft, partsUsed: 0 };
    this.batteries.push(battery);
    this.placeGuards(battery);
    for (const guard of guns) {
      guard.px = guard.x;
      guard.py = guard.y;
    }
  }

  /**
   * Floating, and placed by where things are. On a deposit's ring, starting square to the
   * way to the station. For the station, in an arc in front of it, facing the field.
   */
  private placeGuards(battery: Battery): void {
    const { host, guns } = battery;
    const { depositReach, stationGuardArc, stationGuardDistance } = this.tuning;
    const atDeposit = host.name === "field deposit";
    const toward = atDeposit ? host.toward : this.field;
    const facing = Math.atan2(toward.y - host.y, toward.x - host.x);
    const radius = atDeposit ? depositReach : stationGuardDistance;
    const arc = (stationGuardArc * Math.PI) / 180;
    guns.forEach((guard, i) => {
      const angle = atDeposit
        ? facing + Math.PI / 2 + (i * Math.PI * 2) / guns.length
        : facing + (guns.length > 1 ? (i / (guns.length - 1) - 0.5) * arc : 0);
      guard.px = guard.x;
      guard.py = guard.y;
      guard.x = host.x + Math.cos(angle) * radius;
      guard.y = host.y + Math.sin(angle) * radius;
      guard.gun.x = guard.x;
      guard.gun.y = guard.y;
    });
  }

  private syncFreeBattery(id: Battery["id"], free: boolean): void {
    const battery = this.batteries.find((candidate) => candidate.id === id);
    if (free && !battery) this.addBattery(id, true, 0);
    if (free && battery && battery.partsLeft > 0) this.finishBattery(battery);
    if (!free && battery?.fromSwitch) this.batteries = this.batteries.filter((other) => other !== battery);
  }

  /** Keeps the turrets on what they stand on, and in step with the testing switches. */
  private moveGuards(): void {
    this.syncFreeBattery("stationGuards", this.tuning.guardsStationFree);
    this.syncFreeBattery("depositGuards", this.tuning.guardsDepositFree);
    // Turrets go when the deposit under them does.
    this.batteries = this.batteries.filter((battery) => {
      if (battery.host.name !== "field deposit" || this.deposits.includes(battery.host)) return true;
      this.blueprintsOrdered.delete(battery.id);
      return false;
    });
    for (const battery of this.batteries) this.placeGuards(battery);
  }

  private finishBattery(battery: Battery): void {
    battery.partsLeft = 0;
    this.blueprintsOrdered.delete(battery.id);
    if (this.tuning.chatter) this.chatter.guardsBuilt(this, battery.id === "stationGuards");
  }

  /** Whether a spot is inside the reach of any finished turrets. */
  inGuardRange(x: number, y: number): boolean {
    const { guardRange } = this.tuning;
    return this.batteries.some(
      ({ guns, partsLeft }) => partsLeft <= 0 && guns.some((guard) => Math.hypot(guard.x - x, guard.y - y) < guardRange),
    );
  }

  /** Each finished gun turns toward the nearest pirate in reach that it can see, and fires once lined up. */
  private fireGuards(dt: number): void {
    const { guardRange, guardShotsPerSecond, guardTurn, shotSpeed } = this.tuning;
    const pirates = this.fighters
      .map((pilot) => pilot.ship)
      .filter((ship) => ship.faction === "pirate" && !this.isHome(ship));
    for (const battery of this.batteries) {
      if (battery.partsLeft > 0) continue;
      for (const guard of battery.guns) {
        guard.cooldown = Math.max(0, guard.cooldown - dt);
        guard.prevAngle = guard.angle;
        let target: Ship | null = null;
        let nearest = Infinity;
        for (const pirate of pirates) {
          const distance = Math.hypot(pirate.x - guard.x, pirate.y - guard.y);
          if (distance < guardRange && distance < nearest && this.clearSight(guard.x, guard.y, pirate.x, pirate.y)) {
            nearest = distance;
            target = pirate;
          }
        }
        if (!target) continue;
        const flight = nearest / shotSpeed;
        const aim = Math.atan2(target.y + target.vy * flight - guard.y, target.x + target.vx * flight - guard.x);
        const off = Math.atan2(Math.sin(aim - guard.angle), Math.cos(aim - guard.angle));
        const turn = guardTurn * dt;
        guard.angle += Math.max(-turn, Math.min(turn, off));
        const lined = Math.abs(off) < Math.atan2(SHIP_RADIUS * 2, nearest);
        if (lined && guard.cooldown <= 0 && guardShotsPerSecond > 0) {
          guard.cooldown = 1 / guardShotsPerSecond;
          this.fireGuard(guard, guardRange / shotSpeed);
        }
      }
    }
  }

  private fireGuard(guard: Guard, life: number): void {
    const { shotSpeed } = this.tuning;
    const cos = Math.cos(guard.angle);
    const sin = Math.sin(guard.angle);
    const x = guard.x + cos * GUARD_BARREL;
    const y = guard.y + sin * GUARD_BARREL;
    this.shots.push({
      x,
      y,
      px: x,
      py: y,
      vx: cos * shotSpeed,
      vy: sin * shotSpeed,
      life,
      precise: false,
      from: guard.gun,
      guard: true,
    });
    this.events.push({ type: "shot", x, y });
  }

  /** Funded projects are built from whatever parts the station can spare past its reserve. */
  private buildProjects(dt: number): void {
    const { depositBuildRate, stationReserveParts } = this.tuning;
    for (const project of [...this.deposits, ...this.batteries]) {
      if (project.partsLeft <= 0) continue;
      const spare = this.stationParts - stationReserveParts;
      const used = Math.min(depositBuildRate * dt, spare, project.partsLeft);
      if (used <= 0) continue;
      this.stationParts -= used;
      project.partsLeft -= used;
      project.partsUsed += used;
      if (project.partsLeft > 1e-9) continue;
      if ("guns" in project) this.finishBattery(project);
      else this.finishDeposit(project);
    }
  }

  /** The open deposit a ship is close enough to trade with, and which carries it, or null. */
  depositAt(body: Body = this.ship): Deposit | null {
    const { depositReach } = this.tuning;
    return (
      this.deposits.find(
        (deposit) => deposit.partsLeft <= 0 && Math.hypot(deposit.x - body.x, deposit.y - body.y) < depositReach,
      ) ?? null
    );
  }

  /** The nearest deposit with room that's closer than the dock, for a ship with ore to get rid of. */
  depositFor(ship: Ship): Deposit | null {
    const dock = this.dockPoint();
    let best = Math.hypot(dock.x - ship.x, dock.y - ship.y);
    let found: Deposit | null = null;
    for (const deposit of this.deposits) {
      const distance = Math.hypot(deposit.x - ship.x, deposit.y - ship.y);
      if (deposit.partsLeft <= 0 && deposit.ore < this.tuning.depositCapacity && distance < best) {
        best = distance;
        found = deposit;
      }
    }
    return found;
  }

  /** How much ore this ship could sell into the deposit right now. */
  depositSellable(ship: Ship, deposit: Deposit): number {
    if (this.depositAt(ship) !== deposit) return 0;
    return Math.max(0, Math.min(ship.ore, this.tuning.depositCapacity - deposit.ore));
  }

  /** How much cargo a ship has room for: what it starts with plus its bays. */
  cargoSpace(ship: Ship): number {
    const { playerCargo, droneCargo } = this.tuning;
    let space = ship === this.ship ? playerCargo : droneCargo;
    for (const part of PARTS) if (part.cargo && ship.parts.has(part.id)) space += part.cargo;
    return space;
  }

  /** The load an AI ship waits for before heading in to deliver. */
  deliveryLoad(ship: Ship): number {
    return Math.max(1, Math.ceil(this.cargoSpace(ship) * this.tuning.deliverShare));
  }

  /** How much ore this ship could buy from the deposit right now. */
  depositBuyable(ship: Ship, deposit: Deposit): number {
    if (this.depositAt(ship) !== deposit) return 0;
    const { depositSells } = this.tuning;
    const affordable = depositSells > 0 ? Math.floor(this.accountOf(ship).credits / depositSells) : Infinity;
    return Math.max(0, Math.min(deposit.ore, affordable, this.cargoSpace(ship) - ship.ore));
  }

  /** Sells all the ore the deposit has room for. The station pays. Returns how much went in. */
  sellToDeposit(ship: Ship, deposit: Deposit): number {
    const amount = this.depositSellable(ship, deposit);
    if (amount <= 0) return 0;
    const credits = amount * this.tuning.depositPays;
    ship.ore -= amount;
    deposit.ore += amount;
    this.accountOf(ship).credits += credits;
    this.stationAccount.credits -= credits;
    ship.earned += credits;
    if (ship.ore === 0) ship.trips++;
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    return amount;
  }

  /** Buys all the ore the ship can pay for. The station gets the money. Returns how much came out. */
  buyFromDeposit(ship: Ship, deposit: Deposit): number {
    const amount = this.depositBuyable(ship, deposit);
    if (amount <= 0) return 0;
    const credits = amount * this.tuning.depositSells;
    deposit.ore -= amount;
    ship.ore += amount;
    this.accountOf(ship).credits -= credits;
    this.stationAccount.credits += credits;
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    return amount;
  }

  /** The parts this ship would buy next, in order, if it could afford them and the shop had them. */
  wishlistFor(ship: Ship): PartId[] {
    return TRAFFIC_BUY_ORDER[ship.model].filter((id) => !ship.parts.has(id));
  }

  /** Parts are only sold in the dock. Returns whether the sale went through. */
  buyPart(ship: Ship, id: PartId): boolean {
    const price = this.partPrice(id);
    const part = PARTS.find((candidate) => candidate.id === id)!;
    if (!partFits(part, ship.model) || !this.unlocked(id)) return false;
    const account = this.accountOf(ship);
    if (!this.isDocked(ship) || ship.parts.has(id) || account.credits < price) return false;
    if (!this.hasPartsFor(price)) return false;
    this.chargeForService(account, price);
    ship.parts.add(id);
    if (id === "retro" && ship === this.ship) this.tuning.retro = true;
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    if (ship !== this.ship && this.tuning.chatter) this.chatter.bought(this, ship, part.label.toLowerCase());
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
    if (this.drones.length >= tuning.droneLimit || !this.hasPartsFor(tuning.dronePrice)) return null;
    if (!this.unlocked("drone")) return null;
    this.chargeForService(buyer, tuning.dronePrice);
    const dock = this.dockPoint();
    this.events.push({ type: "sale", x: dock.x, y: dock.y });
    const drone = this.addDrone(dock.x, dock.y);
    // The player's drones work for the player, and buy upgrades from what it can spare.
    if (buyer === this.ship) {
      drone.ship.owner = buyer;
      drone.buys = "upgrades";
    }
    return drone;
  }

  /** The stock a service worth this many credits uses up: the station's parts, or a pirate base's ore. */
  stockFor(credits: number): number {
    const { serviceCreditsPerPart } = this.tuning;
    return serviceCreditsPerPart > 0 ? credits / serviceCreditsPerPart : 0;
  }

  hasPartsFor(credits: number): boolean {
    return this.stationParts >= this.stockFor(credits);
  }

  /** The buyer pays the station, and the service comes out of its parts, which stop at empty. */
  private chargeForService(buyer: { credits: number }, credits: number): void {
    buyer.credits -= credits;
    this.stationAccount.credits += credits;
    this.stationParts = Math.max(0, this.stationParts - this.stockFor(credits));
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
    this.clock += dt;
    this.discover();
    if (this.distress) {
      this.distress.age += dt;
      if (this.distress.age > DISTRESS_SECONDS) this.distress = null;
    }
    this.clickPilot.update(this);
    const pilots = this.pilots;
    for (const pilot of pilots) pilot.update(this);
    this.movePois(dt);
    this.moveDeposits();
    this.moveGuards();
    this.carryBodies(dt);
    this.driftInRocks(dt);
    this.moveRocks(dt);
    this.pullOre(this.ship, dt);
    for (const pilot of pilots) this.pullOre(pilot.ship, dt);
    this.bodySpots = this.bodies.map((body) => ({ body, ...bodyAt(body, this.clock) }));
    this.pullTowardBodies(dt);
    this.moveOres(dt);
    this.moveShip(this.ship, dt);
    for (const pilot of pilots) this.moveShip(pilot.ship, dt);
    this.touchBodies(this.ship, dt);
    for (const pilot of pilots) this.touchBodies(pilot.ship, dt);
    this.burnOreOnBodies();
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
    this.fireGuards(dt);
    this.spendStationParts();
    this.buyBlueprints();
    this.buildProjects(dt);
    this.spendPirateCredits();
    this.moveHauler(dt);
    this.moveBlackMarket(dt);
    if (this.tuning.chatter) this.chatter.update(this, dt);
  }

  /** Each POI follows a fixed circle around its parent, or the system's center. */
  private movePois(dt: number): void {
    const { tuning, field, station } = this;
    this.movePoi(field, tuning.fieldOrbitPeriod, tuning.fieldRotationPeriod, dt);
    this.movePoi(station, tuning.orbitPeriod, tuning.stationRotationPeriod, dt);
    if (this.pirateBase) this.movePoi(this.pirateBase, tuning.pirateOrbitPeriod, tuning.pirateRotationPeriod, dt);
    for (const { spec, poi } of this.extraFields) {
      poi.px = poi.x;
      poi.py = poi.y;
      poi.prevRotation = poi.rotation;
      const at = orbitsAt(spec.orbits, this.clock);
      poi.x = at.x;
      poi.y = at.y;
      poi.turn = orbitRate(spec.rotationPeriod) * dt;
      poi.rotation += poi.turn;
    }
  }

  private movePoi(poi: Poi, orbitPeriod: number, rotationPeriod: number, dt: number): void {
    poi.px = poi.x;
    poi.py = poi.y;
    poi.prevRotation = poi.rotation;
    // A new period (a tuning change, or a save from before phases) carries on from where it
    // was a tick ago at the new pace, rather than jumping to where the new pace would put it.
    if (poi.orbitPeriod !== orbitPeriod || !Number.isFinite(poi.orbitPhase)) {
      poi.orbitPhase = poi.orbitAngle - orbitRate(orbitPeriod) * (this.clock - dt);
      poi.orbitPeriod = orbitPeriod;
    }
    poi.orbitAngle = poi.orbitPhase + orbitRate(orbitPeriod) * this.clock;
    poi.turn = orbitRate(rotationPeriod) * dt;
    poi.rotation += poi.turn;
    poi.x = (poi.parent?.x ?? 0) + Math.cos(poi.orbitAngle) * poi.orbitRadius;
    poi.y = (poi.parent?.y ?? 0) + Math.sin(poi.orbitAngle) * poi.orbitRadius;
  }

  /**
   * Where a POI's centre will be at a given time on the clock (see `now`), if no tuning
   * changes before then. Lets a pilot aim at where a place will be on arrival.
   */
  poiAt(poi: Poi, time: number): { x: number; y: number } {
    if (poi.orbits) {
      const { x, y } = orbitsAt(poi.orbits, time);
      return { x, y };
    }
    const parent = poi.parent ? this.poiAt(poi.parent, time) : { x: 0, y: 0 };
    const angle = poi.orbitPhase + orbitRate(poi.orbitPeriod) * time;
    return { x: parent.x + Math.cos(angle) * poi.orbitRadius, y: parent.y + Math.sin(angle) * poi.orbitRadius };
  }

  /** Each POI's orbit angle at clock 0. */
  orbitPhases(): Partial<Record<Poi["name"], number>> {
    const { field, station, pirateBase } = this;
    return Object.fromEntries((pirateBase ? [field, station, pirateBase] : [field, station]).map((poi) => [poi.name, poi.orbitPhase]));
  }

  /**
   * Moves the POIs to where the tuning now says, for a layout changed from outside the game.
   * Everything comes along: what's at the station or pirate base moves with that, and the
   * rest of the scene with the field, so nobody is left behind in empty space. A POI given
   * a phase goes exactly there. Without one it carries on from the angle it's at.
   */
  applyLayout(phases: Partial<Record<Poi["name"], number>> = {}, fields?: FieldSpec[]): void {
    const { field, station, pirateBase, tuning, clock } = this;
    const stations = pirateBase ? [station, pirateBase] : [station];
    const before = new Map(this.pois.map((poi) => [poi, { x: poi.x, y: poi.y }]));
    // Each body goes with the field it was in, by the fields as they were.
    const fieldsBefore = this.rockFields();
    const added: ExtraField[] = [];
    if (fields) {
      const kept = new Map(this.extraFields.map((extra) => [extra.spec.id, extra]));
      const next = fields.map((spec) => {
        const old = kept.get(spec.id);
        const extra = old ?? { spec, poi: this.makePoi("field", null, 0, 0, 0, spec.radius), inflowTimer: 1 };
        extra.spec = spec;
        this.fitExtraField(extra);
        if (!old) added.push(extra);
        return extra;
      });
      // A field that's gone takes its rocks with it.
      const gone = this.extraFields.filter((extra) => !next.includes(extra));
      if (gone.length > 0) {
        this.rocks = this.rocks.filter((rock) => !gone.some(({ poi, spec }) => Math.hypot(rock.x - poi.x, rock.y - poi.y) < spec.radius * 1.5));
      }
      this.extraFields = next;
    }
    const place = (poi: Poi, orbitRadius: number, orbitPeriod: number) => {
      const rate = orbitRate(orbitPeriod);
      poi.orbitRadius = orbitRadius;
      poi.orbitPeriod = orbitPeriod;
      poi.orbitPhase = phases[poi.name] ?? poi.orbitAngle - rate * clock;
      poi.orbitAngle = poi.orbitPhase + rate * clock;
      poi.x = poi.px = (poi.parent?.x ?? 0) + Math.cos(poi.orbitAngle) * orbitRadius;
      poi.y = poi.py = (poi.parent?.y ?? 0) + Math.sin(poi.orbitAngle) * orbitRadius;
    };
    field.reach = tuning.fieldRadius;
    place(field, tuning.fieldOrbitRadius, tuning.fieldOrbitPeriod);
    place(station, tuning.fieldRadius + tuning.stationDistance, tuning.orbitPeriod);
    if (pirateBase) place(pirateBase, tuning.fieldRadius + tuning.pirateBaseDistance, tuning.pirateOrbitPeriod);

    const moved = (poi: Poi) => {
      const was = before.get(poi);
      // Gone, or new: nothing to follow.
      const removed = poi.orbits !== undefined && !this.extraFields.some((extra) => extra.poi === poi);
      if (!was || removed) return { x: 0, y: 0 };
      return { x: poi.x - was.x, y: poi.y - was.y };
    };
    const shift = (thing: { x: number; y: number; px: number; py: number }, by: { x: number; y: number }) => {
      thing.x += by.x;
      thing.y += by.y;
      thing.px += by.x;
      thing.py += by.y;
    };
    const bodies = [
      this.ship,
      ...this.pilots.map((pilot) => pilot.ship),
      ...this.rocks,
      ...this.ores,
      ...this.shots,
      ...(this.clickPilot.spot ? [this.clickPilot.spot] : []),
    ];
    for (const body of bodies) {
      const at = stations.find((poi) => {
        const was = before.get(poi)!;
        return Math.hypot(body.x - was.x, body.y - was.y) < poi.reach + LAYOUT_NEIGHBOURHOOD;
      });
      shift(body, at ? moved(at) : moved(fieldsBefore[this.fieldAtBefore(fieldsBefore, before, body)].poi));
    }
    if (this.hauler) shift(this.hauler, moved(station));
    if (this.blackMarket) shift(this.blackMarket, moved(pirateBase ?? field));
    // These follow their POIs, and a jump in one of them would carry whatever is inside it.
    this.moveDeposits();
    for (const deposit of this.deposits) {
      deposit.px = deposit.x;
      deposit.py = deposit.y;
    }
    this.moveGuards();
    for (const extra of added) this.layRocks(extra.poi, extra.spec.radius, extra.spec.rocks, extra.spec.rockDrift);
  }

  /** Which field a body was in, by where the fields were before a layout moved them. */
  private fieldAtBefore(fields: { poi: Poi; radius: number }[], before: Map<Poi, { x: number; y: number }>, body: { x: number; y: number }): number {
    if (fields.length === 1) return 0;
    let best = 0;
    let bestDistance = Infinity;
    fields.forEach(({ poi, radius }, i) => {
      const was = before.get(poi) ?? poi;
      const distance = Math.hypot(body.x - was.x, body.y - was.y) - radius;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    return best;
  }

  private get pois(): Poi[] {
    const { field, station, pirateBase } = this;
    const own = pirateBase ? [field, station, pirateBase] : [field, station];
    return [...own, ...this.extraFields.map((extra) => extra.poi)];
  }

  /** Distance from a POI's edge, as of the last tick. Negative inside it. */
  private edgeDistance(poi: Poi, x: number, y: number): number {
    return Math.hypot(x - poi.px, y - poi.py) - poi.reach;
  }

  /** Nearest by distance from each POI's edge, so a large field claims more space. */
  nearestPoi(x: number, y: number): Poi {
    let nearest = this.field;
    let best = Infinity;
    for (const poi of this.pois) {
      const distance = this.edgeDistance(poi, x, y);
      if (distance < best) {
        best = distance;
        nearest = poi;
      }
    }
    return nearest;
  }

  /**
   * How much each POI carries a body at a spot, from 0 to 1, in the same order as `pois`.
   * Within the full range of a POI's edge, the nearest POI carries it all. Further out,
   * each POI's share falls off linearly to nothing at the outer range, and the shares mix.
   * Shares that add up to more than 1 are scaled down to 1 in total.
   */
  carryShares(x: number, y: number): number[] {
    const { pois } = this;
    const ranges = pois.map((poi) => this.carryRange(poi));
    const distances = pois.map((poi) => this.edgeDistance(poi, x, y));
    const nearest = distances.indexOf(Math.min(...distances));
    if (distances[nearest] <= ranges[nearest].full) return pois.map((_, i) => (i === nearest ? 1 : 0));
    const shares = distances.map((distance, i) => {
      const { full, none } = ranges[i];
      return none === Infinity ? 1 : Math.max(0, Math.min(1, (none - distance) / (none - full)));
    });
    const total = shares.reduce((sum, share) => sum + share, 0);
    return total > 1 ? shares.map((share) => share / total) : shares;
  }

  /** How far from its edge a POI carries things fully, and where it stops carrying at all. */
  carryRange(poi: Poi): { full: number; none: number } {
    if (poi.carry) return poi.carry;
    const { tuning } = this;
    const [full, none] =
      poi.name === "field"
        ? [tuning.fieldCarryFull, tuning.fieldCarryNone]
        : poi.name === "station"
          ? [tuning.stationCarryFull, tuning.stationCarryNone]
          : [tuning.pirateCarryFull, tuning.pirateCarryNone];
    return { full, none: Math.max(full, none) };
  }

  /**
   * Moves everything with the POIs near it, by their shares. Velocities stay relative to
   * what carries them, so crossing from one POI's zone to another keeps relative speed.
   */
  private carryBodies(dt: number): void {
    this.carryShip(this.ship);
    for (const pilot of this.pilots) this.carryShip(pilot.ship);
    for (const rock of this.rocks) {
      const { turn } = this.carry(rock);
      rock.prevAngle = rock.angle;
      rock.angle += turn;
    }
    for (const ore of this.ores) this.carry(ore);
    for (const shot of this.shots) this.carry(shot);
    // An order's destination moves like any loose body at its spot.
    const spot = this.clickPilot.spot;
    if (spot) {
      this.carry(spot);
      spot.x += spot.vx * dt;
      spot.y += spot.vy * dt;
    }
  }

  private carryShip(ship: Ship): void {
    const { poi, share, turn } = this.carry(ship);
    ship.frame = poi;
    ship.frameShare = share;
    ship.carriedTurn = turn;
    ship.prevAngle = ship.angle;
    ship.angle += turn;
  }

  /** Carries a body and says what carried it most, by how much, and how far it turned. */
  private carry(body: Body): { poi: Poi | Deposit; share: number; turn: number } {
    // Inside an open deposit's ring, it carries everything by itself. It doesn't turn.
    const deposit = this.depositAt(body);
    if (deposit) {
      body.px = body.x;
      body.py = body.y;
      body.x += deposit.x - deposit.px;
      body.y += deposit.y - deposit.py;
      return { poi: deposit, share: 1, turn: 0 };
    }
    const { pois } = this;
    const shares = this.carryShares(body.x, body.y);
    let moveX = 0;
    let moveY = 0;
    let turn = 0;
    let poi = this.nearestPoi(body.x, body.y);
    let share = 0;
    for (let i = 0; i < pois.length; i++) {
      const weight = shares[i];
      if (weight === 0) continue;
      const carrier = pois[i];
      const cos = Math.cos(carrier.turn);
      const sin = Math.sin(carrier.turn);
      const dx = body.x - carrier.px;
      const dy = body.y - carrier.py;
      moveX += weight * (carrier.x + dx * cos - dy * sin - body.x);
      moveY += weight * (carrier.y + dx * sin + dy * cos - body.y);
      turn += weight * carrier.turn;
      if (weight > share) {
        share = weight;
        poi = carrier;
      }
    }
    body.px = body.x;
    body.py = body.y;
    body.x += moveX;
    body.y += moveY;
    if (turn !== 0) {
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const { vx, vy } = body;
      body.vx = vx * cos - vy * sin;
      body.vy = vx * sin + vy * cos;
    }
    return { poi, share, turn };
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
  /** Big rocks drift into each field that's short of its rocks. */
  private driftInRocks(dt: number): void {
    const fields = this.rockFields();
    const counts = fields.map(() => 0);
    if (fields.length === 1) counts[0] = this.rocks.length;
    else for (const rock of this.rocks) counts[this.fieldAt(fields, rock.x, rock.y)]++;
    const { tuning } = this;
    this.inflowTimer = this.driftInto(fields[0], tuning.rockInflow, tuning.rockCount, counts[0], this.inflowTimer, dt);
    this.extraFields.forEach((extra, i) => {
      extra.inflowTimer = this.driftInto(fields[i + 1], extra.spec.rockInflow, extra.spec.rocks, counts[i + 1], extra.inflowTimer, dt);
    });
  }

  /** One field's inflow. Returns the timer as it stands after. */
  private driftInto(field: { poi: Poi; radius: number }, perMinute: number, most: number, count: number, timer: number, dt: number): number {
    const { ship } = this;
    if (perMinute <= 0 || count >= most) return timer;
    timer -= (dt * perMinute) / 60;
    if (timer > 0) return timer;

    const distance = field.radius + INFLOW_START_DISTANCE;
    for (let attempt = 0; attempt < 8; attempt++) {
      const dir = this.random() * Math.PI * 2;
      const x = field.poi.x + Math.cos(dir) * distance;
      const y = field.poi.y + Math.sin(dir) * distance;
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
      return timer + 0.75 + this.random() * 0.5;
    }
    return timer;
  }

  private moveRocks(dt: number): void {
    const fields = this.rockFields();
    for (const rock of this.rocks) {
      const { poi, radius } = fields[this.fieldAt(fields, rock.x, rock.y)];
      if (rock.arriving) {
        // The field's pull would speed it up all the way in.
        rock.arriving = Math.hypot(rock.x - poi.x, rock.y - poi.y) > radius;
      } else {
        this.containInField(rock, poi, radius, dt);
      }
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      rock.angle += rock.spin * dt;
    }
  }

  /** Steers loose ore in range toward the ship, so it arrives instead of circling it. */
  private pullOre(ship: Ship, dt: number): void {
    if (!ship.parts.has("tractor") || ship.ore >= this.cargoSpace(ship)) return;
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

  /**
   * Loose ore flies on with nothing pulling it back. Once it's far from every POI and every
   * ship, so nobody could see it or know where it went, it's gone.
   */
  private moveOres(dt: number): void {
    for (const ore of this.ores) {
      ore.x += ore.vx * dt;
      ore.y += ore.vy * dt;
    }
    const forget = this.tuning.oreForgetDistance;
    if (forget === Infinity) return;
    const ships = [this.ship, ...this.pilots.map((pilot) => pilot.ship)];
    this.ores = this.ores.filter(
      (ore) =>
        this.pois.some((poi) => this.edgeDistance(poi, ore.x, ore.y) < forget) ||
        ships.some((ship) => Math.hypot(ship.x - ore.x, ship.y - ore.y) < forget),
    );
  }

  /** Gentle pull so drifting rocks stay in the field during long sessions. */
  private containInField(body: Body, field: Poi, edge: number, dt: number): void {
    const dx = body.x - field.x;
    const dy = body.y - field.y;
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
    const usesSwitch = ship === this.ship && !this.clickPilot.flying;
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
    this.turnTurret(ship, dt);
  }

  /** The turret turns toward its aim at a fixed speed relative to the ship, so the ship's own turning adds or takes away. */
  private turnTurret(ship: Ship, dt: number): void {
    ship.prevTurretAngle = ship.turretAngle;
    if (!ship.parts.has("turret")) {
      ship.turretAngle = 0;
      return;
    }
    const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
    const want = ship.aim ? wrap(Math.atan2(ship.aim.y - ship.y, ship.aim.x - ship.x) - ship.angle) : 0;
    const step = ((this.tuning.turretTurnSpeed * Math.PI) / 180) * dt;
    const change = Math.max(-step, Math.min(step, wrap(want - ship.turretAngle)));
    ship.turretAngle = wrap(ship.turretAngle + change);
  }

  /**
   * The velocity change one pair of opposed thrusters makes this tick. The command's size
   * is the throttle, so a part of full output gives a part of the change. With no
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
    const full = direction > 0 ? positiveChange : negativeChange;
    let limit = Math.min(1, Math.abs(command)) * full;
    if (direction === 0) {
      if (!assist || Math.abs(velocity) < 1e-6) return 0;
      direction = velocity < 0 ? 1 : -1;
      limit = Math.abs(velocity);
    }
    const thruster = direction > 0 ? positive : negative;
    if (!this.canFire(ship, thruster)) return 0;
    const fullChange = direction > 0 ? positiveChange : negativeChange;
    const change = Math.min(fullChange, limit);
    ship.firing.set(thruster, fullChange > 0 ? change / fullChange : 0);
    return direction * change;
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

  /** Every body's pull, on ships out in the open and on loose ore. Rocks and places keep to their paths. */
  private pullTowardBodies(dt: number): void {
    if (this.bodySpots.length === 0) return;
    const pull = (thing: { x: number; y: number; vx: number; vy: number }) => {
      for (const { body, x, y } of this.bodySpots) {
        const dx = x - thing.x;
        const dy = y - thing.y;
        const distance = Math.hypot(dx, dy);
        const accel = distance > 0 ? pullAt(body, distance) : 0;
        if (accel === 0) continue;
        thing.vx += (dx / distance) * accel * dt;
        thing.vy += (dy / distance) * accel * dt;
      }
    };
    for (const ship of [this.ship, ...this.pilots.map((pilot) => pilot.ship)]) if (!this.isDocked(ship)) pull(ship);
    for (const ore of this.ores) pull(ore);
  }

  /** A ship in a body's air or on its ground: burning, through it, off it with a knock, or wrecked. */
  private touchBodies(ship: Ship, dt: number): void {
    ship.burning = 0;
    if (this.bodySpots.length === 0) return;
    // A ship's speed counts against what carries it, so the ground's must too. What this
    // tick moved it, less its own speed, is how fast it was carried, turning and all.
    const carriedX = (ship.x - ship.px) / dt - ship.vx;
    const carriedY = (ship.y - ship.py) / dt - ship.vy;
    const docked = this.isDocked(ship);
    for (const { body, x, y, vx, vy } of this.bodySpots) {
      const dx = ship.x - x;
      const dy = ship.y - y;
      const distance = Math.hypot(dx, dy);
      const ground = { vx: vx - carriedX, vy: vy - carriedY };
      if (!docked && distance < body.atmosphere) {
        const over = Math.hypot(ship.vx - ground.vx, ship.vy - ground.vy) - body.burnSpeed;
        if (over > 0) {
          ship.burning = Math.max(ship.burning, Math.min(1, over / BURN_GLOW_SPEED));
          const damage = over * this.tuning.burnDamage * dt;
          ship.hull -= damage;
          ship.damageTaken += damage;
          if (ship.hull <= 0) {
            this.wreckShip(ship);
            return;
          }
        }
      }
      const reach = body.radius + SHIP_RADIUS;
      if (body.surface === "none" || distance >= reach) continue;
      if (body.surface === "death") {
        ship.damageTaken += ship.hull;
        ship.hull = 0;
        this.wreckShip(ship);
        return;
      }
      const nx = distance > 0 ? dx / distance : 1;
      const ny = distance > 0 ? dy / distance : 0;
      ship.x = x + nx * (reach + 0.01);
      ship.y = y + ny * (reach + 0.01);
      this.bounceOff(ship, nx, ny, ground, 0);
      if (ship.hull <= 0) return;
    }
  }

  /** Loose ore that reaches solid ground is gone. */
  private burnOreOnBodies(): void {
    const solid = this.bodySpots.filter((spot) => spot.body.surface !== "none");
    if (solid.length === 0) return;
    this.ores = this.ores.filter((ore) => solid.every(({ body, x, y }) => Math.hypot(ore.x - x, ore.y - y) >= body.radius));
  }

  private wreckShip(ship: Ship): void {
    const player = ship === this.ship;
    this.events.push({ type: "wreck", x: ship.x, y: ship.y, player });
    ship.wrecks++;
    this.dropOre(ship);
    const { rebuildCost } = this.tuning;
    const account = this.accountOf(ship);
    // A pirate is rebuilt from its base's money, or it's gone for good.
    if (ship.faction === "pirate") {
      if (this.pirateCredits < rebuildCost) {
        this.removeShip(ship);
        return;
      }
      this.pirateCredits -= rebuildCost;
      ship.upkeep += rebuildCost;
      this.respawn(ship);
      return;
    }
    // A defender is never rebuilt. The station builds a new one when lost traffic calls for it.
    if (ship.faction === "defender") {
      this.removeShip(ship);
      return;
    }
    // Only the player can always rebuild. Anyone else needs the money, and the station the parts.
    if (!player && rebuildCost > 0) {
      if (account.credits < rebuildCost || !this.hasPartsFor(rebuildCost)) {
        this.removeShip(ship);
        return;
      }
    }
    this.chargeForService(account, rebuildCost);
    ship.upkeep += rebuildCost;
    const cleared = ship.marked || ship.wanted;
    this.respawn(ship);
    if (player && this.tuning.chatter) this.chatter.playerRebuilt(rebuildCost, cleared);
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
        amount: 1,
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

  private get pirateShips(): Ship[] {
    return this.fighters.filter((pilot) => pilot.ship.faction === "pirate").map((pilot) => pilot.ship);
  }

  /** The pirate base builds more pirates from money beyond its reserve, up to its cap. */
  private spendPirateCredits(): void {
    const { tuning, pirateBase } = this;
    if (!pirateBase || tuning.defenderPrice <= 0) return;
    if (this.pirateShips.length >= this.pirateCap) return;
    if (this.pirateCredits - tuning.pirateReserve < tuning.defenderPrice) return;
    this.pirateCredits -= tuning.defenderPrice;
    this.addFighter(pirateBase.x, pirateBase.y, "pirate");
  }

  /** The parts a pirate still lacks that would fit it, in the order the base buys them. */
  pirateWishlist(ship: Ship): PartId[] {
    return PIRATE_PARTS.filter((id) => !ship.parts.has(id) && partFits(PARTS.find((part) => part.id === id)!, ship.model));
  }

  /**
   * While the black market is berthed, the base buys parts for the pirates at home, one at
   * a time. Once every pirate has everything and the base is at its cap, it buys a new hull,
   * which raises the cap, up to the most it may have.
   */
  private tradeWithBlackMarket(): void {
    const { tuning } = this;
    const spare = this.pirateCredits - tuning.pirateReserve;
    const pirates = this.pirateShips;
    for (const ship of pirates) {
      if (!this.isHome(ship)) continue;
      const next = this.pirateWishlist(ship)[0];
      if (!next) continue;
      const price = this.partPrice(next);
      if (spare < price) return;
      this.pirateCredits -= price;
      ship.parts.add(next);
      ship.upkeep += price;
      this.events.push({ type: "sale", x: ship.x, y: ship.y });
      return;
    }
    const fitted = pirates.every((ship) => this.pirateWishlist(ship).length === 0);
    if (!fitted || pirates.length < this.pirateCap || this.pirateCap >= tuning.pirateCapMax) return;
    if (spare < tuning.pirateHullPrice) return;
    this.pirateCredits -= tuning.pirateHullPrice;
    this.pirateCap++;
    if (tuning.chatter) this.chatter.blackMarketHull(this);
  }

  /** Where the black market berths at the pirate base, and the way it comes and goes. */
  private blackMarketLane(): { x: number; y: number; dx: number; dy: number } | null {
    const base = this.pirateBase;
    if (!base) return null;
    const away = Math.hypot(base.x - this.station.x, base.y - this.station.y) || 1;
    const dx = (base.x - this.station.x) / away;
    const dy = (base.y - this.station.y) / away;
    return { x: base.x + dx * BLACK_MARKET_BERTH, y: base.y + dy * BLACK_MARKET_BERTH, dx, dy };
  }

  /**
   * The black market comes in along its lane, braking all the way, berths beside the pirate
   * base to trade for a while, then speeds off the way it came. It keeps pace with the base.
   */
  private moveBlackMarket(dt: number): void {
    const { tuning } = this;
    const lane = this.blackMarketLane();
    if (!lane) return;
    let market = this.blackMarket;
    if (!market) {
      if (tuning.blackMarketInterval <= 0) return;
      this.blackMarketTimer -= dt;
      if (this.blackMarketTimer > 0) return;
      this.blackMarketTimer = tuning.blackMarketInterval;
      const x = lane.x + lane.dx * BLACK_MARKET_APPROACH;
      const y = lane.y + lane.dy * BLACK_MARKET_APPROACH;
      market = { stage: "arriving", time: 0, x, y, px: x, py: y, angle: 0, speed: 0, burn: 0, cargo: 0, loadTimer: 0 };
      this.blackMarket = market;
    }
    market.px = market.x;
    market.py = market.y;
    market.time += dt;
    market.burn = 0;
    // Its place along the lane: how far out from the berth.
    let out = (market.x - lane.x) * lane.dx + (market.y - lane.y) * lane.dy;
    if (market.stage === "arriving") {
      // Inward is negative speed. Brakes so it stops right at the berth.
      const most = Math.min(BLACK_MARKET_SPEED, Math.sqrt(2 * BLACK_MARKET_ACCELERATION * Math.max(0, out)));
      const want = -most;
      const change = Math.max(-BLACK_MARKET_ACCELERATION * dt, Math.min(BLACK_MARKET_ACCELERATION * dt, want - market.speed));
      if (Math.abs(change) > 1e-9) market.burn = change > 0 === market.speed < 0 ? -1 : 1;
      market.speed += change;
      out = Math.max(0, out + market.speed * dt);
      if (out <= 0.5) {
        out = 0;
        market.speed = 0;
        market.stage = "berthed";
        market.time = 0;
        if (tuning.chatter) this.chatter.blackMarketArrived(this);
      }
    } else if (market.stage === "berthed") {
      out = 0;
      this.loadBlackMarket(market, dt);
      this.tradeWithBlackMarket();
      if (market.time >= BLACK_MARKET_STAY) {
        market.stage = "leaving";
        market.time = 0;
        if (tuning.chatter) this.chatter.blackMarketLeaving(this, market.cargo);
      }
    } else {
      market.speed = Math.min(BLACK_MARKET_SPEED, market.speed + BLACK_MARKET_ACCELERATION * dt);
      market.burn = market.speed < BLACK_MARKET_SPEED ? 1 : 0;
      out += market.speed * dt;
      if (out > BLACK_MARKET_APPROACH) {
        this.blackMarket = null;
        return;
      }
    }
    // Along the lane from the berth, which moves with the base.
    market.x = lane.x + lane.dx * out;
    market.y = lane.y + lane.dy * out;
    market.angle = Math.atan2(lane.dy, lane.dx) + (market.stage === "leaving" ? 0 : Math.PI);
  }

  /** It buys the base's ore at its own price, paid to the pirates, up to what it holds. */
  private loadBlackMarket(market: BlackMarket, dt: number): void {
    const { tuning } = this;
    market.loadTimer += dt * BLACK_MARKET_LOAD_RATE;
    while (market.loadTimer >= 1) {
      market.loadTimer -= 1;
      if (this.pirateOre < 1 || market.cargo >= tuning.blackMarketCapacity) {
        market.loadTimer = 0;
        return;
      }
      this.pirateOre--;
      market.cargo++;
      this.pirateCredits += tuning.blackMarketPays;
    }
  }

  /**
   * Where traffic leaving the station with an empty hold could buy a full load: an open
   * deposit or the pirate base with enough stock, if it can pay and keep its buffer. It won't
   * go to the pirates while marked, or for a while after they killed it. Nearest first.
   */
  tradeSource(ship: Ship): Deposit | "pirate base" | null {
    const { tuning } = this;
    const load = this.cargoSpace(ship);
    if (load <= 0 || this.accountOf(ship).credits - load * tuning.depositSells < tuning.trafficBuffer) return null;
    let best = Infinity;
    let found: Deposit | "pirate base" | null = null;
    for (const deposit of this.deposits) {
      const distance = Math.hypot(deposit.x - ship.x, deposit.y - ship.y);
      if (deposit.partsLeft <= 0 && deposit.ore >= load && distance < best) {
        best = distance;
        found = deposit;
      }
    }
    const base = this.pirateBase;
    const grudge = ship.pirateKilledAt !== null && this.clock - ship.pirateKilledAt < tuning.pirateGrudgeSeconds;
    if (base && this.pirateOre >= load && !ship.marked && !grudge) {
      if (Math.hypot(base.x - ship.x, base.y - ship.y) < best) found = "pirate base";
    }
    return found;
  }

  /** How much ore the pirate base would sell this ship: only to an empty hold, close by. */
  pirateBaseBuyable(ship: Ship): number {
    const base = this.pirateBase;
    if (!base || ship.faction === "pirate" || ship.ore > 0) return 0;
    if (Math.hypot(ship.x - base.x, ship.y - base.y) > this.tuning.pirateBaseReach) return 0;
    const { depositSells } = this.tuning;
    const affordable = depositSells > 0 ? Math.floor(this.accountOf(ship).credits / depositSells) : Infinity;
    return Math.max(0, Math.min(Math.floor(this.pirateOre), affordable, this.cargoSpace(ship)));
  }

  /** Notes the places the player has reached. */
  private discover(): void {
    const { ship, discovered } = this;
    if (this.isDocked(ship)) discovered.add("dock");
    if (this.depositAt(ship)) discovered.add("deposit");
    if (this.atPirateBase(ship)) discovered.add("seller");
  }

  /** Whether a ship is close enough to the pirate base to trade there. */
  atPirateBase(ship: Ship = this.ship): boolean {
    const base = this.pirateBase;
    return !!base && Math.hypot(ship.x - base.x, ship.y - base.y) <= this.tuning.pirateBaseReach;
  }

  /** Buys a full hold from the pirate base, at the deposit's price. Returns how much. */
  buyFromPirateBase(ship: Ship): number {
    const amount = this.pirateBaseBuyable(ship);
    if (amount <= 0) return 0;
    const credits = amount * this.tuning.depositSells;
    this.pirateOre -= amount;
    ship.ore += amount;
    this.accountOf(ship).credits -= credits;
    this.pirateCredits += credits;
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    return amount;
  }

  /**
   * The station only spends parts beyond its reserve, and only in response to lost traffic:
   * first a defender if it has none, then the lost ship. It saves up for the defender
   * rather than spending on the ship.
   */
  private spendStationParts(): void {
    const { tuning } = this;
    if (this.lostTraffic.length === 0) return;
    const spare = this.stationParts - tuning.stationReserveParts;
    const dock = this.dockPoint();
    const hasDefender = this.fighters.some((pilot) => pilot.ship.faction === "defender");
    if (!hasDefender && tuning.defenderPrice > 0) {
      if (spare < this.stockFor(tuning.defenderPrice)) return;
      this.chargeForService(this.stationAccount, tuning.defenderPrice);
      this.addFighter(dock.x, dock.y, "defender");
      if (this.tuning.chatter) this.chatter.defenderLaunched(this);
    } else {
      if (spare < this.stockFor(tuning.rebuildCost)) return;
      this.chargeForService(this.stationAccount, tuning.rebuildCost);
      this.addTraffic(dock.x, dock.y, this.lostTraffic.shift()!);
      if (this.tuning.chatter) this.chatter.trafficReplaced(this, this.traffic[this.traffic.length - 1].ship);
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
        if (ship === shot.from || (shot.guard && ship.faction !== "pirate")) continue;
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

      if (stationHit && stationHit.t < hitT && !shot.guard) {
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
          this.releaseOre(x, y, hit, shot.from);
        }
        if (hit.hp <= 0) this.breakRock(hit, shot.from, !shot.precise);
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
    if (this.tuning.chatter) this.chatter.shot(this, ship, shot.from);
    this.judgeHit(ship, shot.from);
    const player = ship === this.ship;
    this.events.push({ type: "impact", x: ship.x, y: ship.y, damage, player });
    if (ship.hull <= 0 && shot.from.faction === "pirate") ship.pirateKilledAt = this.clock;
    if (ship.hull <= 0) this.wreckShip(ship);
  }

  /**
   * Anyone hitting anyone gets a response. One hit on a pirate marks the shooter with every
   * pirate. A few hits on anyone else, close enough together, get the shooter reported, and
   * from then on it counts as a pirate to the station. Pirates are outlaws already, and the
   * defender is the law, so neither is judged.
   */
  private judgeHit(victim: Ship, attacker: Ship): void {
    if (attacker === victim || attacker.faction === "pirate") return;
    if (victim.faction === "pirate") {
      if (attacker.marked) return;
      attacker.marked = true;
      if (this.tuning.chatter) this.chatter.marked(this, victim, attacker);
      return;
    }
    if (attacker.faction === "defender" || attacker.wanted) return;
    // The player can't report anyone yet, and a drone doesn't report its owner.
    if (victim === this.ship || victim.owner === attacker) return;
    let grudges = this.grudges.get(victim);
    if (!grudges) {
      grudges = new Map();
      this.grudges.set(victim, grudges);
    }
    const forgotten = this.clock - this.tuning.grudgeFadeSeconds;
    const hits = (grudges.get(attacker) ?? []).filter((at) => at > forgotten);
    hits.push(this.clock);
    grudges.set(attacker, hits);
    if (hits.length < this.tuning.trafficPatience) return;
    grudges.delete(attacker);
    // The defender is the station's own, so its word is enough. Anyone else runs home to tell.
    if (victim.faction === "defender") {
      this.reportWanted(attacker, victim);
      return;
    }
    // With the law right there, there's no need to run home.
    if (this.defenderNear(victim)) {
      this.reportWanted(attacker, victim);
      return;
    }
    const pilot = [...this.traffic, ...this.drones].find((candidate) => candidate.ship === victim);
    if (!pilot) return;
    pilot.report(attacker);
    if (this.tuning.chatter) this.chatter.reporting(this, victim, attacker);
  }

  /** Whether a defender is close enough to `ship` to take a report in person. */
  defenderNear(ship: Ship): boolean {
    const { witnessRange } = this.tuning;
    return this.fighters.some(
      ({ ship: defender }) =>
        defender.faction === "defender" && defender.hull > 0 && Math.hypot(defender.x - ship.x, defender.y - ship.y) < witnessRange,
    );
  }

  /** The station hears that `attacker` went after `victim`: from now on it's wanted. */
  reportWanted(attacker: Ship, victim: Ship): void {
    if (attacker.wanted || attacker.faction === "pirate") return;
    attacker.wanted = true;
    if (this.tuning.chatter) this.chatter.reported(this, attacker, victim);
  }

  /**
   * Whether `attacker` is a danger to `target`. A pirate is to anyone with ore aboard or
   * marked, and traffic treats a wanted ship as one.
   */
  threatens(attacker: Ship, target: Ship): boolean {
    if (attacker === target || attacker.hull <= 0) return false;
    if (attacker.faction === "pirate") return target.faction !== "pirate" && (target.ore > 0 || target.marked);
    return attacker.wanted;
  }

  private fireShots(ship: Ship): void {
    const { tuning } = this;
    if (!ship.controls.fire || ship.cooldown > 0) return;
    const precise = ship.parts.has("gun2");
    const turret = ship.parts.has("turret");
    ship.cooldown = 1 / (precise ? tuning.gun2ShotsPerSecond : tuning.shotsPerSecond);
    const angle = ship.angle + (turret ? ship.turretAngle : 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = ship.x + cos * (SHIP_RADIUS + 4);
    const y = ship.y + sin * (SHIP_RADIUS + 4);
    this.shots.push({
      x,
      y,
      px: x,
      py: y,
      vx: ship.vx + cos * tuning.shotSpeed,
      vy: ship.vy + sin * tuning.shotSpeed,
      life: tuning.shotLife * (turret ? tuning.turretRange : 1),
      precise,
      from: ship,
    });
    this.events.push({ type: "shot", x, y });
  }

  /** A precision hit: ore comes loose where the shot landed and drifts on with the rock. */
  private releaseOre(x: number, y: number, rock: Rock, from: Ship): void {
    this.ores.push({
      x,
      y,
      px: x,
      py: y,
      vx: rock.vx,
      vy: rock.vy,
      kind: Math.floor(this.random() * ORE_KINDS),
      amount: 1,
      from,
    });
  }

  /**
   * Breaks a rock into smaller ones and maybe some ore, marked as freed by `by` if anyone.
   * Pieces and ore drift on with the rock. A break by gun 1 may fling some ore away, worth more.
   */
  breakRock(rock: Rock, by: Ship | null = null, flings = false): void {
    const { tuning } = this;
    this.rocks.splice(this.rocks.indexOf(rock), 1);
    this.events.push({ type: "break", x: rock.x, y: rock.y, radius: rock.radius });

    if (rock.tier > 0) {
      const pieces = 2 + Math.floor(this.random() * 2);
      const spin = this.random();
      for (let i = 0; i < pieces; i++) {
        const dir = (i / pieces) * Math.PI * 2 + spin;
        const kick = tuning.rockBreakSpeed * (0.5 + this.random() * 0.5);
        // Set apart so the pieces just touch, since they don't drift apart by themselves.
        const offset = TIER_RADIUS[rock.tier - 1] / Math.sin(Math.PI / Math.max(pieces, 2));
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
      if (this.random() >= tuning.oreChance) continue;
      const dir = this.random() * Math.PI * 2;
      const flung = flings && this.random() < tuning.flingChance;
      const kick = flung ? 15 + this.random() * 45 : 0;
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
        amount: flung ? tuning.flingOreAmount : 1,
        from: by,
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
    if (ship.faction === "pirate") return this.pirateCredits >= repairCost;
    if (!this.hasPartsFor(repairCost)) return false;
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
      if (ship.faction === "pirate") this.pirateCredits -= tuning.repairCost;
      else this.chargeForService(this.accountOf(ship), tuning.repairCost);
      ship.upkeep += tuning.repairCost;
    }
  }

  private collectOre(ship: Ship): void {
    const reach = SHIP_RADIUS + ORE_RADIUS + PICKUP_MARGIN;
    this.ores = this.ores.filter((ore) => {
      const room = this.cargoSpace(ship) - ship.ore;
      if (room <= 0) return true;
      const segment = sweepCircle(
        ore.px - ship.px,
        ore.py - ship.py,
        ore.x - ore.px - (ship.x - ship.px),
        ore.y - ore.py - (ship.y - ship.py),
        reach,
      );
      if (segment === null) return true;
      const taken = Math.min(ore.amount, room);
      ship.ore += taken;
      if (taken < ore.amount) {
        // What doesn't fit stays out there.
        ore.amount -= taken;
        return true;
      }
      if (this.tuning.chatter) this.chatter.pickedUp(this, ship, ore);
      if (ship === this.ship) this.stats.bestOre = Math.max(this.stats.bestOre, ship.ore);
      this.events.push({ type: "pickup", x: ore.x, y: ore.y, kind: ore.kind });
      return false;
    });
  }
}
