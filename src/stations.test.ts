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
    blueprints: [],
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

describe("a second base's own defence", () => {
  it("has defenders of its own from the start, which guard the field by it", () => {
    const { sim, outpost } = world({ defenders: 1 });
    sim.reset(4);
    const defenders = sim.fighters.filter((pilot) => pilot.ship.faction === "defender").map((pilot) => pilot.ship);
    expect(defenders.map((ship) => ship.home).sort()).toEqual(["outpost:0", "station"]);
    const theirs = defenders.find((ship) => ship.home === "outpost:0")!;
    expect(sim.homeBaseOf(theirs)).toBe(sim.bases[1]);
    expect(sim.accountOf(theirs)).toBe(sim.bases[1].account);
    run(sim, 90);
    const second = sim.extraFields[0].poi;
    expect(Math.hypot(theirs.x - second.x, theirs.y - second.y)).toBeLessThan(9000);
    expect(Math.hypot(theirs.x - outpost.x, theirs.y - outpost.y)).toBeLessThan(15000);
  }, 60000);

  it("replaces its own lost traffic from its own parts, and the first base doesn't", () => {
    const { sim, outpost } = world({ trafficRacers: 1, defenders: 0, defenderPrice: 0, rebuildCost: 100 });
    const [first, second] = sim.bases;
    const { ship } = sim.traffic[0];
    ship.x = outpost.x + 2000;
    ship.y = outpost.y;
    (sim as unknown as { removeShip(ship: Ship): void }).removeShip(ship);
    expect(second.lostTraffic).toEqual(["racer"]);
    expect(first.lostTraffic).toEqual([]);
    const firstParts = first.parts;
    const secondParts = second.parts;
    sim.step();
    expect(sim.traffic.length).toBe(1);
    expect(second.parts).toBeLessThan(secondParts);
    expect(first.parts).toBe(firstParts);
    expect(sim.dockedAt(sim.traffic[0].ship)).toBe(outpost);
  });

  it("keeps its defenders' home and its lost traffic through a save", () => {
    const { sim } = world({ defenders: 1 });
    sim.reset(4);
    sim.bases[1].lostTraffic.push("floater");
    const { sim: into } = world();
    roundTrip(sim, into);
    expect(into.bases[1].lostTraffic).toEqual(["floater"]);
    expect(into.fighters.filter((pilot) => pilot.ship.faction === "defender").map((pilot) => pilot.ship.home).sort()).toEqual(["outpost:0", "station"]);
  });
});

describe("blueprints per base", () => {
  it("sells a held part only where its blueprint is held, even when shops need no blueprints", () => {
    const { sim, outpost } = world({}, { blueprints: ["tractorAll"] });
    const { ship } = sim;
    ship.credits = 100000;
    expect(sim.buyPart(ship, "tractorAll")).toBe(false);
    expect(sim.fundBlueprint(ship, "tractorAll")).toBe(false);
    dockAt(sim, ship, outpost);
    expect(sim.unlocked("tractorAll")).toBe(true);
    expect(sim.buyPart(ship, "tractorAll")).toBe(true);
    expect(ship.parts.has("tractorAll")).toBe(true);
  });

  it("isn't sold anywhere when no base holds it", () => {
    const { sim, outpost } = world();
    const { ship } = sim;
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    expect(sim.buyPart(ship, "tractorAll")).toBe(false);
    dockAt(sim, ship, sim.station);
    expect(sim.buyPart(ship, "tractorAll")).toBe(false);
  });

  it("puts what a ship pays toward a blueprint into the base it's docked at", () => {
    const { sim, outpost } = world({ stationUnlocks: true, stationCashBuffer: 1e9 });
    const { ship } = sim;
    const [first, second] = sim.bases;
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    expect(sim.unlocked("reverse")).toBe(false);
    expect(sim.fundBlueprint(ship, "reverse")).toBe(true);
    expect(second.blueprintsOrdered.has("reverse")).toBe(true);
    expect(first.blueprintsOrdered.has("reverse")).toBe(false);
    // With no haulers, what's ordered arrives straight away, at that base only.
    run(sim, 1);
    expect(sim.unlocked("reverse", second)).toBe(true);
    expect(sim.unlocked("reverse", first)).toBe(false);
  });

  it("only lets the first base order projects", () => {
    const { sim, outpost } = world({ stationUnlocks: true, stationCashBuffer: 1e9 });
    const { ship } = sim;
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    expect(sim.fundBlueprint(ship, "deposit")).toBe(false);
    expect(sim.blueprintQueue(sim.bases[1])).not.toContain("deposit");
    expect(sim.blueprintQueue(sim.bases[0])).toContain("deposit");
  });

  it("keeps each base's blueprints through a save, and an older save's go to the first base", () => {
    const { sim } = world({}, { blueprints: ["tractorAll"] });
    sim.bases[0].blueprints.add("strafe");
    sim.bases[1].blueprintPaid.set("reverse", 40);
    const { sim: into } = world();
    roundTrip(sim, into);
    expect([...into.bases[0].blueprints]).toEqual(["strafe"]);
    expect([...into.bases[1].blueprints]).toEqual(["tractorAll"]);
    expect(into.bases[1].blueprintPaid.get("reverse")).toBe(40);

    const old = sim.snapshot() as Record<string, unknown>;
    const bases = old.bases as Record<string, unknown>[];
    old.bases = bases.map(({ blueprints, blueprintPaid, blueprintsOrdered, ...rest }) => rest);
    old.blueprints = new Set(["retro"]);
    old.blueprintPaid = new Map();
    old.blueprintsOrdered = new Set();
    const { sim: older } = world();
    older.restore(old);
    expect([...older.bases[0].blueprints]).toEqual(["retro"]);
    expect(older.bases[1].blueprints.size).toBe(0);
  });
});

