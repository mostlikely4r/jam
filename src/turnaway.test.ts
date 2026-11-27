import { afterEach, describe, expect, it } from "vitest";
import { homeFields, homeSim, homeStations } from "./home";
import { DronePilot, pickTurnAway, TURN_AWAYS, type TurnAway } from "./pilot";
import { type FieldSpec, type Poi, type Ship, Sim, type StationSpec, TICK } from "./sim";
import { DEFAULTS } from "./tuning";
import { partOn, placeParts } from "./frameParts";

// Long runs never give the worker a turn of the event loop otherwise (see pilot.test.ts).
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** Two bases, one traffic racer each, and nothing else moving: the first base's store full, the second's roomy. */
const WORLD = {
  ...DEFAULTS,
  floaterStart: false,
  trafficRacers: 1,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  haulers: false,
  stationUnlocks: false,
  tradeChance: 0,
  depositDropChance: 0,
  fieldWanderChance: 0,
  rockCount: 40,
  fieldOrbitRadius: 60000,
  fieldOrbitPeriod: 10800,
  stationStartParts: 0,
  stationStorage: 0,
  chatter: false,
  // Stray shots from other traffic aren't reported, or a wanted ship has everyone sheltering.
  trafficPatience: 1e9,
};

/** How far round the orbit the second base sits: near enough that a trip there is short. */
const APART = 0.15;

function world(tuning: Partial<typeof WORLD> = {}): Sim {
  const sim = homeSim(1, { ...WORLD, ...tuning });
  const home = Math.atan2(sim.field.y, sim.field.x) - (2 * Math.PI * sim.now) / 10800;
  const orbit = (apart: number) => [{ radius: 60000, period: 10800, phase: home + apart, sign: 1 as const }];
  const second: FieldSpec = {
    id: "second:0",
    name: "Second",
    radius: 3000,
    rocks: 40,
    rockDrift: 0,
    rockInflow: 0,
    carryFull: 2000,
    carryNone: 8000,
    rotationPeriod: 0,
    orbits: orbit(APART),
  };
  const spec: StationSpec = {
    id: "outpost:0",
    name: "Outpost",
    rotationPeriod: 300,
    orbits: orbit(APART + 0.05),
    carryFull: 2000,
    carryNone: 6000,
    parts: placeParts({ storage: 100000 }),
  };
  sim.applyLayout(homeFields(sim, second), homeStations(sim, spec));
  return sim;
}

function dockAt(sim: Sim, ship: Ship, station: Poi): void {
  const dock = sim.dockPoint(false, station);
  ship.x = ship.px = dock.x;
  ship.y = ship.py = dock.y;
  ship.vx = ship.vy = 0;
}

function run(sim: Sim, seconds: number, each?: () => boolean | void): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) {
    sim.step();
    sim.events.length = 0;
    if (each?.()) return;
  }
}

/** The first base's traffic, docked at its full store with `ore` aboard and hauling. */
function turnedAway(sim: Sim, ore: number): DronePilot {
  const pilot = sim.traffic.find((each) => each.ship.home === sim.bases[0].id)!;
  dockAt(sim, pilot.ship, sim.bases[0].body);
  sim.setOre(pilot.ship, ore);
  pilot.startHauling();
  return pilot;
}

/** A roll that lands in the middle of a choice's share. */
function rollFor(weights: Record<TurnAway, number>, choice: TurnAway): number {
  const total = TURN_AWAYS.reduce((sum, each) => sum + weights[each], 0);
  let before = 0;
  for (const each of TURN_AWAYS) {
    if (each === choice) return (before + weights[each] / 2) / total;
    before += weights[each];
  }
  throw new Error(choice);
}

/** Fixes the next rolls to land on a choice, from the pilot's own weights as it stands. */
function fixRoll(sim: Sim, pilot: DronePilot, choice: TurnAway): void {
  const { weights } = pilot.turnAwayWeights(sim, sim.bases[0]);
  expect(weights[choice]).toBeGreaterThan(0);
  const roll = rollFor(weights, choice);
  sim.roll = () => roll;
}

