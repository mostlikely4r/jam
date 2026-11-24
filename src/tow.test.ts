import { afterEach, describe, expect, it } from "vitest";
import { homeSim } from "./home";
import { partOf } from "./parts";
import { roundTrip } from "./save";
import { DEFAULTS } from "./tuning";
import { DOCK_OFFSET, expectedOre, type Rock, SHIP_RADIUS, Sim, STATION_HALF, TICK, TOW_GAP } from "./sim";

// Long runs never give the worker a turn of the event loop otherwise (see pilot.test.ts).
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** A still world: no traffic, no pirates, no haulers, and no rocks but the ones a test lays. */
const WORLD = {
  ...DEFAULTS,
  floaterStart: true,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  haulers: false,
  rockCount: 0,
  fieldOrbitRadius: 0,
  fieldOrbitPeriod: 0,
  fieldRotationPeriod: 0,
  stationRotationPeriod: 0,
  repairCost: 0,
  stationStartCredits: 100000,
  stationStartParts: 1000,
  stationStorage: 100000,
  stationReserveParts: 0,
};

function world(settings: Partial<typeof WORLD> = {}): Sim {
  const sim = homeSim(1, { ...WORLD, ...settings });
  Object.assign(sim.ship, { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, angle: 0, prevAngle: 0, spin: 0 });
  sim.devSet(sim.ship, "clamp", true);
  return sim;
}

/** A rock laid at a spot, in the world's rocks. */
function rock(sim: Sim, tier: number, x: number, y: number, vx = 0, vy = 0): Rock {
  const made = sim.makeRock(tier, x, y, vx, vy);
  sim.rocks.push(made);
  return made;
}

function run(sim: Sim, seconds: number): void {
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i++) {
    sim.step();
    sim.events.length = 0;
  }
}

/** A rock of this tier with its edge this far past the ship's, beside the ship where it is now. */
function beside(sim: Sim, tier: number, clear: number, back = false): Rock {
  const at = rock(sim, tier, 0, 0);
  const out = SHIP_RADIUS + at.radius + clear;
  at.x = at.px = sim.ship.x + (back ? -out : out);
  at.y = at.py = sim.ship.y;
  return at;
}

/** How far a rock's edge is from the ship's: the clamp's measure of reach. */
function gap(sim: Sim, at: Rock): number {
  return Math.hypot(at.x - sim.ship.x, at.y - sim.ship.y) - at.radius - SHIP_RADIUS;
}

