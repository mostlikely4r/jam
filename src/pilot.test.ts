import { describe, expect, it } from "vitest";
import { PARTS } from "./parts";
import { DEFAULTS } from "./tuning";
import { DOCK_OFFSET, MAX_HULL, Sim, TICK } from "./sim";

/** One drone that stays bare unless a test says otherwise. */
const SOLO = {
  ...DEFAULTS,
  droneCount: 1,
  droneParts: 0,
  droneLimit: 1,
  repairCost: 0,
  rebuildCost: 0,
};

function run(sim: Sim, seconds: number, each?: () => void): void {
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i++) {
    sim.step();
    each?.();
    sim.events.length = 0;
  }
}

function placeInDock(sim: Sim, ship: Sim["ship"]): void {
  ship.x = sim.station.x + DOCK_OFFSET;
  ship.y = sim.station.y;
  ship.px = ship.x;
  ship.py = ship.y;
}

describe("drone", () => {
  it("mines, hauls to the dock, sells, and goes back for more", () => {
    const sim = new Sim(1, { ...SOLO });
    const { ship } = sim.drones[0];
    const start = sim.rocks.length;
    run(sim, 420);
    expect(ship.trips).toBeGreaterThanOrEqual(2);
    expect(ship.credits).toBe(ship.trips * DEFAULTS.droneCargo * DEFAULTS.creditsPerOre);
    expect(sim.ship.credits).toBe(0);
    expect(sim.rocks.length).not.toBe(start);
  }, 30000);

  it("only fires what it has, whatever the player's panel says", () => {
    const sim = new Sim(1, {
      ...SOLO,
      retro: true,
      thrusterMain: false,
      thrusterRotateLeft: false,
      thrusterRotateRight: false,
    });
    const used = new Set<string>();
    run(sim, 60, () => {
      for (const thruster of sim.drones[0].ship.firing) used.add(thruster);
    });
    expect([...used].sort()).toEqual(["thrusterMain", "thrusterRotateLeft", "thrusterRotateRight"]);
  }, 30000);

  it("restarts in the dock without its cargo when wrecked, and that isn't a trip", () => {
    const sim = new Sim(1, { ...SOLO, safeImpactSpeed: 0, damagePerSpeed: 100 });
    const { ship } = sim.drones[0];
    ship.ore = 5;
    ship.vx = 400;
    sim.rocks.push(sim.makeRock(2, ship.x + 80, ship.y, 0, 0));
    let dockedWhenRebuilt = false;
    run(sim, 1, () => {
      if (ship.wrecks === 1 && ship.hull === MAX_HULL && ship.ore === 0) {
        dockedWhenRebuilt ||= sim.isDocked(ship);
      }
    });
    expect(ship.wrecks).toBe(1);
    expect(ship.trips).toBe(0);
    expect(dockedWhenRebuilt).toBe(true);
    expect(sim.ship.wrecks).toBe(0);
  });

  it("delivers what it has when the field runs out, then waits", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0 });
    const { ship } = sim.drones[0];
    ship.ore = 3;
    run(sim, 180);
    expect(ship.credits).toBe(3 * DEFAULTS.creditsPerOre);
    expect(sim.drones[0].task).toBe("idle");
  }, 30000);

  it("leaves the player's cargo and wrecks alone", () => {
    const sim = new Sim(1, { ...SOLO });
    sim.ship.ore = 2;
    run(sim, 30);
    expect(sim.ship.ore).toBeGreaterThanOrEqual(2);
    expect(sim.ship.wrecks).toBe(0);
  }, 30000);

  it("buys parts with its own earnings when it's empty in the dock, in order", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0, droneParts: 5 });
    const { ship } = sim.drones[0];
    placeInDock(sim, ship);
    ship.credits = 320;
    run(sim, 0.1);
    expect([...ship.parts]).toEqual(["spinStabilizer", "reverse"]);
    expect(ship.credits).toBe(20);
    expect(sim.ship.parts.size).toBe(0);
  });

  it("stops buying at the limit", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0, droneParts: 1 });
    const { ship } = sim.drones[0];
    placeInDock(sim, ship);
    ship.credits = 1000;
    run(sim, 0.1);
    expect([...ship.parts]).toEqual(["spinStabilizer"]);
  });

  it("sells a new drone only in the dock, for the price, and up to the limit", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0, droneCount: 0, droneLimit: 1 });
    sim.ship.credits = DEFAULTS.dronePrice;
    expect(sim.buyDrone(sim.ship)).toBeNull();
    placeInDock(sim, sim.ship);
    sim.ship.credits = DEFAULTS.dronePrice - 1;
    expect(sim.buyDrone(sim.ship)).toBeNull();
    sim.ship.credits = DEFAULTS.dronePrice * 2;
    const drone = sim.buyDrone(sim.ship);
    expect(drone).not.toBeNull();
    expect(sim.drones).toHaveLength(1);
    expect(sim.ship.credits).toBe(DEFAULTS.dronePrice);
    expect(sim.isDocked(drone!.ship)).toBe(true);
    expect(drone!.ship.credits).toBe(0);
    expect(drone!.ship.parts.size).toBe(0);
    expect(sim.buyDrone(sim.ship)).toBeNull();
  });

  it("buys a drone only after everything on its parts list", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0, droneParts: 1, droneLimit: 5 });
    const { ship } = sim.drones[0];
    placeInDock(sim, ship);
    ship.credits = DEFAULTS.dronePrice;
    sim.drones[0].update(sim);
    expect(ship.parts.has("spinStabilizer")).toBe(true);
    expect(sim.drones).toHaveLength(1);
    ship.credits = DEFAULTS.dronePrice;
    sim.drones[0].update(sim);
    expect(sim.drones).toHaveLength(2);
    expect(ship.credits).toBe(0);
  });

  it("flies a bought drone through the same loop", () => {
    const sim = new Sim(1, { ...SOLO, droneCount: 0, droneLimit: 1 });
    placeInDock(sim, sim.ship);
    sim.ship.credits = DEFAULTS.dronePrice;
    const drone = sim.buyDrone(sim.ship)!;
    run(sim, 420);
    expect(drone.ship.trips).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("stays at the drone limit on its own earnings", () => {
    const sim = new Sim(1, { ...SOLO, droneCount: 1, droneLimit: 2, dronePrice: 50 });
    run(sim, 420);
    expect(sim.drones).toHaveLength(2);
  }, 30000);

  it("repairs before buying anything", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0, droneParts: 5, repairCost: 2 });
    const { ship } = sim.drones[0];
    placeInDock(sim, ship);
    ship.hull = 50;
    ship.credits = 150;
    run(sim, 0.5);
    expect(sim.drones[0].task).toBe("repairing");
    expect(ship.parts.size).toBe(0);
    run(sim, 2);
    expect(ship.hull).toBe(MAX_HULL);
    expect(ship.credits).toBe(50);
    expect(ship.upkeep).toBe(100);
    expect(ship.parts.size).toBe(0);
  });

  it("heads home early on a low hull when it can pay", () => {
    const sim = new Sim(1, { ...SOLO, repairCost: 2 });
    const { ship } = sim.drones[0];
    ship.hull = 20;
    ship.ore = 1;
    sim.step();
    expect(sim.drones[0].task).toBe("to station");
  });

  it("keeps mining on a low hull when it has no way to pay", () => {
    const sim = new Sim(1, { ...SOLO, repairCost: 2 });
    const { ship } = sim.drones[0];
    ship.hull = 20;
    sim.step();
    expect(sim.drones[0].task).not.toBe("to station");
  });

  it("works off a rebuild's debt instead of stopping", () => {
    const sim = new Sim(1, { ...SOLO, repairCost: 2, rebuildCost: 300 });
    const { ship } = sim.drones[0];
    ship.credits = -100;
    run(sim, 420);
    expect(ship.trips).toBeGreaterThanOrEqual(2);
    expect(ship.credits).toBeGreaterThan(-100);
  }, 30000);

  it("goes back to a rock it gave up on when nothing else is left", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0 });
    const drone = sim.drones[0];
    const rock = sim.makeRock(1, drone.ship.x + 400, drone.ship.y, 0, 0);
    sim.rocks.push(rock);
    (drone as unknown as { ignored: WeakSet<object> }).ignored.add(rock);
    run(sim, 30);
    expect(sim.rocks.includes(rock)).toBe(false);
  }, 30000);

  it.each([
    ["spin stabilizer", ["spinStabilizer"]],
    ["reverse", ["reverse"]],
    ["strafe", ["strafe"]],
    ["reverse and strafe", ["reverse", "strafe"]],
    ["everything", PARTS.map((part) => part.id)],
  ] as const)("still completes trips with %s", (_name, parts) => {
    const sim = new Sim(1, { ...SOLO });
    const { ship } = sim.drones[0];
    for (const part of parts) ship.parts.add(part);
    run(sim, 420);
    expect(ship.trips).toBeGreaterThanOrEqual(1);
    expect(ship.wrecks).toBe(0);
  }, 30000);

  it("uses reverse when it has it, and strafe when it has it", () => {
    const sim = new Sim(1, { ...SOLO });
    const { ship } = sim.drones[0];
    ship.parts.add("reverse");
    ship.parts.add("strafe");
    const used = new Set<string>();
    run(sim, 120, () => {
      for (const thruster of ship.firing) used.add(thruster);
    });
    expect(used.has("thrusterReverse")).toBe(true);
    expect(used.has("thrusterStrafeLeft") || used.has("thrusterStrafeRight")).toBe(true);
  }, 30000);
});
