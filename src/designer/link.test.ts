import { describe, expect, it } from "vitest";
import { bodyAt, orbitsAt } from "../sim";
import { DEFAULTS } from "../tuning";
import { bodiesFor, linkSummary, linkedNodes, phasesFromWorld, readGame, spawnsFor, stationsFor, writeGame } from "./link";
import { limitCarrying, makeChild, parseWorld, positions, seedWorld, stringifyWorld, walk } from "./world";

describe("the link between the designer and the game", () => {
  it("finds the planet, field, station and pirate base", () => {
    const { planet, field, station, pirates } = linkedNodes(seedWorld());
    expect([planet?.id, field?.id, station?.id, pirates?.id]).toEqual(["planet", "field", "station", "pirates"]);
  });

  it("writes the layout into the tuning", () => {
    const tuning = { ...DEFAULTS };
    writeGame(seedWorld(), tuning);
    expect(tuning.fieldOrbitRadius).toBe(60000);
    expect(tuning.fieldOrbitPeriod).toBe(10800);
    // Measured from the field's edge in the game, from its centre in the designer.
    expect(tuning.fieldRadius + tuning.stationDistance).toBe(10200);
    expect(tuning.fieldRadius + tuning.pirateBaseDistance).toBe(9200);
  });

  it("writes each place's rocks and carrying, no outer edge meaning everywhere", () => {
    const world = seedWorld();
    const { field, station } = linkedNodes(world);
    Object.assign(field!, { rocks: 300, rockDrift: 5, rockInflow: 2, carryFull: 1000, carryNone: 9000 });
    Object.assign(station!, { carryFull: 0, carryNone: 0 });
    const tuning = { ...DEFAULTS };
    writeGame(world, tuning);
    expect([tuning.rockCount, tuning.rockDrift, tuning.rockInflow]).toEqual([300, 5, 2]);
    expect([tuning.fieldCarryFull, tuning.fieldCarryNone]).toEqual([1000, 9000]);
    expect([tuning.stationCarryFull, tuning.stationCarryNone]).toEqual([Infinity, Infinity]);
  });

  it("starts each place carrying only what's near it, and brings old drafts carrying everywhere into line", () => {
    const world = seedWorld();
    const { field, station, pirates: pirateBase } = linkedNodes(world);
    expect([field!.carryFull, field!.carryNone]).toEqual([2000, 8000]);
    expect([station!.carryFull, station!.carryNone]).toEqual([2000, 6000]);
    Object.assign(field!, { carryFull: 0, carryNone: 0 });
    Object.assign(pirateBase!, { carryFull: 0, carryNone: 0 });
    Object.assign(station!, { carryFull: 500, carryNone: 3000 });
    limitCarrying(world);
    expect([field!.carryNone, pirateBase!.carryNone, station!.carryNone]).toEqual([8000, 6000, 3000]);
  });

  it("starts new games where the designer says, copies included, by ship", () => {
    const world = seedWorld();
    const { planet } = linkedNodes(world);
    const anchor = makeChild(world, planet!, "anchor");
    Object.assign(anchor, { name: "Start", orbitRadius: 40000, count: 3, spawns: ["floater"] });
    planet!.children.push(anchor);
    const spawns = spawnsFor(world);
    expect(spawns.length).toBe(3);
    expect(spawns.every((spawn) => spawn.ship === "floater")).toBe(true);
    const at = positions(world, 300);
    const there = orbitsAt(spawns[0].orbits, 300);
    expect(there.x).toBeCloseTo(at.get(anchor)!.x - at.get(planet!)!.x, 3);
    expect(linkSummary(world)).toContain("racer: by the field, floater: Start");
  });

  it("only takes the places' angles from the game, keeping its own numbers", () => {
    const world = seedWorld();
    readGame(world, { field: 1 });
    expect(linkedNodes(world).field?.orbitRadius).toBe(60000);
  });

  it("shows the game's real place on the orbit, as a tidy angle", () => {
    const world = seedWorld();
    readGame(world, { field: -Math.PI / 2, station: 3 * Math.PI });
    const { field, station } = linkedNodes(world);
    expect(field?.orbitPhase).toBe(270);
    expect(station?.orbitPhase).toBe(180);
    expect(phasesFromWorld(world).field).toBeCloseTo((3 * Math.PI) / 2, 9);
  });

  it("hands over every body, placed round what the field orbits", () => {
    const world = seedWorld();
    const { planet } = linkedNodes(world);
    const moon = makeChild(world, planet!, "moon");
    moon.orbitPhase = 40;
    planet!.children.push(moon);
    const bodies = bodiesFor(world);
    expect(bodies.map((body) => body.name)).toEqual(["Star", "Planet", "Moon"]);
    for (const t of [0, 5000, 90000]) {
      const at = positions(world, t);
      const centre = at.get(planet!)!;
      walk(world)
        .map((entry) => entry.node)
        .filter((node) => bodies.some((body) => body.name === node.name))
        .forEach((node) => {
          const game = bodyAt(bodies.find((body) => body.name === node.name)!, t);
          expect(game.x).toBeCloseTo(at.get(node)!.x - centre.x, 3);
          expect(game.y).toBeCloseTo(at.get(node)!.y - centre.y, 3);
        });
    }
    expect(bodies[1]).toMatchObject({ radius: 12000, surface: "death", pullStart: 30000, pullFull: 15000, pullAccel: 150 });
  });

  it("keeps the planet in the game when the field orbits an invisible anchor round it", () => {
    const world = seedWorld();
    const { planet, field } = linkedNodes(world);
    const anchor = makeChild(world, planet!, "anchor");
    planet!.children = [anchor];
    anchor.children = [field!];
    const game = bodiesFor(world).find((body) => body.name === "Planet")!;
    const at = positions(world, 777);
    const expected = { x: at.get(planet!)!.x - at.get(anchor)!.x, y: at.get(planet!)!.y - at.get(anchor)!.y };
    expect(bodyAt(game, 777).x).toBeCloseTo(expected.x, 3);
    expect(bodyAt(game, 777).y).toBeCloseTo(expected.y, 3);
    expect(linkSummary(world)).toContain("Map only: Anchor");
  });

  it("links the first field, and makes other fields and their stations real, but not other pirate bases", () => {
    const world = seedWorld();
    const { planet, field } = linkedNodes(world);
    const extra = makeChild(world, planet!, "field");
    const outpost = makeChild(world, extra, "station");
    outpost.name = "Outpost";
    const hideout = makeChild(world, extra, "pirate base");
    hideout.name = "Hideout";
    extra.children.push(outpost, hideout);
    planet!.children.push(extra);
    expect(linkedNodes(world).field).toBe(field);
    expect(linkSummary(world)).toContain(`In the game: Star, Planet, Field, Station, Pirate base, ${extra.name}, Outpost`);
    expect(linkSummary(world)).toContain("Map only: Hideout");
  });

  it("hands every station but the first over as a dock, with its shipyard, copies included", () => {
    const world = seedWorld();
    const { planet, station } = linkedNodes(world);
    const extra = makeChild(world, planet!, "field");
    const outpost = makeChild(world, extra, "station");
    Object.assign(outpost, { name: "Outpost", shipyard: false, count: 2 });
    extra.children.push(outpost);
    planet!.children.push(extra);
    const stations = stationsFor(world);
    expect(stations.map((each) => [each.name, each.shipyard])).toEqual([["Outpost", false], ["Outpost 2", false]]);
    const t = 300;
    const at = positions(world, t);
    const there = orbitsAt(stations[0].orbits, t);
    expect(there.x).toBeCloseTo(at.get(outpost)!.x - at.get(planet!)!.x, 3);
    expect(there.y).toBeCloseTo(at.get(outpost)!.y - at.get(planet!)!.y, 3);
    // The first station is the game's own: its shipyard goes through the tuning.
    station!.shipyard = false;
    const tuning = { ...DEFAULTS };
    writeGame(world, tuning);
    expect(tuning.stationShipyard).toBe(false);
  });

  it("gives a world saved before ground and full pull its kind's defaults", () => {
    const world = seedWorld();
    const old = JSON.parse(stringifyWorld(world));
    for (const node of [old.root, old.root.children[0]]) {
      delete node.surface;
      delete node.pullFull;
      delete node.pullAccel;
    }
    const read = parseWorld(JSON.stringify(old))!;
    const planet = linkedNodes(read).planet!;
    expect(planet).toMatchObject({ surface: "death", pull: 30000, pullFull: 15000, pullAccel: 150 });
  });
});
