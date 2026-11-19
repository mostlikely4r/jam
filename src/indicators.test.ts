import { afterEach, describe, expect, it } from "vitest";
import { homeFields, homeSim } from "./home";
import { DEFAULTS } from "./tuning";
import { bodyAt, type Base, type FieldSpec, type Ship, Sim, TICK, type Target } from "./sim";

// Long runs never give the worker a turn of the event loop otherwise (see pilot.test.ts).
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** A world with nothing else going on: no rocks, no traffic, no pirates, and nothing to buy. */
const ALONE = {
  ...DEFAULTS,
  floaterStart: false,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  haulers: false,
  chatter: false,
  repairCost: 0,
  rebuildCost: 0,
  stationStartParts: 100000,
  stationReserveParts: Infinity,
  stationUnlocks: false,
};

function run(sim: Sim, seconds: number): void {
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i++) sim.step();
}

/** A small world with everything an indicator can point at: a field, its station, a deposit and a planet. */
function indicatorSim(): Sim {
  const sim = homeSim(1, {
    ...ALONE,
    rockCount: 0,
    fieldOrbitRadius: 0,
    fieldOrbitPeriod: 0,
    fieldRadius: 500,
    fieldRotationPeriod: 0,
    stationDistance: 500,
    stationRotationPeriod: 0,
    depositFree: true,
  });
  sim.bodies.push({
    name: "Test planet",
    kind: "planet",
    radius: 400,
    surface: "none",
    pullStart: 0,
    pullFull: 0,
    pullAccel: 0,
    atmosphere: 0,
    burnSpeed: 0,
    spinPeriod: 0,
    orbits: [{ radius: 8000, period: 600, phase: 0, sign: 1 }],
  });
  // Past the field's edge and the station's, so both are off screen and worth an arrow.
  sim.ship.x = sim.ship.px = 0;
  sim.ship.y = sim.ship.py = 1200;
  // A tick, so the station builds the deposit a base with projects always builds.
  sim.step();
  return sim;
}

describe("the two indicators", () => {
  /** The labels of the arrows showing, in the order they're drawn. */
  const showing = (sim: Sim): string[] => sim.pointers(400, 300).map((each) => each.label);

  it("starts on the tutorial pair: the nearest field and the nearest station", () => {
    const sim = indicatorSim();
    expect(sim.pointersManual).toBe(false);
    expect(sim.pointers(400, 300).map((each) => [each.slot, each.label])).toEqual([
      ["destination", "field"],
      ["home", "home"],
    ]);
  });

  it("loses the tutorial pair with the first manual set, both slots at once", () => {
    const sim = indicatorSim();
    sim.toggleHome(sim.bases[0].id);
    expect(sim.pointersManual).toBe(true);
    // The field the tutorial pair pointed at is gone, and home is the base it was told to be.
    expect(showing(sim)).toEqual(["home"]);
    expect(sim.pointers(400, 300)[0].slot).toBe("home");
  });

  it("toggles each slot on its own, and a cleared slot has no arrow", () => {
    const sim = indicatorSim();
    const base = sim.bases[0];
    sim.toggleDestination({ poi: sim.field });
    expect(sim.ship.destination?.poi).toBe(sim.field);
    sim.toggleHome(base.id);
    expect(sim.ship.home).toBe(base.id);
    expect(showing(sim)).toEqual(["field", "home"]);
    // Pressing again clears it, and it stays cleared.
    sim.toggleDestination({ poi: sim.field });
    expect(sim.ship.destination).toBeNull();
    sim.toggleHome(base.id);
    expect(sim.ship.home).toBeNull();
    // A cleared home is still manual: the nearest station doesn't come back.
    expect(showing(sim)).toEqual([]);
  });

  it("only draws one arrow when both slots are on the same place", () => {
    const sim = indicatorSim();
    const base = sim.bases[0];
    sim.toggleHome(base.id);
    sim.setDestination({ poi: base.poi });
    expect(sim.pointers(400, 300).map((each) => each.slot)).toEqual(["destination"]);
    expect(showing(sim)).toEqual(["station"]);
  });

  it("follows a handle round its orbit, and leaves a point where it was put", () => {
    const sim = indicatorSim();
    const deposit = sim.deposits[0];
    sim.setDestination({ deposit });
    const was = { x: deposit.x, y: deposit.y };
    run(sim, 5);
    // The station it stands by has gone round, and the deposit with it.
    expect(Math.hypot(deposit.x - was.x, deposit.y - was.y)).toBeGreaterThan(1);
    expect(sim.readTarget({ deposit }, 0, 0)!.dx).toBeCloseTo(deposit.x - sim.ship.x, 6);
    // A point is a pair of numbers: nothing moves it.
    sim.setDestination({ point: { x: 9000, y: 0 } });
    run(sim, 5);
    expect(sim.ship.destination?.point).toEqual({ x: 9000, y: 0 });
    expect(sim.readTarget(sim.ship.destination!, 0, 0)!.dx).toBeCloseTo(9000 - sim.ship.x, 6);
  });

  it("empties a slot whose place is gone, rather than falling back to the nearest", () => {
    const sim = indicatorSim();
    sim.setDestination({ deposit: sim.deposits[0] });
    sim.toggleHome(sim.bases[0].id);
    sim.deposits = [];
    expect(sim.pointers(400, 300).map((each) => each.slot)).toEqual(["home"]);
  });

  it("hides an arrow once what it points at is on screen, whatever kind it is", () => {
    const sim = indicatorSim();
    const body = sim.bodies[0];
    const goTo = (x: number, y: number) => {
      sim.ship.x = sim.ship.px = x;
      sim.ship.y = sim.ship.py = y;
    };
    const labels = (target: Target): string[] => {
      sim.setDestination(target);
      return showing(sim);
    };
    const at = bodyAt(body, sim.now);
    goTo(at.x, at.y);
    expect(labels({ body })).toEqual([]);
    goTo(sim.deposits[0].x, sim.deposits[0].y);
    expect(labels({ deposit: sim.deposits[0] })).toEqual([]);
    goTo(sim.field.x, sim.field.y);
    expect(labels({ poi: sim.field })).toEqual([]);
    goTo(sim.station.x, sim.station.y);
    expect(labels({ poi: sim.station })).toEqual([]);
    goTo(9000, 0);
    expect(labels({ point: { x: 9000, y: 0 } })).toEqual([]);
    // Out of sight again, the same thing gets its arrow back.
    goTo(-50000, -50000);
    expect(showing(sim)).toEqual(["space"]);
  });

  it("lets a manual arrow reach further than the tutorial pair's two screens", () => {
    const sim = indicatorSim();
    // Far past the field and the station: the tutorial pair gives up at two screens.
    sim.ship.x = sim.ship.px = 0;
    sim.ship.y = sim.ship.py = -40000;
    expect(sim.pointers(400, 300)).toEqual([]);
    // A destination has no such limit: a long trip is when the arrow is wanted.
    sim.setDestination({ point: { x: 0, y: -60000 } });
    expect(showing(sim)).toEqual(["space"]);
  });
});

