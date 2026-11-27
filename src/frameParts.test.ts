import { describe, expect, it } from "vitest";
import { frameMountSpot, framePartRefusal, override, partOn, placeParts, resolveParts } from "./frameParts";
import { hullMounts } from "./fitting";
import { homeSim } from "./home";
import { dockOf, hasPart, padOf, shopData, type Sim } from "./sim";
import { DEFAULTS } from "./tuning";
import { changeStation, parseWorld, stationSettings, stringifyWorld, walk } from "./designer/world";

/** A quiet home: no traffic, pirates or haulers, the deposit and its turrets free to have. */
const QUIET = {
  ...DEFAULTS,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  haulers: false,
  stationStartCredits: 1000,
  depositGap: 300,
  depositReach: 150,
  depositCapacity: 300,
  depositPays: 3,
  depositSells: 7,
  depositDropChance: 0,
};

function quiet(extra: Partial<typeof QUIET> = {}): Sim {
  const sim = homeSim(1, { ...QUIET, ...extra });
  sim.step();
  return sim;
}

function moveTo(sim: Sim, x: number, y: number): void {
  Object.assign(sim.ship, { x, y, px: x, py: y, vx: 0, vy: 0 });
}

describe("frame parts", () => {
  it("put the dock, pads and berths on the frames exactly where the code had them", () => {
    // The old constants: the dock box beside the deck, the refinery pad opposite, the block pad
    // off the dock's line, the hauler's berth along the far side, and the black market's out past the pirates' ring.
    expect(frameMountSpot("station", "dock")).toEqual({ x: 300, y: 0 });
    expect(frameMountSpot("station", "refinery pad")).toEqual({ x: -300, y: 0 });
    expect(frameMountSpot("station", "block pad")).toEqual({ x: 300, y: 300 });
    expect(frameMountSpot("station", "berth")).toEqual({ x: -240, y: 0 });
    const berth = frameMountSpot("pirateBase", "berth")!;
    expect(Math.hypot(berth.x, berth.y)).toBe(270);
    const station = resolveParts("station");
    expect(partOn(station, "dock")?.data).toEqual({ shape: "box", size: 150 });
    expect(partOn(resolveParts("pirateBase"), "dock")?.data).toEqual({ shape: "ring", size: 200 });
    expect(partOn(resolveParts("deposit"), "dock")).toBeUndefined();
  });

  it("give each frame only the parts it has: no field for what it doesn't do", () => {
    const kinds = (model: string) => resolveParts(model).map((part) => part.kind).sort();
    expect(kinds("station")).toEqual(["battery", "dock", "refinery", "repair", "shipyard", "shop", "storage", "trade"]);
    expect(kinds("pirateBase")).toEqual(["blackMarket", "dock", "storage", "trade"]);
    expect(kinds("deposit")).toEqual(["battery", "storage", "trade"]);
  });

  it("refuse a thin part on any frame but its owner's, in the fit check and in the sim's parts", () => {
    const shopMount = { types: ["shop"] };
    expect(framePartRefusal("station", shopMount, "shop")).toBeNull();
    expect(framePartRefusal("deposit", shopMount, "shop")).toBe("Station only for now");
    expect(framePartRefusal("pirateBase", { types: ["black market"] }, "blackMarket")).toBeNull();
    expect(framePartRefusal("station", { types: ["black market"] }, "blackMarket")).toBe("Pirate base only for now");
    // A mount has to take it, and a ship's hull is no frame.
    expect(framePartRefusal("station", { types: ["dock"] }, "shop")).toBe("Needs a shop mount");
    expect(framePartRefusal("racer", shopMount, "shop")).toBe("Frames only for now");
    // A place that tries one anyway gets nothing on that mount.
    const mount = hullMounts("deposit")[0].id;
    expect(partOn(resolveParts("deposit", { [mount]: override("shop") }), "shop")).toBeUndefined();
  });

  it("lay a place's overrides over the frame's parts: data on top, or the mount left empty", () => {
    const parts = resolveParts("station", placeParts({ storage: 80, shipyard: false, projects: true, guards: { count: 2 } }));
    expect(partOn(parts, "storage")?.data).toEqual({ cells: 80 });
    expect(partOn(parts, "shipyard")).toBeUndefined();
    expect(partOn(parts, "projects")).toBeDefined();
    expect(partOn(parts, "battery")?.data).toEqual({ count: 2 });
    // The frame's own data stays under a place's: the dock is the frame's.
    expect(partOn(parts, "dock")?.data).toEqual({ shape: "box", size: 150 });
  });
});

