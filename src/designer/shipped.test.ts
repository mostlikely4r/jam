import { describe, expect, it } from "vitest";
import { Sim, bodyAt } from "../sim";
import { DEFAULTS } from "../tuning";
import file from "./world.json";
import { applyTo, shipMarks, useLayout, type GameLink } from "./link";
import { shippedWorld } from "./shipped";
import { parseWorld } from "./world";

/** The game's side of the link, as main sets it up, without the page. */
function linkTo(sim: Sim): GameLink {
  return {
    clock: () => sim.now,
    where: () => ({ ship: sim.ship, field: sim.field }),
    ships: () => [],
    apply: (layout) => applyTo(sim, layout),
  };
}

/** The nearest any body's ground comes to the edge of the field, now. */
function clearance(sim: Sim): number {
  return Math.min(
    ...sim.bodies.map((body) => {
      const at = bodyAt(body, sim.now);
      return Math.hypot(sim.field.x - at.x, sim.field.y - at.y) - body.radius - sim.field.reach;
    }),
  );
}

describe("the shipped world", () => {
  it("is the world file, read as the designer reads it", () => {
    expect(parseWorld(JSON.stringify(file))).not.toBeNull();
    expect(shippedWorld()).toEqual(parseWorld(JSON.stringify(file)));
  });

  it("gives a new game its bodies, with the field clear of them", () => {
    const sim = new Sim(1, { ...DEFAULTS });
    useLayout(shippedWorld(), linkTo(sim));
    sim.reset(2);
    expect(sim.bodies.length).toBeGreaterThan(0);
    expect(clearance(sim)).toBeGreaterThan(0);
  });

});

describe("the designer's ship marks", () => {
  it("lists every other ship with its speed, cargo ships included", () => {
    const sim = new Sim(1, { ...DEFAULTS });
    useLayout(shippedWorld(), linkTo(sim));
    sim.reset(1);
    for (let i = 0; i < 240; i++) sim.step();
    const marks = shipMarks(sim);
    expect(marks.length).toBe(sim.traffic.length + sim.fighters.length + sim.drones.length + sim.bases.filter((base) => base.hauler).length + (sim.blackMarket ? 1 : 0));
    expect(marks.some((mark) => mark.kind === "traffic")).toBe(true);
    for (const mark of marks) expect(Number.isFinite(Math.hypot(mark.vx, mark.vy))).toBe(true);
  });
});
