import { afterEach, describe, expect, it } from "vitest";
import { DEFAULTS } from "./tuning";
import { roundTrip } from "./save";
import { type FieldSpec, MAX_HULL, type Poi, type Ship, Sim, type StationSpec, TICK } from "./sim";

// Long runs never give the worker a turn of the event loop otherwise (see pilot.test.ts).
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const WORLD = {
  ...DEFAULTS,
  floaterStart: false,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  haulers: false,
  stationUnlocks: false,
  tradeChance: 0,
  rockCount: 40,
  fieldOrbitRadius: 60000,
  fieldOrbitPeriod: 10800,
  repairCost: 1,
  stationStartParts: 1000,
  stationReserveParts: 0,
};

const FAR = 2.4;

/** A second field far round the first one's orbit, and a second base just past it. */
function world(tuning: Partial<typeof WORLD> = {}, outpost: Partial<StationSpec> = {}): { sim: Sim; outpost: Poi } {
  const sim = new Sim(1, { ...WORLD, ...tuning });
  const home = Math.atan2(sim.field.y, sim.field.x) - (2 * Math.PI * sim.now) / 10800;
  const orbit = (apart: number) => [{ radius: 60000, period: 10800, phase: home + apart, sign: 1 as const }];
  const second: FieldSpec = {
    id: "second:0",
    name: "Second",
    radius: 3000,
    rocks: 40,
    rockDrift: 0,
    rockInflow: 0,
    carryFull: 2000,
    carryNone: 8000,
    rotationPeriod: 0,
    orbits: orbit(FAR),
  };
  const spec: StationSpec = {
    id: "outpost:0",
    name: "Outpost",
    rotationPeriod: 300,
    orbits: orbit(FAR + 0.12),
    carryFull: 2000,
    carryNone: 6000,
    shipyard: true,
    ...outpost,
  };
  sim.applyLayout({}, [second], [spec]);
  return { sim, outpost: sim.bases[1].poi };
}

function dockAt(sim: Sim, ship: Ship, station: Poi): void {
  const dock = sim.dockPoint(false, station);
  ship.x = ship.px = dock.x;
  ship.y = ship.py = dock.y;
  ship.vx = ship.vy = 0;
}

function run(sim: Sim, seconds: number, each?: () => boolean | void): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) {
    sim.step();
    sim.events.length = 0;
    if (each?.()) return;
  }
}

