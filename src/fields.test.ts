import { afterEach, describe, expect, it } from "vitest";
import type { DronePilot } from "./pilot";
import { DEFAULTS } from "./tuning";
import { DOCK_OFFSET, type FieldSpec, FIRST_FIELD, keepOutRadius, Sim, type SolidBody, TICK } from "./sim";

// Long runs never give the worker a turn of the event loop otherwise (see pilot.test.ts).
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** One traffic racer, a first field round a planet, and nothing else going on. */
const WORLD = {
  ...DEFAULTS,
  floaterStart: false,
  trafficRacers: 1,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  repairCost: 0,
  rebuildCost: 0,
  detectSeconds: 0,
  haulers: false,
  stationUnlocks: false,
  tradeChance: 0,
  rockCount: 40,
  fieldOrbitRadius: 60000,
  fieldOrbitPeriod: 10800,
  fieldWanderChance: 0,
  fieldLuckSeconds: 0,
  fieldHabitSeconds: 0,
  // Carried by a place only near it: a spinning station carrying a ship everywhere would sweep it about far out.
  stationCarryFull: 2000,
  stationCarryNone: 6000,
  fieldCarryFull: 2000,
  fieldCarryNone: 8000,
};

const PLANET: SolidBody = {
  name: "Planet",
  kind: "planet",
  radius: 12000,
  surface: "death",
  pullStart: 30000,
  pullFull: 15000,
  pullAccel: 150,
  atmosphere: 13800,
  burnSpeed: 300,
  spinPeriod: 0,
  orbits: [],
};

/** A world with a second field on the first one's orbit, `apart` radians further round. */
function world(apart: number, tuning: Partial<typeof WORLD> = {}): { sim: Sim; pilot: DronePilot } {
  const sim = new Sim(1, { ...WORLD, ...tuning });
  sim.bodies = [PLANET];
  const home = Math.atan2(sim.field.y, sim.field.x) - (2 * Math.PI * sim.now) / 10800;
  const second: FieldSpec = {
    id: "second:0",
    name: "Second",
    radius: 3000,
    rocks: 40,
    rockDrift: 0,
    rockInflow: 0,
    carryFull: Infinity,
    carryNone: Infinity,
    rotationPeriod: 0,
    orbits: [{ radius: 60000, period: 10800, phase: home + apart, sign: 1 }],
  };
  sim.applyLayout({}, [second]);
  return { sim, pilot: sim.traffic[0] };
}

/** Puts the traffic ship in the dock with an empty hold and lets it decide where to go. */
function decide(sim: Sim, pilot: DronePilot): string {
  const { ship } = pilot;
  ship.x = ship.px = sim.station.x + DOCK_OFFSET;
  ship.y = ship.py = sim.station.y;
  ship.vx = ship.vy = 0;
  ship.ore = 0;
  sim.step();
  // Out of the dock and back, so it decides afresh next time.
  ship.x = ship.px = sim.station.x + 5000;
  sim.step();
  return pilot.working;
}

describe("traffic between fields", () => {
  it("works the first field when the other is a long way round the planet", () => {
    const { sim, pilot } = world(Math.PI);
    expect(decide(sim, pilot)).toBe(FIRST_FIELD);
  });

  it("knows the trip round the planet takes longer than a near one", () => {
    const near = world(0.2);
    const far = world(Math.PI);
    const [nearField] = near.sim.miningFields().slice(1);
    const [farField] = far.sim.miningFields().slice(1);
    const nearTrip = near.pilot.tripSeconds(near.sim, nearField);
    const farTrip = far.pilot.tripSeconds(far.sim, farField);
    expect(farTrip).toBeGreaterThan(nearTrip * 3);
    // Straight through the planet would be 120,000 across; round its pull is further.
    expect(farTrip).toBeGreaterThan(120000 / DEFAULTS.droneCruiseSpeed);
  });

  it("heads out when the first field is mined down, however far the other is", () => {
    const { sim, pilot } = world(Math.PI);
    sim.rocks = sim.rocks.filter((rock) => sim.miningFieldAt(rock.x, rock.y).id !== FIRST_FIELD);
    expect(decide(sim, pilot)).toBe("second:0");
  });

  it("keeps away from where pirates killed it on some trips, until it forgets", () => {
    const { sim, pilot } = world(Math.PI, { fieldFearChance: 1, fieldFearSeconds: 100 });
    pilot.ship.pirateKilledAt = sim.now;
    pilot.ship.pirateKilledIn = FIRST_FIELD;
    expect(decide(sim, pilot)).toBe("second:0");
    pilot.ship.pirateKilledAt = sim.now - 101;
    expect(decide(sim, pilot)).toBe(FIRST_FIELD);
  });

  it("goes back to the field it worked last if that's only a little further", () => {
    const { sim, pilot } = world(0.2, { fieldHabitSeconds: 600 });
    expect(decide(sim, pilot)).toBe(FIRST_FIELD);
    pilot.habit = "second:0";
    expect(decide(sim, pilot)).toBe("second:0");
  });

  it("picks a field nearly as near now and then by luck, and one far round the planet never", () => {
    const count = (apart: number) => {
      const { sim, pilot } = world(apart, { fieldLuckSeconds: 120 });
      let out = 0;
      for (let i = 0; i < 40; i++) if (decide(sim, pilot) !== FIRST_FIELD) out++;
      return out;
    };
    expect(count(0.15)).toBeGreaterThan(0);
    expect(count(Math.PI)).toBe(0);
  });

  it("heads for any other field now and then, just to see", () => {
    const { sim, pilot } = world(Math.PI, { fieldWanderChance: 1 });
    expect(decide(sim, pilot)).toBe("second:0");
  });

  it("player's drones stay at the first field", () => {
    const { sim } = world(Math.PI, { testDrones: 1, fieldWanderChance: 1 });
    const drone = sim.drones[0];
    drone.buys = "upgrades";
    drone.ship.owner = sim.ship;
    expect(decide(sim, drone)).toBe(FIRST_FIELD);
  });

  it("flies round the planet's pull to the far field, mines it, and brings the ore home", () => {
    const { sim, pilot } = world(2.4, { fieldWanderChance: 1 });
    const { ship } = pilot;
    decide(sim, pilot);
    expect(pilot.working).toBe("second:0");
    let closest = Infinity;
    let minedThere = false;
    let homeWith = 0;
    for (let i = 0; i < Math.round(1500 / TICK) && homeWith === 0; i++) {
      sim.step();
      sim.events.length = 0;
      closest = Math.min(closest, Math.hypot(ship.x, ship.y));
      if (pilot.task === "shooting" && sim.miningFieldAt(ship.x, ship.y).id === "second:0") minedThere = true;
      if (minedThere && sim.isDocked(ship) && ship.ore > 0) homeWith = ship.ore;
    }
    expect(minedThere).toBe(true);
    expect(closest).toBeGreaterThan(PLANET.pullStart);
    expect(homeWith).toBeGreaterThan(0);
  }, 240000);

  it("cornerToward is clear when nothing is in the way, and outside the pull when something is", () => {
    const sim = new Sim(1, { ...WORLD });
    sim.bodies = [PLANET];
    expect(sim.cornerToward(60000, 0, 60000, 10000)).toBeNull();
    const corner = sim.cornerToward(60000, 0, -60000, 0)!;
    expect(Math.hypot(corner.x, corner.y)).toBeGreaterThanOrEqual(keepOutRadius(PLANET));
  });
});
