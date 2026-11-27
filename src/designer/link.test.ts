import { describe, expect, it } from "vitest";
import { bodyAt, orbitsAt } from "../sim";
import { DEFAULTS } from "../tuning";
import shipped from "./world.json";
import { anchorsFor, bodiesFor, cloudsFor, fieldsFor, layoutFor, linkSummary, linkedNodes, pirateBaseFor, spawnsFor, stationsFor } from "./link";
import { allPrograms, changeStation, limitCarrying, makeChild, parseWorld, positions, seedWorld, stationSettings, stringifyWorld, walk, type WorldNode } from "./world";
import type { StationSpec } from "../sim";

/** A station node's settings, as its parts on its frame say. */
const settingsOf = (node: Pick<WorldNode, "frame" | "parts">) => stationSettings(node);
/** A station spec's settings, as the game will read its parts. */
const specSettings = (spec: StationSpec) => stationSettings({ frame: spec.frame ?? "station", parts: spec.parts ?? {} });
import { shippedWorld } from "./shipped";

describe("the link between the designer and the game", () => {
  it("finds the planet, field, station and pirate base", () => {
    const { planet, field, station, pirates } = linkedNodes(seedWorld());
    expect([planet?.id, field?.id, station?.id, pirates?.id]).toEqual(["planet", "field", "station", "pirates"]);
  });

  it("hands the game the first field, station and pirate base as specs like any other, with nothing through the tuning", () => {
    const world = seedWorld();
    const tuning = { ...DEFAULTS };
    const before = JSON.stringify(tuning);
    layoutFor(world);
    expect(JSON.stringify(tuning)).toBe(before);
    const [first] = fieldsFor(world);
    expect(first.id).toBe("field:0");
    expect(first.orbits).toEqual([expect.objectContaining({ radius: 60000, period: 10800 })]);
    const [station] = stationsFor(world);
    expect(station).toMatchObject({ id: "station:0", field: "field:0" });
    expect(specSettings(station)).toMatchObject({ projects: true, radio: true });
    expect(station.orbits.map((orbit) => orbit.radius)).toEqual([60000, 10200]);
    expect(pirateBaseFor(world)!.orbits.map((orbit) => orbit.radius)).toEqual([60000, 9200]);
  });

  it("hands over the field's, station's and pirate base's spin start angles, in radians", () => {
    const world = seedWorld();
    const { field, station, pirates } = linkedNodes(world);
    Object.assign(field!, { spinPhase: 90 });
    Object.assign(station!, { spinPhase: 180 });
    Object.assign(pirates!, { spinPhase: 45 });
    expect(fieldsFor(world)[0].spinPhase).toBeCloseTo(Math.PI / 2, 9);
    expect(stationsFor(world)[0].spinPhase).toBeCloseTo(Math.PI, 9);
    expect(pirateBaseFor(world)!.spinPhase).toBeCloseTo(Math.PI / 4, 9);
  });

  it("hands over each place's rocks and carrying, no outer edge meaning everywhere", () => {
    const world = seedWorld();
    const { field, station } = linkedNodes(world);
    Object.assign(field!, { rocks: 300, rockDrift: 5, rockInflow: 2, carryFull: 1000, carryNone: 9000 });
    Object.assign(station!, { carryFull: 0, carryNone: 0 });
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

  it("puts a place where its own orbit and the clock say, so the game has no angle to give back", () => {
    const world = seedWorld();
    const { pirates } = linkedNodes(world);
    pirates!.orbitPhase = 90;
    const at = orbitsAt(pirateBaseFor(world)!.orbits, 0);
    const field = orbitsAt(fieldsFor(world)[0].orbits, 0);
    expect(Math.atan2(at.y - field.y, at.x - field.x)).toBeCloseTo(Math.PI / 2, 9);
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
    outpost.name = "Outpost";
    changeStation(outpost, { unlocked: ["tractorAll"] });
    extra.children.push(outpost);
    planet!.children.push(extra);
    expect(specSettings(stationsFor(world).find((each) => each.name === "Outpost")!).unlocked).toEqual(["tractorAll"]);
    // Only module items are a list's to hold: a decal or something that isn't an item at all is dropped.
    const text = stringifyWorld(world).replace('"tractorAll"', '"tractorAll", "reverse", "nonsense", "cockpitKite"');
    const back = walk(parseWorld(text)!).find((entry) => entry.node.name === "Outpost")!.node;
    expect(settingsOf(back).unlocked).toEqual(["tractorAll", "reverse"]);
  });

  it("hands each cloud over on its own, copies included, where the field carries it", () => {
    const world = seedWorld();
    const { planet, field } = linkedNodes(world);
    const cloud = makeChild(world, field!, "cloud");
    Object.assign(cloud, { name: "Nebula", look: "dust", color: "#b9a089", width: 8000, height: 4000, opacity: 0.6, layer: "front", drawOrder: 2, count: 2 });
    cloud.radius = 4000;
    field!.children.push(cloud);
    const clouds = cloudsFor(world);
    expect(clouds.map((each) => each.name)).toEqual(["Nebula", "Nebula 2"]);
    expect(clouds[0]).toMatchObject({ id: `${cloud.id}:0`, look: "dust", color: "#b9a089", width: 8000, height: 4000, radius: 4000, opacity: 0.6, layer: "front", drawOrder: 2 });
    // It goes round with the field, and the game's frame is centred on what the field orbits.
    const t = 300;
    const at = positions(world, t);
    const there = orbitsAt(clouds[0].orbits, t);
    expect(there.x).toBeCloseTo(at.get(cloud)!.x - at.get(planet!)!.x, 3);
    expect(there.y).toBeCloseTo(at.get(cloud)!.y - at.get(planet!)!.y, 3);
    // A cloud is a real place, not map only.
    expect(linkSummary(world)).not.toContain("Map only");
  });

  it("gives a station every program and no hull unless its lists say, and a saved world keeps them", () => {
    const world = seedWorld();
    const { station } = linkedNodes(world);
    expect(settingsOf(station!).programs).toEqual(allPrograms());
    expect(settingsOf(station!).hulls).toEqual([]);
    // Every program and no hull is what a missing list reads as, so the file says nothing of either.
    const plain = stringifyWorld(world);
    expect(plain).not.toContain('"programs"');
    expect(plain).not.toContain('"hulls"');
    expect(settingsOf(linkedNodes(parseWorld(plain)!).station!).programs).toEqual(allPrograms());
    // A shorter list is written, an empty one too, and unknown names are dropped on the way back.
    changeStation(station!, { programs: ["retro"], hulls: ["floater"] });
    const text = stringifyWorld(world).replace('"retro"', '"retro", "nonsense"').replace('"floater"', '"floater", "nonsense"');
    const back = linkedNodes(parseWorld(text)!).station!;
    expect(settingsOf(back).programs).toEqual(["retro"]);
    expect(settingsOf(back).hulls).toEqual(["floater"]);
    changeStation(station!, { programs: [] });
    expect(settingsOf(linkedNodes(parseWorld(stringifyWorld(world))!).station!).programs).toEqual([]);
    const spec = stationsFor(world).find((each) => each.name === "Station")!;
    expect(specSettings(spec).programs).toEqual([]);
    expect(specSettings(spec).hulls).toEqual(["floater"]);
    // Only a station has the lists: nothing else has parts of its own.
    expect(linkedNodes(world).field!.parts).toEqual({});
  });

  it("loads the shipped world with every station selling every program and no hull", () => {
    const stations = walk(shippedWorld()).filter((entry) => entry.node.kind === "station");
    expect(stations.length).toBeGreaterThan(0);
    for (const { node } of stations) {
      expect(settingsOf(node).programs).toEqual(allPrograms());
      expect(settingsOf(node).hulls).toEqual([]);
    }
  });

  it("hands every station over as a dock, with its shipyard, copies included", () => {
    const world = seedWorld();
    const { planet, station } = linkedNodes(world);
    const extra = makeChild(world, planet!, "field");
    const outpost = makeChild(world, extra, "station");
    Object.assign(outpost, { name: "Outpost", count: 2 });
    changeStation(outpost, { shipyard: false });
    extra.children.push(outpost);
    planet!.children.push(extra);
    changeStation(station!, { shipyard: false });
    const stations = stationsFor(world);
    expect(stations.map((each) => [each.name, specSettings(each).shipyard])).toEqual([["Station", false], ["Outpost", false], ["Outpost 2", false]]);
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
    expect(settingsOf(outpost).storage).toBe(DEFAULTS.stationStorage);
    changeStation(outpost, { storage: 80 });
    planet!.children.push(outpost);
    changeStation(station!, { storage: 120 });
    expect(stationsFor(world).map((each) => specSettings(each).storage)).toEqual([120, 80]);
    // A world that says nothing of a station's storage gets the default; a saved storage reads back.
    const text = stringifyWorld(world);
    expect(settingsOf(linkedNodes(parseWorld(text)!).station!).storage).toBe(120);
    const old = JSON.parse(text);
    const strip = (node: { parts?: Record<string, unknown>; children: unknown[] }): void => {
      delete node.parts?.storage;
      node.children.forEach((child) => strip(child as typeof node));
    };
    strip(old.root);
    expect(settingsOf(linkedNodes(parseWorld(JSON.stringify(old))!).station!).storage).toBe(DEFAULTS.stationStorage);
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