describe("capabilities", () => {
  it("a station whose frame has no dock part can't be docked at", () => {
    const sim = quiet();
    const station = sim.bases[0].body;
    const dock = sim.dockPoint(false, station);
    moveTo(sim, dock.x, dock.y);
    expect(sim.dockedAt()).toBe(station);
    station.parts = station.parts.filter((part) => part.kind !== "dock");
    expect(dockOf(station)).toBeNull();
    expect(sim.docks).not.toContain(station);
    expect(sim.dockedAt()).toBeNull();
  });

  it("a deposit buys ore from a miner and sells it to a ship through its trade point, at today's prices", () => {
    const sim = quiet({ depositFree: true });
    sim.step();
    const deposit = sim.deposits[0];
    expect(hasPart(deposit, "trade")).toBe(true);
    moveTo(sim, deposit.x, deposit.y);
    sim.setOre(sim.ship, 10);
    sim.ship.credits = 100;
    expect(sim.sellToDeposit(sim.ship, deposit)).toBe(10);
    expect(sim.ship.credits).toBe(130);
    expect(sim.buyFromDeposit(sim.ship, deposit)).toBe(10);
    expect(sim.ship.credits).toBe(60);
    // Without its trade point it does neither.
    deposit.parts = deposit.parts.filter((part) => part.kind !== "trade");
    expect(sim.sellToDeposit(sim.ship, deposit)).toBe(0);
    sim.setOre(sim.ship, 0);
    deposit.ore.set("ore", 5);
    expect(sim.buyFromDeposit(sim.ship, deposit)).toBe(0);
  });

  it("a station whose frame has no turret battery gets no turrets", () => {
    const sim = quiet({ guardsStationFree: true });
    sim.step();
    expect(sim.batteries.some((battery) => battery.id === "stationGuards")).toBe(true);
    const other = quiet();
    other.bases[0].body.parts = other.bases[0].body.parts.filter((part) => part.kind !== "battery");
    other.tuning.guardsStationFree = true;
    other.step();
    expect(other.batteries.some((battery) => battery.id === "stationGuards")).toBe(false);
  });

  it("a station without a refinery part catches no rocks, and one without a shop sells nothing", () => {
    const sim = quiet();
    const base = sim.bases[0];
    expect(sim.refines(base)).toBe(true);
    base.body.parts = base.body.parts.filter((part) => part.kind !== "refinery" && part.kind !== "shop");
    expect(sim.refines(base)).toBe(false);
    expect(shopData(base.body).unlocked).toEqual([]);
    expect(sim.sellsProgram(base, "retro")).toBe(false);
    // What it had unlocked before is no longer for sale either.
    expect(base.blueprints.has("gun2")).toBe(true);
    expect(sim.unlocked("gun2", base)).toBe(false);
    expect(padOf(base.body, "refinery pad")).toEqual({ x: -300, y: 0 });
  });
});

describe("the pirate base's parts", () => {
  it("the black market only calls where the pirate base has its part", () => {
    const run = (keep: boolean) => {
      const sim = quiet({ pirates: 1, blackMarketInterval: 1 });
      const base = sim.pirateBase!;
      if (!keep) base.parts = base.parts.filter((part) => part.kind !== "blackMarket");
      // Due now, rather than after the usual wait.
      sim.blackMarketTimer = 0;
      for (let i = 0; i < 600; i++) sim.step();
      return sim.blackMarket !== null;
    };
    expect(run(true)).toBe(true);
    expect(run(false)).toBe(false);
  });
});

describe("a station node's parts", () => {
  it("reads a world saved with loose station fields into overrides that say the same", () => {
    const old = {
      version: 1,
      root: {
        id: "star", name: "Star", kind: "star", children: [
          { id: "s", name: "Outpost", kind: "station", frame: "station", shipyard: false, storage: 300, unlocked: ["gun2"], projects: true, guardCount: 2, children: [] },
        ],
      },
    };
    const world = parseWorld(JSON.stringify(old))!;
    const [, { node }] = walk(world);
    expect(node.parts).toEqual({
      shipyard: null,
      projects: { part: "projects" },
      storage: { part: "storage", cells: 300 },
      shop: { part: "shop", unlocked: ["gun2"] },
      turrets: { part: "battery", count: 2 },
    });
    expect(stationSettings(node)).toMatchObject({ shipyard: false, storage: 300, unlocked: ["gun2"], projects: true, radio: false, guardCount: 2 });
    // And writes them back as parts, never as loose fields.
    const text = stringifyWorld(world);
    expect(text).toContain('"parts"');
    expect(text).not.toContain('"shipyard": false');
    expect(text).not.toContain('"guardCount"');
    changeStation(node, { shipyard: true, guardCount: DEFAULTS.stationGuardCount });
    expect(node.parts.shipyard).toBeUndefined();
    expect(node.parts.turrets).toBeUndefined();
  });
});