describe("the clamp", () => {
  it("grabs the nearest rock in reach", () => {
    const sim = world();
    const further = beside(sim, 0, DEFAULTS.clampRange - 2);
    const nearer = beside(sim, 0, 10, true);
    expect(gap(sim, further)).toBeLessThan(DEFAULTS.clampRange);
    expect(gap(sim, nearer)).toBeLessThan(gap(sim, further));

    expect(sim.toggleClamp()).toBe(true);
    expect(sim.ship.tow).toBe(nearer);
    expect(nearer.held).toBe("tow");
  });

  it("refuses a rock too far off, or drifting too fast, and says why", () => {
    const sim = world();
    beside(sim, 0, DEFAULTS.clampRange + 20);
    expect(sim.toggleClamp()).toBe(false);
    expect(sim.note?.text).toMatch(/reach/);

    const fast = beside(sim, 0, 20);
    fast.vx = DEFAULTS.clampSpeed + 5;
    expect(sim.toggleClamp()).toBe(false);
    expect(sim.note?.text).toMatch(/fast/);

    fast.vx = DEFAULTS.clampSpeed - 5;
    expect(sim.toggleClamp()).toBe(true);
    expect(sim.ship.tow).toBe(fast);
  });

  it("weighs the ship down by the whole rock, and holds it where the clamp hangs it", () => {
    const sim = world();
    const heavy = beside(sim, 2, 10);
    const weight = sim.shipWeight(sim.ship);
    const response = sim.shipResponse(sim.ship);
    expect(sim.toggleClamp()).toBe(true);
    expect(sim.ship.tow).toBe(heavy);
    expect(sim.shipWeight(sim.ship)).toBeCloseTo(weight + sim.rockMass(heavy) * DEFAULTS.towMassScale, 6);
    expect(sim.shipResponse(sim.ship)).toBeLessThan(response);

    run(sim, 1);
    // It stays at the clamp's arm's length, turning with the ship rather than drifting.
    expect(gap(sim, heavy)).toBeCloseTo(TOW_GAP, 6);
    expect(heavy.held).toBe("tow");
    expect(sim.ship.tow).toBe(heavy);
  });

  it("keeps a held rock out of its field, out of a sleeping field, and off everyone's guns", () => {
    const sim = world();
    // Far outside the field, and flying, where a loose rock would be a stray.
    Object.assign(sim.ship, { x: 0, y: 40000, px: 0, py: 40000 });
    const out = beside(sim, 1, 10);
    expect(sim.toggleClamp()).toBe(true);
    // Now flying fast: a rock it holds goes with it, where a loose one would have strayed.
    sim.ship.vx = 60;
    // Nobody can pick it, so no gun and no auto-mine program turns on what the clamp holds.
    expect(sim.targetables()).not.toContain(out);
    sim.selectTarget(sim.ship, out);
    expect(sim.ship.targets).toEqual([]);

    run(sim, DEFAULTS.rockStraySeconds + 2);
    expect(sim.rocks).toContain(out);
    expect(out.strayed).toBeUndefined();
    // The field it was nowhere near fell asleep without it.
    expect(sim.sleeping.size).toBeGreaterThan(0);
    for (const sleeping of sim.sleeping.values()) expect(sleeping.rocks).not.toContain(out);
  });

  it("lets go of it where it is, carrying the ship's motion at that spot", () => {
    const sim = world();
    const held = beside(sim, 1, 20);
    expect(sim.toggleClamp()).toBe(true);
    Object.assign(sim.ship, { vx: 50, vy: -20 });
    expect(sim.toggleClamp()).toBe(false);
    expect(sim.ship.tow).toBeNull();
    expect(held.held).toBeUndefined();
    expect(held.vx).toBeCloseTo(50, 6);
    expect(held.vy).toBeCloseTo(-20, 6);

    // A turning ship carries the rock round with it, and lets go of it moving that way.
    const spin = world();
    const round = beside(spin, 1, 20);
    expect(spin.toggleClamp()).toBe(true);
    const spot = { x: round.x - spin.ship.x, y: round.y - spin.ship.y };
    spin.ship.spin = 2;
    expect(spin.toggleClamp()).toBe(false);
    expect(round.vx).toBeCloseTo(-2 * spot.y, 6);
    expect(round.vy).toBeCloseTo(2 * spot.x, 6);
  });

  it("takes no damage from a gentle touch, and cracks on a hard one", () => {
    /** A rock held, with another one a hair inside its reach, so they touch on the next tick. */
    const touching = () => {
      const sim = world();
      const held = beside(sim, 2, 10);
      expect(sim.toggleClamp()).toBe(true);
      const wall = rock(sim, 0, 0, 0);
      wall.x = wall.px = held.x + held.radius + wall.radius - 0.05;
      return { sim, held, wall };
    };

    const gentle = touching();
    gentle.sim.ship.vx = DEFAULTS.safeImpactSpeed / 4;
    gentle.sim.step();
    expect(gentle.held.hp).toBe(6);
    expect(gentle.sim.ship.tow).toBe(gentle.held);
    // Both are knocked apart, and the pair, far heavier, is slowed the less.
    expect(gentle.wall.vx).toBeGreaterThan(0);
    expect(gentle.sim.ship.vx).toBeGreaterThan(0);

    const hard = touching();
    hard.sim.ship.vx = 400;
    hard.sim.step();
    // It came apart, and the clamp kept the biggest piece it could still reach.
    expect(hard.sim.rocks).not.toContain(hard.held);
    expect(hard.sim.ship.tow).not.toBeNull();
    expect(hard.sim.ship.tow).not.toBe(hard.held);
    expect(hard.sim.ship.tow!.held).toBe("tow");
  });

  it("knocks other ships out of the way, and is knocked by them", () => {
    const sim = world({ testDrones: 1, droneParts: 0, droneLimit: 1 });
    const held = beside(sim, 2, 10);
    expect(sim.toggleClamp()).toBe(true);
    // Another ship, just out of the held rock's reach, straight ahead.
    const other = sim.drones[0].ship;
    other.x = other.px = held.x + held.radius + SHIP_RADIUS + 0.5;
    other.y = other.py = held.y;
    other.vx = 0;
    // Flying into it: the pair and the ship are knocked apart, and the rock feels it.
    sim.ship.vx = 120;
    sim.step();
    expect(held.hp).toBeLessThan(6);
    expect(sim.ship.vx).toBeLessThan(120);
    expect(other.vx).toBeGreaterThan(0);
  });

  it("cracks on what it would have stepped over at speed: its path is swept, not just where it lands", () => {
    const sim = world();
    const held = beside(sim, 2, 10);
    expect(sim.toggleClamp()).toBe(true);
    // A small rock ahead and to the side, clear of the ship's own path but not of the rock's,
    // and far enough that at this speed the clamp lands the big one past it.
    const ahead = rock(sim, 0, held.x + held.radius + 18 + 80, held.y + 50);
    sim.ship.vx = 20000;
    sim.step();
    // It was stopped on the small rock, not stepped over it.
    expect(ahead.vx).toBeGreaterThan(0);
    expect(sim.rocks).not.toContain(held);
  });

  it("lets go when the clamp is taken off its mount", () => {
    const sim = world();
    const held = beside(sim, 1, 20);
    expect(sim.toggleClamp()).toBe(true);
    sim.devSet(sim.ship, "clamp", false);
    run(sim, TICK * 4);
    expect(sim.ship.tow).toBeNull();
    expect(held.held).toBeUndefined();
  });
});