/** Parks the player's ship, and so the camera, far out from both bases. */
function parkAway(sim: Sim): void {
  sim.ship.x = sim.ship.px = sim.bases[0].body.x * 3;
  sim.ship.y = sim.ship.py = sim.bases[0].body.y * 3;
  sim.ship.vx = sim.ship.vy = 0;
}

describe("the turned-away dice", () => {
  it("picks by weight, and waits when nothing else has any", () => {
    const zero = { wait: 0, deposit: 0, mine: 0, station: 0 };
    expect(pickTurnAway(zero, 0.5)).toBe("wait");
    const weights = { wait: 1, deposit: 0, mine: 2, station: 1 };
    expect(pickTurnAway(weights, 0)).toBe("wait");
    expect(pickTurnAway(weights, 0.3)).toBe("mine");
    expect(pickTurnAway(weights, 0.74)).toBe("mine");
    expect(pickTurnAway(weights, 0.8)).toBe("station");
    expect(pickTurnAway(weights, 1)).toBe("station");
  });

  it("weighs each choice by its reason", () => {
    const sim = world();
    const pilot = turnedAway(sim, 1);
    const base = sim.bases[0];
    // No hauler coming: waiting is a poor bet. No deposit: none to sell at. A near-empty hold: mine more.
    let { weights, station } = pilot.turnAwayWeights(sim, base);
    expect(weights.wait).toBeCloseTo(0.3);
    expect(weights.deposit).toBe(0);
    expect(weights.mine).toBe(2);
    expect(station).toBe(sim.bases[1]);
    expect(weights.station).toBeGreaterThan(0);
    // A full hold can't mine more.
    sim.setOre(pilot.ship, sim.deliveryLoad(pilot.ship));
    ({ weights } = pilot.turnAwayWeights(sim, base));
    expect(weights.mine).toBe(0);
    // Nothing else to try, and every other weight 0: it waits.
    expect(sim.otherBase(base, new Set([sim.bases[1].id]))).toBeNull();
  });

  it("weighs a hauler due soon as worth the wait", () => {
    const sim = world({ haulers: true });
    const pilot = turnedAway(sim, 1);
    const base = sim.bases[0];
    const eta = sim.haulerEta(base);
    if (eta === null || eta >= 120) {
      // Bring the hauler near: run until it's under two minutes out.
      run(sim, 900, () => {
        const left = sim.haulerEta(base);
        return left !== null && left < 120 && left > 0;
      });
    }
    expect(pilot.turnAwayWeights(sim, base).weights.wait).toBe(4);
  }, 60000);
});

