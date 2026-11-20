import { describe, expect, it } from "vitest";
import { homeSim } from "./home";
import { DEFAULTS as GAME_DEFAULTS } from "./tuning";
import { type Loose, type Rock, Sim } from "./sim";

/** A still field with four rocks, and Targeting loaded in the player's ship. */
const DEFAULTS = {
  ...GAME_DEFAULTS,
  floaterStart: false,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  rockCount: 4,
  rockDrift: 0,
  rockInflow: 0,
  fieldOrbitRadius: 0,
  fieldOrbitPeriod: 0,
  fieldRotationPeriod: 0,
  stationRotationPeriod: 0,
};

function targetSim(): Sim {
  const sim = homeSim(1, DEFAULTS);
  sim.ship.x = 0;
  sim.ship.y = 0;
  sim.ship.px = 0;
  sim.ship.py = 0;
  sim.devSet(sim.ship, "targeting", true);
  return sim;
}

/** Puts a rock or a loose thing at a spot, still. */
function place(target: Rock | Loose, x: number, y: number): void {
  target.x = target.px = x;
  target.y = target.py = y;
  target.vx = 0;
  target.vy = 0;
}

/** A piece of loose ore at a spot. */
function ore(x: number, y: number): Loose {
  return { x, y, px: x, py: y, vx: 0, vy: 0, item: "ore", wear: 0, count: 1, kind: 0 };
}

