import { describe, expect, it } from "vitest";
import { refresh, type MountId } from "./fitting";
import { homeSim } from "./home";
import type { PartId } from "./parts";
import { type Rock, type Ship, Sim, TICK } from "./sim";
import { DEFAULTS as GAME_DEFAULTS, type Tuning } from "./tuning";

/** A quiet world: no traffic, no rocks of its own, nothing drifting in. */
const QUIET = {
  ...GAME_DEFAULTS,
  floaterStart: false,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  rockCount: 0,
  rockInflow: 0,
  rockDrift: 0,
  fieldOrbitRadius: 0,
  fieldOrbitPeriod: 0,
  fieldRotationPeriod: 0,
  stationRotationPeriod: 0,
  chatter: false,
};

/** The player's ship still at the middle of nowhere, nose along +x, with Targeting loaded. */
function quietSim(extra: Partial<Tuning> = {}): Sim {
  const sim = homeSim(1, { ...QUIET, ...extra });
  sim.rocks.length = 0;
  Object.assign(sim.ship, { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, angle: 0, prevAngle: 0, spin: 0 });
  sim.devSet(sim.ship, "targeting", true);
  expect(sim.isDocked()).toBe(false);
  return sim;
}

/** Puts the ship on the pirate hull, whose guns all face the nose: `gun` in the middle, `gunLeft` off to the left. */
function armed(sim: Sim, guns: Partial<Record<MountId, PartId>>): void {
  const { ship } = sim;
  ship.model = "pirate";
  ship.fit = {};
  for (const [mount, part] of Object.entries(guns)) ship.fit[mount] = { part: part!, wear: 0 };
  refresh(ship);
}

/** A big, still rock at a spot relative to the ship, too tough to break in a test. */
function rockAt(sim: Sim, dx: number, dy: number, tier = 1, vx = 0, vy = 0): Rock {
  const rock = sim.makeRock(tier, sim.ship.x + dx, sim.ship.y + dy, vx, vy);
  rock.hp = 100000;
  rock.spin = 0;
  sim.rocks.push(rock);
  return rock;
}

/** Steps the sim and returns each shot the ship fired: the tick, and where it started across the nose. */
function shotsOver(sim: Sim, seconds: number, from: Ship = sim.ship): { tick: number; across: number; vx: number; vy: number; precise: boolean }[] {
  const seen = new Set(sim.shots);
  const out: { tick: number; across: number; vx: number; vy: number; precise: boolean }[] = [];
  for (let tick = 0; tick < Math.round(seconds / TICK); tick++) {
    sim.step();
    for (const shot of sim.shots) {
      if (seen.has(shot)) continue;
      seen.add(shot);
      if (shot.from !== from) continue;
      const across = Math.round(-(shot.x - from.x) * Math.sin(from.angle) + (shot.y - from.y) * Math.cos(from.angle));
      out.push({ tick, across, vx: Math.round(shot.vx), vy: Math.round(shot.vy), precise: shot.precise });
    }
  }
  return out;
}

/** The middle gun's shots start on the nose line; the left gun's 11 to its left. */
const MIDDLE = 0;
const LEFT = -11;

