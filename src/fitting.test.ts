import { describe, expect, it } from "vitest";
import { decalChoices, decalOf, HULL_INFO, HULL_MOUNTS, HULL_USES, hullDefaults, hullMax, isDecal, MAX_HULL, mountOf, mountsFor, mountTakes, newFitting, refresh, resetPartStats, shipFileNow, thrustOf, useShipFile } from "./fitting";
import { SHIP_MODELS, type PartId } from "./parts";
import { bayBox, drawVectorShip } from "./shipArt";
import { DEFAULTS } from "./tuning";
import { partOf as partOfForTest } from "./parts";
import { DOCK_OFFSET, SHIP_RADIUS, Sim } from "./sim";

/** How much ore an empty bay of this part holds, at one ore per cell. */
const bayCells = (id: "smallBay" | "bay" | "largeBay") => partOfForTest(id).bay!.w * partOfForTest(id).bay!.h;

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

/**
 * Buys a part and fits it, the way the player swaps one on now that a buy never swaps: buy,
 * then fit it from the bay or locker it went to. What comes off goes where it came from.
 */
function buyAndFit(sim: Sim, id: PartId): boolean {
  const { ship } = sim;
  const goes = sim.whereBuyGoes(ship, id);
  if (!sim.buyPart(ship, id)) return false;
  if (goes === "mount") return true;
  const index = goes === "hold" ? ship.hold.length - 1 : sim.lockerAt(sim.baseAt()!).items.length - 1;
  return sim.fitItem(ship, { at: goes!, index });
}

function docked(model: "racer" | "floater"): Sim {
  const sim = new Sim(1, { ...WORLD, floaterStart: model === "floater" });
  sim.ship.x = sim.ship.px = sim.station.x + DOCK_OFFSET;
  sim.ship.y = sim.ship.py = sim.station.y;
  sim.ship.credits = 10000;
  return sim;
}

