import { describe, expect, it } from "vitest";
import { orbitState } from "../kepler";
import { homeSim } from "../home";
import { linkTo } from "../profile/world";
import { DOCK_OFFSET, Sim, TICK, bodyAt, orbitsAt } from "../sim";
import { DEFAULTS } from "../tuning";
import { anchorsFor, bodiesFor, fieldsFor, linkedNodes, pirateBaseFor, stationsFor, spawnsFor, useLayout } from "./link";
import { closestApproach, copiesOf, copyPositions, makeChild, orbitShape, orbitSpeed, parseWorld, positions, seedWorld, stringifyWorld, walk, type World, type WorldNode } from "./world";

/** The seeded system with an eccentric moon, field, station and anchor round the planet, and copies of the field. */
function eccentricWorld(): { world: World; planet: WorldNode; moon: WorldNode; field: WorldNode; station: WorldNode; anchor: WorldNode } {
  const world = seedWorld();
  const { planet } = linkedNodes(world);
  const moon = makeChild(world, planet!, "moon");
  Object.assign(moon, { name: "Moon", orbitRadius: 90000, orbitPeriod: 20000, orbitPhase: 30, eccentricity: 0.6, periapsisAngle: 70 });
  planet!.children.push(moon);
  const field = makeChild(world, planet!, "field");
  Object.assign(field, { name: "Far", orbitRadius: 150000, orbitPeriod: 30000, orbitPhase: 100, eccentricity: 0.4, periapsisAngle: 200, count: 3, orbitVariance: 10 });
  planet!.children.push(field);
  const station = makeChild(world, field, "station");
  Object.assign(station, { name: "Outpost", orbitRadius: 12000, orbitPeriod: 900, eccentricity: 0.3, periapsisAngle: 10 });
  field.children.push(station);
  const anchor = makeChild(world, planet!, "anchor");
  Object.assign(anchor, { name: "Mark", orbitRadius: 60000, orbitPeriod: 12000, eccentricity: 0.2, periapsisAngle: 300 });
  planet!.children.push(anchor);
  return { world, planet: planet!, moon, field, station, anchor };
}

describe("eccentric orbits in the designer", () => {
  it("keeps a circular world the way it was, in the file and on the map", () => {
    const world = seedWorld();
    const text = stringifyWorld(world);
    expect(text).not.toContain("eccentricity");
    expect(text).not.toContain("periapsisAngle");
    // A world saved before eccentricity reads as circles.
    expect(walk(parseWorld(text)!).every(({ node }) => node.eccentricity === 0 && node.periapsisAngle === 0)).toBe(true);
  });

  it("saves and loads an eccentricity, and keeps it to an ellipse", () => {
    const { world, moon } = eccentricWorld();
    const back = walk(parseWorld(stringifyWorld(world))!).find((entry) => entry.node.name === "Moon")!.node;
    expect(back.eccentricity).toBe(0.6);
    expect(back.periapsisAngle).toBe(70);
    moon.eccentricity = 3;
    expect(walk(parseWorld(stringifyWorld(world))!).find((entry) => entry.node.name === "Moon")!.node.eccentricity).toBe(0.9);
    moon.eccentricity = -1;
    expect(walk(parseWorld(stringifyWorld(world))!).find((entry) => entry.node.name === "Moon")!.node.eccentricity).toBe(0);
  });

  it("places a child on its ellipse with the parent at a focus", () => {
    const { world, planet, moon } = eccentricWorld();
    let near = Infinity;
    let far = 0;
    for (let t = 0; t < 20000; t += 20) {
      const at = positions(world, t);
      const distance = Math.hypot(at.get(moon)!.x - at.get(planet)!.x, at.get(moon)!.y - at.get(planet)!.y);
      near = Math.min(near, distance);
      far = Math.max(far, distance);
    }
    expect(near).toBeCloseTo(90000 * 0.4, -3);
    expect(far).toBeCloseTo(90000 * 1.6, -3);
  });

  it("shows the two speeds of an eccentric orbit", () => {
    const { moon } = eccentricWorld();
    const speeds = orbitSpeed(moon);
    expect(speeds.near / speeds.far).toBeCloseTo(1.6 / 0.4, 9);
    expect(orbitSpeed({ ...moon, eccentricity: 0 }).near).toBeCloseTo(orbitSpeed({ ...moon, eccentricity: 0 }).far, 9);
  });

  it("keeps the shape in copies, which are spread by mean angle and scaled by the orbit scatter", () => {
    const { world, field } = eccentricWorld();
    const copies = copiesOf(field);
    expect(copies).toHaveLength(2);
    for (const copy of copies) expect(orbitShape(field, copy)).toMatchObject({ eccentricity: 0.4, period: 30000 });
    // Each copy is on an ellipse of its own size round the same parent.
    const at = positions(world, 5000);
    const parent = at.get(linkedNodes(world).planet!)!;
    const drawn = copyPositions(world, 5000, at).get(field)!;
    copies.forEach((copy, i) => {
      const there = orbitState(orbitShape(field, copy), 5000);
      expect(drawn[i].x).toBeCloseTo(parent.x + there.x, 6);
      expect(drawn[i].y).toBeCloseTo(parent.y + there.y, 6);
    });
  });

  it("finds the closest approach of an eccentric orbit as a brute-force search does", () => {
    const { world, planet, moon } = eccentricWorld();
    // A big eccentric moon that swings in close to the planet.
    moon.eccentricity = 0.85;
    const found = closestApproach(world, planet, moon);
    let best = Infinity;
    for (let t = 0; t <= 20000; t += 1) {
      const at = positions(world, t);
      const gap = Math.hypot(at.get(moon)!.x - at.get(planet)!.x, at.get(moon)!.y - at.get(planet)!.y) - Math.max(planet.radius, planet.pull) - moon.radius;
      best = Math.min(best, gap);
    }
    // 90000 × 0.15 = 13500 away at the closest, less the planet's reach and the moon: well inside.
    expect(found.gap).toBeLessThan(0);
    expect(found.gap).toBeCloseTo(best, -1);
    expect(found.gap).toBeLessThanOrEqual(best + 1);
  });

  it("sizes a new child outside the farthest reach of its siblings' ellipses", () => {
    const { world, planet, moon } = eccentricWorld();
    const before = makeChild(world, planet, "moon");
    moon.eccentricity = 0;
    const circular = makeChild(world, planet, "moon");
    expect(before.orbitRadius).toBeGreaterThanOrEqual(circular.orbitRadius);
  });
});

