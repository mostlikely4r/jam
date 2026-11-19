/**
 * A plain home: one field going round the middle of the world, with a station and the pirate
 * base round it. The title demo and the tests play in it. A game plays the designer's
 * layout instead; this is the same kind of thing made in code, as specs, so the game runs the
 * one path either way and nothing about this home is special once it's in.
 */
import { Sim, type FieldSpec, type PirateBaseSpec, type StationSpec } from "./sim";
import { DEFAULTS, type Tuning } from "./tuning";

/** The home field's and station's ids. The designer's go by their own ids. */
export const FIRST_FIELD = "first";
export const FIRST_BASE = "station";

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
  /** The station's orbit round the field: how far beyond the field's edge, its period, and where it is at clock 0. */
  stationDistance: number;
  orbitPeriod: number;
  stationPhase: number;
  stationEccentricity: number;
  stationPeriapsis: number;
  stationRotationPeriod: number;
  stationSpinPhase: number;
  stationCarryFull: number;
  stationCarryNone: number;
  /** The pirate base's orbit round the field: how far beyond the field's edge, its period, and where it is at clock 0. */
  pirateBaseDistance: number;
  pirateOrbitPeriod: number;
  piratePhase: number;
  pirateEccentricity: number;
  piratePeriapsis: number;
  pirateRotationPeriod: number;
  pirateSpinPhase: number;
  pirateCarryFull: number;
  pirateCarryNone: number;
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
  stationDistance: 5000,
  orbitPeriod: 900,
  // Behind the ship's starting point, on the far side of the field from the rocks it starts by.
  stationPhase: Math.PI,
  stationEccentricity: 0,
  stationPeriapsis: 0,
  stationRotationPeriod: 300,
  stationSpinPhase: 0,
  stationCarryFull: 2000,
  stationCarryNone: 6000,
  // On the far side of the field from the station, at the same pace, so it stays there.
  pirateBaseDistance: 4000,
  pirateOrbitPeriod: 900,
  piratePhase: 0,
  pirateEccentricity: 0,
  piratePeriapsis: 0,
  pirateRotationPeriod: 0,
  pirateSpinPhase: 0,
  pirateCarryFull: 2000,
  pirateCarryNone: 6000,
};

/** The field's orbit round the middle of the world. */
function fieldOrbit(home: Home) {
  return {
    radius: home.fieldOrbitRadius,
    period: home.fieldOrbitPeriod,
    phase: home.fieldPhase,
    sign: 1 as const,
    eccentricity: home.fieldEccentricity,
    periapsis: home.fieldPeriapsis,
  };
}

/** The home's field as the game takes any field. */
export function homeField(home: Home = HOME): FieldSpec {
  const orbit = fieldOrbit(home);
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

/**
 * The home's station as the game takes any station: by the field, building projects and on
 * the radio. Its shipyard, storage and turrets are the tuning's defaults for a station.
 */
export function homeStation(home: Home = HOME): StationSpec {
  const field = fieldOrbit(home);
  const own = {
    radius: home.fieldRadius + home.stationDistance,
    period: home.orbitPeriod,
    phase: home.stationPhase,
    sign: 1 as const,
    eccentricity: home.stationEccentricity,
    periapsis: home.stationPeriapsis,
  };
  return {
    id: FIRST_BASE,
    name: "Station",
    rotationPeriod: home.stationRotationPeriod,
    spinPhase: home.stationSpinPhase,
    orbits: [field, own],
    rings: [{ center: [field], radius: own.radius, eccentricity: own.eccentricity, periapsis: own.periapsis }],
    carryFull: home.stationCarryFull,
    carryNone: home.stationCarryNone,
    blueprints: [],
    field: FIRST_FIELD,
    projects: true,
    radio: true,
  };
}

/** The home's pirate base, round the field. A world only has it while the tuning has pirates. */
export function homePirateBase(home: Home = HOME): PirateBaseSpec {
  const field = fieldOrbit(home);
  const own = {
    radius: home.fieldRadius + home.pirateBaseDistance,
    period: home.pirateOrbitPeriod,
    phase: home.piratePhase,
    sign: 1 as const,
    eccentricity: home.pirateEccentricity,
    periapsis: home.piratePeriapsis,
  };
  return {
    name: "Pirate base",
    rotationPeriod: home.pirateRotationPeriod,
    spinPhase: home.pirateSpinPhase,
    orbits: [field, own],
    rings: [{ center: [field], radius: own.radius, eccentricity: own.eccentricity, periapsis: own.periapsis }],
    carryFull: home.pirateCarryFull,
    carryNone: home.pirateCarryNone,
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
  sim.applyLayout(homeFields(sim), homeStations(sim), homePirateBase(homeOf(sim)));
  sim.reset(seed);
  return sim;
}

/** The home's fields with `more` after them, to hand a sim as its whole set of fields. */
export function homeFields(sim: Sim, ...more: FieldSpec[]): FieldSpec[] {
  return [homeField(homeOf(sim)), ...more];
}

/** The home's station with `more` after it, to hand a sim as its whole set of stations. */
export function homeStations(sim: Sim, ...more: StationSpec[]): StationSpec[] {
  return [homeStation(homeOf(sim)), ...more];
}

/**
 * Changes a sim's home as the designer changes a layout: the places go where the change puts
 * them, and everything near them comes along. Its other fields and stations stay as they are.
 */
export function rehome(sim: Sim, changes: Partial<Home>): void {
  homes.set(sim, { ...homeOf(sim), ...changes });
  const fields = sim.extraFields.filter((extra) => extra.spec.id !== FIRST_FIELD).map((extra) => extra.spec);
  const stations = sim.bases.filter((base) => base.id !== FIRST_BASE).map((base) => base.spec);
  sim.applyLayout(homeFields(sim, ...fields), homeStations(sim, ...stations), homePirateBase(homeOf(sim)));
}