describe("mounts", () => {
  it("each hull comes with three of its six thrusters, a gun, a computer and its small bay", () => {
    const racer = newFitting("racer");
    expect(Object.keys(racer.fit).sort()).toEqual(
      ["computer", "gun", "section", "thrusterMain", "thrusterRotateLeft", "thrusterRotateRight"].sort(),
    );
    expect(racer.fit.computer!.part).toBe("basicComputer");
    expect(racer.fit.section!.part).toBe("smallBay");
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
  it("a new gun fitted from the bay leaves the old one there, and selling it puts the old one back on", () => {
    const sim = docked("racer");
    const { ship } = sim;
    expect(buyAndFit(sim, "gun2")).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun2");
    expect(ship.credits).toBe(10000 - sim.partPrice("gun2"));
    expect(ship.hold.map((item) => item.module.part)).toEqual(["gun1"]);
    expect(sim.sellPart(ship, "gun2")).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun1");
    expect(ship.hold).toEqual([]);
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
    expect(buyAndFit(sim, "turret")).toBe(true);
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
    buyAndFit(sim, "flightComputer");
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
    // Right on the bay, inside the hull.
    const bay = HULL_MOUNTS.racer.find((mount) => mount.id === "section")!;
    sim.damageModule(ship, bay.x * SHIP_RADIUS, bay.y * SHIP_RADIUS, 1000);
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
    expect(sim.buyPart(ship, "gun2")).toBe(true);
    expect(ship.hold.map((item) => item.module.part)).toEqual(["gun2"]);
    expect(sim.cargoSpace(ship)).toBe(room - 2);
    expect(sim.toLocker(ship, { at: "hold", index: 0 })).toBe(true);
    expect(sim.cargoSpace(ship)).toBe(room);
  });

  it("what's left at a base stays there; other bases have their own lockers", () => {
    const sim = docked("racer");
    const { ship } = sim;
    const base = sim.baseAt()!;
    sim.buyPart(ship, "strafe");
    expect(sim.toLocker(ship, { at: "mount", mount: "thrusterStrafeLeft" })).toBe(true);
    expect(sim.lockerAt(base).items.length).toBe(1);
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
    expect(sim.lockerAt(sim.baseAt()!).items).toEqual([]);
  });

  it("a dropped module drifts, and flying through it picks it up", () => {
    const sim = docked("racer");
    const { ship } = sim;
    sim.buyPart(ship, "gun2");
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
    expect(ship.hold.map((item) => item.module.part)).toEqual(["gun2"]);
  });
});

describe("critical, the pod and the yard", () => {
  /** A racer out in the open, away from the dock, with a bay and a strafe pair fitted. */
  function outThere(): Sim {
    const sim = docked("racer");
    const { ship } = sim;
    sim.buyPart(ship, "strafe");
    buyAndFit(sim, "bay");
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

  it("the pod pops out and drifts clear while the ship goes up, and is still flying once the wreck's been watched", () => {
    const sim = outThere();
    const { x, y } = sim.ship;
    wreck(sim);
    // Ship critical, then the wreck watch: the pod is out there to be seen, a little way off.
    for (let i = 0; i < 120 * (sim.tuning.criticalSeconds + 2.6); i++) sim.step();
    const down = sim.down!;
    expect(down.exploded).toBe(true);
    expect(down.stage).toBe("pod");
    const off = Math.hypot(down.x - x, down.y - y);
    expect(off).toBeGreaterThan(50);
    expect(off).toBeLessThan(1500);
    // Then it sets out, and the flight takes long enough to watch.
    for (let i = 0; i < 120 * 4; i++) sim.step();
    expect(sim.down?.stage).toBe("pod");
    expect(sim.down!.path.length).toBeGreaterThan(1);
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

describe("turned mounts", () => {
  /** Runs `body` with the racer's mounts changed, and puts them back after. */
  function withPlaces(change: () => void, body: () => void): void {
    const was = shipFileNow();
    try {
      change();
      body();
    } finally {
      useShipFile(was);
    }
  }

  function flying(): Sim {
    const sim = docked("racer");
    sim.ship.x += 2000;
    sim.ship.angle = sim.ship.prevAngle = 0;
    sim.ship.vx = sim.ship.vy = sim.ship.spin = 0;
    return sim;
  }

  it("as shipped, the thrusters push and turn as they were tuned", () => {
    for (const model of ["racer", "floater"] as const) {
      const thrust = thrustOf({ ...newFitting(model), model });
      for (const role of ["thrusterReverse", "thrusterStrafeLeft", "thrusterStrafeRight"] as const) expect(thrust.has.has(role)).toBe(false);
      // Every thruster on, to see what each mount would do.
      const full = { ...newFitting(model), model };
      for (const mount of HULL_MOUNTS[model]) if (mount.role && !full.fit[mount.id]) full.fit[mount.id] = { part: "reverse", wear: 0 };
      Object.assign(thrust, thrustOf(full));
      expect(thrust.push.thrusterMain).toEqual({ x: 1, y: 0 });
      expect(thrust.push.thrusterReverse).toEqual({ x: -1, y: 0 });
      expect(thrust.push.thrusterStrafeRight!.x).toBeCloseTo(0, 12);
      expect(thrust.push.thrusterStrafeRight!.y).toBe(1);
      expect(thrust.turn.thrusterRotateLeft).toBeCloseTo(1, 9);
      expect(thrust.turn.thrusterRotateRight).toBeCloseTo(1, 9);
    }
  });

  it("a main thruster turned to flame out to the left pushes the ship right", () => {
    withPlaces(
      () => (mountOf("racer", "thrusterMain")!.angle = -90),
      () => {
        // Against one coasting, so whatever else pulls on it cancels out.
        const coasting = flying();
        coasting.step();
        const sim = flying();
        sim.controls.thrust = 1;
        sim.step();
        expect(sim.ship.vy - coasting.ship.vy).toBeGreaterThan(0.1);
        expect(Math.abs(sim.ship.vx - coasting.ship.vx)).toBeLessThan((sim.ship.vy - coasting.ship.vy) * 0.01);
      },
    );
  });

  it("a turn thruster turned right round turns the ship the other way", () => {
    withPlaces(
      () => (mountOf("racer", "thrusterRotateRight")!.angle = -90),
      () => {
        const sim = flying();
        sim.controls.turn = 1;
        sim.step();
        expect(sim.ship.spin).toBeLessThan(0);
      },
    );
  });

  it("a turn thruster moved in closer to the middle turns the ship slower", () => {
    const sim = flying();
    sim.controls.turn = 1;
    sim.step();
    const full = sim.ship.spin;
    withPlaces(
      () => (mountOf("racer", "thrusterRotateRight")!.x = -0.35),
      () => {
        const closer = flying();
        closer.controls.turn = 1;
        closer.step();
        expect(closer.ship.spin).toBeCloseTo(full / 2, 9);
      },
    );
  });

  it("a gun turned to the right fires to the right", () => {
    withPlaces(
      () => (mountOf("racer", "gun")!.angle = 90),
      () => {
        const sim = flying();
        sim.controls.fire = true;
        sim.step();
        const shot = sim.shots[0];
        expect(shot.vy).toBeGreaterThan(Math.abs(shot.vx) * 10);
        expect(shot.y).toBeGreaterThan(sim.ship.y + SHIP_RADIUS);
      },
    );
  });

  it("a second main thruster mount, fitted, pushes as hard again", () => {
    const sim = flying();
    sim.controls.thrust = 1;
    sim.step();
    const one = sim.ship.vx;
    withPlaces(
      () => HULL_MOUNTS.racer.push({ ...mountOf("racer", "thrusterMain")!, id: "mainTwo", name: "Second main", y: 0.3 }),
      () => {
        const twin = flying();
        twin.ship.fit.mainTwo = { part: "racerMain", wear: 0 };
        refresh(twin.ship);
        twin.controls.thrust = 1;
        twin.step();
        expect(twin.ship.vx).toBeCloseTo(one * 2, 6);
      },
    );
  });

  it("a part goes on any mount that supports one of the mount types it fits", () => {
    const racer = { ...newFitting("racer"), model: "racer" as const };
    expect(mountsFor(racer, "bay")).toEqual(["section"]);
    withPlaces(
      () => {
        mountOf("racer", "section")!.types = [];
        mountOf("racer", "tractor")!.types.push("cargo bay");
      },
      () => expect(mountsFor(racer, "bay")).toEqual(["tractor"]),
    );
  });

  it("two gun mounts with guns on both fire two shots", () => {
    withPlaces(
      () => HULL_MOUNTS.racer.push({ ...mountOf("racer", "gun")!, id: "gunTwo", name: "Second gun", y: 0.4 }),
      () => {
        const sim = flying();
        sim.ship.fit.gunTwo = { part: "gun1", wear: 0 };
        refresh(sim.ship);
        sim.controls.fire = true;
        sim.step();
        expect(sim.shots.length).toBe(2);
      },
    );
  });

  it("taking a mount away puts what was on it into the ship's bay", () => {
    const sim = docked("racer");
    withPlaces(
      () => HULL_MOUNTS.racer.splice(HULL_MOUNTS.racer.indexOf(mountOf("racer", "gun")!), 1),
      () => {
        sim.tidyMounts();
        expect(sim.ship.fit.gun).toBeUndefined();
        expect(sim.ship.hold.map((item) => item.module.part)).toContain("gun1");
      },
    );
  });

  it("a fitted cargo bay replaces the small one a hull comes with", () => {
    const sim = docked("racer");
    expect(sim.bayTotal(sim.ship)).toBe(bayCells("smallBay"));
    sim.ship.fit.section = { part: "bay", wear: 0 };
    refresh(sim.ship);
    expect(sim.bayTotal(sim.ship)).toBe(bayCells("bay"));
  });

  it("a hull without a bay carries nothing at all", () => {
    const sim = docked("racer");
    delete sim.ship.fit.section;
    refresh(sim.ship);
    expect(sim.bayTotal(sim.ship)).toBe(0);
    expect(sim.cargoSpace(sim.ship)).toBe(0);
  });
});

describe("hulls, defaults and decals", () => {
  /** Runs `body` with the ship file changed, and puts it back after. */
  function withFile(change: () => void, body: () => void): void {
    const was = shipFileNow();
    try {
      change();
      body();
    } finally {
      useShipFile(was);
    }
  }

  it("has a defender, a drone and a pirate hull beside the racer and the floater", () => {
    expect([...SHIP_MODELS].sort()).toEqual(["defender", "drone", "floater", "pirate", "racer"]);
    for (const model of SHIP_MODELS) {
      expect(HULL_MOUNTS[model].length).toBeGreaterThan(6);
      expect(newFitting(model).fit.thrusterMain).toBeDefined();
      expect(newFitting(model).fit.computer).toBeDefined();
    }
  });

  it("each mount's own default part is what a bare hull comes with", () => {
    expect(hullDefaults("racer")).toEqual({
      thrusterMain: "racerMain",
      thrusterRotateLeft: "turnThrusters",
      thrusterRotateRight: "turnThrusters",
      gun: "gun1",
      computer: "basicComputer",
      section: "smallBay",
    });
    withFile(
      () => (mountOf("racer", "gun")!.default = "gun2"),
      () => expect(newFitting("racer").fit.gun!.part).toBe("gun2"),
    );
    // A default that no longer fits its mount is left off.
    withFile(
      () => (mountOf("racer", "gun")!.default = "bay"),
      () => expect(newFitting("racer").fit.gun).toBeUndefined(),
    );
  });

  it("a hull's computer comes with its default programs, as far as it has slots", () => {
    expect([...newFitting("floater").software].sort()).toEqual(["clickMove", "clickTurn"]);
    expect([...newFitting("floater").programs].sort()).toEqual(["clickMove", "clickTurn"]);
    expect(newFitting("racer").software.size).toBe(0);
    withFile(
      () => (HULL_INFO.racer.programs = ["spinStabilizer", "meters", "retro"]),
      () => {
        const racer = newFitting("racer");
        expect(racer.software.size).toBe(3);
        // The basic computer runs two.
        expect(racer.programs).toEqual(["spinStabilizer", "meters"]);
      },
    );
  });

  it("the new game's ship is given the floater's programs by its hull", () => {
    const sim = docked("floater");
    expect(sim.ship.software.has("clickMove")).toBe(true);
    expect(sim.ship.programs).toContain("clickTurn");
  });

  it("keeps what each hull is used for", () => {
    expect(HULL_INFO.racer.usedBy).toContain("newGame");
    expect(HULL_INFO.pirate.usedBy).toEqual(["pirate"]);
    expect(HULL_USES).toEqual(["newGame", "sold", "traffic", "defender", "pirate", "drone"]);
    withFile(
      () => (HULL_INFO.drone.usedBy = ["drone", "traffic"]),
      () => {
        const file = shipFileNow();
        expect(file.hullInfo!.drone.usedBy).toEqual(["drone", "traffic"]);
        useShipFile(file);
        expect(HULL_INFO.drone.usedBy).toEqual(["drone", "traffic"]);
      },
    );
  });

  it("a decal mount shows a random decal part that fits it, and takes nothing real", () => {
    expect(isDecal("cockpitKite")).toBe(true);
    expect(isDecal("gun1")).toBe(false);
    const cockpit = mountOf("floater", "cockpit")!;
    expect(cockpit.decal).toBe(true);
    expect(decalChoices("floater", cockpit).sort()).toEqual(["cockpitBar", "cockpitDome", "cockpitKite", "cockpitVisor"]);
    // The racer's cockpit takes the small ones only.
    expect(decalChoices("racer", mountOf("racer", "cockpit")!).sort()).toEqual(["cockpitDome", "cockpitKite", "cockpitVisor"]);
    // Nothing real is fitted to it, and no decal goes on a real mount.
    expect(mountTakes(cockpit, "gun1")).toBe(false);
    expect(mountTakes(mountOf("floater", "gun")!, "cockpitKite")).toBe(false);
    expect(mountsFor({ ...newFitting("racer"), model: "racer" }, "cockpitKite")).toEqual([]);
    // Ships are given different ones.
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(newFitting("floater").decals!.cockpit!);
    expect(seen.size).toBeGreaterThan(1);
    // The same random numbers, the same look.
    const draws = () => {
      let n = 0;
      return () => [0.1, 0.4, 0.7, 0.95][n++ % 4];
    };
    expect(newFitting("floater", draws()).decals).toEqual(newFitting("floater", draws()).decals);
    expect(newFitting("floater", () => 0).decals!.cockpit).not.toBe(newFitting("floater", () => 0.99).decals!.cockpit);
  });

  it("a ship without a decal of its own, such as one from an old save, shows the first that fits", () => {
    const racer = { model: "racer" as const, fit: {} };
    const first = decalChoices("racer", mountOf("racer", "cockpit")!)[0];
    expect(decalOf(racer, mountOf("racer", "cockpit")!)).toBe(first);
    // And one that no longer fits is replaced.
    expect(decalOf({ ...racer, decals: { cockpit: "cockpitBar" } }, mountOf("racer", "cockpit")!)).toBe(first);
  });

  it("a mount flagged as a decal stops taking real parts", () => {
    withFile(
      () => (mountOf("floater", "gun")!.decal = true),
      () => {
        expect(mountTakes(mountOf("floater", "gun")!, "gun1")).toBe(false);
        expect(decalChoices("floater", mountOf("floater", "gun")!)).toEqual([]);
      },
    );
  });

  it("a bare hull keeps its look, and decal mounts aren't loose ends when mounts are tidied", () => {
    const sim = docked("racer");
    const look = sim.ship.decals!.cockpit;
    sim.tidyMounts();
    expect(sim.ship.hold).toEqual([]);
    expect(sim.ship.decals!.cockpit).toBe(look);
    // The shop's blueprints are only real gear.
    expect(sim.blueprintQueue().some((id) => String(id).startsWith("cockpit"))).toBe(false);
  });

  it("draws every hull, with its decals, without trouble", () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_target, name: string) => {
        if (name === "createRadialGradient") return () => ({ addColorStop() {} });
        return () => void calls.push(name);
      },
      set: () => true,
    });
    for (const model of SHIP_MODELS) {
      const ship = { ...newFitting(model), model };
      expect(() => drawVectorShip(ctx, ship, [120, 150, 190])).not.toThrow();
    }
    expect(calls).toContain("ellipse");
  });
});

describe("mounts as they draw in game", () => {
  /** Runs `body` with the ship file changed, and puts it back after. */
  function withFile(change: () => void, body: () => void): void {
    const was = shipFileNow();
    try {
      change();
      body();
    } finally {
      useShipFile(was);
    }
  }

  it("a mount's transparency and draw order carry through a ship file round trip", () => {
    withFile(
      () => {
        const gun = mountOf("racer", "gun")!;
        gun.alpha = 0.5;
        gun.order = -1;
        // A mount at rest keeps neither: they're only kept when they say something.
        delete mountOf("racer", "computer")!.alpha;
        delete mountOf("racer", "computer")!.order;
      },
      () => {
        const file = shipFileNow();
        expect(file.hulls.racer.find((mount) => mount.id === "gun")).toMatchObject({ alpha: 0.5, order: -1 });
        useShipFile(file);
        expect(mountOf("racer", "gun")).toMatchObject({ alpha: 0.5, order: -1 });
        expect(file.hulls.racer.find((mount) => mount.id === "computer")).not.toHaveProperty("alpha");
        expect(file.hulls.racer.find((mount) => mount.id === "computer")).not.toHaveProperty("order");
      },
    );
  });

  it("draws a mount under the hull when its order is below zero, and see-through when it's faded", () => {
    const calls: string[] = [];
    let alpha = 1;
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_target, name: string) => {
        if (name === "createRadialGradient") return () => ({ addColorStop() {} });
        if (name === "globalAlpha") return alpha;
        return () => void calls.push(name);
      },
      set: (_target, name: string, value) => {
        if (name === "globalAlpha") alpha = value as number;
        return true;
      },
    });
    withFile(
      () => {
        mountOf("racer", "gun")!.order = -1;
        mountOf("racer", "thrusterMain")!.alpha = 0.5;
      },
      () => {
        const ship = { ...newFitting("racer"), model: "racer" as const };
        drawVectorShip(ctx, ship, [120, 150, 190]);
        // The gun went under the hull: it drew before the hull's own path.
        expect(calls.indexOf("translate")).toBeLessThan(calls.indexOf("clip"));
        // A faded part draws see-through.
        expect(alpha).toBeCloseTo(0.5, 5);
      },
    );
  });

  it("a cargo bay takes its mount's transparency", () => {
    const spot = HULL_MOUNTS.racer.find((mount) => mount.types.includes("cargo bay"))!;
    withFile(
      () => (spot.alpha = 0.4),
      () => expect(bayBox({ ...newFitting("racer"), model: "racer" as const }).alpha).toBeCloseTo(0.4, 5),
    );
  });
});

