import { describe, expect, it } from "vitest";
import { stationsFor } from "./link";
import { RECIPES } from "./recipes";
import { shippedWorld } from "./shipped";
import { walk } from "./world";

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
    expect(spec.blueprints).toEqual(["tractorAll"]);
    expect(spec.shipyard).toBe(true);
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
    const dock = sim.dockPoint(false, far.poi);
    Object.assign(ship, { x: dock.x, y: dock.y, px: dock.x, py: dock.y, vx: 0, vy: 0 });
    expect(sim.buyPart(ship, "tractorAll")).toBe(true);
  });
});
