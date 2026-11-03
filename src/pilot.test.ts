import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./tuning";
import { MAX_HULL, Sim, TICK } from "./sim";

function run(sim: Sim, seconds: number, each?: () => void): void {
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i++) {
    sim.step();
    each?.();
    sim.events.length = 0;
  }
}

describe("drone", () => {
  it("mines, hauls to the dock, sells, and goes back for more", () => {
    const sim = new Sim(1, { ...DEFAULTS });
    const start = sim.rocks.length;
    run(sim, 420);
    expect(sim.stats.droneTrips).toBeGreaterThanOrEqual(2);
    expect(sim.stats.credits).toBe(
      sim.stats.droneTrips * DEFAULTS.droneCargo * DEFAULTS.creditsPerOre,
    );
    expect(sim.rocks.length).not.toBe(start);
  }, 30000);

  it("only fires what it's fitted with, whatever the player's panel says", () => {
    const sim = new Sim(1, {
      ...DEFAULTS,
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
    const sim = new Sim(1, { ...DEFAULTS, safeImpactSpeed: 0, damagePerSpeed: 100 });
    const { ship } = sim.drones[0];
    ship.ore = 5;
    ship.vx = 400;
    const rock = sim.makeRock(2, ship.x + 80, ship.y, 0, 0);
    sim.rocks.push(rock);
    let dockedWhenRebuilt = false;
    run(sim, 1, () => {
      if (sim.stats.droneWrecks === 1 && ship.hull === MAX_HULL && ship.ore === 0) {
        dockedWhenRebuilt ||= sim.isDocked(ship);
      }
    });
    expect(sim.stats.droneWrecks).toBe(1);
    expect(sim.stats.droneTrips).toBe(0);
    expect(dockedWhenRebuilt).toBe(true);
    expect(sim.stats.wrecks).toBe(0);
  });

  it("delivers what it has when the field runs out, then waits", () => {
    const sim = new Sim(1, { ...DEFAULTS, rockCount: 0, droneCargo: 10 });
    sim.drones[0].ship.ore = 3;
    run(sim, 180);
    expect(sim.stats.credits).toBe(3 * DEFAULTS.creditsPerOre);
    expect(sim.drones[0].task).toBe("idle");
  }, 30000);

  it("leaves the player's cargo and wrecks alone", () => {
    const sim = new Sim(1, { ...DEFAULTS });
    sim.ship.ore = 2;
    run(sim, 30);
    expect(sim.ship.ore).toBeGreaterThanOrEqual(2);
    expect(sim.stats.wrecks).toBe(0);
  }, 30000);
});