describe("the stats of hulls and parts", () => {
  /** Runs `body` with the ship file changed, and puts it back after. */
  function withFile(change: () => void, body: () => void): void {
    const was = shipFileNow();
    try {
      change();
      body();
    } finally {
      useShipFile(was);
    }
  }

  it("a hull falls back on the game's own stats until it has its own", () => {
    expect(hullMax("racer")).toBe(MAX_HULL);
    expect(hullMax("floater")).toBe(MAX_HULL);
    withFile(
      () => (HULL_INFO.racer.hull = 250),
      () => {
        expect(hullMax("racer")).toBe(250);
        const file = shipFileNow();
        expect(file.hullInfo!.racer.hull).toBe(250);
        useShipFile(file);
        expect(hullMax("racer")).toBe(250);
        // A file without the stat clears it again.
        useShipFile({ ...file, hullInfo: { ...file.hullInfo!, racer: { programs: [], usedBy: [] } } });
        expect(hullMax("racer")).toBe(MAX_HULL);
      },
    );
  });

  it("a hull's price and weight are its own, over the game's tuning", () => {
    const sim = docked("racer");
    const weight = sim.shipWeight(sim.ship);
    expect(sim.hullPrice("racer")).toBe(DEFAULTS.rebuildCost);
    withFile(
      () => {
        HULL_INFO.racer.price = 999;
        HULL_INFO.racer.weight = 3;
      },
      () => {
        expect(sim.hullPrice("racer")).toBe(999);
        expect(sim.shipWeight(sim.ship)).toBeCloseTo(weight + 2, 5);
      },
    );
  });

  it("a part's edited stats carry in the ship file, and reset to the code's when it's thrown away", () => {
    const coded = partOfForTest("bay").price;
    withFile(
      () => (partOfForTest("bay").price = coded + 50),
      () => {
        expect(partOfForTest("bay").price).toBe(coded + 50);
        const file = shipFileNow();
        expect(file.partStats!.bay).toEqual({ price: coded + 50 });
        // Putting the file in play keeps the change; resetting the part puts the code's back.
        useShipFile(file);
        expect(partOfForTest("bay").price).toBe(coded + 50);
        resetPartStats("bay");
        expect(partOfForTest("bay").price).toBe(coded);
        expect(shipFileNow().partStats!.bay).toBeUndefined();
        // What the parts' code ships is left alone until a stat is changed.
        expect(shipFileNow().partStats).toEqual({});
      },
    );
  });
});

