/**
 * The designer's first field and station are ordinary places in the game: what the designer
 * says about them is what the game plays, with nothing copied through the tuning
 * (docs/home-pair-plan.md).
 */
import { describe, expect, it } from "vitest";
import { linkTo } from "../profile/world";
import { Sim } from "../sim";
import { DEFAULTS } from "../tuning";
import { fieldsFor, linkedNodes, useLayout } from "./link";
import { seedWorld } from "./world";

describe("the designer's first field", () => {
  it("plays with the designer's own size, rocks and carrying", () => {
    const world = seedWorld();
    const { field } = linkedNodes(world);
    Object.assign(field!, { radius: 3100, rocks: 77, rockDrift: 3, rockInflow: 0, carryFull: 900, carryNone: 4000 });
    const sim = new Sim(1, { ...DEFAULTS, chatter: false });
    useLayout(world, linkTo(sim));
    sim.reset(1);
    const [first] = sim.miningFields();
    expect(first.id).toBe(fieldsFor(world)[0].id);
    expect(first.radius).toBe(3100);
    expect(first.full).toBe(77);
    expect(sim.field).toBe(first.poi);
    expect(sim.carryRange(sim.field)).toEqual({ full: 900, none: 4000 });
    // Its rocks are its own count, laid within its own size (a few are left out, clear of the new ship).
    const near = sim.rocks.filter((rock) => Math.hypot(rock.x - sim.field.x, rock.y - sim.field.y) <= 3100 + 1);
    expect(near.length).toBe(sim.rocks.length);
    expect(near.length).toBeGreaterThan(60);
    expect(near.length).toBeLessThanOrEqual(77);
  });
});