describe("traffic of each base", () => {
  it("starts docked at its own base, working the field by it, for every base but the first", () => {
    const { sim, outpost } = world({ trafficRacers: 1, trafficFloaters: 1 });
    sim.reset(1);
    expect(sim.traffic).toHaveLength(4);
    const theirs = sim.traffic.filter((pilot) => sim.dockedAt(pilot.ship) === outpost);
    expect(theirs.map((pilot) => pilot.ship.model).sort()).toEqual(["floater", "racer"]);
    expect(theirs.every((pilot) => pilot.working === "second:0")).toBe(true);
  });
});

describe("traffic away from its base", () => {
  it("goes back to the field by its own base after selling at another", () => {
    const { sim, outpost } = world({ trafficRacers: 1, fieldWanderChance: 0, trafficRecords: false });
    sim.reset(1);
    const theirs = sim.traffic.find((pilot) => sim.dockedAt(pilot.ship) === outpost)!;
    const ours = sim.traffic.find((pilot) => pilot !== theirs)!;
    expect(theirs.ship.home).toBe(sim.bases[1].id);
    for (const [pilot, at] of [[theirs, sim.station], [ours, outpost]] as const) {
      pilot.working = "nowhere";
      dockAt(sim, pilot.ship, at);
    }
    sim.step();
    expect(theirs.working).toBe("second:0");
    expect(ours.working).toBe("first");
  });
});