describe("the bay's grid", () => {
  /** A docked racer with its small bay (5 by 2, entry at the top middle) and a spare gun in its locker. */
  function withSpareGun(): Sim {
    const sim = docked("racer");
    sim.ship.ore = 0;
    for (let i = 0; i < 2; i++) sim.putInLocker(sim.baseAt()!, { part: "gun2", wear: 0 });
    return sim;
  }

  it("an item takes exactly its cells from the ore's room, and a sealed pocket takes its own too", () => {
    const sim = withSpareGun();
    const { ship } = sim;
    expect(sim.cargoSpace(ship)).toBe(10);
    expect(sim.toHold(ship, { at: "locker", index: 0 }, { x: 0, y: 0, turned: false })).toBe(true);
    expect(sim.cargoSpace(ship)).toBe(8);
    // At the far wall, the second gun seals nothing off.
    expect(sim.toHold(ship, { at: "locker", index: 0 }, { x: 4, y: 0, turned: false })).toBe(true);
    expect(sim.cargoSpace(ship)).toBe(6);
    // Moved to x 1, the first gun leaves column 0 a pocket the ore can't reach.
    expect(sim.toHold(ship, { at: "hold", index: 0 }, { x: 1, y: 0, turned: false })).toBe(true);
    expect(sim.cargoSpace(ship)).toBe(4);
  });

  it("a blocked entry leaves no room for ore, and the tractor lets go", () => {
    const sim = docked("floater");
    const { ship } = sim;
    ship.ore = 0;
    sim.devSet(ship, "tractor", true);
    expect(sim.tractorOn(ship)).toBe(true);
    sim.putInLocker(sim.baseAt()!, { part: "gun2", wear: 0 });
    const entry = sim.bayGrid(ship)!.entry;
    expect(sim.toHold(ship, { at: "locker", index: 0 }, { x: entry.x, y: entry.y, turned: false })).toBe(true);
    expect(sim.cargoSpace(ship)).toBe(0);
    expect(sim.tractorOn(ship)).toBe(false);
  });

  it("refuses an item that touches no wall and no chain of items that does", () => {
    const sim = docked("racer");
    const { ship } = sim;
    ship.ore = 0;
    sim.devSet(ship, "bay", true);
    // The bay is 5 by 4: a single cell at 2,1 touches no wall.
    sim.putInLocker(sim.baseAt()!, { part: "flightComputer", wear: 0 });
    sim.putInLocker(sim.baseAt()!, { part: "gun2", wear: 0 });
    expect(sim.toHold(ship, { at: "locker", index: 0 }, { x: 2, y: 1, turned: false })).toBe(false);
    expect(sim.toHold(ship, { at: "locker", index: 1 }, { x: 2, y: 2, turned: false })).toBe(true);
    expect(sim.toHold(ship, { at: "locker", index: 0 }, { x: 2, y: 1, turned: false })).toBe(true);
  });

  it("refuses to take out an item that holds another up, and says which", () => {
    const sim = docked("racer");
    const { ship } = sim;
    ship.ore = 0;
    sim.devSet(ship, "bay", true);
    sim.putInLocker(sim.baseAt()!, { part: "gun2", wear: 0 });
    sim.putInLocker(sim.baseAt()!, { part: "flightComputer", wear: 0 });
    sim.toHold(ship, { at: "locker", index: 0 }, { x: 2, y: 2, turned: false });
    sim.toHold(ship, { at: "locker", index: 0 }, { x: 2, y: 1, turned: false });
    expect(sim.floatingWithout(ship, 0).map((item) => item.part)).toEqual(["flightComputer"]);
    expect(sim.toLocker(ship, { at: "hold", index: 0 })).toBe(false);
    expect(sim.sellItem(ship, { at: "hold", index: 0 })).toBe(false);
    expect(sim.toLocker(ship, { at: "hold", index: 1 })).toBe(true);
    expect(sim.toLocker(ship, { at: "hold", index: 0 })).toBe(true);
  });

  it("refuses an item where the ore aboard would no longer fit", () => {
    const sim = withSpareGun();
    sim.ship.ore = 9;
    expect(sim.toHold(sim.ship, { at: "locker", index: 0 })).toBe(false);
    sim.ship.ore = 8;
    expect(sim.toHold(sim.ship, { at: "locker", index: 0 })).toBe(true);
  });

  it("a bigger bay carries what the old one held", () => {
    const sim = withSpareGun();
    const { ship } = sim;
    sim.toHold(ship, { at: "locker", index: 0 });
    sim.devSet(ship, "largeBay", true);
    expect(ship.hold.map((item) => item.module.part)).toEqual(["gun2"]);
    expect(sim.cargoSpace(ship)).toBe(48);
  });
});

