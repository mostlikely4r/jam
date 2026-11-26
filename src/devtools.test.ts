import { afterEach, describe, expect, it } from "vitest";
import { homeSim } from "./home";
import { copyHull, HULL_INFO, HULL_MOUNTS, hullName, shipFileNow, useShipFile } from "./fitting";
import { SHIP_MODELS } from "./parts";
import { DEFAULTS } from "./tuning";
import { Sim } from "./sim";

// The dev panel's tools, `docs/dev-tools-plan.md` (Q-28, S-62): programs and a hull switch in the
// tab menu, fitting in flight, and a hull's name in the hull designer.

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

/** The hull file as shipped, put back after a test that renames a hull or copies one. */
const shipped = shipFileNow();
afterEach(() => useShipFile(shipped));

/** The player in a racer (or a floater), out in space, away from every dock. */
function flight(model: "racer" | "floater" = "racer"): Sim {
  const sim = homeSim(1, { ...WORLD, floaterStart: model === "floater" });
  expect(sim.isDocked()).toBe(false);
  return sim;
}

describe("fitting anywhere (the dev switch)", () => {
  it("fits a part from the bay onto a mount in flight, and what comes off lands in the bay", () => {
    const sim = flight();
    const { ship } = sim;
    expect(ship.fit.gun!.part).toBe("gun1");
    expect(sim.placeInBay(ship, "gun2")).toBe(1);
    // Off, as it always was: fitting is done in a dock.
    expect(sim.fitItem(ship, { at: "hold", index: 0 })).toBe(false);
    expect(ship.fit.gun!.part).toBe("gun1");
    expect(ship.hold.map((item) => item.module.part)).toEqual(["gun2"]);
    // On: the same call swaps them, and the gun that came off goes in the bay.
    sim.tuning.fitAnywhere = true;
    expect(sim.fitItem(ship, { at: "hold", index: 0 })).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun2");
    expect(ship.hold.map((item) => item.module.part)).toEqual(["gun1"]);
  });

  it("takes a part off a mount into the bay in flight, unless the bay has no room", () => {
    const sim = flight();
    const { ship } = sim;
    expect(sim.toHold(ship, { at: "mount", mount: "gun" })).toBe(false);
    sim.tuning.fitAnywhere = true;
    sim.setOre(ship, 100);
    expect(sim.cargoSpace(ship)).toBe(0);
    expect(sim.toHold(ship, { at: "mount", mount: "gun" })).toBe(false);
    expect(ship.fit.gun!.part).toBe("gun1");
    sim.setOre(ship, 0);
    expect(sim.toHold(ship, { at: "mount", mount: "gun" })).toBe(true);
    expect(ship.hold.map((item) => item.module.part)).toEqual(["gun1"]);
  });

  it("loads and unloads programs in flight, and keeps the program either way", () => {
    const sim = flight();
    const { ship } = sim;
    sim.devSet(ship, "meters", true);
    expect(ship.programs).toContain("meters");
    expect(sim.setProgram(ship, "meters", false)).toBe(false);
    expect(ship.programs).toContain("meters");
    sim.tuning.fitAnywhere = true;
    expect(sim.setProgram(ship, "meters", false)).toBe(true);
    expect(ship.programs).not.toContain("meters");
    expect(ship.software.has("meters")).toBe(true);
    expect(sim.setProgram(ship, "meters", true)).toBe(true);
    expect(ship.programs).toContain("meters");
  });

  it("leaves everything as it was when a swap in flight has nowhere for what comes off", () => {
    const sim = flight();
    const { ship } = sim;
    sim.tuning.fitAnywhere = true;
    sim.devSet(ship, "largeTank", true);
    expect(ship.fit.tankLeft!.part).toBe("largeTank");
    // A little tank in the bay, and every other cell full of ore: the big tank can't go back in.
    expect(sim.placeInBay(ship, "smallTank")).toBe(1);
    sim.setOre(ship, 100);
    expect(sim.cargoSpace(ship)).toBe(0);
    const index = ship.hold.findIndex((item) => item.module.part === "smallTank");
    const before = JSON.stringify([ship.fit, ship.hold]);
    const loose = sim.loot.length;
    expect(sim.fitItem(ship, { at: "hold", index }, "tankLeft")).toBe(false);
    expect(JSON.stringify([ship.fit, ship.hold])).toBe(before);
    expect(sim.loot.length).toBe(loose);
  });

  it("leaves the pilotless world alone: only the player's own ship takes the switch", () => {
    const sim = flight();
    sim.tuning.fitAnywhere = true;
    expect(sim.fitsHere(sim.ship)).toBe(true);
    expect(sim.atShop(sim.ship)).toBe(false);
  });
});

