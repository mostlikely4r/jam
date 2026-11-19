import { afterEach, describe, expect, it } from "vitest";
import { homeSim } from "./home";
import { bodyAt, MAX_HULL, type SolidBody, Sim, TICK } from "./sim";
import { DEFAULTS } from "./tuning";

/**
 * The chart's picks and the autopilot's courses: what a place is to the chart, and flying
 * one end of the system to the other with the map part and the autopilot part.
 */
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const ALONE = {
  ...DEFAULTS,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  haulers: false,
  stationUnlocks: false,
  depositFree: false,
  repairCost: 0,
  rebuildCost: 0,
  chatter: false,
};
function run(sim: Sim, seconds: number, each?: () => void): void {
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i++) {
    sim.step();
    each?.();
    sim.events.length = 0;
  }
}

describe("chart", () => {
  it("starts knowing nothing, and finds the field by getting near it", () => {
    const sim = homeSim(1, { ...ALONE });
    sim.ship.x = sim.field.x + sim.field.reach * 5;
    sim.ship.y = sim.field.y;
    sim.ship.px = sim.ship.x;
    sim.ship.py = sim.ship.y;
    run(sim, 1);
    expect(sim.chartSeenPoi(sim.field)).toBe(false);
    sim.ship.x = sim.field.x;
    sim.ship.y = sim.field.y;
    sim.ship.px = sim.ship.x;
    sim.ship.py = sim.ship.y;
    run(sim, 1);
    expect(sim.chartSeenPoi(sim.field)).toBe(true);
  });

  it("a place visited later joins the chart", () => {
    const sim = homeSim(1, { ...ALONE });
    run(sim, 1);
    const dock = sim.dockPoint();
    sim.ship.x = dock.x;
    sim.ship.y = dock.y;
    sim.ship.px = dock.x;
    sim.ship.py = dock.y;
    run(sim, 1);
    expect(sim.chartSeenPoi(sim.station)).toBe(true);
  });

  it("a body joins the chart once the ship has been near it", () => {
    const sim = homeSim(1, { ...ALONE });
    const body: SolidBody = {
      name: "Test planet",
      kind: "planet",
      radius: 5000,
      surface: "none",
      pullStart: 0,
      pullFull: 0,
      pullAccel: 0,
      atmosphere: 0,
      burnSpeed: 0,
      spinPeriod: 0,
      orbits: [{ radius: 100000, period: 1000000, phase: 0, sign: 1 }],
    };
    sim.bodies.push(body);
    run(sim, 1);
    expect(sim.chartSeenBody(body)).toBe(false);
    const at = bodyAt(body, sim.now);
    sim.ship.x = at.x;
    sim.ship.y = at.y;
    sim.ship.px = at.x;
    sim.ship.py = at.y;
    run(sim, 1);
    expect(sim.chartSeenBody(body)).toBe(true);
  });

  it("an anchor is found when its size comes on screen, even a size of zero", () => {
    const sim = homeSim(1, { ...ALONE });
    const orbits = [{ radius: 50000, period: 0, phase: 0, sign: 1 as const }];
    const point = { id: "a:0", name: "Point", radius: 0, orbits };
    const wide = { id: "b:0", name: "Wide", radius: 3000, orbits: [{ radius: 90000, period: 0, phase: 0, sign: 1 as const }] };
    sim.anchors = [point, wide];
    sim.screen = { halfWidth: 1000, halfHeight: 500 };
    const goTo = (x: number, y: number) => {
      sim.ship.x = sim.ship.px = x;
      sim.ship.y = sim.ship.py = y;
      run(sim, 1);
    };
    goTo(50000 - 1100, 0);
    expect(sim.chartSeenAnchor(point)).toBe(false);
    goTo(50000 - 900, 400);
    expect(sim.chartSeenAnchor(point)).toBe(true);
    goTo(90000 - 3900, 0);
    expect(sim.chartSeenAnchor(wide)).toBe(true);
  });

  it("lists every place: the game's own three, the designer's outposts and fields", () => {
    const sim = homeSim(1, { ...ALONE });
    const pois = sim.allPois();
    expect(pois).toContain(sim.field);
    expect(pois).toContain(sim.station);
    expect(sim.deposits).toEqual([]);
  });

  it("a course needs the autopilot part, and one without it never flies", () => {
    const sim = homeSim(1, { ...ALONE });
    expect(sim.orderTravel(sim.station)).toBe(false);
    expect(sim.clickPilot.active).toBe(false);
    run(sim, 5);
    expect(sim.clickPilot.active).toBe(false);
  });

  it("a course chases its place: the target stays at the moving dock", () => {
    const sim = homeSim(1, { ...ALONE });
    sim.devSet(sim.ship, "autopilot", true);
    expect(sim.orderTravel(sim.station)).toBe(true);
    expect(sim.clickPilot.active).toBe(true);
    run(sim, 20);
    const target = sim.clickPilot.target()!;
    const dock = sim.dockPoint();
    expect(Math.hypot(target.x - dock.x, target.y - dock.y)).toBeLessThan(1);
  });

  it("the autopilot flies a long course, round whatever's in the way, and docks", () => {
    const sim = homeSim(1, { ...ALONE });
    const { ship } = sim;
    sim.devSet(ship, "autopilot", true);
    sim.devSet(ship, "reverse", true);
    sim.devSet(ship, "strafe", true);
    sim.devSet(ship, "spinStabilizer", true);
    ship.hull = MAX_HULL;
    // Out past the far side of the field's orbit, so the trip is a real one.
    ship.x = sim.station.x + 600000;
    ship.y = sim.station.y;
    ship.px = ship.x;
    ship.py = ship.y;
    ship.vx = 0;
    ship.vy = 0;
    expect(sim.orderTravel(sim.station)).toBe(true);
    let docked = -1;
    run(sim, 700, () => {
      if (docked < 0 && sim.isDocked()) docked = sim.now;
    });
    expect(sim.dockedAt()).toBe(sim.station);
    expect(docked).toBeGreaterThan(0);
    expect(sim.ship.hull).toBeGreaterThan(0);
  }, 60000);

  it("selling the autopilot mid-course cancels the course", () => {
    const sim = homeSim(1, { ...ALONE });
    const { ship } = sim;
    sim.devSet(ship, "autopilot", true);
    expect(sim.orderTravel(sim.station)).toBe(true);
    expect(sim.clickPilot.active).toBe(true);
    sim.devSet(ship, "autopilot", false);
    run(sim, 1);
    expect(sim.clickPilot.active).toBe(false);
  });

  it("a course for a field stops short, just inside its edge", () => {
    const sim = homeSim(1, { ...ALONE });
    const { ship } = sim;
    sim.devSet(ship, "autopilot", true);
    sim.devSet(ship, "reverse", true);
    sim.devSet(ship, "strafe", true);
    // Parked a long way out, pointing at the field from beyond it.
    ship.x = sim.field.x;
    ship.y = sim.field.y + sim.field.reach + 300000;
    ship.px = ship.x;
    ship.py = ship.y;
    expect(sim.orderTravel(sim.field)).toBe(true);
    // Where the course ends, before drifting rocks start nudging the ship about.
    let out = Infinity;
    run(sim, 700, () => {
      sim.events.length = 0;
      if (out === Infinity && !sim.clickPilot.flying) out = Math.hypot(ship.x - sim.field.x, ship.y - sim.field.y);
    });
    expect(out).toBeLessThan(sim.field.reach);
    expect(out).toBeGreaterThan(sim.field.reach * 0.5);
  }, 60000);
});
