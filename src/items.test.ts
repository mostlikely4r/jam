import { afterEach, describe, expect, it } from "vitest";
import { homeFields, homeSim, homeStations } from "./home";
import { itemDef, ITEM_RECIPES, ITEMS, itemsFileNow, SHIPPED_ITEMS, thingOf, useItemsFile, type ItemsFile } from "./items";
import { isItem, partOf, PARTS, volumeOf, type PartId } from "./parts";
import { roundTrip } from "./save";
import { DEFAULTS } from "./tuning";
import { type FieldSpec, type Poi, type Ship, Sim, type StationSpec, TICK } from "./sim";

// Written for wrecks that happen at once, with a bare hull straight away (see stations.test.ts).
Object.assign(DEFAULTS, { criticalSeconds: 0, askHull: false });

// Long runs never give the worker a turn of the event loop otherwise (see pilot.test.ts).
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const ORE = "oreB" as PartId;
const PART = "partB" as PartId;

describe("the items file", () => {
  it("loads: unique ids that are no part's, whole positive shapes, positive volumes, real recipes", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(2);
    const ids = ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of ITEMS) {
      expect(PARTS.some((part) => part.id === item.id)).toBe(false);
      expect(Number.isInteger(item.shape.w) && item.shape.w >= 1).toBe(true);
      expect(Number.isInteger(item.shape.h) && item.shape.h >= 1).toBe(true);
      expect(thingOf(item.id as PartId)!.volume).toBeGreaterThan(0);
      expect(item.price).toBeGreaterThanOrEqual(0);
    }
    for (const recipe of ITEM_RECIPES) {
      expect(ids.includes(recipe.makes) || PARTS.some((part) => part.id === recipe.makes)).toBe(true);
      expect(recipe.from.length).toBeGreaterThan(0);
      for (const each of recipe.from) {
        expect(ids).toContain(each.item);
        expect(each.n).toBeGreaterThanOrEqual(1);
      }
    }
    expect(ITEM_RECIPES.some((recipe) => recipe.makes === "tractorAll" && recipe.from.some((each) => each.item === "partB"))).toBe(true);
    expect(ITEM_RECIPES.some((recipe) => recipe.makes === "partB" && recipe.from.some((each) => each.item === "oreB"))).toBe(true);
  });

  it("starts an item's volume as the area of its shape, for a part as well", () => {
    for (const item of ITEMS) if (item.volume === undefined) expect(volumeOf(item.id as PartId)).toBe(item.shape.w * item.shape.h);
    expect(volumeOf("tractorAll")).toBe(4);
    // Every existing part keeps what it took: the cells of its shape, or one.
    for (const part of PARTS) expect(volumeOf(part.id)).toBe(part.shape ? part.shape.w * part.shape.h : 1);
    expect(isItem(ORE)).toBe(true);
    expect(isItem("tractorAll")).toBe(false);
    expect(partOf(ORE).kind).toBe("item");
  });

  it("answers for a part or an item alike", () => {
    const part = thingOf("tractorAll")!;
    expect(part).toMatchObject({ label: "All-round tractor", isItem: false, volume: 4, price: 600 });
    const item = thingOf(ORE)!;
    expect(item).toMatchObject({ label: itemDef("oreB")!.name, isItem: true, price: itemDef("oreB")!.price });
    expect(item.icon.glow).toBeDefined();
    expect(thingOf("nothing" as PartId)).toBeUndefined();
  });

  it("turns away an item whose id is a part's or is taken, and a recipe naming what doesn't exist", () => {
    const keep = itemsFileNow();
    try {
      useItemsFile({
        items: [
          { ...keep.items[0], id: "gun1" },
          { ...keep.items[0], id: "same" },
          { ...keep.items[1], id: "same" },
        ],
        recipes: [{ makes: "same", from: [{ item: "ghost", n: 1 }] }, { makes: "same", from: [{ item: "same", n: 2 }] }],
      });
      expect(ITEMS.map((item) => item.id)).toEqual(["same"]);
      expect(ITEM_RECIPES).toEqual([{ makes: "same", from: [{ item: "same", n: 2 }] }]);
      expect(isItem("gun1" as PartId)).toBe(false);
    } finally {
      useItemsFile(keep);
    }
    expect(ITEMS.map((item) => item.id)).toEqual(keep.items.map((item) => item.id));
  });

  it("round-trips an edited item and recipe through the file, the glow colour included", () => {
    const keep = itemsFileNow();
    try {
      const edited: ItemsFile = JSON.parse(JSON.stringify(keep));
      edited.items[0].name = "Blue ore";
      edited.items[0].shape = { w: 2, h: 3 };
      edited.items[0].volume = 4.5;
      edited.items[0].price = 41;
      edited.items[0].icon = { glyph: "star", primary: "#112233", secondary: "#445566", border: "#778899", mark: "Q", glow: "#abcdef" };
      edited.recipes[0] = { makes: "partB", from: [{ item: "oreB", n: 3 }], yields: 2 };
      useItemsFile(JSON.parse(JSON.stringify(edited)));
      const text = JSON.stringify(itemsFileNow());
      expect(JSON.parse(text)).toEqual(edited);
      useItemsFile(JSON.parse(text));
      expect(itemsFileNow()).toEqual(edited);
      expect(partOf(ORE).icon.glow).toBe("#abcdef");
      expect(volumeOf(ORE)).toBe(4.5);
    } finally {
      useItemsFile(keep);
    }
    expect(itemsFileNow()).toEqual(keep);
  });

  it("is what the file on disk holds", () => {
    expect(itemsFileNow()).toEqual(SHIPPED_ITEMS);
  });
});