describe("eccentric orbits in the game", () => {
  it("mirrors an eccentric orbit when the game's centre is the other end of the chain", () => {
    const shape = { radius: 40000, period: 5000, phase: 1, eccentricity: 0.5, periapsis: 2 };
    for (const t of [0, 1234, 4000]) {
      const forward = orbitsAt([{ ...shape, sign: 1 }], t);
      const mirrored = orbitsAt([{ ...shape, sign: -1 }], t);
      expect(mirrored.x).toBeCloseTo(-forward.x, 9);
      expect(mirrored.y).toBeCloseTo(-forward.y, 9);
      expect(mirrored.vx).toBeCloseTo(-forward.vx, 9);
      expect(mirrored.vy).toBeCloseTo(-forward.vy, 9);
      // A chain adds its ellipses: a moon on a planet on a star.
      const both = orbitsAt([{ ...shape, sign: 1 }, { ...shape, radius: 1000, period: 300, sign: 1 }], t);
      const moon = orbitsAt([{ ...shape, radius: 1000, period: 300, sign: 1 }], t);
      expect(both.x).toBeCloseTo(forward.x + moon.x, 9);
    }
  });

  it("hands the sim bodies, fields, stations, anchors and starts that agree with the designer's map", () => {
    const { world, planet, moon, field, station, anchor } = eccentricWorld();
    anchor.spawns = ["floater"];
    const bodies = bodiesFor(world);
    const fields = fieldsFor(world);
    const stations = stationsFor(world);
    const anchors = anchorsFor(world);
    const spawns = spawnsFor(world);
    for (const t of [0, 777, 12345, 98765]) {
      const at = positions(world, t);
      const centre = at.get(planet)!;
      const copyAt = copyPositions(world, t, at);
      const check = (spot: { x: number; y: number }, node: WorldNode, copy = -1) => {
        const want = copy < 0 ? at.get(node)! : copyAt.get(node)![copy];
        expect(spot.x).toBeCloseTo(want.x - centre.x, 3);
        expect(spot.y).toBeCloseTo(want.y - centre.y, 3);
      };
      check(bodyAt(bodies.find((body) => body.name === "Moon")!, t), moon);
      // The seeded field first, then the far one and its copies.
      fields.filter((spec) => spec.name.startsWith("Far")).forEach((spec, i) => check(orbitsAt(spec.orbits, t), field, i - 1 < 0 ? -1 : i - 1));
      check(orbitsAt(stations.find((spec) => spec.name === "Outpost")!.orbits, t), station);
      check(orbitsAt(anchors.find((spec) => spec.name === "Mark")!.orbits, t), anchor);
      check(orbitsAt(spawns[0].orbits, t), anchor);
    }
  });

  it("gives each ring the shape of the orbit, round the parent", () => {
    const { world } = eccentricWorld();
    const spec = stationsFor(world).find((each) => each.name === "Outpost")!;
    const [ring] = spec.rings!;
    expect(ring).toMatchObject({ radius: 12000, eccentricity: 0.3 });
    expect(ring.periapsis).toBeCloseTo((10 * Math.PI) / 180, 9);
    // The thing stays between the ring's nearest and farthest points from its parent.
    for (const t of [0, 300, 4000]) {
      const at = orbitsAt(spec.orbits, t);
      const round = orbitsAt(ring.center, t);
      const distance = Math.hypot(at.x - round.x, at.y - round.y);
      expect(distance).toBeGreaterThanOrEqual(12000 * 0.7 - 1e-6);
      expect(distance).toBeLessThanOrEqual(12000 * 1.3 + 1e-6);
    }
  });

  it("flies the first field, station and pirate base on their ellipses, as their own orbits", () => {
    const world = seedWorld();
    const { field, station, pirates } = linkedNodes(world);
    Object.assign(field!, { eccentricity: 0.3, periapsisAngle: 40, rocks: 0 });
    Object.assign(station!, { eccentricity: 0.2, periapsisAngle: 100 });
    Object.assign(pirates!, { eccentricity: 0.1, periapsisAngle: 200 });
    const tuning = { ...DEFAULTS, testDrones: 0, pirates: 1 };
    // Each one's own ellipse comes as the last of its orbits.
    const lair = pirateBaseFor(world)!.orbits.at(-1)!;
    expect(lair.eccentricity).toBe(0.1);
    expect(lair.periapsis).toBeCloseTo((200 * Math.PI) / 180, 9);
    const own = fieldsFor(world)[0].orbits.at(-1)!;
    expect(own.eccentricity).toBe(0.3);
    expect(own.periapsis).toBeCloseTo((40 * Math.PI) / 180, 9);
    const dock = stationsFor(world)[0].orbits.at(-1)!;
    expect(dock.eccentricity).toBe(0.2);
    expect(dock.periapsis).toBeCloseTo((100 * Math.PI) / 180, 9);
    const sim = new Sim(1, tuning);
    useLayout(world, linkTo(sim));
    for (let i = 0; i < 2000; i++) sim.step();
    for (const poi of [sim.field, sim.station, sim.pirateBase!]) {
      // Where the sim says it is now is where it says it will be.
      const there = sim.poiAt(poi, sim.now);
      expect(poi.x).toBeCloseTo(there.x, 6);
      expect(poi.y).toBeCloseTo(there.y, 6);
    }
    // The field's own distance from the middle swings between a(1 − e) and a(1 + e).
    let near = Infinity;
    let far = 0;
    for (let t = 0; t < 10800; t += 30) {
      const spot = sim.poiAt(sim.field, t);
      near = Math.min(near, Math.hypot(spot.x, spot.y));
      far = Math.max(far, Math.hypot(spot.x, spot.y));
    }
    expect(near).toBeCloseTo(60000 * 0.7, -2);
    expect(far).toBeCloseTo(60000 * 1.3, -2);
  });

  it("carries things near an eccentric station along with its changing speed", () => {
    const sim = homeSim(1, {
      ...DEFAULTS,
      rockCount: 0,
      testDrones: 0,
      pirates: 0,
      trafficRacers: 0,
      trafficFloaters: 0,
      fieldOrbitRadius: 0,
      fieldRotationPeriod: 0,
      // Far enough out that even at its closest the station is well clear of the field.
      stationDistance: 30000,
      orbitPeriod: 300,
      stationEccentricity: 0.5,
      stationRotationPeriod: 60,
    });
    sim.ship.x = sim.station.x + DOCK_OFFSET;
    sim.ship.y = sim.station.y;
    const speeds: number[] = [];
    for (let i = 0; i < Math.round(300 / TICK); i++) {
      sim.step();
      speeds.push(Math.hypot(sim.station.x - sim.station.px, sim.station.y - sim.station.py) / TICK);
    }
    // The ship went with the station the whole way round: still docked, though the station's speed changed a lot.
    expect(sim.isDocked()).toBe(true);
    expect(Math.hypot(sim.ship.x - sim.station.x, sim.ship.y - sim.station.y)).toBeCloseTo(DOCK_OFFSET, 3);
    // Fastest at its closest, slowest at its farthest: the ratio of the two ends.
    const ratio = Math.max(...speeds) / Math.min(...speeds);
    expect(ratio).toBeGreaterThan(2.8);
    expect(ratio).toBeLessThan(3.2);
  });
});
