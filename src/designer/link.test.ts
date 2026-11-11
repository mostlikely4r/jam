import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../tuning";
import { linkSummary, linkedNodes, phasesFromWorld, readGame, writeGame } from "./link";
import { makeChild, seedWorld, walk } from "./world";

describe("the link between the designer and the game", () => {
  it("finds the planet, field, station and pirate base", () => {
    const { planet, field, station, pirates } = linkedNodes(seedWorld());
    expect([planet?.id, field?.id, station?.id, pirates?.id]).toEqual(["planet", "field", "station", "pirates"]);
  });

  it("writes the layout into the tuning", () => {
    const tuning = { ...DEFAULTS };
    writeGame(seedWorld(), tuning);
    expect(tuning.planetRadius).toBe(12000);
    expect(tuning.fieldOrbitRadius).toBe(60000);
    expect(tuning.fieldOrbitPeriod).toBe(10800);
    // Measured from the field's edge in the game, from its centre in the designer.
    expect(tuning.fieldRadius + tuning.stationDistance).toBe(10200);
    expect(tuning.fieldRadius + tuning.pirateBaseDistance).toBe(9200);
  });

  it("reads a slider's change back, and keeps the planet", () => {
    const world = seedWorld();
    const tuning = { ...DEFAULTS };
    writeGame(world, tuning);
    tuning.fieldOrbitPeriod = 7200;
    tuning.planetRadius = 0;
    readGame(world, tuning, {});
    const { field, planet } = linkedNodes(world);
    expect(field?.orbitPeriod).toBe(7200);
    expect(planet?.radius).toBe(12000);
  });

  it("shows the game's real place on the orbit, as a tidy angle", () => {
    const world = seedWorld();
    readGame(world, { ...DEFAULTS }, { field: -Math.PI / 2, station: 3 * Math.PI });
    const { field, station } = linkedNodes(world);
    expect(field?.orbitPhase).toBe(270);
    expect(station?.orbitPhase).toBe(180);
    expect(phasesFromWorld(world).field).toBeCloseTo((3 * Math.PI) / 2, 9);
  });

  it("has no planet when the field orbits an invisible anchor", () => {
    const world = seedWorld();
    const { planet, field } = linkedNodes(world);
    const anchor = makeChild(world, planet!, "anchor");
    planet!.children = [anchor];
    anchor.children = [field!];
    const tuning = { ...DEFAULTS, planetRadius: 5 };
    writeGame(world, tuning);
    expect(tuning.planetRadius).toBe(0);
    expect(linkSummary(world)).toContain("no planet");
  });

  it("uses the first field and leaves the others on the map", () => {
    const world = seedWorld();
    const { planet, field } = linkedNodes(world);
    const extra = makeChild(world, planet!, "field");
    planet!.children.push(extra);
    expect(linkedNodes(world).field).toBe(field);
    expect(walk(world).length).toBe(6);
    expect(linkSummary(world)).toContain(`Map only: Star, ${extra.name}`);
  });
});
