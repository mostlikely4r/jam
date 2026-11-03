export const DEFAULTS = {
  thrust: 420,
  reverseThrust: 220,
  turnRate: 200,
  turnAccel: 1400,

  shotSpeed: 1100,
  shotsPerSecond: 7,
  shotLife: 1.1,
  rockToughness: 6,
  oreChance: 0.45,

  rockCount: 260,
  fieldRadius: 2600,
  rockDrift: 12,

  safeImpactSpeed: 90,
  damagePerSpeed: 0.12,
  bounce: 0.45,

  zoom: 0.8,
  lookahead: 0,
};

export type Tuning = typeof DEFAULTS;
export type TuningKey = keyof Tuning;

export interface Slider {
  key: TuningKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const GROUPS: { title: string; sliders: Slider[] }[] = [
  {
    title: "Flight",
    sliders: [
      { key: "thrust", label: "Forward thrust", min: 100, max: 1500, step: 10 },
      { key: "reverseThrust", label: "Reverse thrust", min: 0, max: 1000, step: 10 },
      { key: "turnRate", label: "Turn rate (deg/s)", min: 60, max: 600, step: 5 },
      { key: "turnAccel", label: "Turn response", min: 200, max: 6000, step: 50 },
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