// ---------------------------------------------------------------------------------------------
// The world: a home station, and far off a field that drops ore B with a base that holds the
// all-round tractor.

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

function world(
  tuning: Partial<typeof WORLD> = {},
  outpost: Partial<StationSpec> = {},
  drops: FieldSpec["drops"] | null = [{ item: "oreB", chance: 1 }],
  seed = 1,
): { sim: Sim; outpost: Poi; field: FieldSpec } {
  const sim = homeSim(seed, { ...WORLD, ...tuning });
  const home = Math.atan2(sim.field.y, sim.field.x) - (2 * Math.PI * sim.now) / 10800;
  const orbit = (apart: number) => [{ radius: 60000, period: 10800, phase: home + apart, sign: 1 as const }];
  const field: FieldSpec = {
    id: "far:0",
    name: "Far",
    radius: 3000,
    rocks: 40,
    rockDrift: 0,
    rockInflow: 0,
    carryFull: 2000,
    carryNone: 8000,
    rotationPeriod: 0,
    orbits: orbit(FAR),
    ...(drops ? { drops } : {}),
  };
  const spec: StationSpec = {
    id: "outpost:0",
    name: "Outpost",
    rotationPeriod: 300,
    orbits: orbit(FAR + 0.12),
    carryFull: 2000,
    carryNone: 6000,
    shipyard: true,
    blueprints: ["tractorAll"],
    ...outpost,
  };
  sim.applyLayout(homeFields(sim, field), homeStations(sim, spec));
  return { sim, outpost: sim.bases[1].poi, field };
}

function dockAt(sim: Sim, ship: Ship, station: Poi): void {
  const dock = sim.dockPoint(false, station);
  ship.x = ship.px = dock.x;
  ship.y = ship.py = dock.y;
  ship.vx = ship.vy = 0;
}

function run(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) {
    sim.step();
    sim.events.length = 0;
  }
}

/** Puts the player in the far field, awake, and returns a rock there. */
function rockInFar(sim: Sim): { rock: Sim["rocks"][number] } {
  const field = sim.miningFields().find((each) => each.id === "far:0")!;
  const { ship } = sim;
  ship.x = ship.px = field.poi.x;
  ship.y = ship.py = field.poi.y;
  ship.vx = ship.vy = 0;
  run(sim, 1);
  const rock = sim.rocks.find((each) => sim.miningFieldAt(each.x, each.y).id === "far:0")!;
  expect(rock).toBeDefined();
  return { rock };
}

const total = (sim: Sim, id: PartId): number => {
  let sum = 0;
  const count = (items: { module: { part: PartId } }[]) => items.filter((each) => each.module.part === id).length;
  sum += count(sim.ship.hold);
  for (const locker of sim.lockers.values()) sum += count(locker.items);
  for (const base of sim.bases) {
    sum += base.stock.get(id) ?? 0;
    sum += base.hauler?.items.get(id) ?? 0;
  }
  sum += sim.hub.get(id) ?? 0;
  sum += sim.loot.filter((loot) => loot.item.part === id).length;
  return sum;
};

