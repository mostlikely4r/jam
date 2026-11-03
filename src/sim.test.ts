import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./tuning";
import { DOCK_OFFSET, MAX_HULL, Sim, STATION_HALF, TICK } from "./sim";

function emptySim(): Sim {
  const sim = new Sim(1, { ...DEFAULTS, rockCount: 0 });
  sim.ship.x = 0;
  sim.ship.y = 0;
  return sim;
}

function run(sim: Sim, seconds: number): void {
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i++) sim.step();
}

describe("flight", () => {
  it("keeps speed after thrust stops, with no cap", () => {
    const sim = emptySim();
    sim.controls.thrust = 1;
    run(sim, 10);
    const speed = sim.ship.vx;
    expect(speed).toBeCloseTo(DEFAULTS.thrust * 10, 0);
    sim.controls.thrust = 0;
    run(sim, 2);
    expect(sim.ship.vx).toBeCloseTo(speed, 5);
  });
});

describe("thrusters", () => {
  const degrees = (radians: number) => (radians * 180) / Math.PI;

  it("rotation accelerates and keeps spinning after input stops", () => {
    const sim = emptySim();
    sim.controls.turn = 1;
    run(sim, 1);
    expect(degrees(sim.ship.spin)).toBeCloseTo(DEFAULTS.rotationThrust, 3);
    sim.controls.turn = 0;
    const spin = sim.ship.spin;
    run(sim, 1);
    expect(sim.ship.spin).toBe(spin);
  });

  it("strafes sideways without turning", () => {
    const sim = emptySim();
    sim.controls.strafe = 1;
    run(sim, 1);
    expect(sim.ship.vy).toBeCloseTo(DEFAULTS.sideThrust, 3);
    expect(sim.ship.vx).toBeCloseTo(0, 5);
    expect(sim.ship.angle).toBe(0);
  });

  it("weight divides every thruster's effect", () => {
    const sim = emptySim();
    sim.tuning.weight = 2;
    sim.controls.thrust = 1;
    sim.controls.strafe = 1;
    run(sim, 0.5);
    expect(sim.ship.vx).toBeCloseTo(DEFAULTS.thrust / 4, 3);
    expect(sim.ship.vy).toBeCloseTo(DEFAULTS.sideThrust / 4, 3);

    const spinning = emptySim();
    spinning.tuning.weight = 2;
    spinning.controls.turn = 1;
    run(spinning, 0.5);
    expect(degrees(spinning.ship.spin)).toBeCloseTo(DEFAULTS.rotationThrust / 4, 3);
  });

  it("does nothing when a commanded thruster is disabled", () => {
    const sim = emptySim();
    sim.tuning.thrusterMain = false;
    sim.controls.thrust = 1;
    run(sim, 1);
    expect(sim.ship.vx).toBe(0);
    expect(sim.ship.firing.size).toBe(0);
  });

  it("retro stops rotation and translation", () => {
    const sim = emptySim();
    sim.tuning.retro = true;
    sim.ship.vx = 150;
    sim.ship.vy = -80;
    sim.ship.spin = 2;
    run(sim, 5);
    expect(sim.ship.vx).toBeCloseTo(0, 5);
    expect(sim.ship.vy).toBeCloseTo(0, 5);
    expect(sim.ship.spin).toBe(0);
    expect(sim.ship.firing.size).toBe(0);
  });

  it("retro leaves an axis alone while the pilot commands it", () => {
    const sim = emptySim();
    sim.tuning.retro = true;
    sim.controls.thrust = 1;
    run(sim, 1);
    expect(sim.ship.vx).toBeCloseTo(DEFAULTS.thrust, 3);
  });

  it("retro can't stop motion that needs a disabled thruster", () => {
    const sim = emptySim();
    sim.tuning.retro = true;
    sim.tuning.thrusterReverse = false;
    sim.ship.vx = 100;
    run(sim, 2);
    expect(sim.ship.vx).toBe(100);
  });
});

describe("impacts", () => {
  it("does not let a very fast ship pass through a rock", () => {
    const sim = emptySim();
    sim.tuning.damagePerSpeed = 0; // Otherwise this impact wrecks and respawns the ship.
    sim.rocks.push(sim.makeRock(2, 200, 0, 0, 0));
    sim.ship.vx = 50000;
    sim.step();
    expect(sim.ship.x).toBeLessThan(200);
    expect(sim.ship.vx).toBeLessThan(0);
  });

  it("dents the hull only above the safe impact speed", () => {
    const sim = emptySim();
    sim.rocks.push(sim.makeRock(2, 100, 0, 0, 0));
    sim.ship.vx = DEFAULTS.safeImpactSpeed / 2;
    run(sim, 1);
    expect(sim.ship.hull).toBe(MAX_HULL);

    const fast = emptySim();
    fast.rocks.push(fast.makeRock(2, 100, 0, 0, 0));
    fast.ship.vx = 300;
    run(fast, 0.5);
    expect(fast.ship.hull).toBeLessThan(MAX_HULL);
    expect(fast.ship.hull).toBeGreaterThan(0);
  });

  it("wrecks the ship and loses cargo at zero hull", () => {
    const sim = emptySim();
    sim.stats.ore = 5;
    sim.ship.hull = 1;
    sim.rocks.push(sim.makeRock(2, 100, 0, 0, 0));
    sim.ship.vx = 1000;
    run(sim, 0.2);
    expect(sim.stats.wrecks).toBe(1);
    expect(sim.stats.ore).toBe(0);
    expect(sim.ship.hull).toBe(MAX_HULL);
  });
});

