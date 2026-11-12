/**
 * What happens to each part of the world out of view, decided once, out loud.
 *
 * Out of view, ships are trip records and fields sleep (see `Sim.recordTraffic`,
 * `Sim.recordFighters`, `Sim.sleepAndWake`). Anything that only runs on flown ships or
 * awake rocks simply doesn't happen there, unless something stands in for it. This list
 * says, for every part of the step and every kind of pilot, which it is.
 *
 * `farside.test.ts` fails when the step calls something, or the pilot file has a pilot
 * class, that isn't in here. That's the point: a new system can't be added without
 * someone deciding what it does out of view. Saying "in view only" is a fine answer, as
 * long as the `far` line says what stands in for it, or why nothing needs to. Then the
 * parity run (`npm run parity`) checks whether the stand-in is any good.
 */
export type FarSide =
  /** Runs the same wherever the camera is: it's cheap, and nothing in it is flown. */
  | { out: "everywhere"; note: string }
  /** Only touches flown ships or awake rocks. `far` says what stands in for it out of view. */
  | { out: "in view only"; far: string }
  /** The machinery that runs things out of view. */
  | { out: "records"; note: string };

/** Every call `Sim.step` makes, by name. */
export const STEP_PARTS: Record<string, FarSide> = {
  discover: { out: "everywhere", note: "What the player's ship has come near: the player is always flown." },
  "clickPilot.update": { out: "everywhere", note: "The player's own autopilot." },
  recordFighters: { out: "records", note: "Pirates and defenders out of view: trips, watches, and dice for when a fight starts." },
  recordTraffic: { out: "records", note: "Traffic out of view: trips, mining by the clock, dock visits run by its own pilot." },
  "pilot.update": {
    out: "in view only",
    far: "Records call the same decisions at each stop (dock visits, choosing a field, buying), so they don't drift apart.",
  },
  movePois: { out: "everywhere", note: "Orbits: by the clock anyway." },
  moveDeposits: { out: "everywhere", note: "A few deposits." },
  moveGuards: { out: "everywhere", note: "Turrets ride their station or deposit." },
  sleepAndWake: { out: "records", note: "Fields far from the camera and every flown ship sleep, and wake with regrowth." },
  carryBodies: { out: "in view only", far: "Sleeping fields keep their rocks in the field's own frame, so they turn with it on waking." },
  driftInRocks: { out: "in view only", far: "A sleeping field gets the rocks that would have drifted in all at once on waking (`wakeField`)." },
  moveRocks: { out: "in view only", far: "Sleeping rocks don't move; a shot gap stays where it was." },
  pullOre: { out: "in view only", far: "Records mine by the clock: `recordOre*` rates, measured from flown ships." },
  pullTowardBodies: { out: "in view only", far: "Records fly the route planner's path, which keeps out of every body's pull." },
  moveOres: { out: "in view only", far: "Loose ore out of view just lies there until someone flown comes by." },
  moveShip: { out: "in view only", far: "Records are placed along their route by the clock (`placeRecord`)." },
  touchBodies: { out: "in view only", far: "Record routes never touch a body." },
  burnOreOnBodies: { out: "in view only", far: "Only loose ore burns, and loose ore out of view doesn't move." },
  moveShots: { out: "in view only", far: "Fights out of view are flown: the dice only say when one starts. Stray shots between traffic aren't modelled yet." },
  fireShots: { out: "in view only", far: "As for shots." },
  collectOre: { out: "in view only", far: "Records collect at the end of a mining stay, all at once (`takeOre`)." },
  unloadOre: { out: "in view only", far: "Records unload during their dock or home visit, run all at once." },
  repairHull: { out: "in view only", far: "As for unloading." },
  fireGuards: { out: "in view only", far: "Turrets only fire at flown pirates; a pirate record keeps its watch out of turret range only by luck." },
  spendStationParts: { out: "everywhere", note: "Base economy." },
  buyBlueprints: { out: "everywhere", note: "Base economy." },
  buildProjects: { out: "everywhere", note: "Base economy." },
  spendPirateCredits: { out: "everywhere", note: "Pirate base economy." },
  moveHauler: { out: "everywhere", note: "One hauler per base, flown always: few enough not to matter yet." },
  moveBlackMarket: { out: "everywhere", note: "One ship, flown always." },
  "chatter.update": { out: "everywhere", note: "Radio: it only speaks of what's near the player." },
};

/** Every pilot class in pilot.ts. */
export const PILOTS: Record<string, FarSide> = {
  ClickPilot: { out: "everywhere", note: "The player's own ship: always flown, it's where the camera is." },
  DronePilot: {
    out: "records",
    note: "Traffic becomes a record out of view. The player's drones stay flown: they work near the player.",
  },
  FighterPilot: { out: "records", note: "Pirates and defenders become records out of view." },
};

/** Calls in the step that aren't world systems at all. */
export const NOT_PARTS = new Set(["profile.begin", "bodies.map"]);