describe("auto-mine", () => {
  it("fires a gun lined up on a picked rock, with Space not held", () => {
    const sim = quietSim();
    armed(sim, { gun: "gun1" });
    sim.devSet(sim.ship, "autoMine", true);
    sim.selectTarget(sim.ship, rockAt(sim, 300, 0));
    expect(sim.controls.fire).toBe(false);
    const shots = shotsOver(sim, 1);
    // Seven a second, the gun's own rate.
    expect(shots.length).toBeGreaterThanOrEqual(7);
    expect(shots.length).toBeLessThanOrEqual(8);
  });

  it("doesn't fire without Targeting loaded, or with nothing picked", () => {
    const sim = quietSim();
    armed(sim, { gun: "gun1" });
    sim.devSet(sim.ship, "autoMine", true);
    rockAt(sim, 300, 0);
    expect(shotsOver(sim, 0.5)).toHaveLength(0);
    sim.selectTarget(sim.ship, sim.rocks[0]);
    sim.devSet(sim.ship, "targeting", false);
    expect(shotsOver(sim, 0.5)).toHaveLength(0);
  });

  it("doesn't fire at a picked ship, or through a ship that sits on the line before the rock", () => {
    const sim = quietSim({ trafficRacers: 1 });
    armed(sim, { gun: "gun1" });
    sim.devSet(sim.ship, "autoMine", true);
    const other = sim.traffic[0].ship;
    const park = () => Object.assign(other, { x: sim.ship.x + 150, y: sim.ship.y, px: sim.ship.x + 150, py: sim.ship.y, vx: 0, vy: 0 });
    park();
    sim.selectTarget(sim.ship, other);
    expect(sim.ship.targets).toEqual([other]);
    expect(shotsOver(sim, 0.1)).toHaveLength(0);
    // A rock behind it, picked as well: the trader in front holds the gun.
    const rock = rockAt(sim, 400, 0);
    park();
    sim.selectTarget(sim.ship, rock);
    expect(shotsOver(sim, 0.1)).toHaveLength(0);
    // Out of the way, and the rock is fair game.
    Object.assign(other, { y: sim.ship.y + 500, py: sim.ship.y + 500 });
    expect(shotsOver(sim, 0.1).length).toBeGreaterThan(0);
  });

  it("stops when the computer goes down, and Space still fires", () => {
    const sim = quietSim();
    armed(sim, { gun: "gun1", computer: "basicComputer" });
    sim.devSet(sim.ship, "autoMine", true);
    sim.selectTarget(sim.ship, rockAt(sim, 300, 0));
    expect(shotsOver(sim, 0.2).length).toBeGreaterThan(0);
    // Damage refreshes what the ship can use: a broken computer runs no programs.
    for (const module of Object.values(sim.ship.fit)) if (module && module.part.endsWith("Computer")) module.wear = 0.9;
    refresh(sim.ship);
    expect(sim.ship.parts.has("autoMine")).toBe(false);
    expect(shotsOver(sim, 0.3)).toHaveLength(0);
    sim.controls.fire = true;
    expect(shotsOver(sim, 0.3).length).toBeGreaterThan(0);
  });

  it("holds a gun whose Fires is set Off, and only that gun", () => {
    const sim = quietSim();
    armed(sim, { gun: "gun1", gunLeft: "gun1" });
    sim.devSet(sim.ship, "autoMine", true);
    sim.selectTarget(sim.ship, rockAt(sim, 300, 0));
    expect(sim.setTweak(sim.ship, "autoMine", "fires", "off", "gun")).toBe(true);
    const shots = shotsOver(sim, 0.5);
    expect(shots.length).toBeGreaterThan(0);
    expect(new Set(shots.map((shot) => shot.across))).toEqual(new Set([LEFT]));
  });

  it("under Primary only, doesn't fire at a picked rock that isn't the main target", () => {
    const sim = quietSim();
    armed(sim, { gun: "gun1" });
    sim.devSet(sim.ship, "autoMine", true);
    const aside = rockAt(sim, 0, 400);
    const ahead = rockAt(sim, 300, 0);
    sim.selectTarget(sim.ship, aside);
    sim.toggleTarget(sim.ship, ahead);
    sim.setTweak(sim.ship, "autoMine", "shootsAt", "primary");
    expect(shotsOver(sim, 0.3)).toHaveLength(0);
    sim.setTweak(sim.ship, "autoMine", "shootsAt", "any");
    expect(shotsOver(sim, 0.3).length).toBeGreaterThan(0);
  });

  it("fires each gun on its own: only the lined-up one, each on its own rate", () => {
    const sim = quietSim();
    armed(sim, { gun: "gun1", gunLeft: "gun2" });
    sim.devSet(sim.ship, "autoMine", true);
    // A small rock off to the left: on the left gun's line, clear of the middle one's.
    sim.selectTarget(sim.ship, rockAt(sim, 300, -25, 0));
    const offLine = shotsOver(sim, 1);
    expect(offLine.length).toBeGreaterThan(0);
    expect(offLine.every((shot) => shot.across === LEFT && shot.precise)).toBe(true);
    // A big rock dead ahead: both fire, the plain gun seven a second and the precise one two.
    sim.rocks.length = 0;
    sim.selectTarget(sim.ship, rockAt(sim, 300, 0));
    const both = shotsOver(sim, 2);
    const plain = both.filter((shot) => shot.across === MIDDLE).length;
    const precise = both.filter((shot) => shot.across === LEFT).length;
    expect(plain).toBeGreaterThanOrEqual(13);
    expect(precise).toBeGreaterThanOrEqual(3);
    expect(precise).toBeLessThanOrEqual(5);
  });

  it("with Space held, every gun fires together on the slowest, exactly as before auto-mine", () => {
    // Taken from the game before this change: tick, shot velocity, precise, life in ms.
    const before = [
      [0, 1061, 320, 0, 1100],
      [0, 1061, 320, 1, 1100],
      [60, 1061, 320, 0, 1100],
      [60, 1061, 320, 1, 1100],
      [120, 1061, 320, 0, 1100],
      [120, 1061, 320, 1, 1100],
      [180, 1061, 320, 0, 1100],
      [180, 1061, 320, 1, 1100],
    ];
    for (const withProgram of [false, true]) {
      const sim = homeSim(1, { ...QUIET });
      sim.rocks.length = 0;
      armed(sim, { gun: "gun1", gunLeft: "gun2" });
      if (withProgram) {
        sim.devSet(sim.ship, "targeting", true);
        sim.devSet(sim.ship, "autoMine", true);
      }
      Object.assign(sim.ship, { x: 0, y: 0, px: 0, py: 0, vx: 10, vy: -5, angle: 0.3, spin: 0 });
      sim.controls.fire = true;
      const seen = new Set<object>();
      const out: number[][] = [];
      for (let tick = 0; tick < 240; tick++) {
        sim.step();
        for (const shot of sim.shots) {
          if (seen.has(shot)) continue;
          seen.add(shot);
          out.push([tick, Math.round(shot.vx), Math.round(shot.vy), shot.precise ? 1 : 0, Math.round(shot.life * 1000)]);
        }
      }
      expect(out).toEqual(before);
    }
  });
});

