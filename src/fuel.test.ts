import { afterEach, describe, expect, it } from "vitest";
import { homeSim } from "./home";
import type { PartId } from "./parts";
import { roundTrip } from "./save";
import { type Poi, type Sim, TICK } from "./sim";
import { DEFAULTS } from "./tuning";

// Long runs never give the worker a turn of the event loop otherwise (see pilot.test.ts).
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const FUEL = "fuel" as PartId;
/** Traffic and nothing to fight it, as records.test.ts has it: the only difference is how it's run. */
const QUIET = {
  ...DEFAULTS,
  trafficPatience: 1e9,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  chatter: false,
  haulers: false,
  stationUnlocks: false,
  trafficRacers: 3,
  trafficFloaters: 3,
  fuel: true,
};

/** Parks the player's ship, and so the camera, far out from the field. */
function parkAway(sim: Sim): void {
  const out = Math.hypot(sim.field.x, sim.field.y) || 1;
  sim.ship.x = sim.ship.px = sim.field.x + (sim.field.x / out) * 40000;
  sim.ship.y = sim.ship.py = sim.field.y + (sim.field.y / out) * 40000;
  sim.ship.vx = sim.ship.vy = 0;
}

function run(sim: Sim, seconds: number, each?: () => void): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) {
    each?.();
    sim.step();
    sim.events.length = 0;
  }
}

function dockAt(sim: Sim, ship: Sim["ship"], station: Poi): void {
  const dock = sim.dockPoint(false, station);
  ship.x = ship.px = dock.x;
  ship.y = ship.py = dock.y;
  ship.vx = ship.vy = 0;
}

describe("fuel metering", () => {
  it("burns fuel from every thruster that fires, and the ledger counts it", () => {
    const sim = homeSim(1, { ...QUIET, trafficRacers: 0, trafficFloaters: 0, fuelPerThrust: 0.1 });
    sim.controls.thrust = 1;
    sim.controls.turn = 1;
    run(sim, 1);
    expect(sim.ship.burned).toBeGreaterThan(0);
    // Nothing has reset the meter yet: it counts what the trip has burned.
    expect(sim.ship.burnTotal).toBe(sim.ship.burned);
    // The world's ledger has lost exactly what the tank has burned.
    expect(sim.itemFlow.get(FUEL)).toBeCloseTo(-sim.ship.burnTotal, 9);
    // Turning costs too: the main thruster alone wouldn't have burned this much.
    expect(sim.ship.burned).toBeGreaterThan(0.1);
  });

  it("burns nothing at all with the switch off, and keeps the ledger as it was", () => {
    const sim = homeSim(1, { ...QUIET, trafficRacers: 0, trafficFloaters: 0, fuel: false });
    sim.controls.thrust = 1;
    run(sim, 1);
    expect(Math.hypot(sim.ship.vx, sim.ship.vy)).toBeGreaterThan(0);
    expect(sim.ship.burned).toBe(0);
    expect(sim.ship.burnTotal).toBe(0);
    expect(sim.itemFlow.get(FUEL)).toBeUndefined();
  });

  it("burns nothing while the ship coasts", () => {
    const sim = homeSim(1, { ...QUIET, trafficRacers: 0, trafficFloaters: 0 });
    sim.ship.vx = 100;
    run(sim, 1);
    expect(sim.ship.burned).toBe(0);
  });

  it("starts the meter again at a dock, and keeps the total", () => {
    const sim = homeSim(1, { ...QUIET, trafficRacers: 0, trafficFloaters: 0 });
    sim.controls.thrust = 1;
    run(sim, 1);
    const spent = sim.ship.burned;
    expect(spent).toBeGreaterThan(0);
    dockAt(sim, sim.ship, sim.station);
    sim.controls.thrust = 0;
    run(sim, 0.1);
    expect(sim.ship.burned).toBe(0);
    expect(sim.ship.burnTotal).toBeCloseTo(spent, 9);
  });

  it("keeps the meters in a save", () => {
    const sim = homeSim(1, { ...QUIET, trafficRacers: 0, trafficFloaters: 0 });
    sim.controls.thrust = 1;
    run(sim, 1);
    const loaded = homeSim(1, { ...QUIET, trafficRacers: 0, trafficFloaters: 0 });
    roundTrip(sim, loaded);
    expect(loaded.ship.burned).toBe(sim.ship.burned);
    expect(loaded.ship.burnTotal).toBe(sim.ship.burnTotal);
    expect(loaded.itemFlow.get(FUEL)).toBe(sim.itemFlow.get(FUEL));
  });
});

describe("fuel out of view", () => {
  it("burns a record's trip as it goes, at its hull's burn for each 1000 of path", () => {
    const sim = homeSim(1, { ...QUIET, trafficRacers: 1, trafficFloaters: 0, recordFuelRacer: 2 });
    const { ship } = sim.traffic[0];
    // Away from the field and the dock, so its first leg is a trip out rather than a rock to mine.
    const station = sim.station;
    ship.x = ship.px = station.x + 900;
    ship.y = ship.py = station.y;
    parkAway(sim);
    sim.step();
    expect(sim.traffic[0].record!.stage).toBe("travel");
    // Five seconds of the trip: what the ship moved is what it burned, at 2 a thousand units.
    let moved = 0;
    let last = { x: ship.x, y: ship.y };
    for (let i = 0; i < Math.round(5 / TICK); i++) {
      parkAway(sim);
      sim.step();
      moved += Math.hypot(ship.x - last.x, ship.y - last.y);
      last = { x: ship.x, y: ship.y };
      expect(sim.traffic[0].record).not.toBeNull();
    }
    expect(moved).toBeGreaterThan(0);
    expect(ship.burned).toBeCloseTo((moved / 1000) * 2, 6);
    expect(sim.itemFlow.get(FUEL)).toBeCloseTo(-ship.burned, 9);
  }, 60000);
});

describe("the hauler", () => {
  it("burns fuel as it comes in, and counts it in the ledger", () => {
    const sim = homeSim(1, { ...QUIET, trafficRacers: 0, trafficFloaters: 0, haulers: true, haulerFirst: 1, haulerInterval: 600 });
    run(sim, 30);
    const hauler = sim.bases[0].hauler;
    expect(hauler).not.toBeNull();
    expect(hauler!.burnTotal).toBeGreaterThan(0);
    expect(sim.itemFlow.get(FUEL)).toBeCloseTo(-hauler!.burnTotal, 9);
  }, 60000);
});
