/**
 * The designer's first field and station are ordinary places in the game: what the designer
 * says about them is what the game plays, with nothing copied through the tuning, and a
 * layout without them plays too (docs/home-pair-plan.md).
 */
import { describe, expect, it } from "vitest";
import { linkTo } from "../profile/world";
import { layoutKey, loadStart, makeStart, SAVE_VERSION } from "../save";
import { Sim, TICK } from "../sim";
import { DEFAULTS } from "../tuning";
import { fieldsFor, linkedNodes, stationsFor, useLayout } from "./link";
import { makeChild, seedWorld, type World } from "./world";
import { hasPart } from "../sim";
import { partOn, resolveParts } from "../frameParts";
import { changeStation } from "./world";

function play(world: World): Sim {
  const sim = new Sim(1, { ...DEFAULTS, chatter: false });
  useLayout(world, linkTo(sim));
  sim.reset(1);
  return sim;
}

/** The seeded world with a second field round the planet, and a station on it. */
function withOutpost(): { world: World; outpost: ReturnType<typeof makeChild> } {
  const world = seedWorld();
  const { planet } = linkedNodes(world);
  const far = makeChild(world, planet!, "field");
  Object.assign(far, { name: "Far", orbitRadius: 150000, rocks: 30 });
  planet!.children.push(far);
  const outpost = makeChild(world, far, "station");
  Object.assign(outpost, { name: "Outpost", orbitRadius: 6000 });
  far.children.push(outpost);
  return { world, outpost };
}

describe("the designer's first field", () => {
  it("plays with the designer's own size, rocks and carrying", () => {
    const world = seedWorld();
    const { field } = linkedNodes(world);
    Object.assign(field!, { radius: 3100, rocks: 77, rockDrift: 3, rockInflow: 0, carryFull: 900, carryNone: 4000 });
    const sim = play(world);
    const [first] = sim.miningFields();
    expect(first.id).toBe(fieldsFor(world)[0].id);
    expect(first.radius).toBe(3100);
    expect(first.full).toBe(77);
    expect(sim.field).toBe(first.poi);
    expect(sim.carryRange(sim.field)).toEqual({ full: 900, none: 4000 });
    // Its rocks are its own count, laid within its own size (a few are left out, clear of the new ship).
    const near = sim.rocks.filter((rock) => Math.hypot(rock.x - sim.field.x, rock.y - sim.field.y) <= 3100 + 1);
    expect(near.length).toBe(sim.rocks.length);
    expect(near.length).toBeGreaterThan(60);
    expect(near.length).toBeLessThanOrEqual(77);
  });
});

describe("the designer's first station", () => {
  it("plays with the designer's own orbit, shipyard, storage, carrying and settings", () => {
    const world = seedWorld();
    const { station } = linkedNodes(world);
    Object.assign(station!, { orbitRadius: 11000, carryFull: 500, carryNone: 3000 });
    changeStation(station!, { shipyard: false, storage: 120, radio: false, guardCount: 2 });
    const sim = play(world);
    const [base] = sim.bases;
    expect(base.id).toBe(stationsFor(world)[0].id);
    expect(Math.hypot(base.body.x - sim.field.x, base.body.y - sim.field.y)).toBeCloseTo(11000, 3);
    expect(sim.hasShipyard(base.body)).toBe(false);
    expect(sim.storageOf(base)).toBe(120);
    expect(sim.carryRange(base.body)).toEqual({ full: 500, none: 3000 });
    expect(hasPart(base.body, "projects")).toBe(true);
    expect(hasPart(base.body, "radio")).toBe(false);
    expect(partOn(base.body.parts, "battery")?.data).toEqual({ count: 2 });
  });

  it("falls back to the tuning's shipyard and storage for a station spec that leaves them out", () => {
    const world = seedWorld();
    const sim = play(world);
    const [base] = sim.bases;
    // A place that says nothing of its own: its frame's parts as they come.
    base.spec.parts = {};
    base.body.parts = resolveParts(base.body.frame);
    sim.tuning.stationShipyard = false;
    sim.tuning.stationStorage = 77;
    expect(sim.hasShipyard(base.body)).toBe(false);
    expect(sim.storageOf(base)).toBe(77);
  });
});