describe("drops", () => {
  it("yields the item when a rock breaks in a field with a drop of chance 1, one for each ore roll", () => {
    const { sim } = world();
    const { rock } = rockInFar(sim);
    const before = sim.loot.length;
    const rolls = rock.tier + 1;
    sim.breakRock(rock);
    const dropped = sim.loot.slice(before);
    expect(dropped).toHaveLength(rolls);
    for (const loot of dropped) {
      expect(loot.item).toEqual({ part: ORE, wear: 0 });
      expect(Math.hypot(loot.x - rock.x, loot.y - rock.y)).toBeLessThan(1e-6);
    }
    expect(sim.itemFlow.get(ORE)).toBe(rolls);
  });

  it("yields nothing in a field without drops, and draws nothing extra from the random stream", () => {
    // Worlds from one seed with the same rock to break: the far field has no drops, an empty list, or a drop of chance 0.
    const draws = (drops: FieldSpec["drops"] | null) => {
      const { sim } = world({}, {}, drops);
      const { rock } = rockInFar(sim);
      let calls = 0;
      const own = (sim as unknown as { random: () => number }).random;
      (sim as unknown as { random: () => number }).random = () => (calls++, own());
      const loot = sim.loot.length;
      sim.breakRock(rock);
      expect(sim.loot.length).toBe(loot);
      expect(sim.itemFlow.size).toBe(0);
      return { calls, rolls: rock.tier + 1 };
    };
    const none = draws(null);
    const empty = draws([]);
    const zero = draws([{ item: "oreB", chance: 1e-9 }]);
    expect(empty.calls).toBe(none.calls);
    // A field with drops rolls each drop once for every ore roll, and only then.
    expect(zero.calls - none.calls).toBe(zero.rolls);
  });

  it("drops nothing for an item that isn't in the file", () => {
    const { sim } = world({}, {}, [{ item: "ghost", chance: 1 }]);
    const { rock } = rockInFar(sim);
    const loot = sim.loot.length;
    sim.breakRock(rock);
    expect(sim.loot.length).toBe(loot);
  });
});

describe("pickup and sale", () => {
  it("puts an item in the bay on a spot that sticks when the ship flies through it", () => {
    const { sim } = world();
    const { ship } = sim;
    sim.loot.push({ x: ship.x + 30, y: ship.y, px: ship.x + 30, py: ship.y, vx: 0, vy: 0, item: { part: ORE, wear: 0 } });
    expect(sim.bayGrid(ship)).not.toBeNull();
    ship.vx = 60;
    run(sim, 1);
    expect(sim.loot).toHaveLength(0);
    expect(ship.hold.map((placed) => placed.module.part)).toEqual([ORE]);
    expect(ship.hold[0].turned === true || ship.hold[0].turned === false).toBe(true);
  });

  it("leaves it floating when the bay is full", () => {
    const { sim } = world();
    const { ship } = sim;
    const grid = sim.bayGrid(ship)!;
    // Fill every cell with ore.
    ship.ore = sim.bayTotal(ship) - sim.holdSize(ship);
    const room = grid.w * grid.h;
    expect(room).toBeGreaterThan(0);
    sim.loot.push({ x: ship.x + 20, y: ship.y, px: ship.x + 20, py: ship.y, vx: 0, vy: 0, item: { part: ORE, wear: 0 } });
    ship.vx = 60;
    run(sim, 0.7);
    expect(sim.loot.length).toBe(1);
    expect(ship.hold).toHaveLength(0);
  });

  it("sells for its price into the station's store, taking its volume from the storage", () => {
    const { sim, outpost } = world();
    const { ship } = sim;
    const base = sim.bases[1];
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    expect(sim.baseAt(ship)).toBe(base);
    const spot = sim.holdSpotFor(ship, { part: ORE, wear: 0 })!;
    ship.hold.push(spot);
    const credits = ship.credits;
    const baseCredits = base.account.credits;
    const used = sim.storageUsed(base);
    expect(sim.sellItem(ship, { at: "hold", index: 0 })).toBe(true);
    expect(ship.hold).toHaveLength(0);
    expect(ship.credits).toBe(credits + itemDef("oreB")!.price);
    expect(base.account.credits).toBe(baseCredits - itemDef("oreB")!.price);
    expect(base.stock.get(ORE)).toBe(1);
    expect(sim.storageUsed(base) - used).toBe(volumeOf(ORE));
  });

  it("refuses when the station has no room, with the reason, and keeps the item", () => {
    const { sim, outpost } = world({}, { storage: 400 });
    const { ship } = sim;
    const base = sim.bases[1];
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    // The locker takes its free rows; fill all but one cell of what's left.
    base.stock.set(PART, sim.storageFree(base) - 1);
    expect(sim.storageFree(base)).toBe(1);
    ship.hold.push(sim.holdSpotFor(ship, { part: ORE, wear: 0 })!);
    const credits = ship.credits;
    expect(sim.sellItem(ship, { at: "hold", index: 0 })).toBe(false);
    expect(sim.sellRefused).toMatch(/no room/);
    expect(ship.hold).toHaveLength(1);
    expect(ship.credits).toBe(credits);
    expect(base.stock.get(ORE) ?? 0).toBe(0);
  });
});

