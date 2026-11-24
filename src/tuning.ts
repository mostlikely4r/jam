export const DEFAULTS = {
  weight: 1,
  thrust: 420,
  reverseThrust: 220,
  sideThrust: 200,
  rotationThrust: 400,
  /** With Shift held, how many seconds a thruster key takes to ramp from off to full. */
  throttleRamp: 1.5,

  retro: false,

  shotSpeed: 1100,
  shotsPerSecond: 7,
  shotLife: 1.1,
  rockToughness: 6,
  oreChance: 0.45,
  /** How fast broken pieces drift apart. Zero keeps them moving with the rock. */
  rockBreakSpeed: 0,
  /**
   * A rock that leaves its field faster than this (its own speed, not the field's) is knocked out:
   * nothing pulls it back, and after `rockStraySeconds` out it's gone. Slower ones, the field's own
   * drift, are pulled gently back in, so the field doesn't empty.
   */
  rockStraySpeed: 40,
  rockStraySeconds: 30,
  /** Gun 1 only: the chance each piece of ore from a break flies off, and what it's worth. */
  flingChance: 0.3,
  flingOreAmount: 3,

  /** Draws each place's carrying zones. Every place's own ranges are in its spec, from the layout. */
  showPoiZones: false,
  /** Loose ore this far from every POI's edge and every ship is gone for good. */
  oreForgetDistance: 6000,

  /** Whether a station rebuilds wrecked ships, when its spec doesn't say. A wreck goes to the nearest station that does. */
  stationShipyard: true,
  /**
   * Cells of storage at a base whose spec doesn't say. The player's lockers, its store of whole
   * modules and the ore it holds for the hauler all come out of it. 1200, up from 300: a hull
   * that mines on its own comes back with more ore than a station used to hold at all.
   */
  stationStorage: 1200,
  /** How many cells across a locker is. */
  lockerWidth: 6,
  /** The rows of locker every base gives the player for free. */
  lockerFreeRows: 2,
  /** What one more row of locker costs, bought once and kept. */
  lockerRowPrice: 500,
  dockDrag: 0.25,

  repairCost: 2,
  repairSpeed: 25,
  rebuildCost: 300,

  safeImpactSpeed: 90,
  /** Hull lost each second for every unit/s a ship goes past a body's burn speed in its air. */
  burnDamage: 0.03,
  damagePerSpeed: 0.12,
  bounce: 0.45,

  partPriceScale: 1,
  partWeightScale: 1,

  floaterStart: true,
  /** The hull the start menu puts the player in. Empty: the floater, or the racer, by `floaterStart`. */
  startHull: "",
  floaterEngine: 0.2,
  clickSpeed: 80,
  /** A course's top speed. The burn out and the brake in keep the trip time right; this only
   * keeps a very long course sane, so stars sit near this and moons well under it. */
  autopilotSpeed: 20000,
  /** A drag order's line is how far the destination drifts in this many seconds. */
  dragSeconds: 4,
  /** A drawn drift is measured against what carries things at the spot, not the ship's motion. */
  dragAbsolute: false,
  /** A drag from the destination nudges its drift by this share of what the same drag would set. */
  nudgeShare: 0.25,
  gun2ShotsPerSecond: 2,
  preciseChance: 0.25,
  turretTurnSpeed: 150,
  turretRange: 0.3333,
  tractorRange: 175,
  /** How wide the tractor beam's catching cone is ahead of the nose, in degrees. 360 catches all round. */
  tractorCone: 30,
  tractorPull: 120,
  tractorSpeed: 100,

  /** A clamp grabs a rock whose edge is this close to the ship's edge (see `docs/clamp-tow-plan.md`). */
  clampRange: 40,
  /** ...and only when it's this slow against the ship. Faster than that, the clamp is refused. */
  clampSpeed: 30,
  /** How much of a towed rock's mass adds to the ship's weight: all of it, unless this is turned down. */
  towMassScale: 1,
  /** The share of a bump's damage a towed rock takes: what hurts it as it would a ship. */
  towDamageScale: 1,
  /** What a whole rock is worth in ore, over what mining it would give: the refinery gets all of it. */
  wholeRockBonus: 2,
  /** How near a station its catch picks up a rock let go of, and how hard it pulls it in, at most. */
  catchRange: 900,
  catchPull: 15,
  /** Seconds the refinery takes over each ore of a whole rock. */
  refineSeconds: 4,
  /** How near a project's site its catch picks up a block let go of, and how hard it pulls it in. */
  siteRange: 300,
  /** Parts A in one construction block: what a project is carried in. */
  blockParts: 10,
  /** Blocks that may wait at a station's block pad at once. */
  blocksWaiting: 2,
  /** The chance a floater that has bought everything else turns tow ship, once a stay. */
  towShipChance: 0.25,
  /** The most of a base's traffic that may be tow ships, as a share. */
  towShipShare: 0.2,

  /** How far from the ship a target stays picked. Past it, it drops and doesn't come back on its own. */
  targetRange: 1500,
  /** Seconds of relative drift a relative line shows: a long line is fast, none is matched. */
  relativeSeconds: 2,
  /** How far ahead the will-collide test looks, in seconds. */
  collideSeconds: 10,

  trafficRacers: 1,
  trafficFloaters: 1,
  showTraffic: false,
  trafficFlees: true,
  /** Traffic far from the camera runs as trip records instead of flown ships. */
  trafficRecords: true,
  /** Ore a minute a racer, then a floater, mines in a field while it's a record: measured from flown ones. */
  recordOreRacer: 4.6,
  recordOreFloater: 2.6,
  /** Pirates and defenders far from the camera with nothing to fight run as trip records too. */
  fighterRecords: true,
  /** Ore a minute a pirate mines in its field while it's a record. */
  recordOrePirate: 4.6,

  /**
   * Fuel: every thruster that fires burns it, on every ship and on the hauler. Off, nothing
   * burns anywhere and the game is the game it was before fuel (see docs/fuel-plan.md).
   */
  fuel: false,
  /** Fuel one thruster burns in a second at full output, so one half open burns half of it. */
  fuelPerThrust: 0.1,
  /**
   * What a ship out of view burns for each 1000 units of its trip: the flown burn per 1000 the
   * same hull made, measured in the step-1 census. A record costs what a flown ship would.
   */
  recordFuelRacer: 0.21,
  recordFuelFloater: 0.26,
  recordFuelPirate: 0.32,
  recordFuelDefender: 0.12,
  /** What a unit of fuel costs at a dock. Step 3 makes it the station's own price. */
  fuelPrice: 5,
  /**
   * A ship heads home when its fuel is under this many trips home: the route planner's path
   * home, at its hull's burn for each 1000 units of it. Near 1 it's cutting it fine.
   */
  fuelReturn: 1.5,
  /**
   * What a damaged fuel tank leaks in a second, as a share of what it holds full: 0.01 empties a
   * tank in a little over a minute and a half. The ship keeps what its other tanks hold.
   */
  fuelLeak: 0.01,
  /**
   * The chance each second that a pirate, then a defender, keeping watch as a record starts
   * on a ship in its field it would go after. Then both are flown, and the fight is real.
   * Measured from flown ones (`npm run census`): attacks begun per second spent calm in
   * their field with such a ship there.
   */
  recordSpotPirate: 0.00026,
  recordSpotDefender: 0.0004,
  chatter: true,
  haulers: true,
  /** The shop only sells what the station has bought a blueprint for. */
  stationUnlocks: false,
  /** A body shows on the chart once the ship has been this many of its radii from it,
   * or inside its air, whichever reaches further. */
  bodySight: 4,
  /** Credits the station holds back before spending on blueprints. */
  stationCashBuffer: 300,
  trafficBuffer: 400,
  /** Where traffic starts: this share of the field's radius past its middle, away from the player's start. */
  trafficStartShare: 0.4,
  /** The chance that traffic leaving the station with money makes a buying run instead of mining. */
  tradeChance: 0.5,
  /**
   * Seconds traffic sits at a full station with ore it can't sell before it decides what to do
   * instead: wait, a deposit, more mining, or the next station over. Long enough not to flicker
   * on a store that's emptying anyway.
   */
  turnAwaySeconds: 5,
  /** Seconds news of what's sold where is trusted, from when it was seen. */
  newsLife: 7200,
  /** After pirates kill a ship, how many seconds before it will buy from them again. */
  pirateGrudgeSeconds: 900,
  /** Hits from one ship before traffic runs home to report it, and how many seconds each hit takes to be forgotten. */
  trafficPatience: 3,
  /** The chance that traffic leaving the station heads for another field at random, however far. */
  fieldWanderChance: 0.02,
  /** Up to this many seconds of trip each field is let off by luck, so a field nearly as near gets picked too. */
  fieldLuckSeconds: 60,
  /** Seconds of trip a ship will take on to go back to the field it worked last. */
  fieldHabitSeconds: 60,
  /** A field holding less than this share of its rocks counts as empty. */
  fieldEmptyShare: 0.3,
  /** After pirates kill a ship, the chance on each trip that it keeps away from that field, and for how many seconds. */
  fieldFearChance: 0.5,
  fieldFearSeconds: 1800,
  grudgeFadeSeconds: 60,
  /** A victim this close to a defender reports to it there and then, instead of flying home. */
  witnessRange: 800,
  /** Traffic leaves ore it didn't break loose alone within this distance of the player: the size of the dock area. */
  trafficOreGap: 150,
  droneBuffer: 500,
  /** Puts a deposit in the world without paying for it, for testing. */
  depositFree: false,
  /** How far outside the edge of its POI a deposit sits. */
  depositGap: 300,
  /** How close a ship has to be to trade with a deposit. */
  depositReach: 150,
  depositCapacity: 300,
  /** Credits a deposit pays per ore dropped, and asks per ore bought. */
  depositPays: 3,
  depositSells: 7,
  /** The share of full loads traffic drops at a deposit for no reason but saving the trip. */
  depositDropChance: 0.25,
  /** Credits to fund a deposit, and the station's parts it's then built from. */
  depositPrice: 3000,
  depositParts: 150,
  /** Parts per second going into construction. */
  depositBuildRate: 0.5,
  /** How far from what they stand on the turrets reach. Pirates treat this as their edge. */
  guardRange: 1200,
  guardShotsPerSecond: 1,
  /** Radians per second. */
  guardTurn: 3,
  stationGuardCount: 4,
  /** The station's turrets float in an arc facing the field: how wide, and how far out. */
  stationGuardArc: 60,
  stationGuardDistance: 450,
  depositGuardCount: 2,
  stationGuardPrice: 3500,
  stationGuardParts: 120,
  depositGuardPrice: 2000,
  depositGuardParts: 60,
  guardsStationFree: false,
  guardsDepositFree: false,
  haulerFirst: 300,
  haulerInterval: 600,
  /** What a hauler pays a station for an ore, over the item's own price. */
  haulerMarkup: 1.5,
  haulerLoadRate: 8,
  /** Room a hauler has for items, in volume (an item's volume starts as the area of its shape). 480,
   * four times what it was: a station's whole stock of parts A still comes in on one visit, and the
   * ore going out fills the hold in the same minute as before. */
  haulerVolume: 480,
  /** A base asks for a part while it holds fewer of it than this. */
  itemTarget: 4,
  chatterRange: 1500,

  pirates: 1,
  defenders: 1,
  visionRange: 1500,
  visionAngle: 45,
  sightLines: true,
  detectSeconds: 1,
  shotDamage: 4,
  /** Hits wear the module on the nearest mount, as well as the hull. */
  moduleDamage: true,
  /** Hull points of hits a module takes before it's destroyed. Half that and it stops working. */
  moduleToughness: 30,
  /** How much tougher a ship's core is: main and turning thrusters, and the computer. */
  coreToughness: 2.5,
  /** Seconds a ship is out of control after its hull gives out, before it explodes. */
  criticalSeconds: 2.5,
  /** After a wreck, the pod flies to a shipyard and you pick a bare hull or a rebuild. Off: a bare hull, at once. */
  askHull: true,
  /** How fast the player's escape pod flies itself to a shipyard. */
  podSpeed: 1500,
  /** How long a full rebuild takes, and how much longer for each part beyond the bare hull. */
  rebuildSeconds: 20,
  rebuildSecondsPerPart: 4,
  pirateStartOre: 40,
  pirateLimit: 2,
  /** The pirate base's starting money, and what it keeps back for rebuilds before buying anything. */
  pirateStartCredits: 800,
  pirateReserve: 300,
  /** Once every pirate is fully fitted, the base buys new hulls from the black market, up to this many pirates. */
  pirateCapMax: 4,
  pirateHullPrice: 1000,
  /** Range for buying ore at the pirate base. */
  pirateBaseReach: 400,
  /** The black market: when it first calls, how often, what it pays per ore and how much it takes. */
  blackMarketFirst: 450,
  blackMarketInterval: 600,
  /** What the black market pays for an ore, as a share of the item's own price. */
  blackMarketShare: 0.5,
  blackMarketCapacity: 300,
  /** A hurt pirate that can pay for repairs breaks off and goes home, even mid-fight. */
  pirateRetreats: true,
  stationStartCredits: 300,
  stationStartOre: 40,
  stationStartParts: 40,
  /** The station buys parts A from haulers up to this many: every service it sells uses them. */
  stationPartsTarget: 100,
  /** Credits of service one part A pays for. */
  serviceCreditsPerPart: 20,
  stationReserveParts: 20,
  defenderPrice: 500,

  testDrones: 0,
  dronePrice: 500,
  droneLimit: 5,
  droneParts: 5,
  /** How full its bay an AI ship waits for before delivering. */
  deliverShare: 1,
  droneCruiseSpeed: 350,
  droneFieldSpeed: 100,

  zoom: 0.8,
  lookahead: 0,
};