describe("targeting", () => {
  it("a plain click picks one thing, and replaces what was picked", () => {
    const sim = targetSim();
    const [a, b] = sim.rocks;
    place(a, 100, 0);
    place(b, 200, 0);
    sim.selectTarget(sim.ship, a);
    expect(sim.ship.targets).toEqual([a]);
    sim.selectTarget(sim.ship, b);
    expect(sim.ship.targets).toEqual([b]);
  });

  it("a click on nothing clears the picks, and the ship isn't a target", () => {
    const sim = targetSim();
    const [a] = sim.rocks;
    place(a, 100, 0);
    sim.selectTarget(sim.ship, a);
    sim.selectTarget(sim.ship, sim.ship);
    expect(sim.ship.targets).toEqual([a]);
    sim.selectTarget(sim.ship, null);
    expect(sim.ship.targets).toEqual([]);
  });

  it("a click on a picked target makes it primary and keeps the rest of the queue", () => {
    const sim = targetSim();
    const [a, b, c, d] = sim.rocks;
    place(a, 100, 0);
    place(b, 200, 0);
    place(c, 300, 0);
    place(d, 400, 0);
    sim.toggleTarget(sim.ship, a);
    sim.toggleTarget(sim.ship, b);
    sim.toggleTarget(sim.ship, c);
    sim.selectTarget(sim.ship, c);
    expect(sim.ship.targets).toEqual([c, a, b]);
    // Already the primary: nothing changes.
    sim.selectTarget(sim.ship, c);
    expect(sim.ship.targets).toEqual([c, a, b]);
    // A thing that wasn't picked still replaces the queue.
    sim.selectTarget(sim.ship, d);
    expect(sim.ship.targets).toEqual([d]);
  });

  it("ctrl picks add to the queue and take out again", () => {
    const sim = targetSim();
    const [a, b, c] = sim.rocks;
    place(a, 100, 0);
    place(b, 200, 0);
    place(c, 300, 0);
    sim.toggleTarget(sim.ship, a);
    sim.toggleTarget(sim.ship, b);
    sim.toggleTarget(sim.ship, c);
    expect(sim.ship.targets).toEqual([a, b, c]);
    expect(sim.mainTarget(sim.ship)).toBe(a);
    sim.toggleTarget(sim.ship, a);
    expect(sim.ship.targets).toEqual([b, c]);
    expect(sim.mainTarget(sim.ship)).toBe(b);
  });

  it("a box catches what it covers, nearest the ship first", () => {
    const sim = targetSim();
    const [a, b, c, d] = sim.rocks;
    place(a, 100, 6);
    place(b, 40, -4);
    place(c, 80, 2);
    place(d, 600, 0);
    sim.boxTargets(sim.ship, { x: -20, y: -20 }, { x: 140, y: 20 }, false);
    expect(sim.ship.targets).toEqual([b, c, a]);
  });

  it("a plain box replaces the queue, and ctrl adds to it", () => {
    const sim = targetSim();
    const [a, b, c, d] = sim.rocks;
    place(a, 100, 0);
    place(b, 200, 0);
    place(c, 300, 0);
    place(d, 1000, 0);
    sim.selectTarget(sim.ship, a);
    sim.boxTargets(sim.ship, { x: 190, y: -10 }, { x: 210, y: 10 }, false);
    expect(sim.ship.targets).toEqual([b]);
    sim.boxTargets(sim.ship, { x: 290, y: -10 }, { x: 310, y: 10 }, true);
    expect(sim.ship.targets).toEqual([b, c]);
  });

  it("the box catches only what the Box picks tweak names, and a click ignores it", () => {
    const sim = targetSim();
    const [a, b] = sim.rocks;
    place(a, 100, 0);
    place(b, 200, 0);
    const piece = ore(150, 0);
    sim.ores.push(piece);
    // The default is rocks: the ore in the box doesn't come.
    sim.boxTargets(sim.ship, { x: -20, y: -20 }, { x: 220, y: 20 }, false);
    expect(sim.ship.targets).toEqual([a, b]);
    // A click picks what's under it whatever the tweak says.
    sim.selectTarget(sim.ship, piece);
    expect(sim.ship.targets).toEqual([piece]);
    // Everything comes now, nearest the ship first.
    expect(sim.setTweak(sim.ship, "targeting", "boxPicks", "everything")).toBe(true);
    sim.boxTargets(sim.ship, { x: -20, y: -20 }, { x: 220, y: 20 }, false);
    expect(sim.ship.targets).toEqual([a, piece, b]);
  });

  it("a target past the lock range drops, and doesn't come back when the ship does", () => {
    const sim = targetSim();
    const [a] = sim.rocks;
    place(a, 100, 0);
    sim.selectTarget(sim.ship, a);
    sim.step();
    expect(sim.ship.targets).toEqual([a]);
    const home = sim.ship.x;
    sim.ship.x = sim.ship.px = home + sim.tuning.targetRange * 2;
    sim.step();
    expect(sim.ship.targets).toEqual([]);
    sim.ship.x = sim.ship.px = home;
    sim.step();
    expect(sim.ship.targets).toEqual([]);
  });

  it("a rock that breaks hands its place in the queue to the pieces", () => {
    const sim = targetSim();
    const [a, b] = sim.rocks;
    place(a, 100, 0);
    place(b, 200, 0);
    a.tier = 2;
    sim.toggleTarget(sim.ship, a);
    sim.toggleTarget(sim.ship, b);
    sim.breakRock(a);
    const pieces = sim.ship.targets.slice(0, -1);
    expect(sim.ship.targets[sim.ship.targets.length - 1]).toBe(b);
    expect(pieces.length).toBeGreaterThan(0);
    for (const piece of pieces) {
      expect(sim.rocks).toContain(piece);
      expect((piece as Rock).tier).toBe(1);
    }
    // The main target was the rock: its largest piece takes over (the pieces are all one size).
    expect(sim.ship.targets[0]).toBe(pieces[0]);
  });

  it("a bottom-tier rock that breaks leaves nothing of its place behind", () => {
    const sim = targetSim();
    const [a, b] = sim.rocks;
    place(a, 100, 0);
    place(b, 200, 0);
    a.tier = 0;
    sim.selectTarget(sim.ship, a);
    sim.breakRock(a);
    expect(sim.ship.targets).toEqual([]);
  });

  it("a piece of ore picked up drops out of the list", () => {
    const sim = targetSim();
    const piece = ore(60, 0);
    sim.ores.push(piece);
    sim.selectTarget(sim.ship, piece);
    expect(sim.ship.targets).toEqual([piece]);
    sim.ores.splice(sim.ores.indexOf(piece), 1);
    sim.step();
    expect(sim.ship.targets).toEqual([]);
  });

  it("without Targeting loaded, upkeep takes the picks away", () => {
    const sim = targetSim();
    const [a] = sim.rocks;
    place(a, 100, 0);
    sim.selectTarget(sim.ship, a);
    sim.devSet(sim.ship, "targeting", false);
    sim.step();
    expect(sim.ship.targets).toEqual([]);
  });

  it("a pilot can only tweak a program they own", () => {
    const sim = targetSim();
    expect(sim.setTweak(sim.ship, "targeting", "boxPicks", "everything")).toBe(true);
    expect(sim.ship.tweaks.targeting?.boxPicks).toBe("everything");
    expect(sim.setTweak(sim.ship, "targeting", "noSuchTweak", "everything")).toBe(false);
    expect(sim.setTweak(sim.ship, "targeting", "boxPicks", "noSuchOption")).toBe(false);
    expect(sim.setTweak(sim.ship, "relativeLines", "show", "all")).toBe(false);
  });

  it("tweaks come back after a rebuild, as the programs do", () => {
    const sim = targetSim();
    sim.setTweak(sim.ship, "targeting", "boxPicks", "ships");
    // The yard's bare hull, with its pilot's programs loaded again.
    const bare = sim as unknown as { bareHull(ship: Sim["ship"]): void };
    bare.bareHull(sim.ship);
    expect(sim.ship.tweaks.targeting?.boxPicks).toBe("ships");
  });
});