describe("the hauler and the hub", () => {
  const HAULERS = { haulers: true, haulerFirst: 1, haulerInterval: 100000 };

  /** Runs until a base's hauler has pulled away from the berth, or the time runs out. */
  function untilLeft(sim: Sim, base: Sim["bases"][number], seconds = 600): boolean {
    for (let i = 0; i < seconds / TICK; i++) {
      sim.step();
      sim.events.length = 0;
      if (base.hauler !== null && base.hauler.stage !== "loading" && base.hauler.stage !== "arriving" && base.hauler.stage !== "docking") return true;
    }
    return false;
  }

  /** Runs until a base's hauler is at the berth loading, or the time runs out. */
  function untilBerthed(sim: Sim, base: Sim["bases"][number], seconds = 400): boolean {
    for (let i = 0; i < seconds / TICK; i++) {
      sim.step();
      sim.events.length = 0;
      if (base.hauler?.stage === "loading") return true;
    }
    return false;
  }

  it("loads ore B from the store, and gives it to the hub when it leaves, where n ore B becomes m part B", () => {
    const { sim } = world(HAULERS, { items: [] });
    const base = sim.bases[1];
    base.stock.set(ORE, 6);
    expect(sim.hub.size).toBe(0);
    expect(untilBerthed(sim, base)).toBe(true);
    expect(untilLeft(sim, base)).toBe(true);
    const recipe = ITEM_RECIPES.find((each) => each.makes === "partB")!;
    const n = recipe.from[0].n;
    const made = Math.floor(6 / n) * (recipe.yields ?? 1);
    expect(base.stock.get(ORE) ?? 0).toBe(0);
    expect(sim.hub.get(PART) ?? 0).toBe(made);
    expect(sim.hub.get(ORE) ?? 0).toBe(6 % n);
    expect(sim.itemFlow.get(PART)).toBe(made);
    expect(sim.itemFlow.get(ORE)).toBe(-Math.floor(6 / n) * n);
  });

  it("pays the item's price for ore B", () => {
    const { sim } = world({ ...HAULERS, haulerPrice: 0, haulerCapacity: 0, stationStartOre: 0, haulerPartsLoad: 0 }, { items: [] });
    const base = sim.bases[1];
    base.stock.set(ORE, 4);
    const before = base.account.credits;
    expect(untilBerthed(sim, base)).toBe(true);
    expect(untilLeft(sim, base)).toBe(true);
    expect(base.account.credits).toBe(before + 4 * itemDef("oreB")!.price);
  });

  it("never carries past its volume", () => {
    const { sim } = world({ ...HAULERS, haulerVolume: 5 }, { items: [] });
    const base = sim.bases[1];
    base.stock.set(ORE, 20);
    expect(untilBerthed(sim, base)).toBe(true);
    let most = 0;
    for (let i = 0; i < 400 / TICK && base.hauler?.stage === "loading"; i++) {
      sim.step();
      let used = 0;
      for (const [id, count] of base.hauler!.items) used += volumeOf(id) * count;
      most = Math.max(most, used);
    }
    // Two ore B fit in 5 (a volume of 4); a third would make 6.
    expect(most).toBe(4);
    expect(base.stock.get(ORE)).toBe(18);
  });

  it("brings part B to a base that sells the 360 tractor and is low on it, and none to a base with no such recipe", () => {
    const { sim } = world(HAULERS, { items: [] });
    const [home, outpost] = sim.bases;
    sim.hub.set(PART, 5);
    sim.hub.set(ORE, 1);
    expect(sim.needsItem(outpost, PART)).toBe(true);
    expect(sim.needsItem(home, PART)).toBe(false);
    // The hub's part B goes only where it is asked for: up to the target.
    const brought = (sim as unknown as { loadFromHub(base: typeof outpost): Map<PartId, number> }).loadFromHub(outpost);
    expect(brought.get(PART)).toBe(Math.min(5, DEFAULTS.itemTarget, DEFAULTS.haulerItemLoad));
    expect(brought.has(ORE)).toBe(false);
    expect(sim.hub.get(PART)).toBe(5 - brought.get(PART)!);
    const none = (sim as unknown as { loadFromHub(base: typeof home): Map<PartId, number> }).loadFromHub(home);
    expect(none.size).toBe(0);
  });

  it("delivers part B into the station's store and then sells the tractor", () => {
    const { sim, outpost } = world(HAULERS, { items: [] });
    const base = sim.bases[1];
    sim.hub.set(PART, 3);
    expect(untilBerthed(sim, base, 600)).toBe(true);
    expect(untilLeft(sim, base)).toBe(true);
    expect(base.stock.get(PART)).toBe(3);
    const { ship } = sim;
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    expect(sim.buyPart(ship, "tractorAll")).toBe(true);
    expect(base.stock.get(PART)).toBe(2);
  });
});