export type Tuning = typeof DEFAULTS;

/**
 * The values that differ from the defaults: all a browser or a save keeps of the tuning, so a
 * default changed later reaches it, rather than the old one staying frozen in its copy.
 */
export function changedTuning(tuning: Tuning): Partial<Tuning> {
  const changed: Partial<Tuning> = {};
  for (const key of Object.keys(DEFAULTS) as (keyof Tuning)[]) {
    if (tuning[key] !== DEFAULTS[key]) Object.assign(changed, { [key]: tuning[key] });
  }
  return changed;
}

/** Puts kept changes into a tuning: only keys it knows, and JSON's null back to infinity. */
export function applyTuning(into: Tuning, changed: Record<string, unknown>): Tuning {
  for (const key of Object.keys(DEFAULTS) as (keyof Tuning)[]) {
    if (!(key in changed)) continue;
    const value = changed[key] === null ? Infinity : changed[key];
    if (typeof value === typeof DEFAULTS[key]) Object.assign(into, { [key]: value });
  }
  return into;
}

/** Which control a thruster answers to: the same roles the mounts carry. */
export type ThrusterId = import("./parts").ThrusterRole;
export type TuningKey = {
  [K in keyof Tuning]: Tuning[K] extends number ? K : never;
}[keyof Tuning];