describe("a whole rock", () => {
  it("is worth what mining it gives, times the bonus", () => {
    // The tiers' averages at the default ore chance: about 0.45, 2.0 and 6.4 ore.
    expect(expectedOre(0, 0.45)).toBeCloseTo(0.45, 6);
    expect(expectedOre(1, 0.45)).toBeCloseTo(2.025, 6);
    expect(expectedOre(2, 0.45)).toBeCloseTo(6.4125, 6);
    const sim = world();
    expect(sim.wholeOre(0)).toBe(1);
    expect(sim.wholeOre(1)).toBe(4);
    expect(sim.wholeOre(2)).toBe(13);
  });

  it("matches what breaking it all the way down really gives, over many rocks", () => {
    const sim = world();
    /** Every ore a rock and all its pieces give, broken one after another. */
    const oreOf = (tier: number): number => {
      const before = sim.ores.length;
      const stack = [rock(sim, tier, 0, 60000)];
      while (stack.length > 0) {
        const next = stack.pop()!;
        const had = new Set(sim.rocks);
        sim.breakRock(next);
        for (const made of sim.rocks) if (!had.has(made)) stack.push(made);
      }
      return sim.ores.length - before;
    };
    for (const [tier, rounds] of [
      [0, 500],
      [1, 500],
      [2, 200],
    ] as const) {
      let found = 0;
      for (let i = 0; i < rounds; i++) found += oreOf(tier);
      const mean = found / rounds;
      const want = expectedOre(tier, sim.tuning.oreChance);
      expect(Math.abs(mean - want) / want, `tier ${tier}`).toBeLessThan(0.03);
    }
  });
});