describe("the shop", () => {
  it("locks the 360 tractor without part B in stock, says what's missing, and a buy spends one", () => {
    const { sim, outpost } = world({}, { items: [] });
    const { ship } = sim;
    const base = sim.bases[1];
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    expect(sim.canSupply(base, "tractorAll")).toBe(false);
    expect(sim.missingFor(base, "tractorAll")).toEqual([`1 ${itemDef("partB")!.name}`]);
    expect(sim.buyPart(ship, "tractorAll")).toBe(false);
    expect(sim.buyRefused).toMatch(/needs 1/);
    expect(ship.parts.has("tractorAll")).toBe(false);
    sim.stockItem(base, PART, 2);
    expect(sim.canSupply(base, "tractorAll")).toBe(true);
    expect(sim.missingFor(base, "tractorAll")).toEqual([]);
    expect(sim.buyPart(ship, "tractorAll")).toBe(true);
    expect(base.stock.get(PART)).toBe(1);
    expect(ship.parts.has("tractorAll")).toBe(true);
    // Whatever is left in store isn't touched by buying something with no recipe.
    expect(sim.buyPart(ship, "strafe")).toBe(true);
    expect(base.stock.get(PART)).toBe(1);
  });

  it("lets a whole tractor in the store be bought without part B", () => {
    const { sim, outpost } = world({}, { items: [] });
    const { ship } = sim;
    const base = sim.bases[1];
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    base.stock.set("tractorAll", 1);
    expect(sim.canSupply(base, "tractorAll")).toBe(true);
    expect(sim.buyPart(ship, "tractorAll")).toBe(true);
    expect(base.stock.get(PART) ?? 0).toBe(0);
  });

  it("keeps traffic from buying it without part B", () => {
    const { sim, outpost } = world({}, { items: [] });
    const base = sim.bases[1];
    const ship = sim.ship;
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    // `wouldUse` is what the AI asks first.
    expect(sim.wouldUse(ship, "tractorAll")).toBe(false);
    sim.stockItem(base, PART, 1);
    expect(sim.wouldUse(ship, "tractorAll")).toBe(true);
  });
});

describe("saving", () => {
  it("round-trips items in a bay, a locker, a store, a hauler, the hub and loose, and the ledger", () => {
    const { sim, outpost } = world({ haulers: true, haulerFirst: 1 });
    const { ship } = sim;
    const base = sim.bases[1];
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    ship.hold.push(sim.holdSpotFor(ship, { part: ORE, wear: 0 })!);
    expect(sim.putInLocker(base, { part: PART, wear: 0 })).toBe(true);
    sim.stockItem(base, PART, 2);
    base.stock.set(ORE, 3);
    sim.hub.set(ORE, 1);
    sim.hub.set(PART, 2);
    sim.loot.push({ x: ship.x + 500, y: ship.y, px: ship.x + 500, py: ship.y, vx: 0, vy: 0, item: { part: ORE, wear: 0 } });
    sim.itemFlow.set(ORE, 4);
    run(sim, 200);
    expect(base.hauler).not.toBeNull();
    base.hauler!.items.set(PART, 2);
    base.hauler!.items.set(ORE, 1);
    const { sim: into } = world({ haulers: true, haulerFirst: 1 });
    roundTrip(sim, into);
    expect(into.hub).toEqual(sim.hub);
    expect(into.itemFlow).toEqual(sim.itemFlow);
    expect(into.bases[1].stock).toEqual(sim.bases[1].stock);
    expect(into.bases[1].hauler!.items).toEqual(sim.bases[1].hauler!.items);
    expect(into.loot.map((loot) => loot.item)).toEqual(sim.loot.map((loot) => loot.item));
    expect(into.ship.hold.map((placed) => placed.module.part)).toEqual([ORE]);
    expect(into.lockerAt(into.bases[1]).items.map((placed) => placed.module.part)).toEqual([PART]);
    for (const id of [ORE, PART]) expect(total(into, id)).toBe(total(sim, id));
  });
});

