export const DEFAULTS = {
  weight: 1,
  thrust: 420,
  reverseThrust: 220,
  sideThrust: 200,
  rotationThrust: 400,
  /** With Shift held, how many seconds a thruster key takes to ramp from off to full. */
  throttleRamp: 1.5,

  retro: false,
  thrusterMain: true,
  thrusterReverse: true,
  thrusterStrafeLeft: true,
  thrusterStrafeRight: true,
  thrusterRotateLeft: true,
  thrusterRotateRight: true,

  shotSpeed: 1100,
  shotsPerSecond: 7,
  shotLife: 1.1,
  rockToughness: 6,
  oreChance: 0.45,
  /** How fast broken pieces drift apart. Zero keeps them moving with the rock. */
  rockBreakSpeed: 0,
  /** Gun 1 only: the chance each piece of ore from a break flies off, and what it's worth. */
  flingChance: 0.3,
  flingOreAmount: 3,

  rockCount: 520,
  fieldRadius: 5200,
  /**
   * Within this distance of a POI's edge, the nearest POI carries things fully. Beyond
   * it, its pull falls off linearly to nothing at the second distance. Infinity is the
   * old way: the nearest POI carries everything, everywhere.
   */
  poiFullRange: Infinity,
  poiNoneRange: Infinity,
  showPoiZones: false,
  /** Loose ore this far from every POI's edge and every ship is gone for good. */
  oreForgetDistance: 6000,
  rockDrift: 12,
  rockInflow: 1,
  fieldOrbitRadius: 20000,
  fieldOrbitPeriod: 3600,
  fieldRotationPeriod: 1800,

  stationDistance: 5000,
  /** How far beyond the field's edge the pirate base sits, on the far side from the station. */
  pirateBaseDistance: 4000,
  orbitPeriod: 900,
  stationRotationPeriod: 300,
  dockDrag: 0.25,
  creditsPerOre: 10,

  repairCost: 2,
  repairSpeed: 25,
  rebuildCost: 300,

  safeImpactSpeed: 90,
  damagePerSpeed: 0.12,
  bounce: 0.45,

  partPriceScale: 1,
  partWeightScale: 1,

  floaterStart: true,
  floaterEngine: 0.2,
  clickSpeed: 80,
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
  tractorRange: 350,
  tractorPull: 120,
  tractorSpeed: 100,

  trafficRacers: 1,
  trafficFloaters: 1,
  showTraffic: false,
  trafficFlees: true,
  chatter: true,
  haulers: true,
  /** The shop only sells what the station has bought a blueprint for. */
  stationUnlocks: false,
  /** A blueprint's price, as a share of what the part sells for. */
  blueprintScale: 0.75,
  /** Credits the station holds back before spending on blueprints. */
  stationCashBuffer: 300,
  trafficBuffer: 400,
  /** Where traffic starts: this share of the field's radius past its middle, away from the player's start. */
  trafficStartShare: 0.4,
  /** The chance that traffic leaving the station with money makes a buying run instead of mining. */
  tradeChance: 0.5,
  /** After pirates kill a ship, how many seconds before it will buy from them again. */
  pirateGrudgeSeconds: 900,
  /** Hits from one ship before traffic runs home to report it, and how many seconds each hit takes to be forgotten. */
  trafficPatience: 3,
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
  haulerCapacity: 200,
  haulerPrice: 15,
  /** Parts a hauler arrives with, and what the station pays for each. */
  haulerPartsLoad: 100,
  haulerPartPrice: 16,
  haulerLoadRate: 2,
  chatterRange: 1500,

  pirates: 1,
  defenders: 1,
  visionRange: 1500,
  visionAngle: 45,
  sightLines: true,
  detectSeconds: 1,
  shotDamage: 4,
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
  blackMarketPays: 5,
  blackMarketCapacity: 300,
  /** A hurt pirate that can pay for repairs breaks off and goes home, even mid-fight. */
  pirateRetreats: true,
  stationStartCredits: 300,
  stationStartOre: 40,
  stationStartParts: 40,
  /** The station buys parts from haulers up to this many. */
  stationPartsTarget: 100,
  serviceCreditsPerPart: 20,
  stationReserveParts: 20,
  defenderPrice: 500,

  testDrones: 0,
  dronePrice: 500,
  droneLimit: 5,
  droneParts: 5,
  /** The cargo space AI ships start with, and yours. */
  droneCargo: 10,
  playerCargo: 30,
  /** How full its bay an AI ship waits for before delivering. */
  deliverShare: 1,
  droneCruiseSpeed: 350,
  droneFieldSpeed: 100,

  zoom: 0.8,
  lookahead: 0,
};

