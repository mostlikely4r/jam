import { describe, expect, it } from "vitest";
import { roundTrip } from "./save";
import { Sim, TICK } from "./sim";
import { DEFAULTS } from "./tuning";

function run(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) {
    sim.step();
    sim.events.length = 0;
  }
}

describe("save and load", () => {
  it("carries on from where it was: the ship, the money, the world, and who's linked to whom", () => {
    const sim = new Sim(3, { ...DEFAULTS, haulers: true, depositFree: true, guardsDepositFree: true });
    run(sim, 30);
    sim.ship.credits = 1234;
    sim.ship.marked = true;
    sim.ores.push({ x: 1, y: 2, px: 1, py: 2, vx: 0, vy: 0, kind: 0, amount: 1, from: sim.ship });
    const into = new Sim(99, { ...DEFAULTS });
    roundTrip(sim, into);

    expect(into.ship.x).toBe(sim.ship.x);
    expect(into.ship.credits).toBe(1234);
    expect(into.ship.marked).toBe(true);
    expect([...into.ship.parts]).toEqual([...sim.ship.parts]);
    expect(into.rocks.length).toBe(sim.rocks.length);
    expect(into.traffic.length).toBe(sim.traffic.length);
    expect(into.traffic[0].ship.credits).toBe(sim.traffic[0].ship.credits);
    expect(into.fighters.map((pilot) => pilot.ship.faction)).toEqual(sim.fighters.map((pilot) => pilot.ship.faction));
    expect(into.deposits.length).toBe(sim.deposits.length);
    expect(into.pirateCredits).toBe(sim.pirateCredits);
    expect(into.now).toBe(sim.now);
    // The same ship everywhere it's mentioned, and the keys still fly it.
    expect(into.ores[into.ores.length - 1].from).toBe(into.ship);
    expect(into.ship.controls).toBe(into.controls);
    // The same random numbers from here on.
    expect(into.roll()).toBe(sim.roll());
    // And the world goes on.
    run(into, 10);
    expect(into.ship.hull).toBeGreaterThan(0);
  }, 30000);

  it("remembers the places found, which a new game forgets", () => {
    const sim = new Sim(1, { ...DEFAULTS });
    expect(sim.discovered.has("dock")).toBe(false);
    sim.ship.x = sim.dockPoint().x;
    sim.ship.y = sim.dockPoint().y;
    sim.step();
    expect(sim.discovered.has("dock")).toBe(true);
    const into = new Sim(2, { ...DEFAULTS });
    roundTrip(sim, into);
    expect(into.discovered.has("dock")).toBe(true);
    into.reset(3);
    // A new game forgets what was found, but knows the one field it starts beside: that
    // seed is the chart's, and it's the only entry.
    expect(into.discovered.size).toBe(1);
    expect(into.discovered.has("dock")).toBe(false);
  });

  it("a ship saved before a field existed gets it as new", () => {
    const sim = new Sim(1, { ...DEFAULTS });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (sim.ship as any).wanted;
    const into = new Sim(2, { ...DEFAULTS });
    roundTrip(sim, into);
    expect(into.ship.wanted).toBe(false);
  });
});