describe("a field that falls asleep", () => {
  it("keeps loot as loot does for ore: adrift where it was, none made twice or lost without the ledger seeing it", () => {
    const { sim } = world();
    const { rock } = rockInFar(sim);
    sim.breakRock(rock);
    const dropped = sim.loot.length;
    expect(dropped).toBeGreaterThan(0);
    expect(total(sim, ORE)).toBe(dropped);
    // The player goes home, far off: the field sleeps.
    dockAt(sim, sim.ship, sim.station);
    run(sim, 600);
    expect(sim.sleeping.has("far:0")).toBe(true);
    expect(total(sim, ORE)).toBe(sim.itemFlow.get(ORE) ?? 0);
    // Loot isn't kept with a sleeping field's rocks: it stays in the world's own list, carried or forgotten like any loose thing.
    expect(sim.loot.length).toBeLessThanOrEqual(dropped);
  }, 60000);
});

describe("conservation", () => {
  // A driver for the player: flies through whatever drops, sells it at the base, and buys a tractor
  // when part B has come round. Nothing but the listed holes (starting stock) may change what's there.
  for (const seed of [1, 2, 3, 4]) {
    it(`counts every ore B and part B for two game hours (seed ${seed})`, () => {
      const holes = [{ item: "partB", n: 2 }];
      const { sim, outpost } = world({ haulers: true, haulerFirst: 5, haulerInterval: 300 }, { items: holes }, [{ item: "oreB", chance: 1 }], seed);
      const base = sim.bases[1];
      const startOre = total(sim, ORE);
      const startPart = total(sim, PART);
      expect(startOre).toBe(0);
      expect(startPart).toBe(2);
      const field = sim.miningFields().find((each) => each.id === "far:0")!;
      let sold = 0;
      let bought = 0;
      const second = Math.round(1 / TICK);
      for (let tick = 0; tick < 2 * 3600 * 120; tick++) {
        sim.step();
        sim.events.length = 0;
        if (tick % (second * 3) !== 0) continue;
        const { ship } = sim;
        // Keep the ship's own bay and hull from interfering.
        ship.hull = 100;
        if (ship.hold.length > 0) {
          dockAt(sim, ship, outpost);
          run(sim, 0.1);
          while (ship.hold.length > 0 && sim.sellItem(ship, { at: "hold", index: 0 })) sold++;
          // Once, when part B is in store: the tractor is made from one at the moment of sale.
          if (bought === 0 && sim.canSupply(base, "tractorAll")) {
            ship.credits = Math.max(ship.credits, 700);
            if (sim.buyPart(ship, "tractorAll")) bought++;
          }
        } else if (sim.loot.length > 0) {
          const target = sim.loot.find((each) => Math.hypot(each.x - field.poi.x, each.y - field.poi.y) < field.radius * 3);
          if (target) {
            ship.x = ship.px = target.x;
            ship.y = ship.py = target.y;
            ship.vx = ship.vy = 0;
          }
        } else {
          // Out to the rocks, and shoot one: breaking is what drops.
          ship.x = ship.px = field.poi.x;
          ship.y = ship.py = field.poi.y;
          ship.vx = ship.vy = 0;
          const rock = sim.rocks.find((each) => sim.miningFieldAt(each.x, each.y).id === "far:0");
          if (rock) sim.breakRock(rock, ship);
        }
        if (tick % (second * 300) === 0) {
          expect(total(sim, ORE)).toBe(startOre + (sim.itemFlow.get(ORE) ?? 0));
          expect(total(sim, PART)).toBe(startPart + (sim.itemFlow.get(PART) ?? 0));
        }
      }
      expect(total(sim, ORE)).toBe(startOre + (sim.itemFlow.get(ORE) ?? 0));
      expect(total(sim, PART)).toBe(startPart + (sim.itemFlow.get(PART) ?? 0));
      // The run did something: ore was sold, hauled, made into parts, and the tractor sold.
      expect(sold).toBeGreaterThan(0);
      expect(bought).toBe(1);
      expect(sim.itemFlow.get(PART) ?? 0).toBeGreaterThan(0);
    }, 300000);
  }
});
