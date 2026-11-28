import { afterEach, describe, expect, it } from "vitest";
import { devCard } from "./chart";
import { newFactory, pickStockJob, tickFactory, type FactoryData, type FactoryJob, type FactoryStore } from "./factories";
import { homeSim } from "./home";
import { itemsFileNow, recipeFor, useItemsFile, type ItemsFile } from "./items";
import { type PartId } from "./parts";
import { roundTrip } from "./save";
import { type Base, type Sim, TICK } from "./sim";
import { buyNow } from "./testing";
import { DEFAULTS } from "./tuning";

// Factories, `docs/recipes-factories-plan.md` steps 1-2: the recipe shape, the factory part and
// the workshop that builds what the player buys behind a bar.

/** A store in memory, counting what goes in and out. */
function store(start: Record<string, number>, room = Infinity): FactoryStore & { counts: Map<string, number> } {
  const counts = new Map(Object.entries(start));
  const used = () => [...counts.values()].reduce((sum, n) => sum + n, 0);
  return {
    counts,
    held: (id) => counts.get(id) ?? 0,
    take: (id, n) => counts.set(id, (counts.get(id) ?? 0) - n),
    put: (id, n) => counts.set(id, (counts.get(id) ?? 0) + n),
    fits: (_id, n) => used() + n <= room,
    label: (id) => (id === "ore" ? "Ore" : id === "oreB" ? "Ore B" : id),
  };
}

const ORE_FACTORY: FactoryData = { kind: "ore", speed: 2, mode: "stock", targets: { partA: 10, partB: 2 } };

describe("a factory made to stock", () => {
  it("runs a recipe in its time over its speed, taking the inputs when it starts and putting the output in storage", () => {
    const factory = newFactory("m");
    const held = store({ ore: 4, oreB: 0 });
    const time = recipeFor("partA")!.time;
    tickFactory(factory, ORE_FACTORY, 0, held, () => {});
    // Started: the inputs are gone, nothing is made yet.
    expect(factory.state).toEqual({ is: "working", makes: "partA" });
    expect(held.held("ore")).toBe(2);
    expect(held.held("partA")).toBe(0);
    tickFactory(factory, ORE_FACTORY, time / ORE_FACTORY.speed - 0.01, held, () => {});
    expect(held.held("partA")).toBe(0);
    tickFactory(factory, ORE_FACTORY, 0.02, held, () => {});
    expect(held.held("partA")).toBe(1);
    // And the next run started in the time left.
    expect(held.held("ore")).toBe(0);
  });

  it("makes the output furthest below its target, as a share of the target", () => {
    // Part A at 5 of 10 is half full; part B at 0 of 2 is empty, so part B comes first.
    const pick = pickStockJob(ORE_FACTORY, store({ ore: 10, oreB: 10, partA: 5, partB: 0 }));
    expect(pick && "job" in pick ? pick.job.makes : null).toBe("partB");
    // Part B at 1 of 2 is half, part A at 2 of 10 a fifth: part A.
    const next = pickStockJob(ORE_FACTORY, store({ ore: 10, oreB: 10, partA: 2, partB: 1 }));
    expect(next && "job" in next ? next.job.makes : null).toBe("partA");
  });

  it("makes another below its target when the furthest below can't be made", () => {
    const pick = pickStockJob(ORE_FACTORY, store({ ore: 10, oreB: 0, partA: 5, partB: 0 }));
    expect(pick && "job" in pick ? pick.job.makes : null).toBe("partA");
  });

  it("waits, naming the input it lacks, and is idle with nothing below target", () => {
    const factory = newFactory("m");
    // Part B, at none of its 2, is furthest below: it waits on that one.
    tickFactory(factory, ORE_FACTORY, 1, store({ ore: 1, oreB: 0, partA: 5 }), () => {});
    expect(factory.state).toEqual({ is: "waiting", makes: "partB", on: ["2 Ore B"] });
    expect(factory.job).toBeNull();
    tickFactory(factory, ORE_FACTORY, 1, store({ partA: 10, partB: 2 }), () => {});
    expect(factory.state).toEqual({ is: "idle" });
  });

  it("waits for room in storage", () => {
    const factory = newFactory("m");
    tickFactory(factory, { ...ORE_FACTORY, targets: { partA: 10 } }, 1, store({ ore: 2 }, 2), () => {});
    expect(factory.state).toEqual({ is: "waiting", makes: "partA", on: ["room in storage"] });
  });

  it("works through its orders before anything of its own", () => {
    const factory = newFactory("m");
    const order: FactoryJob = { makes: "x", yields: 1, left: 4, total: 4, order: { kind: "hull", model: "floater", from: "racer", net: 0 } };
    factory.queue.push(order);
    const done: FactoryJob[] = [];
    const held = store({ ore: 2 });
    tickFactory(factory, ORE_FACTORY, 1, held, (job) => done.push(job));
    expect(held.held("ore")).toBe(2);
    tickFactory(factory, ORE_FACTORY, 1, held, (job) => done.push(job));
    expect(done).toEqual([order]);
    // In the time it had left, it started on its own.
    expect(held.held("ore")).toBe(0);
  });
});

