import { describe, expect, it } from "vitest";
import { mountsFor, newFitting, refresh } from "./fitting";
import { DEFAULTS } from "./tuning";
import { partOf as partOfForTest } from "./parts";
import { DOCK_OFFSET, Sim } from "./sim";

const WORLD = {
  ...DEFAULTS,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  rockCount: 0,
  stationStartParts: 100000,
  stationUnlocks: false,
};

function docked(model: "racer" | "floater"): Sim {
  const sim = new Sim(1, { ...WORLD, floaterStart: model === "floater" });
  sim.ship.x = sim.ship.px = sim.station.x + DOCK_OFFSET;
  sim.ship.y = sim.ship.py = sim.station.y;
  sim.ship.credits = 10000;
  return sim;
}

describe("mounts", () => {
  it("each hull comes with three of its six thrusters, a gun and a computer", () => {
    const racer = newFitting("racer");
    expect(Object.keys(racer.fit).sort()).toEqual(
      ["computer", "gun", "thrusterMain", "thrusterRotateLeft", "thrusterRotateRight"].sort(),
    );
    expect(racer.fit.computer!.part).toBe("basicComputer");
    expect(newFitting("floater").fit.computer!.part).toBe("flightComputer");
  });

  it("the racer can fit the floater's thruster, not the other way round", () => {
    expect(mountsFor({ ...newFitting("racer"), model: "racer" }, "floaterMain")).toEqual(["thrusterMain"]);
    expect(mountsFor({ ...newFitting("floater"), model: "floater" }, "racerMain")).toEqual([]);
  });

  it("only the floater's gun mount takes a turret", () => {
    expect(mountsFor({ ...newFitting("racer"), model: "racer" }, "turret")).toEqual([]);
    expect(mountsFor({ ...newFitting("floater"), model: "floater" }, "turret")).toEqual(["gun"]);
  });
});

describe("the shop fits what it sells", () => {
  it("a new gun puts the old one in the locker, and selling it puts the old one back on", () => {
    const sim = docked("racer");
    const { ship } = sim;
    const base = sim.baseAt()!;
    expect(sim.buyPart(ship, "gun2")).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun2");
    expect(ship.credits).toBe(10000 - sim.partPrice("gun2"));
    expect(sim.lockerAt(base).map((item) => item.part)).toEqual(["gun1"]);
    expect(sim.sellPart(ship, "gun2")).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun1");
    expect(sim.lockerAt(base)).toEqual([]);
    expect(ship.credits).toBe(10000);
  });

  it("AI ships sell back what comes off instead", () => {
    const sim = new Sim(1, { ...WORLD, floaterStart: false, trafficRacers: 1 });
    const { ship } = sim.traffic[0];
    ship.x = ship.px = sim.station.x + DOCK_OFFSET;
    ship.y = ship.py = sim.station.y;
    ship.credits = 1000;
    const base = sim.baseAt(ship)!;
    expect(sim.buyPart(ship, "gun2")).toBe(true);
    expect(sim.stockOf(base, "gun1")).toBe(1);
    expect(ship.credits).toBe(1000 - sim.partPrice("gun2") + sim.partPrice("gun1"));
    expect(sim.lockers.size).toBe(0);
  });

  it("a turret takes the gun onto itself, and gives it back when it goes", () => {
    const sim = docked("floater");
    const { ship } = sim;
    expect(sim.buyPart(ship, "turret")).toBe(true);
    expect(ship.fit.gun!.part).toBe("turret");
    expect(ship.fit.turretGun!.part).toBe("gun2");
    expect(sim.sellPart(ship, "turret")).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun2");
    expect(ship.fit.turretGun).toBeUndefined();
  });

  it("strafe thrusters come as a pair, one on each side", () => {
    const sim = docked("racer");
    sim.buyPart(sim.ship, "strafe");
    expect(sim.ship.fit.thrusterStrafeLeft!.part).toBe("strafe");
    expect(sim.ship.fit.thrusterStrafeRight!.part).toBe("strafe");
  });
});