describe("the news board", () => {
  const undock = (sim: Sim, ship: Ship) => {
    ship.x = ship.px = sim.station.x + 20000;
    ship.y = ship.py = sim.station.y;
    sim.step();
  };

  it("carries word of a held part from the base that sells it to the next dock, with when it was seen", () => {
    const { sim, outpost } = world({}, { blueprints: ["tractorAll"] });
    const { ship } = sim;
    const [first, second] = sim.bases;
    dockAt(sim, ship, outpost);
    sim.step();
    const seen = sim.now;
    expect(second.board).toEqual([{ base: second.id, item: "tractorAll", price: sim.partPrice("tractorAll"), seen: expect.any(Number) }]);
    expect(ship.news).toHaveLength(1);
    undock(sim, ship);
    expect(first.board).toHaveLength(0);
    dockAt(sim, ship, sim.station);
    sim.step();
    expect(first.board).toHaveLength(1);
    expect(first.board[0].base).toBe(second.id);
    expect(first.board[0].seen).toBeLessThanOrEqual(seen);
  });

  it("swaps once per stay, keeps the newest word, and drops what's too old", () => {
    const { sim } = world({ newsLife: 600 });
    const { ship } = sim;
    const [first, second] = sim.bases;
    first.board = [{ base: second.id, item: "tractorAll", price: 600, seen: sim.now - 100 }];
    ship.news = [{ base: second.id, item: "tractorAll", price: 500, seen: sim.now - 10 }];
    dockAt(sim, ship, sim.station);
    sim.step();
    expect(first.board.map((report) => report.price)).toEqual([500]);
    // While it stays, a new word on the board isn't picked up again.
    first.board = [];
    sim.step();
    expect(first.board).toEqual([]);
    undock(sim, ship);
    ship.news = [{ base: second.id, item: "tractorAll", price: 500, seen: sim.now - 601 }];
    dockAt(sim, ship, sim.station);
    sim.step();
    expect(first.board).toEqual([]);
    expect(ship.news).toEqual([]);
  });

  it("is said on the radio by a ship that brings word the board didn't have, but not by the player", () => {
    const { sim, outpost } = world({ trafficRacers: 1, trafficRecords: false, chatter: true }, { blueprints: ["tractorAll"] });
    sim.reset(1);
    const theirs = sim.traffic.find((pilot) => sim.dockedAt(pilot.ship) === outpost)!.ship;
    const said = () => {
      const lines = sim.events.flatMap((event) => (event.type === "chatter" ? [event.text] : []));
      sim.events.length = 0;
      return lines;
    };
    // The player brings it first: posted, but nobody says so.
    dockAt(sim, sim.ship, outpost);
    sim.step();
    undock(sim, sim.ship);
    dockAt(sim, sim.ship, sim.station);
    sim.step();
    expect(sim.bases[0].board).toHaveLength(1);
    for (let i = 0; i < Math.round(3 / TICK); i++) sim.step();
    expect(said().some((line) => line.includes("tractor"))).toBe(false);
    // A traffic ship brings it to a board that has forgotten it.
    sim.bases[0].board = [];
    theirs.news = [];
    theirs.newsFrom = null;
    dockAt(sim, theirs, outpost);
    sim.step();
    expect(theirs.news).toHaveLength(1);
    dockAt(sim, theirs, sim.station);
    const lines: string[] = [];
    for (let i = 0; i < Math.round(3 / TICK); i++) {
      sim.step();
      lines.push(...said());
    }
    expect(lines.filter((line) => /outpost.*all-round tractor.*600|all-round tractor.*outpost/i.test(line))).toHaveLength(1);
    expect(lines.some((line) => line.includes("on the board"))).toBe(true);
  });

  it("is passed on to the player by the station, once, when they dock where the board has word they hadn't heard", () => {
    const { sim, outpost } = world({ chatter: true });
    const [first, second] = sim.bases;
    first.board = [{ base: second.id, item: "tractorAll", price: 600, seen: sim.now }];
    const lines: string[] = [];
    const listen = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / TICK); i++) {
        sim.step();
        for (const event of sim.events) if (event.type === "chatter" && event.text.includes("tractor")) lines.push(event.text);
        sim.events.length = 0;
      }
    };
    dockAt(sim, sim.ship, sim.station);
    listen(3);
    expect(lines).toEqual([expect.stringMatching(/all-round tractor.*outpost|outpost.*all-round tractor/i)]);
    undock(sim, sim.ship);
    dockAt(sim, sim.ship, sim.station);
    listen(3);
    expect(lines).toHaveLength(1);
    expect(outpost).toBeDefined();
  });

  it("isn't swapped with pirates or defenders", () => {
    const { sim } = world();
    const [first, second] = sim.bases;
    const ship = sim.ship;
    ship.faction = "defender";
    ship.news = [{ base: second.id, item: "tractorAll", price: 500, seen: sim.now }];
    dockAt(sim, ship, sim.station);
    sim.step();
    expect(first.board).toEqual([]);
  });

  it("keeps boards and what ships have heard through a save", () => {
    const { sim, outpost } = world({}, { blueprints: ["tractorAll"] });
    dockAt(sim, sim.ship, outpost);
    sim.step();
    const { sim: into } = world({}, { blueprints: ["tractorAll"] });
    roundTrip(sim, into);
    expect(into.bases[1].board).toHaveLength(1);
    expect(into.ship.news).toHaveLength(1);
    expect(into.ship.news[0].item).toBe("tractorAll");
  });
});