describe("traffic turned away at a full store", () => {
  it("holds a few seconds first, then waits for room if that's the roll", () => {
    const sim = world();
    const pilot = turnedAway(sim, 4);
    fixRoll(sim, pilot, "wait");
    run(sim, sim.tuning.turnAwaySeconds - 1);
    expect(pilot.lastTurnAway).toBeNull();
    run(sim, 2);
    expect(pilot.lastTurnAway).toBe("wait");
    run(sim, 60);
    expect(sim.dockedAt(pilot.ship)).toBe(sim.bases[0].body);
    expect(sim.oreIn(pilot.ship)).toBe(4);
    expect(pilot.task).toBe("unloading");
    // Once there's room, it sells as ever.
    partOn(sim.bases[0].body.parts, "storage")!.data.cells = 1000;
    run(sim, 10);
    expect(sim.oreIn(pilot.ship)).toBe(0);
  }, 30000);

  it("goes back to the rocks with its load, and hauls again when full", () => {
    const sim = world();
    const pilot = turnedAway(sim, 2);
    fixRoll(sim, pilot, "mine");
    run(sim, sim.tuning.turnAwaySeconds + 1);
    expect(pilot.lastTurnAway).toBe("mine");
    expect(pilot.isHauling).toBe(false);
    run(sim, 10);
    expect(sim.isDocked(pilot.ship)).toBe(false);
    expect(sim.oreIn(pilot.ship)).toBeGreaterThanOrEqual(2);
    run(sim, 400, () => pilot.isHauling);
    expect(sim.oreIn(pilot.ship)).toBeGreaterThanOrEqual(sim.deliveryLoad(pilot.ship));
  }, 60000);

  it("tries the next station over, and sells there", () => {
    const sim = world();
    const pilot = turnedAway(sim, 4);
    fixRoll(sim, pilot, "station");
    run(sim, sim.tuning.turnAwaySeconds + 1);
    expect(pilot.lastTurnAway).toBe("station");
    expect(pilot.sellAt).toBe(sim.bases[1].id);
    const before = sim.oreCount(sim.bases[1].ore);
    run(sim, 900, () => sim.oreIn(pilot.ship) === 0);
    expect(sim.oreIn(pilot.ship)).toBe(0);
    expect(sim.oreCount(sim.bases[1].ore)).toBe(before + 4);
    // The load is sold: what it chose for it is over.
    run(sim, 1);
    expect(pilot.sellAt).toBeNull();
  }, 60000);

  it("won't try a station that turned this load away again", () => {
    const sim = world();
    partOn(sim.bases[1].body.parts, "storage")!.data.cells = 0;
    const pilot = turnedAway(sim, 4);
    fixRoll(sim, pilot, "station");
    run(sim, sim.tuning.turnAwaySeconds + 1);
    expect(pilot.sellAt).toBe(sim.bases[1].id);
    run(sim, 900, () => sim.dockedAt(pilot.ship) === sim.bases[1].body);
    expect(sim.dockedAt(pilot.ship)).toBe(sim.bases[1].body);
    // Turned away again. Both bases have turned this load away, so the top roll, once the next
    // station, now falls on whatever's left.
    sim.roll = () => 0.999;
    run(sim, sim.tuning.turnAwaySeconds + 1);
    const { weights, station } = pilot.turnAwayWeights(sim, sim.bases[1]);
    expect(station).toBeNull();
    expect(weights.station).toBe(0);
    expect(pilot.lastTurnAway).not.toBeNull();
    expect(pilot.lastTurnAway).not.toBe("station");
  }, 60000);

  it("sells at a deposit, however far it is from the dock", () => {
    const sim = world({ depositFree: true, depositReach: 150, depositCapacity: 300 });
    sim.step();
    expect(sim.deposits.length).toBeGreaterThan(0);
    const pilot = turnedAway(sim, 4);
    // Right at its own dock, no deposit is nearer, yet one has room.
    expect(sim.depositFor(pilot.ship)).toBeNull();
    expect(sim.depositWithRoom(pilot.ship)).not.toBeNull();
    fixRoll(sim, pilot, "deposit");
    run(sim, sim.tuning.turnAwaySeconds + 1);
    expect(pilot.lastTurnAway).toBe("deposit");
    const deposit = pilot.sellDeposit!;
    expect(deposit).not.toBeNull();
    run(sim, 900, () => sim.oreIn(pilot.ship) === 0);
    expect(sim.oreCount(deposit.ore)).toBe(4);
  }, 60000);

  it("is only traffic: the player's own drones still wait in the dock", () => {
    const sim = world({ turnAwaySeconds: 0 });
    const pilot = turnedAway(sim, 4);
    pilot.ship.owner = sim.ship;
    run(sim, 20);
    expect(pilot.lastTurnAway).toBeNull();
    expect(sim.dockedAt(pilot.ship)).toBe(sim.bases[0].body);
  });

  it("never sits in the dock with ore for long unless it chose to wait", () => {
    const sim = world({ trafficRacers: 3 });
    const docked = new Map<Ship, number>();
    let longest = 0;
    run(sim, 900, () => {
      for (const pilot of sim.traffic) {
        const sitting = sim.isDocked(pilot.ship) && sim.oreIn(pilot.ship) > 0 && pilot.lastTurnAway !== "wait";
        const time = sitting ? (docked.get(pilot.ship) ?? 0) + TICK : 0;
        docked.set(pilot.ship, time);
        longest = Math.max(longest, time);
      }
    });
    // Some were turned away, or this proves nothing.
    expect(sim.traffic.some((pilot) => pilot.lastTurnAway !== null)).toBe(true);
    expect(longest).toBeLessThan(180);
  }, 120000);
});

