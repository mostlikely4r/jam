import { describe, expect, it } from "vitest";
import { moduleIds } from "../items";
import { stationsFor } from "./link";
import { RECIPES } from "./recipes";
import { shippedWorld } from "./shipped";
import { walk, type WorldNode } from "./world";
import { partOn, resolveParts } from "../frameParts";

describe("layout recipes", () => {
  it("far-base adds one field round the planet and a base round it, holding the all-round tractor, however often it runs", () => {
    const world = shippedWorld();
    RECIPES["far-base"].apply(world);
    const lines = RECIPES["far-base"].apply(world);
    const bases = walk(world).filter((entry) => entry.node.name === "Planet base");
    expect(bases).toHaveLength(1);
    expect(bases[0].parent?.name).toBe("Planet field");
    const fields = walk(world).filter((entry) => entry.node.name === "Planet field");
    expect(fields).toHaveLength(1);
    expect(fields[0].parent?.kind).toBe("planet");
    const spec = stationsFor(world).find((station) => station.name === "Planet base")!;
    const parts = resolveParts(spec.frame!, spec.parts);
    expect(partOn(parts, "shop")?.data.unlocked).toEqual(moduleIds());
    // It wants every module but the all-round tractor, like every station.
    expect(partOn(parts, "shop")?.data.wanted).toEqual(moduleIds().filter((id) => id !== "tractorAll"));
    expect(partOn(parts, "shipyard")).toBeDefined();
    expect(lines.some((line) => line.includes("Racer"))).toBe(true);
  });
});

describe("the shipped world", () => {
  it("has a base round the planet that sells the all-round tractor to a racer, and the home station doesn't", async () => {
    const { Sim } = await import("../sim");
    const { DEFAULTS } = await import("../tuning");
    const { useShippedWorld } = await import("../profile/world");
    const sim = new Sim(1, { ...DEFAULTS, floaterStart: false, chatter: false });
    useShippedWorld(sim);
    const far = sim.bases.find((base) => base.spec?.name === "Planet base")!;
    expect(far).toBeDefined();
    const { ship } = sim;
    ship.credits = 100000;
    expect(sim.buyPart(ship, "tractorAll")).toBe(false);
    const dock = sim.dockPoint(false, far.body);
    Object.assign(ship, { x: dock.x, y: dock.y, px: dock.x, py: dock.y, vx: 0, vy: 0 });
    expect(sim.buyPart(ship, "tractorAll")).toBe(true);
  });

  it("full-system gives every planet two moons with ten fields each, the same however often it runs, and no planet's moons meet another's", () => {
    const world = shippedWorld();
    RECIPES["full-system"].apply(world);
    const once = walk(world).length;
    RECIPES["full-system"].apply(world);
    expect(walk(world).length).toBe(once);
    const planets = world.root.children.filter((child) => child.kind === "planet");
    for (const planet of planets) expect(planet.children.filter((child) => child.kind === "moon").length).toBeGreaterThanOrEqual(2);
    const fields = walk(world).reduce((sum, entry) => sum + (entry.node.kind === "field" ? entry.node.count : 0), 0);
    expect(fields).toBeGreaterThanOrEqual(180);
    // Neighbours' widest reach, moons and rings and all, never overlaps.
    const reach = (node: WorldNode): number => Math.max(node.radius, node.pull, ...node.children.map((child) => child.orbitRadius + reach(child)));
    const order = [...world.root.children].sort((a, b) => a.orbitRadius - b.orbitRadius);
    for (let i = 1; i < order.length; i++) {
      expect(order[i].orbitRadius - reach(order[i]), `${order[i - 1].name} and ${order[i].name}`).toBeGreaterThan(order[i - 1].orbitRadius + reach(order[i - 1]));
    }
  });
});
