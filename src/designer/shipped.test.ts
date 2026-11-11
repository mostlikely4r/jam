import { describe, expect, it } from "vitest";
import { Sim, bodyAt } from "../sim";
import { roundTrip } from "../save";
import { DEFAULTS } from "../tuning";
import file from "./world.json";
import { useLayout, type GameLink } from "./link";
import { shippedWorld } from "./shipped";
import { parseWorld } from "./world";

/** The game's side of the link, as main sets it up, without the page. */
function linkTo(sim: Sim): GameLink {
  return {
    tuning: sim.tuning,
    clock: () => sim.now,
    phases: () => sim.orbitPhases(),
    where: () => ({ ship: sim.ship, field: sim.field }),
    apply(phases, bodies, spawns, fields, stations, keep = false) {
      sim.bodies = bodies;
      sim.spawns = spawns;
      sim.startPhases = phases;
      sim.applyLayout(keep ? {} : phases, fields, stations);
    },
  };
}

/** The nearest any body's ground comes to the edge of the field, now. */
function clearance(sim: Sim): number {
  return Math.min(
    ...sim.bodies.map((body) => {
      const at = bodyAt(body, sim.now);
      return Math.hypot(sim.field.x - at.x, sim.field.y - at.y) - body.radius - sim.tuning.fieldRadius;
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

  it("lays a save from before the planet out round it, keeping its places' angles", () => {
    // Made with the defaults alone, as the public game was before it shipped the world.
    const old = new Sim(3, { ...DEFAULTS });
    for (let i = 0; i < 60; i++) old.step();
    const sim = new Sim(1, { ...DEFAULTS });
    useLayout(shippedWorld(), linkTo(sim));
    roundTrip(old, sim);
    const angle = sim.field.orbitAngle;
    useLayout(shippedWorld(), linkTo(sim), true);
    expect(sim.field.orbitAngle).toBeCloseTo(angle, 6);
    expect(sim.field.orbitRadius).toBe(sim.tuning.fieldOrbitRadius);
    expect(clearance(sim)).toBeGreaterThan(0);
    expect(Math.hypot(sim.ship.x - sim.field.x, sim.ship.y - sim.field.y)).toBeLessThan(sim.tuning.fieldRadius * 3);
  });
});
