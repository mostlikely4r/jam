import { afterEach, describe, expect, it } from "vitest";
import { homeSim } from "./home";
import { copyHull, HULL_INFO, HULL_MOUNTS, hullDefaults, hullMax, refresh, shipFileNow, useShipFile } from "./fitting";
import { type PartId, type ShipModel } from "./parts";
import { roundTrip } from "./save";
import { DEFAULTS } from "./tuning";
import { DOCK_OFFSET, type HullPlan, Sim } from "./sim";

// Hull buying, `docs/hull-buying-plan.md` step 2.

const WORLD = {
  ...DEFAULTS,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  rockCount: 0,
  stationStartParts: 100000,
  stationStorage: 1000000,
  stationUnlocks: false,
};

/** The hull file as shipped, put back after a test that draws a hull of its own or prices one. */
const shipped = shipFileNow();
afterEach(() => useShipFile(shipped));

/** A player in a racer (or a floater) docked at the home station, which sells these hulls. */
function docked(model: "racer" | "floater", hulls: ShipModel[]): Sim {
  const sim = homeSim(1, { ...WORLD, floaterStart: model === "floater" });
  sim.ship.x = sim.ship.px = sim.station.x + DOCK_OFFSET;
  sim.ship.y = sim.ship.py = sim.station.y;
  sim.ship.credits = 10000;
  sim.shopBase().spec.hulls = hulls;
  return sim;
}

function plan(sim: Sim, model: ShipModel): HullPlan {
  const out = sim.planHull(sim.ship, model);
  if ("refused" in out) throw new Error(`refused: ${out.refused}`);
  return out;
}

/** Fills the player's locker here with ore, a cell at a time, until nothing more goes in. */
function fillLocker(sim: Sim): void {
  const base = sim.baseAt()!;
  while (sim.putInLocker(base, { part: "ore" as PartId, wear: 0 }));
}

/** A copy of the floater with its mounts renamed, so nothing of a racer's lines up by id. */
function renamedFloater(): ShipModel {
  copyHull("floater", "testHull");
  for (const mount of HULL_MOUNTS.testHull) {
    if (mount.id === "thrusterReverse") mount.id = "aft";
    if (mount.id === "gun") mount.id = "nose";
  }
  return "testHull";
}

