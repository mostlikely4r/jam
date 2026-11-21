import { afterEach, describe, expect, it } from "vitest";
import { useLayout } from "./designer/link";
import { shippedWorld } from "./designer/shipped";
import { homeFields, homeSim, homeStations } from "./home";
import { linkTo } from "./profile/world";
import {
  hubRecipes,
  itemDef,
  ITEMS,
  itemsFileNow,
  moduleIds,
  moduleItems,
  oreItems,
  recipeFor,
  saleRecipes,
  SHIPPED_ITEMS,
  thingOf,
  useItemsFile,
  type ItemsFile,
} from "./items";
import { isItem, isProgram, partOf, PARTS, volumeOf, type PartId } from "./parts";
import { PROGRAMS, programsFileNow, SHIPPED_PROGRAMS, useProgramsFile } from "./programs";
import { roundTrip } from "./save";
import { DEFAULTS } from "./tuning";
import { type FieldSpec, type Loose, type Poi, type Ship, Sim, type StationSpec, TICK } from "./sim";

// Written for wrecks that happen at once, with a bare hull straight away (see stations.test.ts).
Object.assign(DEFAULTS, { criticalSeconds: 0, askHull: false });

// Long runs never give the worker a turn of the event loop otherwise (see pilot.test.ts).
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const ORE = "oreB" as PartId;
const PART = "partB" as PartId;
const PLAIN = "ore" as PartId;
const PART_A = "partA" as PartId;

/** The modules: the parts that go on mounts, and are items. A cockpit is a decal; a program has its own records. */
const MODULES = PARTS.filter((part) => part.kind !== "cockpit").map((part) => part.id);

