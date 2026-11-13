import { Chatter } from "./chatter";
import { type BlueprintId, isProject, PARTS, partFits, PROJECTS, TRAFFIC_BUY_ORDER, type PartId, type ShipModel } from "./parts";
import { ClickPilot, DronePilot, FighterPilot, FIRST_FIELD, LOW_HULL } from "./pilot";
export { FIRST_FIELD };
import { pathAround } from "./route";
import { pilotKind, type StepProfile } from "./profile/step";
import { DEFAULTS, type ThrusterId, type Tuning } from "./tuning";

export const TICK = 1 / 120;
/**
 * A sleeping field wakes when the camera, or any ship, comes this far past its edge, and
 * a waking one sleeps once they're all further than the second. Both well past what the
 * widest zoom shows, so nobody sees rocks come or go; the gap stops it flickering.
 */
export const FIELD_WAKE_DISTANCE = 6000;
export const FIELD_SLEEP_DISTANCE = 9000;
/**
 * Traffic, pirates and defenders further than the second from the camera become trip
 * records, and a record nearer than the first a flown ship again. Both past the widest zoom.
 */
export const TRAFFIC_WAKE_DISTANCE = 10000;
/** How long a defender's watch lasts as a record when nothing happens: for good, in a way JSON can save. */
const FOREVER = 1e9;
export const TRAFFIC_SLEEP_DISTANCE = 12000;
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
  /** What it has heard of what's sold where, passed on at every dock it visits. */
  news: Report[];
  /** The base it last swapped news with on this stay in a dock, or null once it's out. */
  newsFrom: string | null;
  wrecks: number;
  damageTaken: number;
  /** What carries this ship the most: an open deposit it's inside, or a POI, or the nearest if none does. */
  frame: Poi | Deposit;
  /** How much of that POI's motion carried the ship on the last tick, from 0 to 1. */
  frameShare: number;
  /** How far the POIs turned the ship on the last tick. */
  carriedTurn: number;
  /** How far the POIs have carried the ship in all, and as of the tick before: the dust drifts with it. */
  carriedX: number;
  carriedY: number;
  prevCarriedX: number;
  prevCarriedY: number;
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
  /** The field it was nearest when that happened: a `MiningField` id. */
  pirateKilledIn: string | null;
  /** The base a defender belongs to, by id: it guards near there and is paid from there. Null: the first. */
  home: string | null;
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

/** A field anyone can mine, as a pilot sees it. */
export interface MiningField {
  id: string;
  poi: Poi;
  radius: number;
  /** How many rocks it holds when full. */
  full: number;
}

/**
 * A station from the designer beyond the first. Where it is comes from the designer each
 * time; what it holds is its own and is saved (see `Base`).
 */
export interface StationSpec {
  id: string;
  name: string;
  rotationPeriod: number;
  orbits: Orbit[];
  carryFull: number;
  carryNone: number;
  shipyard: boolean;
  /** Blueprints it starts with, held parts among them: the only way a held part is sold. */
  blueprints: BlueprintId[];
}

/** The first base's id: the game's own station, placed by the tuning rather than the designer. */
export const FIRST_BASE = "station";

/**
 * One piece of news: a base sells an item at a price, as seen at a moment on the clock. It
 * travels with ships from dock to dock and is dropped once it's too old to trust.
 */
export interface Report {
  base: string;
  item: PartId;
  price: number;
  seen: number;
}

/**
 * A station with a dock, and everything that's its own: money, a store of ore and parts, a
 * shop that sells from that store, and a hauler that trades with it. Every base is a full
 * starter base. The first is the game's own station; the rest are the designer's.
 */
export interface Base {
  id: string;
  /** The designer's spec, or null for the first base. */
  spec: StationSpec | null;
  poi: Poi;
  account: { credits: number };
  /** Ore bought and held for the next hauler. */
  ore: number;
  /** Parts held. Every service it sells uses them up. */
  parts: number;
  hauler: Hauler | null;
  /** Seconds until its next hauler sets out. */
  haulerTimer: number;
  /** Its traffic gone for good, waiting for it to replace them. */
  lostTraffic: ShipModel[];
  /** What its shop may sell beyond the first tier. */
  blueprints: Set<BlueprintId>;
  /** Credits paid toward blueprints it doesn't have yet. */
  blueprintPaid: Map<BlueprintId, number>;
  /** Paid in full, waiting for its next hauler to bring them. Projects wait here while built. */
  blueprintsOrdered: Set<BlueprintId>;
  /** The news board in its dock: what ships have told it, and what it tells them. */
  board: Report[];
}

/** What a base holds, as saved. */
type BaseState = Pick<
  Base,
  "id" | "account" | "ore" | "parts" | "hauler" | "haulerTimer" | "lostTraffic" | "blueprints" | "blueprintPaid" | "blueprintsOrdered" | "board"
>;

/**
 * A field nobody is near: its rocks kept as they were, in the field's own turning frame,
 * and nothing about them worked out until someone comes near again.
 */
export interface SleepingField {
  id: string;
  /** When it fell asleep, on the clock. */
  since: number;
  /** Positions, velocities and angles relative to the field's centre and turn. */
  rocks: Rock[];
  /**
   * Set while nobody has ever been near it: there are no rocks yet, only this seed to lay
   * them from, full, the first time anything needs them (see `freshen`). A world of a
   * thousand fields holds a thousand numbers, not a hundred thousand rocks.
   */
  fresh?: number;
}

/**
 * A traffic ship far from the camera: not flown, just its next stop and when it gets
 * there. At each stop its pilot decides what's next, exactly as a flown one would.
 */
export interface TripRecord {
  /** Working a field, selling at a dock, buying a load, or (a pirate or defender) going home. */
  goal: "field" | "dock" | "trade" | "home";
  /** The field's id, the base's id, "pirate base", or a deposit's index. */
  target: string;
  /** On the way, or (for a field) mining it, or keeping watch over it, until `arrive`. */
  stage: "travel" | "mining";
  depart: number;
  arrive: number;
  /** The route's corners in the world as it set out. Mining: just its spot, from the field's centre. */
  path: { x: number; y: number }[];
  /** Where the target was due to be on arrival, when it set out. */
  aim: { x: number; y: number };
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

/** Routes keep this far from a body's centre: clear of its pull and air, or just its ground. */
export function keepOutRadius(body: SolidBody): number {
  const reach = Math.max(body.radius, body.atmosphere, body.pullAccel > 0 ? body.pullStart : 0);
  // A margin, as a ship at full speed cuts each corner a little.
  return reach * 1.05 + 200;
}

/** How close the straight line from `a` to `b` comes to the origin. */
function closestApproach(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSq));
  return Math.hypot(a.x + dx * t, a.y + dy * t);
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
  /** The ship whose tractor beam has caught it, if any. Only that ship pulls it in. */
  caughtBy?: Ship | null;
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

/** What every POI carries this tick, laid out so carrying a body makes nothing new. */
interface Carriers {
  pois: Poi[];
  /** Whether any deposit is open, so a body may be inside one. */
  deposits: boolean;
  full: Float64Array;
  none: Float64Array;
  cos: Float64Array;
  sin: Float64Array;
  /** Scratch space for one body at a time. */
  distances: Float64Array;
  shares: Float64Array;
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
  /** Every station with a dock: the game's own first, then the designer's. */
  bases: Base[] = [];
  /** Saved bases the designer hasn't handed over yet: picked up when it does. */
  private savedBases = new Map<string, BaseState>();
  /** The first base's money. Defenders earn it, and it pays for defenders. */
  get stationAccount(): { credits: number } {
    return this.bases[0].account;
  }
  set stationAccount(account: { credits: number }) {
    this.bases[0].account = account;
  }
  /** Ore the first base holds. */
  get stationOre(): number {
    return this.bases[0].ore;
  }
  set stationOre(ore: number) {
    this.bases[0].ore = ore;
  }
  /** Parts the first base holds. Its station upgrades are built from them. */
  get stationParts(): number {
    return this.bases[0].parts;
  }
  set stationParts(parts: number) {
    this.bases[0].parts = parts;
  }
  /** The first base's hauler. */
  get hauler(): Hauler | null {
    return this.bases[0].hauler;
  }
  set hauler(hauler: Hauler | null) {
    this.bases[0].hauler = hauler;
  }
  /** Blueprints the station has, so its shop can sell those things. */
  /** The first base's blueprints: the game's own station. Every base has its own. */
  get blueprints(): Set<BlueprintId> {
    return this.bases[0].blueprints;
  }
  get blueprintPaid(): Map<BlueprintId, number> {
    return this.bases[0].blueprintPaid;
  }
  get blueprintsOrdered(): Set<BlueprintId> {
    return this.bases[0].blueprintsOrdered;
  }
  deposits: Deposit[] = [];
  batteries: Battery[] = [];
  /** Seconds until the first base's next hauler sets out. */
  get haulerTimer(): number {
    return this.bases[0].haulerTimer;
  }
  set haulerTimer(seconds: number) {
    this.bases[0].haulerTimer = seconds;
  }
  /** Ore at the pirate base, for sale to empty holds and to the black market. */
  pirateOre = 0;
  /** The pirate base's money. It pays for repairs, rebuilds, new pirates and parts. */
  pirateCredits = 0;
  /** How many pirates the base fields. It grows once every pirate is fully fitted. */
  pirateCap = 0;
  blackMarket: BlackMarket | null = null;
  /** Seconds until the black market next sets out. */
  blackMarketTimer = 0;
  /** The first base's traffic gone for good, waiting to be replaced. */
  get lostTraffic(): ShipModel[] {
    return this.bases[0].lostTraffic;
  }
  set lostTraffic(lost: ShipModel[]) {
    this.bases[0].lostTraffic = lost;
  }
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
  /** Fields nobody is near, by id. Their rocks aren't in `rocks` and nothing moves them. */
  sleeping = new Map<string, SleepingField>();
  /** Each POI's carry this tick, set at the start of `carryBodies`. */
  private carriers: Carriers | null = null;
  /** Times each part of `step` while set. Dev only: nothing in the game turns it on. */
  profile: StepProfile | null = null;
  /** Stars, planets, moons and asteroids, from the system designer. None without it. */
  bodies: SolidBody[] = [];
  /** Where new games start, by ship. Several for one ship: one is picked at random. None: by the field. */
  spawns: Spawn[] = [];
  /** Each POI's angle at clock 0 for new games, from the designer. Missing: the game's own start. */
  startPhases: Partial<Record<Poi["name"], number>> = {};
  /** Fields beyond the first, from the designer. Rocks only: no station, deposit or traffic of their own. */
  extraFields: ExtraField[] = [];
  private miningCache: { clock: number; extras: ExtraField[]; radius: number; fields: MiningField[] } | null = null;
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
  /** The seed the world was made from: each never-seen field lays its rocks from it. */
  private seed = 1;
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
    const pilot = (each: DronePilot) => ({
      ship: each.ship,
      buys: each.buys,
      flees: each.flees,
      wishlist: each.wishlist,
      working: each.working,
      habit: each.habit,
      record: each.record,
    });
    return {
      tuning: this.tuning,
      controls: this.controls,
      ship: this.ship,
      drones: this.drones.map(pilot),
      traffic: this.traffic.map(pilot),
      fighters: this.fighters.map((each) => each.ship),
      fighterRecords: this.fighters.map((each) => each.record),
      pirateBase: this.pirateBase,
      bases: this.bases.map(
        ({ id, account, ore, parts, hauler, haulerTimer, lostTraffic, blueprints, blueprintPaid, blueprintsOrdered, board }): BaseState => ({
          id, account, ore, parts, hauler, haulerTimer, lostTraffic, blueprints, blueprintPaid, blueprintsOrdered, board,
        }),
      ),
      deposits: this.deposits,
      batteries: this.batteries,
      pirateOre: this.pirateOre,
      pirateCredits: this.pirateCredits,
      pirateCap: this.pirateCap,
      blackMarket: this.blackMarket,
      blackMarketTimer: this.blackMarketTimer,
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
      sleeping: [...this.sleeping.values()],
      randomState: this.randomState,
      seed: this.seed,
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
    const pilot = (each: { ship: Ship; buys: DronePilot["buys"]; flees: boolean; wishlist: PartId[]; working?: string; habit?: string | null; record?: TripRecord | null }) => {
      const made = new DronePilot(fill(each.ship));
      made.buys = each.buys;
      made.flees = each.flees;
      made.wishlist = each.wishlist;
      made.working = each.working ?? FIRST_FIELD;
      made.habit = each.habit ?? null;
      made.record = each.record ?? null;
      return made;
    };
    this.drones = data.drones.map(pilot);
    this.traffic = data.traffic.map(pilot);
    this.fighters = data.fighters.map((ship: Ship) => new FighterPilot(fill(ship)));
    const fighterRecords: (TripRecord | null)[] = data.fighterRecords ?? [];
    this.fighters.forEach((pilot, i) => (pilot.record = fighterRecords[i] ?? null));
    for (const battery of data.batteries as Battery[]) for (const guard of battery.guns) fill(guard.gun);
    const plain = [
      "pirateBase", "deposits", "batteries", "pirateOre",
      "pirateCredits", "pirateCap", "blackMarket", "blackMarketTimer", "distress", "clock", "rocks",
      "shots", "ores", "field", "station", "stats", "inflowTimer", "randomState", "seed",
    ] as const;
    for (const key of plain) if (key in data) Object.assign(this, { [key]: data[key] });
    // A save from before every base had its own: what it held was the first base's.
    const bases: BaseState[] = data.bases ?? [
      {
        id: FIRST_BASE,
        account: data.stationAccount,
        ore: data.stationOre,
        parts: data.stationParts,
        hauler: data.hauler,
        haulerTimer: data.haulerTimer,
        lostTraffic: data.lostTraffic,
      },
    ];
    // A save from before every base had its own blueprints: they were the first base's.
    if (bases[0] && !bases[0].blueprints) {
      Object.assign(bases[0], { blueprints: data.blueprints, blueprintPaid: data.blueprintPaid, blueprintsOrdered: data.blueprintsOrdered });
    }
    this.bases[0].poi = this.station;
    this.savedBases = new Map(bases.map((state) => [state.id, state]));
    for (const base of this.bases) this.takeSaved(base);
    this.discovered = data.discovered ?? new Set();
    // A save from before fields slept has every rock awake: far fields fall asleep next tick.
    this.sleeping = new Map(((data.sleeping ?? []) as SleepingField[]).map((field) => [field.id, field]));
    this.clickPilot = new ClickPilot(this.ship);
    this.chatter = new Chatter(this.randomState.a);
    this.grudges = new WeakMap();
    this.events = [];
  }

