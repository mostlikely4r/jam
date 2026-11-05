export const DEFAULTS = {
  weight: 1,
  thrust: 420,
  reverseThrust: 220,
  sideThrust: 200,
  rotationThrust: 400,

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

  rockCount: 260,
  fieldRadius: 2600,
  rockDrift: 12,
  rockInflow: 1,
  fieldOrbitRadius: 20000,
  fieldOrbitPeriod: 3600,
  fieldRotationPeriod: 1800,

  stationDistance: 5000,
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
  clickFaceTravel: true,
  gun2ShotsPerSecond: 2,
  preciseChance: 0.25,
  preciseOreSpeed: 12,
  tractorRange: 350,
  tractorPull: 120,
  tractorSpeed: 100,

  trafficRacers: 1,
  trafficFloaters: 1,
  showTraffic: false,
  trafficFlees: true,

  pirates: 1,
  defenders: 1,
  visionRange: 1500,
  visionAngle: 45,
  sightLines: true,
  detectSeconds: 1,
  shotDamage: 4,
  pirateStartOre: 40,
  pirateLimit: 1,
  stationStartCredits: 300,
  stationStartOre: 40,
  serviceCreditsPerOre: 20,
  stationReserveOre: 20,
  defenderPrice: 500,

  testDrones: 0,
  dronePrice: 500,
  droneLimit: 5,
  droneParts: 5,
  droneCargo: 10,
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

export interface Slider {
  key: TuningKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const GROUPS: { title: string; sliders: Slider[] }[] = [
  {
    title: "Thrusters",
    sliders: [
      { key: "weight", label: "Weight", min: 0.25, max: 5, step: 0.05 },
      { key: "thrust", label: "Main thrust", min: 100, max: 1500, step: 10 },
      { key: "reverseThrust", label: "Reverse thrust", min: 0, max: 1000, step: 10 },
      { key: "sideThrust", label: "Side thrust", min: 0, max: 1000, step: 10 },
      { key: "rotationThrust", label: "Rotation thrust", min: 30, max: 1500, step: 10 },
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
    title: "Station",
    sliders: [
      { key: "stationDistance", label: "Distance (on restart)", min: 1000, max: 15000, step: 100 },
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
      { key: "gun2ShotsPerSecond", label: "Gun 2 shots per second", min: 0.5, max: 7, step: 0.5 },
      { key: "preciseChance", label: "Gun 2 precision hit chance", min: 0, max: 1, step: 0.05 },
      { key: "preciseOreSpeed", label: "Precision ore speed", min: 0, max: 60, step: 1 },
      { key: "tractorRange", label: "Tractor range", min: 50, max: 1500, step: 25 },
      { key: "tractorPull", label: "Tractor pull strength", min: 10, max: 600, step: 10 },
      { key: "tractorSpeed", label: "Tractor ore speed", min: 10, max: 400, step: 10 },
    ],
  },
  {
    title: "Traffic",
    sliders: [
      { key: "trafficRacers", label: "First ships (on restart)", min: 0, max: 10, step: 1 },
      { key: "trafficFloaters", label: "New ships (on restart)", min: 0, max: 10, step: 1 },
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
      { key: "pirateLimit", label: "Most pirates the base builds up to", min: 0, max: 10, step: 1 },
      { key: "stationStartCredits", label: "Station starting balance (on restart)", min: 0, max: 5000, step: 100 },
      { key: "stationStartOre", label: "Station starting ore (on restart)", min: 0, max: 500, step: 10 },
      { key: "serviceCreditsPerOre", label: "Credits of service per ore used", min: 1, max: 100, step: 1 },
      { key: "stationReserveOre", label: "Ore the station keeps for repairs", min: 0, max: 200, step: 5 },
      { key: "defenderPrice", label: "Credits of ore in a new defender", min: 0, max: 5000, step: 50 },
    ],
  },
  {
    title: "Drones",
    sliders: [
      { key: "droneParts", label: "Parts a test drone may buy", min: 0, max: 5, step: 1 },
      { key: "testDrones", label: "Test drones, self-funded (on restart)", min: 0, max: 5, step: 1 },
      { key: "dronePrice", label: "Price of a new drone", min: 0, max: 5000, step: 50 },
      { key: "droneLimit", label: "Most drones allowed", min: 0, max: 10, step: 1 },
      { key: "droneCargo", label: "Ore per trip", min: 1, max: 50, step: 1 },
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