describe("a record turned away", () => {
  for (const choice of ["wait", "mine", "station"] as TurnAway[]) {
    it(`makes the same choice as a flown ship with the same roll: ${choice}`, () => {
      const flown = world();
      const flownPilot = turnedAway(flown, 2);
      fixRoll(flown, flownPilot, choice);
      run(flown, flown.tuning.turnAwaySeconds + 1);

      const away = world();
      const pilot = turnedAway(away, 2);
      fixRoll(away, pilot, choice);
      run(away, away.tuning.turnAwaySeconds + 1, () => parkAway(away));
      // The dock visit runs all at once, so it's chosen by now either way.
      expect(pilot.record).not.toBeNull();
      expect(pilot.lastTurnAway).toBe(flownPilot.lastTurnAway);
      expect(pilot.lastTurnAway).toBe(choice);
      const record = pilot.record!;
      if (choice === "station") {
        expect(record.goal).toBe("dock");
        expect(record.target).toBe(away.bases[1].id);
      }
      if (choice === "mine") {
        expect(record.goal).toBe("field");
        expect(away.oreIn(pilot.ship)).toBeGreaterThanOrEqual(2);
      }
      if (choice === "wait") expect(record.goal).toBe("dock");
    }, 60000);
  }

  it("takes its load to the deposit it chose", () => {
    const away = world({ depositFree: true, depositReach: 150, depositCapacity: 300 });
    away.step();
    const pilot = turnedAway(away, 4);
    fixRoll(away, pilot, "deposit");
    run(away, away.tuning.turnAwaySeconds + 1, () => parkAway(away));
    expect(pilot.lastTurnAway).toBe("deposit");
    expect(pilot.record?.goal).toBe("trade");
    const deposit = pilot.sellDeposit!;
    run(away, 900, () => {
      parkAway(away);
      return away.oreIn(pilot.ship) === 0;
    });
    expect(away.oreCount(deposit.ore)).toBe(4);
  }, 60000);
});

describe("the radio when turned away", () => {
  /** Runs a few seconds past the hold, and returns the lines heard that carry a link. */
  function linked(sim: Sim, each?: () => void) {
    const lines: { text: string; link?: unknown }[] = [];
    for (let i = 0; i < Math.round((sim.tuning.turnAwaySeconds + 1) / TICK); i++) {
      each?.();
      sim.step();
      for (const event of sim.events) if (event.type === "chatter" && event.link && sim.hears(event)) lines.push(event);
      sim.events.length = 0;
    }
    return lines;
  }

  it("says where it's going, with a link that points the destination there", () => {
    const sim = world({ chatter: true });
    const pilot = turnedAway(sim, 4);
    dockAt(sim, sim.ship, sim.bases[0].body);
    fixRoll(sim, pilot, "station");
    const lines = linked(sim);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain("Outpost");
    expect(lines[0].link).toEqual({ poi: sim.bases[1].body });
    sim.toggleDestination({ poi: sim.bases[1].body });
    expect(sim.ship.destination?.poi).toBe(sim.bases[1].body);
  });

  it("says nothing as a record out of view", () => {
    const sim = world({ chatter: true });
    const pilot = turnedAway(sim, 4);
    fixRoll(sim, pilot, "station");
    expect(linked(sim, () => parkAway(sim))).toHaveLength(0);
    expect(pilot.lastTurnAway).toBe("station");
  });
});
