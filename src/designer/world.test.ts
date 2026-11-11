import { describe, expect, it } from "vitest";
import { closestApproach, makeChild, parseWorld, positions, seedWorld, stringifyWorld, walk, type World } from "./world";

const find = (world: World, id: string) => walk(world).find((entry) => entry.node.id === id)!.node;

describe("world layout", () => {
  it("places children on their orbit around a moving parent", () => {
    const world = seedWorld();
    const planet = find(world, "planet");
    const field = find(world, "field");
    for (const t of [0, 1234, 50000]) {
      const at = positions(world, t);
      const p = at.get(planet)!;
      const f = at.get(field)!;
      expect(Math.hypot(f.x - p.x, f.y - p.y)).toBeCloseTo(field.orbitRadius, 3);
    }
  });

  it("goes once round in one orbit period", () => {
    const world = seedWorld();
    const field = find(world, "field");
    const planet = find(world, "planet");
    planet.orbitPeriod = 0;
    const start = positions(world, 0).get(field)!;
    const later = positions(world, field.orbitPeriod).get(field)!;
    expect(later.x).toBeCloseTo(start.x, 3);
    expect(later.y).toBeCloseTo(start.y, 3);
  });

  it("survives a save and load", () => {
    const world = seedWorld();
    makeChild(world, world.root, "planet");
    expect(parseWorld(stringifyWorld(world))).toEqual(world);
  });

  it("refuses something that isn't a world", () => {
    expect(parseWorld("{}")).toBeNull();
    expect(parseWorld("not json")).toBeNull();
    expect(parseWorld(JSON.stringify({ version: 1, root: { id: "a", kind: "teapot" } }))).toBeNull();
  });

  it("finds how close the station comes to the seeded planet's pull", () => {
    const world = seedWorld();
    const pass = closestApproach(world, find(world, "planet"), find(world, "station"));
    // Field at 60,000, station 10,200 out from it, both going round: nearest is 49,800 from the centre.
    expect(pass.gap).toBeCloseTo(49800 - 30000 - 300, -1);
  });

  it("finds a clear pass when the field is moved out", () => {
    const world = seedWorld();
    find(world, "field").orbitRadius = 60000;
    const pass = closestApproach(world, find(world, "planet"), find(world, "station"));
    expect(pass.gap).toBeGreaterThan(0);
  });
});
