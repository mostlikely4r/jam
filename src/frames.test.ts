/**
 * The things that stand still as entities: a station's place keeps to its rails while its body,
 * anchored to it, spins and carries; the field's carrying stays on its place.
 * (`docs/station-frames-plan.md`.)
 */
import { describe, expect, it } from "vitest";
import { homeSim } from "./home";
import { DEFAULTS } from "./tuning";
import { stationArtState } from "./artState";
import { orbitsAt, type Poi, Sim, TICK } from "./sim";

function run(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) sim.step();
}

/** A quiet home: no rocks, no ships but the player's, and a station that turns once a minute. */
function quiet(): Sim {
  return homeSim(1, {
    ...DEFAULTS,
    rockCount: 0,
    trafficRacers: 0,
    trafficFloaters: 0,
    pirates: 0,
    defenders: 0,
    testDrones: 0,
    haulers: false,
    stationRotationPeriod: 60,
  });
}

/** A spot in a place's turning frame. */
function localTo(poi: Poi, x: number, y: number): { x: number; y: number } {
  const dx = x - poi.x;
  const dy = y - poi.y;
  const cos = Math.cos(poi.rotation);
  const sin = Math.sin(poi.rotation);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

describe("a station's place and body", () => {
  it("are one spot while nothing pushes it, the place on its rails", () => {
    const sim = quiet();
    run(sim, 3);
    const { body } = sim.bases[0];
    const rails = orbitsAt(body.place.orbits, sim.now);
    expect(body.place.x).toBeCloseTo(rails.x, 6);
    expect(body.place.y).toBeCloseTo(rails.y, 6);
    expect(body.x).toBe(body.place.x);
    expect(body.y).toBe(body.place.y);
    expect(sim.station).toBe(body);
  });

  it("given an offset, stands off its place, and carries from where it is, turning with its spin", () => {
    /** A rock let go beside the station, its body pushed `by` away from the field, and where it went. */
    const trial = (by: number) => {
      const sim = quiet();
      const { body } = sim.bases[0];
      const away = Math.atan2(body.y - sim.field.y, body.x - sim.field.x);
      body.offset = { x: Math.cos(away) * by, y: Math.sin(away) * by };
      sim.step();
      const rock = sim.makeRock(0, body.x + 250, body.y - 120, 0, 0);
      sim.rocks.push(rock);
      const turned = body.rotation;
      run(sim, 20);
      const rails = orbitsAt(body.place.orbits, sim.now);
      return { sim, body, rails, turned, rock: localTo(body, rock.x, rock.y), carrier: sim.nearestPoi(rock.x, rock.y) };
    };
    const still = trial(0);
    const pushed = trial(1500);
    // The place kept to its rails; the body stood at its offset from it the whole way.
    expect(pushed.body.place.x).toBeCloseTo(pushed.rails.x, 6);
    expect(pushed.body.place.y).toBeCloseTo(pushed.rails.y, 6);
    expect(pushed.body.x - pushed.body.place.x).toBeCloseTo(pushed.body.offset.x, 6);
    expect(pushed.body.y - pushed.body.place.y).toBeCloseTo(pushed.body.offset.y, 6);
    expect(Math.hypot(pushed.body.offset.x, pushed.body.offset.y)).toBeCloseTo(1500, 6);
    // It turned, and the rock went with it exactly as beside a station that was never pushed:
    // what carries it is the body, where it is, not an empty place left behind.
    expect(pushed.body.rotation).not.toBeCloseTo(pushed.turned, 2);
    expect(pushed.carrier).toBe(pushed.body);
    // Within a few units: the planet's pull is a touch different 1500 further out. Carried about the
    // place it left, the rock would have swung round a circle 1500 across in these 20 seconds.
    expect(Math.abs(pushed.rock.x - still.rock.x)).toBeLessThan(3);
    expect(Math.abs(pushed.rock.y - still.rock.y)).toBeLessThan(3);
    // Where the body will be, by the clock, counts its offset.
    const later = pushed.sim.poiAt(pushed.body, pushed.sim.now + 60);
    const railsLater = orbitsAt(pushed.body.place.orbits, pushed.sim.now + 60);
    expect(later.x - railsLater.x).toBeCloseTo(pushed.body.offset.x, 6);
    expect(later.y - railsLater.y).toBeCloseTo(pushed.body.offset.y, 6);
  });

  it("leaves a field's carrying on its place: a field is its own place", () => {
    const sim = quiet();
    const field = sim.extraFields[0].poi;
    const rock = sim.makeRock(0, field.x + 400, field.y + 300, 0, 0);
    sim.rocks.push(rock);
    const start = localTo(field, rock.x, rock.y);
    run(sim, 20);
    const rails = orbitsAt(field.orbits!, sim.now);
    expect(field.x).toBeCloseTo(rails.x, 6);
    const now = localTo(field, rock.x, rock.y);
    expect(now.x).toBeCloseTo(start.x, 4);
    expect(now.y).toBeCloseTo(start.y, 4);
  });

  it("lights its approach for the nearest ship closing on its dock, and nothing for one holding still", () => {
    const sim = quiet();
    const station = sim.station;
    const dock = sim.dockPoint(false, station);
    const { ship } = sim;
    ship.x = ship.px = dock.x + 400;
    ship.y = ship.py = dock.y;
    const toward = Math.atan2(dock.y - ship.y, dock.x - ship.x);
    // Its dock's own motion, plus 40 a second straight at it.
    const before = sim.dockPoint(true, station);
    ship.vx = (dock.x - before.x) / TICK + Math.cos(toward) * 40;
    ship.vy = (dock.y - before.y) / TICK + Math.sin(toward) * 40;
    expect(stationArtState(sim, station).approach).toBeCloseTo(400, 0);
    ship.vx = (dock.x - before.x) / TICK;
    ship.vy = (dock.y - before.y) / TICK;
    expect(stationArtState(sim, station).approach).toBe(Infinity);
  });
});