describe("the computer", () => {
  it("runs only as many programs as it has slots; the rest are kept", () => {
    const sim = docked("racer");
    const { ship } = sim;
    for (const id of ["spinStabilizer", "meters", "retro"] as const) expect(sim.buyPart(ship, id)).toBe(true);
    expect(ship.programs).toEqual(["spinStabilizer", "meters"]);
    expect(ship.software.has("retro")).toBe(true);
    expect(ship.parts.has("retro")).toBe(false);
    expect(sim.setProgram(ship, "meters", false)).toBe(true);
    expect(sim.setProgram(ship, "retro", true)).toBe(true);
    expect(ship.parts.has("retro")).toBe(true);
  });

  it("a bigger computer runs more, and a smaller one sheds what no longer fits", () => {
    const sim = docked("racer");
    const { ship } = sim;
    for (const id of ["spinStabilizer", "meters", "retro"] as const) sim.buyPart(ship, id);
    sim.buyPart(ship, "flightComputer");
    sim.setProgram(ship, "retro", true);
    expect(ship.programs.length).toBe(3);
    sim.sellPart(ship, "flightComputer");
    expect(ship.fit.computer!.part).toBe("basicComputer");
    expect(ship.programs.length).toBe(2);
    expect(ship.software.size).toBe(3);
  });
});

describe("module damage", () => {
  it("a hit wears the module nearest where it lands; half worn it stops, worn out it's destroyed", () => {
    const sim = docked("racer");
    const { ship } = sim;
    ship.angle = 0;
    // A hit on the nose lands on the gun.
    sim.damageModule(ship, 14, 0, sim.tuning.moduleToughness / 2);
    expect(ship.fit.gun!.wear).toBeCloseTo(0.5, 9);
    expect(ship.parts.has("gun1")).toBe(false);
    expect(sim.crippled(ship)).toBe(true);
    sim.damageModule(ship, 14, 0, sim.tuning.moduleToughness);
    expect(ship.fit.gun!.wear).toBe(1);
    // Once it's gone, the next hit there finds the next nearest.
    sim.damageModule(ship, 14, 0, 1);
    expect(ship.fit.tractor ?? ship.fit.thrusterRotateLeft).toBeDefined();
  });

  it("a ship without a working gun can't fire", () => {
    const sim = docked("racer");
    sim.ship.x += 2000;
    sim.ship.fit.gun!.wear = 1;
    refresh(sim.ship);
    sim.controls.fire = true;
    sim.step();
    expect(sim.shots.length).toBe(0);
  });

  it("a broken thruster doesn't fire", () => {
    const sim = docked("racer");
    sim.ship.x += 2000;
    sim.ship.fit.thrusterMain!.wear = 0.6;
    refresh(sim.ship);
    sim.controls.thrust = 1;
    sim.step();
    expect(sim.ship.firing.has("thrusterMain")).toBe(false);
  });

  it("the dock repairs worn modules, then replaces destroyed ones, for a price", () => {
    const sim = docked("racer");
    const { ship } = sim;
    ship.fit.gun!.wear = 1;
    ship.fit.thrusterRotateLeft!.wear = 0.6;
    const before = ship.credits;
    for (let i = 0; i < 120 * 60 && sim.canRepair(ship); i++) sim.step();
    expect(ship.fit.gun!.wear).toBe(0);
    expect(ship.fit.thrusterRotateLeft!.wear).toBe(0);
    expect(ship.parts.has("gun1")).toBe(true);
    expect(ship.credits).toBeLessThan(before - sim.partPrice("gun1") + 1);
  });

  it("a destroyed bay spills what no longer fits", () => {
    const sim = docked("racer");
    const { ship } = sim;
    ship.x += 2000;
    sim.devSet(ship, "bay", true);
    ship.ore = sim.cargoSpace(ship);
    const full = ship.ore;
    ship.angle = 0;
    sim.damageModule(ship, -30, 0, 1000);
    expect(ship.fit.section!.wear).toBe(1);
    expect(ship.ore).toBe(sim.cargoSpace(ship));
    expect(sim.ores.length).toBe(full - ship.ore);
  });
});