describe("the station's catch and refinery", () => {
  it("catches a rock let go of near it, pulls it in slowly, and hands it to the refinery", () => {
    const sim = world();
    const base = sim.bases[0];
    const spot = sim.refinerySpot(base);
    const letGo = rock(sim, 2, spot.x - 200, spot.y);
    letGo.releasedBy = sim.ship;
    expect(base.refining).toBeNull();

    run(sim, TICK);
    expect(letGo.held).toBe("catch");
    run(sim, 20);
    expect(base.refining).not.toBeNull();
    expect(sim.rocks).not.toContain(letGo);
    expect(base.refining!.owner).toBe(sim.ship);
    expect(base.refining!.total).toBe(sim.wholeOre(2));
  });

  it("catches only a rock that was let go of, so a broken one's pieces stay loose", () => {
    const sim = world();
    const base = sim.bases[0];
    const spot = sim.refinerySpot(base);
    const piece = rock(sim, 0, spot.x - 200, spot.y);
    run(sim, TICK * 2);
    expect(piece.held).toBeUndefined();
    expect(base.refining).toBeNull();

    piece.releasedBy = sim.ship;
    run(sim, TICK);
    expect(piece.held).toBe("catch");
  });

  it("pays its owner ore by ore, into the station's store from its account", () => {
    const sim = world();
    const base = sim.bases[0];
    const price = partOf("ore").price;
    const before = { ore: base.ore.get("ore") ?? 0, credits: sim.ship.credits, account: base.account.credits, flow: sim.itemFlow.get("ore") ?? 0 };
    takeIn(sim, 2);
    const refining = base.refining!;

    run(sim, DEFAULTS.refineSeconds + TICK * 2);
    expect(refining.left).toBe(refining.total - 1);
    expect(base.ore.get("ore")).toBe(before.ore + 1);
    expect(sim.ship.credits).toBe(before.credits + price);
    expect(base.account.credits).toBe(before.account - price);
    expect(sim.itemFlow.get("ore")).toBe(before.flow + 1);

    // On until the rock is gone.
    run(sim, DEFAULTS.refineSeconds * (refining.total + 1));
    expect(base.refining).toBeNull();
    expect(base.ore.get("ore")).toBe(before.ore + refining.total);
    expect(sim.ship.credits).toBe(before.credits + price * refining.total);
  });

  it("works it beside the station, clear of its box and away from the dock", () => {
    const sim = world();
    const base = sim.bases[0];
    takeIn(sim, 2);
    const spot = sim.refinerySpot(base);
    const dock = sim.dockPoint(false, base.poi);
    // Opposite the dock, and far enough out that a big rock clears the station's box.
    expect(Math.hypot(spot.x - dock.x, spot.y - dock.y)).toBeCloseTo(2 * DOCK_OFFSET, 6);
    expect(Math.hypot(spot.x - base.poi.x, spot.y - base.poi.y)).toBeGreaterThan(STATION_HALF + base.refining!.radius);
    // And it turns with the station, staying on that side.
    run(sim, 1);
    const moved = sim.refinerySpot(base);
    expect(Math.hypot(moved.x - base.poi.x, moved.y - base.poi.y)).toBeCloseTo(DOCK_OFFSET, 6);
  });

  it("pauses while the station has no room, and carries on when there is", () => {
    const sim = world();
    const base = sim.bases[0];
    takeIn(sim, 1);
    const refining = base.refining!;
    const left = refining.left;
    expect(sim.stationTip(base).text).toMatch(/Refinery: \d+ ore to go/);
    sim.tuning.stationStorage = 1;
    run(sim, DEFAULTS.refineSeconds * 3);
    expect(refining.left).toBe(left);
    expect(refining.timer).toBe(0);
    // The station's tooltip says why the refinery is waiting.
    expect(sim.stationTip(base).text).toMatch(/no room/);

    sim.tuning.stationStorage = 100000;
    // It picks up where it stopped: the ore it was waiting to give out comes at once.
    run(sim, TICK * 2);
    expect(refining.left).toBe(left - 1);
  });
});

describe("saving", () => {
  it("keeps the rock a clamp holds and the one a refinery is working", () => {
    const sim = world();
    beside(sim, 1, 20);
    expect(sim.toggleClamp()).toBe(true);
    takeIn(sim, 2);
    sim.bases[0].refining!.left -= 3;

    const into = homeSim(99, { ...WORLD });
    roundTrip(sim, into);

    expect(into.ship.tow).not.toBeNull();
    expect(into.ship.tow!.held).toBe("tow");
    expect(into.rocks).toContain(into.ship.tow);
    expect(into.rocks.length).toBe(sim.rocks.length);

    const refining = into.bases[0].refining!;
    const left = refining.left;
    expect(left).toBe(sim.bases[0].refining!.left);
    expect(refining.total).toBe(sim.wholeOre(2));
    expect(refining.owner).toBe(into.ship);
    // And it carries on from there, still held and still refining.
    run(into, DEFAULTS.refineSeconds + TICK * 2);
    expect(into.bases[0].refining!.left).toBe(left - 1);
    expect(into.ship.tow!.held).toBe("tow");
  });
});

/** Hands the station a whole rock at its refinery spot, as a catch would, and lets it arrive. */
function takeIn(sim: Sim, tier: number): void {
  const base = sim.bases[0];
  const spot = sim.refinerySpot(base);
  const at = rock(sim, tier, spot.x, spot.y);
  at.releasedBy = sim.ship;
  at.held = "catch";
  at.catcher = base.id;
  run(sim, TICK * 2);
  expect(base.refining).not.toBeNull();
}