/** The part on a ship's gun mount: read through a function, so a `delete` before it doesn't narrow it away. */
function gunOn(ship: Sim["ship"]): string | undefined {
  return ship.fit.gun?.part;
}

const WORLD = {
  ...DEFAULTS,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  rockCount: 0,
  stationStartParts: 100,
  stationStorage: 1000000,
  stationUnlocks: false,
};

function run(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) {
    sim.step();
    sim.events.length = 0;
  }
}

/** The player in a racer, docked at the home station with credits to spend. */
function docked(): { sim: Sim; base: Base } {
  const sim = homeSim(1, { ...WORLD, floaterStart: false });
  const dock = sim.dockPoint(false, sim.station);
  sim.ship.x = sim.ship.px = dock.x;
  sim.ship.y = sim.ship.py = dock.y;
  sim.ship.vx = sim.ship.vy = 0;
  sim.ship.credits = 100000;
  run(sim, 0.1);
  expect(sim.isDocked()).toBe(true);
  return { sim, base: sim.baseAt()! };
}

/** Seconds a workshop at the station's speed takes to make a module. */
function buildTime(sim: Sim, base: Base, id: string): number {
  const workshop = sim.factoryFor(base, "workshop")!;
  return recipeFor(id)!.time / sim.factoryData(base, workshop)!.speed;
}