describe("auto-mine II", () => {
  it("holds fire at a rock crossing the line fast, which plain auto-mine fires at; both fire at a slow one", () => {
    const fires = (program: "autoMine" | "autoMine2", vy: number) => {
      const sim = quietSim();
      armed(sim, { gun: "gun1" });
      sim.devSet(sim.ship, program, true);
      sim.selectTarget(sim.ship, rockAt(sim, 600, 0, 1, 0, vy));
      return shotsOver(sim, 1 / 30).length;
    };
    expect(fires("autoMine", 800)).toBeGreaterThan(0);
    expect(fires("autoMine2", 800)).toBe(0);
    expect(fires("autoMine", 5)).toBeGreaterThan(0);
    expect(fires("autoMine2", 5)).toBeGreaterThan(0);
  });
});

describe("turret tracking", () => {
  /** The floater with its turret, still, nose along +x. */
  function turretSim(): Sim {
    const sim = quietSim({ floaterStart: true });
    sim.devSet(sim.ship, "turret", true);
    sim.devSet(sim.ship, "targeting", true);
    expect(sim.ship.parts.has("turret")).toBe(true);
    // The mouse, off along the nose.
    sim.ship.aim = { x: sim.ship.x + 300, y: sim.ship.y };
    return sim;
  }

  it("turns the turret to the picked rock, and back to the aim when nothing is picked", () => {
    const sim = turretSim();
    sim.devSet(sim.ship, "turretTracking", true);
    sim.selectTarget(sim.ship, rockAt(sim, 0, 300));
    shotsOver(sim, 1.5);
    expect(sim.ship.turretAngle).toBeCloseTo(Math.PI / 2 - sim.ship.angle, 1);
    sim.selectTarget(sim.ship, null);
    shotsOver(sim, 1.5);
    expect(Math.abs(Math.atan2(Math.sin(sim.ship.turretAngle + sim.ship.angle), Math.cos(sim.ship.turretAngle + sim.ship.angle)))).toBeLessThan(0.1);
  });

  it("without the program, the turret follows the aim, whatever is picked", () => {
    const sim = turretSim();
    sim.selectTarget(sim.ship, rockAt(sim, 0, 300));
    shotsOver(sim, 1.5);
    expect(Math.abs(sim.ship.turretAngle + sim.ship.angle)).toBeLessThan(0.1);
  });

  it("with auto-mine, the turret works through the picked rocks with no hand on the trigger", () => {
    const sim = turretSim();
    sim.devSet(sim.ship, "turretTracking", true);
    sim.devSet(sim.ship, "autoMine", true);
    sim.selectTarget(sim.ship, rockAt(sim, 0, 200));
    expect(shotsOver(sim, 2).length).toBeGreaterThan(0);
    expect(sim.controls.fire).toBe(false);
  });
});