  reset(seed: number): void {
    this.seed = seed >>> 0;
    this.randomState = { a: seed >>> 0 };
    this.chatter = new Chatter(seed);
    this.rocks = [];
    this.sleeping = new Map();
    this.shots = [];
    this.ores = [];
    this.events = [];
    this.stats = { bestOre: this.stats.bestOre, topSpeed: 0 };
    this.discovered = new Set();
    this.inflowTimer = 1;
    this.placePois();
    // Every base starts out as a starter base, the designer's included.
    this.bases = [this.makeBase(FIRST_BASE, null, this.station), ...this.bases.slice(1).map((base) => this.makeBase(base.id, base.spec, base.poi))];
    this.savedBases = new Map();
    // The field the ship starts beside is where it works: the chart knows it from the start.
    this.discovered.add(`chart:${this.chartKey(this.field)}`);
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
    this.deposits = [];
    this.pirateOre = this.tuning.pirateStartOre;
    this.pirateCredits = this.tuning.pirateStartCredits;
    this.pirateCap = this.tuning.pirateLimit;
    this.blackMarket = null;
    this.blackMarketTimer = this.tuning.blackMarketFirst;
    this.fighters = [];
    for (let i = 0; i < this.tuning.pirates; i++) {
      const start = this.homeOf(null, "pirate");
      this.addFighter(start.x, start.y, "pirate");
    }
    for (const base of this.bases) this.addDefenders(base);
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
      this.layExtraField(extra);
    }
    // Every other base starts with traffic of its own, docked, working the field it sits by.
    for (const base of this.bases.slice(1)) {
      const dock = this.dockPoint(false, base.poi);
      const field = this.miningFieldAt(base.poi.x, base.poi.y).id;
      for (const model of models) {
        this.addTraffic(dock.x, dock.y, model);
        const pilot = this.traffic[this.traffic.length - 1];
        pilot.working = field;
        pilot.habit = field;
      }
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

  /**
   * A new field's rocks: scattered now if the camera or a ship is near, or else left
   * fresh, just a seed, until someone comes.
   */
  private layExtraField(extra: ExtraField): void {
    const { poi, spec } = extra;
    const reach = spec.radius + FIELD_WAKE_DISTANCE;
    const near = [this.viewer(), ...this.pilots.map((pilot) => pilot.ship)].some((at) => Math.hypot(at.x - poi.x, at.y - poi.y) < reach);
    if (near) {
      this.layRocks(poi, spec.radius, spec.rocks, spec.rockDrift);
      return;
    }
    this.sleeping.set(spec.id, { id: spec.id, since: this.clock, rocks: [], fresh: this.fieldSeed(spec.id) });
  }

  /** A field's own seed, from the world's and its id: the same field always lays the same rocks. */
  private fieldSeed(id: string): number {
    let hash = (this.seed ^ 0x9e3779b9) >>> 0;
    for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
    return hash;
  }

  /** How many rocks a field starts with, how far it spreads them, and how fast they drift. */
  private fieldMake(id: string): { count: number; radius: number; drift: number } {
    const extra = this.extraFields.find((each) => each.spec.id === id);
    if (extra) return { count: extra.spec.rocks, radius: extra.spec.radius, drift: extra.spec.rockDrift };
    return { count: this.tuning.rockCount, radius: this.tuning.fieldRadius, drift: this.tuning.rockDrift };
  }

  /**
   * Lays a fresh field's rocks from its seed, in its own frame, as it would have started:
   * the first time anything needs them, waking or mining. Nothing else touches the world's
   * dice, so it doesn't matter when that happens.
   */
  private freshen(sleeping: SleepingField): void {
    if (sleeping.fresh === undefined) return;
    const state = { a: sleeping.fresh };
    const roll = () => nextRandom(state);
    const { count, radius, drift } = this.fieldMake(sleeping.id);
    const rocks: Rock[] = [];
    for (let i = 0; i < count; i++) {
      const dist = radius * Math.sqrt(roll());
      const dir = roll() * Math.PI * 2;
      const pick = roll();
      const tier = pick < 0.3 ? 2 : pick < 0.7 ? 1 : 0;
      const speed = drift * roll();
      const heading = roll() * Math.PI * 2;
      rocks.push(this.makeRock(tier, Math.cos(dir) * dist, Math.sin(dir) * dist, Math.cos(heading) * speed, Math.sin(heading) * speed, roll));
    }
    sleeping.rocks = rocks;
    sleeping.since = this.clock;
    delete sleeping.fresh;
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

  /** A base as it starts out: the starter base's money and store, and its first hauler on the way. */
  private makeBase(id: string, spec: StationSpec | null, poi: Poi): Base {
    const { tuning } = this;
    return {
      id,
      spec,
      poi,
      account: { credits: tuning.stationStartCredits },
      ore: tuning.stationStartOre,
      parts: tuning.stationStartParts,
      hauler: null,
      haulerTimer: tuning.haulerFirst,
      lostTraffic: [],
      blueprints: new Set(spec?.blueprints ?? []),
      blueprintPaid: new Map(),
      blueprintsOrdered: new Set(),
      board: [],
    };
  }

  /** Gives a base what a loaded save held for it, if the save has it. Returns whether it did. */
  private takeSaved(base: Base): boolean {
    const saved = this.savedBases.get(base.id);
    if (!saved) return false;
    this.savedBases.delete(base.id);
    Object.assign(base, {
      account: saved.account ?? base.account,
      ore: saved.ore ?? base.ore,
      parts: saved.parts ?? base.parts,
      hauler: saved.hauler ?? null,
      haulerTimer: saved.haulerTimer ?? base.haulerTimer,
      lostTraffic: saved.lostTraffic ?? [],
      blueprints: saved.blueprints ?? base.blueprints,
      blueprintPaid: saved.blueprintPaid ?? base.blueprintPaid,
      blueprintsOrdered: saved.blueprintsOrdered ?? base.blueprintsOrdered,
      board: saved.board ?? [],
    });
    return true;
  }

  /** The base a ship belongs to: a defender's own, and the first for anyone else. */
  homeBaseOf(ship: Ship): Base {
    return (ship.home !== null && this.bases.find((base) => base.id === ship.home)) || this.bases[0];
  }

  /** A base's own defenders, docked at it. */
  private addDefenders(base: Base): void {
    const dock = this.dockPoint(false, base.poi);
    for (let i = 0; i < this.tuning.defenders; i++) this.addFighter(dock.x, dock.y, "defender", base.id);
  }

  /** The base whose station this is. */
  baseOf(station: Poi): Base | null {
    return this.bases.find((base) => base.poi === station) ?? null;
  }

  /** The base a ship is docked at, or null. */
  baseAt(ship: Ship = this.ship): Base | null {
    const dock = this.dockedAt(ship);
    return dock ? this.baseOf(dock) : null;
  }

  /** The base that serves a ship: where it's docked, or else the first. */
  private serviceBase(ship: Ship): Base {
    return this.baseAt(ship) ?? this.bases[0];
  }

  /** The shop the player sees: the base they're docked at, or else the first. */
  shopBase(): Base {
    return this.serviceBase(this.ship);
  }

  private fitBase(base: Base): void {
    const { spec, poi } = base;
    if (!spec) return;
    const at = orbitsAt(spec.orbits, this.clock);
    poi.orbits = spec.orbits;
    poi.carry = { full: spec.carryFull, none: Math.max(spec.carryFull, spec.carryNone) };
    poi.x = poi.px = at.x;
    poi.y = poi.py = at.y;
  }

  /** Every field with its size: the first, from the tuning, then the designer's others. */
  private rockFields(): { poi: Poi; radius: number }[] {
    return [{ poi: this.field, radius: this.tuning.fieldRadius }, ...this.extraFields.map(({ poi, spec }) => ({ poi, radius: spec.radius }))];
  }

  /**
   * The fields whose rocks are out in the world, with where each is in `rockFields`. A
   * sleeping field's rocks are kept with it, so no loose rock is ever in one: each rock
   * only looks among these for its field, however many fields there are.
   */
  private awakeRockFields(): { poi: Poi; radius: number; index: number }[] {
    const ids = [FIRST_FIELD, ...this.extraFields.map((extra) => extra.spec.id)];
    return this.rockFields()
      .map((field, index) => ({ ...field, index }))
      .filter((field) => !this.sleeping.has(ids[field.index]));
  }

  /** Every field there is to mine, the first one first. */
  miningFields(): MiningField[] {
    // Asked for per rock and per ship, so worked out once a tick.
    const cache = this.miningCache;
    if (cache && cache.clock === this.clock && cache.extras === this.extraFields && cache.radius === this.tuning.fieldRadius) {
      return cache.fields;
    }
    const fields = [
      { id: FIRST_FIELD, poi: this.field, radius: this.tuning.fieldRadius, full: this.tuning.rockCount },
      ...this.extraFields.map(({ poi, spec }) => ({ id: spec.id, poi, radius: spec.radius, full: spec.rocks })),
    ];
    this.miningCache = { clock: this.clock, extras: this.extraFields, radius: this.tuning.fieldRadius, fields };
    return fields;
  }

  /** The field whose edge is nearest a spot. */
  miningFieldAt(x: number, y: number): MiningField {
    const fields = this.miningFields();
    return fields[this.fieldAt(fields, x, y)];
  }

  /** Whether a rock belongs to a field: it's nearer that field's edge than any other's. */
  rockIn(field: MiningField, rock: Rock): boolean {
    if (this.extraFields.length === 0) return true;
    return this.miningFieldAt(rock.x, rock.y).id === field.id;
  }

  /** Whether a field has been mined down below the share that's worth the trip. */
  fieldEmpty(field: MiningField): boolean {
    let count = 0;
    const sleeping = this.sleeping.get(field.id);
    if (sleeping?.fresh !== undefined) {
      count = this.fieldMake(field.id).count;
    } else if (sleeping) {
      for (const rock of sleeping.rocks) if (!rock.arriving) count++;
    } else {
      for (const rock of this.rocks) if (!rock.arriving && this.rockIn(field, rock)) count++;
    }
    return count < field.full * this.tuning.fieldEmptyShare;
  }

  /**
   * Where to steer for on the way from one spot to another so as to stay out of every
   * body's pull, or null if the straight line is clear. It's the next corner of a path
   * round the first body in the way, from where the bodies are now.
   */
  cornerToward(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestAhead = Infinity;
    for (const body of this.bodies) {
      const at = bodyAt(body, this.clock);
      const keepOut = keepOutRadius(body);
      const from = { x: fromX - at.x, y: fromY - at.y };
      const to = { x: toX - at.x, y: toY - at.y };
      const ahead = Math.hypot(from.x, from.y);
      // The body met first along the way is the one to get round first.
      if (ahead >= bestAhead) continue;
      let corner: { x: number; y: number } | null = null;
      if (ahead < keepOut && Math.hypot(to.x, to.y) >= keepOut) {
        // Already inside: plan from straight out at the edge, and climb out first if the
        // way to the plan's next corner would take it any deeper.
        const out = { x: (from.x / ahead) * keepOut * 1.01, y: (from.y / ahead) * keepOut * 1.01 };
        const path = pathAround(out, to, keepOut);
        const next = path.bends ? path.points[1] : to;
        corner = closestApproach(from, next) < ahead * 0.99 ? out : next;
        if (corner === to) corner = null;
      } else {
        const path = pathAround(from, to, keepOut);
        if (path.bends) corner = path.points[1];
      }
      if (!corner) continue;
      bestAhead = ahead;
      best = { x: corner.x + at.x, y: corner.y + at.y };
    }
    return best;
  }

  /** The circle round a body that a route keeps out of, as it stands now. */
  keepOutAt(body: SolidBody): { x: number; y: number; radius: number } {
    const at = bodyAt(body, this.clock);
    return { x: at.x, y: at.y, radius: keepOutRadius(body) };
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
  private addFighter(x: number, y: number, faction: Faction, home: string | null = null): void {
    const ship = this.makeShip(
      x,
      y,
      { thrust: 0, strafe: 0, turn: 0, fire: false, retro: false, stabilize: false },
    );
    ship.faction = faction;
    ship.home = home;
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
    return this.dockPoint(previous, ship ? this.homeBaseOf(ship).poi : this.station);
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
    return [...this.drones, ...this.traffic.filter((pilot) => !pilot.record), ...this.fighters.filter((pilot) => !pilot.record)];
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
  haulerSpot(previous = false, base: Base = this.bases[0]): { x: number; y: number; angle: number } | null {
    const { hauler } = base;
    if (!hauler) return null;
    return previous
      ? { x: hauler.px, y: hauler.py, angle: hauler.prevAngle }
      : { x: hauler.x, y: hauler.y, angle: hauler.angle };
  }

  /** The berth: where a docked hauler sits and which way it points, now or a tick ago. */
  haulerBerth(previous = false, base: Base = this.bases[0]): { x: number; y: number; angle: number } {
    const station = base.poi;
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
  haulerStandoff(previous = false, base: Base = this.bases[0]): { x: number; y: number } {
    const station = base.poi;
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
  private haulerWaypoint(base: Base, fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number; detour: boolean } {
    const station = base.poi;
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

  /** The way out and in for a base's haulers: from its station, away from the field nearest it. */
  private haulerLane(base: Base): { x: number; y: number } {
    const station = base.poi;
    const field = base === this.bases[0] ? this.field : this.miningFieldAt(station.x, station.y).poi;
    const dx = station.x - field.x;
    const dy = station.y - field.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  /**
   * Rough seconds until a hauler is at the berth: 0 while one is there, null if none is coming.
   * It brakes all the way in, so the time left follows from the distance left.
   */
  haulerEta(base: Base = this.bases[0]): number | null {
    const { tuning } = this;
    const { hauler } = base;
    const inbound = (distance: number) => Math.sqrt((2 * distance) / HAULER_BRAKE) + HAULER_DOCK_SECONDS;
    const fromLaunch = tuning.haulerInterval + inbound(HAULER_APPROACH);
    if (!hauler) return tuning.haulers ? base.haulerTimer + inbound(HAULER_APPROACH) : null;
    switch (hauler.stage) {
      case "arriving": {
        const standoff = this.haulerStandoff(false, base);
        return inbound(Math.hypot(standoff.x - hauler.x, standoff.y - hauler.y));
      }
      case "docking":
        return Math.max(0, HAULER_DOCK_SECONDS - hauler.time);
      case "loading":
        return 0;
      default: {
        if (!tuning.haulers) return null;
        // The next one only sets out its interval after this one is out of sight.
        const left = Math.max(0, HAULER_GONE - Math.hypot(hauler.x - base.poi.x, hauler.y - base.poi.y));
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
  private moveHauler(base: Base, dt: number): void {
    const { tuning } = this;
    const station = base.poi;
    // Each base's blueprints come in on its own haulers.
    if (!base.hauler) {
      if (!tuning.haulers) {
        // With no haulers running, nothing would ever bring them.
        this.deliverBlueprints(base);
        return;
      }
      base.haulerTimer -= dt;
      if (base.haulerTimer > 0) return;
      base.haulerTimer = tuning.haulerInterval;
      const berth = this.haulerBerth(false, base);
      const lane = this.haulerLane(base);
      const x = berth.x + lane.x * HAULER_APPROACH;
      const y = berth.y + lane.y * HAULER_APPROACH;
      const speed = Math.min(HAULER_MAX_SPEED, Math.sqrt(2 * HAULER_BRAKE * HAULER_APPROACH));
      const angle = Math.atan2(-lane.y, -lane.x);
      base.hauler = {
        stage: "arriving",
        time: 0,
        x,
        y,
        px: x,
        py: y,
        vx: (station.x - station.px) / dt - lane.x * speed,
        vy: (station.y - station.py) / dt - lane.y * speed,
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
    const hauler = base.hauler;
    hauler.px = hauler.x;
    hauler.py = hauler.y;
    hauler.prevAngle = hauler.angle;
    hauler.time += dt;
    hauler.thrust = { forward: 0, side: 0, turn: 0 };
    const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
    const berth = this.haulerBerth(false, base);

    switch (hauler.stage) {
      case "arriving": {
        // Flies its own course to a stop just outside its berth: the station's carrying doesn't touch it.
        const standoff = this.haulerStandoff(false, base);
        const standoffBefore = this.haulerStandoff(true, base);
        const goalVx = (standoff.x - standoffBefore.x) / dt;
        const goalVy = (standoff.y - standoffBefore.y) / dt;
        const goal = this.haulerWaypoint(base, hauler.x, hauler.y, standoff.x, standoff.y);
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
          this.startDocking(base, hauler, berth);
        }
        return;
      }
      case "docking": {
        // Rotation and side thrusters ease it onto the berth while matching the station's turn.
        const share = Math.min(1, hauler.time / HAULER_DOCK_SECONDS);
        const left = 1 - share * share * (3 - 2 * share);
        const rotation = station.rotation;
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
        if (tuning.chatter) this.chatter.haulerBerthed(this, base);
        this.deliverBlueprints(base);
        return;
      }
      case "loading": {
        hauler.x = berth.x;
        hauler.y = berth.y;
        hauler.angle = berth.angle;
        hauler.vx = (hauler.x - hauler.px) / dt;
        hauler.vy = (hauler.y - hauler.py) / dt;
        const { account } = base;
        const canLoad = () => hauler.cargo < tuning.haulerCapacity && base.ore >= 1;
        // This visit's ore always pays for this visit's parts, even for a station in debt.
        const canUnload = () =>
          hauler.parts >= 1 &&
          tuning.stationPartsTarget - base.parts >= 1 &&
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
              base.ore--;
              account.credits += tuning.haulerPrice;
              hauler.earned += tuning.haulerPrice;
            }
            if (canUnload()) {
              hauler.parts--;
              base.parts++;
              account.credits -= tuning.haulerPartPrice;
              hauler.earned = Math.max(0, hauler.earned - tuning.haulerPartPrice);
            }
          }
        }
        if ((hauler.cargo >= tuning.haulerCapacity && !canUnload()) || hauler.idle >= HAULER_WAIT_SECONDS) {
          hauler.stage = "undocking";
          hauler.time = 0;
          if (tuning.chatter) this.chatter.haulerLeaving(this, base, hauler.cargo);
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
        const lane = this.haulerLane(base);
        const far = { x: station.x + lane.x * HAULER_GONE * 2, y: station.y + lane.y * HAULER_GONE * 2 };
        const goal = this.haulerWaypoint(base, hauler.x, hauler.y, far.x, far.y);
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
        if (Math.hypot(hauler.x - station.x, hauler.y - station.y) > HAULER_GONE) {
          base.hauler = null;
        }
        return;
      }
    }
  }

  private startDocking(base: Base, hauler: Hauler, berth: { x: number; y: number; angle: number }): void {
    const rotation = base.poi.rotation;
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

  /**
   * Sets a course for a place, if the ship has the autopilot: for the dock, at its berth;
   * for a field, just inside its edge; for the pirate base, inside its ring. The course
   * chases the place as it moves. Returns whether it did.
   */
  orderTravel(poi: Poi): boolean {
    if (!this.ship.parts.has("autopilot")) return false;
    if (poi.name === "station") {
      this.clickPilot.travelTo(poi, DOCK_OFFSET, 0);
    } else if (poi.name === "pirate base") {
      this.clickPilot.travelTo(poi, 0, 0, poi.reach / 2);
    } else {
      // A field, of either kind: stop near its edge, where the rocks start.
      this.clickPilot.travelTo(poi, 0, 0, poi.reach * 0.85);
    }
    return true;
  }

  /** Sets a course for a deposit, if the ship has the autopilot. */
  orderTravelDeposit(deposit: Deposit): boolean {
    if (!this.ship.parts.has("autopilot")) return false;
    this.clickPilot.travelTo(deposit, 0, 0, 60);
    return true;
  }

  /** Every place, for the chart: the game's own three, plus the designer's stations and fields. */
  allPois(): Poi[] {
    return this.pois;
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
      news: [],
      newsFrom: null,
      wrecks: 0,
      damageTaken: 0,
      frame: this.field,
      frameShare: 1,
      carriedTurn: 0,
      carriedX: 0,
      carriedY: 0,
      prevCarriedX: 0,
      prevCarriedY: 0,
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
      pirateKilledIn: null,
      home: null,
    };
  }

  /**
   * A rebuilt ship starts in the dock it was rebuilt in: the nearest with a shipyard to
   * where it was wrecked. A pirate starts at its base.
   */
  private respawn(ship: Ship): void {
    if (ship === this.ship) this.clickPilot.cancel();
    const home = ship.faction === "pirate" ? this.homeOf(ship) : this.dockPoint(false, this.nearestDock(ship.x, ship.y, true));
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

  /** Whether nobody sells this blueprint, so only a base that holds it can sell the part. */
  private held(id: BlueprintId): boolean {
    return PARTS.some((part) => part.id === id && part.held);
  }

  /**
   * Whether a base's shop can sell this: by default the one the player is docked at, or the
   * first. The first tier never needs a blueprint; a held part always does.
   */
  unlocked(id: BlueprintId, base: Base = this.shopBase()): boolean {
    if (id === "deposit") return this.deposits.some((deposit) => deposit.partsLeft <= 0);
    if (id === "stationGuards" || id === "depositGuards") {
      return this.batteries.some((battery) => battery.id === id && battery.partsLeft <= 0);
    }
    if (this.held(id)) return base.blueprints.has(id);
    return !this.tuning.stationUnlocks || this.blueprintTier(id) === 0 || base.blueprints.has(id);
  }

  blueprintPrice(id: BlueprintId): number {
    if (id === "deposit") return this.tuning.depositPrice;
    if (id === "stationGuards") return this.tuning.stationGuardPrice;
    if (id === "depositGuards") return this.tuning.depositGuardPrice;
    const price = id === "drone" ? this.tuning.dronePrice : this.partPrice(id);
    return Math.round(price * this.tuning.blueprintScale);
  }

  /** What's still owed on a blueprint. */
  blueprintLeft(id: BlueprintId, base: Base = this.shopBase()): number {
    return Math.max(0, this.blueprintPrice(id) - (base.blueprintPaid.get(id) ?? 0));
  }

  /** A base's blueprints still to get, next first: most paid toward, then by tier, then cheapest. */
  blueprintQueue(base: Base = this.bases[0]): BlueprintId[] {
    if (!this.tuning.stationUnlocks) return [];
    const paid = (id: BlueprintId) => base.blueprintPaid.get(id) ?? 0;
    const ids: BlueprintId[] = [...PARTS.map((part) => part.id), "drone", ...PROJECTS];
    return ids
      .filter((id) => this.canOrder(id, base))
      .sort(
        (a, b) =>
          paid(b) - paid(a) ||
          this.blueprintTier(a) - this.blueprintTier(b) ||
          this.blueprintPrice(a) - this.blueprintPrice(b),
      );
  }

  /**
   * Whether a base can pay toward this now. Nobody sells a held part's blueprint. Projects are
   * built by the first field, so only the first base orders them, and turrets for the
   * deposit need a deposit to stand on.
   */
  private canOrder(id: BlueprintId, base: Base): boolean {
    if (this.held(id)) return false;
    if (isProject(id) && base !== this.bases[0]) return false;
    if (id === "depositGuards" && !this.unlocked("deposit", base)) return false;
    return !this.unlocked(id, base) && !base.blueprintsOrdered.has(id);
  }

  /** Puts the ship owner's credits toward a blueprint at its base, as far as they go. Returns whether any went in. */
  fundBlueprint(ship: Ship, id: BlueprintId): boolean {
    const base = this.serviceBase(ship);
    if (!this.canOrder(id, base) || !this.atShop(ship)) return false;
    const account = this.accountOf(ship);
    const amount = Math.min(account.credits, this.blueprintLeft(id, base));
    if (amount <= 0) return false;
    account.credits -= amount;
    base.blueprintPaid.set(id, (base.blueprintPaid.get(id) ?? 0) + amount);
    if (this.blueprintLeft(id, base) === 0) this.orderBlueprint(id, base);
    return true;
  }

  private orderBlueprint(id: BlueprintId, base: Base): void {
    base.blueprintPaid.delete(id);
    base.blueprintsOrdered.add(id);
    if (id === "deposit") this.addDeposit(false, this.tuning.depositParts);
    if (id === "stationGuards") this.addBattery(id, false, this.tuning.stationGuardParts);
    if (id === "depositGuards") this.addBattery(id, false, this.tuning.depositGuardParts);
  }

  /** Everything a base has on order arrives at once, and its shop can stock it from then on. */
  private deliverBlueprints(base: Base): void {
    // A project is built here, not brought in.
    const arrived = [...base.blueprintsOrdered].filter((id) => !isProject(id));
    if (arrived.length === 0) return;
    for (const id of arrived) {
      base.blueprintsOrdered.delete(id);
      base.blueprints.add(id);
    }
    // Only the game's own station has a voice on the radio so far.
    if (!this.tuning.chatter || base !== this.bases[0]) return;
    this.chatter.unlocked(
      this,
      arrived.map((id) => (id === "drone" ? "drones" : PARTS.find((part) => part.id === id)!.label.toLowerCase())),
    );
  }

  /** Whatever each base can spare past its cash buffer finishes paying for its next blueprint. */
  private buyBlueprints(): void {
    for (const base of this.bases) {
      const next = this.blueprintQueue(base)[0];
      if (!next) continue;
      const left = this.blueprintLeft(next, base);
      if (base.account.credits - this.tuning.stationCashBuffer < left) continue;
      base.account.credits -= left;
      this.orderBlueprint(next, base);
    }
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
    this.bases[0].blueprintsOrdered.delete("deposit");
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
      this.bases[0].blueprintsOrdered.delete(battery.id);
      return false;
    });
    for (const battery of this.batteries) this.placeGuards(battery);
  }

  private finishBattery(battery: Battery): void {
    battery.partsLeft = 0;
    this.bases[0].blueprintsOrdered.delete(battery.id);
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
      .filter((pilot) => !pilot.record)
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
    if (!partFits(part, ship.model) || !this.unlocked(id, this.serviceBase(ship))) return false;
    const account = this.accountOf(ship);
    if (!this.atShop(ship) || ship.parts.has(id) || account.credits < price) return false;
    if (!this.hasPartsFor(price, ship)) return false;
    this.chargeForService(account, price, this.serviceBase(ship));
    ship.parts.add(id);
    if (id === "retro" && ship === this.ship) this.tuning.retro = true;
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    if (ship !== this.ship && this.tuning.chatter) this.chatter.bought(this, ship, part.label.toLowerCase());
    return true;
  }

  /** Sells a part back at full price, so a ship can go back to being light. */
  sellPart(ship: Ship, id: PartId): boolean {
    if (!this.atShop(ship) || !ship.parts.has(id)) return false;
    this.chargeForService(ship, -this.partPrice(id), this.serviceBase(ship));
    ship.parts.delete(id);
    if ((id === "clickMove" || id === "clickTurn") && ship === this.ship) this.clickPilot.cancel();
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    return true;
  }

  /** Any ship in the dock can pay for a new drone, which starts there and earns for itself. */
  buyDrone(buyer: Ship): DronePilot | null {
    const { tuning } = this;
    if (!this.atShop(buyer) || buyer.credits < tuning.dronePrice) return null;
    if (this.drones.length >= tuning.droneLimit || !this.hasPartsFor(tuning.dronePrice, buyer)) return null;
    const base = this.serviceBase(buyer);
    if (!this.unlocked("drone", base)) return null;
    this.chargeForService(buyer, tuning.dronePrice, base);
    const dock = this.dockPoint(false, base.poi);
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

  /** Whether the base serving a ship (where it's docked, or the first) has the parts for a service. */
  hasPartsFor(credits: number, ship: Ship = this.ship): boolean {
    return this.hasStockFor(credits, this.serviceBase(ship));
  }

  private hasStockFor(credits: number, base: Base): boolean {
    return base.parts >= this.stockFor(credits);
  }

  /** The buyer pays the base, and the service comes out of its parts, which stop at empty. */
  private chargeForService(buyer: { credits: number }, credits: number, base: Base): void {
    buyer.credits -= credits;
    base.account.credits += credits;
    base.parts = Math.max(0, base.parts - this.stockFor(credits));
  }

  /** Whose credits this ship earns and spends: its owner's, the station's, or its own. */
  accountOf(ship: Ship): { credits: number } {
    if (ship.faction === "defender") return this.homeBaseOf(ship).account;
    return ship.owner ?? ship;
  }

  /** Every station with a dock: the first base's first, then the designer's. */
  get docks(): Poi[] {
    return this.bases.map((base) => base.poi);
  }

  /** Whether a dock rebuilds wrecks. */
  hasShipyard(dock: Poi): boolean {
    if (dock === this.station) return this.tuning.stationShipyard;
    return this.baseOf(dock)?.spec?.shipyard ?? false;
  }

  /** The nearest dock to a spot, or the nearest with a shipyard. With no shipyard anywhere, the station. */
  nearestDock(x: number, y: number, shipyard = false): Poi {
    let best = this.station;
    let bestDistance = Infinity;
    for (const dock of this.docks) {
      if (shipyard && !this.hasShipyard(dock)) continue;
      const distance = Math.hypot(dock.x - x, dock.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = dock;
      }
    }
    return best;
  }

  /** Center of a station's dock, now or as of the previous tick. */
  dockPoint(previous = false, station: Poi = this.station): { x: number; y: number } {
    const rotation = previous ? station.prevRotation : station.rotation;
    return {
      x: (previous ? station.px : station.x) + Math.cos(rotation) * DOCK_OFFSET,
      y: (previous ? station.py : station.y) + Math.sin(rotation) * DOCK_OFFSET,
    };
  }

  /** A rock, shaped by the world's dice, or by `roll` when given (a fresh field's own). */
  makeRock(tier: number, x: number, y: number, vx: number, vy: number, roll: () => number = this.random): Rock {
    const points = 8 + Math.floor(roll() * 4);
    const shape: number[] = [];
    for (let i = 0; i < points; i++) shape.push(0.84 + roll() * 0.26);
    const radius = TIER_RADIUS[tier];
    const angle = roll() * Math.PI * 2;
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
      spin: (roll() - 0.5) * (60 / radius),
      shape,
    };
  }

  /** Advance one fixed tick. Display rate and time speedup never change its size. */
  step(): void {
    const dt = TICK;
    const lap = this.profile ? this.profile.begin() : null;
    this.clock += dt;
    this.discover();
    if (this.distress) {
      this.distress.age += dt;
      if (this.distress.age > DISTRESS_SECONDS) this.distress = null;
    }
    this.clickPilot.update(this);
    lap?.("other");
    this.recordFighters();
    this.recordTraffic();
    lap?.("records");
    const pilots = this.pilots;
    if (lap) {
      for (const pilot of pilots) {
        pilot.update(this);
        lap(`think: ${pilotKind(pilot)}`);
      }
    } else {
      for (const pilot of pilots) pilot.update(this);
    }
    this.movePois(dt);
    this.moveDeposits();
    this.moveGuards();
    lap?.("places");
    this.sleepAndWake();
    lap?.("sleep and wake");
    this.carryBodies(dt);
    lap?.("carry");
    this.driftInRocks(dt);
    this.moveRocks(dt);
    lap?.("rocks");
    this.letGoOfOre();
    this.pullOre(this.ship, dt);
    for (const pilot of pilots) this.pullOre(pilot.ship, dt);
    this.bodySpots = this.bodies.map((body) => ({ body, ...bodyAt(body, this.clock) }));
    this.pullTowardBodies(dt);
    lap?.("pull");
    this.moveOres(dt);
    lap?.("ore");
    this.moveShip(this.ship, dt);
    for (const pilot of pilots) this.moveShip(pilot.ship, dt);
    this.touchBodies(this.ship, dt);
    for (const pilot of pilots) this.touchBodies(pilot.ship, dt);
    this.burnOreOnBodies();
    lap?.("ships");
    this.moveShots(dt);
    lap?.("shots");
    this.fireShots(this.ship);
    this.collectOre(this.ship);
    this.unloadOre(this.ship, dt);
    this.repairHull(this.ship, dt);
    this.swapNews(this.ship);
    // Includes anything bought during the update above.
    for (const pilot of this.pilots) {
      this.fireShots(pilot.ship);
      this.collectOre(pilot.ship);
      this.unloadOre(pilot.ship, dt);
      this.repairHull(pilot.ship, dt);
      this.swapNews(pilot.ship);
    }
    lap?.("fire, collect, unload");
    this.fireGuards(dt);
    this.spendStationParts();
    this.buyBlueprints();
    this.buildProjects(dt);
    this.spendPirateCredits();
    for (const base of this.bases) this.moveHauler(base, dt);
    this.moveBlackMarket(dt);
    lap?.("economy");
    if (this.tuning.chatter) this.chatter.update(this, dt);
    lap?.("chatter");
    this.profile?.end();
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
    for (const { spec, poi } of this.bases) {
      if (!spec) continue;
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
  applyLayout(phases: Partial<Record<Poi["name"], number>> = {}, fields?: FieldSpec[], stationSpecs?: StationSpec[]): void {
    const { field, station, pirateBase, tuning, clock } = this;
    // What's at a station goes where that station goes, every base's included.
    const stations = [...this.docks, ...(pirateBase ? [pirateBase] : [])];
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
      const ids = new Set([FIRST_FIELD, ...next.map((extra) => extra.spec.id)]);
      for (const id of this.sleeping.keys()) if (!ids.has(id)) this.sleeping.delete(id);
    }
    if (stationSpecs) {
      const kept = new Map(this.bases.map((base) => [base.id, base]));
      this.bases = [this.bases[0], ...stationSpecs.map((spec) => {
        let base = kept.get(spec.id);
        if (!base || base === this.bases[0]) {
          base = this.makeBase(spec.id, spec, this.makePoi("station", null, 0, 0, 0, STATION_REACH));
          base.spec = spec;
          this.fitBase(base);
          // A new base comes with its defenders. One from a save has them in the save already.
          if (!this.takeSaved(base)) this.addDefenders(base);
        }
        base.spec = spec;
        this.fitBase(base);
        return base;
      })];
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
      const removed =
        poi.orbits !== undefined &&
        !this.extraFields.some((extra) => extra.poi === poi) &&
        !this.bases.some((base) => base.poi === poi);
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
    for (const base of this.bases) if (base.hauler) shift(base.hauler, moved(base.poi));
    if (this.blackMarket) shift(this.blackMarket, moved(pirateBase ?? field));
    // These follow their POIs, and a jump in one of them would carry whatever is inside it.
    this.moveDeposits();
    for (const deposit of this.deposits) {
      deposit.px = deposit.x;
      deposit.py = deposit.y;
    }
    this.moveGuards();
    for (const extra of added) this.layExtraField(extra);
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
    return [...own, ...this.extraFields.map((extra) => extra.poi), ...this.bases.slice(1).map((base) => base.poi)];
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
    this.carriers = this.carriersNow();
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
    // The carry is all the ship moved so far this tick: its own speed comes after.
    ship.prevCarriedX = ship.carriedX;
    ship.prevCarriedY = ship.carriedY;
    ship.carriedX += ship.x - ship.px;
    ship.carriedY += ship.y - ship.py;
    ship.frame = poi;
    ship.frameShare = share;
    ship.carriedTurn = turn;
    ship.prevAngle = ship.angle;
    ship.angle += turn;
  }

  /** Every POI's carry this tick, worked out once for all the bodies `carry` moves. */
  private carriersNow(): Carriers {
    // A sleeping field carries nothing: its rocks are kept with it, and nobody is near it.
    const asleep = new Set(this.extraFields.filter((extra) => this.sleeping.has(extra.spec.id)).map((extra) => extra.poi));
    if (this.sleeping.has(FIRST_FIELD)) asleep.add(this.field);
    const pois = this.pois.filter((poi) => !asleep.has(poi));
    const count = pois.length;
    const carriers: Carriers = {
      pois,
      deposits: this.deposits.some((deposit) => deposit.partsLeft <= 0),
      full: new Float64Array(count),
      none: new Float64Array(count),
      cos: new Float64Array(count),
      sin: new Float64Array(count),
      distances: new Float64Array(count),
      shares: new Float64Array(count),
    };
    for (let i = 0; i < count; i++) {
      const range = this.carryRange(pois[i]);
      carriers.full[i] = range.full;
      carriers.none[i] = range.none;
      carriers.cos[i] = Math.cos(pois[i].turn);
      carriers.sin[i] = Math.sin(pois[i].turn);
    }
    return carriers;
  }

  /**
   * Carries a body and says what carried it most, by how much, and how far it turned.
   * The same sums as `carryShares` and `nearestPoi`, in one pass with nothing made per body.
   */
  private carry(body: Body): { poi: Poi | Deposit; share: number; turn: number } {
    const carriers = this.carriers ?? (this.carriers = this.carriersNow());
    // Inside an open deposit's ring, it carries everything by itself. It doesn't turn.
    const deposit = carriers.deposits ? this.depositAt(body) : null;
    if (deposit) {
      body.px = body.x;
      body.py = body.y;
      body.x += deposit.x - deposit.px;
      body.y += deposit.y - deposit.py;
      return { poi: deposit, share: 1, turn: 0 };
    }
    const { pois, full, none, cos, sin, distances, shares } = carriers;
    const count = pois.length;
    let nearest = 0;
    for (let i = 0; i < count; i++) {
      distances[i] = this.edgeDistance(pois[i], body.x, body.y);
      if (distances[i] < distances[nearest]) nearest = i;
    }
    if (distances[nearest] <= full[nearest]) {
      shares.fill(0);
      shares[nearest] = 1;
    } else {
      let total = 0;
      for (let i = 0; i < count; i++) {
        shares[i] = none[i] === Infinity ? 1 : Math.max(0, Math.min(1, (none[i] - distances[i]) / (none[i] - full[i])));
        total += shares[i];
      }
      if (total > 1) for (let i = 0; i < count; i++) shares[i] /= total;
    }
    let moveX = 0;
    let moveY = 0;
    let turn = 0;
    let poi = pois[nearest];
    let share = 0;
    for (let i = 0; i < count; i++) {
      const weight = shares[i];
      if (weight === 0) continue;
      const carrier = pois[i];
      const dx = body.x - carrier.px;
      const dy = body.y - carrier.py;
      moveX += weight * (carrier.x + dx * cos[i] - dy * sin[i] - body.x);
      moveY += weight * (carrier.y + dx * sin[i] + dy * cos[i] - body.y);
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
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const { vx, vy } = body;
      body.vx = vx * c - vy * s;
      body.vy = vx * s + vy * c;
    }
    return { poi, share, turn };
  }

  /**
   * Where a POI's marker should lead, how far until the POI's edge enters a view of
   * the given half size in world units, and how fast that distance is closing.
   * Closing speed comes from real positions, so it includes all carrying by POIs.
   */
  readPoi(poi: Poi, viewHalfWidth: number, viewHalfHeight: number): PoiReading {
    const { ship, tuning } = this;
    const isStation = this.docks.includes(poi);
    const gapToView = (shipX: number, shipY: number, x: number, y: number, rotation: number) => {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      // A field is a circle. A station and its dock are a box, measured by its current extents.
      const centerX = isStation ? x + cos * STATION_SHAPE_CENTER : x;
      const centerY = isStation ? y + sin * STATION_SHAPE_CENTER : y;
      const extentX = isStation ? Math.abs(cos) * STATION_SHAPE_HALF + Math.abs(sin) * STATION_HALF : 0;
      const extentY = isStation ? Math.abs(sin) * STATION_SHAPE_HALF + Math.abs(cos) * STATION_HALF : 0;
      const radius = isStation ? 0 : poi === this.field ? tuning.fieldRadius : poi.reach;
      const viewX = shipX + ship.vx * tuning.lookahead;
      const viewY = shipY + ship.vy * tuning.lookahead;
      const outX = Math.max(0, Math.abs(centerX - viewX) - viewHalfWidth - extentX);
      const outY = Math.max(0, Math.abs(centerY - viewY) - viewHalfHeight - extentY);
      return Math.hypot(outX, outY) - radius;
    };
    const gap = gapToView(ship.x, ship.y, poi.x, poi.y, poi.rotation);
    const previousGap = gapToView(ship.px, ship.py, poi.px, poi.py, poi.prevRotation);
    const leadX = isStation ? Math.cos(poi.rotation) * DOCK_OFFSET : 0;
    const leadY = isStation ? Math.sin(poi.rotation) * DOCK_OFFSET : 0;
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
  private toStationAxes(dx: number, dy: number, station: Poi = this.station): { x: number; y: number } {
    const cos = Math.cos(station.rotation);
    const sin = Math.sin(station.rotation);
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  }

  private fromStationAxes(x: number, y: number, station: Poi = this.station): { x: number; y: number } {
    const cos = Math.cos(station.rotation);
    const sin = Math.sin(station.rotation);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  }

  /** The station whose dock a ship is in, or null. */
  dockedAt(ship: Ship = this.ship): Poi | null {
    for (const station of this.docks) {
      const local = this.toStationAxes(ship.x - station.x, ship.y - station.y, station);
      if (Math.abs(local.x - DOCK_OFFSET) < STATION_HALF && Math.abs(local.y) < STATION_HALF) return station;
    }
    return null;
  }

  /** In any station's dock: it sells ore, repairs, and is safe. */
  isDocked(ship: Ship = this.ship): boolean {
    return this.dockedAt(ship) !== null;
  }

  /** In a dock: every base has a shop. */
  atShop(ship: Ship = this.ship): boolean {
    return this.isDocked(ship);
  }

  /**
   * Stands in for a distant belt that the field slowly gathers rocks from. Rocks
   * start out of sight and drift in, and stop coming once the field is full.
   */
  /** Big rocks drift into each field that's short of its rocks. */
  /**
   * Traffic far from the camera runs as trip records: each tick only checks whether the
   * next stop is due, where that puts the ship, and whether the camera has come near.
   */
  private recordTraffic(): void {
    const viewer = this.viewer();
    // A ship near a flown pirate or defender stays flown too, so any fight is a real one.
    const fighters = this.fighters.filter((pilot) => !pilot.record).map((pilot) => pilot.ship);
    const sight = this.tuning.visionRange;
    const fighterWithin = (ship: Ship, range: number) => fighters.some((other) => Math.hypot(other.x - ship.x, other.y - ship.y) < range);
    for (const pilot of this.traffic) {
      const { ship } = pilot;
      if (pilot.record) {
        // A stop can lead straight to another, such as a dock with nothing to unload.
        for (let stops = 0; stops < 8 && pilot.record.arrive <= this.clock; stops++) this.recordArrived(pilot);
        this.placeRecord(pilot.record, ship);
        if (Math.hypot(ship.x - viewer.x, ship.y - viewer.y) < TRAFFIC_WAKE_DISTANCE || fighterWithin(ship, sight * 2)) {
          this.wakeRecord(pilot);
        }
      } else if (
        this.tuning.trafficRecords &&
        !pilot.busy &&
        Math.hypot(ship.x - viewer.x, ship.y - viewer.y) > TRAFFIC_SLEEP_DISTANCE &&
        !fighterWithin(ship, sight * 2.5)
      ) {
        this.startRecord(pilot);
      }
    }
  }

  /**
   * Pirates and defenders far from the camera with nothing to fight run as trip records
   * too: a pirate's mines its field and takes the ore home, a defender's keeps watch over
   * its own. Once a second, dice say whether one has caught sight of a ship in its field it
   * would go after: then both are ships again, and the fight is a real one.
   */
  private recordFighters(): void {
    const viewer = this.viewer();
    const sight = this.tuning.visionRange;
    const flown = this.pilots;
    // Whether a flown ship is near enough that the two might fight.
    const hostileWithin = (pilot: FighterPilot, range: number) =>
      flown.some((other) => {
        // One that became a record earlier this tick is out of it.
        if (other === pilot || other.record) return false;
        if (Math.hypot(other.ship.x - pilot.ship.x, other.ship.y - pilot.ship.y) >= range) return false;
        return pilot.goesAfter(this, other.ship) || (other instanceof FighterPilot && other.goesAfter(this, pilot.ship));
      });
    const second = Math.floor(this.clock) !== Math.floor(this.clock - TICK);
    for (const pilot of this.fighters) {
      const { ship } = pilot;
      if (pilot.record) {
        for (let stops = 0; stops < 8 && pilot.record.arrive <= this.clock; stops++) this.fighterArrived(pilot);
        this.placeRecord(pilot.record, ship);
        if (Math.hypot(ship.x - viewer.x, ship.y - viewer.y) < TRAFFIC_WAKE_DISTANCE || hostileWithin(pilot, sight * 2) || this.answersDistress(pilot)) {
          this.wakeFighter(pilot);
        } else if (second && pilot.record.stage === "mining") {
          this.lookAround(pilot);
        }
      } else if (
        this.tuning.fighterRecords &&
        pilot.calm &&
        Math.hypot(ship.x - viewer.x, ship.y - viewer.y) > TRAFFIC_SLEEP_DISTANCE &&
        !hostileWithin(pilot, sight * 2.5) &&
        !this.answersDistress(pilot)
      ) {
        this.startFighterRecord(pilot);
      }
    }
  }

  /** Whether a defender would answer the call for help that's out: one near its own base. */
  private answersDistress(pilot: FighterPilot): boolean {
    const { ship } = pilot;
    const { distress } = this;
    if (ship.faction !== "defender" || !distress || distress.ship === ship) return false;
    return this.nearestDock(distress.ship.x, distress.ship.y) === this.homeBaseOf(ship).poi;
  }

  /**
   * A fighter keeping watch over a field: for each ship there it would go after, the dice
   * say whether it starts on it this second, as often as flown ones do.
   */
  private lookAround(pilot: FighterPilot): void {
    const field = pilot.patrolField(this);
    const reach = field.radius + this.tuning.visionRange;
    const chance = pilot.ship.faction === "pirate" ? this.tuning.recordSpotPirate : this.tuning.recordSpotDefender;
    const others: { ship: Ship; pilot: DronePilot | FighterPilot | null }[] = [
      { ship: this.ship, pilot: null },
      ...this.drones.map((each) => ({ ship: each.ship, pilot: each })),
      ...this.traffic.map((each) => ({ ship: each.ship, pilot: each })),
      ...this.fighters.map((each) => ({ ship: each.ship, pilot: each })),
    ];
    for (const other of others) {
      if (other.pilot === pilot) continue;
      if (Math.hypot(other.ship.x - field.poi.x, other.ship.y - field.poi.y) > reach) continue;
      if (!this.wouldGoAfter(pilot, other.ship, other.pilot)) continue;
      if (this.random() >= chance) continue;
      if (other.pilot?.record) {
        if (other.pilot instanceof FighterPilot) this.wakeFighter(other.pilot);
        else this.wakeRecord(other.pilot);
      }
      this.wakeFighter(pilot, other.ship);
      return;
    }
  }

  /**
   * Whether a fighter would go after a ship, as its pilot decides. A record mining a field
   * only takes its ore aboard when it's done: what it would have mined by now counts.
   */
  private wouldGoAfter(pilot: FighterPilot, other: Ship, otherPilot: DronePilot | FighterPilot | null): boolean {
    if (pilot.goesAfter(this, other)) return true;
    const record = otherPilot?.record;
    if (!record || record.stage !== "mining" || other.ore > 0 || this.mined(otherPilot!) < 1) return false;
    other.ore = 1;
    const wants = pilot.goesAfter(this, other);
    other.ore = 0;
    return wants;
  }

  /** How much a record mining a field has got by now, all told, by its mining rate. */
  private mined(pilot: DronePilot | FighterPilot): number {
    const record = pilot.record!;
    const span = record.arrive - record.depart;
    const share = span > 0 && Number.isFinite(span) ? Math.max(0, (this.clock - record.depart) / span) : 0;
    return Math.floor(share * Math.max(0, this.deliveryLoad(pilot.ship) - pilot.ship.ore));
  }

  /** Turns a flown pirate or defender into a record of its round. */
  private startFighterRecord(pilot: FighterPilot): void {
    const { ship } = pilot;
    ship.vx = ship.vy = 0;
    ship.spin = 0;
    if (this.isHome(ship) && (ship.ore > 0 || this.canRepair(ship) || pilot.isHeadingHome)) {
      const at = { x: ship.x, y: ship.y };
      pilot.record = { goal: "home", target: this.fighterHome(ship), stage: "travel", depart: this.clock, arrive: this.clock, path: [at], aim: at };
      return;
    }
    const field = pilot.patrolField(this);
    const inField = Math.hypot(ship.x - field.poi.x, ship.y - field.poi.y) < field.radius;
    if (inField && !this.fighterGoesHome(pilot)) this.startWatch(pilot, field);
    else this.nextFighterLeg(pilot);
  }

  /** Where a pirate or defender sells and is repaired, as a record's target. */
  private fighterHome(ship: Ship): string {
    return ship.faction === "pirate" && this.pirateBase ? "pirate base" : this.homeBaseOf(ship).id;
  }

  /** Whether its pilot would head home: a full load, a low hull it can pay to mend, or already on its way. */
  private fighterGoesHome(pilot: FighterPilot): boolean {
    const { ship } = pilot;
    const canPay = ship.ore > 0 || this.canPayRepair(ship);
    return pilot.isHeadingHome || ship.ore >= this.deliveryLoad(ship) || (ship.hull < LOW_HULL && canPay);
  }

  /** Sets off home, or to its field. */
  private nextFighterLeg(pilot: FighterPilot): void {
    const { ship } = pilot;
    const home = this.fighterGoesHome(pilot);
    const target = home ? this.fighterHome(ship) : pilot.patrolField(this).id;
    pilot.task = home ? "heading home" : "patrolling";
    const from = { x: ship.x, y: ship.y };
    const record: TripRecord = { goal: home ? "home" : "field", target, stage: "travel", depart: this.clock, arrive: this.clock, path: [from], aim: from };
    const { route, centre } = pilot.plan(this, () => from, (t) => this.recordTargetAt(record, t));
    record.arrive = route.arrive;
    record.path = route.path.points.map((point) => ({ x: point.x + centre.x, y: point.y + centre.y }));
    record.aim = { x: route.aim.x + centre.x, y: route.aim.y + centre.y };
    pilot.record = record;
  }

  /**
   * Keeps watch over its field from where it is: a pirate mines it until a load is due, a
   * defender for as long as nothing happens.
   */
  private startWatch(pilot: FighterPilot, field: MiningField): void {
    const { ship, record } = pilot;
    const start = record?.stage === "travel" ? record.arrive : this.clock;
    let seconds = FOREVER;
    if (ship.faction === "pirate") {
      const want = Math.max(0, this.deliveryLoad(ship) - ship.ore);
      const perMinute = this.tuning.recordOrePirate;
      if (perMinute > 0) seconds = (want * 60) / perMinute;
    }
    const offset = { x: ship.x - field.poi.x, y: ship.y - field.poi.y };
    pilot.record = { goal: "field", target: field.id, stage: "mining", depart: start, arrive: start + seconds, path: [offset], aim: offset };
    pilot.task = ship.faction === "pirate" ? "mining" : "patrolling";
  }

  /** A fighter's next stop is due. */
  private fighterArrived(pilot: FighterPilot): void {
    const record = pilot.record!;
    const { ship } = pilot;
    const due = record.arrive;
    if (record.goal === "field" && record.stage === "travel") {
      const fields = this.miningFields();
      const field = fields.find((each) => each.id === record.target) ?? fields[0];
      const at = this.poiAt(field.poi, due);
      const dir = this.random() * Math.PI * 2;
      const dist = field.radius * 0.6 * Math.sqrt(this.random());
      ship.x = ship.px = at.x + Math.cos(dir) * dist;
      ship.y = ship.py = at.y + Math.sin(dir) * dist;
      this.startWatch(pilot, field);
      return;
    }
    if (record.goal === "field") {
      // A pirate's load is mined.
      const want = Math.max(0, this.deliveryLoad(ship) - ship.ore);
      ship.ore += Math.min(want, Math.floor(this.takeOre(record.target, want) + 1e-9));
      this.nextLegAfter(pilot, due, ship.ore > 0);
      return;
    }
    // Home: it sells and is mended as a flown one would be, all at once.
    const spot = this.homeOf(ship);
    const before = this.homeOf(ship, ship.faction, true);
    ship.x = spot.x;
    ship.y = spot.y;
    ship.px = before.x;
    ship.py = before.y;
    ship.vx = ship.vy = 0;
    const most = Math.round(120 / TICK);
    let ticks = 0;
    while ((ship.ore > 0 || this.canRepair(ship)) && ticks < most) {
      this.unloadOre(ship, TICK);
      this.repairHull(ship, TICK);
      ticks++;
    }
    pilot.cameHome();
    this.nextLegAfter(pilot, due + ticks * TICK, false);
  }

  /** The next leg from a stop that fell due between ticks: home, or back to its field. */
  private nextLegAfter(pilot: FighterPilot, depart: number, home: boolean): void {
    if (home) pilot.headHome();
    this.nextFighterLeg(pilot);
    const record = pilot.record!;
    const shift = Math.max(0, depart - this.clock);
    record.depart += shift;
    record.arrive += shift;
  }

  /**
   * The camera, a ship to fight, or a call for help has come near: it's a flown ship again.
   * Woken by catching sight of `spotted`, it turns up within sight of it, looking its way.
   */
  private wakeFighter(pilot: FighterPilot, spotted: Ship | null = null): void {
    const record = pilot.record!;
    const { ship } = pilot;
    if (record.stage === "mining" && ship.faction === "pirate") {
      const want = this.mined(pilot);
      if (want > 0) ship.ore += Math.min(want, Math.floor(this.takeOre(record.target, want) + 1e-9));
    }
    pilot.record = null;
    pilot.wake();
    if (spotted) {
      const dir = this.random() * Math.PI * 2;
      // Near the edge of sight, where a flown one mostly first sees its mark.
      const dist = this.tuning.visionRange * 0.9;
      ship.x = spotted.x + Math.cos(dir) * dist;
      ship.y = spotted.y + Math.sin(dir) * dist;
      ship.angle = ship.prevAngle = Math.atan2(spotted.y - ship.y, spotted.x - ship.x);
      pilot.spot(this, spotted);
    }
    ship.px = ship.x;
    ship.py = ship.y;
    ship.vx = ship.vy = 0;
  }

  /** Turns a flown traffic ship into a record of what it was doing. */
  private startRecord(pilot: DronePilot): void {
    const { ship } = pilot;
    ship.vx = ship.vy = 0;
    ship.spin = 0;
    const dock = this.dockedAt(ship);
    if (dock) {
      const at = { x: ship.x, y: ship.y };
      const target = (this.baseOf(dock) ?? this.bases[0]).id;
      pilot.record = { goal: "dock", target, stage: "travel", depart: this.clock, arrive: this.clock, path: [at], aim: at };
      return;
    }
    const field = this.miningFieldAt(ship.x, ship.y);
    const mining =
      !pilot.trading &&
      !pilot.isHauling &&
      ship.ore < this.deliveryLoad(ship) &&
      field.id === pilot.working &&
      Math.hypot(ship.x - field.poi.x, ship.y - field.poi.y) < field.radius;
    if (mining) this.startMining(pilot, field);
    else this.nextLeg(pilot);
  }

  /** Where a record's target is at a time on the clock. */
  private recordTargetAt(record: TripRecord, time: number): { x: number; y: number } {
    if (record.goal === "field") {
      const fields = this.miningFields();
      const field = fields.find((each) => each.id === record.target) ?? fields[0];
      return this.poiAt(field.poi, time);
    }
    if (record.goal === "dock") {
      const base = this.bases.find((each) => each.id === record.target) ?? this.bases[0];
      return this.poiAt(base.poi, time);
    }
    if (record.target === "pirate base" && this.pirateBase) return this.poiAt(this.pirateBase, time);
    if (record.goal === "home") {
      const base = this.bases.find((each) => each.id === record.target) ?? this.bases[0];
      return this.poiAt(base.poi, time);
    }
    const deposit = this.deposits[Number(record.target)];
    return deposit ? { x: deposit.x, y: deposit.y } : this.poiAt(this.station, time);
  }

  /** Sets off for the next stop, the way its pilot would: a buying run, home to sell, or to its field. */
  private nextLeg(pilot: DronePilot): void {
    const { ship } = pilot;
    let goal: TripRecord["goal"];
    let target: string;
    const fields = this.miningFields();
    const lowHull = ship.hull < LOW_HULL && (ship.ore > 0 || this.canPayRepair(ship));
    if (pilot.trading) {
      goal = "trade";
      target = pilot.trading === "pirate base" ? "pirate base" : String(this.deposits.indexOf(pilot.trading));
      pilot.task = "to buy";
    } else if (pilot.isHauling || ship.ore >= this.deliveryLoad(ship) || lowHull) {
      goal = "dock";
      target = (this.baseOf(this.nearestDock(ship.x, ship.y)) ?? this.bases[0]).id;
      pilot.task = "to station";
    } else {
      goal = "field";
      target = fields.some((field) => field.id === pilot.working) ? pilot.working : FIRST_FIELD;
      pilot.task = target === FIRST_FIELD ? "to field" : "to far field";
    }
    const from = { x: ship.x, y: ship.y };
    const record: TripRecord = { goal, target, stage: "travel", depart: this.clock, arrive: this.clock, path: [from], aim: from };
    const { route, centre } = pilot.plan(this, () => from, (t) => this.recordTargetAt(record, t));
    record.arrive = route.arrive;
    record.path = route.path.points.map((point) => ({ x: point.x + centre.x, y: point.y + centre.y }));
    record.aim = { x: route.aim.x + centre.x, y: route.aim.y + centre.y };
    pilot.record = record;
  }

  /** Mines from where it is in a field until a load is due, at the rate flown ships manage. */
  private startMining(pilot: DronePilot, field: MiningField): void {
    const { ship, record } = pilot;
    const want = Math.max(0, this.deliveryLoad(ship) - ship.ore);
    const perMinute = ship.model === "racer" ? this.tuning.recordOreRacer : this.tuning.recordOreFloater;
    const seconds = perMinute > 0 ? (want * 60) / perMinute : Infinity;
    const offset = { x: ship.x - field.poi.x, y: ship.y - field.poi.y };
    const start = record?.stage === "travel" ? record.arrive : this.clock;
    pilot.record = { goal: "field", target: field.id, stage: "mining", depart: start, arrive: start + seconds, path: [offset], aim: offset };
    pilot.task = "shooting";
    pilot.habit = field.id;
  }

  /** The next stop is due: what happens there, and the leg after it. */
  private recordArrived(pilot: DronePilot): void {
    const record = pilot.record!;
    const { ship } = pilot;
    const due = record.arrive;
    const at = this.recordTargetAt(record, due);
    if (record.goal === "field" && record.stage === "travel") {
      const fields = this.miningFields();
      const field = fields.find((each) => each.id === record.target) ?? fields[0];
      // Somewhere inside it, as a flown ship would be once it had found a rock.
      const dir = this.random() * Math.PI * 2;
      const dist = field.radius * 0.6 * Math.sqrt(this.random());
      ship.x = ship.px = at.x + Math.cos(dir) * dist;
      ship.y = ship.py = at.y + Math.sin(dir) * dist;
      this.startMining(pilot, field);
      return;
    }
    if (record.goal === "field") {
      const want = Math.max(0, this.deliveryLoad(ship) - ship.ore);
      ship.ore += Math.min(want, Math.floor(this.takeOre(record.target, want) + 1e-9));
      // Mined out before the hold was full: home with what it has, or with nothing, back to the first field.
      if (ship.ore === 0) pilot.working = FIRST_FIELD;
      else if (ship.ore < this.deliveryLoad(ship)) pilot.startHauling();
      this.nextLegAt(pilot, due);
      return;
    }
    if (record.goal === "dock") {
      const base = this.bases.find((each) => each.id === record.target) ?? this.bases[0];
      const spot = this.dockPoint(false, base.poi);
      const before = this.dockPoint(true, base.poi);
      ship.x = spot.x;
      ship.y = spot.y;
      ship.px = before.x;
      ship.py = before.y;
      ship.vx = ship.vy = 0;
      const stay = this.dockVisit(pilot);
      this.nextLegAt(pilot, due + stay);
      return;
    }
    // A buying run: it buys there as a flown ship would, and its pilot takes it from there.
    ship.x = ship.px = at.x;
    ship.y = ship.py = at.y;
    pilot.update(this);
    if (pilot.trading && record.goal === "trade") pilot.trading = null;
    this.nextLegAt(pilot, due);
  }

  /** The next leg, setting out at a time already past (a stop that fell due between ticks). */
  private nextLegAt(pilot: DronePilot, depart: number): void {
    this.nextLeg(pilot);
    const record = pilot.record!;
    const shift = Math.max(0, depart - this.clock);
    record.depart += shift;
    record.arrive += shift;
  }

  /**
   * A stay at the dock, run by the dock and the pilot as for a flown ship, but all at once:
   * it unloads, repairs, shops and picks where to go next. Returns how long it took.
   */
  private dockVisit(pilot: DronePilot): number {
    const { ship } = pilot;
    const most = Math.round(120 / TICK);
    let ticks = 0;
    pilot.newStay();
    // A record's stay is all at once, so it swaps news whether or not it was here last.
    ship.newsFrom = null;
    this.swapNews(ship);
    do {
      pilot.update(this);
      this.unloadOre(ship, TICK);
      this.repairHull(ship, TICK);
      ticks++;
    } while ((ship.ore > 0 || this.canRepair(ship)) && ticks < most);
    // Now the hold is empty: it shops and picks its next field.
    pilot.update(this);
    return ticks * TICK;
  }

  /**
   * Breaks rocks in a field until they've given about `want` ore on average, as mining
   * them would, and returns how much they gave. Fewer if the field runs out.
   */
  private takeOre(fieldId: string, want: number): number {
    const sleeping = this.sleeping.get(fieldId);
    if (sleeping) this.freshen(sleeping);
    const rocks = sleeping ? sleeping.rocks : this.rocks;
    const mine = (rock: Rock) => !rock.arriving && (sleeping !== undefined || this.miningFieldAt(rock.x, rock.y).id === fieldId);
    let given = 0;
    for (let broken = 0; given < want && broken < 1000; broken++) {
      const start = Math.floor(this.random() * rocks.length);
      let index = -1;
      for (let i = 0; i < rocks.length; i++) {
        const each = (start + i) % rocks.length;
        if (mine(rocks[each])) {
          index = each;
          break;
        }
      }
      if (index < 0) break;
      const [rock] = rocks.splice(index, 1);
      given += (rock.tier + 1) * this.tuning.oreChance;
      if (rock.tier === 0) continue;
      const pieces = 2 + Math.floor(this.random() * 2);
      const offset = TIER_RADIUS[rock.tier - 1] / Math.sin(Math.PI / pieces);
      for (let i = 0; i < pieces; i++) {
        const dir = (i / pieces) * Math.PI * 2;
        rocks.push(this.makeRock(rock.tier - 1, rock.x + Math.cos(dir) * offset, rock.y + Math.sin(dir) * offset, rock.vx, rock.vy));
      }
    }
    return given;
  }

  /** Where a record puts its ship now: along its route, or at its spot in the field it mines. */
  private placeRecord(record: TripRecord, ship: Ship): void {
    ship.px = ship.x;
    ship.py = ship.y;
    if (record.stage === "mining") {
      const field = this.recordTargetAt(record, this.clock);
      ship.x = field.x + record.path[0].x;
      ship.y = field.y + record.path[0].y;
      return;
    }
    const { path } = record;
    const span = record.arrive - record.depart;
    const share = span > 0 ? Math.min(1, Math.max(0, (this.clock - record.depart) / span)) : 1;
    let length = 0;
    for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    let left = share * length;
    let x = path[path.length - 1].x;
    let y = path[path.length - 1].y;
    for (let i = 1; i < path.length; i++) {
      const piece = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      if (left <= piece && piece > 0) {
        x = path[i - 1].x + ((path[i].x - path[i - 1].x) * left) / piece;
        y = path[i - 1].y + ((path[i].y - path[i - 1].y) * left) / piece;
        break;
      }
      left -= piece;
    }
    // Wherever the target has really got to, it ends up there.
    const target = this.recordTargetAt(record, this.clock);
    ship.x = x + share * (target.x - record.aim.x);
    ship.y = y + share * (target.y - record.aim.y);
    // The route's straight pieces cut the corners of its curve round a body: never inside.
    for (const body of this.bodies) {
      const circle = this.keepOutAt(body);
      const dx = ship.x - circle.x;
      const dy = ship.y - circle.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= circle.radius || distance === 0) continue;
      ship.x = circle.x + (dx / distance) * circle.radius * 1.001;
      ship.y = circle.y + (dy / distance) * circle.radius * 1.001;
    }
  }

  /** The camera has come near: it's a flown ship again, from wherever its record has it. */
  private wakeRecord(pilot: DronePilot): void {
    const record = pilot.record!;
    const { ship } = pilot;
    if (record.stage === "mining") {
      // What it has mined so far.
      const span = record.arrive - record.depart;
      const share = span > 0 && Number.isFinite(span) ? Math.max(0, (this.clock - record.depart) / span) : 0;
      const want = Math.floor(share * Math.max(0, this.deliveryLoad(ship) - ship.ore));
      if (want > 0) ship.ore += Math.min(want, Math.floor(this.takeOre(record.target, want) + 1e-9));
    }
    pilot.record = null;
    ship.px = ship.x;
    ship.py = ship.y;
    ship.vx = ship.vy = 0;
  }

  /**
   * Where the camera is. Today it's always on the player's ship; a camera switch or a jump
   * would move it, and with it what's awake.
   */
  viewer(): { x: number; y: number } {
    return this.ship;
  }

  /**
   * Puts to sleep every field the camera and every ship have left, and wakes every sleeping
   * field one of them has come near. Ships keep a field awake only until they're trip
   * records themselves: then only the camera will.
   */
  private sleepAndWake(): void {
    const fields = this.miningFields();
    const viewer = this.viewer();
    const ships = this.pilots.map((pilot) => pilot.ship);
    const near = (field: MiningField, distance: number): boolean => {
      const reach = field.radius + distance;
      const within = (at: { x: number; y: number }) => Math.hypot(at.x - field.poi.x, at.y - field.poi.y) < reach;
      return within(viewer) || ships.some(within);
    };
    const falling: MiningField[] = [];
    for (const field of fields) {
      const sleeping = this.sleeping.get(field.id);
      if (sleeping) {
        if (near(field, FIELD_WAKE_DISTANCE)) this.wakeField(field, sleeping);
      } else if (!near(field, FIELD_SLEEP_DISTANCE)) {
        falling.push(field);
      }
    }
    // Only awake fields have rocks out in the world to sort.
    if (falling.length > 0) this.sleepFields(fields.filter((field) => !this.sleeping.has(field.id)), falling);
  }

  private sleepFields(fields: MiningField[], falling: MiningField[]): void {
    const kept: Rock[] = [];
    const asleep = new Map(falling.map((field) => [field, [] as Rock[]]));
    for (const rock of this.rocks) {
      const field = fields[this.fieldAt(fields, rock.x, rock.y)];
      const into = asleep.get(field);
      if (!into) {
        kept.push(rock);
        continue;
      }
      const { poi } = field;
      const cos = Math.cos(-poi.rotation);
      const sin = Math.sin(-poi.rotation);
      const dx = rock.x - poi.x;
      const dy = rock.y - poi.y;
      const { vx, vy } = rock;
      rock.x = rock.px = dx * cos - dy * sin;
      rock.y = rock.py = dx * sin + dy * cos;
      rock.vx = vx * cos - vy * sin;
      rock.vy = vx * sin + vy * cos;
      rock.angle = rock.prevAngle = rock.angle - poi.rotation;
      into.push(rock);
    }
    this.rocks = kept;
    for (const [field, rocks] of asleep) this.sleeping.set(field.id, { id: field.id, since: this.clock, rocks });
  }

  /**
   * Brings a field's rocks back where they were in its frame, so a gap shot in it is still
   * there, plus the rocks that would have drifted in while it slept. Those arrive already
   * settled in the field, out where nobody is looking.
   */
  private wakeField(field: MiningField, sleeping: SleepingField): void {
    this.freshen(sleeping);
    this.sleeping.delete(field.id);
    const { poi } = field;
    const cos = Math.cos(poi.rotation);
    const sin = Math.sin(poi.rotation);
    for (const rock of sleeping.rocks) {
      const { x, y, vx, vy } = rock;
      rock.x = rock.px = poi.x + x * cos - y * sin;
      rock.y = rock.py = poi.y + x * sin + y * cos;
      rock.vx = vx * cos - vy * sin;
      rock.vy = vx * sin + vy * cos;
      rock.angle = rock.prevAngle = rock.angle + poi.rotation;
      this.rocks.push(rock);
    }
    const extra = this.extraFields.find((each) => each.spec.id === field.id);
    const perMinute = extra ? extra.spec.rockInflow : this.tuning.rockInflow;
    const drift = extra ? extra.spec.rockDrift : this.tuning.rockDrift;
    const room = field.full - sleeping.rocks.length;
    const grown = Math.min(room, Math.floor(((this.clock - sleeping.since) * perMinute) / 60));
    const viewer = this.viewer();
    for (let i = 0; i < grown; i++) {
      // Clear of the camera, should it have jumped right into the field.
      for (let attempt = 0; attempt < 8; attempt++) {
        const dist = field.radius * Math.sqrt(this.random());
        const dir = this.random() * Math.PI * 2;
        const x = poi.x + Math.cos(dir) * dist;
        const y = poi.y + Math.sin(dir) * dist;
        if (Math.hypot(x - viewer.x, y - viewer.y) < INFLOW_CLEAR_OF_PLAYER) continue;
        const speed = drift * this.random();
        const heading = this.random() * Math.PI * 2;
        this.rocks.push(this.makeRock(INFLOW_TIER, x, y, Math.cos(heading) * speed, Math.sin(heading) * speed));
        break;
      }
    }
  }

  private driftInRocks(dt: number): void {
    const fields = this.rockFields();
    const awake = this.awakeRockFields();
    const counts = fields.map(() => 0);
    if (awake.length === 1) counts[awake[0].index] = this.rocks.length;
    else if (awake.length > 1) for (const rock of this.rocks) counts[awake[this.fieldAt(awake, rock.x, rock.y)].index]++;
    const { tuning } = this;
    if (!this.sleeping.has(FIRST_FIELD)) {
      this.inflowTimer = this.driftInto(fields[0], tuning.rockInflow, tuning.rockCount, counts[0], this.inflowTimer, dt);
    }
    this.extraFields.forEach((extra, i) => {
      if (this.sleeping.has(extra.spec.id)) return;
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
    const fields = this.awakeRockFields();
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

  /** Whether a ship's tractor beam is working: fitted, and room in the bay for what it pulls. */
  tractorOn(ship: Ship): boolean {
    return (ship.parts.has("tractor") || ship.parts.has("tractorAll")) && ship.ore < this.cargoSpace(ship);
  }

  /** How wide a ship's beam catches, in degrees: the all-round tractor's all the way round. */
  tractorCone(ship: Ship): number {
    return ship.parts.has("tractorAll") ? 360 : this.tuning.tractorCone;
  }

  /** Lets go of caught ore whose ship can't hold it any more: out of range, full, or no beam. */
  private letGoOfOre(): void {
    const range = this.tuning.tractorRange;
    for (const ore of this.ores) {
      const ship = ore.caughtBy;
      if (!ship) continue;
      if (!this.tractorOn(ship) || Math.hypot(ship.x - ore.x, ship.y - ore.y) > range) ore.caughtBy = null;
    }
  }

  /**
   * Catches loose ore in range inside the beam's cone ahead of the ship, then steers what it
   * has caught toward the ship, so it arrives instead of circling it. Caught ore stays caught
   * wherever it drifts within range; ore another ship has caught is left to that ship.
   */
  private pullOre(ship: Ship, dt: number): void {
    if (!this.tractorOn(ship)) return;
    const { tractorRange, tractorPull, tractorSpeed } = this.tuning;
    const most = tractorPull * dt;
    const edge = Math.cos(((Math.min(this.tractorCone(ship), 360) / 2) * Math.PI) / 180);
    const noseX = Math.cos(ship.angle);
    const noseY = Math.sin(ship.angle);
    for (const ore of this.ores) {
      if (ore.caughtBy && ore.caughtBy !== ship) continue;
      const dx = ship.x - ore.x;
      const dy = ship.y - ore.y;
      const distance = Math.hypot(dx, dy);
      if (distance > tractorRange || distance === 0) continue;
      if (ore.caughtBy !== ship) {
        if (-(dx * noseX + dy * noseY) / distance < edge) continue;
        ore.caughtBy = ship;
      }
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

    const stationReach = STATION_HALF + SHIP_RADIUS;
    let station = this.station;
    let from = { x: 0, y: 0 };
    let move = { x: 0, y: 0 };
    let stationHit: ReturnType<typeof sweepBox> = null;
    for (const dock of this.docks) {
      const dockFrom = this.toStationAxes(ship.x - dock.x, ship.y - dock.y, dock);
      const dockMove = this.toStationAxes(ship.vx * dt, ship.vy * dt, dock);
      const dockHit = sweepBox(dockFrom.x, dockFrom.y, dockMove.x, dockMove.y, stationReach, stationReach);
      if (dockHit && (!stationHit || dockHit.t < stationHit.t)) {
        station = dock;
        from = dockFrom;
        move = dockMove;
        stationHit = dockHit;
      }
    }
    if (stationHit && stationHit.t < hitT) {
      // Rest on the surface, so a ship never stays stuck inside the station.
      const restX = stationHit.nx !== 0
        ? stationHit.nx * (stationReach + 0.01)
        : from.x + move.x * stationHit.t;
      const restY = stationHit.ny !== 0
        ? stationHit.ny * (stationReach + 0.01)
        : from.y + move.y * stationHit.t;
      const rest = this.fromStationAxes(restX, restY, station);
      ship.x = station.x + rest.x;
      ship.y = station.y + rest.y;
      const normal = this.fromStationAxes(stationHit.nx, stationHit.ny, station);
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
    // Rebuilt at the nearest base with a shipyard, which takes the pay and spends its parts.
    const yard = this.baseOf(this.nearestDock(ship.x, ship.y, true)) ?? this.bases[0];
    // Only the player can always rebuild. Anyone else needs the money, and the base the parts.
    if (!player && rebuildCost > 0) {
      if (account.credits < rebuildCost || !this.hasStockFor(rebuildCost, yard)) {
        this.removeShip(ship);
        return;
      }
    }
    this.chargeForService(account, rebuildCost, yard);
    ship.upkeep += rebuildCost;
    const cleared = ship.marked || ship.wanted;
    this.respawn(ship);
    if (player && this.tuning.chatter) this.chatter.playerRebuilt(rebuildCost, cleared, yard.poi);
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
    // Lost traffic is the loss of the base that would have rebuilt it, which replaces it in time.
    if (this.traffic.some((pilot) => pilot.ship === ship)) {
      (this.baseOf(this.nearestDock(ship.x, ship.y, true)) ?? this.bases[0]).lostTraffic.push(ship.model);
    }
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
    // The chart draws only what the player has been to: a place from inside its reach,
    // a body from a few of its own radii out, or its air. Kept with discovered, so it saves.
    for (const poi of this.pois) {
      if (Math.hypot(ship.x - poi.x, ship.y - poi.y) < poi.reach) discovered.add(`chart:${this.chartKey(poi)}`);
    }
    for (const { body, x, y } of this.bodySpots) {
      const sight = Math.max(body.radius * this.tuning.bodySight, body.atmosphere);
      if (Math.hypot(ship.x - x, ship.y - y) < sight) discovered.add(`chart:body:${body.name}`);
    }
  }

  /** The chart's own key for a place: what the discovered set holds for it. */
  chartKey(poi: Poi): string {
    if (poi === this.field) return "field";
    if (poi === this.station) return "station";
    if (poi === this.pirateBase) return "pirate base";
    const extra = this.extraFields.find(({ poi: at }) => at === poi);
    if (extra) return `extra:${extra.spec.id}`;
    // Saves call these "outpost:", from when the designer's stations were only that.
    const base = this.baseOf(poi);
    if (base?.spec) return `outpost:${base.spec.id}`;
    return "place";
  }

  /** Whether the chart draws a place: only what the player has visited. */
  chartSeenPoi(poi: Poi): boolean {
    return this.discovered.has(`chart:${this.chartKey(poi)}`);
  }

  /** Whether the chart draws a body: only what the player has been near. */
  chartSeenBody(body: SolidBody): boolean {
    return this.discovered.has(`chart:body:${body.name}`);
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
    for (const base of this.bases) this.spendBaseParts(base);
  }

  /** One base's spending: for its own lost traffic, out of its own parts and money. */
  private spendBaseParts(base: Base): void {
    const { tuning } = this;
    if (base.lostTraffic.length === 0) return;
    const spare = base.parts - tuning.stationReserveParts;
    const dock = this.dockPoint(false, base.poi);
    const hasDefender = this.fighters.some((pilot) => pilot.ship.faction === "defender" && this.homeBaseOf(pilot.ship) === base);
    if (!hasDefender && tuning.defenderPrice > 0) {
      if (spare < this.stockFor(tuning.defenderPrice)) return;
      this.chargeForService(base.account, tuning.defenderPrice, base);
      this.addFighter(dock.x, dock.y, "defender", base.id);
      if (this.tuning.chatter) this.chatter.defenderLaunched(this, base.poi);
    } else {
      if (spare < this.stockFor(tuning.rebuildCost)) return;
      this.chargeForService(base.account, tuning.rebuildCost, base);
      this.addTraffic(dock.x, dock.y, base.lostTraffic.shift()!);
      if (this.tuning.chatter) this.chatter.trafficReplaced(this, this.traffic[this.traffic.length - 1].ship, base.poi);
    }
    this.events.push({ type: "sale", x: dock.x, y: dock.y });
  }

  private moveShots(dt: number): void {
    const remaining: Shot[] = [];
    for (const shot of this.shots) {
      shot.life -= dt;
      if (shot.life <= 0) continue;

      let stationHit: ReturnType<typeof sweepBox> = null;
      for (const dock of this.docks) {
        const from = this.toStationAxes(shot.x - dock.x, shot.y - dock.y, dock);
        const move = this.toStationAxes(shot.vx * dt, shot.vy * dt, dock);
        const dockHit = sweepBox(from.x, from.y, move.x, move.y, STATION_HALF, STATION_HALF);
        if (dockHit && (!stationHit || dockHit.t < stationHit.t)) stationHit = dockHit;
      }

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
    if (ship.hull <= 0 && shot.from.faction === "pirate") {
      ship.pirateKilledAt = this.clock;
      ship.pirateKilledIn = this.miningFieldAt(ship.x, ship.y).id;
    }
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

  /** A base's name, as news and shops show it. */
  baseName(id: string): string {
    const base = this.bases.find((each) => each.id === id);
    return base?.spec?.name ?? (id === FIRST_BASE ? "Station" : id);
  }

  /**
   * Once per stay in a dock, a ship and the dock's board tell each other what they know:
   * each keeps the newest word on every base and item, and both drop what's too old. The
   * base first puts up what it sells that nobody else can. Pirates and defenders keep out of it.
   */
  private swapNews(ship: Ship): void {
    if (ship.faction) return;
    const dock = this.dockedAt(ship);
    const base = dock && this.baseOf(dock);
    if (!base) {
      ship.newsFrom = null;
      return;
    }
    if (ship.newsFrom === base.id) return;
    ship.newsFrom = base.id;
    const own: Report[] = PARTS.filter((part) => part.held && this.unlocked(part.id, base)).map((part) => ({
      base: base.id,
      item: part.id,
      price: this.partPrice(part.id),
      seen: this.clock,
    }));
    const newest = new Map<string, Report>();
    const oldest = this.clock - this.tuning.newsLife;
    for (const report of [...base.board, ...ship.news, ...own]) {
      if (report.seen < oldest) continue;
      const key = `${report.base} ${report.item}`;
      const known = newest.get(key);
      if (!known || report.seen > known.seen) newest.set(key, report);
    }
    // Word of a base that's gone goes with it.
    const merged = [...newest.values()].filter((report) => this.bases.some((each) => each.id === report.base));
    base.board = merged;
    ship.news = [...merged];
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
        // The base it's docked at buys it, into its own store.
        const base = this.serviceBase(ship);
        this.accountOf(ship).credits += this.tuning.creditsPerOre;
        base.ore++;
        base.account.credits -= this.tuning.creditsPerOre;
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
    if (!this.hasPartsFor(repairCost, ship)) return false;
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
      else this.chargeForService(this.accountOf(ship), tuning.repairCost, this.serviceBase(ship));
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
