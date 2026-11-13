import { describe, expect, it } from "vitest";
import { mountsFor, newFitting } from "./fitting";
import { DEFAULTS } from "./tuning";
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
  it("a new gun trades in the old one, and selling it puts the hull's own back", () => {
    const sim = docked("racer");
    const { ship } = sim;
    expect(sim.buyPart(ship, "gun2")).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun2");
    expect(ship.credits).toBe(10000 - sim.partPrice("gun2") + sim.partPrice("gun1"));
    expect(sim.sellPart(ship, "gun2")).toBe(true);
    expect(ship.fit.gun!.part).toBe("gun1");
    expect(ship.credits).toBe(10000);
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