describe("lockers and station storage", () => {
  it("every base gives a free locker of the tuned size", () => {
    const sim = docked("racer");
    const locker = sim.lockerAt(sim.baseAt()!);
    expect(locker.rows).toBe(sim.tuning.lockerFreeRows);
    expect(sim.lockerGrid(locker)).toEqual({ w: sim.tuning.lockerWidth, h: sim.tuning.lockerFreeRows });
  });

  it("a row costs credits and the station's storage", () => {
    const sim = docked("racer");
    const base = sim.baseAt()!;
    const credits = sim.ship.credits;
    const free = sim.storageFree(base);
    expect(sim.buyLockerRow()).toBe(true);
    expect(sim.lockerAt(base).rows).toBe(sim.tuning.lockerFreeRows + 1);
    expect(sim.ship.credits).toBe(credits - sim.tuning.lockerRowPrice);
    expect(sim.storageFree(base)).toBe(free - sim.tuning.lockerWidth);
  });

  it("a full station refuses a row", () => {
    const sim = docked("racer");
    const base = sim.baseAt()!;
    sim.tuning.stationStorage = sim.storageUsed(base) + sim.tuning.lockerWidth - 1;
    const credits = sim.ship.credits;
    expect(sim.buyLockerRow()).toBe(false);
    expect(sim.ship.credits).toBe(credits);
    expect(sim.lockerAt(base).rows).toBe(sim.tuning.lockerFreeRows);
  });

  it("a whole module sold to a full station is broken down", () => {
    const sim = docked("racer");
    const base = sim.baseAt()!;
    sim.putInLocker(base, { part: "gun2", wear: 0 });
    sim.putInLocker(base, { part: "gun2", wear: 0 });
    expect(sim.sellItem(sim.ship, { at: "locker", index: 0 })).toBe(true);
    expect(sim.stockOf(base, "gun2")).toBe(1);
    sim.tuning.stationStorage = sim.storageUsed(base);
    const credits = sim.ship.credits;
    expect(sim.sellItem(sim.ship, { at: "locker", index: 0 })).toBe(true);
    expect(sim.stockOf(base, "gun2")).toBe(1);
    expect(sim.ship.credits).toBeGreaterThan(credits);
  });

  it("a locker takes only what fits on its grid", () => {
    const sim = docked("racer");
    const base = sim.baseAt()!;
    // 6 by 2: three large bays don't fit, three tractors do.
    expect(sim.putInLocker(base, { part: "largeBay", wear: 0 })).toBe(false);
    for (let i = 0; i < 3; i++) expect(sim.putInLocker(base, { part: "tractor", wear: 0 })).toBe(true);
    expect(sim.putInLocker(base, { part: "turnThrusters", wear: 0 })).toBe(false);
  });

  it("a move that would overfill the locker is refused, and nothing changes", () => {
    const sim = docked("racer");
    const base = sim.baseAt()!;
    for (let i = 0; i < 3; i++) sim.putInLocker(base, { part: "tractor", wear: 0 });
    expect(sim.toLocker(sim.ship, { at: "mount", mount: "gun" })).toBe(false);
    expect(sim.ship.fit.gun!.part).toBe("gun1");
    expect(sim.lockerAt(base).items.length).toBe(3);
  });
});