describe("ore news", () => {
  /** A field whose rocks drop the ore an item is, for the news to name. */
  const ORE_FIELD: FieldSpec = {
    id: "ore:0",
    name: "Ore field",
    radius: 800,
    rocks: 0,
    rockDrift: 0,
    rockInflow: 0,
    carryFull: Infinity,
    carryNone: Infinity,
    rotationPeriod: 0,
    orbits: [{ radius: 4000, period: 0, phase: 0, sign: 1 }],
    drops: [{ item: "oreB", chance: 0.5 }],
  };

  /** The indicator world with one traffic ship, and a field that drops ore. */
  function oreSim(): Sim {
    const sim = homeSim(1, {
      ...ALONE,
      rockCount: 0,
      trafficRacers: 1,
      fieldOrbitRadius: 0,
      fieldOrbitPeriod: 0,
      fieldRadius: 500,
      fieldRotationPeriod: 0,
      stationDistance: 500,
      stationRotationPeriod: 0,
      depositFree: true,
    });
    sim.applyLayout(homeFields(sim, ORE_FIELD));
    sim.step();
    return sim;
  }

  /** A traffic ship sells a load of ore mined in the ore field, into the depot by the station. */
  function sale(sim: Sim): { base: Base; ship: Ship } {
    const pilot = sim.traffic[0];
    const deposit = sim.deposits[0];
    pilot.ship.ore = 5;
    pilot.ship.oreField = ORE_FIELD.id;
    pilot.ship.x = pilot.ship.px = deposit.x;
    pilot.ship.y = pilot.ship.py = deposit.y;
    sim.sellToDeposit(pilot.ship, deposit);
    return { base: sim.bases[0], ship: pilot.ship };
  }

  it("puts up the field a sale's ore came from, and not a player's own mining", () => {
    const sim = oreSim();
    const { base, ship } = sale(sim);
    expect(base.board.map((report) => [report.item, report.field])).toEqual([["oreB", ORE_FIELD.id]]);
    // The same ore from the same field is one line however often it comes in.
    sale(sim);
    expect(base.board.filter((report) => report.field === ORE_FIELD.id)).toHaveLength(1);
    // The player's own ore isn't news to anyone.
    const player = sim.ship;
    const deposit = sim.deposits[0];
    player.ore = 5;
    player.oreField = ORE_FIELD.id;
    player.x = player.px = deposit.x;
    player.y = player.py = deposit.y;
    sim.sellToDeposit(player, deposit);
    expect(base.board).toHaveLength(1);
    expect(ship.oreField).toBe(ORE_FIELD.id);
  });

  it("stays on the board it was sold at, and out of the ships that carry the rest", () => {
    const sim = oreSim();
    const { base, ship } = sale(sim);
    // The seller docks: the board and the ship swap what they know.
    const dock = sim.dockPoint(false, sim.station);
    ship.x = ship.px = dock.x;
    ship.y = ship.py = dock.y;
    ship.newsFrom = null;
    ship.ore = 0;
    sim.step();
    expect(base.board.some((report) => report.field === ORE_FIELD.id)).toBe(true);
    expect(ship.news.some((report) => report.field)).toBe(false);
  });

  it("ages out with the price news", () => {
    const sim = oreSim();
    const { base } = sale(sim);
    sim.tuning.newsLife = 5;
    // Nothing docks, so the board keeps it: the same as any news a board holds.
    run(sim, 6);
    expect(base.board.some((report) => report.field === ORE_FIELD.id)).toBe(true);
    // A ship docks, and what's too old to trust goes from both.
    const dock = sim.dockPoint(false, sim.station);
    sim.ship.x = sim.ship.px = dock.x;
    sim.ship.y = sim.ship.py = dock.y;
    sim.ship.newsFrom = null;
    sim.step();
    expect(base.board.some((report) => report.field === ORE_FIELD.id)).toBe(false);
  });
});
