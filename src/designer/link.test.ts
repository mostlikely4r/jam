import { describe, expect, it } from "vitest";
import { bodyAt, orbitsAt } from "../sim";
import { DEFAULTS } from "../tuning";
import shipped from "./world.json";
import { anchorsFor, bodiesFor, fieldsFor, linkSummary, linkedNodes, phasesFromWorld, readGame, spawnsFor, stationsFor, writeGame } from "./link";
import { limitCarrying, makeChild, parseWorld, positions, seedWorld, stringifyWorld, walk } from "./world";

describe("the link between the designer and the game", () => {
  it("finds the planet, field, station and pirate base", () => {
    const { planet, field, station, pirates } = linkedNodes(seedWorld());
    expect([planet?.id, field?.id, station?.id, pirates?.id]).toEqual(["planet", "field", "station", "pirates"]);
  });

  it("hands the game the first field and station as a field and station like any other, and the pirate base's orbit through the tuning", () => {
    const world = seedWorld();
    const tuning = { ...DEFAULTS };
    writeGame(world, tuning);
    const [first] = fieldsFor(world);
    expect(first.id).toBe("field:0");
    expect(first.orbits).toEqual([expect.objectContaining({ radius: 60000, period: 10800 })]);
    const [station] = stationsFor(world);
    expect(station).toMatchObject({ id: "station:0", field: "field:0", projects: true, radio: true });
    expect(station.orbits.map((orbit) => orbit.radius)).toEqual([60000, 10200]);
    // Measured from the field's edge in the game, from its centre in the designer.
    expect(first.radius + tuning.pirateBaseDistance).toBe(9200);
  });

  it("writes the field's, station's and pirate base's spin start angles into the tuning, in radians", () => {
    const world = seedWorld();
    const { field, station, pirates } = linkedNodes(world);
    Object.assign(field!, { spinPhase: 90 });
    Object.assign(station!, { spinPhase: 180 });
    Object.assign(pirates!, { spinPhase: 45 });
    const tuning = { ...DEFAULTS };
    writeGame(world, tuning);
    expect(fieldsFor(world)[0].spinPhase).toBeCloseTo(Math.PI / 2, 9);
    expect(stationsFor(world)[0].spinPhase).toBeCloseTo(Math.PI, 9);
    expect(tuning.pirateSpinPhase).toBeCloseTo(Math.PI / 4, 9);
  });

  it("writes each place's rocks and carrying, no outer edge meaning everywhere", () => {
    const world = seedWorld();
    const { field, station } = linkedNodes(world);
    Object.assign(field!, { rocks: 300, rockDrift: 5, rockInflow: 2, carryFull: 1000, carryNone: 9000 });
    Object.assign(station!, { carryFull: 0, carryNone: 0 });
    const tuning = { ...DEFAULTS };
    writeGame(world, tuning);
    const [first] = fieldsFor(world);
    expect([first.rocks, first.rockDrift, first.rockInflow]).toEqual([300, 5, 2]);
    expect([first.carryFull, first.carryNone]).toEqual([1000, 9000]);
    const [dock] = stationsFor(world);
    expect([dock.carryFull, dock.carryNone]).toEqual([Infinity, Infinity]);
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
    readGame(world, { field: -Math.PI / 2, station: 3 * Math.PI, "pirate base": -Math.PI / 2 });
    const { field, station, pirates } = linkedNodes(world);
    // A field's and a station's place come with their orbits: the game has no angle of its own to give back.
    expect(field?.orbitPhase).toBe(0);
    expect(station?.orbitPhase).toBe(180);
    expect(pirates?.orbitPhase).toBe(270);
    expect(phasesFromWorld(world).field).toBeUndefined();
    expect(phasesFromWorld(world).station).toBeUndefined();
    expect(phasesFromWorld(world)["pirate base"]).toBeCloseTo((3 * Math.PI) / 2, 9);
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
    expect(linkSummary(world)).not.toContain("Map only");
    expect(anchorsFor(world).map((each) => each.name)).toEqual(["Anchor"]);
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
    expect(linkSummary(world)).not.toContain("In the game");
    expect(linkSummary(world)).toContain("Map only: Hideout");
  });

  it("hands each body's, field's and station's spin start angle to the game, in radians", () => {
    const world = seedWorld();
    const { planet, field, station } = linkedNodes(world);
    Object.assign(planet!, { spinPhase: 90 });
    Object.assign(field!, { spinPhase: 180 });
    const extra = makeChild(world, planet!, "field");
    const outpost = makeChild(world, extra, "station");
    outpost.spinPhase = 45;
    extra.spinPhase = 270;
    extra.children.push(outpost);
    planet!.children.push(extra);
    expect(station).not.toBeNull();
    expect(bodiesFor(world).find((body) => body.name === "Planet")!.spinPhase).toBeCloseTo(Math.PI / 2, 9);
    expect(fieldsFor(world).find((spec) => spec.id.startsWith(extra.id))!.spinPhase).toBeCloseTo(Math.PI * 1.5, 9);
    expect(stationsFor(world).find((spec) => spec.id.startsWith(outpost.id))!.spinPhase).toBeCloseTo(Math.PI / 4, 9);
  });

  it("hands a station's held blueprints over, and a saved world keeps only real held parts", () => {
    const world = seedWorld();
    const { planet } = linkedNodes(world);
    const extra = makeChild(world, planet!, "field");
    const outpost = makeChild(world, extra, "station");
    Object.assign(outpost, { name: "Outpost", blueprints: ["tractorAll"] });
    extra.children.push(outpost);
    planet!.children.push(extra);
    expect(stationsFor(world).find((each) => each.name === "Outpost")!.blueprints).toEqual(["tractorAll"]);
    const text = stringifyWorld(world).replace('"tractorAll"', '"tractorAll", "reverse", "nonsense"');
    const back = walk(parseWorld(text)!).find((entry) => entry.node.name === "Outpost")!.node;
    expect(back.blueprints).toEqual(["tractorAll"]);
  });

  it("hands every station over as a dock, with its shipyard, copies included", () => {
    const world = seedWorld();
    const { planet, station } = linkedNodes(world);
    const extra = makeChild(world, planet!, "field");
    const outpost = makeChild(world, extra, "station");
    Object.assign(outpost, { name: "Outpost", shipyard: false, count: 2 });
    extra.children.push(outpost);
    planet!.children.push(extra);
    station!.shipyard = false;
    const stations = stationsFor(world);
    expect(stations.map((each) => [each.name, each.shipyard])).toEqual([["Station", false], ["Outpost", false], ["Outpost 2", false]]);
    const t = 300;
    const at = positions(world, t);
    const there = orbitsAt(stations[1].orbits, t);
    expect(there.x).toBeCloseTo(at.get(outpost)!.x - at.get(planet!)!.x, 3);
    expect(there.y).toBeCloseTo(at.get(outpost)!.y - at.get(planet!)!.y, 3);
    // Each sits by the field it's on.
    expect(stations.map((each) => each.field)).toEqual(["field:0", `${extra.id}:0`, `${extra.id}:0`]);
  });

  it("hands each station's storage to the game, the first's included", () => {
    const world = seedWorld();
    const { planet, station } = linkedNodes(world);
    const outpost = makeChild(world, planet!, "station");
    // A new station starts with the default storage.
    expect(outpost.storage).toBe(200);
    outpost.storage = 80;
    planet!.children.push(outpost);
    station!.storage = 120;
    expect(stationsFor(world).map((each) => each.storage)).toEqual([120, 80]);
    // A world saved before storage gets the default; a saved storage reads back.
    const text = stringifyWorld(world);
    expect(linkedNodes(parseWorld(text)!).station!.storage).toBe(120);
    const old = JSON.parse(text);
    const strip = (node: { storage?: number; children: unknown[] }): void => {
      delete node.storage;
      node.children.forEach((child) => strip(child as typeof node));
    };
    strip(old.root);
    expect(linkedNodes(parseWorld(JSON.stringify(old))!).station!.storage).toBe(200);
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
  it("gives every field and station one true orbit for the chart: round its parent, as the designer draws it", () => {
    const world = parseWorld(JSON.stringify(shipped))!;
    const bodies = bodiesFor(world);
    for (const spec of [...fieldsFor(world), ...stationsFor(world)]) {
      expect(spec.rings).toHaveLength(1);
      const [{ center, radius }] = spec.rings!;
      for (const time of [0, 5000]) {
        const at = orbitsAt(spec.orbits, time);
        const round = orbitsAt(center, time);
        expect(Math.hypot(at.x - round.x, at.y - round.y)).toBeCloseTo(radius, 3);
      }
    }
    // A ring field round a moon goes round that moon, so the chart can tell when it's been found.
    const inner = fieldsFor(world).find((spec) => spec.name === "Planet II inner ring")!;
    const moon = bodies.find((body) => body.name === "Planet II")!;
    const centre = orbitsAt(inner.rings![0].center, 1234);
    const there = bodyAt(moon, 1234);
    expect(Math.hypot(centre.x - there.x, centre.y - there.y)).toBeLessThan(1e-6);
  });
});