describe("the workshop", () => {
  it("is on every station the frame comes with: made to order, at speed 20", () => {
    const sim = homeSim(1, { ...WORLD });
    for (const base of sim.bases) {
      const workshop = sim.factoryFor(base, "workshop")!;
      expect(sim.factoryData(base, workshop)).toEqual({ kind: "workshop", speed: 20, mode: "order" });
    }
  });

  it("takes a gun's parts when it's bought, and puts it on its mount when the bar fills, about 3 s on", () => {
    const { sim, base } = docked();
    const { ship } = sim;
    delete ship.fit.gun;
    const parts = sim.partA(base);
    const credits = ship.credits;
    expect(sim.buyPart(ship, "gun1")).toBe(true);
    // Paid for, its parts taken, and on order: not on the ship yet.
    expect(ship.credits).toBe(credits - sim.partPrice("gun1"));
    expect(sim.partA(base)).toBe(parts - 5);
    expect(ship.fit.gun).toBeUndefined();
    const seconds = buildTime(sim, base, "gun1");
    expect(seconds).toBeCloseTo(3);
    expect(sim.ordersAt(base)).toEqual([{ makes: "gun1", progress: 0, seconds }]);
    run(sim, seconds / 2);
    expect(sim.ordersAt(base)[0].progress).toBeCloseTo(0.5, 1);
    run(sim, seconds / 2 + 0.1);
    expect(ship.fit.gun).toEqual({ part: "gun1", wear: 0 });
    expect(sim.ordersAt(base)).toEqual([]);
    // Made, and counted as made.
    expect(sim.itemFlow.get("gun1" as PartId)).toBe(1);
  });

  it("refuses with the words it always did when the station is short of parts", () => {
    const { sim, base } = docked();
    base.stock.set("partA" as PartId, 3);
    expect(sim.buyPart(sim.ship, "gun2")).toBe(false);
    expect(sim.buyRefused).toBe("The station needs 13 Part A to make it");
    expect(sim.ordersAt(base)).toEqual([]);
  });

  it("hands a whole one in the store over at once", () => {
    const { sim, base } = docked();
    delete sim.ship.fit.gun;
    base.stock.set("gun1" as PartId, 1);
    expect(sim.buyPart(sim.ship, "gun1")).toBe(true);
    expect(sim.ship.fit.gun).toEqual({ part: "gun1", wear: 0 });
    expect(sim.ordersAt(base)).toEqual([]);
  });

  it("gives an AI buyer what it buys at once", () => {
    const { sim, base } = docked();
    const ship = sim.ship;
    // The same docked racer, as another ship: not the player's, so no bar.
    sim.ship = { ...ship, fit: { ...ship.fit } };
    delete ship.fit.gun;
    expect(sim.buyPart(ship, "gun1")).toBe(true);
    expect(gunOn(ship)).toBe("gun1");
    expect(sim.ordersAt(base)).toEqual([]);
  });

  it("plans a second buy round the first: the mount it holds is taken", () => {
    const { sim, base } = docked();
    const { ship } = sim;
    delete ship.fit.gun;
    expect(sim.buyPart(ship, "gun1")).toBe(true);
    expect(sim.whereBuyGoes(ship, "gun2")).toBe("hold");
    expect(sim.buyPart(ship, "gun2")).toBe(true);
    run(sim, buildTime(sim, base, "gun1") + buildTime(sim, base, "gun2") + 0.2);
    expect(gunOn(ship)).toBe("gun1");
    expect(ship.hold.map((item) => item.module.part)).toEqual(["gun2"]);
  });

  it("finishes an order after you've left, and keeps it in your locker there", () => {
    const { sim, base } = docked();
    const { ship } = sim;
    delete ship.fit.gun;
    expect(sim.buyPart(ship, "gun1")).toBe(true);
    // Away from the dock before the bar fills.
    ship.x = ship.px = ship.x + 5000;
    run(sim, buildTime(sim, base, "gun1") + 0.2);
    expect(sim.isDocked()).toBe(false);
    expect(ship.fit.gun).toBeUndefined();
    expect(sim.lockerAt(base).items.map((item) => item.module.part)).toEqual(["gun1"]);
  });

  it("builds a hull behind the bar, and swaps it in when it's done", () => {
    const { sim, base } = docked();
    const { ship } = sim;
    sim.shopBase().body.parts.find((part) => part.kind === "shop")!.data.hulls.push("floater");
    expect(sim.buyHull(ship, "floater")).toBe(true);
    expect(ship.model).toBe("racer");
    // One hull at a time.
    expect(sim.planHull(ship, "floater")).toEqual({ refused: "A hull is on order already" });
    const workshop = sim.factoryFor(base, "workshop")!;
    const seconds = sim.hullWorkTime("floater") / sim.factoryData(base, workshop)!.speed;
    expect(sim.ordersAt(base).map((order) => order.makes)).toEqual(["floater"]);
    run(sim, seconds + 0.2);
    expect(ship.model).toBe("floater");
    expect(sim.hullOnOrder()).toBe(false);
  });

  it("keeps a finished hull until you're back in its dock", () => {
    const { sim, base } = docked();
    const { ship } = sim;
    sim.shopBase().body.parts.find((part) => part.kind === "shop")!.data.hulls.push("floater");
    expect(sim.buyHull(ship, "floater")).toBe(true);
    ship.x = ship.px = ship.x + 5000;
    run(sim, sim.hullWorkTime("floater") / 20 + 0.2);
    expect(ship.model).toBe("racer");
    expect(sim.ordersAt(base)).toEqual([{ makes: "floater", progress: 1, seconds: 0 }]);
    const dock = sim.dockPoint(false, sim.station);
    ship.x = ship.px = dock.x;
    ship.y = ship.py = dock.y;
    ship.vx = ship.vy = 0;
    run(sim, 0.2);
    expect(ship.model).toBe("floater");
    expect(sim.ordersAt(base)).toEqual([]);
  });

  it("keeps an order through a save, and hands it over after", () => {
    const { sim, base } = docked();
    delete sim.ship.fit.gun;
    expect(sim.buyPart(sim.ship, "gun1")).toBe(true);
    run(sim, 1);
    const into = homeSim(2, { ...WORLD });
    roundTrip(sim, into);
    const there = into.bases.find((each) => each.id === base.id)!;
    expect(into.ordersAt(there).map((order) => order.makes)).toEqual(["gun1"]);
    expect(into.ordersAt(there)[0].progress).toBeGreaterThan(0.2);
    run(into, 3);
    expect(gunOn(into.ship)).toBe("gun1");
  });

  it("shows on the station's dev card: working while it builds, idle after", () => {
    const { sim, base } = docked();
    delete sim.ship.fit.gun;
    expect(devCard(sim, base)!.factories[0]).toMatchObject({ text: "Workshop ×20: idle", state: "idle", progress: null });
    sim.buyPart(sim.ship, "gun1");
    run(sim, 1);
    const card = devCard(sim, base)!;
    expect(card.factories[0]).toMatchObject({ text: "Workshop ×20: making Gun 1", state: "working" });
    expect(card.factories[0].progress).toBeGreaterThan(0.2);
    expect(card.storage.find((item) => item.label === "Part A")).toEqual({ label: "Part A", held: sim.partA(base), target: WORLD.stationPartsTarget });
    run(sim, 3);
    expect(devCard(sim, base)!.factories[0].state).toBe("idle");
  });
});

describe("recipes in an older file", () => {
  const keep = itemsFileNow();
  afterEach(() => useItemsFile(keep));

  it("read `from` as the inputs, and take the time and the factory from the item's type", () => {
    const old = JSON.parse(JSON.stringify(keep)) as ItemsFile;
    for (const item of old.items) {
      if (!item.recipe) continue;
      const { inputs } = item.recipe;
      item.recipe = { from: inputs } as never;
    }
    useItemsFile(old);
    expect(recipeFor("gun1")).toEqual({ makes: "gun1", inputs: [{ item: "partA", n: 5 }], conditions: { factory: "workshop" }, time: 60 });
    expect(recipeFor("partA")).toEqual({ makes: "partA", inputs: [{ item: "ore", n: 2 }], conditions: { factory: "ore" }, time: 2 });
  });
});

describe("buyNow, for tests", () => {
  it("hands the order over at once", () => {
    const { sim } = docked();
    delete sim.ship.fit.gun;
    expect(buyNow(sim, sim.ship, "gun1")).toBe(true);
    expect(gunOn(sim.ship)).toBe("gun1");
  });
});