describe("station", () => {
  /** Puts the ship at rest relative to the station, in the middle of the dock. */
  function dockedSim(): Sim {
    const sim = emptySim();
    sim.ship.x = sim.station.x + DOCK_OFFSET;
    sim.ship.y = sim.station.y;
    sim.ship.vx = sim.station.vx;
    sim.ship.vy = sim.station.vy;
    return sim;
  }

  it("orbits the field on a fixed circle, moving slowly", () => {
    const sim = emptySim();
    sim.tuning.orbitPeriod = 60;
    const start = Math.atan2(sim.station.y, sim.station.x);
    const radius = sim.station.orbitRadius;
    run(sim, 15);
    expect(Math.hypot(sim.station.x, sim.station.y)).toBeCloseTo(radius, 5);
    const moved = Math.atan2(sim.station.y, sim.station.x) - start;
    const quarterTurn = Math.abs(Math.abs(moved) % (Math.PI * 2));
    expect(Math.min(quarterTurn, Math.PI * 2 - quarterTurn)).toBeCloseTo(Math.PI / 2, 2);
  });

  it("does not let a very fast ship pass through the solid box", () => {
    const sim = emptySim();
    sim.tuning.damagePerSpeed = 0;
    sim.ship.x = sim.station.x - 300;
    sim.ship.y = sim.station.y;
    sim.ship.vx = sim.station.vx + 50000;
    sim.ship.vy = sim.station.vy;
    sim.step();
    expect(sim.ship.x).toBeLessThan(sim.station.x - STATION_HALF);
    expect(sim.ship.vx - sim.station.vx).toBeLessThan(0);
  });

  it("dents the hull like a rock when hit hard", () => {
    const sim = emptySim();
    sim.ship.x = sim.station.x - 200;
    sim.ship.y = sim.station.y;
    sim.ship.vx = sim.station.vx + 300;
    sim.ship.vy = sim.station.vy;
    run(sim, 0.5);
    expect(sim.ship.hull).toBeLessThan(MAX_HULL);
  });

  it("flies through the dock box instead of colliding", () => {
    const sim = dockedSim();
    sim.ship.vx += 100;
    sim.tuning.dockDrag = 0;
    run(sim, 0.5);
    expect(sim.ship.vx - sim.station.vx).toBeCloseTo(100, 0);
    expect(sim.ship.hull).toBe(MAX_HULL);
  });

  it("slows the ship only slightly in the dock", () => {
    const sim = dockedSim();
    sim.ship.vx += 100;
    run(sim, 1);
    const relative = sim.ship.vx - sim.station.vx;
    expect(relative).toBeLessThan(100);
    expect(relative).toBeGreaterThan(60);
  });

  it("turns ore into credits only while docked", () => {
    const sim = dockedSim();
    sim.stats.ore = 5;
    run(sim, 1);
    expect(sim.stats.ore).toBe(0);
    expect(sim.stats.credits).toBe(5 * DEFAULTS.creditsPerOre);

    const away = emptySim();
    away.stats.ore = 5;
    run(away, 1);
    expect(away.stats.ore).toBe(5);
    expect(away.stats.credits).toBe(0);
  });

  it("keeps credits when the ship is wrecked", () => {
    const sim = emptySim();
    sim.stats.credits = 70;
    sim.stats.ore = 3;
    sim.ship.hull = 1;
    sim.rocks.push(sim.makeRock(2, 100, 0, 0, 0));
    sim.ship.vx = 1000;
    run(sim, 0.2);
    expect(sim.stats.wrecks).toBe(1);
    expect(sim.stats.ore).toBe(0);
    expect(sim.stats.credits).toBe(70);
  });

  it("retro brakes relative to the station inside the dock", () => {
    const sim = dockedSim();
    sim.tuning.retro = true;
    sim.tuning.dockDrag = 0;
    sim.ship.vx += 30;
    run(sim, 2);
    expect(sim.ship.vx - sim.station.vx).toBeCloseTo(0, 1);
    expect(sim.ship.vy - sim.station.vy).toBeCloseTo(0, 1);
  });
});

describe("mining", () => {
  it("breaks a rock into smaller rocks after enough shots", () => {
    const sim = emptySim();
    const rock = sim.makeRock(2, 300, 0, 0, 0);
    sim.rocks.push(rock);
    const hp = rock.hp;
    sim.controls.fire = true;
    run(sim, (hp + 2) / DEFAULTS.shotsPerSecond + 0.5);
    expect(sim.rocks).not.toContain(rock);
    expect(sim.rocks.length).toBeGreaterThan(0);
    expect(sim.rocks.every((r) => r.tier < 2)).toBe(true);
  });

  it("collects ore on contact", () => {
    const sim = emptySim();
    sim.tuning.oreChance = 1;
    const rock = sim.makeRock(0, 0, 0, 0, 0);
    sim.breakRock(rock);
    expect(sim.ores.length).toBe(1);
    run(sim, TICK);
    expect(sim.stats.ore).toBe(1);
    expect(sim.ores.length).toBe(0);
  });

  it("builds the same field from the same seed", () => {
    const a = new Sim(7);
    const b = new Sim(7);
    expect(a.rocks.map((r) => [r.x, r.y, r.tier])).toEqual(b.rocks.map((r) => [r.x, r.y, r.tier]));
  });
});
