/**
 * A plain home: one field going round the middle of the world, with the game's station and
 * pirate base round it. The title demo and the tests play in it. A game plays the designer's
 * layout instead; this is the same kind of thing made in code, as specs, so the game runs the
 * one path either way and nothing about this home is special once it's in.
 */
import { Sim, type FieldSpec } from "./sim";
import { DEFAULTS, type Tuning } from "./tuning";

/** The home field's id. The designer's fields go by their own ids. */
export const FIRST_FIELD = "first";

/** What the home is like. Angles in radians, times in seconds. */
export interface Home {
  fieldRadius: number;
  rockCount: number;
  /** How fast the rocks drift at the start, and big ones drifting in per minute. */
  rockDrift: number;
  rockInflow: number;
  /** Carries fully within the first of its edge, fading out by the second. Infinity: everywhere. */
  fieldCarryFull: number;
  fieldCarryNone: number;
  /** Its orbit round the middle of the world. */
  fieldOrbitRadius: number;
  fieldOrbitPeriod: number;
  /** Where it is on that orbit at clock 0. */
  fieldPhase: number;
  fieldEccentricity: number;
  fieldPeriapsis: number;
  fieldRotationPeriod: number;
  /** Its turn at clock 0. */
  fieldSpinPhase: number;
}

export const HOME: Home = {
  fieldRadius: 5200,
  rockCount: 520,
  rockDrift: 12,
  rockInflow: 1,
  fieldCarryFull: 2000,
  fieldCarryNone: 8000,
  fieldOrbitRadius: 20000,
  fieldOrbitPeriod: 3600,
  fieldPhase: 0,
  fieldEccentricity: 0,
  fieldPeriapsis: 0,
  fieldRotationPeriod: 1800,
  fieldSpinPhase: 0,
};

/** The home's field as the game takes any field. */
export function homeField(home: Home = HOME): FieldSpec {
  const orbit = {
    radius: home.fieldOrbitRadius,
    period: home.fieldOrbitPeriod,
    phase: home.fieldPhase,
    sign: 1 as const,
    eccentricity: home.fieldEccentricity,
    periapsis: home.fieldPeriapsis,
  };
  return {
    id: FIRST_FIELD,
    name: "Field",
    radius: home.fieldRadius,
    rocks: home.rockCount,
    rockDrift: home.rockDrift,
    rockInflow: home.rockInflow,
    carryFull: home.fieldCarryFull,
    carryNone: home.fieldCarryNone,
    rotationPeriod: home.fieldRotationPeriod,
    spinPhase: home.fieldSpinPhase,
    orbits: [orbit],
    rings: [{ center: [], radius: orbit.radius, eccentricity: orbit.eccentricity, periapsis: orbit.periapsis }],
  };
}

/** Each sim's home, for changing it later. */
const homes = new WeakMap<Sim, Home>();

/** What a sim's home is like now. */
export function homeOf(sim: Sim): Home {
  return homes.get(sim) ?? HOME;
}

/**
 * A new world in the home, started from `seed`. `settings` is the tuning, and may change the
 * home too: its keys are named so the tuning's old ones for the first field still read right.
 */
export function homeSim(seed: number, settings: Tuning & Partial<Home> = { ...DEFAULTS }): Sim {
  const keys = Object.keys(HOME) as (keyof Home)[];
  const changes: Partial<Home> = {};
  for (const key of keys) if (key in settings) Object.assign(changes, { [key]: settings[key] });
  let tuning: Tuning = settings;
  if (Object.keys(changes).length > 0) {
    tuning = { ...settings };
    for (const key of keys) delete (tuning as Partial<Home>)[key];
  }
  const sim = new Sim(seed, tuning);
  homes.set(sim, { ...HOME, ...changes });
  sim.applyLayout({}, homeFields(sim));
  sim.reset(seed);
  return sim;
}

/** The home's fields with `more` after them, to hand a sim as its whole set of fields. */
export function homeFields(sim: Sim, ...more: FieldSpec[]): FieldSpec[] {
  return [homeField(homeOf(sim)), ...more];
}

/**
 * Changes a sim's home as the designer changes a layout: the places go where the change puts
 * them, and everything near them comes along. Its other fields stay as they are.
 */
export function rehome(sim: Sim, changes: Partial<Home>): void {
  homes.set(sim, { ...homeOf(sim), ...changes });
  const others = sim.extraFields.filter((extra) => extra.spec.id !== FIRST_FIELD).map((extra) => extra.spec);
  sim.applyLayout({}, homeFields(sim, ...others));
}