describe("items as counted things", () => {
  it("a module sold to a base goes into its store, and the next buyer gets that one", () => {
    const sim = docked("racer");
    const { ship } = sim;
    const base = sim.baseAt()!;
    sim.buyPart(ship, "reverse");
    expect(sim.sellPart(ship, "reverse")).toBe(true);
    expect(sim.stockOf(base, "reverse")).toBe(1);
    const parts = base.parts;
    expect(sim.buyPart(ship, "reverse")).toBe(true);
    expect(sim.stockOf(base, "reverse")).toBe(0);
    // Sold from the store: none of the base's parts went into it.
    expect(base.parts).toBe(parts);
  });

  it("modules ride in the bay and take room from the ore", () => {
    const sim = docked("racer");
    const { ship } = sim;
    const room = sim.cargoSpace(ship);
    sim.buyPart(ship, "gun2");
    expect(sim.toHold(ship, { at: "locker", index: 0 })).toBe(true);
    expect(ship.hold.map((item) => item.part)).toEqual(["gun1"]);
    expect(sim.cargoSpace(ship)).toBe(room - 6);
  });

  it("what's left at a base stays there; other bases have their own lockers", () => {
    const sim = docked("racer");
    const { ship } = sim;
    const base = sim.baseAt()!;
    sim.buyPart(ship, "strafe");
    expect(sim.toLocker(ship, { at: "mount", mount: "thrusterStrafeLeft" })).toBe(true);
    expect(sim.lockerAt(base).length).toBe(1);
    ship.x += 3000;
    expect(sim.toLocker(ship, { at: "mount", mount: "thrusterStrafeRight" })).toBe(false);
    expect(sim.itemAt(ship, { at: "locker", index: 0 })).toBeNull();
  });

  it("a pair is fitted from the locker as a pair", () => {
    const sim = docked("racer");
    const { ship } = sim;
    sim.buyPart(ship, "strafe");
    sim.toLocker(ship, { at: "mount", mount: "thrusterStrafeLeft" });
    expect(sim.fitItem(ship, { at: "locker", index: 0 })).toBe(false);
    sim.toLocker(ship, { at: "mount", mount: "thrusterStrafeRight" });
    expect(sim.fitItem(ship, { at: "locker", index: 0 })).toBe(true);
    expect(ship.parts.has("strafe")).toBe(true);
    expect(sim.lockerAt(sim.baseAt()!)).toEqual([]);
  });

  it("a dropped module drifts, and flying through it picks it up", () => {
    const sim = docked("racer");
    const { ship } = sim;
    sim.buyPart(ship, "gun2");
    sim.toHold(ship, { at: "locker", index: 0 });
    ship.x += 3000;
    ship.px = ship.x;
    expect(sim.dropItem(ship, 0)).toBe(true);
    expect(sim.loot.length).toBe(1);
    const loot = sim.loot[0];
    loot.x = loot.px = ship.x + 5;
    loot.y = loot.py = ship.y;
    loot.vx = ship.vx;
    loot.vy = ship.vy;
    sim.step();
    expect(sim.loot.length).toBe(0);
    expect(ship.hold.map((item) => item.part)).toEqual(["gun1"]);
  });
});

