import { afterEach, describe, expect, it } from "vitest";
import { homeSim } from "./home";
import { partOf, TRAFFIC_BUY_ORDER } from "./parts";
import { roundTrip } from "./save";
import { DEFAULTS } from "./tuning";
import { expectedOre, type Rock, SHIP_RADIUS, Sim, STATION_HALF, TICK, TOW_GAP } from "./sim";
import { frameMountSpot } from "./frameParts";

/** Where the station frame's dock sits from its middle, along its own axis. */
const DOCK_OFFSET = frameMountSpot("station", "dock")!.x;

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

  it("lets the clamp take a caught rock back, rather than having it stuck in the dock", () => {
    const sim = world();
    const base = sim.bases[0];
    const held = beside(sim, 2, 10);
    expect(sim.toggleClamp()).toBe(true);
    // Flown to the dock, rock and all, and let go of there: the catch takes it.
    const dock = sim.dockPoint(false, base.body);
    Object.assign(sim.ship, { x: dock.x, y: dock.y, px: dock.x, py: dock.y, vx: 0, vy: 0 });
    sim.step();
    expect(sim.toggleClamp()).toBe(false);
    sim.step();
    expect(held.held).toBe("catch");
    // The clamp is the stronger hold: G takes it back, whatever the station was doing with it.
    expect(sim.toggleClamp()).toBe(true);
    expect(sim.ship.tow).toBe(held);
    expect(held.held).toBe("tow");
    // And the station doesn't take it again while the clamp has it.
    run(sim, TICK * 4);
    expect(held.held).toBe("tow");
    expect(base.refining).toBeNull();
  });

  it("pays an ore out where the rock is, so the credits can be seen coming in", () => {
    const sim = world();
    const base = sim.bases[0];
    const price = partOf("ore").price;
    takeIn(sim, 1);
    // The station goes round its orbit, so the payout is judged against the pad as it was then.
    let paid: { x: number; y: number; amount: number } | null = null;
    let pad: { x: number; y: number } | null = null;
    for (let i = 0; i < Math.round((DEFAULTS.refineSeconds + TICK * 4) / TICK) && !paid; i++) {
      sim.step();
      const event = sim.events.find((each) => each.type === "payout") as { x: number; y: number; amount: number } | undefined;
      sim.events.length = 0;
      if (!event) continue;
      paid = event;
      pad = sim.refinerySpot(base);
    }
    expect(paid?.amount).toBe(price);
    expect(Math.hypot(paid!.x - pad!.x, paid!.y - pad!.y)).toBeLessThan(2);
  });

  it("says what happened to a rock it lets go of, so the hand-over isn't a guess", () => {
    const sim = world();
    const base = sim.bases[0];
    const held = beside(sim, 1, 10);
    expect(sim.toggleClamp()).toBe(true);
    // In the middle of nowhere, nothing takes it.
    sim.toggleClamp();
    expect(sim.note?.text).toMatch(/drifts/);

    // Beside the station, the station is taking it in.
    const dock = sim.dockPoint(false, base.body);
    Object.assign(sim.ship, { x: dock.x, y: dock.y, px: dock.x, py: dock.y, vx: 0, vy: 0 });
    Object.assign(held, { x: held.px = dock.x + SHIP_RADIUS + held.radius + 10, y: held.py = dock.y });
    expect(sim.toggleClamp()).toBe(true);
    sim.toggleClamp();
    expect(sim.note?.text).toMatch(/taking it in/);

    // And while its refinery is busy, another rock drifts on.
    const busy = world();
    takeIn(busy, 1);
    const at = busy.dockPoint(false, busy.bases[0].body);
    Object.assign(busy.ship, { x: at.x, y: at.y, px: at.x, py: at.y, vx: 0, vy: 0 });
    beside(busy, 1, 10);
    expect(busy.toggleClamp()).toBe(true);
    busy.toggleClamp();
    expect(busy.note?.text).toMatch(/still working one/);
  });

  it("goes round a station, not through it, when the rock is let go of on the dock side", () => {
    const sim = world();
    const base = sim.bases[0];
    const dock = sim.dockPoint(false, base.body);
    const let_go = rock(sim, 2, dock.x, dock.y);
    let_go.releasedBy = sim.ship;
    run(sim, 60);
    // It found the pad round the far side without knocking on the station on the way.
    expect(base.refining).not.toBeNull();
    expect(base.refining!.total).toBe(sim.wholeOre(2));
    expect(let_go.hp).toBe(6);
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
    const dock = sim.dockPoint(false, base.body);
    // Opposite the dock, and far enough out that a big rock clears the station's box.
    expect(Math.hypot(spot.x - dock.x, spot.y - dock.y)).toBeCloseTo(2 * DOCK_OFFSET, 6);
    expect(Math.hypot(spot.x - base.body.x, spot.y - base.body.y)).toBeGreaterThan(STATION_HALF + base.refining!.radius);
    // And it turns with the station, staying on that side.
    run(sim, 1);
    const moved = sim.refinerySpot(base);
    expect(Math.hypot(moved.x - base.body.x, moved.y - base.body.y)).toBeCloseTo(DOCK_OFFSET, 6);
  });

  it("pauses while the station has no room, and carries on when there is", () => {
    const sim = world();
    const base = sim.bases[0];
    takeIn(sim, 1);
    const refining = base.refining!;
    const left = refining.left;
    expect(sim.stationTip(base).text).toMatch(/Refinery: \d+ ore at 10 each/);
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

describe("tow control", () => {
  /** A world with the player's ship at the clamp's own fit: the program loaded, well out from the station. */
  function towShip(settings: Partial<typeof WORLD> = {}): Sim {
    const sim = world(settings);
    sim.giveProgram(sim.ship, "towControl");
    // Well out from the station, on the dock's side of it, so the pad is round the far side.
    const station = sim.bases[0].body;
    Object.assign(sim.ship, { x: station.x + 2500, y: station.y, px: station.x + 2500, py: station.y });
    return sim;
  }

  /**
   * Flies the held rock to the station and reports what the trip came to: the fastest it ever
   * closed on the station, its speed and distance to the pad when it was let go of, and whether
   * the refinery took it.
   */
  function deliver(sim: Sim, seconds: number) {
    const base = sim.bases[0];
    const held = sim.ship.tow!;
    let worst = 0;
    let released: { speed: number; toPad: number } | null = null;
    for (let i = 0; i < Math.round(seconds / TICK); i++) {
      sim.step();
      sim.events.length = 0;
      const dx = base.body.x - held.x;
      const dy = base.body.y - held.y;
      const distance = Math.hypot(dx, dy) || 1;
      // Closing on the station, in the frame it stands still in.
      worst = Math.max(worst, (dx * held.vx + dy * held.vy) / distance);
      if (!released && sim.ship.tow !== held) {
        const pad = sim.refinerySpot(base);
        released = { speed: Math.hypot(sim.ship.vx, sim.ship.vy), toPad: Math.hypot(pad.x - held.x, pad.y - held.y) };
      }
      if (base.refining) break;
    }
    return { worst, released, refining: base.refining, held };
  }

  it("keeps a held rock under the safe speed on the way to the station, and hands it over", () => {
    const sim = towShip();
    const base = sim.bases[0];
    const held = beside(sim, 2, 10);
    expect(sim.toggleClamp()).toBe(true);
    expect(sim.orderDeliver(base)).toBe(true);

    const trip = deliver(sim, 240);
    expect(trip.released, "the clamp let go").not.toBeNull();
    expect(trip.worst, "closed on the station").toBeLessThan(DEFAULTS.safeImpactSpeed);
    // It reaches the pad under the speed the catch can take it at, on the station's own side.
    expect(trip.released!.speed).toBeLessThanOrEqual(DEFAULTS.clampSpeed);
    expect(trip.released!.toPad).toBeLessThan(DEFAULTS.catchRange);
    expect(held.hp).toBe(6);
    expect(trip.refining?.total).toBe(sim.wholeOre(2));
  });

  it("without the program the same trip takes the straight line it always did, with no room for the load", () => {
    /** Flies the pair past the station to a spot beyond it, and says how near the rock came. */
    const passStation = (program: boolean) => {
      const sim = world();
      const base = sim.bases[0];
      const station = base.body;
      // Well out on the dock's side of the station, as `towShip` puts it.
      Object.assign(sim.ship, { x: station.x + 2500, y: station.y, px: station.x + 2500, py: station.y });
      const held = beside(sim, 2, 10);
      if (program) sim.giveProgram(sim.ship, "towControl");
      expect(sim.toggleClamp()).toBe(true);
      // A click on a station is a hand-over only with the program loaded.
      expect(sim.orderDeliver(base)).toBe(program);
      expect(sim.orderMove(station.x - 2500, station.y)).toBe(true);
      const reach = Math.hypot(held.x - sim.ship.x, held.y - sim.ship.y) + held.radius;
      let closest = Infinity;
      for (let i = 0; i < Math.round(160 / TICK); i++) {
        sim.step();
        sim.events.length = 0;
        closest = Math.min(closest, Math.hypot(station.x - held.x, station.y - held.y));
        if (held.x < station.x - 500) break;
      }
      return { closest, reach, hp: held.hp };
    };

    const plain = passStation(false);
    const wide = passStation(true);
    // Slice 1's straight line takes the load well inside the ring the program keeps it out of.
    expect(plain.closest).toBeLessThan(Math.hypot(STATION_HALF, STATION_HALF) + plain.reach + 30);
    expect(wide.closest).toBeGreaterThan(plain.closest + 50);
    // Neither bumps the station on its way past: the room is the point, not the damage.
    expect(plain.hp).toBe(6);
    expect(wide.hp).toBe(6);
  });

  it("waits beside the pad while the refinery works another rock, then hands over", () => {
    const sim = towShip();
    const base = sim.bases[0];
    // Its refinery is busy with a rock for the length of the test.
    takeIn(sim, 1);
    sim.tuning.refineSeconds = 1000;
    const held = beside(sim, 1, 10);
    expect(sim.toggleClamp()).toBe(true);
    expect(sim.orderDeliver(base)).toBe(true);

    const waiting = deliver(sim, 200);
    expect(waiting.released).toBeNull();
    expect(sim.ship.tow).toBe(held);
    expect(base.refining!.total).toBe(sim.wholeOre(1));
    // The player is told what it's waiting for, over the ship.
    expect(sim.note?.text).toMatch(/Waiting for the refinery/);
    expect(sim.clickPilot.task).toBe("waiting for the refinery");
    // Held off the pad, not sitting on it, so the rock the refinery is pulling in has the room.
    expect(Math.hypot(sim.ship.x - base.body.x, sim.ship.y - base.body.y)).toBeGreaterThan(DOCK_OFFSET);

    // The pad comes free: it flies the last of the way in and lets go.
    base.refining = null;
    sim.tuning.refineSeconds = 4;
    const done = deliver(sim, 200);
    expect(done.released).not.toBeNull();
    expect(base.refining).not.toBeNull();
    expect(sim.ship.tow).toBeNull();
  });

  it("routes round a body with room for the load, and plain without it", () => {
    const sim = towShip();
    // The home has no body of its own: put one across the way, as a planet would be.
    sim.bodies = [{ name: "Planet", kind: "planet", radius: 4000, surface: "death", pullStart: 9000, pullFull: 5000, pullAccel: 150, atmosphere: 4600, burnSpeed: 300, spinPeriod: 0, orbits: [] }];
    const circle = sim.keepOutAt(sim.bodies[0]);
    const from = { x: circle.x - circle.radius * 3, y: circle.y };
    const to = { x: circle.x + circle.radius * 3, y: circle.y };
    const plain = sim.cornerToward(from.x, from.y, to.x, to.y)!;
    const plainFar = Math.hypot(plain.x - circle.x, plain.y - circle.y);
    expect(plainFar).toBeGreaterThanOrEqual(circle.radius);

    // With a load held and the program loaded, the same way round keeps clear of that much more.
    beside(sim, 2, 10);
    expect(sim.toggleClamp()).toBe(true);
    const reach = Math.hypot(sim.ship.tow!.x - sim.ship.x, sim.ship.tow!.y - sim.ship.y) + sim.ship.tow!.radius;
    const wide = sim.cornerToward(from.x, from.y, to.x, to.y, reach)!;
    expect(Math.hypot(wide.x - circle.x, wide.y - circle.y) - plainFar).toBeCloseTo(reach, -1);
  });
});

describe("tow traffic", () => {
  /** A small, still system: its field and its station close enough for a trip to be quick. */
  function towWorld(settings: Partial<typeof WORLD> = {}): Sim {
    return homeSim(1, {
      ...WORLD,
      fieldRadius: 500,
      stationDistance: 1000,
      rockCount: 4,
      rockInflow: 0,
      ...settings,
    });
  }

  /** Puts a traffic ship at the home station's dock with money to spend. */
  function atDock(sim: Sim, pilot: Sim["traffic"][number]): void {
    const at = sim.dockPoint(false, sim.bases[0].body);
    Object.assign(pilot.ship, { x: at.x, y: at.y, px: at.x, py: at.y, vx: 0, vy: 0 });
    sim.accountOf(pilot.ship).credits = 10000;
  }

  /** Every upgrade a floater's list asks for, so it has nothing left to buy but the tow pair. */
  function boughtEverything(sim: Sim, pilot: Sim["traffic"][number]): void {
    for (const id of TRAFFIC_BUY_ORDER.floater) sim.buyPart(pilot.ship, id);
  }

  /** A tow ship with its clamp and program, ready to work. */
  function readyTow(sim: Sim, pilot: Sim["traffic"][number]): void {
    pilot.towShip = true;
    sim.devSet(pilot.ship, "towControl", true);
    sim.devSet(pilot.ship, "clamp", true);
    sim.accountOf(pilot.ship).credits = 10000;
  }

  it("turns a floater that has bought everything else, buying Tow control then the clamp", () => {
    const sim = towWorld({ trafficFloaters: 1, towShipChance: 1, trafficBuffer: 0 });
    const pilot = sim.traffic[0];
    atDock(sim, pilot);
    boughtEverything(sim, pilot);
    expect(sim.wishlistFor(pilot.ship)).toHaveLength(0);
    expect(pilot.considerTow(sim)).toBe(true);
    expect(pilot.towShip).toBe(true);
    // Tow control comes first, and a slot is made for it by unloading the turn program.
    for (let i = 0; i < 3; i++) sim.step();
    expect(pilot.ship.software.has("towControl")).toBe(true);
    expect(pilot.ship.programs).toContain("towControl");
    for (let i = 0; i < 3; i++) sim.step();
    expect(sim.hasClamp(pilot.ship)).toBe(true);
    // The clamp takes the tractor's mount, and the tractor with it.
    expect(pilot.ship.parts.has("tractor")).toBe(false);
  });

  it("keeps most of a base's traffic mining", () => {
    const sim = towWorld({ trafficFloaters: 3, towShipChance: 1, trafficBuffer: 0 });
    sim.traffic[0].towShip = true;
    expect(sim.towShareFull(sim.traffic[1].ship)).toBe(true);
    const second = sim.traffic[1];
    atDock(sim, second);
    boughtEverything(sim, second);
    expect(second.considerTow(sim)).toBe(false);
    expect(second.towShip).toBe(false);
  });

  it("takes a whole rock to the refinery, which pays it for the ore that comes out", () => {
    const sim = towWorld({ trafficFloaters: 1, clickSpeed: 200 });
    const pilot = sim.traffic[0];
    readyTow(sim, pilot);
    const field = sim.ownField(pilot.ship);
    pilot.working = field.id;
    Object.assign(pilot.ship, { x: field.poi.x + 100, y: field.poi.y, px: field.poi.x + 100, py: field.poi.y, vx: 0, vy: 0 });
    // One big rock, worth a trip, and the field's own small ones.
    const big = sim.makeRock(2, field.poi.x + 300, field.poi.y, 0, 0);
    sim.rocks.push(big);
    const base = sim.bases[0];
    for (let i = 0; i < Math.round(400 / TICK) && !base.refining; i++) {
      sim.step();
      sim.events.length = 0;
    }
    expect(base.refining).not.toBeNull();
    expect(base.refining!.owner).toBe(pilot.ship);
    // The refinery pays as the ore comes out, as it pays the player.
    for (let i = 0; i < Math.round((DEFAULTS.refineSeconds + 1) / TICK); i++) {
      sim.step();
      sim.events.length = 0;
    }
    expect(pilot.ship.earned).toBeGreaterThan(0);
  }, 30000);

  it("never lets two tow ships pick the same rock", () => {
    const sim = towWorld({ trafficFloaters: 2 });
    const [a, b] = sim.traffic;
    for (const pilot of [a, b]) {
      readyTow(sim, pilot);
      const field = sim.ownField(pilot.ship);
      Object.assign(pilot.ship, { x: field.poi.x, y: field.poi.y, px: field.poi.x, py: field.poi.y, vx: 0, vy: 0 });
      pilot.working = field.id;
    }
    const big = sim.makeRock(2, sim.field.x + 100, sim.field.y, 0, 0);
    sim.rocks.push(big);
    sim.step();
    // One of them has it; the other found something else to do.
    expect([a.ship.tow, b.ship.tow].filter((held) => held === big)).toHaveLength(1);
  });

  it("lets go of its load when it flees", () => {
    const sim = towWorld({ trafficFloaters: 1, pirates: 1 });
    const pilot = sim.traffic[0];
    readyTow(sim, pilot);
    // Clear of the field's rocks, so nothing blocks the sight between the two ships.
    Object.assign(pilot.ship, { x: 5000, y: 5000, px: 5000, py: 5000, vx: 0, vy: 0 });
    const rock = sim.makeRock(2, pilot.ship.x + 100, pilot.ship.y, 0, 0);
    sim.rocks.push(rock);
    expect(sim.grabTow(pilot.ship, rock)).toBe(true);
    // Marked, a pirate comes for it: the rock is let go of first.
    pilot.ship.marked = true;
    const pirate = sim.fighters.find((each) => each.ship.faction === "pirate")!.ship;
    Object.assign(pirate, { x: pilot.ship.x, y: pilot.ship.y + 200, px: pilot.ship.x, py: pilot.ship.y + 200 });
    sim.step();
    expect(pilot.ship.tow).toBeNull();
    expect(rock.held).toBeUndefined();
  });

  /** Keeps the camera, and so the player's ship, far from everything: traffic runs as records. */
  function parkAway(sim: Sim): void {
    sim.ship.x = sim.ship.px = 40000;
    sim.ship.y = sim.ship.py = 40000;
    sim.ship.vx = sim.ship.vy = 0;
  }

  it("a tow record takes a rock from a sleeping field and fills the refinery on arrival", () => {
    const sim = towWorld({ trafficFloaters: 1, clickSpeed: 200 });
    const pilot = sim.traffic[0];
    readyTow(sim, pilot);
    const field = sim.ownField(pilot.ship);
    const big = sim.makeRock(2, field.poi.x + 100, field.poi.y, 0, 0);
    sim.rocks.push(big);
    parkAway(sim);
    const base = sim.bases[0];
    let carried = false;
    for (let i = 0; i < Math.round(600 / TICK) && !base.refining; i++) {
      sim.step();
      sim.events.length = 0;
      parkAway(sim);
      if (pilot.ship.tow) carried = true;
    }
    expect(sim.sleeping.size).toBeGreaterThan(0);
    expect(carried).toBe(true);
    expect(base.refining).not.toBeNull();
    expect(base.refining!.owner).toBe(pilot.ship);
  }, 30000);

  it("a tow record woken mid-trip is a flown ship holding its rock", () => {
    const sim = towWorld({ trafficFloaters: 1, clickSpeed: 200 });
    const pilot = sim.traffic[0];
    readyTow(sim, pilot);
    const field = sim.ownField(pilot.ship);
    sim.rocks.push(sim.makeRock(2, field.poi.x + 100, field.poi.y, 0, 0));
    parkAway(sim);
    for (let i = 0; i < Math.round(300 / TICK) && !pilot.ship.tow; i++) {
      sim.step();
      sim.events.length = 0;
      parkAway(sim);
    }
    expect(pilot.record?.hauling).toBe("rock");
    // The camera comes to it: the record wakes with what it carried.
    sim.ship.x = sim.ship.px = pilot.ship.x + 1000;
    sim.ship.y = sim.ship.py = pilot.ship.y;
    sim.step();
    expect(pilot.record).toBeNull();
    expect(pilot.ship.tow).not.toBeNull();
    expect(pilot.ship.tow!.held).toBe("tow");
  }, 30000);

  it("a block record takes a block from the pad and places it at the site", () => {
    const sim = towWorld({
      trafficFloaters: 1,
      clickSpeed: 200,
      depositParts: 20,
      depositPrice: 1000,
      depositBuildRate: 100,
      stationStartParts: 1000,
      stationReserveParts: 0,
    });
    const base = sim.bases[0];
    // The player funds the deposit from the dock, then leaves the area.
    const at = sim.dockPoint(false, base.body);
    Object.assign(sim.ship, { x: at.x, y: at.y, px: at.x, py: at.y, vx: 0, vy: 0 });
    sim.ship.credits = 100000;
    expect(sim.fundBlueprint(sim.ship, "deposit")).toBe(true);
    const deposit = sim.deposits[0];
    const pilot = sim.traffic[0];
    readyTow(sim, pilot);
    parkAway(sim);
    for (let i = 0; i < Math.round(900 / TICK) && !sim.unlocked("deposit"); i++) {
      sim.step();
      sim.events.length = 0;
      parkAway(sim);
    }
    expect(deposit.partsUsed).toBe(20);
    expect(sim.unlocked("deposit")).toBe(true);
  }, 45000);
});
