import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./tuning";
import { MAX_HULL, Sim, TICK } from "./sim";

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
