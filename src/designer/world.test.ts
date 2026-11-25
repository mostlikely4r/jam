import { describe, expect, it } from "vitest";
import { closestApproach, cloudRadius, makeChild, parseWorld, positions, seedWorld, spinAngle, stringifyWorld, walk, type World } from "./world";
import shipped from "./world.json";

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

  it("writes every node's keys in one order, however the node was made", () => {
    const world = seedWorld();
    const text = stringifyWorld(world);
    const shuffle = (node: World["root"]): World["root"] => {
      const keys = Object.keys(node).reverse() as (keyof World["root"])[];
      const out = Object.fromEntries(keys.map((key) => [key, key === "children" ? node.children.map(shuffle) : node[key]]));
      return out as unknown as World["root"];
    };
    expect(stringifyWorld({ ...world, root: shuffle(world.root) })).toBe(text);
    // The shipped file is already in that order: saving it unchanged changes nothing.
    expect(stringifyWorld(parseWorld(text)!)).toBe(text);
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

  it("starts a spin at its start angle and turns on from there", () => {
    const planet = find(seedWorld(), "planet");
    planet.spinPeriod = 100;
    planet.spinPhase = 90;
    expect(spinAngle(planet, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(spinAngle(planet, 25)).toBeCloseTo(Math.PI, 9);
    planet.spinPeriod = 0;
    expect(spinAngle(planet, 500)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("loads a world with no spin start angle as 0, and keeps one that has it", () => {
    const world = seedWorld();
    const text = stringifyWorld(world);
    expect(text).not.toContain("spinPhase");
    expect(find(parseWorld(text)!, "planet").spinPhase).toBe(0);
    find(world, "planet").spinPhase = 33;
    expect(find(parseWorld(stringifyWorld(world))!, "planet").spinPhase).toBe(33);
  });

  it("survives a save and load as a cloud, with its own settings", () => {
    const world = seedWorld();
    const cloud = makeChild(world, find(world, "field"), "cloud");
    Object.assign(cloud, { name: "Nebula", look: "dust", color: "#b9a089", width: 8000, height: 4000, ringInner: 0.3, falloff: 0.2, opacity: 0.75, layer: "front", drawOrder: 4 });
    cloud.radius = cloudRadius(cloud.width, cloud.height);
    find(world, "field").children.push(cloud);
    const read = parseWorld(stringifyWorld(world))!;
    expect(find(read, cloud.id)).toEqual(cloud);
  });

  it("takes a cloud's reach from its own sides, whichever way it is stretched", () => {
    const world = seedWorld();
    const cloud = makeChild(world, find(world, "field"), "cloud");
    Object.assign(cloud, { width: 9000, height: 3000 });
    cloud.radius = 1;
    find(world, "field").children.push(cloud);
    expect(find(parseWorld(stringifyWorld(world))!, cloud.id).radius).toBe(4500);
  });

  it("clamps a cloud's bad numbers rather than taking them", () => {
    const world = seedWorld();
    const cloud = makeChild(world, find(world, "field"), "cloud");
    find(world, "field").children.push(cloud);
    const raw = JSON.parse(stringifyWorld(world));
    const findRaw = (node: Record<string, unknown>): Record<string, unknown> =>
      node.id === cloud.id ? node : (node.children as Record<string, unknown>[]).map(findRaw).find(Boolean) as Record<string, unknown>;
    const there = findRaw(raw.root);
    Object.assign(there, { width: -20, height: 0, ringInner: 5, falloff: -2, opacity: 2, drawOrder: 3.7, look: "smoke", layer: "sideways", color: "blue" });
    const read = find(parseWorld(JSON.stringify(raw))!, cloud.id);
    expect(read).toMatchObject({ width: 1, height: 1, radius: 0.5, ringInner: 1, falloff: 0, opacity: 1, drawOrder: 4, look: "gas", layer: "back", color: "#7fb2e6" });
  });

  it("saves no cloud's settings on a node that isn't a cloud", () => {
    const world = parseWorld(JSON.stringify(shipped))!;
    const dropClouds = (node: World["root"]): void => {
      node.children = node.children.filter((child) => child.kind !== "cloud");
      node.children.forEach(dropClouds);
    };
    dropClouds(world.root);
    const text = stringifyWorld(world);
    for (const key of ["look", "color", "width", "height", "ringInner", "falloff", "opacity", "layer", "drawOrder"]) {
      expect(text).not.toContain(`"${key}"`);
    }
    expect(stringifyWorld(parseWorld(text)!)).toBe(text);
  });
});
