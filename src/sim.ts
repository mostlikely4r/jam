import { Chatter } from "./chatter";
import { type BayGrid, type BlueprintId, partFits, isGear, isItem, isProgram, isProject, PARTS, partOf, PROJECTS, TRAFFIC_BUY_ORDER, volumeOf, type PartId, type ShipModel } from "./parts";
import { hubRecipes, isOreItem, itemDef, oreItems, saleRecipes } from "./items";
import { copyPicks, pickOf, PROGRAMS, setPick as setTweakPick } from "./programs";
import { computerSize, DAMAGED_AT, facing, fitPart, HULL_INFO, hullMax, mountTakes, mountsOf, mountWith, thrustOf, turretMount, type Fitting, hullDefaults, install, type Module, type MountId, mountsFor, mountsHolding, nearestMount, newFitting, owns, refresh, trimPrograms, unfit, uninstall, works } from "./fitting";
import { ClickPilot, DronePilot, FighterPilot, LOW_HULL } from "./pilot";
export { MAX_HULL } from "./fitting";
import { pathAround } from "./route";
import { orbitState } from "./kepler";
import { autoPlace, canPlace, cellsOf, floatsAfterRemoval, footprint, reachable, reachableCells, sticks, usedCells, type GridSpec, type Placed } from "./grid";
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
/** Where the player's ship waits during `warmUp`: far past everything, so all of it is out of view. */
const WARM_UP_AWAY = 4e6;
export const TRAFFIC_SLEEP_DISTANCE = 12000;
export const SHIP_RADIUS = 12;
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
/** A deposit's size, for pointing at it and picking it: its ring around the middle. */
export const DEPOSIT_REACH = 150;
/** How many screens out the tutorial pair's arrows reach. A set indicator has no such limit. */
const POINTER_SCREENS = 2;
/** The items that are ore, until items have a type flag of their own (docs/items-plan.md). */
/** Plain ore, the item every rock gives: what the tuning's credits-per-ore used to be. */
const PLAIN_ORE = "ore" as PartId;
/** Part A: what every service and every module's recipe uses. */
const PART_A = "partA" as PartId;
/** A program's blueprint, as a share of what the program sells for. */
const BLUEPRINT_SHARE = 0.75;
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

/**
 * Something a pointer or the chart holds on to: a place, a deposit, a body, or a spot in space.
 * The handles are live, so an arrow follows what it names round its orbit; a point never moves.
 * A handle to something gone reads as nothing at all.
 */
export interface Target {
  poi?: Poi;
  deposit?: Deposit;
  body?: SolidBody;
  point?: { x: number; y: number };
}

/** Whether two targets are the same thing: one handle, or the same spot in space. */
function sameTarget(a: Target | null, b: Target | null): boolean {
  if (!a || !b) return false;
  if (a.poi && b.poi) return a.poi === b.poi;
  if (a.deposit && b.deposit) return a.deposit === b.deposit;
  if (a.body && b.body) return a.body === b.body;
  if (a.point && b.point) return a.point.x === b.point.x && a.point.y === b.point.y;
  return false;
}

export interface Ship extends Body, Fitting {
  model: ShipModel;
  /** Pirates and defenders. Everyone else is null. */
  faction: Faction | null;
  /** Where the last shot to hit this ship came from, until something reads it. */
  shotFrom: { x: number; y: number } | null;
  controls: Controls;
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
  /**
   * What the ship has picked, the main target first and the rest of the queue after it.
   * A rock that breaks hands its place to the pieces; anything that leaves the world, or goes
   * past the lock range, drops out. Targets aren't saved: a loaded game starts with none.
   */
  targets: Targetable[];
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
  /**
   * The base a ship belongs to, by id: a defender guards near there and is paid from there, and
   * the player's home arrow points there. Null: the nearest, which is the tutorial pair's station
   * until the player sets an indicator, and no arrow at all once they have.
   */
  home: string | null;
  /** What the destination arrow points at, or null. A live handle: it follows what it names. */
  destination: Target | null;
  /** The field the ore aboard was mined in, for the news a sale puts up. Null: not mined. */
  oreField: string | null;
  /** Seconds left before it explodes, once its hull has given out: out of control meanwhile. 0 while it's whole. */
  critical: number;
}

/** Where an item sits, for moving it: a mount, a place in the bay, or a place in the locker of the base the ship is at. */
export type ItemPlace = { at: "mount"; mount: MountId } | { at: "hold"; index: number } | { at: "locker"; index: number };

/** A spot on the bay's grid to put an item: its top-left cell, and whether it's turned 90 degrees. */
export interface Spot {
  x: number;
  y: number;
  turned: boolean;
}

/** Where a bought part is put: a mount, a spot in the bay, or a spot in the locker where the ship is docked. */
export type BuyInto = { at: "mount"; mount: MountId } | { at: "hold"; spot: Spot } | { at: "locker"; spot: Spot };

/** What a buy would do: the mounts it takes, or the spots it fills in the bay or locker, or why not. */
type BuyPlan = { where: "mount"; mounts: MountId[] } | { where: "hold" | "locker"; spots: Placed[] } | { refused: string };

export interface Rock extends Body {
  /** Still on its way in from outside the field. */
  arriving: boolean;
  /** Seconds since it was knocked out of its field, too fast to be pulled back. Older saves have none. */
  strayed?: number;
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
  /** What it carries: every item aboard, ore included, counted by volume. */
  items: Map<PartId, number>;
  /** Credits paid for ore this visit and not yet spent on parts. Below zero while parts were paid with ore still to come. */
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
  /** The base that built it, by id. */
  base: string;
  /** The POI it stands by, and the one whose side of that POI it keeps to. */
  at: Poi;
  toward: Poi;
  x: number;
  y: number;
  px: number;
  py: number;
  /** The ore it holds, by item: what's been sold into it and not yet bought out. */
  ore: Map<PartId, number>;
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
  /** The base that built it, by id. */
  base: string;
  host: Poi | Deposit;
  guns: Guard[];
  fromSwitch: boolean;
  partsLeft: number;
  partsUsed: number;
}

/** A place from the layout: where it is comes from its chain of orbits and the clock, never added up. */
export interface Poi {
  name: "field" | "station" | "pirate base";
  x: number;
  y: number;
  px: number;
  py: number;
  rotation: number;
  prevRotation: number;
  /** Size used when working out which POI is nearest. */
  reach: number;
  /** Rotation made on the current tick. */
  turn: number;
  /** Its chain of orbits. None: it stands still where it is. */
  orbits?: Orbit[];
  /** Its own true orbit for the chart, when `orbits` can't show it. */
  rings?: OrbitRing[];
  /** Within `full` of its edge it carries things fully, fading out by `none`. */
  carry: { full: number; none: number };
}

/**
 * The pirate base: where pirates dock, sell and buy, and the black market calls. Where it is
 * comes from the layout each time; what it holds (ore, money, pirates) is the world's, and saved.
 */
export interface PirateBaseSpec {
  name: string;
  rotationPeriod: number;
  /** Its spin at clock 0, in radians. */
  spinPhase?: number;
  orbits: Orbit[];
  /** Its own true orbit for the chart: the first's `center` is what it goes round. */
  rings?: OrbitRing[];
  carryFull: number;
  carryNone: number;
}

/**
 * A field: rocks and nothing else. Not saved: the designer (or the plain home, home.ts) hands
 * them over each time, and the rocks in them are saved like any other.
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
  /** Its spin at clock 0, in radians. */
  spinPhase?: number;
  orbits: Orbit[];
  /** Its own true orbit for the chart. */
  rings?: OrbitRing[];
  /** Items its rocks drop as well as plain ore: each is rolled once per ore roll. Without any, nothing extra. */
  drops?: FieldDrop[];
}