describe("buying a hull", () => {
  it("costs the new hull less the old one, the station's parts building one and taking the other back", () => {
    const sim = docked("racer", ["floater"]);
    HULL_INFO.floater.price = 1500;
    HULL_INFO.racer.price = 900;
    const base = sim.shopBase();
    const credits = sim.ship.credits;
    const stationCredits = base.account.credits;
    expect(plan(sim, "floater").net).toBe(600);
    expect(sim.buyHull(sim.ship, "floater")).toBe(true);
    expect(sim.ship.model).toBe("floater");
    expect(sim.ship.credits).toBe(credits - 600);
    expect(base.account.credits).toBe(stationCredits + 600);
    // Cheaper the other way, and the difference comes back.
    base.spec.hulls = ["racer"];
    expect(sim.buyHull(sim.ship, "racer")).toBe(true);
    expect(sim.ship.credits).toBe(credits);
  });

  it("is refused without the credits for the difference", () => {
    const sim = docked("racer", ["floater"]);
    HULL_INFO.floater.price = 1500;
    HULL_INFO.racer.price = 900;
    sim.ship.credits = 599;
    expect(sim.buyHull(sim.ship, "floater")).toBe(false);
    expect(sim.buyRefused).toBe("Not enough credits");
    expect(sim.ship.model).toBe("racer");
  });

  it("trades the old hull's own gear in with it: a plain racer becomes a plain floater, and the locker stays empty", () => {
    const sim = docked("racer", ["floater"]);
    const out = plan(sim, "floater");
    expect(out.moved).toEqual([]);
    expect(out.locker).toEqual([]);
    expect(sim.buyHull(sim.ship, "floater")).toBe(true);
    const parts = Object.fromEntries(Object.entries(sim.ship.fit).map(([mount, module]) => [mount, module!.part]));
    expect(parts).toEqual(hullDefaults("floater"));
    expect(sim.lockerAt(sim.baseAt()!).items).toEqual([]);
    expect(sim.ship.hull).toBe(hullMax("floater"));
  });

  it("moves your own parts onto the mount with the same id, keeping their wear, and a default pushed off goes to the locker", () => {
    const sim = docked("racer", ["floater"]);
    const { ship } = sim;
    ship.fit.thrusterReverse = { part: "reverse", wear: 0.3 };
    ship.fit.computer = { part: "navComputer", wear: 0.1 };
    refresh(ship);
    expect(sim.buyHull(ship, "floater")).toBe(true);
    expect(ship.fit.thrusterReverse).toEqual({ part: "reverse", wear: 0.3 });
    expect(ship.fit.computer).toEqual({ part: "navComputer", wear: 0.1 });
    // The floater's own computer is yours now, in the locker.
    expect(sim.lockerAt(sim.baseAt()!).items.map((each) => each.module.part)).toEqual(["flightComputer"]);
  });

  it("moves a part by its mount's role when no mount has its id, then onto any mount that takes it", () => {
    const sim = docked("racer", [renamedFloater()]);
    const { ship } = sim;
    ship.fit.thrusterReverse = { part: "reverse", wear: 0 };
    ship.fit.gun = { part: "gun2", wear: 0.2 };
    refresh(ship);
    const out = plan(sim, "testHull");
    expect(out.moved).toHaveLength(2);
    expect(out.moved).toContainEqual({ part: "reverse", from: "thrusterReverse", to: "aft" });
    expect(out.moved).toContainEqual({ part: "gun2", from: "gun", to: "nose" });
    expect(sim.buyHull(ship, "testHull")).toBe(true);
    expect(ship.fit.nose).toEqual({ part: "gun2", wear: 0.2 });
    // The floater copy's own gun2 was pushed off: it's yours, in the locker.
    expect(sim.lockerAt(sim.baseAt()!).items.map((each) => each.module.part)).toEqual(["gun2"]);
  });

  it("puts a part no mount takes into the locker", () => {
    const sim = docked("floater", ["racer"]);
    const { ship } = sim;
    // Only the floater's gun mount takes a turret.
    ship.fit.gun = { part: "turret", wear: 0 };
    refresh(ship);
    expect(sim.buyHull(ship, "racer")).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun1");
    expect(sim.lockerAt(sim.baseAt()!).items.map((each) => each.module.part)).toEqual(["turret"]);
  });

  it("puts what the locker has no room for in the new bay, and refuses when that's full too", () => {
    const sim = docked("racer", ["floater"]);
    const { ship } = sim;
    ship.fit.computer = { part: "navComputer", wear: 0 };
    refresh(ship);
    fillLocker(sim);
    const out = plan(sim, "floater");
    expect(out.bay).toEqual(["flightComputer"]);
    expect(out.hold.map((each) => each.module.part)).toContain("flightComputer");
    // With the bay full of ore as well, there is nowhere for it.
    sim.setOre(ship, sim.cargoSpace(ship));
    expect(sim.buyHull(ship, "floater")).toBe(false);
    expect(sim.buyRefused).toBe("No room for the Flight computer in your locker here or the new bay");
    expect(ship.model).toBe("racer");
    expect(ship.fit.computer!.part).toBe("navComputer");
  });

  it("keeps your cargo in the new bay, and refuses a hull with no bay for it until you unload", () => {
    const sim = docked("racer", ["floater"]);
    const { ship } = sim;
    sim.setOre(ship, 3);
    expect(sim.buyHull(ship, "floater")).toBe(true);
    expect(sim.oreIn(ship)).toBe(3);
    // A hull with no bay: the cargo goes to the locker, and with the locker full there's no sale.
    copyHull("racer", "noBay");
    HULL_MOUNTS.noBay.splice(HULL_MOUNTS.noBay.findIndex((mount) => mount.id === "section"), 1);
    sim.shopBase().spec.hulls = ["noBay"];
    expect(plan(sim, "noBay").locker.filter((each) => each.module.part === "ore")).toHaveLength(3);
    fillLocker(sim);
    expect(sim.buyHull(ship, "noBay")).toBe(false);
    expect(sim.buyRefused).toBe("No room for your cargo in the new bay or your locker here: unload first");
  });

  it("keeps a moved tank's fuel, and pours the old hull's own into the new hull's own", () => {
    const sim = docked("racer", ["floater"]);
    const { ship } = sim;
    ship.fit.tankLeft = { part: "mediumTank", wear: 0 };
    refresh(ship);
    ship.tankFuel = { tankLeft: 7, tankRight: 3 };
    ship.fuel = 10;
    expect(sim.buyHull(ship, "floater")).toBe(true);
    expect(ship.fit.tankLeft!.part).toBe("mediumTank");
    expect(ship.tankFuel.tankLeft).toBe(7);
    expect(ship.tankFuel.tankRight).toBe(3);
    expect(ship.fuel).toBe(10);
  });

  it("keeps every program, loading as many as the new computer has slots for", () => {
    const sim = docked("floater", ["racer"]);
    const { ship } = sim;
    for (const id of ["spinStabilizer", "targeting", "meters", "relativeLines"] as PartId[]) sim.giveProgram(ship, id);
    const owned = [...ship.software];
    expect(ship.programs.length).toBeGreaterThan(2);
    expect(plan(sim, "racer").unloaded).toEqual(ship.programs.slice(2));
    expect(sim.buyHull(ship, "racer")).toBe(true);
    expect(ship.programs).toHaveLength(2);
    expect([...ship.software]).toEqual(owned);
  });

  it("puts your turret on the new hull and your gun back on it", () => {
    copyHull("floater", "turretHull");
    const sim = docked("floater", ["turretHull"]);
    const { ship } = sim;
    ship.fit.gun = { part: "turret", wear: 0 };
    ship.fit.turretGun = { part: "gun1", wear: 0.1 };
    refresh(ship);
    expect(sim.buyHull(ship, "turretHull")).toBe(true);
    expect(ship.fit.gun!.part).toBe("turret");
    expect(ship.fit.turretGun).toEqual({ part: "gun1", wear: 0.1 });
    // The new hull's own gun was pushed off by the turret: it's yours, in the locker.
    expect(sim.lockerAt(sim.baseAt()!).items.map((each) => each.module.part)).toEqual(["gun2"]);
  });

  it("isn't offered by a station without the hull on its list, nor away from a dock", () => {
    const sim = docked("racer", []);
    expect(sim.hullsSold()).toEqual([]);
    expect(sim.planHull(sim.ship, "floater")).toEqual({ refused: "Not sold here" });
    sim.shopBase().spec.hulls = ["floater", "racer"];
    expect(sim.planHull(sim.ship, "racer")).toEqual({ refused: "You fly one already" });
    sim.ship.x += 5000;
    expect(sim.planHull(sim.ship, "floater")).toEqual({ refused: "Only in a dock" });
  });

  it("is kept by a save", () => {
    const sim = docked("racer", ["floater"]);
    sim.ship.fit.thrusterReverse = { part: "reverse", wear: 0.3 };
    refresh(sim.ship);
    expect(sim.buyHull(sim.ship, "floater")).toBe(true);
    const into = homeSim(2, { ...WORLD });
    roundTrip(sim, into);
    expect(into.ship.model).toBe("floater");
    expect(into.ship.fit.thrusterReverse).toEqual({ part: "reverse", wear: 0.3 });
  });
});