export type SwitchKey = {
  [K in keyof Tuning]: Tuning[K] extends boolean ? K : never;
}[keyof Tuning];

export interface Slider {
  key: TuningKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** One step past the maximum means no limit at all. */
  infinite?: boolean;
}

export interface Group {
  title: string;
  sliders: Slider[];
  switches?: { key: SwitchKey; label: string }[];
}

export const GROUPS: Group[] = [
  {
    title: "Thrusters",
    sliders: [
      { key: "weight", label: "Weight", min: 0.25, max: 5, step: 0.05 },
      { key: "thrust", label: "Main thrust", min: 100, max: 1500, step: 10 },
      { key: "reverseThrust", label: "Reverse thrust", min: 0, max: 1000, step: 10 },
      { key: "sideThrust", label: "Side thrust", min: 0, max: 1000, step: 10 },
      { key: "rotationThrust", label: "Rotation thrust", min: 30, max: 1500, step: 10 },
      { key: "throttleRamp", label: "Shift throttle: seconds from off to full", min: 0.2, max: 6, step: 0.1 },
    ],
  },
  {
    title: "Shooting",
    sliders: [
      { key: "shotSpeed", label: "Shot speed", min: 300, max: 3000, step: 25 },
      { key: "shotsPerSecond", label: "Shots per second", min: 1, max: 20, step: 0.5 },
      { key: "shotLife", label: "Shot life (s)", min: 0.2, max: 3, step: 0.05 },
      { key: "rockToughness", label: "Rock toughness", min: 1, max: 20, step: 1 },
      { key: "oreChance", label: "Ore chance", min: 0, max: 1, step: 0.05 },
      { key: "rockBreakSpeed", label: "Broken pieces drift apart at", min: 0, max: 60, step: 1 },
      { key: "rockStraySpeed", label: "A rock leaving its field faster than this flies off", min: 0, max: 200, step: 5 },
      { key: "rockStraySeconds", label: "A rock knocked out of its field is gone after (s)", min: 1, max: 300, step: 1 },
      { key: "flingChance", label: "Gun 1: chance break ore flies off", min: 0, max: 1, step: 0.05 },
      { key: "flingOreAmount", label: "Gun 1: ore a flung piece is worth", min: 1, max: 10, step: 1 },
    ],
  },
  // The field's, station's and pirate base's own numbers live in the system designer (O).
  {
    title: "POI carrying",
    sliders: [],
    switches: [{ key: "showPoiZones", label: "Show POI zones (each place's carrying is set in the designer)" }],
  },
  {
    title: "Loose ore",
    sliders: [
      {
        key: "oreForgetDistance",
        label: "Gone when this far from every POI and ship",
        min: 1000,
        max: 20000,
        step: 500,
        infinite: true,
      },
    ],
  },
  {
    title: "Station",
    sliders: [
      { key: "dockDrag", label: "Dock slowdown", min: 0, max: 3, step: 0.05 },
    ],
  },
  {
    title: "Repairs",
    sliders: [
      { key: "repairCost", label: "Credits per hull point", min: 0, max: 20, step: 1 },
      { key: "repairSpeed", label: "Hull points per second", min: 1, max: 100, step: 1 },
      { key: "rebuildCost", label: "Credits to rebuild a wreck", min: 0, max: 2000, step: 50 },
    ],
  },
  {
    title: "Impacts",
    sliders: [
      { key: "safeImpactSpeed", label: "Safe impact speed", min: 0, max: 400, step: 5 },
      { key: "damagePerSpeed", label: "Damage per speed", min: 0, max: 0.6, step: 0.01 },
      { key: "bounce", label: "Bounce", min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    title: "Parts",
    sliders: [
      { key: "partPriceScale", label: "Part A a module is made from: share of its price", min: 0, max: 5, step: 0.1 },
      { key: "partWeightScale", label: "Weight scale", min: 0, max: 5, step: 0.1 },
    ],
  },
  {
    title: "New ship",
    sliders: [
      { key: "floaterEngine", label: "Engine power, all thrusters", min: 0.05, max: 1, step: 0.05 },
      { key: "clickSpeed", label: "Click to move speed", min: 20, max: 400, step: 10 },
      { key: "autopilotSpeed", label: "Autopilot top speed", min: 1000, max: 60000, step: 500 },
      { key: "dragSeconds", label: "Drag order: seconds of drift the line shows", min: 1, max: 15, step: 0.5 },
      { key: "nudgeShare", label: "Nudge from the destination: share of a full drag", min: 0.05, max: 1, step: 0.05 },
      { key: "gun2ShotsPerSecond", label: "Gun 2 shots per second", min: 0.5, max: 7, step: 0.5 },
      { key: "preciseChance", label: "Gun 2 chance a hit frees ore", min: 0, max: 1, step: 0.05 },
      { key: "turretTurnSpeed", label: "Turret turn speed (degrees per second)", min: 30, max: 720, step: 10 },
      { key: "turretRange", label: "Turret share of the gun's range", min: 0.1, max: 1, step: 0.05 },
      { key: "tractorRange", label: "Tractor range", min: 50, max: 1500, step: 25 },
      { key: "tractorCone", label: "Tractor cone (degrees)", min: 5, max: 360, step: 5 },
      { key: "tractorPull", label: "Tractor pull strength", min: 10, max: 600, step: 10 },
      { key: "tractorSpeed", label: "Tractor ore speed", min: 10, max: 400, step: 10 },
      { key: "clampRange", label: "Clamp reach past the ship (40)", min: 0, max: 400, step: 5 },
      { key: "clampSpeed", label: "Clamp: fastest the rock may drift", min: 5, max: 200, step: 5 },
      { key: "towMassScale", label: "Towed rock's mass, as a share of its own", min: 0, max: 3, step: 0.1 },
      { key: "towDamageScale", label: "Towed rock's damage share", min: 0, max: 3, step: 0.1 },
      { key: "wholeRockBonus", label: "Whole rock ore, over mining it", min: 1, max: 5, step: 0.25 },
      { key: "catchRange", label: "Station catch range", min: 100, max: 3000, step: 50 },
      { key: "catchPull", label: "Catch pull strength", min: 1, max: 200, step: 1 },
      { key: "refineSeconds", label: "Refinery: seconds an ore", min: 0.5, max: 30, step: 0.5 },
    ],
    switches: [
      { key: "floaterStart", label: "Start in the new ship (on restart)" },
      { key: "dragAbsolute", label: "Drag drift is against the POI, not your motion" },
    ],
  },
  {
    title: "Targeting",
    sliders: [
      { key: "targetRange", label: "Lock range", min: 200, max: 6000, step: 50 },
      { key: "relativeSeconds", label: "Relative line: seconds of drift it shows", min: 0.5, max: 10, step: 0.5 },
      { key: "collideSeconds", label: "Will-collide looks this many seconds ahead", min: 1, max: 60, step: 1 },
    ],
  },
  {
    title: "Traffic",
    sliders: [
      { key: "trafficRacers", label: "First ships (on restart)", min: 0, max: 10, step: 1 },
      { key: "trafficFloaters", label: "New ships (on restart)", min: 0, max: 10, step: 1 },
      { key: "chatterRange", label: "Radio range", min: 300, max: 5000, step: 100 },
      { key: "recordOreRacer", label: "Ore a minute a racer mines out of view", min: 0, max: 20, step: 0.1 },
      { key: "recordOreFloater", label: "Ore a minute a floater mines out of view", min: 0, max: 20, step: 0.1 },
      { key: "recordOrePirate", label: "Ore a minute a pirate mines out of view", min: 0, max: 20, step: 0.1 },
      { key: "recordSpotPirate", label: "Chance a second a pirate out of view starts on a ship", min: 0, max: 0.01, step: 0.00002 },
      { key: "recordSpotDefender", label: "Chance a second a defender out of view starts on a ship", min: 0, max: 0.01, step: 0.00002 },
      { key: "bodySight", label: "Bodies show on the chart from this many radii", min: 1, max: 20, step: 0.5 },
    ],
    switches: [
      { key: "showTraffic", label: "Show traffic readouts and arrows" },
      { key: "trafficFlees", label: "Traffic flees from pirates" },
      { key: "trafficRecords", label: "Traffic out of view runs as trip records" },
      { key: "fighterRecords", label: "Pirates and defenders out of view run as trip records" },
      { key: "sightLines", label: "Rocks block sight" },
      { key: "chatter", label: "Radio chatter" },
      { key: "haulers", label: "Haulers buy station ore" },
      { key: "stationUnlocks", label: "Shop needs blueprints the station pays for" },
    ],
  },
  {
    title: "Fuel",
    sliders: [
      { key: "fuelPerThrust", label: "Fuel a second of full thrust burns", min: 0.01, max: 2, step: 0.01 },
      { key: "fuelPrice", label: "Credits a unit of fuel costs at a dock", min: 0, max: 60, step: 1 },
      { key: "fuelReturn", label: "Go home when fuel is under: times the trip home", min: 0.5, max: 4, step: 0.1 },
      { key: "fuelLeak", label: "A damaged tank leaks a second, of what it holds", min: 0, max: 0.1, step: 0.002 },
      { key: "recordFuelRacer", label: "A racer record burns this much per 1000 flown", min: 0, max: 5, step: 0.01 },
      { key: "recordFuelFloater", label: "A floater record burns this much per 1000 flown", min: 0, max: 5, step: 0.01 },
      { key: "recordFuelPirate", label: "A pirate record burns this much per 1000 flown", min: 0, max: 5, step: 0.01 },
      { key: "recordFuelDefender", label: "A defender record burns this much per 1000 flown", min: 0, max: 5, step: 0.01 },
    ],
    switches: [{ key: "fuel", label: "Fuel: thrusters burn it (the fuel experiment)" }],
  },
  {
    title: "Pirate and defender",
    sliders: [
      { key: "pirates", label: "Pirates (on restart)", min: 0, max: 5, step: 1 },
      { key: "defenders", label: "Defenders (on restart)", min: 0, max: 5, step: 1 },
      { key: "visionRange", label: "Vision range", min: 300, max: 5000, step: 100 },
      { key: "visionAngle", label: "Vision cone (degrees)", min: 10, max: 360, step: 5 },
      { key: "detectSeconds", label: "Seconds in the cone before being spotted", min: 0, max: 5, step: 0.25 },
      { key: "shotDamage", label: "Damage per shot to a ship", min: 0, max: 50, step: 1 },
      { key: "moduleToughness", label: "Hits a part takes before it's destroyed (hull points)", min: 5, max: 200, step: 5 },
      { key: "coreToughness", label: "How much tougher the core parts are", min: 1, max: 10, step: 0.5 },
      { key: "pirateStartOre", label: "Pirate base starting ore (on restart)", min: 0, max: 500, step: 5 },
      { key: "pirateLimit", label: "Pirates the base starts out fielding", min: 0, max: 10, step: 1 },
      { key: "pirateCapMax", label: "Most pirates it can grow to", min: 0, max: 10, step: 1 },
      { key: "pirateStartCredits", label: "Pirate base starting credits (on restart)", min: 0, max: 5000, step: 50 },
      { key: "pirateReserve", label: "Credits the pirate base keeps for rebuilds", min: 0, max: 2000, step: 50 },
      { key: "pirateHullPrice", label: "Black market price of a new pirate hull", min: 0, max: 5000, step: 50 },
      { key: "pirateBaseReach", label: "Range for buying ore at the pirate base", min: 200, max: 1000, step: 25 },
      { key: "blackMarketFirst", label: "Seconds until the black market first calls", min: 0, max: 3000, step: 30 },
      { key: "blackMarketInterval", label: "Seconds between black market calls (0: never)", min: 0, max: 3000, step: 30 },
      { key: "blackMarketShare", label: "Black market pays: share of the ore's price", min: 0, max: 1, step: 0.05 },
      { key: "blackMarketCapacity", label: "Black market hold", min: 0, max: 1000, step: 10 },
      { key: "stationStartCredits", label: "Station starting balance (on restart)", min: 0, max: 5000, step: 100 },
      { key: "stationStartOre", label: "Station starting ore (on restart)", min: 0, max: 500, step: 10 },
      { key: "stationStartParts", label: "Station starting part A (on restart)", min: 0, max: 500, step: 10 },
      { key: "stationPartsTarget", label: "Part A the station buys up to", min: 0, max: 1000, step: 10 },
      { key: "serviceCreditsPerPart", label: "Credits of service per part used", min: 1, max: 100, step: 1 },
      { key: "stationReserveParts", label: "Parts the station keeps for repairs", min: 0, max: 200, step: 5 },
      { key: "defenderPrice", label: "Credits of parts in a new defender", min: 0, max: 5000, step: 50 },
    ],
    switches: [{ key: "pirateRetreats", label: "Hurt pirates retreat to repair" }],
  },
  {
    title: "Turrets",
    sliders: [
      { key: "guardRange", label: "Reach, from each turret", min: 300, max: 4000, step: 50 },
      { key: "guardShotsPerSecond", label: "Shots per second, each", min: 0, max: 7, step: 0.1 },
      { key: "guardTurn", label: "Turning speed", min: 0.5, max: 12, step: 0.5 },
      { key: "stationGuardCount", label: "Turrets at the station (when built)", min: 1, max: 8, step: 1 },
      { key: "stationGuardArc", label: "Width of the station's arc (degrees)", min: 0, max: 360, step: 5 },
      { key: "stationGuardDistance", label: "Distance from the station", min: 200, max: 2000, step: 50 },
      { key: "depositGuardCount", label: "Turrets at the deposit (when built)", min: 1, max: 8, step: 1 },
      { key: "stationGuardPrice", label: "Credits to fund the station's", min: 0, max: 20000, step: 100 },
      { key: "stationGuardParts", label: "Parts to build the station's", min: 1, max: 1000, step: 10 },
      { key: "depositGuardPrice", label: "Credits to fund the deposit's", min: 0, max: 20000, step: 100 },
      { key: "depositGuardParts", label: "Parts to build the deposit's", min: 1, max: 1000, step: 10 },
    ],
    switches: [
      { key: "guardsStationFree", label: "Station turrets for free (testing)" },
      { key: "guardsDepositFree", label: "Deposit turrets for free, once it has a deposit (testing)" },
    ],
  },
  {
    title: "Field deposit",
    sliders: [
      { key: "depositGap", label: "Distance outside the field", min: -2000, max: 3000, step: 50 },
      { key: "depositReach", label: "Reach for trading", min: 50, max: 500, step: 10 },
      { key: "depositCapacity", label: "Ore it holds", min: 10, max: 2000, step: 10 },
      { key: "depositPays", label: "Credits it pays per ore", min: 0, max: 50, step: 1 },
      { key: "depositSells", label: "Credits it asks per ore", min: 0, max: 50, step: 1 },
      { key: "depositDropChance", label: "Share of full loads traffic drops", min: 0, max: 1, step: 0.05 },
      { key: "depositPrice", label: "Credits to fund one", min: 0, max: 20000, step: 100 },
      { key: "depositParts", label: "Parts to build one", min: 1, max: 1000, step: 10 },
      { key: "depositBuildRate", label: "Parts per second while building (every project)", min: 0.1, max: 10, step: 0.1 },
    ],
    switches: [{ key: "depositFree", label: "Deposit built for free (testing)" }],
  },
  {
    title: "Haulers",
    sliders: [
      { key: "haulerFirst", label: "First arrival (s, on restart)", min: 0, max: 3600, step: 30 },
      { key: "haulerInterval", label: "Time between visits (s)", min: 60, max: 3600, step: 30 },
      { key: "haulerMarkup", label: "What a hauler pays: times the ore's price", min: 0, max: 5, step: 0.05 },
      { key: "haulerLoadRate", label: "Ore and parts moved per second", min: 0.5, max: 40, step: 0.5 },
      { key: "haulerVolume", label: "Room a hauler has for items (volume)", min: 0, max: 2000, step: 10 },
      { key: "itemTarget", label: "Parts a base holds before it stops asking", min: 0, max: 50, step: 1 },
      { key: "stationCashBuffer", label: "Credits the station holds back from blueprints", min: 0, max: 5000, step: 50 },
      { key: "trafficBuffer", label: "Credits traffic keeps before buying parts", min: 0, max: 3000, step: 50 },
      { key: "tradeChance", label: "Chance traffic leaves the station to buy a load", min: 0, max: 1, step: 0.05 },
      { key: "turnAwaySeconds", label: "Seconds traffic waits at a full store before choosing", min: 0, max: 120, step: 1 },
      { key: "newsLife", label: "Seconds news of what's sold where is trusted", min: 600, max: 36000, step: 600 },
      { key: "pirateGrudgeSeconds", label: "Seconds traffic won't buy from pirates after they kill it", min: 0, max: 3600, step: 60 },
      { key: "trafficPatience", label: "Hits from one ship before traffic reports it", min: 1, max: 10, step: 1 },
      { key: "fieldWanderChance", label: "Chance traffic heads for any other field", min: 0, max: 1, step: 0.01 },
      { key: "fieldLuckSeconds", label: "Seconds of trip traffic shrugs off by luck", min: 0, max: 1200, step: 10 },
      { key: "fieldHabitSeconds", label: "Seconds of trip traffic takes on to go back to its last field", min: 0, max: 1200, step: 10 },
      { key: "fieldEmptyShare", label: "Field counts as empty below this share of its rocks", min: 0, max: 1, step: 0.05 },
      { key: "fieldFearChance", label: "Chance traffic avoids the field pirates killed it in", min: 0, max: 1, step: 0.05 },
      { key: "fieldFearSeconds", label: "Seconds traffic remembers where pirates killed it", min: 0, max: 7200, step: 60 },
      { key: "grudgeFadeSeconds", label: "Seconds for each hit to be forgotten", min: 5, max: 600, step: 5 },
      { key: "witnessRange", label: "Distance at which a victim reports to a defender in person", min: 0, max: 3000, step: 50 },
      { key: "trafficOreGap", label: "Traffic leaves others' ore this close to you alone", min: 0, max: 1000, step: 25 },
      { key: "droneBuffer", label: "Credits your drones leave you before buying parts", min: 0, max: 5000, step: 50 },
    ],
  },
  {
    title: "Drones",
    sliders: [
      { key: "droneParts", label: "Parts a test drone may buy", min: 0, max: 5, step: 1 },
      { key: "testDrones", label: "Test drones, self-funded (on restart)", min: 0, max: 5, step: 1 },
      { key: "dronePrice", label: "Price of a new drone", min: 0, max: 5000, step: 50 },
      { key: "droneLimit", label: "Most drones allowed", min: 0, max: 10, step: 1 },
      { key: "deliverShare", label: "Delivers when this full", min: 0.1, max: 1, step: 0.05 },
      { key: "droneCruiseSpeed", label: "Cruise speed", min: 100, max: 1000, step: 10 },
      { key: "droneFieldSpeed", label: "Speed in the field", min: 30, max: 300, step: 5 },
    ],
  },
  {
    title: "Towing and blocks",
    sliders: [
      { key: "siteRange", label: "Site catch range", min: 100, max: 1500, step: 25 },
      { key: "blockParts", label: "Parts A in a construction block", min: 1, max: 50, step: 1 },
      { key: "blocksWaiting", label: "Blocks that may wait at a pad", min: 1, max: 6, step: 1 },
      { key: "towShipChance", label: "Chance a floater turns tow ship, a stay", min: 0, max: 1, step: 0.05 },
      { key: "towShipShare", label: "Most of a base's traffic that tows, as a share", min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    title: "View",
    sliders: [
      { key: "zoom", label: "Zoom", min: 0.35, max: 2, step: 0.05 },
      { key: "lookahead", label: "Look-ahead (s)", min: 0, max: 1, step: 0.05 },
    ],
  },
];