/** An item a field's rocks drop, and the chance of it on each roll. */
export interface FieldDrop {
  item: string;
  chance: number;
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
 * A station: where it is comes from the layout each time; what it holds is its own and is
 * saved (see `Base`). Anything it leaves out is the tuning's default for a station.
 */
export interface StationSpec {
  id: string;
  name: string;
  rotationPeriod: number;
  /** Its spin at clock 0, in radians. */
  spinPhase?: number;
  orbits: Orbit[];
  /** Its own true orbit for the chart. */
  rings?: OrbitRing[];
  carryFull: number;
  carryNone: number;
  /** Whether it rebuilds wrecks. Without one, the tuning's `stationShipyard`. */
  shipyard?: boolean;
  /** The field it sits by, by id: its haulers come and go on the far side from it, and its traffic works it. Without one, the nearest. */
  field?: string;
  /** Whether it builds projects: a deposit by its field, and turrets for itself and for the deposit. */
  projects?: boolean;
  /** Whether its news (new blueprints, projects built) goes out on the radio. */
  radio?: boolean;
  /** Its own turrets, once built: how many, the arc they stand in (degrees), and how far out. Without, the tuning's `stationGuard*`. */
  guards?: { count: number; arc: number; distance: number };
  /** The modules it starts able to sell. Without one it sells no module at all. */
  unlocked?: PartId[];
  /** The modules it would buy the blueprint for, when it can afford them. */
  wanted?: PartId[];
  /** Cells of storage: the player's lockers and its store of whole modules come out of it. Without one, the tuning's `stationStorage`. */
  storage?: number;
  /** Items in its store when the game starts. These come from nowhere: the plan's listed holes (docs/item-system-plan.md). */
  items?: { item: string; n: number }[];
}

/** The player's locker at a base: a grid as wide as the tuning says, with as many rows as are rented. */
export interface Locker {
  rows: number;
  items: Placed[];
}


/**
 * One piece of news: a base sells an item at a price, as seen at a moment on the clock. It
 * travels with ships from dock to dock and is dropped once it's too old to trust.
 */
export interface Report {
  base: string;
  item: PartId;
  price: number;
  seen: number;
  /** The field ore news names, when this is news of ore rather than of a price. */
  field?: string;
}

/** What makes two reports the same line: the base, the item, and for ore news the field. */
function newsKey(report: Report): string {
  return `${report.base} ${report.item} ${report.field ?? ""}`;
}

/**
 * A station with a dock, and everything that's its own: money, a store of ore and parts, a
 * shop that sells from that store, and a hauler that trades with it. Every base is a full
 * starter base, and every one comes from the layout.
 */
export interface Base {
  id: string;
  spec: StationSpec;
  poi: Poi;
  account: { credits: number };
  /** Ore bought and held for the next hauler, by item. */
  ore: Map<PartId, number>;
  /**
   * Service it has charged out that hasn't added up to a whole part A yet: a hull point's worth of
   * a repair is a fraction of one, so the fraction waits here until it is a part. Part A itself is
   * counted in `stock`, like every other item.
   */
  partCarry: number;
  /** Whole modules and parts in its store, ready to sell or use: what ships sold it, and its parts A. */
  stock: Map<PartId, number>;
  hauler: Hauler | null;
  /** Seconds until its next hauler sets out. */
  haulerTimer: number;
  /** Its traffic gone for good, waiting for it to replace them. */
  lostTraffic: ShipModel[];
  /** The module and program blueprints it holds: the modules it sells, and its programs beyond the first tier. */
  blueprints: Set<BlueprintId>;
  /** The modules it would buy the blueprint for. */
  wanted: Set<PartId>;
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
  | "id"
  | "account"
  | "ore"
  | "partCarry"
  | "stock"
  | "hauler"
  | "haulerTimer"
  | "lostTraffic"
  | "blueprints"
  | "wanted"
  | "blueprintPaid"
  | "blueprintsOrdered"
  | "board"
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

/** One ellipse in a body's motion (a circle unless it has an eccentricity): its size, seconds per lap, where it is at clock 0, and which way it counts. */
export interface Orbit {
  /** The semi-major axis: the radius, for a circle. */
  radius: number;
  period: number;
  /** The mean longitude at clock 0: for a circle, the angle it's at. */
  phase: number;
  sign: 1 | -1;
  /** 0 (the default) is a circle. See kepler.ts. */
  eccentricity?: number;
  /** Direction from the parent to the closest point, in radians. Default 0. */
  periapsis?: number;
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
  /** Its spin at clock 0, in radians. */
  spinPhase?: number;
  orbits: Orbit[];
  /** Its own true orbit for the chart, when `orbits` can't show it. */
  rings?: OrbitRing[];
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

/** An invisible point other things orbit, from the designer. It's found when its size comes on screen. */
export interface AnchorSpec {
  id: string;
  name: string;
  /** How far out it reaches. Zero is fine: a point is found the moment it's on screen. */
  radius: number;
  orbits: Orbit[];
  /** Its own true orbit for the chart, when `orbits` can't show it. */
  rings?: OrbitRing[];
}

/** One true orbit for the chart: the chain to what it goes round, and how far out. A thing's own chain loses it when the thing is an ancestor of the frame's centre. */
export interface OrbitRing {
  center: Orbit[];
  radius: number;
  /** 0 (the default) is a circle round `center`; otherwise an ellipse with `center` at a focus. */
  eccentricity?: number;
  /** Direction from `center` to the closest point, in radians. */
  periapsis?: number;
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
  for (const { radius, period, phase, sign, eccentricity = 0, periapsis = 0 } of orbits) {
    const at = orbitState({ radius, eccentricity, periapsis, phase, period }, time);
    x += sign * at.x;
    y += sign * at.y;
    vx += sign * at.vx;
    vy += sign * at.vy;
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

/**
 * What a target looks like when measuring how far it is outside the view: a circle round it, or
 * a station's box, which is its solid part and its dock together along the station's own x axis.
 */
interface Outline {
  x: number;
  y: number;
  /** How far it sticks out all round. Zero for a box, which `box` measures instead. */
  radius: number;
  /** Its own turn, which a box is measured in. */
  rotation: number;
  box?: { center: number; halfLength: number; halfWidth: number };
}

/** One arrow for something off screen: which slot it is, what it says, and what it points at. */
export interface Pointer {
  slot: "home" | "destination";
  /** What the arrow says: `home`, or the kind of what the destination holds. */
  label: string;
  /** What it points at, for the tooltip: the place's own name, or null for a spot in space. */
  name: string | null;
  reading: PoiReading;
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

/**
 * A loose item: a piece of ore, a part or a module adrift in space. Ore is what the tractor pulls
 * and any ship takes by touching it; a part or a module is picked up only by flying through it.
 */
export interface Loose extends Body {
  item: PartId;
  /** A module's wear. Nothing else wears. */
  wear: number;
  /** How many items are here: 1 for nearly everything, more for a flung piece of ore. */
  count: number;
  /** Ore only: which rock look it wears. */
  kind: number;
  /** Whose shot broke it loose, if anyone's. */
  from?: Ship | null;
  /** The ship whose tractor beam has caught it, if any. Only that ship pulls it in. */
  caughtBy?: Ship | null;
}

/** A piece of loose ore: what the tractor pulls and any ship takes by touching it. */
export type Ore = Loose;
/** A part or a module adrift: picked up only by flying through it. */
export type Loot = Loose;

/** Something a ship can pick as a target: a rock, a ship, a station, or something loose in space. */
export type Targetable = Rock | Loose | Ship | Base;

/** How a targetable thing reads: where it is this tick and last, how big, and how it moves. */
export interface TargetSpot extends Body {
  radius: number;
}

/**
 * Where a target is, how big it reads and how it moves. A station's body is its POI, so its
 * velocity is the POI's own; nothing else is carried differently from the ship here.
 */
export function targetSpot(target: Targetable): TargetSpot {
  if ("spec" in target) {
    const poi = target.poi;
    return { x: poi.x, y: poi.y, px: poi.px, py: poi.py, vx: (poi.x - poi.px) / TICK, vy: (poi.y - poi.py) / TICK, radius: STATION_HALF };
  }
  if ("model" in target) return { x: target.x, y: target.y, px: target.px, py: target.py, vx: target.vx, vy: target.vy, radius: SHIP_RADIUS };
  if ("item" in target) return { x: target.x, y: target.y, px: target.px, py: target.py, vx: target.vx, vy: target.vy, radius: 6 };
  return { x: target.x, y: target.y, px: target.px, py: target.py, vx: target.vx, vy: target.vy, radius: target.radius };
}

/** What a box pick catches, from the Targeting program's tweak. */
export type BoxPicks = "rocks" | "ships" | "everything";

/**
 * The player's ship is gone: its pod flies itself to the nearest shipyard, then the player
 * picks a bare hull or a rebuild of what they had, which takes a while.
 */
export interface Down {
  stage: "pod" | "choosing" | "rebuilding";
  /** The base with the shipyard the pod is making for. */
  base: string;
  /**
   * The pod's route and timing, laid out like a trip record's. It first drifts clear of the
   * ship at `vx, vy` (dying away) until `depart`, while the ship goes up and the view watches;
   * the route is laid out from wherever it has drifted to.
   */
  launched: number;
  vx: number;
  vy: number;
  path: { x: number; y: number }[];
  aim: { x: number; y: number };
  depart: number;
  arrive: number;
  /** Where the pod is now, and was last tick. */
  x: number;
  y: number;
  px: number;
  py: number;
  /** The ship as it was fitted when it went critical, for a rebuild. */
  lost: Partial<Record<MountId, PartId>>;
  /** Whether the ship has gone up yet. Until then it's still out there, tumbling. */
  exploded: boolean;
  /** When a rebuild will be ready. */
  readyAt: number;
  /** Whether it died marked or wanted: the new ship starts with a clean name, and the station says so. */
  cleared: boolean;
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

/** Where "the field" is in a world without any: a still spot at the middle, carrying nothing. */
const NOWHERE: Poi = { name: "field", x: 0, y: 0, px: 0, py: 0, rotation: 0, prevRotation: 0, reach: 0, turn: 0, carry: { full: 0, none: 0 } };

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
  /** Where pirates dock: the layout's pirate base, in a game with pirates. */
  pirateBase: Poi | null = null;
  /** The layout's pirate base, if it has one. Not saved: the layout hands it over each time. */
  pirateSpec: PirateBaseSpec | null = null;
  /** Every station with a dock, from the layout, in its order. */
  bases: Base[] = [];
  /** The player's lockers, by base id: what was left at each base stays there. */
  lockers = new Map<string, Locker>();
  /** Saved bases the designer hasn't handed over yet: picked up when it does. */
  private savedBases = new Map<string, BaseState>();
  deposits: Deposit[] = [];
  batteries: Battery[] = [];
  /** Ore at the pirate base, by item: for sale to empty holds and to the black market. */
  pirateOre = new Map<PartId, number>();
  /** The pirate base's money. It pays for repairs, rebuilds, new pirates and parts. */
  pirateCredits = 0;
  /** How many pirates the base fields. It grows once every pirate is fully fitted. */
  pirateCap = 0;
  blackMarket: BlackMarket | null = null;
  /** Seconds until the black market next sets out. */
  blackMarketTimer = 0;
  /** The ship most recently hit by a shot, if that was recent. */
  distress: { ship: Ship; age: number } | null = null;
  /**
   * Whether the player has set an indicator by hand. One bit for both slots: the first set takes
   * the tutorial pair away for good, and clearing a slot later doesn't bring it back.
   */
  pointersManual = false;
  /** Seconds since the world began, for things that fade. */
  private clock = 0;
  /** How long the world ran before the player joined (see `warmUp`). */
  warmedUp = 0;

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
  /** Anchors from the designer: invisible places for things to orbit, found by having them on screen. */
  anchors: AnchorSpec[] = [];
  /** Half the world the screen shows around the ship, in world units. The game sets it from the window. */
  screen = { halfWidth: 1200, halfHeight: 675 };
  /** Where new games start, by ship. Several for one ship: one is picked at random. None: by the field. */
  spawns: Spawn[] = [];

  /** Every field, from the layout, in its order. Rocks only: no station, deposit or traffic of their own. */
  extraFields: ExtraField[] = [];
  private miningCache: { clock: number; extras: ExtraField[]; fields: MiningField[] } | null = null;
  /** Where each body is this tick. */
  private bodySpots: { body: SolidBody; x: number; y: number; vx: number; vy: number }[] = [];
  shots: Shot[] = [];
  /** Loose ore: what the tractor pulls and any ship takes by touching it. */
  ores: Loose[] = [];
  /** Parts and modules adrift: picked up only by flying through them. */
  loot: Loose[] = [];
  /**
   * Where the items haulers carry off go: the world's one pool, off-screen. A recipe that
   * makes an item runs here the moment its inputs arrive (`feedHub`). Saved.
   */
  hub = new Map<PartId, number>();
  /**
   * Every item made or lost since the world began, by id: drops and recipe yields count up,
   * recipe inputs spent and loot forgotten count down. What a station starts with is not in
   * it (those come from nowhere), so the items there are in all equal the first count plus this.
   */
  itemFlow = new Map<PartId, number>();
  /** Set while the player has lost their ship and not yet got a new one. */
  down: Down | null = null;
  /**
   * The first field in the layout, for where a new game starts and the like. Worked out, not
   * kept. Without any field, a still spot at the middle of the world.
   */
  get field(): Poi {
    return this.extraFields[0]?.poi ?? NOWHERE;
  }
  /**
   * The first station in the layout, for where the UI looks first and the like. Worked out,
   * not kept: nothing in the world goes by it. Without any, a still spot at the middle.
   */
  get station(): Poi {
    const [first] = this.bases;
    return first?.poi ?? NOWHERE;
  }
  events: SimEvent[] = [];
  stats: Stats = { bestOre: 0, topSpeed: 0 };
  /** Places the player has found: the dock, a deposit, a seller. What help shows grows with it. */
  discovered = new Set<string>();
  /** The world's own random numbers, from a state that can be saved. */
  private randomState = { a: 1 };
  /** Picks the decals new ships wear: apart from the world's random numbers, so looks never change play. */
  private lookState = { a: 1 };
  /** The seed the world was made from: each never-seen field lays its rocks from it. */
  private seed = 1;
  private random = (): number => nextRandom(this.randomState);
  chatter = new Chatter(1);

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
      pointersManual: this.pointersManual,
      ship: this.ship,
      drones: this.drones.map(pilot),
      traffic: this.traffic.map(pilot),
      fighters: this.fighters.map((each) => each.ship),
      fighterRecords: this.fighters.map((each) => each.record),

      bases: this.bases.map(
        ({ id, account, ore, partCarry, stock, hauler, haulerTimer, lostTraffic, blueprints, wanted, blueprintPaid, blueprintsOrdered, board }): BaseState => ({
          id, account, ore, partCarry, stock, hauler, haulerTimer, lostTraffic, blueprints, wanted, blueprintPaid, blueprintsOrdered, board,
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
      loot: this.loot,
      hub: this.hub,
      itemFlow: this.itemFlow,
      down: this.down,
      stats: this.stats,
      discovered: this.discovered,
      sleeping: [...this.sleeping.values()],
      lockers: this.lockers,
      randomState: this.randomState,
      lookState: this.lookState,
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
      // Targets aren't saved: a loaded game starts with none.
      ship.targets = [];
      // And a saved ship without picks gets its own, not the one shared by every ship.
      ship.tweaks = copyPicks(ship.tweaks);
      return ship;
    };
    this.controls = data.controls;
    this.ship = fill(data.ship);
    const pilot = (each: { ship: Ship; buys: DronePilot["buys"]; flees: boolean; wishlist: PartId[]; working?: string; habit?: string | null; record?: TripRecord | null }) => {
      const made = new DronePilot(fill(each.ship));
      made.buys = each.buys;
      made.flees = each.flees;
      made.wishlist = each.wishlist;
      made.working = each.working ?? "";
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
      "pointersManual", "deposits", "batteries", "pirateOre",
      "pirateCredits", "pirateCap", "blackMarket", "blackMarketTimer", "distress", "clock", "rocks",
      "shots", "ores", "loot", "down", "stats", "randomState", "lookState", "seed",
    ] as const;
    for (const key of plain) if (key in data) Object.assign(this, { [key]: data[key] });
    const bases: BaseState[] = data.bases;
    this.savedBases = new Map(bases.map((state) => [state.id, state]));
    for (const base of this.bases) this.takeSaved(base);
    this.hub = data.hub ?? new Map();
    this.itemFlow = data.itemFlow ?? new Map();
    this.discovered = data.discovered ?? new Set();
    this.lockers = data.lockers ?? new Map();
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
    this.lookState = { a: (seed ^ 0x5bd1e995) >>> 0 };
    this.chatter = new Chatter(seed);
    // A new game starts on the tutorial pair.
    this.pointersManual = false;
    this.rocks = [];
    this.sleeping = new Map();
    this.shots = [];
    this.ores = [];
    this.loot = [];
    this.hub = new Map();
    this.itemFlow = new Map();
    this.down = null;
    this.events = [];
    this.stats = { bestOre: this.stats.bestOre, topSpeed: 0 };
    this.discovered = new Set();
    this.lockers = new Map();
    // The fields first: the pirate base goes round the first.
    for (const extra of this.extraFields) {
      this.fitExtraField(extra);
      extra.inflowTimer = 1;
    }
    this.placePirateBase();
    // Every base starts out as a starter base.
    this.bases = this.bases.map((base) => this.makeBase(base.id, base.spec, base.poi));
    for (const base of this.bases) this.fitBase(base);
    this.savedBases = new Map();
    this.startPlayer();
    this.warmedUp = 0;
    this.drones = [];
    this.distress = null;
    this.deposits = [];
    // The pirate base starts with plain ore, as the tuning's one number always was.
    this.pirateOre = new Map<PartId, number>();
    if (this.tuning.pirateStartOre > 0) this.pirateOre.set(PLAIN_ORE, this.tuning.pirateStartOre);
    this.pirateCredits = this.tuning.pirateStartCredits;
    this.pirateCap = this.tuning.pirateLimit;
    this.blackMarket = null;
    this.blackMarketTimer = this.tuning.blackMarketFirst;
    this.fighters = [];
    // Pirates start at their base, so a world without one has none.
    if (this.pirateBase) {
      for (let i = 0; i < this.tuning.pirates; i++) this.addFighter(this.pirateBase.x, this.pirateBase.y, "pirate");
    }
    for (const base of this.bases) this.addDefenders(base);
    this.traffic = [];
    const models: ShipModel[] = [
      ...Array<ShipModel>(this.tuning.trafficRacers).fill("racer"),
      ...Array<ShipModel>(this.tuning.trafficFloaters).fill("floater"),
    ];
    const { testDrones, trafficStartShare } = this.tuning;
    // Rows above and below the start line, alternating, one ship to a row.
    const row = (i: number) => (i + 1) * 70 * (i % 2 === 0 ? 1 : -1);
    for (let i = 0; i < testDrones; i++) this.addDrone(this.startX(), this.field.y + row(i));
    for (const extra of this.extraFields) this.layExtraField(extra);
    // Every base's traffic starts at work deep in the field by it, well out of the player's
    // sight, so the world shows itself bit by bit: first on the radio, then in person.
    if (this.extraFields.length > 0) {
      for (const base of this.bases) {
        const { poi, radius } = this.baseField(base);
        models.forEach((model, i) => this.addTraffic(poi.x + radius * trafficStartShare, poi.y + row(testDrones + i), model, base.id));
      }
    }
  }

  /**
   * Runs the world for a while before the player joins, with the player's ship far out of
   * view, so traffic is already on its way between places and news has reached the boards.
   * Then the ship goes back where the game started it, which has moved with its orbits.
   */
  warmUp(seconds: number): void {
    if (seconds <= 0) return;
    const { ship } = this;
    const chatter = this.tuning.chatter;
    this.tuning.chatter = false;
    const startClock = this.clock;
    for (let i = 0; i < Math.round(seconds / TICK); i++) {
      ship.x = ship.px = WARM_UP_AWAY;
      ship.y = ship.py = WARM_UP_AWAY;
      ship.vx = ship.vy = 0;
      this.step();
      this.events.length = 0;
    }
    this.tuning.chatter = chatter;
    this.startPlayer();
    this.warmedUp = this.clock - startClock;
  }

  /**
   * A new player's ship, in the ship picked, where new games start (a designer spawn for that
   * ship, or by the field), at the clock as it is now. The world around it is left as it is,
   * so it also starts a player in a world that has already been running.
   */
  startPlayer(): void {
    this.stats = { bestOre: this.stats.bestOre, topSpeed: 0 };
    this.resetPlayerControls();
    const model = this.tuning.floaterStart ? "floater" : "racer";
    this.ship = this.makeShip(this.startX(), this.field.y, this.controls, model);
    const spawns = this.spawns.filter((spawn) => spawn.ship === model);
    if (spawns.length > 0) {
      const at = orbitsAt(spawns[Math.floor(this.random() * spawns.length)].orbits, this.clock);
      Object.assign(this.ship, { x: at.x, y: at.y, px: at.x, py: at.y });
    }
    // A pilot comes knowing the programs the hull comes with: the floater's, to fly it by clicks.
    this.clickPilot = new ClickPilot(this.ship);
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
    return extra ? { count: extra.spec.rocks, radius: extra.spec.radius, drift: extra.spec.rockDrift } : { count: 0, radius: 0, drift: 0 };
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
    extra.poi.reach = extra.spec.radius;
    this.fitPlace(extra.poi, extra.spec);
  }

  /** A base as it starts out: the starter base's money and store, and its first hauler on the way. */
  private makeBase(id: string, spec: StationSpec, poi: Poi): Base {
    const { tuning } = this;
    // The items a station starts with come from nowhere: a listed hole in the item ledger.
    const stock = new Map(
      (spec.items ?? []).filter((each) => each.n > 0 && itemDef(each.item) !== undefined).map((each) => [each.item as PartId, Math.floor(each.n)]),
    );
    // And its parts A, which every service and every module's recipe uses.
    if (tuning.stationStartParts > 0) this.addTo(stock, PART_A, tuning.stationStartParts);
    return {
      id,
      spec,
      poi,
      account: { credits: tuning.stationStartCredits },
      ore: new Map<PartId, number>(tuning.stationStartOre > 0 ? [[PLAIN_ORE, tuning.stationStartOre]] : []),
      partCarry: 0,
      stock,
      hauler: null,
      haulerTimer: tuning.haulerFirst,
      lostTraffic: [],
      blueprints: new Set<BlueprintId>(spec.unlocked ?? []),
      wanted: new Set(spec.wanted ?? []),
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
      partCarry: saved.partCarry ?? 0,
      stock: saved.stock ?? new Map(),
      hauler: saved.hauler ?? null,
      haulerTimer: saved.haulerTimer ?? base.haulerTimer,
      lostTraffic: saved.lostTraffic ?? [],
      blueprints: saved.blueprints ?? base.blueprints,
      wanted: saved.wanted ?? base.wanted,
      blueprintPaid: saved.blueprintPaid ?? base.blueprintPaid,
      blueprintsOrdered: saved.blueprintsOrdered ?? base.blueprintsOrdered,
      board: saved.board ?? [],
    });
    return true;
  }

  /**
   * The base a ship belongs to: its own if it has one (defenders, traffic), and for anyone
   * else, or a ship whose base is gone, the nearest.
   */
  homeBaseOf(ship: Ship): Base {
    return (ship.home !== null && this.bases.find((base) => base.id === ship.home)) || this.nearestBase(ship.x, ship.y);
  }

  /**
   * The base nearest a spot, or the nearest with a shipyard. With no shipyard anywhere, the
   * nearest of any. A layout always has a base (see `applyLayout`).
   */
  nearestBase(x: number, y: number, shipyard = false): Base {
    const base = this.baseOf(this.nearestDock(x, y, shipyard));
    if (!base) throw new Error("No station in the world");
    return base;
  }

  /** The field a base sits by: the one its spec names, or the nearest. */
  baseField(base: Base): MiningField {
    const { field } = base.spec;
    return (field !== undefined && this.miningFields().find((each) => each.id === field)) || this.miningFieldAt(base.poi.x, base.poi.y);
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

  /** The base that serves a ship: where it's docked, or else its own. */
  private serviceBase(ship: Ship): Base {
    return this.baseAt(ship) ?? this.homeBaseOf(ship);
  }

  /** The shop the player sees: the base they're docked at, or else the nearest. */
  shopBase(): Base {
    return this.serviceBase(this.ship);
  }

  private fitBase(base: Base): void {
    this.fitPlace(base.poi, base.spec);
  }

  /** Puts a place where its orbits say now, with its spec's carrying. */
  private fitPlace(poi: Poi, spec: { orbits: Orbit[]; rings?: OrbitRing[]; carryFull: number; carryNone: number }): void {
    const at = orbitsAt(spec.orbits, this.clock);
    poi.orbits = spec.orbits;
    poi.rings = spec.rings;
    poi.carry = { full: spec.carryFull, none: Math.max(spec.carryFull, spec.carryNone) };
    poi.x = poi.px = at.x;
    poi.y = poi.py = at.y;
  }

  /** Moves a place along its orbits to the clock, and turns it, for one tick. */
  private movePlace(poi: Poi, spec: { orbits: Orbit[]; rotationPeriod: number }, dt: number): void {
    poi.px = poi.x;
    poi.py = poi.y;
    poi.prevRotation = poi.rotation;
    const at = orbitsAt(spec.orbits, this.clock);
    poi.x = at.x;
    poi.y = at.y;
    poi.turn = orbitRate(spec.rotationPeriod) * dt;
    poi.rotation += poi.turn;
  }

  /** Every field with its size. */
  private rockFields(): { poi: Poi; radius: number }[] {
    return this.extraFields.map(({ poi, spec }) => ({ poi, radius: spec.radius }));
  }

  /**
   * The fields whose rocks are out in the world, with where each is in `rockFields`. A
   * sleeping field's rocks are kept with it, so no loose rock is ever in one: each rock
   * only looks among these for its field, however many fields there are.
   */
  private awakeRockFields(): { poi: Poi; radius: number; index: number }[] {
    const ids = this.extraFields.map((extra) => extra.spec.id);
    return this.rockFields()
      .map((field, index) => ({ ...field, index }))
      .filter((field) => !this.sleeping.has(ids[field.index]));
  }

  /** Every field there is to mine, in the layout's order. */
  miningFields(): MiningField[] {
    // Asked for per rock and per ship, so worked out once a tick.
    const cache = this.miningCache;
    if (cache && cache.clock === this.clock && cache.extras === this.extraFields) return cache.fields;
    const fields = this.extraFields.map(({ poi, spec }) => ({ id: spec.id, poi, radius: spec.radius, full: spec.rocks }));
    this.miningCache = { clock: this.clock, extras: this.extraFields, fields };
    return fields;
  }

  /** The field by a ship's own base: where its pilot works when it has picked no other. */
  ownField(ship: Ship): MiningField {
    return this.baseField(this.homeBaseOf(ship));
  }

  /** The field whose edge is nearest a spot. */
  miningFieldAt(x: number, y: number): MiningField {
    const fields = this.miningFields();
    return fields[this.fieldAt(fields, x, y)];
  }

  /** Whether a rock belongs to a field: it's nearer that field's edge than any other's. */
  rockIn(field: MiningField, rock: Rock): boolean {
    if (this.extraFields.length <= 1) return true;
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

  /** The circle round a body that a route keeps out of, as it stands now or at a time on the clock. */
  keepOutAt(body: SolidBody, time = this.clock): { x: number; y: number; radius: number } {
    const at = bodyAt(body, time);
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

  /** The pirate base where the layout puts it, if the layout has one and the world has pirates. */
  private placePirateBase(): void {
    const spec = this.pirateSpec;
    if (!spec || this.tuning.pirates <= 0) {
      this.pirateBase = null;
      return;
    }
    const poi = this.makePoi("pirate base", PIRATE_BASE_RADIUS, (spec.spinPhase ?? 0) + orbitRate(spec.rotationPeriod) * this.clock);
    this.fitPlace(poi, spec);
    this.pirateBase = poi;
  }

  /** A place at the middle, turned to `rotation`, until its spec puts it where it goes. */
  private makePoi(name: Poi["name"], reach: number, rotation = 0): Poi {
    return { name, x: 0, y: 0, px: 0, py: 0, rotation, prevRotation: rotation, reach, turn: 0, carry: { full: 0, none: 0 } };
  }

  private makePilot(x: number, y: number, model: ShipModel = "racer"): DronePilot {
    const controls = { thrust: 0, strafe: 0, turn: 0, fire: false, retro: false, stabilize: false };
    return new DronePilot(this.makeShip(x, y, controls, model));
  }

  private addDrone(x: number, y: number): DronePilot {
    const drone = this.makePilot(x, y);
    if (this.extraFields.length > 0) drone.working = this.ownField(drone.ship).id;
    this.drones.push(drone);
    return drone;
  }

  /** Traffic flies as it starts out, and doesn't buy anything or grow in number. Its base is the first unless given. */
  private addTraffic(x: number, y: number, model: ShipModel, home: string | null = null): void {
    const pilot = this.makePilot(x, y, model);
    pilot.ship.home = home;
    pilot.buys = "upgrades";
    pilot.flees = true;
    // It starts out working the field by its own base.
    if (this.extraFields.length > 0) pilot.working = this.ownField(pilot.ship).id;
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
    fitPart(ship, "reverse");
    fitPart(ship, "strafe");
    this.fighters.push(new FighterPilot(ship));
  }

  /** Where a ship docks: its faction's own place, now or as of the previous tick. */
  homeOf(ship: Ship | null, faction = ship?.faction, previous = false): { x: number; y: number } {
    const pirates = this.pirateBase;
    if (faction === "pirate" && pirates) {
      return previous ? { x: pirates.px, y: pirates.py } : { x: pirates.x, y: pirates.y };
    }
    const base = ship ? this.homeBaseOf(ship) : this.nearestBase(this.field.x, this.field.y);
    return this.dockPoint(previous, base.poi);
  }

  /** Whether a ship is where it can sell and repair. */
  isHome(ship: Ship): boolean {
    const base = this.pirateBase;
    if (ship.faction === "pirate" && base) {
      return Math.hypot(ship.x - base.x, ship.y - base.y) < PIRATE_BASE_RADIUS;
    }
    return this.isDocked(ship);
  }

  /**
   * A box pick's kind test: rocks are rocks, ships are ships, and everything is everything.
   * A station and something loose count as everything, as there's no kind that names them.
   */
  private isKind(picks: BoxPicks, target: Targetable): boolean {
    if (picks === "everything") return true;
    if (picks === "ships") return "model" in target;
    return !("model" in target) && !("spec" in target) && !("item" in target);
  }

  /** The targetable things the box from one world spot to the other catches: centres inside it, nearest the ship first. */
  caughtInBox(ship: Ship, from: { x: number; y: number }, to: { x: number; y: number }): Targetable[] {
    const picks = pickOf(ship.tweaks, "targeting", "boxPicks") as BoxPicks;
    const left = Math.min(from.x, to.x);
    const right = Math.max(from.x, to.x);
    const top = Math.min(from.y, to.y);
    const bottom = Math.max(from.y, to.y);
    const near = (target: Targetable) => Math.hypot(targetSpot(target).x - ship.x, targetSpot(target).y - ship.y);
    return this.targetables()
      .filter((target) => target !== ship && this.isKind(picks, target) && this.inRange(ship, target))
      .filter((target) => {
        const spot = targetSpot(target);
        return spot.x >= left && spot.x <= right && spot.y >= top && spot.y <= bottom;
      })
      .sort((a, b) => near(a) - near(b));
  }

  /** Every pickable thing in the world: rocks, stations, loose ore and items, and ships. */
  targetables(): Targetable[] {
    return [...this.rocks, ...this.bases, ...this.ores, ...this.loot, ...this.ships];
  }

  /** Whether a thing is still in the world to be picked, and so still worth keeping as a target. */
  targetAlive(target: Targetable): boolean {
    if ("spec" in target) return this.bases.includes(target);
    if ("model" in target) return this.ships.includes(target);
    if ("item" in target) return this.ores.includes(target) || this.loot.includes(target);
    return this.rocks.includes(target);
  }

  /** Whether a target is within the lock range of a ship. */
  inRange(ship: Ship, target: Targetable): boolean {
    const spot = targetSpot(target);
    return Math.hypot(spot.x - ship.x, spot.y - ship.y) <= this.tuning.targetRange;
  }

  /** The main target: the first picked, or null when there's none. */
  mainTarget(ship: Ship): Targetable | null {
    return ship.targets[0] ?? null;
  }

  /**
   * A plain left click. A thing not picked becomes the only target; a picked one moves to the
   * front of the queue, becoming the main target, and the rest of the queue stays. A click on
   * nothing clears it all.
   */
  selectTarget(ship: Ship, target: Targetable | null): void {
    if (!target) {
      ship.targets = [];
      return;
    }
    // A thing out of the lock range, or gone, isn't picked; it doesn't clear what is.
    if (target === ship || !this.targetAlive(target) || !this.inRange(ship, target)) return;
    const at = ship.targets.indexOf(target);
    if (at < 0) {
      ship.targets = [target];
      return;
    }
    if (at === 0) return;
    ship.targets.splice(at, 1);
    ship.targets.unshift(target);
  }

  /** Ctrl and a left click: adds the thing to the queue, or takes it out. */
  toggleTarget(ship: Ship, target: Targetable | null): void {
    if (!target || target === ship) return;
    const at = ship.targets.indexOf(target);
    if (at >= 0) {
      ship.targets.splice(at, 1);
      return;
    }
    if (!this.targetAlive(target) || !this.inRange(ship, target)) return;
    ship.targets.push(target);
  }

  /** A box: its catch, nearest first. A plain box replaces the queue, Ctrl adds to it. */
  boxTargets(ship: Ship, from: { x: number; y: number }, to: { x: number; y: number }, add: boolean): void {
    const caught = this.caughtInBox(ship, from, to);
    ship.targets = add ? [...ship.targets, ...caught.filter((target) => !ship.targets.includes(target))] : caught;
  }

  /** Nothing picked any more. */
  clearTargets(ship: Ship): void {
    ship.targets = [];
  }

  /**
   * Keeps a ship's targets true: a rock that broke has handed over to its pieces already, and
   * what's gone from the world, too far off, or without Targeting loaded drops out here.
   */
  private upkeepTargets(pilots: (DronePilot | FighterPilot)[]): void {
    // Almost always nothing is picked; the check costs nothing until something is.
    if (this.ship.targets.length > 0) this.upkeepShipTargets(this.ship);
    for (const pilot of pilots) if (pilot.ship.targets.length > 0) this.upkeepShipTargets(pilot.ship);
  }

  /** One ship's targets, kept: what left the world, what's past the lock range, and no Targeting. */
  private upkeepShipTargets(ship: Ship): void {
    if (!ship.parts.has("targeting")) {
      ship.targets = [];
      return;
    }
    ship.targets = ship.targets.filter((target) => this.targetAlive(target) && this.inRange(ship, target));
  }

  /**
   * The pilot changes how one of its programs works, loaded or only owned. This is not a dock
   * act: a pick can change in flight. False when the pilot doesn't own the program, or the
   * tweak or the option doesn't exist.
   */
  setTweak(ship: Ship, programId: PartId, tweakId: string, optionId: string): boolean {
    if (!ship.software.has(programId)) return false;
    return setTweakPick(ship.tweaks, programId, tweakId, optionId);
  }

  /** The pilots whose ships are flown tick by tick: a record far off isn't one. */
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
  haulerSpot(previous: boolean, base: Base): { x: number; y: number; angle: number } | null {
    const { hauler } = base;
    if (!hauler) return null;
    return previous
      ? { x: hauler.px, y: hauler.py, angle: hauler.prevAngle }
      : { x: hauler.x, y: hauler.y, angle: hauler.angle };
  }

  /** The berth: where a docked hauler sits and which way it points, now or a tick ago. */
  haulerBerth(previous: boolean, base: Base): { x: number; y: number; angle: number } {
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
  haulerStandoff(previous: boolean, base: Base): { x: number; y: number } {
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

  /** The way out and in for a base's haulers: from its station, away from the field it sits by. */
  private haulerLane(base: Base): { x: number; y: number } {
    const station = base.poi;
    const field = this.extraFields.length > 0 ? this.baseField(base).poi : NOWHERE;
    const dx = station.x - field.x;
    const dy = station.y - field.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  /**
   * Rough seconds until a hauler is at the berth: 0 while one is there, null if none is coming.
   * It brakes all the way in, so the time left follows from the distance left.
   */
  haulerEta(base: Base): number | null {
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
        items: this.loadFromHub(base),
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
        // It takes every ore item the station holds, and sets down the parts it wants, paid in credits.
        const itemToLoad = () => this.haulerLoads(base, hauler);
        const itemToUnload = () => this.haulerUnloads(base, hauler);
        if (itemToLoad() === null && itemToUnload() === null) {
          hauler.idle += dt;
        } else {
          hauler.idle = 0;
          hauler.loadTimer += dt * tuning.haulerLoadRate;
          while (hauler.loadTimer >= 1 && (itemToLoad() !== null || itemToUnload() !== null)) {
            hauler.loadTimer -= 1;
            const load = itemToLoad();
            if (load !== null) {
              const price = this.haulerPays(load);
              // Its own ore store first, then any ore item in its stock.
              if ((base.ore.get(load) ?? 0) > 0) this.addTo(base.ore, load, -1);
              else this.addTo(base.stock, load, -1);
              this.addTo(hauler.items, load, 1);
              account.credits += price;
              hauler.earned += price;
            }
            const unload = itemToUnload();
            if (unload !== null) {
              // This visit's ore always pays for this visit's parts, even for a station in debt.
              const price = partOf(unload).price;
              this.addTo(hauler.items, unload, -1);
              this.addTo(base.stock, unload, 1);
              account.credits -= price;
              // This visit's ore pays first, ore still to come included: it may run ahead of what's aboard.
              const fromOre = hauler.earned + this.haulerOreToCome(base, hauler);
              hauler.earned -= Math.min(price, Math.max(0, fromOre));
            }
          }
        }
        const full = this.haulerVolumeUsed(hauler) >= tuning.haulerVolume - 1e-9;
        if ((full && itemToLoad() === null && itemToUnload() === null) || hauler.idle >= HAULER_WAIT_SECONDS) {
          hauler.stage = "undocking";
          hauler.time = 0;
          if (tuning.chatter) this.chatter.haulerLeaving(this, base, this.oreAboard(hauler));
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
          // Out of sight, what it carries goes to the hub, where recipes run: it leaves loaded.
          this.unloadToHub(hauler);
          base.hauler = null;
        }
        return;
      }
    }
  }

  /**
   * Puts items in a base's store out of nothing: how a designer's starting items arrive, and what
   * tests use. It is a hole in the item ledger (`itemFlow`) on purpose: nothing counts it.
   */
  stockItem(base: Base, id: PartId, n: number): void {
    this.addTo(base.stock, id, n);
  }

  /** Adds to (or takes from) a count in a map of counts, dropping the entry at zero. */
  private addTo(counts: Map<PartId, number>, id: PartId, by: number): void {
    const next = (counts.get(id) ?? 0) + by;
    if (next > 0) counts.set(id, next);
    else counts.delete(id);
  }

  /** Counts an item made or lost in the world's ledger (`itemFlow`). */
  private flow(id: PartId, by: number): void {
    const next = (this.itemFlow.get(id) ?? 0) + by;
    if (next === 0) this.itemFlow.delete(id);
    else this.itemFlow.set(id, next);
  }

  /** How many ore items a hauler carries, all told. */
  private oreAboard(hauler: Hauler): number {
    let count = 0;
    for (const [id, held] of hauler.items) if (isOreItem(id)) count += held;
    return count;
  }

  /** The room items aboard a hauler take, in volume. */
  private haulerVolumeUsed(hauler: Hauler): number {
    let used = 0;
    for (const [id, count] of hauler.items) used += volumeOf(id) * count;
    return used;
  }

  /** What plain ore is worth: the ore item's own price, and the base every other rate is a share of. */
  plainOrePrice(): number {
    return itemDef(PLAIN_ORE)?.price ?? 0;
  }

  /** What a hauler pays a station for an ore item: the item's price, plus its markup. */
  haulerPays(id: PartId): number {
    return Math.round(partOf(id).price * this.tuning.haulerMarkup);
  }

  /** The parts A a base holds. */
  partA(base: Base): number {
    return this.stockOf(base, PART_A);
  }

  /**
   * Whether a base asks for a part: every part the recipe of a module it sells takes in, and part
   * A, which its repairs and projects use. It asks while it holds fewer than its target.
   */
  needsItem(base: Base, id: PartId): boolean {
    if (id === PART_A) return this.partA(base) < this.tuning.stationPartsTarget;
    if (this.stockOf(base, id) >= this.tuning.itemTarget) return false;
    return saleRecipes().some((recipe) => recipe.from.some((each) => each.item === id) && this.unlocked(recipe.makes as PartId, base));
  }

  /**
   * What a hauler setting out takes from the hub: every part the base asks for, as far as its room
   * goes. The hub is infinite, so its counts only show what haulers brought and what it gave out.
   */
  private loadFromHub(base: Base): Map<PartId, number> {
    const { tuning } = this;
    const items = new Map<PartId, number>();
    const hauler = { items } as Hauler;
    const wanted = new Set<PartId>([PART_A]);
    for (const recipe of saleRecipes()) {
      if (!this.unlocked(recipe.makes as PartId, base)) continue;
      for (const each of recipe.from) wanted.add(each.item as PartId);
    }
    for (const id of wanted) {
      const target = id === PART_A ? tuning.stationPartsTarget : tuning.itemTarget;
      const need = target - this.stockOf(base, id) - (items.get(id) ?? 0);
      if (need <= 0) continue;
      const fits = Math.floor((tuning.haulerVolume - this.haulerVolumeUsed(hauler)) / Math.max(volumeOf(id), 1e-9));
      const take = Math.min(need, fits);
      if (take <= 0) continue;
      this.addTo(items, id, take);
      const had = this.hub.get(id) ?? 0;
      if (had > 0) this.addTo(this.hub, id, -Math.min(had, take));
      // The hub is infinite: what it didn't hold, it made from nothing, and the ledger says so.
      const made = Math.max(0, take - had);
      if (made > 0) this.flow(id, made);
    }
    return items;
  }

  /**
   * The ore item a hauler at the berth would load now: any ore the station holds, in its own ore
   * store or in its stock, needed or not, that it has room for.
   */
  private haulerLoads(base: Base, hauler: Hauler): PartId | null {
    const room = this.tuning.haulerVolume - this.haulerVolumeUsed(hauler);
    for (const item of oreItems()) {
      const id = item.id as PartId;
      if ((base.ore.get(id) ?? 0) + this.stockOf(base, id) < 1) continue;
      if (volumeOf(id) > room + 1e-9) continue;
      return id;
    }
    return null;
  }

  /**
   * What the ore still waiting for a hauler at the berth will pay: as much of the station's ore as
   * fits in the room it will have once its parts are off.
   */
  private haulerOreToCome(base: Base, hauler: Hauler): number {
    let room = this.tuning.haulerVolume;
    for (const [id, count] of hauler.items) if (isOreItem(id)) room -= volumeOf(id) * count;
    let worth = 0;
    for (const item of oreItems()) {
      const id = item.id as PartId;
      const volume = Math.max(volumeOf(id), 1e-9);
      const takes = Math.min((base.ore.get(id) ?? 0) + this.stockOf(base, id), Math.floor((room + 1e-9) / volume));
      if (takes <= 0) continue;
      room -= takes * volume;
      worth += takes * this.haulerPays(id);
    }
    return worth;
  }

  /**
   * The part a hauler at the berth would set down now: one the base asks for, paid for out of
   * credits, or out of this visit's ore: what the hauler has paid so far and the ore still to come.
   * A hauler that comes in full has no room for that ore until its parts are off, so the ore a
   * station in debt holds has to count before it's aboard, or the hauler leaves with both.
   */
  private haulerUnloads(base: Base, hauler: Hauler): PartId | null {
    const fromOre = hauler.earned + this.haulerOreToCome(base, hauler);
    for (const [id, count] of hauler.items) {
      if (count < 1 || !this.needsItem(base, id)) continue;
      const price = partOf(id).price;
      if (base.account.credits >= price || fromOre >= price) return id;
    }
    return null;
  }

  /** A hauler leaving puts everything it carries into the hub, then the hub runs what it can. */
  private unloadToHub(hauler: Hauler): void {
    for (const [id, count] of hauler.items) this.addTo(this.hub, id, count);
    hauler.items.clear();
    this.feedHub();
  }

  /** Runs every hub recipe as long as the hub holds its inputs: n of one item becomes m of another. */
  feedHub(): void {
    for (const recipe of hubRecipes()) {
      const makes = recipe.makes as PartId;
      const yields = recipe.yields ?? 1;
      while (recipe.from.every((each) => (this.hub.get(each.item as PartId) ?? 0) >= each.n)) {
        for (const each of recipe.from) {
          this.addTo(this.hub, each.item as PartId, -each.n);
          this.flow(each.item as PartId, -each.n);
        }
        this.addTo(this.hub, makes, yields);
        this.flow(makes, yields);
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

  /** Flies the ship in a straight line to a world position and stops, ignoring anything in the way. */
  orderMoveStraight(x: number, y: number): boolean {
    if (!this.ship.parts.has("clickMove")) return false;
    this.clickPilot.moveTo(this, x, y, 0, 0, false, true);
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
    return this.field.x - this.field.reach - 200;
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
      ...newFitting(model, () => nextRandom(this.lookState)),
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
      unloadTimer: 0,
      angle: 0,
      prevAngle: 0,
      spin: 0,
      hull: hullMax(model),
      cooldown: 0,
      turretAngle: 0,
      prevTurretAngle: 0,
      aim: null,
      targets: [],
      firing: new Map(),
      marked: false,
      wanted: false,
      pirateKilledAt: null,
      pirateKilledIn: null,
      home: null,
      destination: null,
      oreField: null,
      critical: 0,
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
    ship.hull = hullMax(ship.model);
    ship.cooldown = 0;
    ship.hold = [];
    ship.unloadTimer = 0;
    ship.firing.clear();
    // A new ship starts with a clean name.
    ship.marked = false;
    ship.wanted = false;
  }

  /** Every part adds weight, which divides all of the ship's thrust. */
  shipWeight(ship: Ship): number {
    let weight = HULL_INFO[ship.model].weight ?? this.tuning.weight;
    for (const module of Object.values(ship.fit)) {
      if (!module) continue;
      const part = partOf(module.part);
      weight += (part.weight / (part.set ?? 1)) * this.tuning.partWeightScale;
    }
    return weight;
  }

  /** Acceleration per unit of thrust: the ship's engine power divided by its weight. */
  shipResponse(ship: Ship): number {
    // The main thruster sets the power of them all, working or not: it's what feeds them.
    const main = mountsOf(ship)
      .filter((mount) => mount.role === "thrusterMain")
      .map((mount) => ship.fit[mount.id])
      .find((module) => module !== undefined);
    const engine = (main ? partOf(main.part).engine : ship.model) === "floater" ? this.tuning.floaterEngine : 1;
    return engine / this.shipWeight(ship);
  }

  partPrice(id: PartId): number {
    const part = partOf(id);
    // An item and a program pay what they say: the price scale is for parts with neither.
    return itemDef(id) || isProgram(id) ? part.price : Math.round(part.price * this.tuning.partPriceScale);
  }

  /** What a bare hull of this model costs: the hull's own price, or the tuning's rebuild cost. */
  hullPrice(model: ShipModel): number {
    return HULL_INFO[model].price ?? this.tuning.rebuildCost;
  }

  private blueprintTier(id: BlueprintId): number {
    if (isProject(id)) return 3;
    return id === "drone" ? 2 : partOf(id).tier;
  }

  /**
   * Whether a base's shop can sell this: by default the one the player is docked at, or the
   * nearest. A module is sold only by a station whose lists it's in. A program, and the drone,
   * need a blueprint once the shop needs them paid for. A project is the base's own once built.
   */
  unlocked(id: BlueprintId, base: Base = this.shopBase()): boolean {
    if (id === "deposit") return this.deposits.some((deposit) => deposit.base === base.id && deposit.partsLeft <= 0);
    if (id === "stationGuards" || id === "depositGuards") {
      return this.batteries.some((battery) => battery.id === id && battery.base === base.id && battery.partsLeft <= 0);
    }
    if (isProject(id)) return false;
    if (itemDef(id)?.type === "module") return base.blueprints.has(id);
    return !this.tuning.stationUnlocks || this.blueprintTier(id) === 0 || base.blueprints.has(id);
  }

  blueprintPrice(id: BlueprintId): number {
    if (id === "deposit") return this.tuning.depositPrice;
    if (id === "stationGuards") return this.tuning.stationGuardPrice;
    if (id === "depositGuards") return this.tuning.depositGuardPrice;
    if (id === "drone") return this.tuning.dronePrice;
    // A module's blueprint price is its item's; a program's is a share of what it sells for.
    const item = itemDef(id);
    if (item?.type === "module") return item.blueprintPrice;
    return Math.round(this.partPrice(id as PartId) * BLUEPRINT_SHARE);
  }

  /** What's still owed on a blueprint. */
  blueprintLeft(id: BlueprintId, base: Base = this.shopBase()): number {
    return Math.max(0, this.blueprintPrice(id) - (base.blueprintPaid.get(id) ?? 0));
  }

  /** A base's blueprints still to get, next first: most paid toward, then by tier, then cheapest. */
  blueprintQueue(base: Base): BlueprintId[] {
    if (!this.tuning.stationUnlocks) return [];
    const paid = (id: BlueprintId) => base.blueprintPaid.get(id) ?? 0;
    // Every module, and every program: a program's blueprint is bought the same way.
    const ids: BlueprintId[] = [...PARTS.filter(isGear).map((part) => part.id), ...PROGRAMS.map((program) => program.id as PartId), "drone", ...PROJECTS];
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
   * Whether a base can pay toward this now. Only a base that builds projects orders them, and
   * turrets for the deposit need a deposit to stand on. A module is ordered only if the station
   * wants it: nobody can push one on a station that doesn't.
   */
  private canOrder(id: BlueprintId, base: Base): boolean {
    if (isProject(id) && !base.spec.projects) return false;
    if (id === "depositGuards" && !this.unlocked("deposit", base)) return false;
    if (this.unlocked(id, base) || base.blueprintsOrdered.has(id)) return false;
    if (itemDef(id)?.type === "module" && !base.wanted.has(id as PartId)) return false;
    return true;
  }

  /**
   * Whether a base's shop lists a module at all: one it sells, has on order, or wants. A module it
   * neither sells nor wants isn't shown, as nobody can fund it there. Anything else is always listed.
   */
  shopLists(id: PartId, base: Base = this.shopBase()): boolean {
    if (itemDef(id)?.type !== "module") return true;
    return this.unlocked(id, base) || base.blueprintsOrdered.has(id) || base.wanted.has(id);
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
    if (id === "deposit") this.addDeposit(base, false, this.tuning.depositParts);
    if (id === "stationGuards") this.addBattery(base, id, false, this.tuning.stationGuardParts);
    if (id === "depositGuards") this.addBattery(base, id, false, this.tuning.depositGuardParts);
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
    if (!this.tuning.chatter || !base.spec.radio) return;
    this.chatter.unlocked(
      this,
      base.poi,
      arrived.map((id) => (id === "drone" ? "drones" : partOf(id).label.toLowerCase())),
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

  /** A base's deposit: out by the field it sits by, on that base's side. */
  private addDeposit(base: Base, fromSwitch: boolean, partsLeft: number): Deposit {
    const at = this.baseField(base).poi;
    const toward = base.poi;
    const { x, y } = this.depositSpot(at, toward);
    const name = "field deposit";
    const deposit: Deposit = { name, base: base.id, at, toward, x, y, px: x, py: y, ore: new Map(), fromSwitch, partsLeft, partsUsed: 0 };
    this.deposits.push(deposit);
    return deposit;
  }

  /** The base a project is for. Projects of a base that's gone are dropped with it (see `applyLayout`). */
  private projectBase(project: Deposit | Battery): Base | null {
    return this.bases.find((base) => base.id === project.base) ?? null;
  }

  /** Keeps each deposit at its spot by its POI, and in step with the testing switch. */
  private moveDeposits(): void {
    if (this.tuning.depositFree && this.extraFields.length > 0) {
      for (const base of this.bases) {
        if (base.spec.projects && !this.deposits.some((deposit) => deposit.base === base.id)) this.addDeposit(base, true, 0);
      }
    }
    if (this.tuning.depositFree) {
      for (const deposit of this.deposits) if (deposit.partsLeft > 0) this.finishDeposit(deposit);
    }
    if (!this.tuning.depositFree) this.deposits = this.deposits.filter((deposit) => !deposit.fromSwitch);
    for (const deposit of this.deposits) {
      // The places come from the layout and aren't saved, so a loaded deposit finds its own again.
      const base = this.projectBase(deposit);
      if (base && this.extraFields.length > 0) {
        deposit.at = this.baseField(base).poi;
        deposit.toward = base.poi;
      }
      deposit.px = deposit.x;
      deposit.py = deposit.y;
      Object.assign(deposit, this.depositSpot(deposit.at, deposit.toward));
    }
  }

  private finishDeposit(deposit: Deposit): void {
    deposit.partsLeft = 0;
    const base = this.projectBase(deposit);
    base?.blueprintsOrdered.delete("deposit");
    if (this.tuning.chatter && base?.spec.radio) this.chatter.depositBuilt(this, base.poi);
  }

  /** A station's own turrets, as its spec or else the tuning says. */
  private guardsOf(base: Base): { count: number; arc: number; distance: number } {
    const { stationGuardCount, stationGuardArc, stationGuardDistance } = this.tuning;
    return base.spec.guards ?? { count: stationGuardCount, arc: stationGuardArc, distance: stationGuardDistance };
  }

  private addBattery(base: Base, id: Battery["id"], fromSwitch: boolean, partsLeft: number): void {
    const host = id === "stationGuards" ? base.poi : this.deposits.find((deposit) => deposit.base === base.id && deposit.partsLeft <= 0);
    if (!host) return;
    const count = id === "stationGuards" ? this.guardsOf(base).count : this.tuning.depositGuardCount;
    const guns: Guard[] = [];
    for (let i = 0; i < count; i++) {
      const controls = { thrust: 0, strafe: 0, turn: 0, fire: false, retro: false, stabilize: false };
      const gun = this.makeShip(host.x, host.y, controls);
      gun.faction = "defender";
      guns.push({ x: host.x, y: host.y, px: host.x, py: host.y, angle: 0, prevAngle: 0, cooldown: 0, gun });
    }
    const battery: Battery = { id, base: base.id, host, guns, fromSwitch, partsLeft, partsUsed: 0 };
    this.batteries.push(battery);
    this.placeGuards(battery);
    for (const guard of guns) {
      guard.px = guard.x;
      guard.py = guard.y;
    }
  }

  /**
   * Floating, and placed by where things are. On a deposit's ring, starting square to the
   * way to the station. For a station, in an arc in front of it, facing the field it sits by.
   */
  private placeGuards(battery: Battery): void {
    const { host, guns } = battery;
    const base = this.projectBase(battery);
    if (!base) return;
    const { depositReach } = this.tuning;
    const guards = this.guardsOf(base);
    const atDeposit = host.name === "field deposit";
    const toward = atDeposit ? host.toward : this.baseField(base).poi;
    const facing = Math.atan2(toward.y - host.y, toward.x - host.x);
    const radius = atDeposit ? depositReach : guards.distance;
    const arc = (guards.arc * Math.PI) / 180;
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

  /** Each base that builds projects gets this battery free while its testing switch is on, and loses a free one when it's off. */
  private syncFreeBattery(id: Battery["id"], free: boolean): void {
    for (const base of this.bases) {
      if (!base.spec.projects) continue;
      const battery = this.batteries.find((candidate) => candidate.id === id && candidate.base === base.id);
      if (free && !battery) this.addBattery(base, id, true, 0);
      if (free && battery && battery.partsLeft > 0) this.finishBattery(battery);
      if (!free && battery?.fromSwitch) this.batteries = this.batteries.filter((other) => other !== battery);
    }
  }

  /** Keeps the turrets on what they stand on, and in step with the testing switches. */
  private moveGuards(): void {
    this.syncFreeBattery("stationGuards", this.tuning.guardsStationFree);
    this.syncFreeBattery("depositGuards", this.tuning.guardsDepositFree);
    // Turrets go when the deposit under them does.
    this.batteries = this.batteries.filter((battery) => {
      if (battery.host.name !== "field deposit" || this.deposits.includes(battery.host)) return true;
      this.projectBase(battery)?.blueprintsOrdered.delete(battery.id);
      return false;
    });
    for (const battery of this.batteries) {
      // A station's turrets stand on its station as the layout has it now, a loaded game's too.
      const base = this.projectBase(battery);
      if (battery.id === "stationGuards" && base) battery.host = base.poi;
      this.placeGuards(battery);
    }
  }

  private finishBattery(battery: Battery): void {
    battery.partsLeft = 0;
    const base = this.projectBase(battery);
    base?.blueprintsOrdered.delete(battery.id);
    if (this.tuning.chatter && base?.spec.radio) this.chatter.guardsBuilt(this, base.poi, battery.id === "stationGuards");
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

  /** Funded projects are built from whatever parts their base can spare past its reserve. */
  private buildProjects(dt: number): void {
    const { depositBuildRate, stationReserveParts } = this.tuning;
    for (const project of [...this.deposits, ...this.batteries]) {
      if (project.partsLeft <= 0) continue;
      const base = this.projectBase(project);
      if (!base) continue;
      const spare = this.partA(base) + base.partCarry - stationReserveParts;
      const used = Math.min(depositBuildRate * dt, spare, project.partsLeft);
      if (used <= 0) continue;
      this.spendPartA(base, used);
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

  /** The nearest deposit with room that's closer than the nearest dock, for a ship with ore to get rid of. */
  depositFor(ship: Ship): Deposit | null {
    const dock = this.dockPoint(false, this.nearestDock(ship.x, ship.y));
    let best = Math.hypot(dock.x - ship.x, dock.y - ship.y);
    let found: Deposit | null = null;
    for (const deposit of this.deposits) {
      const distance = Math.hypot(deposit.x - ship.x, deposit.y - ship.y);
      if (deposit.partsLeft <= 0 && this.depositRoom(deposit) > 0 && distance < best) {
        best = distance;
        found = deposit;
      }
    }
    return found;
  }

  /** How much room a deposit has left, in volume. */
  depositRoom(deposit: Deposit): number {
    let used = 0;
    for (const [id, count] of deposit.ore) used += volumeOf(id) * count;
    return Math.max(0, this.tuning.depositCapacity - used);
  }

  /** How much ore this ship could sell into the deposit right now. */
  depositSellable(ship: Ship, deposit: Deposit): number {
    return this.depositSale(ship, deposit, false);
  }

  /**
   * Sells the ore in a ship's bay into the deposit, for as much as it has room for, or just
   * counts what would go. Ore that holds something up in the bay stays.
   */
  private depositSale(ship: Ship, deposit: Deposit, sell: boolean): number {
    if (this.depositAt(ship) !== deposit) return 0;
    let room = this.depositRoom(deposit);
    let count = 0;
    let credits = 0;
    for (let i = ship.hold.length - 1; i >= 0; i--) {
      const placed = ship.hold[i];
      if (!isOreItem(placed.module.part)) continue;
      const size = volumeOf(placed.module.part);
      if (size > room) continue;
      if (this.floatingWithout(ship, i).length > 0) continue;
      room -= size;
      count++;
      credits += this.tuning.depositPays;
      if (!sell) continue;
      ship.hold.splice(i, 1);
      this.addTo(deposit.ore, placed.module.part, 1);
    }
    if (!sell || count === 0) return count;
    this.accountOf(ship).credits += credits;
    const base = this.projectBase(deposit);
    if (base) base.account.credits -= credits;
    ship.earned += credits;
    if (this.oreIn(ship) === 0) ship.trips++;
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    this.postOreNews(ship, this.projectBase(deposit));
    return count;
  }

  /** How many ore items a ship carries: every piece of ore in its bay. */
  oreIn(ship: Ship): number {
    let count = 0;
    for (const placed of ship.hold) if (isOreItem(placed.module.part)) count++;
    return count;
  }

  /**
   * How much room a ship has for ore: the free cells of its bay that ore can reach from the entry.
   * The entry's own cells are where things come in, so nothing sits on them.
   */
  cargoSpace(ship: Ship): number {
    const grid = this.bayGrid(ship);
    return grid ? reachableCells(grid, this.packed(ship)) : 0;
  }

  /** Everything that takes cells in the bay, for its rules. */
  packed(ship: Ship, hold: Placed[] = ship.hold): Placed[] {
    return hold;
  }

  /** The grid of the ship's fitted bay, unless it's destroyed: a ship without one carries nothing. */
  bayGrid(ship: Ship): BayGrid | null {
    for (const module of Object.values(ship.fit)) {
      const bay = module && module.wear < 1 ? partOf(module.part).bay : undefined;
      if (bay) return bay;
    }
    return null;
  }

  /** All the room in a ship's bay, in cells, with nothing in it. */
  bayTotal(ship: Ship): number {
    const grid = this.bayGrid(ship);
    return grid ? grid.w * grid.h : 0;
  }

  /** How many cells the modules in the bay take. */
  holdSize(ship: Ship): number {
    return usedCells(ship.hold);
  }

  /**
   * Puts exactly this many plain ore items in a ship's bay, adding or taking out as needed: what
   * the designer's dev panel and the tests use. The game itself never sets a number.
   */
  setOre(ship: Ship, count: number): void {
    let now = 0;
    for (const placed of ship.hold) if (placed.module.part === PLAIN_ORE) now++;
    if (count > now) this.placeInBay(ship, PLAIN_ORE, count - now);
    for (let i = ship.hold.length - 1; i >= 0 && now > count; i--) {
      if (ship.hold[i].module.part !== PLAIN_ORE) continue;
      const floating = this.floatingWithout(ship, i).length > 0;
      if (floating) continue;
      ship.hold.splice(i, 1);
      now--;
    }
  }

  /**
   * Where an item would go in the bay beside what's there now, or null if nowhere: a spot that
   * sticks and keeps the entry open.
   */
  holdSpotFor(ship: Ship, item: Module): Placed | null {
    const grid = this.bayGrid(ship);
    if (!grid) return null;
    const packed = this.packed(ship);
    // A piece of ore may sit on the way in: it's a cell that holds a cell, and it comes and goes.
    const spot = autoPlace(grid, packed, item, isOreItem(item.part));
    if (!spot) return null;
    // Wherever it goes, the entry has to be able to reach it.
    const open = reachable(grid, packed);
    return cellsOf(spot).every((cell) => open.has(cell.y * grid.w + cell.x)) ? spot : null;
  }

  /** Whether a module would fit in the bay beside what's there now. */
  hasRoomFor(ship: Ship, item: Module): boolean {
    return this.holdSpotFor(ship, item) !== null;
  }

  /** The modules in the bay that would be left floating if the one at this index came out. */
  floatingWithout(ship: Ship, index: number): Module[] {
    const grid = this.bayGrid(ship);
    const item = ship.hold[index];
    if (!grid || !item) return [];
    return floatsAfterRemoval(grid, this.packed(ship), item).map((each) => each.module);
  }

  /** Puts as many of an item into a ship's bay as fit, and returns how many went in. Works in flight too. */
  placeInBay(ship: Ship, id: PartId, count = 1, wear = 0): number {
    let placed = 0;
    while (placed < count) {
      const spot = this.holdSpotFor(ship, { part: id, wear });
      if (!spot) break;
      ship.hold.push(spot);
      placed++;
    }
    return placed;
  }

  /**
   * Puts what fits of a loose piece into a ship's bay, and returns how many of it went in. What
   * doesn't fit stays loose.
   */
  private takeLoose(ship: Ship, ore: Loose): number {
    return this.placeInBay(ship, ore.item, ore.count, ore.wear);
  }

  /**
   * After the bay or its contents change: keeps every module where it is if it all still fits
   * and sticks, or else packs them in again, biggest first. What won't go in goes into the
   * player's locker at the base, is sold there by anyone else, or out in space drifts off.
   */
  private settleHold(ship: Ship, base: Base | null): void {
    const grid = this.bayGrid(ship);
    if (grid && ship.hold.every((item) => canPlace(grid, this.packed(ship), item))) return;
    if (!grid && ship.hold.length === 0) return;
    const items = ship.hold.map((item) => item.module).sort((a, b) => cellCount(b) - cellCount(a));
    ship.hold = [];
    for (const module of items) {
      const spot = grid ? autoPlace(grid, this.packed(ship), module) : null;
      if (spot) ship.hold.push(spot);
      else if (base) this.stow(ship, [module], base);
      else this.setAdrift(ship, module, 25);
    }
  }

  /** The load an AI ship waits for before heading in to deliver. */
  deliveryLoad(ship: Ship): number {
    return Math.max(1, Math.ceil(this.cargoSpace(ship) * this.tuning.deliverShare));
  }

  /** How many ore items are in a map of ore, all told. */
  oreCount(ore: Map<PartId, number>): number {
    let count = 0;
    for (const held of ore.values()) count += held;
    return count;
  }

  /** How much ore this ship could buy from the deposit right now. */
  depositBuyable(ship: Ship, deposit: Deposit): number {
    if (this.depositAt(ship) !== deposit) return 0;
    const { depositSells } = this.tuning;
    const affordable = depositSells > 0 ? Math.floor(this.accountOf(ship).credits / depositSells) : Infinity;
    return Math.max(0, Math.min(this.oreCount(deposit.ore), affordable, this.cargoSpace(ship)));
  }

  /** Sells all the ore the deposit has room for. Its base pays. Returns how much went in. */
  sellToDeposit(ship: Ship, deposit: Deposit): number {
    return this.depositSale(ship, deposit, true);
  }

  /** Buys all the ore the ship can pay for, plain ore first. Its base gets the money. Returns how many items came out. */
  buyFromDeposit(ship: Ship, deposit: Deposit): number {
    const amount = this.depositBuyable(ship, deposit);
    if (amount <= 0) return 0;
    let taken = 0;
    for (const id of this.oreOrder(deposit.ore)) {
      const held = deposit.ore.get(id) ?? 0;
      for (let i = 0; i < held && taken < amount; i++) {
        if (this.placeInBay(ship, id) === 0) break;
        this.addTo(deposit.ore, id, -1);
        taken++;
      }
      if (taken >= amount) break;
    }
    if (taken === 0) return 0;
    const credits = taken * this.tuning.depositSells;
    ship.oreField = null;
    this.accountOf(ship).credits -= credits;
    const base = this.projectBase(deposit);
    if (base) base.account.credits += credits;
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    return taken;
  }

  /** The ore items in a map, plain ore first, then the rest in their own order. */
  private oreOrder(ore: Map<PartId, number>): PartId[] {
    return [...ore.keys()].sort((a, b) => (a === PLAIN_ORE ? -1 : b === PLAIN_ORE ? 1 : 0));
  }

  /** The parts this ship would buy next, in order, if it could afford them and the shop had them. */
  wishlistFor(ship: Ship): PartId[] {
    return TRAFFIC_BUY_ORDER[ship.model].filter((id) => this.wouldUse(ship, id));
  }

  /**
   * Whether the shop can sell this ship the part: a program it doesn't own yet, or a part
   * with mounts for it. A hull's own gear is only sold to fill a mount that has none.
   */
  canBuy(ship: Ship, id: PartId): boolean {
    if (isProgram(id)) return !ship.software.has(id);
    const mounts = mountsFor(ship, id);
    if (mounts.length === 0) return false;
    if (partOf(id).builtIn) return mounts.some((mount) => !ship.fit[mount] || ship.fit[mount]!.wear >= 1);
    return mounts.some((mount) => ship.fit[mount]?.part !== id);
  }

  /** Whether an AI ship would buy it: something it can use that it lacks, with a free slot for a program. */
  wouldUse(ship: Ship, id: PartId): boolean {
    if (!this.canBuy(ship, id) || owns(ship, id)) return false;
    if (!isProgram(id) && !this.hasInputsFor(this.serviceBase(ship), id)) return false;
    return !isProgram(id) || ship.programs.length < computerSize(ship);
  }

  /** What a module is worth to a shop: full price working, half damaged, nothing destroyed. */
  moduleValue(module: { part: PartId; wear: number }): number {
    const part = partOf(module.part);
    const share = module.wear < DAMAGED_AT ? 1 : module.wear < 1 ? 0.5 : 0;
    return Math.round((this.partPrice(module.part) / (part.set ?? 1)) * share);
  }

  /** How many whole modules of a part a base has in its store. */
  stockOf(base: Base, id: PartId): number {
    return base.stock.get(id) ?? 0;
  }

  /**
   * Whether a base can supply a part: a set's worth from its store, or made from its parts. A
   * module's recipe is what it costs the station; anything with no recipe is paid for out of its
   * parts A by what it sells for.
   */
  canSupply(base: Base, id: PartId): boolean {
    if (this.stockOf(base, id) >= (partOf(id).set ?? 1)) return true;
    if (this.saleRecipe(id)) return this.hasInputsFor(base, id);
    return this.hasStockFor(this.partPrice(id), base);
  }

  /** The recipe a station runs to make a part when it sells one that isn't in its store as a whole module. */
  private saleRecipe(id: PartId) {
    return saleRecipes().find((recipe) => recipe.makes === id);
  }

  /** Whether a base holds what the recipe for a part needs: it has none, or the part itself in store, or every input. */
  hasInputsFor(base: Base, id: PartId, count = partOf(id).set ?? 1): boolean {
    const recipe = this.saleRecipe(id);
    if (!recipe || this.stockOf(base, id) >= count) return true;
    const runs = Math.ceil(count / (recipe.yields ?? 1));
    return recipe.from.every((each) => this.stockOf(base, each.item as PartId) >= each.n * runs);
  }

  /** What a base lacks to make a part, in words for the shop's tooltip: nothing when it lacks nothing. */
  missingFor(base: Base, id: PartId): string[] {
    const recipe = this.saleRecipe(id);
    if (!recipe || this.hasInputsFor(base, id)) return [];
    // A sale is made in whole runs, so the recipe's inputs count once per run, not once per item.
    const runs = Math.ceil((partOf(id).set ?? 1) / (recipe.yields ?? 1));
    return recipe.from
      .filter((each) => this.stockOf(base, each.item as PartId) < each.n * runs)
      .map((each) => `${each.n * runs} ${partOf(each.item as PartId).label}`);
  }

  /** The buyer pays for a part: out of the base's store if it has a set's worth, or made from its parts. */
  private supply(buyer: { credits: number }, id: PartId, base: Base, count = partOf(id).set ?? 1): void {
    const price = Math.round((this.partPrice(id) / (partOf(id).set ?? 1)) * count);
    const stocked = this.stockOf(base, id);
    if (stocked >= count) {
      base.stock.set(id, stocked - count);
      buyer.credits -= price;
      base.account.credits += price;
      return;
    }
    buyer.credits -= price;
    base.account.credits += price;
    const recipe = this.saleRecipe(id);
    if (recipe) {
      // Made at the moment of sale: what the recipe takes in is used up, and that is what it costs.
      // A recipe runs whole times, so the sale takes the whole run's inputs and the run's spare
      // output goes into the store, where the ledger counts it as made.
      const runs = Math.ceil(count / (recipe.yields ?? 1));
      for (const each of recipe.from) {
        this.addTo(base.stock, each.item as PartId, -each.n * runs);
        this.flow(each.item as PartId, -each.n * runs);
      }
      const made = runs * (recipe.yields ?? 1);
      this.flow(id, made);
      if (made > count) this.addTo(base.stock, id, made - count);
    } else this.spendPartA(base, this.stockFor(price));
  }

  /**
   * A base takes a module back and pays what it's worth. A working one goes into its store
   * as it is, if its storage has room; a damaged one is broken down into its parts.
   */
  private takeBack(seller: { credits: number }, module: Module, base: Base): void {
    const value = this.moduleValue(module);
    // With no room in its storage, a whole one is broken down too.
    if (module.wear < DAMAGED_AT && this.storageFree(base) >= volumeOf(module.part)) {
      base.stock.set(module.part, this.stockOf(base, module.part) + 1);
      seller.credits += value;
      base.account.credits -= value;
    } else this.chargeForService(seller, -value, base);
  }

  /** The player's locker at a base, made empty at its free size the first time it's needed. */
  lockerAt(base: Base): Locker {
    let locker = this.lockers.get(base.id);
    if (!locker) {
      locker = { rows: this.tuning.lockerFreeRows, items: [] };
      this.lockers.set(base.id, locker);
    }
    return locker;
  }

  /** A locker's grid: plain, with no entry and no sticking. */
  lockerGrid(locker: Locker): GridSpec {
    return { w: this.tuning.lockerWidth, h: locker.rows };
  }

  /** How many cells of storage a base has. */
  storageOf(base: Base): number {
    return base.spec.storage ?? this.tuning.stationStorage;
  }

  /**
   * The room a base's storage has taken, in volume (a part's is the area of its shape): the
   * player's locker (its free size, even unopened), its store of whole modules, and the ore
   * waiting for the next hauler.
   */
  storageUsed(base: Base): number {
    const rows = this.lockers.get(base.id)?.rows ?? this.tuning.lockerFreeRows;
    let used = rows * this.tuning.lockerWidth;
    for (const [id, count] of base.stock) used += volumeOf(id) * count;
    for (const [id, count] of base.ore) used += volumeOf(id) * count;
    return used;
  }

  /** The cells of a base's storage still free. */
  storageFree(base: Base): number {
    return this.storageOf(base) - this.storageUsed(base);
  }

  /** Rents one more row of the locker where the player is docked, for good. Refused when the base's storage has no room. */
  buyLockerRow(ship: Ship = this.ship): boolean {
    const base = this.baseAt(ship);
    const price = this.tuning.lockerRowPrice;
    if (ship !== this.ship || !base || ship.credits < price) return false;
    if (this.storageFree(base) < this.tuning.lockerWidth) return false;
    this.lockerAt(base).rows++;
    ship.credits -= price;
    base.account.credits += price;
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    return true;
  }

  /**
   * Puts a module in the player's locker at a base: at a spot, or the first free one. When it
   * doesn't fit, nothing changes and it's marked, so the change it's part of is undone.
   */
  putInLocker(base: Base, module: Module, at?: Spot): boolean {
    const locker = this.lockerAt(base);
    const grid = this.lockerGrid(locker);
    const spot = at ? { module, ...at } : autoPlace(grid, locker.items, module);
    if (!spot || !canPlace(grid, locker.items, spot)) {
      this.lockerOverflow = true;
      return false;
    }
    locker.items.push(spot);
    return true;
  }

  /** Set when a module found no room in a locker: `attempt` undoes the change it was part of. */
  private lockerOverflow = false;

  /**
   * Makes a change to a docked ship that may need room in the player's locker. If the locker
   * runs out of room, or the change says it failed, everything goes back as it was.
   */
  private attempt(ship: Ship, base: Base, change: () => boolean): boolean {
    const locker = ship === this.ship ? this.lockerAt(base) : null;
    const account = this.accountOf(ship);
    const saved = {
      fit: { ...ship.fit },
      hold: [...ship.hold],
      oreBlocks: [...ship.oreBlocks],
      programs: [...ship.programs],
      software: new Set(ship.software),
      tweaks: copyPicks(ship.tweaks),
      items: locker ? [...locker.items] : [],
      credits: account.credits,
      baseCredits: base.account.credits,
      partCarry: base.partCarry,
      stock: new Map(base.stock),
    };
    this.lockerOverflow = false;
    const done = change();
    const overflowed = this.lockerOverflow;
    this.lockerOverflow = false;
    if (done && !overflowed) return true;
    ship.fit = saved.fit;
    ship.hold = saved.hold;
    ship.oreBlocks = saved.oreBlocks;
    ship.programs = saved.programs;
    ship.software = saved.software;
    ship.tweaks = saved.tweaks;
    if (locker) locker.items = saved.items;
    account.credits = saved.credits;
    base.account.credits = saved.baseCredits;
    base.partCarry = saved.partCarry;
    base.stock = saved.stock;
    refresh(ship);
    return false;
  }

  /**
   * Whether a change to a docked ship would go through, without making it: for the screens to
   * light up where a dragged item can go. Everything it touches is put back after.
   */
  dryRun(ship: Ship, change: () => boolean): boolean {
    const base = this.baseAt(ship);
    if (!base) return false;
    const events = this.events.length;
    const loot = this.loot.length;
    const refused = this.buyRefused;
    let works = false;
    this.attempt(ship, base, () => {
      works = change() && !this.lockerOverflow;
      return false;
    });
    this.events.length = events;
    this.loot.length = loot;
    this.buyRefused = refused;
    return works;
  }

  /**
   * Puts a part on a ship, or a program in its pilot's hands and computer. What it replaces
   * goes into the player's locker at the base, or (for anyone else) is sold back there.
   */
  private equip(ship: Ship, id: PartId, base: Base | null = null, wear = 0): void {
    if (isProgram(id)) {
      this.giveProgram(ship, id);
      return;
    }
    const off = fitPart(ship, id, wear);
    if (base) this.stow(ship, off, base);
    if (partOf(id).kind === "computer") trimPrograms(ship);
    this.settleHold(ship, base);
  }

  /** Modules that came off a ship in a dock: into the player's locker, or sold to the base by anyone else. */
  private stow(ship: Ship, modules: Module[], base: Base): void {
    if (ship === this.ship) for (const module of modules) this.putInLocker(base, module);
    else for (const module of modules) this.takeBack(this.accountOf(ship), module, base);
  }

  /** The pilot owns a program from now on, and loads it if the computer has room. */
  giveProgram(ship: Ship, id: PartId): void {
    ship.software.add(id);
    install(ship, id);
  }

  /** Loads or unloads one of the pilot's programs. Only in a dock. Returns whether it changed. */
  setProgram(ship: Ship, id: PartId, loaded: boolean): boolean {
    if (!this.atShop(ship)) return false;
    const changed = loaded ? install(ship, id) : uninstall(ship, id);
    if (changed && !loaded) this.dropOrderFor(ship, id);
    return changed;
  }

  /** The player's click order or course stops when the program flying it goes. */
  private dropOrderFor(ship: Ship, id: PartId): void {
    if (ship === this.ship && (id === "clickMove" || id === "clickTurn" || id === "autopilot")) this.clickPilot.cancel();
  }

  /** Why the player's last buy was refused, in words for the shop; null once one goes through. */
  buyRefused: string | null = null;
  /** Why the player's last sale of an item was refused (the station's store is full); null once one goes through. */
  sellRefused: string | null = null;

  /**
   * Works out where gear the player buys would go, and changes nothing: on the mounts it
   * takes, or all in the bay, or all in the locker here. With `into`, only that spot.
   */
  private planBuy(ship: Ship, id: PartId, into?: BuyInto): BuyPlan {
    const modules: Module[] = Array.from({ length: partOf(id).set ?? 1 }, () => ({ part: id, wear: 0 }));
    const mounts = mountsFor(ship, id);
    const wrong = "That spot won't take it";
    const none = "No room on the ship or in your locker here";
    if (!into || into.at === "mount") {
      const free = mounts.length > 0 && mounts.every((mount) => !ship.fit[mount]);
      if (into && !(mounts.includes(into.mount) && free)) return { refused: wrong };
      if (free) return { where: "mount", mounts };
      if (into) return { refused: wrong };
    }
    const base = this.baseAt(ship);
    const bay = !into || into.at === "hold" ? this.bayGrid(ship) : null;
    if (bay) {
      const spots = this.planSpots(bay, this.packed(ship), modules, into?.at === "hold" ? into.spot : undefined, true);
      if (spots) return { where: "hold", spots };
    }
    if (base && (!into || into.at === "locker")) {
      const locker = this.lockerAt(base);
      const spots = this.planSpots(this.lockerGrid(locker), locker.items, modules, into?.at === "locker" ? into.spot : undefined, false);
      if (spots) return { where: "locker", spots };
    }
    return { refused: into ? wrong : none };
  }

  /**
   * Places modules in a grid one after another, the first at a given spot if there is one.
   * All of them or null. In the bay each must stick and the ore aboard must keep its room.
   */
  private planSpots(grid: GridSpec, there: Placed[], modules: Module[], at: Spot | undefined, bay: boolean): Placed[] | null {
    const placed: Placed[] = [];
    for (const module of modules) {
      const all = [...there, ...placed];
      const spot = at && placed.length === 0 ? { module, ...at } : autoPlace(grid, all, module);
      if (!spot || !canPlace(grid, all, spot)) return null;
      placed.push(spot);
    }
    if (bay) {
      const after = [...there, ...placed];
      if (!after.every((each) => sticks(grid, after, each))) return null;
    }
    return placed;
  }

  /** Where a part the player buys would go now, without an `into`: "mount", "hold", "locker", or null for nowhere. */
  whereBuyGoes(ship: Ship, id: PartId): "mount" | "hold" | "locker" | null {
    if (isProgram(id)) return null;
    const plan = this.planBuy(ship, id);
    return "where" in plan ? plan.where : null;
  }

  /**
   * Parts are only sold in the dock. Returns whether the sale went through. The player's gear
   * goes onto a free mount, the bay or the locker here, never swapped for what's fitted; give
   * `into` to say where. A pilot's programs and every other ship's parts swap on as before.
   */
  buyPart(ship: Ship, id: PartId, into?: BuyInto): boolean {
    const player = ship === this.ship;
    const refuse = (why: string): false => {
      if (player) this.buyRefused = why;
      return false;
    };
    const price = this.partPrice(id);
    const part = partOf(id);
    const base = this.serviceBase(ship);
    if (!this.atShop(ship)) return refuse("Only in a dock");
    if (!this.canBuy(ship, id) || !this.unlocked(id, base)) return refuse("Not sold here");
    const account = this.accountOf(ship);
    if (account.credits < price) return refuse("Not enough credits");
    if (!isProgram(id) && !this.hasInputsFor(base, id)) return refuse(`The station needs ${this.missingFor(base, id).join(" and ")} to make it`);
    if (!isProgram(id) && !this.canSupply(base, id)) return refuse("The station is out of parts");
    if (player && !isProgram(id)) {
      const plan = this.planBuy(ship, id, into);
      if (!("where" in plan)) return refuse(plan.refused);
      this.supply(account, id, base);
      if (plan.where === "mount") {
        for (const mount of plan.mounts) ship.fit[mount] = { part: id, wear: 0 };
        refresh(ship);
        if (part.kind === "computer") trimPrograms(ship);
      } else if (plan.where === "hold") ship.hold.push(...plan.spots);
      else this.lockerAt(this.baseAt(ship)!).items.push(...plan.spots);
    } else {
      // What it replaces has to find room in the player's locker.
      const bought = this.attempt(ship, base, () => {
        if (isProgram(id)) this.chargeCredits(account, price, base);
        else this.supply(account, id, base);
        this.equip(ship, id, base);
        return true;
      });
      if (!bought) return false;
    }
    if (player) this.buyRefused = null;
    if (id === "retro" && ship === this.ship) this.tuning.retro = true;
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    if (ship !== this.ship && this.tuning.chatter) this.chatter.bought(this, ship, part.label.toLowerCase());
    return true;
  }

  /**
   * Sells a part back for what it's worth, so a ship can go back to being light. A hull's
   * own gear goes back on where the part came off: from the player's locker if it's there,
   * or bought out of the sale.
   */
  sellPart(ship: Ship, id: PartId): boolean {
    if (!this.atShop(ship)) return false;
    const base = this.serviceBase(ship);
    const account = this.accountOf(ship);
    if (isProgram(id)) {
      if (!ship.software.has(id)) return false;
      ship.software.delete(id);
      uninstall(ship, id);
      this.chargeCredits(account, -this.partPrice(id), base);
      this.dropOrderFor(ship, id);
    } else {
      const mounts = mountsHolding(ship, id);
      if (mounts.length === 0 || partOf(id).builtIn) return false;
      const sold = this.attempt(ship, base, () => {
        for (const mount of mounts) this.takeBack(account, unfit(ship, mount)!, base);
        this.refitDefaults(ship, base);
        this.settleHold(ship, base);
        return true;
      });
      if (!sold) return false;
    }
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    return true;
  }

  /** Puts the hull's own gear back on any mount left without it: from the player's locker or bay, or bought. */
  private refitDefaults(ship: Ship, base: Base): void {
    for (const id of new Set(Object.values(hullDefaults(ship.model)) as PartId[])) {
      const mounts = mountsFor(ship, id);
      if (mounts.length === 0 || mounts.some((mount) => ship.fit[mount])) continue;
      // The player's own: from the locker first, then the bay, where taking it out leaves nothing floating.
      if (ship === this.ship) {
        const locker = this.lockerAt(base);
        const grid = this.bayGrid(ship);
        const fromLocker = locker.items.filter((item) => item.module.part === id && item.module.wear < 1);
        const fromHold = ship.hold.filter((item) => item.module.part === id && item.module.wear < 1 && (!grid || floatsAfterRemoval(grid, this.packed(ship), item).length === 0));
        const kept = [...fromLocker, ...fromHold];
        if (kept.length >= mounts.length) {
          for (const mount of mounts) {
            const item = kept.shift()!;
            if (locker.items.includes(item)) locker.items.splice(locker.items.indexOf(item), 1);
            else ship.hold.splice(ship.hold.indexOf(item), 1);
            ship.fit[mount] = item.module;
          }
          refresh(ship);
          continue;
        }
      }
      this.supply(this.accountOf(ship), id, base);
      fitPart(ship, id);
    }
    trimPrograms(ship);
  }

  /** Where an item is, for moving it about: on a mount, loose in the bay, or in the locker where the ship is docked. */
  itemAt(ship: Ship, from: ItemPlace): Module | null {
    if (from.at === "mount") return ship.fit[from.mount] ?? null;
    if (from.at === "hold") return ship.hold[from.index]?.module ?? null;
    const base = this.baseAt(ship);
    return base ? this.lockerAt(base).items[from.index]?.module ?? null : null;
  }

  /**
   * Whether an item can be taken out of where it is: not from the bay if that would leave
   * another module there floating.
   */
  canTake(ship: Ship, from: ItemPlace): boolean {
    if (!this.itemAt(ship, from)) return false;
    return from.at !== "hold" || this.floatingWithout(ship, from.index).length === 0;
  }

  /** Takes an item out of where it is. */
  private takeItem(ship: Ship, from: ItemPlace): Module | null {
    const item = this.itemAt(ship, from);
    if (!item || !this.canTake(ship, from)) return null;
    if (from.at === "mount") unfit(ship, from.mount);
    else if (from.at === "hold") ship.hold.splice(from.index, 1);
    else this.lockerAt(this.baseAt(ship)!).items.splice(from.index, 1);
    if (from.at === "mount" && partOf(item.part).kind === "computer") trimPrograms(ship);
    return item;
  }

  /**
   * Puts a module from the bay or the locker on the ship. Only in a dock. What comes off goes
   * where it came from, or into the locker; if there's no room there either, nothing changes.
   */
  fitItem(ship: Ship, from: ItemPlace, mount?: MountId): boolean {
    const base = this.baseAt(ship);
    const item = this.itemAt(ship, from);
    if (!base || !item || item.wear >= 1) return false;
    const part = partOf(item.part);
    // Onto one mount in particular: a single part, not a pair or a turret, which go as they always do.
    if (mount !== undefined && (part.set ?? 1) === 1 && part.kind !== "turret") {
      return this.attempt(ship, base, () => (from.at === "mount" ? this.moveMount(ship, from.mount, mount) : this.fitOn(ship, from, item, mount, base)));
    }
    if (from.at === "mount") return false;
    if (mount !== undefined && !mountsFor(ship, item.part).includes(mount)) return false;
    return this.attempt(ship, base, () => this.fitFrom(ship, from, item, base));
  }

  /** Whether a part can go on this mount of the ship as it is now. */
  private mountTakesHere(ship: Ship, mount: MountId, id: PartId): boolean {
    const spot = mountsOf(ship).find((each) => each.id === mount);
    const part = partOf(id);
    if (!spot || spot.decal || !partFits(part, ship.model) || part.kind === "program" || part.kind === "cockpit") return false;
    // With a turret on, a gun goes only on the turret.
    if (part.kind === "gun" && turretMount(ship) && mount !== "turretGun") return false;
    return mountTakes(spot, id);
  }

  /**
   * Fits a single part from the bay or locker onto one mount. What was on it goes where the new
   * one came from, at its spot if it fits there, else anywhere in that grid; if it fits nowhere
   * there, the fit is refused.
   */
  private fitOn(ship: Ship, from: ItemPlace, item: Module, mount: MountId, base: Base): boolean {
    if (from.at === "mount" || !this.mountTakesHere(ship, mount, item.part)) return false;
    const old = ship.fit[mount];
    if (old && partOf(old.part).kind === "turret") return false;
    const locker = this.lockerAt(base);
    const pile = from.at === "hold" ? ship.hold : locker.items;
    const placed = pile[from.index];
    if (!this.canTake(ship, from)) return false;
    const rest = pile.filter((each) => each !== placed);
    if (from.at === "hold") ship.hold = rest;
    else locker.items = rest;
    ship.fit[mount] = item;
    refresh(ship);
    if (partOf(item.part).kind === "computer") trimPrograms(ship);
    if (partOf(item.part).bay) this.settleHold(ship, base);
    if (!old) return true;
    // The old part goes where the new one was.
    if (from.at === "hold") {
      const grid = this.bayGrid(ship);
      if (!grid) return false;
      const tries = [false, true].map((turned) => ({ module: old, x: placed.x, y: placed.y, turned }));
      const spot = tries.find((each) => {
        const packed = this.packed(ship);
        const after = [...packed, each];
        return canPlace(grid, packed, each) && after.every((other) => sticks(grid, after, other));
      });
      const found = spot ?? this.holdSpotFor(ship, old);
      if (!found) return false;
      ship.hold.push(found);
    } else {
      const grid = this.lockerGrid(locker);
      const tries = [false, true].map((turned) => ({ module: old, x: placed.x, y: placed.y, turned }));
      const found = tries.find((each) => canPlace(grid, locker.items, each)) ?? autoPlace(grid, locker.items, old);
      if (!found) return false;
      locker.items.push(found);
    }
    return true;
  }

  /** Moves a part from one mount to another; with something on the other, the two swap, if each takes the other's. */
  private moveMount(ship: Ship, from: MountId, to: MountId): boolean {
    const moving = ship.fit[from];
    const there = ship.fit[to];
    if (!moving || from === to || from === "turretGun" || to === "turretGun") return false;
    if (partOf(moving.part).kind === "turret" || (there && partOf(there.part).kind === "turret")) return false;
    if (!this.mountTakesHere(ship, to, moving.part)) return false;
    if (there && !this.mountTakesHere(ship, from, there.part)) return false;
    ship.fit[to] = moving;
    if (there) ship.fit[from] = there;
    else delete ship.fit[from];
    refresh(ship);
    return true;
  }

  /** Fits a module from the bay or locker on the mounts it goes on, the way a click on Fit does. */
  private fitFrom(ship: Ship, from: ItemPlace, item: Module, base: Base): boolean {
    if (mountsFor(ship, item.part).length === 0) return false;
    // A pair goes on as a pair: the other half has to be where this one is.
    const set = partOf(item.part).set ?? 1;
    const locker = this.lockerAt(base);
    const pile = (from.at === "hold" ? ship.hold : locker.items).map((placed) => placed.module);
    const pair = [item, ...pile.filter((other) => other !== item && other.part === item.part && other.wear < 1)].slice(0, set);
    if (pair.length < set) return false;
    if (from.at === "hold") {
      // Taking them out must leave nothing else in the bay floating.
      const grid = this.bayGrid(ship);
      const rest = ship.hold.filter((placed) => !pair.includes(placed.module));
      const left = this.packed(ship, rest);
      if (grid && !left.every((placed) => sticks(grid, left, placed))) return false;
      ship.hold = rest;
    } else locker.items = locker.items.filter((placed) => !pair.includes(placed.module));
    const mounts = mountsFor(ship, item.part);
    const off: Module[] = [];
    for (const [i, mount] of mounts.entries()) {
      const old = ship.fit[mount];
      if (old) off.push(old);
      ship.fit[mount] = pair[i];
    }
    if (partOf(item.part).kind === "turret") {
      const gun = off.find((module) => partOf(module.part).kind === "gun");
      if (gun) {
        ship.fit.turretGun = gun;
        off.splice(off.indexOf(gun), 1);
      }
    }
    refresh(ship);
    if (partOf(item.part).kind === "computer") trimPrograms(ship);
    this.settleHold(ship, base);
    // What came off goes where this came from: the bay if it has a spot, or else the locker.
    for (const module of off) {
      const spot = from.at === "hold" ? this.holdSpotFor(ship, module) : null;
      if (spot) ship.hold.push(spot);
      else this.putInLocker(base, module);
    }
    return true;
  }

  /**
   * After the hull designer takes mounts away: whatever every ship had on a mount that's gone
   * goes loose into its bay. (A turret's gun stays while the turret does.)
   */
  tidyMounts(): void {
    for (const ship of [this.ship, ...this.pilots.map((pilot) => pilot.ship)]) {
      const ids = new Set(mountsOf(ship).filter((mount) => !mount.decal).map((mount) => mount.id));
      let moved = false;
      for (const [mount, module] of Object.entries(ship.fit) as [MountId, Module | undefined][]) {
        if (ids.has(mount) || !module) continue;
        delete ship.fit[mount];
        const spot = this.holdSpotFor(ship, module);
        if (spot) ship.hold.push(spot);
        else this.setAdrift(ship, module, 25);
        moved = true;
      }
      if (moved) {
        refresh(ship);
        trimPrograms(ship);
        this.settleHold(ship, null);
      }
    }
  }

  /** Throws a module out of the bay, to drift beside the ship. */
  dropItem(ship: Ship, index: number): boolean {
    const item = ship.hold[index];
    if (!item || this.isDocked(ship) || !this.canTake(ship, { at: "hold", index })) return false;
    ship.hold.splice(index, 1);
    this.setAdrift(ship, item.module, 25);
    return true;
  }

  /**
   * An item set loose beside a ship, drifting off at about this speed: ore with the ore, where
   * any ship's tractor reaches it, and anything else with the loot, for flying through.
   */
  private setAdrift(ship: Ship, item: Module, speed: number): void {
    const dir = this.random() * Math.PI * 2;
    const kick = speed * (0.5 + this.random() * 0.5);
    const x = ship.x + Math.cos(dir) * SHIP_RADIUS;
    const y = ship.y + Math.sin(dir) * SHIP_RADIUS;
    const loose: Loose = {
      x,
      y,
      px: x,
      py: y,
      vx: ship.vx + Math.cos(dir) * kick,
      vy: ship.vy + Math.sin(dir) * kick,
      item: item.part,
      wear: item.wear,
      count: 1,
      kind: Math.floor(this.random() * ORE_KINDS),
    };
    if (isOreItem(item.part)) this.ores.push(loose);
    else this.loot.push(loose);
  }

  /**
   * Moves an item into the locker where the ship is docked, at a spot or the first free one.
   * From the locker itself, it moves the item. Refused when there's no room.
   */
  toLocker(ship: Ship, from: ItemPlace, at?: Spot): boolean {
    const base = this.baseAt(ship);
    if (!base || !this.canTake(ship, from)) return false;
    if (from.at === "locker") {
      if (!at) return false;
      const locker = this.lockerAt(base);
      const item = locker.items[from.index];
      const rest = locker.items.filter((each) => each !== item);
      const spot = { module: item.module, ...at };
      if (!canPlace(this.lockerGrid(locker), rest, spot)) return false;
      locker.items = [...rest, spot];
      return true;
    }
    return this.attempt(ship, base, () => {
      const module = this.takeItem(ship, from)!;
      if (!this.putInLocker(base, module, at)) return false;
      if (from.at === "mount") this.settleHold(ship, base);
      return true;
    });
  }

  /**
   * Moves an item into the bay, at a spot or wherever it goes best, if it sticks there and
   * leaves room for the ore aboard. Only in a dock. From the bay itself, it moves the item.
   */
  toHold(ship: Ship, from: ItemPlace, at?: Spot): boolean {
    const item = this.itemAt(ship, from);
    const base = this.baseAt(ship);
    const grid = this.bayGrid(ship);
    if (!item || !base || !grid || !this.canTake(ship, from)) return false;
    // A bay can't carry itself.
    if (from.at === "mount" && partOf(item.part).bay) return false;
    const rest = from.at === "hold" ? ship.hold.filter((_, index) => index !== from.index) : ship.hold;
    let spot: Placed | null;
    if (at) {
      spot = { module: item, ...at };
      const packed = this.packed(ship, rest);
      const after = [...packed, spot];
      if (!canPlace(grid, packed, spot) || !after.every((placed) => sticks(grid, after, placed))) return false;
    } else {
      if (from.at === "hold") return false;
      spot = this.holdSpotFor(ship, item);
      if (!spot) return false;
    }
    if (from.at === "hold") ship.hold = rest;
    else this.takeItem(ship, from);
    ship.hold.push(spot);
    return true;
  }

  /** Sells an item from the bay or the locker to the base the ship is docked at. */
  sellItem(ship: Ship, from: ItemPlace): boolean {
    const base = this.baseAt(ship);
    if (!base || from.at === "mount" || !this.canTake(ship, from)) return false;
    const item = this.itemAt(ship, from);
    if (item && isItem(item.part) && this.storageFree(base) < volumeOf(item.part)) {
      // An item isn't broken down for parts when the store is full: the sale is turned down.
      this.sellRefused = `The station has no room for ${partOf(item.part).label}`;
      return false;
    }
    this.sellRefused = null;
    this.takeBack(this.accountOf(ship), this.takeItem(ship, from)!, base);
    this.events.push({ type: "sale", x: ship.x, y: ship.y });
    return true;
  }

  /** For the dev panel: puts a part on or takes it off for free. */
  devSet(ship: Ship, id: PartId, on: boolean): void {
    if (isProgram(id)) {
      if (on) {
        // Free testing: a computer big enough to run it, if this one is full.
        if (ship.programs.length >= computerSize(ship) && computerSize(ship) < 6) fitPart(ship, "navComputer");
        this.giveProgram(ship, id);
      } else {
        ship.software.delete(id);
        uninstall(ship, id);
      }
      return;
    }
    if (on) {
      fitPart(ship, id);
      trimPrograms(ship);
    } else for (const mount of mountsHolding(ship, id)) unfit(ship, mount);
    this.settleHold(ship, this.baseAt(ship));
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
    return this.partA(base) + base.partCarry >= this.stockFor(credits);
  }

  /**
   * Takes whole parts A for a service, or gives them back when a sale hands credits back. What
   * doesn't add up to a whole part waits in the base's carry, so the rates stay what they were.
   */
  private spendPartA(base: Base, parts: number): void {
    if (parts === 0) return;
    const total = base.partCarry + parts;
    const whole = total >= 0 ? Math.floor(total + 1e-9) : -Math.floor(-total + 1e-9);
    if (whole === 0) {
      base.partCarry = total;
      return;
    }
    if (whole > 0) {
      // The store stops at empty, as the parts number did.
      const spend = Math.min(whole, this.partA(base));
      if (spend > 0) this.addTo(base.stock, PART_A, -spend);
      base.partCarry = total - spend;
    } else {
      this.addTo(base.stock, PART_A, -whole);
      base.partCarry = total - whole;
    }
    base.partCarry = Math.max(-1, Math.min(1, base.partCarry));
  }

  /** A buyer pays the base, and nothing else: what a program, a hull or a rebuild costs. */
  private chargeCredits(buyer: { credits: number }, credits: number, base: Base): void {
    buyer.credits -= credits;
    base.account.credits += credits;
  }

  /** The buyer pays the base, and the service comes out of its parts A, which stop at empty. */
  private chargeForService(buyer: { credits: number }, credits: number, base: Base): void {
    buyer.credits -= credits;
    base.account.credits += credits;
    this.spendPartA(base, this.stockFor(credits));
  }

  /** Whose credits this ship earns and spends: its owner's, the station's, or its own. */
  accountOf(ship: Ship): { credits: number } {
    if (ship.faction === "defender") return this.homeBaseOf(ship).account;
    return ship.owner ?? ship;
  }

  /** Every station with a dock, in the layout's order. */
  get docks(): Poi[] {
    return this.bases.map((base) => base.poi);
  }

  /** Whether a dock rebuilds wrecks. */
  hasShipyard(dock: Poi): boolean {
    const base = this.baseOf(dock);
    return base !== null && (base.spec.shipyard ?? this.tuning.stationShipyard);
  }

  /** The nearest dock to a spot, or the nearest with a shipyard. With no shipyard anywhere, the nearest of any. */
  nearestDock(x: number, y: number, shipyard = false): Poi {
    const docks = shipyard && this.docks.some((dock) => this.hasShipyard(dock)) ? this.docks.filter((dock) => this.hasShipyard(dock)) : this.docks;
    let best = docks[0] ?? NOWHERE;
    let bestDistance = Infinity;
    for (const dock of docks) {
      const distance = Math.hypot(dock.x - x, dock.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = dock;
      }
    }
    return best;
  }

  /** Center of a station's dock, now or as of the previous tick. */
  dockPoint(previous: boolean, station: Poi): { x: number; y: number } {
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
    this.burnDown(dt);
    this.burnOreOnBodies();
    lap?.("ships");
    this.upkeepTargets(pilots);
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

  /** Each POI follows a fixed circle or ellipse around its parent, or the system's center. */
  private movePois(dt: number): void {
    for (const { spec, poi } of this.extraFields) this.movePlace(poi, spec, dt);
    if (this.pirateBase && this.pirateSpec) this.movePlace(this.pirateBase, this.pirateSpec, dt);
    for (const { spec, poi } of this.bases) this.movePlace(poi, spec, dt);
  }

  /**
   * Where a POI's centre will be at a given time on the clock (see `now`). Lets a pilot aim
   * at where a place will be on arrival.
   */
  poiAt(poi: Poi, time: number): { x: number; y: number } {
    if (!poi.orbits) return { x: poi.x, y: poi.y };
    const { x, y } = orbitsAt(poi.orbits, time);
    return { x, y };
  }

  /**
   * Takes a layout changed from outside the game: what's given replaces what was, and what's
   * left out stays. Everything comes along: what's at a station or the pirate base moves with
   * that, and the rest of the scene with the field it's in, so nobody is left behind in empty
   * space. `pirates` null takes the pirate base away.
   */
  applyLayout(fields?: FieldSpec[], stationSpecs?: StationSpec[], pirates?: PirateBaseSpec | null): void {
    const { pirateBase } = this;
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
        const extra = old ?? { spec, poi: this.makePoi("field", spec.radius, (spec.spinPhase ?? 0) + orbitRate(spec.rotationPeriod) * this.clock), inflowTimer: 1 };
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
      const ids = new Set(next.map((extra) => extra.spec.id));
      for (const id of this.sleeping.keys()) if (!ids.has(id)) this.sleeping.delete(id);
    }
    if (stationSpecs) {
      // A world needs somewhere to dock, sell, and be rebuilt.
      if (stationSpecs.length === 0) throw new Error("This layout has no station. A game needs at least one, to dock at, sell to and be rebuilt at.");
      const kept = new Map(this.bases.map((base) => [base.id, base]));
      this.bases = stationSpecs.map((spec) => {
        let base = kept.get(spec.id);
        if (!base) {
          base = this.makeBase(spec.id, spec, this.makePoi("station", STATION_REACH, (spec.spinPhase ?? 0) + orbitRate(spec.rotationPeriod) * this.clock));
          this.fitBase(base);
          // A new base comes with its defenders. One from a save has them in the save already.
          if (!this.takeSaved(base)) this.addDefenders(base);
        }
        base.spec = spec;
        this.fitBase(base);
        return base;
      });
      // A base that's gone takes its projects with it.
      const ids = new Set(this.bases.map((base) => base.id));
      this.deposits = this.deposits.filter((deposit) => ids.has(deposit.base));
      this.batteries = this.batteries.filter((battery) => ids.has(battery.base));
    }
    if (pirates !== undefined) {
      this.pirateSpec = pirates;
      if (!pirates || this.tuning.pirates <= 0) this.pirateBase = null;
      else if (this.pirateBase) this.fitPlace(this.pirateBase, pirates);
      else this.placePirateBase();
    }

    const moved = (poi: Poi) => {
      const was = before.get(poi);
      // Gone, or new: nothing to follow.
      const removed =
        poi.orbits !== undefined &&
        !this.extraFields.some((extra) => extra.poi === poi) &&
        !this.bases.some((base) => base.poi === poi) &&
        poi !== this.pirateBase;
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
      if (at) shift(body, moved(at));
      else if (fieldsBefore.length > 0) shift(body, moved(fieldsBefore[this.fieldAtBefore(fieldsBefore, before, body)].poi));
    }
    for (const base of this.bases) if (base.hauler) shift(base.hauler, moved(base.poi));
    if (this.blackMarket) shift(this.blackMarket, moved(pirateBase ?? this.field));
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
    const { pirateBase } = this;
    return [...this.extraFields.map((extra) => extra.poi), ...this.docks, ...(pirateBase ? [pirateBase] : [])];
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
    return poi.carry;
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
    for (const loot of this.loot) this.carry(loot);
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
   * Where a target's marker should lead, how far until it enters a view of the given half size
   * in world units, and how fast that distance is closing. Null when what it names is gone.
   * Closing speed comes from real positions, so it includes all carrying by POIs.
   */
  readTarget(target: Target, viewHalfWidth: number, viewHalfHeight: number): PoiReading | null {
    const now = this.outlineOf(target, false);
    const before = this.outlineOf(target, true);
    if (!now || !before) return null;
    const { ship } = this;
    const gap = this.gapToView(now, ship.x, ship.y, viewHalfWidth, viewHalfHeight);
    const previousGap = this.gapToView(before, ship.px, ship.py, viewHalfWidth, viewHalfHeight);
    // A station's arrow points at its dock side, not at its middle.
    const lead = now.box ? DOCK_OFFSET : 0;
    return {
      dx: now.x + Math.cos(now.rotation) * lead - ship.x,
      dy: now.y + Math.sin(now.rotation) * lead - ship.y,
      distance: Math.max(0, gap),
      closing: (previousGap - gap) / TICK,
    };
  }

  /**
   * What a target looks like, now or on the tick before. A field is a circle its reach across, a
   * deposit its ring, a body its radius, a point nothing at all, and a station the box of its
   * solid part and its dock. Null when what it names is no longer in the world.
   */
  private outlineOf(target: Target, previous: boolean): Outline | null {
    const { poi, deposit, body, point } = target;
    if (point) return { x: point.x, y: point.y, radius: 0, rotation: 0 };
    if (deposit) {
      if (!this.deposits.includes(deposit)) return null;
      return { x: previous ? deposit.px : deposit.x, y: previous ? deposit.py : deposit.y, radius: DEPOSIT_REACH, rotation: 0 };
    }
    if (body) {
      if (!this.bodies.includes(body)) return null;
      const at = bodyAt(body, previous ? this.clock - TICK : this.clock);
      return { x: at.x, y: at.y, radius: body.radius, rotation: 0 };
    }
    if (!poi || !this.allPois().includes(poi)) return null;
    const box = this.baseOf(poi) ? { center: STATION_SHAPE_CENTER, halfLength: STATION_SHAPE_HALF, halfWidth: STATION_HALF } : undefined;
    return {
      x: previous ? poi.px : poi.x,
      y: previous ? poi.py : poi.y,
      radius: box ? 0 : poi.reach,
      rotation: previous ? poi.prevRotation : poi.rotation,
      box,
    };
  }

  /** How far an outline is outside the view, from where the ship is looking now or a tick ago. */
  private gapToView(outline: Outline, shipX: number, shipY: number, viewHalfWidth: number, viewHalfHeight: number): number {
    const { ship, tuning } = this;
    const cos = Math.cos(outline.rotation);
    const sin = Math.sin(outline.rotation);
    const box = outline.box;
    const centerX = box ? outline.x + cos * box.center : outline.x;
    const centerY = box ? outline.y + sin * box.center : outline.y;
    const extentX = box ? Math.abs(cos) * box.halfLength + Math.abs(sin) * box.halfWidth : 0;
    const extentY = box ? Math.abs(sin) * box.halfLength + Math.abs(cos) * box.halfWidth : 0;
    const viewX = shipX + ship.vx * tuning.lookahead;
    const viewY = shipY + ship.vy * tuning.lookahead;
    const outX = Math.max(0, Math.abs(centerX - viewX) - viewHalfWidth - extentX);
    const outY = Math.max(0, Math.abs(centerY - viewY) - viewHalfHeight - extentY);
    return Math.hypot(outX, outY) - outline.radius;
  }

  /**
   * At most two arrows, for what the player has pointed at. Before any manual set they are the
   * nearest field and the nearest station, worked out afresh so they move with the ship. After
   * it they are the pins, and a slot that's been cleared has no arrow at all. Nothing already on
   * screen is pointed at, and a destination in front hides a home pinned to the same place.
   */
  pointers(viewHalfWidth: number, viewHalfHeight: number): Pointer[] {
    const { ship } = this;
    const pointers: Pointer[] = [];
    // Only the big places anyone knows about, and only once they're close. Manual arrows aren't
    // held to that: a destination twenty minutes out is exactly when the arrow is wanted.
    const limit = this.pointersManual ? Infinity : viewHalfWidth * 2 * POINTER_SCREENS;
    const add = (slot: Pointer["slot"], target: Target, label: string): void => {
      const reading = this.readTarget(target, viewHalfWidth, viewHalfHeight);
      if (!reading || reading.distance <= 0 || reading.distance >= limit) return;
      pointers.push({ slot, label, name: this.nameOf(target), reading });
    };
    // The nearest field and station, so there's always somewhere to mine and to sell.
    const destination: Target | null = this.pointersManual ? ship.destination : { poi: this.miningFieldAt(ship.x, ship.y).poi };
    const home: Target | null = this.pointersManual ? this.homeTarget() : { poi: this.nearestDock(ship.x, ship.y) };
    if (destination) add("destination", destination, this.kindOf(destination));
    if (home && !sameTarget(home, destination)) add("home", home, "home");
    return pointers;
  }

  /** The base the player has pinned as home, or null. A base that's gone leaves no arrow. */
  private homeTarget(): Target | null {
    const base = this.bases.find((each) => each.id === this.ship.home);
    return base ? { poi: base.poi } : null;
  }

  /** What a target is, in the words the game uses for it: a destination arrow's label. */
  kindOf(target: Target): string {
    if (target.point) return "space";
    if (target.deposit) return "deposit";
    if (target.body) return target.body.kind;
    return target.poi ? target.poi.name : "space";
  }

  /** What a target is called, for the tooltip of an arrow pointing at it. Null: a spot in space. */
  nameOf(target: Target): string | null {
    if (target.point) return null;
    if (target.deposit) return "Deposit";
    if (target.body) return target.body.name;
    return target.poi ? this.placeName(target.poi) : null;
  }

  /** What a place is called, as the chart and the arrows' tooltips show it. */
  placeName(poi: Poi): string {
    if (poi === this.pirateBase) return "Pirate base";
    const base = this.baseOf(poi);
    if (base) return base.spec.name || "Station";
    const extra = this.extraFields.find((each) => each.poi === poi);
    if (extra) return extra.spec.name || "Field";
    return poi.name;
  }

  /** Whether the destination is this thing. */
  holdsDestination(target: Target | null): boolean {
    return sameTarget(this.ship.destination, target);
  }

  /**
   * Points the destination at something, or at nothing. Either way the tutorial pair is gone:
   * the player aims these now.
   */
  setDestination(target: Target | null): void {
    this.ship.destination = target;
    this.pointersManual = true;
  }

  /** Points the destination at a target, or clears it when it already holds it. */
  toggleDestination(target: Target): void {
    this.setDestination(this.holdsDestination(target) ? null : target);
  }

  /** Pins a base as home, or clears it when it's already home. Either way the tutorial pair is gone. */
  toggleHome(baseId: string): void {
    this.ship.home = this.ship.home === baseId ? null : baseId;
    this.pointersManual = true;
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
  private toStationAxes(dx: number, dy: number, station: Poi): { x: number; y: number } {
    const cos = Math.cos(station.rotation);
    const sin = Math.sin(station.rotation);
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  }

  private fromStationAxes(x: number, y: number, station: Poi): { x: number; y: number } {
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
        ship.critical <= 0 &&
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
        ship.critical <= 0 &&
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
    if (!record || record.stage !== "mining" || this.oreIn(other) > 0 || this.mined(otherPilot!) < 1) return false;
    // It has a load aboard by now, if it has room for one: ask as if it carried it.
    const spot = this.holdSpotFor(other, { part: PLAIN_ORE, wear: 0 });
    if (!spot) return false;
    const had = other.hold.length;
    other.hold.push(spot);
    const wants = pilot.goesAfter(this, other);
    other.hold.length = had;
    return wants;
  }

  /** How much a record mining a field has got by now, all told, by its mining rate. */
  private mined(pilot: DronePilot | FighterPilot): number {
    const record = pilot.record!;
    const span = record.arrive - record.depart;
    const share = span > 0 && Number.isFinite(span) ? Math.max(0, (this.clock - record.depart) / span) : 0;
    return Math.floor(share * Math.max(0, this.deliveryLoad(pilot.ship) - this.oreIn(pilot.ship)));
  }

  /** Turns a flown pirate or defender into a record of its round. */
  private startFighterRecord(pilot: FighterPilot): void {
    const { ship } = pilot;
    ship.vx = ship.vy = 0;
    ship.spin = 0;
    if (this.isHome(ship) && (this.oreIn(ship) > 0 || this.canRepair(ship) || pilot.isHeadingHome)) {
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
    const canPay = this.oreIn(ship) > 0 || this.canPayRepair(ship);
    return pilot.isHeadingHome || this.oreIn(ship) >= this.deliveryLoad(ship) || (ship.hull < LOW_HULL && canPay);
  }

  /** Sets off home, or to its field. */
  private nextFighterLeg(pilot: FighterPilot): void {
    const { ship } = pilot;
    const home = this.fighterGoesHome(pilot);
    const target = home ? this.fighterHome(ship) : pilot.patrolField(this).id;
    pilot.task = home ? "heading home" : "patrolling";
    const from = { x: ship.x, y: ship.y };
    const record: TripRecord = { goal: home ? "home" : "field", target, stage: "travel", depart: this.clock, arrive: this.clock, path: [from], aim: from };
    const { route, world } = pilot.plan(this, () => from, (t) => this.recordTargetAt(record, t));
    record.arrive = route.arrive;
    record.path = world.path;
    record.aim = world.aim;
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
      const want = Math.max(0, this.deliveryLoad(ship) - this.oreIn(ship));
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
      const want = Math.max(0, this.deliveryLoad(ship) - this.oreIn(ship));
      this.takeOre(ship, record.target, want);
      this.nextLegAfter(pilot, due, this.oreIn(ship) > 0);
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
    while ((this.oreIn(ship) > 0 || this.canRepair(ship)) && ticks < most) {
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
      this.takeOre(ship, record.target, this.mined(pilot));
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
      const target = this.baseOf(dock)!.id;
      pilot.record = { goal: "dock", target, stage: "travel", depart: this.clock, arrive: this.clock, path: [at], aim: at };
      return;
    }
    const field = this.miningFieldAt(ship.x, ship.y);
    const mining =
      !pilot.trading &&
      !pilot.isHauling &&
      this.oreIn(ship) < this.deliveryLoad(ship) &&
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
    if (record.goal === "dock") return this.poiAt(this.recordBase(record).poi, time);
    if (record.target === "pirate base" && this.pirateBase) return this.poiAt(this.pirateBase, time);
    if (record.goal === "home") return this.poiAt(this.recordBase(record).poi, time);
    const deposit = this.deposits[Number(record.target)];
    return deposit ? { x: deposit.x, y: deposit.y } : this.poiAt(this.recordBase(record).poi, time);
  }

  /** The base a record is bound for: the one it names, or if that's gone, the nearest to where it was going. */
  private recordBase(record: TripRecord): Base {
    return this.bases.find((each) => each.id === record.target) ?? this.nearestBase(record.aim.x, record.aim.y);
  }

  /** Sets off for the next stop, the way its pilot would: a buying run, home to sell, or to its field. */
  private nextLeg(pilot: DronePilot): void {
    const { ship } = pilot;
    let goal: TripRecord["goal"];
    let target: string;
    const fields = this.miningFields();
    const lowHull = (ship.hull < LOW_HULL || this.crippled(ship)) && (this.oreIn(ship) > 0 || this.canPayRepair(ship));
    if (pilot.trading) {
      goal = "trade";
      target = pilot.trading === "pirate base" ? "pirate base" : String(this.deposits.indexOf(pilot.trading));
      pilot.task = "to buy";
    } else if (pilot.isHauling || this.oreIn(ship) >= this.deliveryLoad(ship) || lowHull) {
      goal = "dock";
      target = this.nearestBase(ship.x, ship.y).id;
      pilot.task = "to station";
    } else {
      goal = "field";
      const own = this.ownField(ship).id;
      target = fields.some((field) => field.id === pilot.working) ? pilot.working : own;
      pilot.task = target === own ? "to field" : "to far field";
    }
    const from = { x: ship.x, y: ship.y };
    const record: TripRecord = { goal, target, stage: "travel", depart: this.clock, arrive: this.clock, path: [from], aim: from };
    const { route, world } = pilot.plan(this, () => from, (t) => this.recordTargetAt(record, t));
    record.arrive = route.arrive;
    record.path = world.path;
    record.aim = world.aim;
    pilot.record = record;
  }

  /** Mines from where it is in a field until a load is due, at the rate flown ships manage. */
  private startMining(pilot: DronePilot, field: MiningField): void {
    const { ship, record } = pilot;
    const want = Math.max(0, this.deliveryLoad(ship) - this.oreIn(ship));
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
      const want = Math.max(0, this.deliveryLoad(ship) - this.oreIn(ship));
      this.takeOre(ship, record.target, want);
      // Mined out before the hold was full: home with what it has, or with nothing, back to the field by its own base.
      if (this.oreIn(ship) === 0) pilot.working = this.ownField(ship).id;
      else if (this.oreIn(ship) < this.deliveryLoad(ship)) pilot.startHauling();
      this.nextLegAt(pilot, due);
      return;
    }
    if (record.goal === "dock") {
      const base = this.recordBase(record);
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
    } while ((this.oreIn(ship) > 0 || this.canRepair(ship)) && ticks < most);
    // Now the hold is empty: it shops and picks its next field.
    pilot.update(this);
    return ticks * TICK;
  }

  /**
   * Breaks rocks in a field until they've given about `want` ore on average, as mining them
   * would, and puts it in the ship's bay as plain ore items. Returns how much went in: fewer if
   * the field runs out or the bay fills.
   */
  private takeOre(ship: Ship, fieldId: string, want: number): number {
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
    // The ore aboard comes from this field, for the news a sale puts up.
    if (given > 0) ship.oreField = fieldId;
    const placed = this.placeInBay(ship, PLAIN_ORE, Math.floor(given + 1e-9));
    if (placed > 0) this.flow(PLAIN_ORE, placed);
    return placed;
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
      this.takeOre(ship, record.target, Math.floor(share * Math.max(0, this.deliveryLoad(ship) - this.oreIn(ship))));
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
    const perMinute = extra?.spec.rockInflow ?? 0;
    const drift = extra?.spec.rockDrift ?? 0;
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
    this.extraFields.forEach((extra, i) => {
      if (this.sleeping.has(extra.spec.id)) return;
      extra.inflowTimer = this.driftInto(fields[i], extra.spec.rockInflow, extra.spec.rocks, counts[i], extra.inflowTimer, dt);
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

  /**
   * Rocks fly on as they go. One that drifts out of its field slowly is pulled gently back in. One
   * knocked out fast isn't: pulled back, it would come swinging through the lanes at speed. It
   * flies on, and after a while it's gone for good, even should it come back through the field.
   */
  private moveRocks(dt: number): void {
    const { rockStraySpeed, rockStraySeconds } = this.tuning;
    const fields = this.awakeRockFields();
    let gone = false;
    for (const rock of this.rocks) {
      const { poi, radius } = fields[this.fieldAt(fields, rock.x, rock.y)];
      const outside = Math.hypot(rock.x - poi.x, rock.y - poi.y) > radius;
      if (rock.arriving) rock.arriving = outside;
      else if (rock.strayed !== undefined || (outside && Math.hypot(rock.vx, rock.vy) > rockStraySpeed)) {
        rock.strayed = (rock.strayed ?? 0) + dt;
        if (rock.strayed >= rockStraySeconds) gone = true;
      } else this.containInField(rock, poi, radius, dt);
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      rock.angle += rock.spin * dt;
    }
    if (gone) this.rocks = this.rocks.filter((rock) => (rock.strayed ?? 0) < rockStraySeconds);
  }

  /** Whether a ship's tractor beam is working: fitted, and room in the bay for a piece of ore. */
  tractorOn(ship: Ship): boolean {
    return (ship.parts.has("tractor") || ship.parts.has("tractorAll")) && this.cargoSpace(ship) > 0;
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
    // The dish looks the way its mount faces.
    const dish = mountWith(ship, "tractor");
    const look = ship.angle + (dish ? facing(dish.mount) : 0);
    const noseX = Math.cos(look);
    const noseY = Math.sin(look);
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
    for (const thing of [...this.ores, ...this.loot]) {
      thing.x += thing.vx * dt;
      thing.y += thing.vy * dt;
    }
    const forget = this.tuning.oreForgetDistance;
    if (forget === Infinity) return;
    const ships = [this.ship, ...this.pilots.map((pilot) => pilot.ship)];
    const kept = (thing: Body) =>
      this.pois.some((poi) => this.edgeDistance(poi, thing.x, thing.y) < forget) ||
      ships.some((ship) => Math.hypot(ship.x - thing.x, ship.y - thing.y) < forget);
    this.dropOres((ore) => !kept(ore));
    this.dropLoot((loot) => !kept(loot));
  }

  /** Removes the loose ore a test picks out. Whatever goes that way is counted out of the ledger. */
  private dropOres(gone: (ore: Loose) => boolean): void {
    this.ores = this.ores.filter((ore) => {
      if (!gone(ore)) return true;
      this.flow(ore.item, -ore.count);
      return false;
    });
  }

  /** Removes the loot a test picks out. Whatever items go that way are counted out of the ledger. */
  private dropLoot(gone: (loot: Loot) => boolean): void {
    this.loot = this.loot.filter((loot) => {
      if (!gone(loot)) return true;
      if (isItem(loot.item)) this.flow(loot.item, -loot.count);
      return false;
    });
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
    // Critical: nobody's flying it any more.
    if (ship.critical > 0) Object.assign(ship.controls, { thrust: 0, strafe: 0, turn: 0, fire: false, retro: false, stabilize: false });
    // On a click order the pilot decides, or the retro switch would fight its coasting.
    const usesSwitch = ship === this.ship && !this.clickPilot.flying;
    const retro = ship.parts.has("retro") && (usesSwitch ? tuning.retro : controls.retro);
    const spinAssist = retro || (ship.parts.has("spinStabilizer") && controls.stabilize);

    // Each thruster does what it does where it sits on the hull: see `thrustOf`.
    const thrust = thrustOf(ship);
    const spinChange = ((tuning.rotationThrust * Math.PI) / 180) * perTick;
    const { thrusterRotateRight: right, thrusterRotateLeft: left } = thrust.turn;
    const turned = this.fireAxis(
      ship,
      controls.turn,
      ship.spin,
      "thrusterRotateRight",
      "thrusterRotateLeft",
      spinChange * Math.abs(right),
      spinChange * Math.abs(left),
      spinAssist,
    );
    const turnedBy = turned > 0 ? right : left;
    // One turned round turns the other way, so it's no help steadying the spin.
    if (turnedBy < 0 && controls.turn === 0) ship.firing.delete(turned > 0 ? "thrusterRotateRight" : "thrusterRotateLeft");
    else ship.spin += turned * Math.sign(turnedBy);
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
    const forward = this.pushOf(ship, thrust, forwardChange, "thrusterMain", "thrusterReverse", 1, 0, controls.thrust);
    const side = this.pushOf(ship, thrust, sideChange, "thrusterStrafeRight", "thrusterStrafeLeft", 0, 1, controls.strafe);
    const along = forward.x + side.x;
    const across = forward.y + side.y;
    ship.vx += cos * along - sin * across;
    ship.vy += sin * along + cos * across;

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
    const want = ship.aim ? wrap(Math.atan2(ship.aim.y - ship.y, ship.aim.x - ship.x) - ship.angle) : wrap(facing(turretMount(ship) ?? { x: 0, y: 0, angle: 0, scale: 1 }));
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

  /**
   * The push, in the ship's frame, of the thruster that fired for `change` on an axis, which way
   * it really points. Steadying with no command, one that pushes against the axis doesn't fire.
   */
  private pushOf(
    ship: Ship,
    thrust: ReturnType<typeof thrustOf>,
    change: number,
    positive: ThrusterId,
    negative: ThrusterId,
    axisX: number,
    axisY: number,
    command: number,
  ): { x: number; y: number } {
    if (change === 0) return { x: 0, y: 0 };
    const role = change > 0 ? positive : negative;
    const push = thrust.push[role] ?? { x: axisX * Math.sign(change), y: axisY * Math.sign(change) };
    if (command === 0 && (push.x * axisX + push.y * axisY) * change <= 0) {
      ship.firing.delete(role);
      return { x: 0, y: 0 };
    }
    const size = Math.abs(change);
    return { x: push.x * size, y: push.y * size };
  }

  /** A control needs a working thruster on it. */
  private canFire(ship: Ship, thruster: ThrusterId): boolean {
    // Any working thruster on a mount it fires.
    return mountsOf(ship).some((mount) => {
      if (mount.role !== thruster) return false;
      const module = ship.fit[mount.id];
      return works(module) && partOf(module.part).kind === "thruster";
    });
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
    let station = NOWHERE;
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
      // It lands on the side that touched.
      this.damageModule(ship, -nx * SHIP_RADIUS, -ny * SHIP_RADIUS, damage);
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
    for (const loot of this.loot) pull(loot);
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
        ship.damageTaken += Math.max(0, ship.hull);
        ship.hull = 0;
        this.wreckShip(ship, true);
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
    const clear = (thing: Body) => solid.every(({ body, x, y }) => Math.hypot(thing.x - x, thing.y - y) >= body.radius);
    this.dropOres((ore) => !clear(ore));
    this.dropLoot((loot) => !clear(loot));
  }

  /**
   * The hull has given out: the ship goes critical, out of control, and explodes once its
   * time is up, or at once (on deadly ground). A player's pod launches as it goes critical.
   */
  private wreckShip(ship: Ship, now = false): void {
    if (ship.critical <= 0) this.goCritical(ship);
    if (now || this.tuning.criticalSeconds <= 0) this.explode(ship);
  }

  private goCritical(ship: Ship): void {
    ship.critical = Math.max(TICK, this.tuning.criticalSeconds);
    // It tumbles as control goes.
    ship.spin += (this.random() - 0.5) * 6;
    if (ship !== this.ship) return;
    this.clickPilot.cancel();
    if (this.tuning.askHull) this.launchPod(ship);
  }

  /** Counts down every critical ship, blowing up those whose time is up, and flies the player's pod. */
  private burnDown(dt: number): void {
    for (const ship of [this.ship, ...this.pilots.map((pilot) => pilot.ship)]) {
      if (ship.critical <= 0) continue;
      ship.critical -= dt;
      if (ship.critical <= 0) this.explode(ship);
    }
    this.movePod();
  }

  /**
   * The ship goes up. What it carried and whatever modules came through whole are left
   * drifting; destroyed modules are gone. Explosive modules go up with it first. Then it's
   * rebuilt as before, as a bare hull, except the player's, which waits for its pod.
   */
  private explode(ship: Ship): void {
    ship.critical = 0;
    const player = ship === this.ship;
    this.events.push({ type: "wreck", x: ship.x, y: ship.y, player });
    ship.wrecks++;
    this.dropOre(ship);
    this.blowUp(ship);
    const cost = this.hullPrice(ship.model);
    const account = this.accountOf(ship);
    if (player) {
      const cleared = ship.marked || ship.wanted;
      const yard = this.nearestBase(ship.x, ship.y, true);
      this.respawn(ship);
      if (this.down) {
        this.down.exploded = true;
        this.down.cleared = cleared;
        return;
      }
      // Nobody asked: a bare hull from the nearest yard, straight away.
      this.bareHull(ship);
      this.finishRebuild(yard, cost, cleared);
      return;
    }
    // A pirate is rebuilt from its base's money, or it's gone for good.
    if (ship.faction === "pirate") {
      if (this.pirateCredits < cost) {
        this.removeShip(ship);
        return;
      }
      this.pirateCredits -= cost;
      ship.upkeep += cost;
      this.bareHull(ship);
      this.respawn(ship);
      return;
    }
    // A defender is never rebuilt. The station builds a new one when lost traffic calls for it.
    if (ship.faction === "defender") {
      this.removeShip(ship);
      return;
    }
    // Rebuilt at the nearest base with a shipyard, which takes the pay and spends its parts. With no shipyard anywhere, it's gone.
    const yard = this.nearestBase(ship.x, ship.y, true);
    if (!this.hasShipyard(yard.poi) || (cost > 0 && (account.credits < cost || !this.hasStockFor(cost, yard)))) {
      this.removeShip(ship);
      return;
    }
    this.chargeForService(account, cost, yard);
    ship.upkeep += cost;
    this.bareHull(ship);
    this.respawn(ship);
  }

  /** Explosive modules go up, wearing the rest; then whatever's still whole is set adrift, with what was in the bay. */
  private blowUp(ship: Ship): void {
    const modules = Object.values(ship.fit).filter((module): module is Module => module !== undefined);
    for (const bomb of modules) {
      const blast = partOf(bomb.part).explosive ?? 0;
      if (blast <= 0 || bomb.wear >= 1) continue;
      bomb.wear = 1;
      for (const other of modules) if (other !== bomb) other.wear = Math.min(1, other.wear + blast / this.moduleToughness(other));
    }
    for (const module of [...modules, ...ship.hold.map((item) => item.module)]) if (module.wear < 1) this.setAdrift(ship, module, WRECK_ORE_SPEED * 2);
    ship.fit = {};
    ship.hold = [];
    ship.oreBlocks = [];
    refresh(ship);
  }

  /** A hull as the yard makes it, with its pilot's programs loaded again as far as they fit. */
  private bareHull(ship: Ship): void {
    const { software, programs, decals, tweaks } = ship;
    Object.assign(ship, newFitting(ship.model));
    ship.software = software;
    ship.programs = programs;
    // The picks are the pilot's, like the programs: they come back with them.
    ship.tweaks = tweaks;
    ship.targets = [];
    // It's the same hull, so it keeps its look.
    ship.decals = decals;
    trimPrograms(ship);
  }

  /**
   * The player's pod pops out sideways as the ship goes critical, drifts clear while it goes
   * up, then sets out for the nearest shipyard, round whatever's in the way.
   */
  private launchPod(ship: Ship): void {
    const base = this.nearestBase(ship.x, ship.y, true);
    const side = ship.angle + (this.random() < 0.5 ? 1 : -1) * Math.PI * 0.6;
    const lost: Down["lost"] = {};
    for (const [mount, module] of Object.entries(ship.fit) as [MountId, Module | undefined][]) if (module) lost[mount] = module.part;
    this.down = {
      stage: "pod",
      base: base.id,
      launched: this.clock,
      vx: ship.vx * 0.5 + Math.cos(side) * POD_EJECT_SPEED,
      vy: ship.vy * 0.5 + Math.sin(side) * POD_EJECT_SPEED,
      path: [],
      aim: { x: 0, y: 0 },
      depart: this.clock + Math.max(0, this.tuning.criticalSeconds) + POD_DRIFT_SECONDS,
      arrive: 0,
      x: ship.x,
      y: ship.y,
      px: ship.x,
      py: ship.y,
      lost,
      exploded: false,
      readyAt: 0,
      cleared: false,
    };
  }

  /** Lays out the pod's route from where it has drifted to, and when it gets in. */
  /** The yard the pod is bound for: the one it set out for, or if that's gone, the nearest with a shipyard. */
  private podBase(down: Down): Base {
    return this.bases.find((each) => each.id === down.base) ?? this.nearestBase(down.x, down.y, true);
  }

  private planPod(down: Down): void {
    const base = this.podBase(down);
    const end = this.dockPoint(false, base.poi);
    const path = [{ x: down.x, y: down.y }];
    for (let i = 0; i < 6; i++) {
      const at = path[path.length - 1];
      const corner = this.cornerToward(at.x, at.y, end.x, end.y);
      if (!corner) break;
      path.push(corner);
    }
    path.push(end);
    let length = 0;
    for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    down.path = path;
    down.aim = { ...end };
    down.arrive = Math.max(this.clock, down.depart) + Math.max(POD_MIN_FLIGHT_SECONDS, length / Math.max(1, this.tuning.podSpeed));
  }

  /** Flies the pod along its route by the clock, and keeps the player's lost ship parked at the yard meanwhile. */
  private movePod(): void {
    const down = this.down;
    if (!down) return;
    const base = this.podBase(down);
    const dock = this.dockPoint(false, base.poi);
    down.px = down.x;
    down.py = down.y;
    if (down.stage === "pod" && down.path.length === 0 && (this.clock < down.depart || !down.exploded)) {
      // Drifting clear of the wreck, the push dying away.
      const fade = Math.exp(-(this.clock - down.launched) / POD_DRIFT_EASE);
      down.x += down.vx * fade * TICK;
      down.y += down.vy * fade * TICK;
    } else if (down.stage === "pod") {
      if (down.path.length === 0) {
        down.depart = this.clock;
        this.planPod(down);
      }
      // Eases out of the drift and into the dock, cruising between.
      const raw = Math.min(1, (this.clock - down.depart) / Math.max(TICK, down.arrive - down.depart));
      const share = raw * raw * (3 - 2 * raw);
      const at = alongPath(down.path, share);
      down.x = at.x + share * (dock.x - down.aim.x);
      down.y = at.y + share * (dock.y - down.aim.y);
      if (raw >= 1) down.stage = "choosing";
    } else {
      down.x = dock.x;
      down.y = dock.y;
    }
    if (down.exploded) {
      const { ship } = this;
      ship.x = ship.px = dock.x;
      ship.y = ship.py = dock.y;
      ship.vx = ship.vy = 0;
      ship.spin = 0;
      Object.assign(this.controls, { thrust: 0, strafe: 0, turn: 0, fire: false });
    }
    if (down.stage === "rebuilding" && this.clock >= down.readyAt) {
      const { ship } = this;
      for (const [mount, part] of Object.entries(down.lost) as [MountId, PartId][]) ship.fit[mount] = { part, wear: 0 };
      refresh(ship);
      trimPrograms(ship);
      this.finishRebuild(base, this.hullPrice(ship.model), down.cleared);
    }
  }

  /** What a rebuild of the lost ship costs beyond a bare hull: every part it had that the hull doesn't come with. */
  rebuildExtras(): PartId[] {
    if (!this.down) return [];
    const defaults = hullDefaults(this.ship.model);
    const extras: PartId[] = [];
    for (const [mount, part] of Object.entries(this.down.lost) as [MountId, PartId][]) if (defaults[mount] !== part) extras.push(part);
    return extras;
  }

  /** The price of a rebuild, and whether the pod's base can supply everything for it. */
  rebuildOffer(): { cost: number; seconds: number; missing: PartId[] } {
    const down = this.down;
    const base = down ? this.podBase(down) : this.nearestBase(this.ship.x, this.ship.y, true);
    const extras = this.rebuildExtras();
    let cost = this.hullPrice(this.ship.model);
    const needed = new Map<PartId, number>();
    for (const id of extras) {
      cost += Math.round(this.partPrice(id) / (partOf(id).set ?? 1));
      needed.set(id, (needed.get(id) ?? 0) + 1);
    }
    const missing = [...needed.keys()].filter((id) => !this.canSupply(base, id));
    const seconds = this.tuning.rebuildSeconds + this.tuning.rebuildSecondsPerPart * extras.length;
    return { cost, seconds, missing };
  }

  /**
   * The player picks what to fly next, once the pod is in: a bare hull with its own gear at
   * once, or the ship they lost, rebuilt from the base's store, which costs more and takes a
   * while. Returns whether it went ahead.
   */
  chooseHull(rebuild: boolean): boolean {
    const down = this.down;
    if (!down || down.stage !== "choosing") return false;
    const base = this.podBase(down);
    const { ship } = this;
    if (!rebuild) {
      this.bareHull(ship);
      this.finishRebuild(base, this.hullPrice(ship.model), down.cleared);
      return true;
    }
    const offer = this.rebuildOffer();
    if (offer.missing.length > 0 || ship.credits < offer.cost - this.hullPrice(ship.model)) return false;
    // The hull itself is paid on the same terms as ever; the parts on top, from the store or made.
    this.chargeForService(ship, this.hullPrice(ship.model), base);
    ship.upkeep += this.hullPrice(ship.model);
    for (const id of this.rebuildExtras()) this.supply(ship, id, base, 1);
    down.stage = "rebuilding";
    down.readyAt = this.clock + offer.seconds;
    return true;
  }

  /** The player's new ship is ready in the yard's dock. The hull's price was paid when it was chosen, or is paid now. */
  private finishRebuild(base: Base, cost: number, cleared: boolean): void {
    const { ship } = this;
    const rebuilt = this.down?.stage === "rebuilding";
    if (!rebuilt) {
      this.chargeForService(ship, cost, base);
      ship.upkeep += cost;
    }
    this.down = null;
    this.respawn(ship);
    const dock = this.dockPoint(false, base.poi);
    ship.x = ship.px = dock.x;
    ship.y = ship.py = dock.y;
    if (this.tuning.chatter) this.chatter.playerRebuilt(cost, cleared, base.poi);
  }

  /**
   * Ore spills out of a wreck for anyone to collect, as plain ore items. With `keep`, only what
   * the bay has no room for goes.
   */
  private dropOre(ship: Ship, keep = 0): void {
    const ore = ship.hold.map((placed, index) => ({ placed, index })).filter(({ placed }) => isOreItem(placed.module.part));
    let left = ore.length - Math.max(0, keep);
    for (const { index } of [...ore].reverse()) {
      if (left <= 0) break;
      if (this.floatingWithout(ship, index).length > 0) continue;
      const [placed] = ship.hold.splice(index, 1);
      const here = { x: ship.x, y: ship.y };
      const loose: Loose = {
        x: here.x,
        y: here.y,
        px: here.x,
        py: here.y,
        ...this.wreckKick(ship),
        item: placed.module.part,
        wear: 0,
        count: 1,
        kind: Math.floor(this.random() * ORE_KINDS),
      };
      this.ores.push(loose);
      left--;
    }
  }

  /** A wreck's drift: where a piece of its ore goes and how fast. */
  private wreckKick(ship: Ship): { vx: number; vy: number } {
    const dir = this.random() * Math.PI * 2;
    const kick = WRECK_ORE_SPEED * (0.5 + this.random() * 0.5);
    return { vx: ship.vx + Math.cos(dir) * kick, vy: ship.vy + Math.sin(dir) * kick };
  }

  private removeShip(ship: Ship): void {
    // Lost traffic is the loss of the base that would have rebuilt it, which replaces it in time.
    if (this.traffic.some((pilot) => pilot.ship === ship)) {
      this.nearestBase(ship.x, ship.y, true).lostTraffic.push(ship.model);
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
    return PIRATE_PARTS.filter((id) => this.wouldUse(ship, id));
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
      this.equip(ship, next);
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

  /** Where the black market berths at the pirate base, and the way it comes and goes: straight out from what the base goes round. */
  private blackMarketLane(): { x: number; y: number; dx: number; dy: number } | null {
    const base = this.pirateBase;
    if (!base) return null;
    const ring = this.pirateSpec?.rings?.[0];
    const from = ring ? orbitsAt(ring.center, this.clock) : { x: 0, y: 0 };
    const away = Math.hypot(base.x - from.x, base.y - from.y) || 1;
    const dx = (base.x - from.x) / away;
    const dy = (base.y - from.y) / away;
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
      const id = this.oreOrder(this.pirateOre).find((each) => (this.pirateOre.get(each) ?? 0) > 0);
      if (!id || market.cargo + volumeOf(id) > tuning.blackMarketCapacity) {
        market.loadTimer = 0;
        return;
      }
      this.addTo(this.pirateOre, id, -1);
      market.cargo += volumeOf(id);
      this.pirateCredits += Math.round((itemDef(id)?.price ?? 0) * tuning.blackMarketShare);
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
      if (deposit.partsLeft <= 0 && this.oreCount(deposit.ore) >= load && distance < best) {
        best = distance;
        found = deposit;
      }
    }
    const base = this.pirateBase;
    const grudge = ship.pirateKilledAt !== null && this.clock - ship.pirateKilledAt < tuning.pirateGrudgeSeconds;
    if (base && this.oreCount(this.pirateOre) >= load && !ship.marked && !grudge) {
      if (Math.hypot(base.x - ship.x, base.y - ship.y) < best) found = "pirate base";
    }
    return found;
  }

  /** How much ore the pirate base would sell this ship: only to an empty hold, close by. */
  pirateBaseBuyable(ship: Ship): number {
    const base = this.pirateBase;
    if (!base || ship.faction === "pirate" || this.oreIn(ship) > 0) return 0;
    if (Math.hypot(ship.x - base.x, ship.y - base.y) > this.tuning.pirateBaseReach) return 0;
    const { depositSells } = this.tuning;
    const affordable = depositSells > 0 ? Math.floor(this.accountOf(ship).credits / depositSells) : Infinity;
    return Math.max(0, Math.min(this.oreCount(this.pirateOre), affordable, this.cargoSpace(ship)));
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
    // An anchor is found when its size comes within the screen, so a size of zero is found too.
    const { halfWidth, halfHeight } = this.screen;
    for (const anchor of this.anchors) {
      const at = orbitsAt(anchor.orbits, this.clock);
      if (Math.abs(ship.x - at.x) < halfWidth + anchor.radius && Math.abs(ship.y - at.y) < halfHeight + anchor.radius) {
        discovered.add(`chart:anchor:${anchor.id}`);
      }
    }
  }

  /** Whether the chart draws an anchor: found once any of it has been on screen. */
  chartSeenAnchor(anchor: AnchorSpec): boolean {
    return this.discovered.has(`chart:anchor:${anchor.id}`);
  }

  /** The chart's own key for a place: what the discovered set holds for it. */
  chartKey(poi: Poi): string {
    if (poi === this.pirateBase) return "pirate base";
    const extra = this.extraFields.find(({ poi: at }) => at === poi);
    if (extra) return `extra:${extra.spec.id}`;
    // Saves call these "outpost:", from when the designer's stations were only that.
    const base = this.baseOf(poi);
    if (base) return `outpost:${base.spec.id}`;
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
    let taken = 0;
    for (const id of this.oreOrder(this.pirateOre)) {
      const held = this.pirateOre.get(id) ?? 0;
      for (let i = 0; i < held && taken < amount; i++) {
        if (this.placeInBay(ship, id) === 0) break;
        this.addTo(this.pirateOre, id, -1);
        taken++;
      }
      if (taken >= amount) break;
    }
    if (taken === 0) return 0;
    const credits = taken * this.tuning.depositSells;
    ship.oreField = null;
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
    const spare = this.partA(base) + base.partCarry - tuning.stationReserveParts;
    const dock = this.dockPoint(false, base.poi);
    const hasDefender = this.fighters.some((pilot) => pilot.ship.faction === "defender" && this.homeBaseOf(pilot.ship) === base);
    if (!hasDefender && tuning.defenderPrice > 0) {
      if (spare < this.stockFor(tuning.defenderPrice)) return;
      this.chargeForService(base.account, tuning.defenderPrice, base);
      this.addFighter(dock.x, dock.y, "defender", base.id);
      if (this.tuning.chatter) this.chatter.defenderLaunched(this, base.poi);
    } else {
      const cost = this.hullPrice(base.lostTraffic[0]);
      if (spare < this.stockFor(cost)) return;
      this.chargeForService(base.account, cost, base);
      this.addTraffic(dock.x, dock.y, base.lostTraffic.shift()!, base.id);
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
    this.damageModule(ship, shot.x - ship.x, shot.y - ship.y, damage);
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
    // A ship already going up is no danger, and shooting it more only wrecks what it would leave.
    if (target.critical > 0) return false;
    if (attacker.faction === "pirate") return target.faction !== "pirate" && (this.oreIn(target) > 0 || target.marked);
    return attacker.wanted;
  }

  private fireShots(ship: Ship): void {
    const { tuning } = this;
    if (!ship.controls.fire || ship.cooldown > 0) return;
    // Every working gun fires, each the way it faces, from the line through its mount, just
    // clear of the hull. They wait on the slowest. No working gun, no shot.
    const guns = mountsOf(ship).filter((mount) => {
      const module = ship.fit[mount.id];
      return works(module) && partOf(module.part).kind === "gun";
    });
    if (guns.length === 0) return;
    let wait = 0;
    for (const mount of guns) {
      const precise = ship.fit[mount.id]!.part === "gun2";
      const turret = mount.id === "turretGun";
      wait = Math.max(wait, 1 / (precise ? tuning.gun2ShotsPerSecond : tuning.shotsPerSecond));
      const aim = turret ? ship.turretAngle : facing(mount);
      const angle = ship.angle + aim;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const aside = (-mount.x * Math.sin(aim) + mount.y * Math.cos(aim)) * SHIP_RADIUS;
      const x = ship.x + cos * (SHIP_RADIUS + 4) - sin * aside;
      const y = ship.y + sin * (SHIP_RADIUS + 4) + cos * aside;
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
    ship.cooldown = wait;
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
      item: PLAIN_ORE,
      wear: 0,
      count: 1,
      from,
    });
    this.flow(PLAIN_ORE, 1);
  }

  /**
   * Breaks a rock into smaller ones and maybe some ore, marked as freed by `by` if anyone.
   * Pieces and ore drift on with the rock. A break by gun 1 may fling some ore away, worth more.
   */
  breakRock(rock: Rock, by: Ship | null = null, flings = false): void {
    const { tuning } = this;
    this.rocks.splice(this.rocks.indexOf(rock), 1);
    this.events.push({ type: "break", x: rock.x, y: rock.y, radius: rock.radius });

    // A ship that had the rock picked keeps its place in the queue: the pieces take it over,
    // the largest first. A bottom-tier rock breaks into nothing, so its place simply goes.
    const made: Rock[] = [];

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
        made.push(this.rocks[this.rocks.length - 1]);
      }
    }

    const heirs = made.slice().sort((a, b) => b.radius - a.radius);
    for (const ship of this.ships) {
      const at = ship.targets.indexOf(rock);
      if (at < 0) continue;
      ship.targets.splice(at, 1, ...heirs.filter((piece) => this.inRange(ship, piece)));
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
        item: PLAIN_ORE,
        wear: 0,
        count: flung ? tuning.flingOreAmount : 1,
        from: by,
      });
      this.flow(PLAIN_ORE, flung ? tuning.flingOreAmount : 1);
    }

    // A field with drops lets go of items too, one roll per drop for each ore roll, loose at the rock's spot.
    // Nothing is drawn from the random stream for a field without drops, so seeded games run as they did.
    const drops = this.dropsAt(rock.x, rock.y);
    if (drops) {
      for (let i = 0; i < rolls; i++) {
        for (const drop of drops) {
          if (this.random() >= drop.chance) continue;
          const id = drop.item as PartId;
          const loose: Loose = { x: rock.x, y: rock.y, px: rock.x, py: rock.y, vx: rock.vx, vy: rock.vy, item: id, wear: 0, count: 1, kind: 0 };
          if (isOreItem(id)) this.ores.push(loose);
          else this.loot.push(loose);
          this.flow(id, 1);
        }
      }
    }
  }

  /** The items the rocks of the field at a spot drop, if it has any that exist. */
  private dropsAt(x: number, y: number): FieldDrop[] | undefined {
    if (!this.extraFields.some((extra) => extra.spec.drops !== undefined && extra.spec.drops.length > 0)) return undefined;
    const id = this.miningFieldAt(x, y).id;
    const drops = this.extraFields.find((extra) => extra.spec.id === id)?.spec.drops?.filter((drop) => itemDef(drop.item) !== undefined && drop.chance > 0);
    return drops && drops.length > 0 ? drops : undefined;
  }

  /** A base's name, as news and shops show it. */
  baseName(id: string): string {
    const base = this.bases.find((each) => each.id === id);
    return base?.spec.name ?? id;
  }

  /** A field's name, by its id, as the news board shows it. */
  fieldName(id: string): string {
    const extra = this.extraFields.find((each) => each.spec.id === id);
    return extra ? this.placeName(extra.poi) : "Field";
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
    // Word of what only this base sells, so a place worth the trip is known: a module every base
    // sells is nothing to travel for.
    const sellers = (id: PartId) => this.bases.filter((each) => this.unlocked(id, each)).length;
    const own: Report[] = PARTS.filter((part) => this.unlocked(part.id, base) && this.bases.length > 1 && sellers(part.id) === 1).map((part) => ({
      base: base.id,
      item: part.id,
      price: this.partPrice(part.id),
      seen: this.clock,
    }));
    const newest = new Map<string, Report>();
    const oldest = this.clock - this.tuning.newsLife;
    const known = new Set(base.board.filter((report) => report.seen >= oldest).map(newsKey));
    const heard = new Set(ship.news.filter((report) => report.seen >= oldest).map(newsKey));
    for (const report of [...base.board, ...ship.news, ...own]) {
      if (report.seen < oldest) continue;
      const key = newsKey(report);
      const before = newest.get(key);
      if (!before || report.seen > before.seen) newest.set(key, report);
    }
    // Word of a base that's gone goes with it.
    const merged = [...newest.values()].filter((report) => this.bases.some((each) => each.id === report.base));
    // Word the board had none of, from another base: whoever brought it says so on the radio.
    const brought = merged.filter((report) => report.base !== base.id && !known.has(newsKey(report)));
    if (brought.length > 0 && ship !== this.ship && this.tuning.chatter) this.chatter.newsBrought(this, ship, base, brought);
    // Word the player hadn't heard, from another base: the station tells them as they dock.
    const told = merged.filter((report) => report.base !== base.id && !heard.has(newsKey(report)));
    if (told.length > 0 && ship === this.ship && this.tuning.chatter) this.chatter.newsForPlayer(this, base, told);
    base.board = merged;
    // Ore news stays where it was sold: it's the board's, never a ship's to carry on.
    ship.news = merged.filter((report) => !report.field);
  }

  /** Ore turns into credits one item at a time while in the dock, each at its own price. */
  private unloadOre(ship: Ship, dt: number): void {
    if (!this.isHome(ship)) {
      ship.unloadTimer = 0;
      return;
    }
    ship.unloadTimer += dt;
    let sold = false;
    while (ship.unloadTimer >= UNLOAD_SECONDS) {
      // Ore that holds something up in the bay stays aboard.
      const at = ship.hold.findIndex((placed, index) => isOreItem(placed.module.part) && this.floatingWithout(ship, index).length === 0);
      if (at < 0) break;
      ship.unloadTimer -= UNLOAD_SECONDS;
      const placed = ship.hold[at];
      const price = partOf(placed.module.part).price;
      // A station with no room for it stops buying, and it stays aboard.
      if (ship.faction !== "pirate") {
        const base = this.serviceBase(ship);
        if (this.storageFree(base) < volumeOf(placed.module.part)) break;
        this.accountOf(ship).credits += price;
        this.addTo(base.ore, placed.module.part, 1);
        base.account.credits -= price;
      } else this.addTo(this.pirateOre, placed.module.part, 1);
      ship.hold.splice(at, 1);
      sold = true;
      ship.earned += price;
      this.events.push({ type: "sale", x: ship.x, y: ship.y });
      if (this.oreIn(ship) === 0) ship.trips++;
    }
    if (sold) this.postOreNews(ship, this.serviceBase(ship));
  }

  /**
   * A sale puts up word of the field the ore was mined in, one line per ore that field drops:
   * the same line however often the ore comes in. Other ships' sales only: a player's own
   * mining isn't news.
   */
  private postOreNews(ship: Ship, base: Base | null): void {
    const { oreField } = ship;
    if (!base || !oreField || !this.traffic.some((pilot) => pilot.ship === ship)) return;
    const drops = this.extraFields.find((extra) => extra.spec.id === oreField)?.spec.drops ?? [];
    for (const { item } of drops) {
      if (!isOreItem(item)) continue;
      const report: Report = { base: base.id, item: item as PartId, price: 0, seen: this.clock, field: oreField };
      const at = base.board.findIndex((each) => newsKey(each) === newsKey(report));
      if (at >= 0) base.board[at] = report;
      else base.board.push(report);
    }
  }

  /** Whether the ship has the money for a hull point, and its dock the ore. */
  canPayRepair(ship: Ship): boolean {
    return this.canPayFor(ship, this.tuning.repairCost);
  }

  /** Whether the dock could repair this ship right now. */
  canRepair(ship: Ship): boolean {
    if (!this.isHome(ship)) return false;
    const next = this.nextRepair(ship);
    return next !== null && this.canPayFor(ship, next.cost, next.stocked);
  }

  /**
   * What the dock fixes next: the hull a point at a time, then worn modules a point at a
   * time, then destroyed ones replaced whole. Each step and what it costs.
   */
  private nextRepair(ship: Ship): { mount: MountId | null; cost: number; stocked?: boolean } | null {
    const { repairCost } = this.tuning;
    if (ship.hull < hullMax(ship.model)) return { mount: null, cost: repairCost };
    let replace: { mount: MountId; cost: number; stocked: boolean } | null = null;
    const base = this.serviceBase(ship);
    for (const [mount, module] of Object.entries(ship.fit) as [MountId, Module | undefined][]) {
      if (!module || module.wear <= 0) continue;
      if (module.wear < 1) return { mount, cost: repairCost };
      const part = partOf(module.part);
      const stocked = ship.faction !== "pirate" && this.stockOf(base, module.part) > 0;
      replace ??= { mount, cost: Math.round(this.partPrice(module.part) / (part.set ?? 1)), stocked };
    }
    return replace;
  }

  /** Whether the ship can pay for a service, and its dock has the parts for it. */
  private canPayFor(ship: Ship, cost: number, stocked = false): boolean {
    if (ship.faction === "pirate") return this.pirateCredits >= cost;
    if (!stocked && !this.hasPartsFor(cost, ship)) return false;
    return ship.faction === "defender" || this.accountOf(ship).credits >= cost;
  }

  /** The dock repairs a point at a time, for as long as the ship can pay, and replaces what was destroyed. */
  private repairHull(ship: Ship, dt: number): void {
    const { tuning } = this;
    if (!this.canRepair(ship)) {
      ship.repairTimer = 0;
      return;
    }
    ship.repairTimer += dt * tuning.repairSpeed;
    while (ship.repairTimer >= 1 && this.canRepair(ship)) {
      ship.repairTimer -= 1;
      const next = this.nextRepair(ship)!;
      if (next.mount === null) ship.hull = Math.min(hullMax(ship.model), ship.hull + 1);
      else {
        const module = ship.fit[next.mount]!;
        module.wear = module.wear >= 1 ? 0 : Math.max(0, module.wear - 1 / this.moduleToughness(module));
        refresh(ship);
      }
      if (ship.faction === "pirate") this.pirateCredits -= next.cost;
      else if (next.stocked) this.supply(this.accountOf(ship), ship.fit[next.mount!]!.part, this.serviceBase(ship), 1);
      else this.chargeForService(this.accountOf(ship), next.cost, this.serviceBase(ship));
      ship.upkeep += next.cost;
    }
  }

  /** How many hull points of hits a module takes before it's destroyed. A ship's core is built tougher. */
  moduleToughness(module: Module): number {
    const part = partOf(module.part);
    // The computer, and the hull's own engine and turning thrusters.
    const core = part.kind === "computer" || (part.kind === "thruster" && part.builtIn === true);
    return this.tuning.moduleToughness * (core ? this.tuning.coreToughness : 1);
  }

  /**
   * A hit at this spot (relative to the ship) wears the module on the nearest mount. Half
   * worn, it stops working; fully worn, it's destroyed and stays a dead stub until replaced.
   */
  damageModule(ship: Ship, dx: number, dy: number, damage: number): void {
    if (!this.tuning.moduleDamage || damage <= 0) return;
    const mount = nearestMount(ship, dx, dy, SHIP_RADIUS);
    if (!mount) return;
    const module = ship.fit[mount]!;
    const before = module.wear;
    module.wear = Math.min(1, module.wear + damage / this.moduleToughness(module));
    if (before < DAMAGED_AT === module.wear < DAMAGED_AT && before < 1 === module.wear < 1) return;
    refresh(ship);
    // A destroyed bay loses what it held beyond the room that's left.
    if (module.wear >= 1) {
      if (partOf(module.part).bay) this.settleHold(ship, null);
      this.dropOre(ship, this.cargoSpace(ship));
    }
  }

  /** Whether a ship can't do its work out there, whatever its hull: it has no working gun. */
  crippled(ship: Ship): boolean {
    return !ship.parts.has("gun1") && !ship.parts.has("gun2");
  }

  private collectOre(ship: Ship): void {
    const reach = SHIP_RADIUS + ORE_RADIUS + PICKUP_MARGIN;
    const touch = (body: { x: number; y: number; px: number; py: number }) =>
      sweepCircle(body.px - ship.px, body.py - ship.py, body.x - body.px - (ship.x - ship.px), body.y - body.py - (ship.y - ship.py), reach) !== null;
    // Only the player picks up parts and modules for now: nobody else has a use for them yet.
    if (ship === this.ship && this.loot.length > 0) {
      this.loot = this.loot.filter((loot) => {
        if (!touch(loot) || this.holdSpotFor(ship, { part: loot.item, wear: loot.wear }) === null) return true;
        this.placeInBay(ship, loot.item, loot.count, loot.wear);
        this.events.push({ type: "pickup", x: loot.x, y: loot.y, kind: 0 });
        return false;
      });
    }
    // Ore: any ship takes it by touching it, as many as fit.
    this.ores = this.ores.filter((ore) => {
      if (!touch(ore)) return true;
      const taken = this.takeLoose(ship, ore);
      if (taken === 0) return true;
      // The ore aboard comes from the field it was picked up in, for the news a sale puts up.
      ship.oreField = this.miningFieldAt(ship.x, ship.y).id;
      if (taken < ore.count) {
        // What doesn't fit stays out there.
        ore.count -= taken;
        return true;
      }
      if (this.tuning.chatter) this.chatter.pickedUp(this, ship, ore);
      if (ship === this.ship) this.stats.bestOre = Math.max(this.stats.bestOre, this.oreIn(ship));
      this.events.push({ type: "pickup", x: ore.x, y: ore.y, kind: ore.kind });
      return false;
    });
  }
}

/**
 * How fast the escape pod pops out of a critical ship, how long it drifts clear once the ship
 * has gone up (about the wreck watch), and how fast that drift dies away.
 */
const POD_EJECT_SPEED = 90;
const POD_DRIFT_SECONDS = 2.6;
const POD_DRIFT_EASE = 2;
/** The shortest flight to the yard, so there's always a ride to watch. */
const POD_MIN_FLIGHT_SECONDS = 6;

/** The point a share of the way along a path of straight pieces. */
function alongPath(path: { x: number; y: number }[], share: number): { x: number; y: number } {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  let left = share * length;
  for (let i = 1; i < path.length; i++) {
    const piece = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (left <= piece && piece > 0) {
      return { x: path[i - 1].x + ((path[i].x - path[i - 1].x) * left) / piece, y: path[i - 1].y + ((path[i].y - path[i - 1].y) * left) / piece };
    }
    left -= piece;
  }
  return path[path.length - 1];
}

/** How many cells a module takes on a grid. */
function cellCount(module: Module): number {
  const { w, h } = footprint({ module, turned: false });
  return w * h;
}