describe("buying, WoW style", () => {
  it("goes on an empty mount it fits first", () => {
    const sim = docked("racer");
    expect(sim.buyPart(sim.ship, "strafe")).toBe(true);
    expect(sim.ship.fit.thrusterStrafeLeft!.part).toBe("strafe");
    expect(sim.ship.fit.thrusterStrafeRight!.part).toBe("strafe");
    expect(sim.buyRefused).toBeNull();
  });

  it("never takes a fitted part off: with the mount filled, it goes in the bay", () => {
    const sim = docked("racer");
    const { ship } = sim;
    expect(sim.whereBuyGoes(ship, "gun2")).toBe("hold");
    expect(sim.buyPart(ship, "gun2")).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun1");
    expect(ship.hold.map((item) => item.module.part)).toEqual(["gun2"]);
    expect(ship.credits).toBe(10000 - sim.partPrice("gun2"));
    // Then a swap on the ship screen puts it on, and the old one goes where the new one was.
    expect(sim.fitItem(ship, { at: "hold", index: 0 })).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun2");
    expect(ship.hold.map((item) => item.module.part)).toEqual(["gun1"]);
  });

  it("with the bay full too, it goes in the locker here", () => {
    const sim = docked("racer");
    const { ship } = sim;
    ship.ore = 10;
    expect(sim.whereBuyGoes(ship, "gun2")).toBe("locker");
    expect(sim.buyPart(ship, "gun2")).toBe(true);
    expect(ship.hold).toEqual([]);
    expect(sim.lockerAt(sim.baseAt()!).items.map((item) => item.module.part)).toEqual(["gun2"]);
  });

  it("with no room anywhere, it's refused and says why", () => {
    const sim = docked("racer");
    const { ship } = sim;
    ship.ore = 10;
    for (let i = 0; i < 3; i++) sim.putInLocker(sim.baseAt()!, { part: "tractor", wear: 0 });
    const credits = ship.credits;
    expect(sim.whereBuyGoes(ship, "gun2")).toBeNull();
    expect(sim.buyPart(ship, "gun2")).toBe(false);
    expect(sim.buyRefused).toBe("No room on the ship or in your locker here");
    expect(ship.credits).toBe(credits);
    expect(ship.fit.gun!.part).toBe("gun1");
    // A later buy that goes through clears it.
    expect(sim.buyPart(ship, "strafe")).toBe(true);
    expect(sim.buyRefused).toBeNull();
  });

  it("a pair goes in the bay or the locker together", () => {
    const sim = docked("racer");
    const { ship } = sim;
    sim.buyPart(ship, "strafe");
    expect(sim.buyPart(ship, "strafe")).toBe(false);
    // Owned already: the shop sells it back instead. A spare pair comes from the store by
    // taking one off, then buying again.
    expect(sim.toLocker(ship, { at: "mount", mount: "thrusterStrafeLeft" })).toBe(true);
    // One mount of the pair is free, but a pair goes on as a pair: both go in the bay.
    expect(sim.buyPart(ship, "strafe")).toBe(true);
    expect(ship.fit.thrusterStrafeLeft).toBeUndefined();
    expect(ship.hold.map((item) => item.module.part)).toEqual(["strafe", "strafe"]);
  });

  it("a drag from the shop buys straight into the spot it's dropped on, if the spot takes it", () => {
    const sim = docked("racer");
    const { ship } = sim;
    const base = sim.baseAt()!;
    // A filled mount: never a swap.
    expect(sim.buyPart(ship, "gun2", { at: "mount", mount: "gun" })).toBe(false);
    expect(sim.buyRefused).toBe("That spot won't take it");
    // A spot in the bay that floats: refused.
    sim.devSet(ship, "bay", true);
    expect(sim.buyPart(ship, "flightComputer", { at: "hold", spot: { x: 2, y: 1, turned: false } })).toBe(false);
    expect(sim.buyPart(ship, "gun2", { at: "hold", spot: { x: 0, y: 2, turned: true } })).toBe(true);
    expect(ship.hold[0]).toMatchObject({ x: 0, y: 2, turned: true });
    expect(sim.buyPart(ship, "gun2", { at: "locker", spot: { x: 3, y: 1, turned: false } })).toBe(false);
    expect(sim.buyPart(ship, "gun2", { at: "locker", spot: { x: 3, y: 0, turned: false } })).toBe(true);
    expect(sim.lockerAt(base).items[0]).toMatchObject({ x: 3, y: 0, turned: false });
    sim.toLocker(ship, { at: "mount", mount: "thrusterRotateLeft" });
    sim.toLocker(ship, { at: "mount", mount: "thrusterRotateRight" });
    expect(sim.buyPart(ship, "turnThrusters", { at: "mount", mount: "thrusterRotateRight" })).toBe(true);
    expect(ship.fit.thrusterRotateRight!.part).toBe("turnThrusters");
  });

  it("AI ships still swap, and sell the old part to the base", () => {
    const sim = new Sim(1, { ...WORLD, floaterStart: false, trafficRacers: 1 });
    const { ship } = sim.traffic[0];
    ship.x = ship.px = sim.station.x + DOCK_OFFSET;
    ship.y = ship.py = sim.station.y;
    ship.credits = 1000;
    expect(sim.buyPart(ship, "gun2")).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun2");
    expect(ship.hold).toEqual([]);
  });
});
