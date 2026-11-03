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

  stationDistance: 5000,
  orbitPeriod: 900,
  dockDrag: 0.25,
  creditsPerOre: 10,

  safeImpactSpeed: 90,
  damagePerSpeed: 0.12,
  bounce: 0.45,

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
    title: "Field (applies on restart)",
    sliders: [
      { key: "rockCount", label: "Rocks", min: 20, max: 1500, step: 10 },
      { key: "fieldRadius", label: "Field radius", min: 800, max: 8000, step: 100 },
      { key: "rockDrift", label: "Rock drift", min: 0, max: 80, step: 1 },
    ],
  },
  {
    title: "Station",
    sliders: [
      { key: "stationDistance", label: "Distance (on restart)", min: 1000, max: 15000, step: 100 },
      { key: "orbitPeriod", label: "Orbit time (s)", min: 60, max: 3600, step: 30 },
      { key: "dockDrag", label: "Dock slowdown", min: 0, max: 3, step: 0.05 },
      { key: "creditsPerOre", label: "Credits per ore", min: 1, max: 100, step: 1 },
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
    title: "View",
    sliders: [
      { key: "zoom", label: "Zoom", min: 0.35, max: 2, step: 0.05 },
      { key: "lookahead", label: "Look-ahead (s)", min: 0, max: 1, step: 0.05 },
    ],
  },
];
