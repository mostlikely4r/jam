import { describe, expect, it } from "vitest";
import { PARTS } from "./parts";
import { DEFAULTS } from "./tuning";
import { DOCK_OFFSET, MAX_HULL, Sim, TICK } from "./sim";

/** One drone that stays bare unless a test says otherwise. */
const SOLO = { ...DEFAULTS, droneCount: 1, droneParts: 0 };

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
