import { describe, expect, it } from "vitest";
import { homeSim } from "./home";
import { DEFAULTS as GAME_DEFAULTS } from "./tuning";
import { type Loose, type Rock, Sim, TICK } from "./sim";

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

/** Steps the sim for a while, so the once-a-second Auto targeting searches come round. */
function stepSeconds(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) sim.step();
}

/** A rock or a loose thing moving at a speed, still where `place` put it. */
function drift(target: Rock | Loose, vx: number, vy: number): void {
  target.vx = vx;
  target.vy = vy;
}

/** A sim with Auto targeting loaded as well, the nose along +x, and nothing picked. */
function autoSim(): Sim {
  const sim = targetSim();
  sim.ship.angle = sim.ship.prevAngle = 0;
  sim.devSet(sim.ship, "autoTarget", true);
  return sim;
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

describe("the next main target", () => {
  /** Three rocks round a ship at 0, 0 with its nose along +x, picked in the order given. */
  function three(sim: Sim): { a: Rock; b: Rock; c: Rock } {
    const [a, b, c, spare] = sim.rocks;
    place(a, 100, 0);
    place(b, 0, 100);
    place(c, 100, 20);
    place(spare, 5000, 0);
    sim.toggleTarget(sim.ship, a);
    sim.toggleTarget(sim.ship, b);
    sim.toggleTarget(sim.ship, c);
    expect(sim.ship.targets).toEqual([a, b, c]);
    return { a, b, c };
  }

  /** The main target goes from the world, as a rock mined out does, and the queue is kept. */
  function lose(sim: Sim, gone: Rock): void {
    sim.rocks.splice(sim.rocks.indexOf(gone), 1);
    sim.step();
  }

  it("takes the next in the queue by default, as it always did", () => {
    const sim = targetSim();
    const { a, b } = three(sim);
    lose(sim, a);
    expect(sim.mainTarget(sim.ship)).toBe(b);
    expect(sim.ship.targets).toEqual([b, sim.ship.targets[1]]);
  });

  it("takes the nearest under Nearest, and the queue keeps its own order", () => {
    const sim = targetSim();
    const [a, b, c, spare] = sim.rocks;
    place(a, 100, 0);
    // Picked second but further off than the third: the queue's order would say b.
    place(b, 100, 20);
    place(c, 0, 100);
    place(spare, 5000, 0);
    sim.toggleTarget(sim.ship, a);
    sim.toggleTarget(sim.ship, b);
    sim.toggleTarget(sim.ship, c);
    expect(sim.setTweak(sim.ship, "targeting", "nextMain", "nearest")).toBe(true);
    lose(sim, a);
    expect(sim.mainTarget(sim.ship)).toBe(c);
    // Only the head moved: the queue is still in the order it was picked in.
    expect(sim.ship.targets).toEqual([c, b]);
    lose(sim, c);
    expect(sim.mainTarget(sim.ship)).toBe(b);
  });

  it("takes the most in front under Most in front, ties going to the nearer", () => {
    const sim = targetSim();
    const [a, b, c, spare] = sim.rocks;
    place(a, 100, 0);
    // Nearly ahead, and a little further off than the one dead abeam.
    place(b, 100, 20);
    place(c, 0, 100);
    place(spare, 5000, 0);
    sim.toggleTarget(sim.ship, a);
    sim.toggleTarget(sim.ship, b);
    sim.toggleTarget(sim.ship, c);
    expect(sim.setTweak(sim.ship, "targeting", "nextMain", "front")).toBe(true);
    lose(sim, a);
    // Nearest would have said c (100 away) over b (102); in front is b, a fifth of a radian off.
    expect(sim.mainTarget(sim.ship)).toBe(b);
  });

  it("takes the one that comes closest soonest under Collision, else the nearest", () => {
    const sim = targetSim();
    const [main, slow, fast, still] = sim.rocks;
    place(main, 100, 0);
    // Both on a course for the ship, the far one soonest: it is the one to look out for.
    place(slow, 900, 10);
    drift(slow, -100, 0);
    place(fast, 1400, 0);
    drift(fast, -300, 0);
    // Near, and going nowhere near the ship: the nearest when nothing is on a course.
    place(still, 200, 0);
    sim.toggleTarget(sim.ship, main);
    sim.toggleTarget(sim.ship, slow);
    sim.toggleTarget(sim.ship, fast);
    expect(sim.setTweak(sim.ship, "targeting", "nextMain", "collide")).toBe(true);
    lose(sim, main);
    expect(sim.mainTarget(sim.ship)).toBe(fast);
    // With the fast one gone, the slower course is the only one left.
    lose(sim, fast);
    expect(sim.mainTarget(sim.ship)).toBe(slow);
  });

  it("runs where a main target breaks, the pieces taking its place first", () => {
    const sim = targetSim();
    const [a, b, c, spare] = sim.rocks;
    place(a, 100, 0);
    // Nearer than every piece of a can land, so Nearest must say b.
    place(b, 30, 0);
    place(c, 5000, 0);
    place(spare, 5000, 0);
    a.tier = 2;
    sim.toggleTarget(sim.ship, a);
    sim.toggleTarget(sim.ship, b);
    expect(sim.setTweak(sim.ship, "targeting", "nextMain", "nearest")).toBe(true);
    sim.breakRock(a);
    expect(sim.mainTarget(sim.ship)).toBe(b);
    // Under In order picked the pieces keep the place, the largest first, as before.
    const sim2 = targetSim();
    const [d, e] = sim2.rocks;
    place(d, 100, 0);
    place(e, 30, 0);
    d.tier = 2;
    sim2.toggleTarget(sim2.ship, d);
    sim2.toggleTarget(sim2.ship, e);
    sim2.breakRock(d);
    expect(sim2.mainTarget(sim2.ship)).not.toBe(e);
  });
});

describe("auto targeting", () => {
  it("with nothing picked, picks the nearest rock in reach", () => {
    const sim = autoSim();
    const [a, b, c, d] = sim.rocks;
    place(a, 400, 0);
    place(b, 900, 0);
    place(c, 5000, 0);
    place(d, 5000, 0);
    stepSeconds(sim, 1.2);
    expect(sim.ship.targets).toEqual([a]);
  });

  it("never picks past its max range, and picks again when it's raised", () => {
    const sim = autoSim();
    const [a, b, c, d] = sim.rocks;
    place(a, 400, 0);
    place(b, 900, 0);
    place(c, 5000, 0);
    place(d, 5000, 0);
    expect(sim.setTweak(sim.ship, "autoTarget", "maxRange", "300")).toBe(true);
    stepSeconds(sim, 1.2);
    expect(sim.ship.targets).toEqual([]);
    expect(sim.setTweak(sim.ship, "autoTarget", "maxRange", "600")).toBe(true);
    stepSeconds(sim, 1.2);
    expect(sim.ship.targets).toEqual([a]);
  });

  it("does nothing while something picked is inside the default lock range", () => {
    const sim = autoSim();
    const [a, b, c, d] = sim.rocks;
    place(a, 400, 0);
    place(b, 900, 0);
    place(c, 5000, 0);
    place(d, 5000, 0);
    sim.selectTarget(sim.ship, b);
    stepSeconds(sim, 3);
    expect(sim.ship.targets).toEqual([b]);
  });

  it("picks again while nothing picked is inside its max range, on the tail", () => {
    const sim = autoSim();
    const [a, b, c, d] = sim.rocks;
    place(a, 200, 0);
    place(b, -900, 0);
    place(c, 5000, 0);
    place(d, 5000, 0);
    expect(sim.setTweak(sim.ship, "autoTarget", "maxRange", "300")).toBe(true);
    // A stale pick behind the ship: inside the lock range, out of the turrets' reach.
    sim.selectTarget(sim.ship, b);
    stepSeconds(sim, 1.2);
    expect(sim.ship.targets).toEqual([b, a]);
    // The head is the player's, whatever the program adds.
    expect(sim.mainTarget(sim.ship)).toBe(b);
    // A fresh pick at the tail is now in reach, so the search goes quiet again.
    stepSeconds(sim, 2);
    expect(sim.ship.targets).toEqual([b, a]);
  });

  it("adds nothing while something picked is inside its max range", () => {
    const sim = autoSim();
    const [a, b, c, d] = sim.rocks;
    place(a, 200, 0);
    place(b, 100, 0);
    place(c, 5000, 0);
    place(d, 5000, 0);
    expect(sim.setTweak(sim.ship, "autoTarget", "maxRange", "300")).toBe(true);
    // The nearer rock is left out: one pick in reach is enough.
    sim.selectTarget(sim.ship, a);
    stepSeconds(sim, 3);
    expect(sim.ship.targets).toEqual([a]);
  });

  it("picks again the rock it picked is mined out", () => {
    const sim = autoSim();
    const [a, b, c, d] = sim.rocks;
    a.tier = 0;
    place(a, 400, 0);
    place(b, 900, 0);
    place(c, 5000, 0);
    place(d, 5000, 0);
    stepSeconds(sim, 1.2);
    expect(sim.ship.targets).toEqual([a]);
    // The bottom rung breaks into nothing, so the queue is empty and the search runs again.
    sim.breakRock(a);
    stepSeconds(sim, 1.2);
    expect(sim.ship.targets).toEqual([b]);
  });

  it("picks rocks unless the Picks tweak says otherwise", () => {
    const sim = autoSim();
    const [a, b, c, d] = sim.rocks;
    place(a, 400, 0);
    place(b, 5000, 0);
    place(c, 5000, 0);
    place(d, 5000, 0);
    const piece = ore(200, 0);
    sim.ores.push(piece);
    // A nearer piece of ore, and a rock is still what the default picks.
    stepSeconds(sim, 1.2);
    expect(sim.ship.targets).toEqual([a]);
    sim.clearTargets(sim.ship);
    expect(sim.setTweak(sim.ship, "autoTarget", "picks", "ore")).toBe(true);
    stepSeconds(sim, 1.2);
    expect(sim.ship.targets).toEqual([piece]);
    // Nothing to pick as the ore goes.
    sim.clearTargets(sim.ship);
    sim.ores.length = 0;
    expect(sim.setTweak(sim.ship, "autoTarget", "picks", "ships")).toBe(true);
    stepSeconds(sim, 1.2);
    expect(sim.ship.targets).toEqual([]);
  });

  it("needs Targeting loaded to pick anything", () => {
    const sim = autoSim();
    const [a, b, c, d] = sim.rocks;
    place(a, 400, 0);
    place(b, 5000, 0);
    place(c, 5000, 0);
    place(d, 5000, 0);
    sim.devSet(sim.ship, "targeting", false);
    stepSeconds(sim, 1.2);
    expect(sim.ship.targets).toEqual([]);
  });

  it("never picks a ship it shares an owner with, its own drones included", () => {
    const sim = homeSim(1, { ...DEFAULTS, testDrones: 2, droneLimit: 2 });
    const { ship } = sim;
    Object.assign(ship, { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0 });
    sim.devSet(ship, "targeting", true);
    sim.devSet(ship, "autoTarget", true);
    expect(sim.setTweak(ship, "autoTarget", "picks", "ships")).toBe(true);
    const [first, second] = sim.drones.map((pilot) => pilot.ship);
    expect(sim.drones).toHaveLength(2);
    // A test drone starts as nobody's; a bought one is its buyer's.
    first.owner = ship;
    second.owner = ship;
    // Held where they're put: a drone flies off on its own trip otherwise.
    const held = (near: { x: number; y: number }, far: { x: number; y: number }) => () => {
      Object.assign(near, { x: 100, y: 0, px: 100, py: 0 });
      Object.assign(far, { x: 200, y: 0, px: 200, py: 0 });
    };
    let hold = held(second, first);
    for (let i = 0; i < Math.round(1.2 / TICK); i++) {
      hold();
      sim.step();
    }
    // Both are the player's own drones, so neither is picked.
    expect(ship.targets).toEqual([]);
    // A ship nobody owns is fair game, even with one of its own drones nearer.
    second.owner = null;
    hold = held(first, second);
    for (let i = 0; i < Math.round(1.2 / TICK); i++) {
      hold();
      sim.step();
    }
    expect(ship.targets).toEqual([second]);
  });
});