describe("a second base", () => {
  it("is where the designer put it, and turns", () => {
    const { sim, outpost } = world();
    const turned = outpost.rotation;
    run(sim, 5);
    expect(sim.docks).toEqual([sim.station, outpost]);
    expect(outpost.rotation).not.toBe(turned);
    expect(Math.hypot(outpost.x - sim.extraFields[0].poi.x, outpost.y - sim.extraFields[0].poi.y)).toBeLessThan(8000);
  });

  it("buys ore and repairs out of its own money and store, not the first base's", () => {
    const { sim, outpost } = world();
    const { ship } = sim;
    const [first, second] = sim.bases;
    dockAt(sim, ship, outpost);
    ship.ore = 5;
    ship.hull = 50;
    const before = { ore: first.ore, parts: first.parts, credits: first.account.credits };
    const secondOre = second.ore;
    const secondParts = second.parts;
    run(sim, 20);
    expect(sim.dockedAt(ship)).toBe(outpost);
    expect(ship.ore).toBe(0);
    expect(ship.earned).toBe(5 * DEFAULTS.creditsPerOre);
    expect(second.ore).toBe(secondOre + 5);
    expect(ship.hull).toBeGreaterThan(50);
    expect(second.parts).toBeLessThan(secondParts);
    expect({ ore: first.ore, parts: first.parts, credits: first.account.credits }).toEqual(before);
  });

  it("has a shop of its own, which sells from its own parts", () => {
    const { sim, outpost } = world();
    const { ship } = sim;
    const [first, second] = sim.bases;
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    expect(sim.atShop(ship)).toBe(true);
    expect(sim.baseAt(ship)).toBe(second);
    const firstParts = first.parts;
    expect(sim.buyPart(ship, "strafe")).toBe(true);
    expect(second.parts).toBeLessThan(sim.tuning.stationStartParts);
    expect(first.parts).toBe(firstParts);
    // Out of parts there means out of parts there, whatever the first base holds.
    second.parts = 0;
    expect(sim.buyPart(ship, "reverse")).toBe(false);
    dockAt(sim, ship, sim.station);
    expect(sim.buyPart(ship, "reverse")).toBe(true);
  });

  it("charges a rebuild to the base that does it", () => {
    const { sim, outpost } = world({ rebuildCost: 300 });
    const { ship } = sim;
    const [first, second] = sim.bases;
    ship.x = outpost.x + 3000;
    ship.y = outpost.y;
    const firstCredits = first.account.credits;
    const secondCredits = second.account.credits;
    (sim as unknown as { wreckShip(ship: Ship): void }).wreckShip(ship);
    expect(sim.dockedAt(ship)).toBe(outpost);
    expect(second.account.credits).toBe(secondCredits + 300);
    expect(first.account.credits).toBe(firstCredits);
  });

  it("sends and pays its own hauler", () => {
    const { sim } = world({ haulers: true, haulerFirst: 5, stationStartCredits: 0 });
    const [first, second] = sim.bases;
    second.ore = 30;
    first.ore = 0;
    let berthed = false;
    run(sim, 400, () => (berthed = second.hauler?.stage === "loading"));
    expect(berthed).toBe(true);
    run(sim, 60);
    expect(second.ore).toBeLessThan(30);
    expect(second.account.credits).toBeGreaterThan(0);
    // Its hauler berthed at its own station, not the first's.
    const berth = sim.haulerBerth(false, second);
    expect(Math.hypot(berth.x - second.poi.x, berth.y - second.poi.y)).toBeLessThan(1000);
  }, 60000);

  it("keeps what it holds through a save, and a save from before keeps it as new", () => {
    const { sim } = world();
    sim.bases[1].ore = 77;
    sim.bases[1].account.credits = 4321;
    sim.bases[0].ore = 11;
    const { sim: into } = world();
    roundTrip(sim, into);
    expect(into.bases[1].ore).toBe(77);
    expect(into.bases[1].account.credits).toBe(4321);
    expect(into.bases[0].ore).toBe(11);
    expect(into.bases[0].poi).toBe(into.station);
  });

  it("starts the designer's bases out as starter bases on a new game", () => {
    const { sim } = world();
    sim.bases[1].ore = 77;
    sim.reset(5);
    expect(sim.bases.length).toBe(2);
    expect(sim.bases[1].ore).toBe(sim.tuning.stationStartOre);
    expect(sim.bases[0].poi).toBe(sim.station);
  });

  it("rebuilds a wreck when it's the nearest with a shipyard, and otherwise the station does", () => {
    const wreck = (shipyard: boolean) => {
      const { sim, outpost } = world({}, { shipyard });
      const { ship } = sim;
      ship.x = outpost.x + 3000;
      ship.y = outpost.y;
      (sim as unknown as { wreckShip(ship: Ship): void }).wreckShip(ship);
      return { sim, outpost, at: sim.dockedAt(ship) };
    };
    const yard = wreck(true);
    expect(yard.at).toBe(yard.outpost);
    expect(yard.sim.ship.hull).toBe(MAX_HULL);
    const none = wreck(false);
    expect(none.at).toBe(none.sim.station);
  });

  it("is what the pointers point at from near it, with the field next to it", () => {
    const { sim, outpost } = world();
    expect(sim.nearestDock(outpost.x + 1000, outpost.y)).toBe(outpost);
    expect(sim.miningFieldAt(outpost.x, outpost.y).id).toBe("second:0");
    expect(sim.nearestDock(sim.station.x, sim.station.y)).toBe(sim.station);
  });

  it("is where traffic near it sells its load", () => {
    const { sim, outpost } = world({ trafficRacers: 1 });
    const { ship } = sim.traffic[0];
    ship.x = ship.px = outpost.x + 1500;
    ship.y = ship.py = outpost.y + 1500;
    ship.vx = ship.vy = 0;
    ship.ore = sim.cargoSpace(ship);
    let soldThere = false;
    run(sim, 120, () => (soldThere = sim.dockedAt(ship) === outpost && ship.ore === 0));
    expect(soldThere).toBe(true);
  }, 60000);

  it("takes ships docked in it along when the designer moves it, and goes when it's taken away", () => {
    const { sim, outpost } = world();
    const { ship } = sim;
    dockAt(sim, ship, outpost);
    sim.step();
    const spec = sim.bases[1].spec!;
    const moved: StationSpec = { ...spec, orbits: [{ ...spec.orbits[0], phase: spec.orbits[0].phase + 0.05 }] };
    sim.applyLayout({}, undefined, [moved]);
    expect(sim.dockedAt(ship)).toBe(outpost);
    sim.applyLayout({}, undefined, []);
    expect(sim.docks).toEqual([sim.station]);
  });
});
