import { afterEach, describe, expect, it } from "vitest";
import { roundTrip } from "./save";
import { Sim, TICK, TRAFFIC_WAKE_DISTANCE } from "./sim";
import { DEFAULTS } from "./tuning";

// Long runs never give the worker a turn of the event loop otherwise (see pilot.test.ts).
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/**
 * Traffic and nothing to fight it, so the only difference records make is how it's run.
 * Nor does it report the stray shots it takes from other traffic: out of view there are no
 * such accidents yet, and with no defenders a wanted ship has everyone sheltering for good.
 */
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

/** Ore traffic has sold at the station, all told. */
const sold = (sim: Sim) => sim.traffic.reduce((sum, pilot) => sum + pilot.ship.earned, 0) / sim.tuning.creditsPerOre;

describe("traffic out of view", () => {
  it("becomes a trip record, flown by nobody, and a ship again when the camera comes near", () => {
    const sim = new Sim(1, { ...QUIET });
    run(sim, 2, () => parkAway(sim));
    expect(sim.traffic.every((pilot) => pilot.record)).toBe(true);
    expect(sim.ships.filter((ship) => ship !== sim.ship).length).toBe(0);
    // Its ship still says where it is.
    const { ship } = sim.traffic[0];
    expect(Math.hypot(ship.x - sim.field.x, ship.y - sim.field.y)).toBeLessThan(sim.tuning.fieldRadius + 4000);
    // The camera comes to it.
    sim.ship.x = sim.ship.px = ship.x + TRAFFIC_WAKE_DISTANCE / 2;
    sim.ship.y = sim.ship.py = ship.y;
    sim.step();
    expect(sim.traffic[0].record).toBeNull();
    expect(sim.ships).toContain(ship);
  });

  it("keeps mining, selling and shopping as a record", () => {
    const sim = new Sim(1, { ...QUIET });
    const rocks = () => sim.rocks.length + [...sim.sleeping.values()].reduce((sum, field) => sum + field.rocks.length, 0);
    run(sim, 900, () => parkAway(sim));
    expect(sim.traffic.every((pilot) => pilot.record)).toBe(true);
    expect(sim.traffic.every((pilot) => pilot.ship.trips > 0)).toBe(true);
    expect(sold(sim)).toBeGreaterThan(100);
    expect(sim.bases[0].ore).toBeGreaterThan(0);
    // The field is mined, as it would be: broken rocks leave smaller ones.
    expect(rocks()).not.toBe(QUIET.rockCount);
  }, 120000);

  it("sells about as much ore as flown traffic does", () => {
    const minutes = 20;
    const flown = new Sim(3, { ...QUIET, trafficRecords: false });
    run(flown, minutes * 60, () => parkAway(flown));
    const recorded = new Sim(3, { ...QUIET });
    run(recorded, minutes * 60, () => parkAway(recorded));
    const ratio = sold(recorded) / sold(flown);
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.4);
  }, 300000);

  it("goes into a save and carries on after loading", () => {
    const sim = new Sim(1, { ...QUIET });
    run(sim, 30, () => parkAway(sim));
    const loaded = new Sim(1, { ...QUIET });
    roundTrip(sim, loaded);
    expect(loaded.traffic.map((pilot) => pilot.record)).toEqual(sim.traffic.map((pilot) => pilot.record));
    run(loaded, 300, () => parkAway(loaded));
    expect(sold(loaded)).toBeGreaterThan(sold(sim));
  }, 120000);

  it("stays a flown ship while a pirate is near it, so a fight is a real one", () => {
    const sim = new Sim(1, { ...QUIET, pirates: 1, trafficRacers: 1, trafficFloaters: 0 });
    const pirate = sim.fighters[0].ship;
    const { ship } = sim.traffic[0];
    run(sim, 2, () => {
      parkAway(sim);
      pirate.x = pirate.px = ship.x + 300;
      pirate.y = pirate.py = ship.y;
    });
    expect(sim.traffic[0].record).toBeNull();
  });
});