describe("the items file", () => {
  it("loads every good as an ore, a part or a module, with whole shapes and a real recipe", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(4);
    const ids = ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of ITEMS) {
      expect(["ore", "part", "module"]).toContain(item.type);
      expect(isProgram(item.id as PartId)).toBe(false);
      expect(Number.isInteger(item.shape.w) && item.shape.w >= 1).toBe(true);
      expect(Number.isInteger(item.shape.h) && item.shape.h >= 1).toBe(true);
      expect(thingOf(item.id as PartId)!.volume).toBeGreaterThan(0);
      expect(item.price).toBeGreaterThanOrEqual(0);
      expect(item.blueprintPrice).toBeGreaterThanOrEqual(0);
      for (const each of item.recipe?.from ?? []) {
        expect(ids).toContain(each.item);
        expect(each.n).toBeGreaterThanOrEqual(1);
      }
    }
    // An item's id is its own: it doesn't clash with a part (unless it is that module), a program or another item.
    for (const item of ITEMS) {
      if (item.type === "module") continue;
      expect(PARTS.some((part) => part.id === item.id)).toBe(false);
      expect(PROGRAMS.some((program) => program.id === item.id)).toBe(false);
    }
  });

  it("gives every module exactly one module item, and names a module for every module item", () => {
    expect(moduleItems().map((item) => item.id).sort()).toEqual([...MODULES].sort());
    for (const item of moduleItems()) expect(partOf(item.id as PartId).kind).not.toBe("cockpit");
  });

  it("keeps each recipe on what it makes, and runs it where its type says", () => {
    expect(recipeFor("partB")).toEqual({ makes: "partB", from: [{ item: "oreB", n: 2 }] });
    expect(recipeFor("partA")).toEqual({ makes: "partA", from: [{ item: "ore", n: 2 }] });
    expect(recipeFor("oreB")).toBeUndefined();
    expect(itemDef("oreB")!.type).toBe("ore");
    expect(itemDef("partB")!.type).toBe("part");
    expect(hubRecipes().map((recipe) => recipe.makes).sort()).toEqual(["partA", "partB"]);
    // A module is made where it's sold, from parts A, and the 360 also takes a part B.
    const tractor = recipeFor("tractorAll")!;
    expect(tractor.from).toContainEqual({ item: PART_A, n: 30 });
    expect(tractor.from).toContainEqual({ item: PART, n: 1 });
    expect(saleRecipes().map((recipe) => recipe.makes)).toContain("tractorAll");
    expect(saleRecipes().map((recipe) => recipe.makes)).not.toContain("partB");
    // Every module's recipe is part A, in the count the plan works out, and never nothing.
    for (const id of MODULES) {
      const recipe = recipeFor(id)!;
      const proposed = Math.max(1, Math.ceil((itemDef(id)!.price * 1) / DEFAULTS.serviceCreditsPerPart));
      expect(recipe.from.find((each) => each.item === PART_A)?.n, id).toBe(proposed);
    }
  });

  it("starts an item's volume as the area of its shape, for a module as well", () => {
    for (const item of ITEMS) if (item.volume === undefined) expect(volumeOf(item.id as PartId)).toBe(item.shape.w * item.shape.h);
    expect(volumeOf("tractorAll")).toBe(4);
    // Every part keeps what it took: the cells of its shape, or one.
    for (const part of PARTS) expect(volumeOf(part.id)).toBe(part.shape ? part.shape.w * part.shape.h : 1);
    expect(isItem(PLAIN)).toBe(true);
    // A module is a part as well as an item, so it isn't one of the plain goods.
    expect(isItem("tractorAll")).toBe(false);
    expect(partOf(PLAIN).kind).toBe("item");
  });

  it("takes a module's own values from its item", () => {
    const keep = itemsFileNow();
    try {
      const edited: ItemsFile = JSON.parse(JSON.stringify(keep));
      const item = edited.items.find((each) => each.id === "tractorAll")!;
      item.name = "Ring beam";
      item.price = 777;
      item.shape = { w: 1, h: 3 };
      item.icon = { glyph: "star", primary: "#112233", secondary: "#445566", border: "#778899", glow: "#abcdef" };
      useItemsFile(JSON.parse(JSON.stringify(edited)));
      const part = partOf("tractorAll");
      expect(part.label).toBe("Ring beam");
      expect(part.price).toBe(777);
      expect(part.shape).toEqual({ w: 1, h: 3 });
      expect(part.kind).toBe("tractor");
      expect(part.icon.glow).toBe("#abcdef");
      expect(volumeOf("tractorAll")).toBe(3);
    } finally {
      useItemsFile(keep);
    }
    expect(partOf("tractorAll").price).toBe(600);
  });

  it("answers for a part, an item or a module alike", () => {
    expect(thingOf("tractorAll")).toMatchObject({ label: "All-round tractor", isItem: true, type: "module", volume: 4, price: 600 });
    const ore = thingOf(PLAIN)!;
    expect(ore).toMatchObject({ label: itemDef(PLAIN)!.name, isItem: true, type: "ore", price: itemDef(PLAIN)!.price });
    expect(ore.icon.glow).toBeDefined();
    expect(thingOf("nothing" as PartId)).toBeUndefined();
    // A decal has no item behind it.
    expect(thingOf("cockpitKite")).toMatchObject({ isItem: false, type: null });
  });

  it("turns away an item whose id is a part's or is taken, and drops a recipe naming what doesn't exist", () => {
    const keep = itemsFileNow();
    const ore = keep.items.find((each) => each.type === "ore")!;
    try {
      useItemsFile({
        items: [
          { ...ore, id: "gun1" },
          { ...ore, id: "same", recipe: { from: [{ item: "ghost", n: 1 }] } },
          { ...ore, id: "same" },
          { ...ore, id: "other", recipe: { from: [{ item: "same", n: 3 }], yields: 2 } },
        ],
      });
      expect(ITEMS.map((item) => item.id)).toEqual(["same", "other"]);
      expect(ITEMS[0].recipe).toBeUndefined();
      expect(ITEMS[1].recipe).toEqual({ from: [{ item: "same", n: 3 }], yields: 2 });
      // A module can't be made up: only a module the code knows takes a module item's id.
      useItemsFile({ items: [{ ...ore, id: "notAModule", type: "module" } as never] });
      expect(ITEMS).toHaveLength(0);
    } finally {
      useItemsFile(keep);
    }
    expect(ITEMS.map((item) => item.id)).toEqual(keep.items.map((item) => item.id));
  });

  it("round-trips an edited item and its recipe through the file, the glow colour included", () => {
    const keep = itemsFileNow();
    try {
      const edited: ItemsFile = JSON.parse(JSON.stringify(keep));
      const forB = edited.items.find((each) => each.id === "partB")!;
      forB.name = "Blue part";
      forB.shape = { w: 2, h: 3 };
      forB.volume = 4.5;
      forB.price = 41;
      forB.recipe = { from: [{ item: "oreB", n: 3 }], yields: 2 };
      const oreB = edited.items.find((each) => each.id === "oreB")!;
      oreB.icon = { glyph: "star", primary: "#112233", secondary: "#445566", border: "#778899", mark: "Q", glow: "#abcdef" };
      useItemsFile(JSON.parse(JSON.stringify(edited)));
      const text = JSON.stringify(itemsFileNow());
      expect(JSON.parse(text)).toEqual(edited);
      useItemsFile(JSON.parse(text));
      expect(itemsFileNow()).toEqual(edited);
      expect(partOf(ORE).icon.glow).toBe("#abcdef");
      expect(volumeOf(PART)).toBe(4.5);
      expect(recipeFor("partB")).toEqual({ makes: "partB", from: [{ item: "oreB", n: 3 }], yields: 2 });
      expect(oreItems().map((item) => item.id)).toEqual(["ore", "oreB"]);
    } finally {
      useItemsFile(keep);
    }
    expect(itemsFileNow()).toEqual(keep);
  });

  it("is what the file on disk holds", () => {
    expect(itemsFileNow()).toEqual(SHIPPED_ITEMS);
  });
});