describe("critical, the pod and the yard", () => {
  /** A racer out in the open, away from the dock, with a bay and a strafe pair fitted. */
  function outThere(): Sim {
    const sim = docked("racer");
    const { ship } = sim;
    sim.buyPart(ship, "strafe");
    sim.buyPart(ship, "bay");
    sim.buyPart(ship, "spinStabilizer");
    ship.x = ship.px = ship.x + 2500;
    sim.step();
    return sim;
  }

  function wreck(sim: Sim): void {
    sim.ship.hull = 1;
    sim.damageModule(sim.ship, 0, 0, 0);
    // The hull gives out to a knock against nothing in particular.
    (sim as unknown as { wreckShip(ship: unknown): void }).wreckShip(sim.ship);
  }

  it("a ship whose hull gives out loses control, launches its pod, and explodes after a while", () => {
    const sim = outThere();
    wreck(sim);
    expect(sim.ship.critical).toBeGreaterThan(0);
    expect(sim.down?.stage).toBe("pod");
    expect(sim.down?.exploded).toBe(false);
    sim.controls.thrust = 1;
    sim.step();
    expect(sim.ship.firing.size).toBe(0);
    for (let i = 0; i < 120 * 3; i++) sim.step();
    expect(sim.down?.exploded).toBe(true);
    expect(sim.ship.critical).toBe(0);
  });

  it("what came through whole is left drifting; destroyed parts are gone; programs stay with the pilot", () => {
    const sim = outThere();
    const { ship } = sim;
    ship.fit.thrusterStrafeLeft!.wear = 1;
    wreck(sim);
    for (let i = 0; i < 120 * 3; i++) sim.step();
    const drifting = sim.loot.map((loot) => loot.item.part).sort();
    expect(drifting).toContain("bay");
    expect(drifting.filter((id) => id === "strafe").length).toBe(1);
    expect(ship.software.has("spinStabilizer")).toBe(true);
  });

  it("the pod flies itself to the yard, and there it's a bare hull now or a rebuild that takes a while", () => {
    const sim = outThere();
    const before = sim.ship.credits;
    wreck(sim);
    for (let i = 0; i < 120 * 60 && sim.down?.stage === "pod"; i++) sim.step();
    expect(sim.down?.stage).toBe("choosing");
    const offer = sim.rebuildOffer();
    expect(offer.missing).toEqual([]);
    expect(offer.cost).toBe(sim.tuning.rebuildCost + sim.partPrice("strafe") + sim.partPrice("bay"));
    expect(sim.chooseHull(true)).toBe(true);
    expect(sim.down?.stage).toBe("rebuilding");
    for (let i = 0; i < 120 * (offer.seconds + 1) && sim.down; i++) sim.step();
    expect(sim.down).toBeNull();
    expect(sim.ship.fit.section!.part).toBe("bay");
    expect(sim.ship.parts.has("strafe")).toBe(true);
    expect(sim.ship.parts.has("spinStabilizer")).toBe(true);
    expect(sim.isDocked()).toBe(true);
    expect(sim.ship.credits).toBe(before - offer.cost);
  });

  it("a bare hull is the hull's own gear and nothing more", () => {
    const sim = outThere();
    wreck(sim);
    for (let i = 0; i < 120 * 60 && sim.down?.stage !== "choosing"; i++) sim.step();
    expect(sim.chooseHull(false)).toBe(true);
    expect(sim.down).toBeNull();
    expect(Object.keys(sim.ship.fit).sort()).toEqual(Object.keys(newFitting("racer").fit).sort());
    expect(sim.ship.parts.has("spinStabilizer")).toBe(true);
  });

  it("a rebuild needs the store to be able to supply every part", () => {
    const sim = outThere();
    wreck(sim);
    for (let i = 0; i < 120 * 60 && sim.down?.stage !== "choosing"; i++) sim.step();
    sim.bases[0].parts = 0;
    expect(sim.rebuildOffer().missing.length).toBeGreaterThan(0);
    expect(sim.chooseHull(true)).toBe(false);
  });

  it("a pirate stops counting a ship that's going up as a threat", () => {
    const sim = outThere();
    sim.ship.ore = 5;
    wreck(sim);
    expect(sim.threatens({ ...sim.ship, faction: "pirate", hull: 100 } as never, sim.ship)).toBe(false);
  });

  it("explosive modules go up with the ship and take the rest with them", () => {
    const sim = outThere();
    partOfForTest("bay").explosive = 1000;
    try {
      wreck(sim);
      for (let i = 0; i < 120 * 3; i++) sim.step();
      expect(sim.loot.length).toBe(0);
    } finally {
      delete partOfForTest("bay").explosive;
    }
  });
});