describe("face target", () => {
  function faceSim(): { sim: Sim; rock: Rock } {
    const sim = quietSim();
    sim.devSet(sim.ship, "faceTarget", true);
    const rock = rockAt(sim, 0, 300);
    sim.selectTarget(sim.ship, rock);
    return { sim, rock };
  }

  it("turns the nose to the main rock when nothing else steers, and only turns", () => {
    const { sim } = faceSim();
    shotsOver(sim, 6);
    expect(Math.abs(Math.atan2(Math.sin(sim.ship.angle - Math.PI / 2), Math.cos(sim.ship.angle - Math.PI / 2)))).toBeLessThan(0.1);
    // It never thrusts: the ship hasn't gone anywhere.
    expect(Math.hypot(sim.ship.vx, sim.ship.vy)).toBeLessThan(1);
    // And the pilot's own controls are left as they were.
    expect(sim.controls.turn).toBe(0);
  });

  it("does nothing while a turn key is held", () => {
    const { sim } = faceSim();
    sim.controls.turn = -1;
    shotsOver(sim, 0.5);
    expect(sim.ship.angle).toBeLessThan(0);
  });

  it("does nothing while a click order runs: the ship flies exactly as it would without it", () => {
    const flown = (face: boolean) => {
      const { sim } = faceSim();
      // Click-to-move first, so both ships carry the same computer and fly alike.
      sim.devSet(sim.ship, "clickMove", true);
      if (!face) sim.devSet(sim.ship, "faceTarget", false);
      expect(sim.orderMove(sim.ship.x - 2000, sim.ship.y)).toBe(true);
      shotsOver(sim, 1);
      expect(sim.clickPilot.active).toBe(true);
      return [sim.ship.angle, sim.ship.x, sim.ship.y];
    };
    expect(flown(true)).toEqual(flown(false));
  });

  it("does nothing when the main target is a ship", () => {
    const sim = quietSim({ trafficRacers: 1 });
    sim.devSet(sim.ship, "faceTarget", true);
    const other = sim.traffic[0].ship;
    Object.assign(other, { x: sim.ship.x, y: sim.ship.y + 300, px: sim.ship.x, py: sim.ship.y + 300, vx: 0, vy: 0 });
    sim.selectTarget(sim.ship, other);
    shotsOver(sim, 0.5);
    expect(Math.abs(sim.ship.angle)).toBeLessThan(0.01);
  });
});