describe("the programs file", () => {
  it("loads programs of their own: no item, no module, and each one a part the game can fit", () => {
    expect(PROGRAMS.length).toBeGreaterThanOrEqual(8);
    const ids = PROGRAMS.map((program) => program.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const program of PROGRAMS) {
      expect(PARTS.some((part) => part.id === program.id)).toBe(false);
      expect(itemDef(program.id)).toBeUndefined();
      expect(isProgram(program.id as PartId)).toBe(true);
      expect(partOf(program.id as PartId)).toMatchObject({ label: program.name, price: program.price, tier: program.tier });
      expect(partOf(program.id as PartId).kind).toBe("program");
    }
    expect(programsFileNow()).toEqual(SHIPPED_PROGRAMS);
  });

  it("round-trips an edited program through the file", () => {
    const keep = programsFileNow();
    try {
      const edited = JSON.parse(JSON.stringify(keep)) as typeof keep;
      edited.programs[0].name = "Gyro";
      edited.programs[0].price = 123;
      edited.programs[0].icon = { glyph: "star", primary: "#112233", secondary: "#445566", border: "#778899" };
      useProgramsFile(JSON.parse(JSON.stringify(edited)));
      expect(programsFileNow()).toEqual(edited);
      expect(partOf(edited.programs[0].id as PartId).label).toBe("Gyro");
      expect(partOf(edited.programs[0].id as PartId).price).toBe(123);
    } finally {
      useProgramsFile(keep);
    }
    expect(programsFileNow()).toEqual(keep);
  });
});

// ---------------------------------------------------------------------------------------------
// The world: a home station, and far off a field that drops ore B with a base that sells the
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
  stationStorage: 100000,
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
    unlocked: moduleIds(),
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

/** A loose piece of an item, adrift at a spot. */
function loose(item: PartId, x: number, y: number, count = 1, from: Ship | null = null): Loose {
  return { x, y, px: x, py: y, vx: 0, vy: 0, item, wear: 0, count, kind: 0, ...(from ? { from } : {}) };
}

/** Everything of one item there is, wherever the plan counts it. */
function counted(sim: Sim, id: PartId): number {
  const inHold = (items: { module: { part: PartId } }[]) => items.filter((each) => each.module.part === id).length;
  let sum = inHold(sim.ship.hold);
  for (const locker of sim.lockers.values()) sum += inHold(locker.items);
  for (const pilot of [...sim.drones, ...sim.traffic]) sum += inHold(pilot.ship.hold);
  for (const base of sim.bases) {
    sum += base.stock.get(id) ?? 0;
    sum += base.ore.get(id) ?? 0;
    sum += base.hauler?.items.get(id) ?? 0;
  }
  for (const deposit of sim.deposits) sum += deposit.ore.get(id) ?? 0;
  sum += sim.pirateOre.get(id) ?? 0;
  sum += sim.hub.get(id) ?? 0;
  for (const body of sim.ores) if (body.item === id) sum += body.count;
  for (const body of sim.loot) if (body.item === id) sum += body.count;
  return sum;
}

describe("drops", () => {
  it("breaks a rock into plain ore items, one for every ore roll the chance gives", () => {
    const { sim } = world({}, {}, null);
    const { rock } = rockInFar(sim);
    const before = sim.ores.length;
    sim.breakRock(rock);
    const dropped = sim.ores.slice(before);
    expect(dropped.length).toBeGreaterThan(0);
    for (const ore of dropped) {
      expect(ore.item).toBe(PLAIN);
      expect(ore.count).toBe(1);
      expect(ore.wear).toBe(0);
    }
  });

  it("yields a field's item on top, one roll for each ore roll, counted in the ledger", () => {
    const { sim } = world();
    const { rock } = rockInFar(sim);
    const before = sim.ores.length;
    const rolls = rock.tier + 1;
    sim.breakRock(rock);
    const dropped = sim.ores.slice(before).filter((ore) => ore.item === ORE);
    expect(dropped).toHaveLength(rolls);
    for (const ore of dropped) expect(ore).toMatchObject({ item: ORE, wear: 0, count: 1 });
    expect(sim.itemFlow.get(ORE)).toBe(rolls);
  });

  it("yields nothing extra in a field without drops, and draws nothing extra from the random stream", () => {
    // Worlds from one seed with the same rock to break: the far field has no drops, an empty list, or a drop of chance 0.
    const draws = (drops: FieldSpec["drops"] | null) => {
      const { sim } = world({}, {}, drops);
      const { rock } = rockInFar(sim);
      let calls = 0;
      const own = (sim as unknown as { random: () => number }).random;
      (sim as unknown as { random: () => number }).random = () => (calls++, own());
      const mine = () => [...sim.ores, ...sim.loot].filter((body) => body.item === ORE).length;
      const loot = mine();
      sim.breakRock(rock);
      expect(mine()).toBe(loot);
      expect(sim.itemFlow.get(ORE)).toBeUndefined();
      return { calls, rolls: rock.tier + 1 };
    };
    const none = draws(null);
    const empty = draws([]);
    const zero = draws([{ item: "oreB", chance: 1e-9 }]);
    expect(empty.calls).toBe(none.calls);
    expect(zero.calls - none.calls).toBe(zero.rolls);
  });

  it("drops nothing for an item that isn't in the file", () => {
    const { sim } = world({}, {}, [{ item: "ghost", chance: 1 }]);
    const { rock } = rockInFar(sim);
    const loot = sim.loot.length;
    sim.breakRock(rock);
    expect(sim.loot.length).toBe(loot);
    expect(sim.ores.every((ore) => ore.item === PLAIN)).toBe(true);
  });

  it("a flung piece is one loose piece worth several ore", () => {
    const { sim } = world({ flingChance: 1, flingOreAmount: 3 });
    const { rock } = rockInFar(sim);
    const before = sim.ores.length;
    sim.breakRock(rock, sim.ship, true);
    const flung = sim.ores.slice(before).filter((ore) => ore.count > 1);
    expect(flung.length).toBeGreaterThan(0);
    expect(flung[0].count).toBe(3);
  });
});