export type Tuning = typeof DEFAULTS;
export type TuningKey = {
  [K in keyof Tuning]: Tuning[K] extends number ? K : never;
}[keyof Tuning];

export type ThrusterId =
  | "thrusterMain"
  | "thrusterReverse"
  | "thrusterStrafeLeft"
  | "thrusterStrafeRight"
  | "thrusterRotateLeft"
  | "thrusterRotateRight";

export const THRUSTERS: { id: ThrusterId; label: string }[] = [
  { id: "thrusterMain", label: "Main (W)" },
  { id: "thrusterReverse", label: "Reverse (S)" },
  { id: "thrusterStrafeLeft", label: "Strafe left (A)" },
  { id: "thrusterStrafeRight", label: "Strafe right (D)" },
  { id: "thrusterRotateLeft", label: "Rotate left (Q)" },
  { id: "thrusterRotateRight", label: "Rotate right (E)" },
];

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
      { key: "flingChance", label: "Gun 1: chance break ore flies off", min: 0, max: 1, step: 0.05 },
      { key: "flingOreAmount", label: "Gun 1: ore a flung piece is worth", min: 1, max: 10, step: 1 },
    ],
  },
  {
    title: "Field",
    sliders: [
      { key: "rockCount", label: "Rocks (on restart)", min: 20, max: 1500, step: 10 },
      { key: "fieldRadius", label: "Radius (on restart)", min: 800, max: 8000, step: 100 },
      { key: "rockDrift", label: "Rock drift (on restart)", min: 0, max: 80, step: 1 },
      { key: "rockInflow", label: "Big rocks drifting in per minute", min: 0, max: 10, step: 0.25 },
      { key: "fieldOrbitRadius", label: "Orbit size (on restart)", min: 0, max: 60000, step: 1000 },
      { key: "fieldOrbitPeriod", label: "Orbit time (s, 0 = off)", min: 0, max: 7200, step: 60 },
      { key: "fieldRotationPeriod", label: "Rotation time (s, 0 = off)", min: 0, max: 3600, step: 30 },
    ],
  },
  {
    title: "POI carrying",
    sliders: [
      { key: "poiFullRange", label: "Fully carried within (from a POI's edge)", min: 0, max: 10000, step: 100, infinite: true },
      { key: "poiNoneRange", label: "Not carried beyond", min: 0, max: 20000, step: 100, infinite: true },
    ],
    switches: [{ key: "showPoiZones", label: "Show POI zones" }],
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
      { key: "stationDistance", label: "Distance (on restart)", min: 1000, max: 15000, step: 100 },
      { key: "pirateBaseDistance", label: "Pirate base distance from the field (on restart)", min: 500, max: 15000, step: 100 },
      { key: "orbitPeriod", label: "Orbit time (s, 0 = off)", min: 0, max: 3600, step: 30 },
      { key: "stationRotationPeriod", label: "Rotation time (s, 0 = off)", min: 0, max: 3600, step: 30 },
      { key: "dockDrag", label: "Dock slowdown", min: 0, max: 3, step: 0.05 },
      { key: "creditsPerOre", label: "Credits per ore", min: 1, max: 100, step: 1 },
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
      { key: "partPriceScale", label: "Price scale", min: 0, max: 5, step: 0.1 },
      { key: "partWeightScale", label: "Weight scale", min: 0, max: 5, step: 0.1 },
    ],
  },
  {
    title: "New ship",
    sliders: [
      { key: "floaterEngine", label: "Engine power, all thrusters", min: 0.05, max: 1, step: 0.05 },
      { key: "clickSpeed", label: "Click to move speed", min: 20, max: 400, step: 10 },
      { key: "dragSeconds", label: "Drag order: seconds of drift the line shows", min: 1, max: 15, step: 0.5 },
      { key: "nudgeShare", label: "Nudge from the destination: share of a full drag", min: 0.05, max: 1, step: 0.05 },
      { key: "gun2ShotsPerSecond", label: "Gun 2 shots per second", min: 0.5, max: 7, step: 0.5 },
      { key: "preciseChance", label: "Gun 2 chance a hit frees ore", min: 0, max: 1, step: 0.05 },
      { key: "turretTurnSpeed", label: "Turret turn speed (degrees per second)", min: 30, max: 720, step: 10 },
      { key: "turretRange", label: "Turret share of the gun's range", min: 0.1, max: 1, step: 0.05 },
      { key: "tractorRange", label: "Tractor range", min: 50, max: 1500, step: 25 },
      { key: "tractorPull", label: "Tractor pull strength", min: 10, max: 600, step: 10 },
      { key: "tractorSpeed", label: "Tractor ore speed", min: 10, max: 400, step: 10 },
    ],
    switches: [
      { key: "floaterStart", label: "Start in the new ship (on restart)" },
      { key: "dragAbsolute", label: "Drag drift is against the POI, not your motion" },
    ],
  },
  {
    title: "Traffic",
    sliders: [
      { key: "trafficRacers", label: "First ships (on restart)", min: 0, max: 10, step: 1 },
      { key: "trafficFloaters", label: "New ships (on restart)", min: 0, max: 10, step: 1 },
      { key: "chatterRange", label: "Radio range", min: 300, max: 5000, step: 100 },
    ],
    switches: [
      { key: "showTraffic", label: "Show traffic readouts and arrows" },
      { key: "trafficFlees", label: "Traffic flees from pirates" },
      { key: "sightLines", label: "Rocks block sight" },
      { key: "chatter", label: "Radio chatter" },
      { key: "haulers", label: "Haulers buy station ore" },
      { key: "stationUnlocks", label: "Shop needs blueprints the station pays for" },
    ],
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
      { key: "pirateStartOre", label: "Pirate base starting ore (on restart)", min: 0, max: 500, step: 5 },
      { key: "pirateLimit", label: "Pirates the base starts out fielding", min: 0, max: 10, step: 1 },
      { key: "pirateCapMax", label: "Most pirates it can grow to", min: 0, max: 10, step: 1 },
      { key: "pirateStartCredits", label: "Pirate base starting credits (on restart)", min: 0, max: 5000, step: 50 },
      { key: "pirateReserve", label: "Credits the pirate base keeps for rebuilds", min: 0, max: 2000, step: 50 },
      { key: "pirateHullPrice", label: "Black market price of a new pirate hull", min: 0, max: 5000, step: 50 },
      { key: "pirateBaseReach", label: "Range for buying ore at the pirate base", min: 200, max: 1000, step: 25 },
      { key: "blackMarketFirst", label: "Seconds until the black market first calls", min: 0, max: 3000, step: 30 },
      { key: "blackMarketInterval", label: "Seconds between black market calls (0: never)", min: 0, max: 3000, step: 30 },
      { key: "blackMarketPays", label: "Black market pays per ore", min: 0, max: 20, step: 1 },
      { key: "blackMarketCapacity", label: "Black market hold", min: 0, max: 1000, step: 10 },
      { key: "stationStartCredits", label: "Station starting balance (on restart)", min: 0, max: 5000, step: 100 },
      { key: "stationStartOre", label: "Station starting ore (on restart)", min: 0, max: 500, step: 10 },
      { key: "stationStartParts", label: "Station starting parts (on restart)", min: 0, max: 500, step: 10 },
      { key: "stationPartsTarget", label: "Parts the station buys up to", min: 0, max: 1000, step: 10 },
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
    title: "Cargo",
    sliders: [{ key: "playerCargo", label: "Your ship's cargo space", min: 5, max: 300, step: 5, infinite: true }],
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
      { key: "haulerCapacity", label: "Ore a hauler carries", min: 10, max: 1000, step: 10 },
      { key: "haulerPrice", label: "Credits a hauler pays per ore", min: 0, max: 100, step: 1 },
      { key: "haulerPartsLoad", label: "Parts a hauler brings", min: 0, max: 1000, step: 10 },
      { key: "haulerPartPrice", label: "Credits the station pays per part", min: 0, max: 100, step: 1 },
      { key: "haulerLoadRate", label: "Ore and parts moved per second", min: 0.5, max: 20, step: 0.5 },
      { key: "blueprintScale", label: "Blueprint price, share of the part's price", min: 0, max: 5, step: 0.05 },
      { key: "stationCashBuffer", label: "Credits the station holds back from blueprints", min: 0, max: 5000, step: 50 },
      { key: "trafficBuffer", label: "Credits traffic keeps before buying parts", min: 0, max: 3000, step: 50 },
      { key: "tradeChance", label: "Chance traffic leaves the station to buy a load", min: 0, max: 1, step: 0.05 },
      { key: "pirateGrudgeSeconds", label: "Seconds traffic won't buy from pirates after they kill it", min: 0, max: 3600, step: 60 },
      { key: "trafficPatience", label: "Hits from one ship before traffic reports it", min: 1, max: 10, step: 1 },
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
      { key: "droneCargo", label: "Cargo space to start with", min: 1, max: 50, step: 1 },
      { key: "deliverShare", label: "Delivers when this full", min: 0.1, max: 1, step: 0.05 },
      { key: "droneCruiseSpeed", label: "Cruise speed", min: 100, max: 1000, step: 10 },
      { key: "droneFieldSpeed", label: "Speed in the field", min: 30, max: 300, step: 5 },
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