describe("a layout without the first field and station", () => {
  it("loads, starts the player, and docks at another base", () => {
    const { world } = withOutpost();
    const { planet, field } = linkedNodes(world);
    planet!.children = planet!.children.filter((child) => child !== field);
    const sim = play(world);
    expect(sim.bases.map((base) => base.spec.name)).toEqual(["Outpost"]);
    expect(sim.miningFields().map((each) => each.id)).not.toContain("field:0");
    expect(Number.isFinite(sim.ship.x)).toBe(true);
    const [base] = sim.bases;
    const dock = sim.dockPoint(false, base.body);
    Object.assign(sim.ship, { x: dock.x, y: dock.y, px: dock.x, py: dock.y, vx: 0, vy: 0 });
    sim.step();
    expect(sim.dockedAt(sim.ship)).toBe(base.body);
    for (let i = 0; i < Math.round(5 / TICK); i++) sim.step();
    expect(sim.ship.hull).toBeGreaterThan(0);
  });

  it("refuses a layout with no station at all, saying why", () => {
    const world = seedWorld();
    const { field } = linkedNodes(world);
    field!.children = field!.children.filter((child) => child.kind !== "station");
    expect(() => play(world)).toThrow(/no station/);
  });
});

describe("a base that's gone or can't do the job", () => {
  it("leaves a ship whose base is gone to the nearest base", () => {
    const { world } = withOutpost();
    const sim = play(world);
    const [home, outpost] = sim.bases;
    const { ship } = sim.traffic.find((pilot) => pilot.ship.home === home.id)!;
    ship.home = "gone:0";
    Object.assign(ship, { x: outpost.body.x + 500, y: outpost.body.y });
    expect(sim.homeBaseOf(ship)).toBe(outpost);
  });

  it("brings a trip record bound for a base that's gone to the nearest base to where it was going", () => {
    const { world } = withOutpost();
    const sim = play(world);
    const [, outpost] = sim.bases;
    // The camera far from everything, so traffic runs as records.
    Object.assign(sim.ship, { x: 1e7, y: 1e7, px: 1e7, py: 1e7 });
    for (let i = 0; i < 4; i++) sim.step();
    const pilot = sim.traffic.find((each) => each.record)!;
    const aim = { x: outpost.body.x, y: outpost.body.y };
    pilot.record = { goal: "dock", target: "gone:0", stage: "travel", depart: sim.now, arrive: sim.now, path: [aim], aim };
    sim.step();
    expect(sim.dockedAt(pilot.ship)).toBe(outpost.body);
  });

  it("sends a wreck by a base without a shipyard to the nearest that has one", () => {
    const { world, outpost } = withOutpost();
    changeStation(outpost, { shipyard: false });
    const sim = play(world);
    const [home, far] = sim.bases;
    expect(sim.nearestBase(far.body.x, far.body.y, true)).toBe(home);
  });
});

describe("saves", () => {
  it("keep a loaded deposit and turrets with their field and station as these move on", async () => {
    const { homeSim } = await import("../home");
    const { roundTrip } = await import("../save");
    const settings = { ...DEFAULTS, chatter: false, depositFree: true, guardsStationFree: true, rockCount: 0, fieldOrbitPeriod: 600, orbitPeriod: 300 };
    const sim = homeSim(1, settings);
    sim.step();
    const into = homeSim(2, settings);
    roundTrip(sim, into);
    for (let i = 0; i < Math.round(30 / TICK); i++) into.step();
    const [deposit] = into.deposits;
    expect(deposit.at).toBe(into.field);
    expect(deposit.toward).toBe(into.station);
    const guns = into.batteries.find((battery) => battery.id === "stationGuards")!;
    expect(guns.host).toBe(into.station);
    expect(Math.hypot(guns.guns[0].x - into.station.x, guns.guns[0].y - into.station.y)).toBeCloseTo(DEFAULTS.stationGuardDistance, 3);
  });

  it("turn away a start saved by an older version, and take this one", () => {
    // Pinned, so bumping the version is always a deliberate turn away from old saves.
    expect(SAVE_VERSION).toBe(13);
    const sim = play(seedWorld());
    const layout = layoutKey("any");
    const start = makeStart(sim, layout);
    expect(loadStart(new Sim(2, { ...DEFAULTS }), { ...start, version: 9 }, layout)).toBe(false);
    expect(loadStart(new Sim(2, { ...DEFAULTS }), start, layout)).toBe(true);
  });
});