describe("the dev panel's hull switch", () => {
  it("flies any hull anywhere, for nothing, and keeps the parts that fit the new one", () => {
    const sim = flight();
    const { ship } = sim;
    // A part neither hull comes with, on a mount both have.
    sim.devSet(ship, "clamp", true);
    expect(ship.fit.tractor!.part).toBe("clamp");
    expect(sim.placeInBay(ship, "ore", 2)).toBe(2);
    const credits = ship.credits;
    expect(sim.devChangeHull(ship, "floater")).toBeNull();
    expect(ship.model).toBe("floater");
    expect(ship.credits).toBe(credits);
    expect(ship.fit.tractor!.part).toBe("clamp");
    expect(ship.fit.gun!.part).toBe("gun2");
    expect(sim.oreIn(ship)).toBe(2);
  });

  it("switches to the hull the station would never sell, and names the hull already flown", () => {
    const sim = flight();
    const { ship } = sim;
    // The racer isn't a hull the station's list has to hold for the switch to work.
    expect(sim.devChangeHull(ship, "defender")).toBeNull();
    expect(ship.model).toBe("defender");
    expect(sim.devChangeHull(ship, "defender")).toBe("You fly one already");
  });

  it("drops what the new hull, its bay and a locker here have no room for", () => {
    const sim = flight("floater");
    const { ship } = sim;
    // A turret on the floater's gun mount: nothing on the racer takes one.
    sim.devSet(ship, "turret", true);
    expect(ship.fit.gun!.part).toBe("turret");
    // The bay full, so it can't wait there either.
    sim.setOre(ship, 100);
    expect(sim.cargoSpace(ship)).toBe(0);
    const plan = sim.planHull(ship, "racer", true);
    expect("refused" in plan).toBe(false);
    // The turret and the gun riding on it: nothing on the racer takes either.
    const dropped = "refused" in plan ? [] : plan.dropped.map((module) => module.part).sort();
    expect(dropped).toEqual(["gun1", "turret"]);
    // Pulling the switch leaves them adrift beside the ship rather than refusing the hull.
    const loose = sim.loot.length;
    expect(sim.devChangeHull(ship, "racer")).toBeNull();
    expect(ship.model).toBe("racer");
    // The gun the turret carried lands on the racer's gun mount; the racer's own gun is the one dropped.
    expect(ship.fit.gun!.part).toBe("gun2");
    expect(sim.loot.length).toBe(loose + dropped.length);
  });
});

describe("a hull's name", () => {
  it("is the one the file gives it, and its id in words without one", () => {
    expect(hullName("racer")).toBe("Racer");
    HULL_INFO.racer.name = "Snub Nose";
    expect(hullName("racer")).toBe("Snub Nose");
    delete HULL_INFO.racer.name;
    expect(hullName("racer")).toBe("Racer");
    expect(hullName("racerCopy2")).toBe("Racer Copy2");
  });

  it("comes from the file, trimmed, and an empty one means the id's words", () => {
    const file = shipFileNow();
    file.hullInfo!.racer.name = "  Windhover  ";
    useShipFile(file);
    expect(hullName("racer")).toBe("Windhover");
    file.hullInfo!.racer.name = "";
    useShipFile(file);
    expect(hullName("racer")).toBe("Racer");
  });

  it("isn't passed on to a copy of a hull", () => {
    const file = shipFileNow();
    file.hullInfo!.floater.name = "Kite";
    useShipFile(file);
    // A name of its own for the scratch copy, so it can't collide with a hull the file ships.
    copyHull("floater", "floaterCopy2");
    expect(SHIP_MODELS).toContain("floaterCopy2");
    expect(HULL_MOUNTS.floaterCopy2.length).toBeGreaterThan(0);
    expect(hullName("floaterCopy2")).toBe("Floater Copy2");
  });
});