describe("the tractor", () => {
  it("catches any ore item, ore B as well as plain ore, and leaves a part or a module where it is", () => {
    const { sim } = world({}, {}, null);
    const { ship } = sim;
    sim.devSet(ship, "tractorAll", true);
    ship.vx = 0;
    const near = DEFAULTS.tractorRange - 25;
    const around = (item: PartId, count = 1): Loose => loose(item, ship.x + near, ship.y, count);
    sim.ores.push(around(PLAIN), around(ORE));
    sim.loot.push(around(PART), around("bay"));
    run(sim, 0.2);
    // Both ores are caught and pulled; the part and the module are untouched.
    expect(sim.ores.filter((ore) => ore.caughtBy === ship)).toHaveLength(2);
    expect(sim.loot.every((loot) => loot.caughtBy === undefined)).toBe(true);
  });
});

describe("pickup and sale", () => {
  it("puts a piece of ore in the bay on a spot that sticks when a ship flies through it", () => {
    const { sim } = world();
    const { ship } = sim;
    sim.ores.push(loose(PLAIN, ship.x + 30, ship.y));
    expect(sim.bayGrid(ship)).not.toBeNull();
    ship.vx = 60;
    run(sim, 1);
    expect(sim.ores).toHaveLength(0);
    expect(sim.oreIn(ship)).toBe(1);
    expect(ship.hold[0].turned === true || ship.hold[0].turned === false).toBe(true);
  });

  it("leaves it loose when the bay is full", () => {
    const { sim } = world();
    const { ship } = sim;
    sim.setOre(ship, sim.cargoSpace(ship));
    expect(sim.cargoSpace(ship)).toBe(0);
    sim.ores.push(loose(PLAIN, ship.x + 20, ship.y));
    ship.vx = 60;
    run(sim, 0.7);
    expect(sim.ores).toHaveLength(1);
    expect(sim.oreIn(ship)).toBe(sim.bayTotal(ship));
  });

  it("puts in as much of a flung piece as fits, and leaves the rest loose", () => {
    const { sim } = world();
    const { ship } = sim;
    sim.setOre(ship, sim.cargoSpace(ship) - 1);
    const before = sim.oreIn(ship);
    sim.ores.push(loose(PLAIN, ship.x + 20, ship.y, 3));
    ship.vx = 60;
    run(sim, 0.7);
    expect(sim.oreIn(ship)).toBe(before + 1);
    expect(sim.ores[0].count).toBe(2);
  });

  it("sells each ore item for its own price into the station's store, taking its volume", () => {
    const { sim, outpost } = world();
    const { ship } = sim;
    const base = sim.bases[1];
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    expect(sim.baseAt(ship)).toBe(base);
    ship.hold.push(sim.holdSpotFor(ship, { part: ORE, wear: 0 })!);
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

  it("sells loose ore at the dock, each piece at its own price, into the station's ore", () => {
    const { sim, outpost } = world({}, {}, null);
    const { ship } = sim;
    const base = sim.bases[1];
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    const plainBefore = base.ore.get(PLAIN) ?? 0;
    ship.hold.push(sim.holdSpotFor(ship, { part: PLAIN, wear: 0 })!);
    ship.hold.push(sim.holdSpotFor(ship, { part: ORE, wear: 0 })!);
    const credits = ship.credits;
    run(sim, 1);
    expect(sim.oreIn(ship)).toBe(0);
    expect(ship.credits).toBe(credits + itemDef(PLAIN)!.price + itemDef(ORE)!.price);
    expect(base.ore.get(PLAIN)).toBe(plainBefore + 1);
    // Ore of every kind goes into its ore store, where the hauler will find it.
    expect(base.ore.get(ORE)).toBe(1);
    expect(base.stock.get(ORE) ?? 0).toBe(0);
  });

  it("refuses when the station has no room, with the reason, and keeps the item", () => {
    const { sim, outpost } = world({ stationStartParts: 0 }, { storage: 400 });
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
      // Its cargo reaches the hub once it's out of sight.
      if (base.hauler === null) return true;
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

  it("loads ore B from the store and plain ore from the ore store, and gives them to the hub, where n ore B become m part B", () => {
    const { sim } = world({ ...HAULERS, stationPartsTarget: 0, itemTarget: 0 }, { items: [] });
    const base = sim.bases[1];
    base.stock.set(ORE, 6);
    const plain = base.ore.get(PLAIN)!;
    expect(plain).toBeGreaterThan(0);
    expect(untilBerthed(sim, base)).toBe(true);
    expect(untilLeft(sim, base)).toBe(true);
    const recipe = recipeFor("partB")!;
    const n = recipe.from[0].n;
    const made = Math.floor(6 / n) * (recipe.yields ?? 1);
    expect(base.stock.get(ORE) ?? 0).toBe(0);
    expect(sim.hub.get(PART) ?? 0).toBe(made);
    expect(sim.hub.get(ORE) ?? 0).toBe(6 % n);
    expect(sim.itemFlow.get(PART)).toBe(made);
    // Plain ore goes into the hub too, and part A is made from it: two ore to a part.
    expect(base.ore.get(PLAIN) ?? 0).toBeLessThan(plain);
    expect(sim.hub.get(PART_A) ?? 0).toBeGreaterThan(0);
    expect(sim.itemFlow.get(ORE)).toBe(-Math.floor(6 / n) * n);
  });

  it("pays the item's price plus the hauler's markup for ore B", () => {
    const { sim } = world({ ...HAULERS, stationStartOre: 0, stationPartsTarget: 0, itemTarget: 0 }, { items: [] });
    const base = sim.bases[1];
    base.stock.set(ORE, 4);
    const before = base.account.credits;
    expect(untilBerthed(sim, base)).toBe(true);
    expect(untilLeft(sim, base)).toBe(true);
    expect(base.account.credits).toBe(before + 4 * Math.round(itemDef("oreB")!.price * DEFAULTS.haulerMarkup));
  });

  it("pays the plain ore price plus its markup, which is the old per-ore rate", () => {
    const { sim } = world({ ...HAULERS, stationPartsTarget: 0, itemTarget: 0 }, { items: [] });
    const base = sim.bases[1];
    base.ore = new Map([[PLAIN, 4]]);
    const before = base.account.credits;
    expect(untilBerthed(sim, base)).toBe(true);
    expect(untilLeft(sim, base)).toBe(true);
    // 10 credits of ore, times 1.5: the old 15 a hauler paid for every ore.
    expect(base.account.credits).toBe(before + 4 * 15);
  });

  it("never carries past its volume", () => {
    const { sim } = world({ ...HAULERS, haulerVolume: 5 }, { items: [] });
    const base = sim.bases[1];
    base.ore = new Map();
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

  it("trades its parts for a station's ore when it comes in full and the station is in debt", () => {
    // Full of part A, it has no room for ore until they're off, and the station can't pay for them:
    // the ore it holds pays instead, or the hauler would leave with both.
    const { sim } = world({ ...HAULERS, haulerVolume: 10, stationPartsTarget: 1000 }, { items: [] });
    const base = sim.bases[1];
    base.ore = new Map([[PLAIN, 30]]);
    base.stock.delete(PART_A);
    base.account.credits = -1000;
    expect(untilBerthed(sim, base)).toBe(true);
    expect(base.hauler!.items.get(PART_A)).toBe(10);
    let leaving = 0;
    let partsLeft = 10;
    for (let i = 0; i < 600 / TICK && base.hauler; i++) {
      sim.step();
      sim.events.length = 0;
      if (base.hauler) partsLeft = Math.min(partsLeft, base.hauler.items.get(PART_A) ?? 0);
      if (base.hauler?.stage === "leaving") leaving = Math.max(leaving, base.hauler.items.get(PLAIN) ?? 0);
    }
    // Part A goes to work at the station as it lands, so count what came off the hauler instead:
    // the 10 ore that fit pay 150, enough for 9 parts at 16. The last goes back to the hub.
    expect(partsLeft).toBe(1);
    expect(base.ore.get(PLAIN) ?? 0).toBeLessThan(30);
    // It flies off with the ore aboard: the hub only gets it once the hauler is out of sight.
    expect(leaving).toBeGreaterThan(0);
  });

  it("brings part B to a base that sells the 360 tractor and is low on it, and none to a base with no such recipe", () => {
    const { sim } = world(HAULERS, { items: [] });
    const [home, outpost] = sim.bases;
    sim.hub.set(PART, 5);
    sim.hub.set(ORE, 1);
    expect(sim.needsItem(outpost, PART)).toBe(true);
    expect(sim.needsItem(home, PART)).toBe(false);
    // The hub is infinite: what the station wants comes, up to its target.
    const brought = (sim as unknown as { loadFromHub(one: Sim["bases"][number]): Map<PartId, number> }).loadFromHub(outpost);
    expect(brought.get(PART)).toBe(DEFAULTS.itemTarget);
    expect(brought.has(ORE)).toBe(false);
    const none = (sim as unknown as { loadFromHub(one: Sim["bases"][number]): Map<PartId, number> }).loadFromHub(home);
    expect(none.has(ORE)).toBe(false);
  });

  it("delivers part B into the station's store and then sells the tractor", () => {
    const { sim, outpost } = world(HAULERS, { items: [] });
    const base = sim.bases[1];
    expect(untilBerthed(sim, base, 600)).toBe(true);
    expect(untilLeft(sim, base)).toBe(true);
    expect(base.stock.get(PART)).toBe(DEFAULTS.itemTarget);
    const { ship } = sim;
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    expect(sim.buyPart(ship, "tractorAll")).toBe(true);
    expect(base.stock.get(PART)).toBe(DEFAULTS.itemTarget - 1);
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
    expect(sim.missingFor(base, "tractorAll")).toContain(`1 ${itemDef("partB")!.name}`);
    expect(sim.buyPart(ship, "tractorAll")).toBe(false);
    expect(sim.buyRefused).toMatch(/needs 1/);
    expect(ship.parts.has("tractorAll")).toBe(false);
    sim.stockItem(base, PART, 2);
    expect(sim.canSupply(base, "tractorAll")).toBe(true);
    expect(sim.missingFor(base, "tractorAll")).toEqual([]);
    expect(sim.buyPart(ship, "tractorAll")).toBe(true);
    expect(base.stock.get(PART)).toBe(1);
    expect(ship.parts.has("tractorAll")).toBe(true);
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

  it("sells a program for its price, taking nothing from the station's parts A", () => {
    const { sim, outpost } = world({}, { items: [] });
    const { ship } = sim;
    const base = sim.bases[1];
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    const parts = sim.partA(base);
    const before = ship.credits;
    const price = sim.partPrice("meters");
    expect(price).toBe(50);
    expect(sim.buyPart(ship, "meters")).toBe(true);
    expect(ship.credits).toBe(before - price);
    expect(sim.partA(base)).toBe(parts);
    expect(ship.software.has("meters")).toBe(true);
  });

  it("keeps traffic from buying the tractor without part B", () => {
    const { sim, outpost } = world({}, { items: [] });
    const base = sim.bases[1];
    const ship = sim.ship;
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    expect(sim.wouldUse(ship, "tractorAll")).toBe(false);
    sim.stockItem(base, PART, 1);
    expect(sim.wouldUse(ship, "tractorAll")).toBe(true);
  });
});

describe("part A", () => {
  it("is what a repair spends, and a station with too little refuses", () => {
    const { sim, outpost } = world({ repairCost: 20, repairSpeed: 100, stationStartParts: 3 }, { items: [] });
    const { ship } = sim;
    const base = sim.bases[1];
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    ship.hull = 90;
    run(sim, 1);
    // 20 credits of service is one part A, and each hull point costs that.
    expect(sim.partA(base)).toBe(0);
    expect(ship.hull).toBe(93);
    expect(sim.canRepair(ship)).toBe(false);
    ship.hull = 50;
    run(sim, 1);
    expect(ship.hull).toBeLessThanOrEqual(53);
  });

  it("is what a defender is built from", () => {
    const { sim } = world({ defenders: 0, trafficRacers: 1, stationStartParts: 30, defenderPrice: 500 }, { items: [] });
    const base = sim.bases[0];
    (sim as unknown as { removeShip(ship: Ship): void }).removeShip(sim.traffic[0].ship);
    run(sim, 1);
    expect(sim.fighters.some((pilot) => pilot.ship.faction === "defender" && pilot.ship.home === base.id)).toBe(true);
    // 500 credits of parts is 25 parts A, spent whole.
    expect(sim.partA(base)).toBe(5);
  });

  it("is what a drone is bought with", () => {
    const { sim, outpost } = world({ dronePrice: 400, stationStartParts: 30, droneLimit: 5 }, { items: [] });
    const { ship } = sim;
    const base = sim.bases[1];
    ship.credits = 10000;
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    expect(sim.buyDrone(ship)).not.toBeNull();
    expect(sim.partA(base)).toBe(10);
  });

  it("is what a project is built from", () => {
    const { sim, outpost } = world({ depositPrice: 1000, depositParts: 5, depositBuildRate: 100, stationStartParts: 40 }, { items: [], projects: true });
    const { ship } = sim;
    const base = sim.bases[1];
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    expect(sim.fundBlueprint(ship, "deposit")).toBe(true);
    run(sim, 1);
    expect(sim.unlocked("deposit", base)).toBe(true);
    expect(sim.partA(base)).toBe(35);
  });

  it("buys a module with none in store by spending its recipe", () => {
    const { sim, outpost } = world({ stationStartParts: 100 }, { items: [] });
    const { ship } = sim;
    const base = sim.bases[1];
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    const recipe = recipeFor("reverse")!;
    expect(sim.buyPart(ship, "reverse")).toBe(true);
    expect(sim.partA(base)).toBe(100 - recipe.from[0].n);
  });

  it("runs a recipe that yields more than one whole, and puts the spare in the store", () => {
    const keep = itemsFileNow();
    const edited = JSON.parse(JSON.stringify(keep)) as ItemsFile;
    const reverse = edited.items.find((item) => item.id === "reverse")!;
    reverse.recipe = { from: [{ item: PART_A, n: 3 }], yields: 2 };
    try {
      useItemsFile(edited);
      const { sim, outpost } = world({ stationStartParts: 100 }, { items: [] });
      const { ship } = sim;
      const base = sim.bases[1];
      ship.credits = 100000;
      dockAt(sim, ship, outpost);
      run(sim, 0.1);
      const parts = counted(sim, PART_A);
      const partsFlow = sim.itemFlow.get(PART_A) ?? 0;
      expect(sim.buyPart(ship, "reverse")).toBe(true);
      // One run takes three part A and makes two: the buyer gets one, the store the other.
      expect(ship.parts.has("reverse")).toBe(true);
      expect(sim.partA(base)).toBe(100 - 3);
      expect(sim.stockOf(base, "reverse")).toBe(1);
      expect((sim.itemFlow.get(PART_A) ?? 0) - partsFlow).toBe(-3);
      expect(counted(sim, PART_A)).toBe(parts - 3);
      // What the run made is counted as made, so the store's spare is no gift from nowhere.
      expect(sim.itemFlow.get("reverse" as PartId)).toBe(2);
    } finally {
      useItemsFile(keep);
    }
  });
});

describe("the blueprint lists", () => {
  it("sells a module only where it's unlocked, and orders only one the station wants", () => {
    const { sim, outpost } = world({ stationUnlocks: true, stationCashBuffer: 1e9 }, { unlocked: ["gun2"], wanted: ["reverse"] });
    const { ship } = sim;
    const base = sim.bases[1];
    ship.credits = 100000;
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    expect(sim.unlocked("gun2", base)).toBe(true);
    expect(sim.unlocked("reverse", base)).toBe(false);
    expect(sim.buyPart(ship, "gun2")).toBe(true);
    expect(sim.buyPart(ship, "reverse")).toBe(false);
    // Nothing can be paid toward a module the station doesn't want, whatever it may afford.
    expect(sim.fundBlueprint(ship, "strafe")).toBe(false);
    expect(sim.fundBlueprint(ship, "reverse")).toBe(true);
    expect(base.blueprintsOrdered.has("reverse")).toBe(true);
    // Its shop lists what it sells, has ordered or wants, and leaves the rest out.
    expect(sim.shopLists("gun2", base)).toBe(true);
    expect(sim.shopLists("reverse", base)).toBe(true);
    expect(sim.shopLists("strafe", base)).toBe(false);
  });

  it("has every shipped station want every module but the all-round tractor", () => {
    const { sim } = world();
    useLayout(shippedWorld(), linkTo(sim));
    expect(sim.bases.length).toBeGreaterThan(1);
    for (const base of sim.bases) {
      for (const item of ITEMS.filter((each) => each.type === "module")) {
        expect(base.wanted.has(item.id as PartId)).toBe(item.id !== "tractorAll");
      }
    }
  });

  it("prices a blueprint at the module item's own blueprint price", () => {
    const { sim } = world();
    const price = itemDef("navComputer")!.blueprintPrice;
    expect(sim.blueprintPrice("navComputer")).toBe(price);
    expect(price).toBe(900);
  });
});

describe("what a hauler brings", () => {
  it("brings only part A to a station that sells modules made of nothing else", () => {
    const { sim } = world({ stationStartParts: 0, stationPartsTarget: 6 }, { unlocked: ["gun2"], wanted: [] });
    const base = sim.bases[1];
    const brought = (sim as unknown as { loadFromHub(one: Sim["bases"][number]): Map<PartId, number> }).loadFromHub(base);
    expect([...brought.keys()]).toEqual([PART_A]);
    expect(brought.get(PART_A)).toBe(6);
  });
});

describe("saving", () => {
  it("round-trips items in a bay, a locker, a store, a hauler, the hub and loose, and the ledger", () => {
    const { sim, outpost } = world({ haulers: true, haulerFirst: 1 });
    const { ship } = sim;
    const base = sim.bases[1];
    dockAt(sim, ship, outpost);
    run(sim, 0.1);
    // The hauler's visit happens first: anything in the bay at a dock is sold.
    run(sim, 200);
    expect(base.hauler).not.toBeNull();
    ship.hold.push(sim.holdSpotFor(ship, { part: ORE, wear: 0 })!);
    expect(sim.putInLocker(base, { part: PART, wear: 0 })).toBe(true);
    sim.stockItem(base, PART, 2);
    base.stock.set(ORE, 3);
    sim.hub.set(ORE, 1);
    sim.hub.set(PART, 2);
    sim.ores.push(loose(PLAIN, ship.x + 500, ship.y));
    sim.loot.push(loose(ORE, ship.x + 400, ship.y));
    sim.itemFlow.set(ORE, 4);
    base.hauler!.items.set(PART, 2);
    base.hauler!.items.set(ORE, 1);
    const { sim: into } = world({ haulers: true, haulerFirst: 1 });
    roundTrip(sim, into);
    expect(into.hub).toEqual(sim.hub);
    expect(into.itemFlow).toEqual(sim.itemFlow);
    expect(into.bases[1].stock).toEqual(sim.bases[1].stock);
    expect(into.bases[1].ore).toEqual(sim.bases[1].ore);
    expect(into.bases[1].hauler!.items).toEqual(sim.bases[1].hauler!.items);
    expect(into.ores.map((ore) => ore.item)).toEqual(sim.ores.map((ore) => ore.item));
    expect(into.loot.map((loot) => loot.item)).toEqual(sim.loot.map((loot) => loot.item));
    expect(into.ship.hold.map((placed) => placed.module.part)).toEqual([ORE]);
    for (const id of [ORE, PART, PLAIN, PART_A]) expect(counted(into, id)).toBe(counted(sim, id));
  });
});

describe("a field that falls asleep", () => {
  it("keeps loose ore where it was, none made twice or lost without the ledger seeing it", () => {
    const { sim } = world({}, {}, null);
    rockInFar(sim);
    const field = sim.miningFields().find((each) => each.id === "far:0")!;
    const start = counted(sim, PLAIN);
    while (sim.ores.length === 0) {
      const rock = sim.rocks.find((each) => sim.miningFieldAt(each.x, each.y).id === field.id);
      if (!rock) break;
      sim.breakRock(rock);
    }
    const dropped = sim.ores.length;
    expect(dropped).toBeGreaterThan(0);
    expect(counted(sim, PLAIN)).toBe(start + (sim.itemFlow.get(PLAIN) ?? 0));
    // The player goes home, far off: the field sleeps.
    dockAt(sim, sim.ship, sim.station);
    run(sim, 600);
    expect(sim.sleeping.has("far:0")).toBe(true);
    expect(counted(sim, PLAIN)).toBe(start + (sim.itemFlow.get(PLAIN) ?? 0));
    expect(sim.ores.length).toBeLessThanOrEqual(dropped);
  }, 60000);
});

describe("conservation", () => {
  // A driver for the player: flies through whatever drops, sells it at the base, and buys a tractor
  // when part B has come round. Nothing but the listed holes (starting stock) may change what's there.
  for (const seed of [1, 2, 3, 4]) {
    it(`counts every ore, part and module for two game hours (seed ${seed})`, () => {
      const holes = [{ item: "partB", n: 2 }];
      const { sim, outpost } = world({ haulers: true, haulerFirst: 5, haulerInterval: 300 }, { items: holes }, [{ item: "oreB", chance: 1 }], seed);
      const base = sim.bases[1];
      const watched = [PLAIN, PART_A, ORE, PART];
      const start = new Map(watched.map((id) => [id, counted(sim, id)]));
      expect(start.get(PART)).toBe(2);
      const field = sim.miningFields().find((each) => each.id === "far:0")!;
      let sold = 0;
      let bought = 0;
      const second = Math.round(1 / TICK);
      for (let tick = 0; tick < 2 * 3600 * 120; tick++) {
        sim.step();
        sim.events.length = 0;
        if (tick % (second * 3) !== 0) continue;
        const { ship } = sim;
        ship.hull = 100;
        if (sim.oreIn(ship) > 0) {
          dockAt(sim, ship, outpost);
          run(sim, 0.1);
          sold += sim.oreIn(ship);
          while (ship.hold.length > 0 && sim.sellItem(ship, { at: "hold", index: 0 })) {
            /* sold */
          }
          if (bought === 0 && sim.canSupply(base, "tractorAll")) {
            ship.credits = Math.max(ship.credits, 700);
            if (sim.buyPart(ship, "tractorAll")) bought++;
          }
        } else if (sim.ores.length > 0) {
          const target = sim.ores.find((each) => Math.hypot(each.x - field.poi.x, each.y - field.poi.y) < field.radius * 3);
          if (target) {
            ship.x = ship.px = target.x;
            ship.y = ship.py = target.y;
            ship.vx = ship.vy = 0;
          }
        } else {
          ship.x = ship.px = field.poi.x;
          ship.y = ship.py = field.poi.y;
          ship.vx = ship.vy = 0;
          const rock = sim.rocks.find((each) => sim.miningFieldAt(each.x, each.y).id === "far:0");
          if (rock) sim.breakRock(rock, ship);
        }
        if (tick % (second * 300) === 0) {
          for (const id of watched) expect(counted(sim, id), `${id} at ${Math.round(sim.now)}s`).toBe(start.get(id)! + (sim.itemFlow.get(id) ?? 0));
        }
      }
      for (const id of watched) expect(counted(sim, id), id).toBe(start.get(id)! + (sim.itemFlow.get(id) ?? 0));
      // The run did something: ore was mined, sold, hauled, made into parts, and the tractor sold.
      expect(sold).toBeGreaterThan(0);
      expect(bought).toBe(1);
      expect(sim.itemFlow.get(PART) ?? 0).toBeGreaterThan(0);
    }, 300000);
  }
});
