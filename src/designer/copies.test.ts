import { describe, expect, it } from "vitest";
import { bodyAt, orbitsAt } from "../sim";
import { bodiesFor, fieldsFor, linkedNodes } from "./link";
import { copiesOf, copyPositions, makeChild, parseWorld, positions, seedWorld, stringifyWorld } from "./world";

function satellites(count: number, angleVariance = 0, orbitVariance = 0) {
  const world = seedWorld();
  const { planet } = linkedNodes(world);
  const ring = makeChild(world, planet!, "asteroid");
  Object.assign(ring, { name: "Satellite", orbitRadius: 20000, orbitPhase: 10, count, angleVariance, orbitVariance });
  planet!.children.push(ring);
  return { world, planet: planet!, ring };
}

describe("copies round the same orbit", () => {
  it("are none for a count of one", () => {
    expect(copiesOf(satellites(1).ring)).toEqual([]);
  });

  it("space themselves evenly with no scatter, the first left exactly where it was", () => {
    const { ring } = satellites(4);
    const copies = copiesOf(ring);
    expect(copies.map((copy) => copy.orbitPhase)).toEqual([100, 190, 280]);
    expect(copies.every((copy) => copy.orbitRadius === 20000)).toBe(true);
  });

  it("scatter within the limits, the same way every time", () => {
    const { world, ring } = satellites(10, 100, 25);
    const copies = copiesOf(ring);
    copies.forEach((copy, index) => {
      const even = 10 + (index + 1) * 36;
      expect(Math.abs(copy.orbitPhase - even)).toBeLessThanOrEqual(18);
      expect(copy.orbitRadius).toBeGreaterThanOrEqual(15000);
      expect(copy.orbitRadius).toBeLessThanOrEqual(25000);
    });
    expect(new Set(copies.map((copy) => copy.orbitRadius)).size).toBeGreaterThan(1);
    expect(copiesOf(ring)).toEqual(copies);
    // And after a save and load.
    const again = parseWorld(stringifyWorld(world))!;
    expect(copiesOf(again.root.children[0].children.find((child) => child.name === "Satellite")!)).toEqual(copies);
  });

  it("are real bodies in the game, where the designer draws them", () => {
    const { world, ring } = satellites(6, 50, 10);
    const bodies = bodiesFor(world).filter((body) => body.name.startsWith("Satellite"));
    expect(bodies.length).toBe(6);
    const t = 1234;
    const at = positions(world, t);
    const centre = at.get(linkedNodes(world).planet!)!;
    const drawn = [at.get(ring)!, ...copyPositions(world, t, at).get(ring)!];
    bodies.forEach((body, index) => {
      expect(bodyAt(body, t).x).toBeCloseTo(drawn[index].x - centre.x, 3);
      expect(bodyAt(body, t).y).toBeCloseTo(drawn[index].y - centre.y, 3);
    });
  });

  it("of the planet the game centres on go round the star, not the planet", () => {
    const { world, planet } = satellites(1);
    planet.count = 2;
    const copy = bodiesFor(world).find((body) => body.name === "Planet 2")!;
    const t = 500;
    const at = positions(world, t);
    const drawn = copyPositions(world, t, at).get(planet)![0];
    expect(bodyAt(copy, t).x).toBeCloseTo(drawn.x - at.get(planet)!.x, 2);
    expect(bodyAt(copy, t).y).toBeCloseTo(drawn.y - at.get(planet)!.y, 2);
  });

  it("make every field but the first real rocks in the game, copies of the first too", () => {
    const world = seedWorld();
    const { planet, field } = linkedNodes(world);
    const second = makeChild(world, planet!, "field");
    Object.assign(second, { name: "Second", orbitRadius: 90000, rocks: 80, count: 2 });
    planet!.children.push(second);
    field!.count = 2;
    const fields = fieldsFor(world);
    expect(fields.map((each) => each.name)).toEqual(["Field 2", "Second", "Second 2"]);
    expect(new Set(fields.map((each) => each.id)).size).toBe(3);
    const t = 400;
    const at = positions(world, t);
    const there = orbitsAt(fields[1].orbits, t);
    expect(there.x).toBeCloseTo(at.get(second)!.x - at.get(planet!)!.x, 3);
    expect(fields[1]).toMatchObject({ radius: 5200, rocks: 80, carryFull: 2000, carryNone: 8000 });
  });

  it("old saves without copies have just the one", () => {
    const old = JSON.parse(stringifyWorld(seedWorld()));
    delete old.root.children[0].count;
    expect(parseWorld(JSON.stringify(old))!.root.children[0].count).toBe(1);
  });
});
