import { describe, expect, it } from "vitest";
import { PARTS } from "./parts";
import { DEFAULTS as GAME_DEFAULTS } from "./tuning";
import { bodyAt, DOCK_OFFSET, type FieldSpec, MAX_HULL, type Poi, pullAt, SHIP_RADIUS, Sim, type SolidBody, STATION_HALF, TICK } from "./sim";

/** The same carrying ranges for every POI. */
function carrying(full: number, none: number) {
  return {
    fieldCarryFull: full,
    fieldCarryNone: none,
    stationCarryFull: full,
    stationCarryNone: none,
    pirateCarryFull: full,
    pirateCarryNone: none,
  };
}

/** Every part, weighing nothing, so tests of the thrusters themselves see plain numbers. */
/** The flight tests below are about the quick ship. The new ship has its own tests. */
const DEFAULTS = {
  ...GAME_DEFAULTS,
  floaterStart: false,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  stationStartParts: 100000,
  stationReserveParts: Infinity,
  stationUnlocks: false,
};

function fitAll(sim: Sim): Sim {
  sim.tuning.partWeightScale = 0;
  // Gun 2 replaces the gun rather than adding to it, so the shooting tests keep the first one.
  for (const part of PARTS) {
    if (part.id !== "gun2" && part.id !== "tractor") sim.ship.parts.add(part.id);
  }
  return sim;
}

/** No rocks, and the field stays put, so tests can reason in plain coordinates. */
function emptySim(): Sim {
  const sim = new Sim(1, {
    ...DEFAULTS,
    rockCount: 0,
    testDrones: 0,
    repairCost: 0,
    rebuildCost: 0,
    fieldOrbitRadius: 0,
    fieldRotationPeriod: 0,
    stationRotationPeriod: 0,
  });
  sim.ship.x = 0;
  sim.ship.y = 0;
  return fitAll(sim);
}

function run(sim: Sim, seconds: number): void {
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i++) sim.step();
}

describe("flight", () => {
  it("keeps speed after thrust stops, with no cap", () => {
    const sim = emptySim();
    sim.controls.thrust = 1;
    run(sim, 10);
    const speed = sim.ship.vx;
    expect(speed).toBeCloseTo(DEFAULTS.thrust * 10, 0);
    sim.controls.thrust = 0;
    run(sim, 2);
    expect(sim.ship.vx).toBeCloseTo(speed, 5);
  });
});

describe("thrusters", () => {
  const degrees = (radians: number) => (radians * 180) / Math.PI;

  it("rotation accelerates and keeps spinning after input stops", () => {
    const sim = emptySim();
    sim.ship.parts.delete("spinStabilizer");
    sim.controls.turn = 1;
    run(sim, 1);
    expect(degrees(sim.ship.spin)).toBeCloseTo(DEFAULTS.rotationThrust, 3);
    sim.controls.turn = 0;
    const spin = sim.ship.spin;
    run(sim, 1);
    expect(sim.ship.spin).toBe(spin);
  });

  it("strafes sideways without turning", () => {
    const sim = emptySim();
    sim.controls.strafe = 1;
    run(sim, 1);
    expect(sim.ship.vy).toBeCloseTo(DEFAULTS.sideThrust, 3);
    expect(sim.ship.vx).toBeCloseTo(0, 5);
    expect(sim.ship.angle).toBe(0);
  });

  it("weight divides every thruster's effect", () => {
    const sim = emptySim();
    sim.tuning.weight = 2;
    sim.controls.thrust = 1;
    sim.controls.strafe = 1;
    run(sim, 0.5);
    expect(sim.ship.vx).toBeCloseTo(DEFAULTS.thrust / 4, 3);
    expect(sim.ship.vy).toBeCloseTo(DEFAULTS.sideThrust / 4, 3);

    const spinning = emptySim();
    spinning.tuning.weight = 2;
    spinning.controls.turn = 1;
    run(spinning, 0.5);
    expect(degrees(spinning.ship.spin)).toBeCloseTo(DEFAULTS.rotationThrust / 4, 3);
  });

  it("does nothing when a commanded thruster is disabled", () => {
    const sim = emptySim();
    sim.tuning.thrusterMain = false;
    sim.controls.thrust = 1;
    run(sim, 1);
    expect(sim.ship.vx).toBe(0);
    expect(sim.ship.firing.size).toBe(0);
  });

  it("retro stops rotation and translation", () => {
    const sim = emptySim();
    sim.tuning.retro = true;
    sim.ship.vx = 150;
    sim.ship.vy = -80;
    sim.ship.spin = 2;
    run(sim, 5);
    expect(sim.ship.vx).toBeCloseTo(0, 5);
    expect(sim.ship.vy).toBeCloseTo(0, 5);
    expect(sim.ship.spin).toBe(0);
    expect(sim.ship.firing.size).toBe(0);
  });

  it("retro leaves an axis alone while the pilot commands it", () => {
    const sim = emptySim();
    sim.tuning.retro = true;
    sim.controls.thrust = 1;
    run(sim, 1);
    expect(sim.ship.vx).toBeCloseTo(DEFAULTS.thrust, 3);
  });

  it("retro can't stop motion that needs a disabled thruster", () => {
    const sim = emptySim();
    sim.tuning.retro = true;
    sim.tuning.thrusterReverse = false;
    sim.ship.vx = 100;
    run(sim, 2);
    expect(sim.ship.vx).toBe(100);
  });
});

describe("turret mount", () => {
  function turretSim() {
    const sim = emptySim();
    sim.ship.parts.add("turret");
    sim.ship.angle = 0;
    sim.ship.aim = { x: sim.ship.x, y: sim.ship.y + 1000 };
    return sim;
  }

  it("turns toward the aim at its own speed, relative to the ship", () => {
    const sim = turretSim();
    sim.tuning.turretTurnSpeed = 90;
    run(sim, 0.5);
    expect(sim.ship.turretAngle).toBeCloseTo(Math.PI / 4, 1);
    run(sim, 1);
    expect(sim.ship.turretAngle).toBeCloseTo(Math.PI / 2, 2);
  });

  it("fires where it points, with a third of the gun's range", () => {
    const sim = turretSim();
    run(sim, 2);
    sim.controls.fire = true;
    sim.step();
    const shot = sim.shots[0];
    expect(Math.atan2(shot.vy - sim.ship.vy, shot.vx - sim.ship.vx)).toBeCloseTo(Math.PI / 2, 2);
    expect(shot.life).toBeCloseTo(sim.tuning.shotLife * sim.tuning.turretRange, 2);
  });

  it("without a turret the gun fires from the nose at full range", () => {
    const sim = emptySim();
    sim.ship.parts.delete("turret");
    sim.ship.angle = 0;
    sim.ship.aim = { x: sim.ship.x, y: sim.ship.y + 1000 };
    sim.controls.fire = true;
    sim.step();
    const shot = sim.shots[0];
    expect(Math.atan2(shot.vy - sim.ship.vy, shot.vx - sim.ship.vx)).toBeCloseTo(sim.ship.angle, 1);
    expect(shot.life).toBeCloseTo(sim.tuning.shotLife, 2);
  });
});

describe("impacts", () => {
  it("does not let a very fast ship pass through a rock", () => {
    const sim = emptySim();
    sim.tuning.damagePerSpeed = 0; // Otherwise this impact wrecks and respawns the ship.
    sim.rocks.push(sim.makeRock(2, 200, 0, 0, 0));
    sim.ship.vx = 50000;
    sim.step();
    expect(sim.ship.x).toBeLessThan(200);
    expect(sim.ship.vx).toBeLessThan(0);
  });

  it("dents the hull only above the safe impact speed", () => {
    const sim = emptySim();
    sim.rocks.push(sim.makeRock(2, 100, 0, 0, 0));
    sim.ship.vx = DEFAULTS.safeImpactSpeed / 2;
    run(sim, 1);
    expect(sim.ship.hull).toBe(MAX_HULL);

    const fast = emptySim();
    fast.rocks.push(fast.makeRock(2, 100, 0, 0, 0));
    fast.ship.vx = 300;
    run(fast, 0.5);
    expect(fast.ship.hull).toBeLessThan(MAX_HULL);
    expect(fast.ship.hull).toBeGreaterThan(0);
  });

  it("wrecks the ship and loses cargo at zero hull", () => {
    const sim = emptySim();
    sim.ship.ore = 5;
    sim.ship.hull = 1;
    sim.rocks.push(sim.makeRock(2, 100, 0, 0, 0));
    sim.ship.vx = 1000;
    run(sim, 0.2);
    expect(sim.ship.wrecks).toBe(1);
    expect(sim.ship.ore).toBe(0);
    expect(sim.ship.hull).toBe(MAX_HULL);
  });
});

describe("station", () => {
  /** Puts the ship at rest relative to the station, in the middle of the dock. */
  function dockedSim(): Sim {
    const sim = emptySim();
    sim.ship.x = sim.station.x + DOCK_OFFSET;
    sim.ship.y = sim.station.y;
    return sim;
  }

  it("orbits the field on a fixed circle", () => {
    const sim = emptySim();
    sim.tuning.orbitPeriod = 60;
    const start = Math.atan2(sim.station.y, sim.station.x);
    const radius = sim.station.orbitRadius;
    run(sim, 15);
    expect(Math.hypot(sim.station.x, sim.station.y)).toBeCloseTo(radius, 5);
    const moved = Math.abs(Math.atan2(sim.station.y, sim.station.x) - start) % (Math.PI * 2);
    expect(Math.min(moved, Math.PI * 2 - moved)).toBeCloseTo(Math.PI / 2, 2);
  });

  describe("new games laid out by the designer", () => {
    const base = { ...DEFAULTS, rockCount: 0, testDrones: 0, pirates: 1 };

    it("start the ship at a spawn for its model, picked at random from several", () => {
      const sim = new Sim(1, { ...base, floaterStart: true });
      sim.spawns = [
        { ship: "racer", orbits: [{ radius: 1000, period: 0, phase: 0, sign: 1 }] },
        { ship: "floater", orbits: [{ radius: 40000, period: 0, phase: 0, sign: 1 }] },
        { ship: "floater", orbits: [{ radius: 40000, period: 0, phase: Math.PI, sign: 1 }] },
      ];
      const seen = new Set<number>();
      for (let seed = 2; seed < 30; seed++) {
        sim.reset(seed);
        expect(Math.hypot(sim.ship.x, sim.ship.y)).toBeCloseTo(40000, 6);
        seen.add(Math.sign(sim.ship.x));
      }
      expect(seen.size).toBe(2);
    });

    it("start by the field when no spawn is for this ship", () => {
      const sim = new Sim(1, { ...base, floaterStart: false });
      sim.spawns = [{ ship: "floater", orbits: [{ radius: 40000, period: 0, phase: 0, sign: 1 }] }];
      sim.reset(2);
      expect(Math.hypot(sim.ship.x - sim.field.x, sim.ship.y - sim.field.y)).toBeLessThan(DEFAULTS.fieldRadius + 500);
    });

    it("put the places at the designer's angles for the clock now", () => {
      const sim = new Sim(1, { ...base, fieldOrbitPeriod: 600 });
      run(sim, 100);
      sim.startPhases = { field: 1, station: 2 };
      sim.reset(2);
      expect(sim.field.orbitAngle).toBeCloseTo(1 + ((2 * Math.PI) / 600) * sim.now, 9);
      expect(sim.station.orbitAngle).toBeCloseTo(2 + ((2 * Math.PI) / DEFAULTS.orbitPeriod) * sim.now, 9);
    });

    it("let each place carry to its own range", () => {
      const sim = new Sim(1, { ...base, fieldCarryFull: Infinity, fieldCarryNone: Infinity, stationCarryFull: 0, stationCarryNone: 0 });
      expect(sim.carryRange(sim.station)).toEqual({ full: 0, none: 0 });
      expect(sim.carryRange(sim.field)).toEqual({ full: Infinity, none: Infinity });
    });
  });

  describe("a second field from the designer", () => {
    const second = (extra: Partial<FieldSpec> = {}): FieldSpec => ({
      id: "second:0",
      name: "Second",
      radius: 3000,
      rocks: 100,
      rockDrift: 0,
      rockInflow: 0,
      carryFull: Infinity,
      carryNone: Infinity,
      rotationPeriod: 0,
      orbits: [{ radius: 90000, period: 7200, phase: Math.PI, sign: 1 }],
      ...extra,
    });
    const inSecond = (sim: Sim) => {
      const { poi } = sim.extraFields[0];
      return sim.rocks.filter((rock) => Math.hypot(rock.x - poi.x, rock.y - poi.y) < 3000 + 500);
    };
    function withSecond(extra: Partial<FieldSpec> = {}): Sim {
      const sim = new Sim(1, { ...DEFAULTS, rockCount: 50, testDrones: 0, fieldOrbitRadius: 60000, fieldOrbitPeriod: 10800 });
      sim.applyLayout({}, [second(extra)]);
      return sim;
    }

    it("gets its own rocks when it appears, and leaves the first field's alone", () => {
      const sim = withSecond();
      expect(inSecond(sim).length).toBe(100);
      expect(sim.rocks.length).toBe(150);
    });

    it("goes round its own orbit, and its rocks stay with it", () => {
      const sim = withSecond();
      run(sim, 120);
      const { poi } = sim.extraFields[0];
      const angle = Math.PI + ((2 * Math.PI) / 7200) * sim.now;
      expect(poi.x).toBeCloseTo(Math.cos(angle) * 90000, 3);
      expect(inSecond(sim).length).toBe(100);
    });

    it("is part of a new game too", () => {
      const sim = withSecond();
      sim.reset(5);
      expect(inSecond(sim).length).toBe(100);
    });

    it("refills from its own inflow, not the first field's", () => {
      const sim = withSecond({ rocks: 100, rockInflow: 60 });
      const { poi } = sim.extraFields[0];
      sim.rocks = sim.rocks.filter((rock) => Math.hypot(rock.x - poi.x, rock.y - poi.y) > 10000);
      run(sim, 30);
      // Drifting in from outside it: count everything round it, well clear of the first field.
      expect(sim.rocks.filter((rock) => Math.hypot(rock.x - poi.x, rock.y - poi.y) < 20000).length).toBeGreaterThan(5);
      const first = sim.rocks.filter((rock) => Math.hypot(rock.x - sim.field.x, rock.y - sim.field.y) < 20000);
      expect(first.length).toBe(50);
    });

    it("takes its rocks with it when it's taken away", () => {
      const sim = withSecond();
      sim.applyLayout({}, []);
      expect(sim.extraFields.length).toBe(0);
      expect(sim.rocks.length).toBe(50);
    });

    it("carries to its own range", () => {
      const sim = withSecond({ carryFull: 0, carryNone: 1000 });
      expect(sim.carryRange(sim.extraFields[0].poi)).toEqual({ full: 0, none: 1000 });
    });

    it("moves its rocks along when its orbit changes, without touching the first field's", () => {
      const sim = withSecond();
      const firstRock = sim.rocks[0];
      const firstAt = { x: firstRock.x, y: firstRock.y };
      const rock = inSecond(sim)[0];
      const offset = { x: rock.x - sim.extraFields[0].poi.x, y: rock.y - sim.extraFields[0].poi.y };
      sim.applyLayout({}, [second({ orbits: [{ radius: 120000, period: 7200, phase: 2, sign: 1 }] })]);
      const { poi } = sim.extraFields[0];
      expect(rock.x - poi.x).toBeCloseTo(offset.x, 6);
      expect(rock.y - poi.y).toBeCloseTo(offset.y, 6);
      expect(firstRock.x).toBeCloseTo(firstAt.x, 6);
      expect(inSecond(sim).length).toBe(100);
    });
  });

  describe("bodies from the designer", () => {
    function planet(extra: Partial<SolidBody> = {}): SolidBody {
      return { name: "Planet", kind: "planet", radius: 12000, surface: "death", pullStart: 0, pullFull: 0, pullAccel: 0, atmosphere: 0, burnSpeed: 0, spinPeriod: 0, orbits: [], ...extra };
    }
    /** A still field far away, so nothing carries the ship near the body. */
    function near(body: SolidBody, x: number, vx = 0): Sim {
      const sim = new Sim(1, { ...DEFAULTS, rockCount: 0, testDrones: 0, fieldOrbitRadius: 200000, fieldOrbitPeriod: 0, fieldRotationPeriod: 0, orbitPeriod: 0, stationRotationPeriod: 0 });
      sim.bodies = [body];
      Object.assign(sim.ship, { x, y: 0, px: x, py: 0, vx, vy: 0 });
      return sim;
    }

    it("wrecks a ship that flies into deadly ground, and rebuilds it away from there", () => {
      const sim = near(planet(), 11990);
      const wrecks = sim.ship.wrecks;
      run(sim, TICK);
      expect(sim.ship.wrecks).toBe(wrecks + 1);
      expect(Math.hypot(sim.ship.x, sim.ship.y)).toBeGreaterThan(12000);
    });

    it("leaves a ship just above the ground alone", () => {
      const sim = near(planet(), 12000 + SHIP_RADIUS + 100);
      run(sim, TICK);
      expect(sim.ship.wrecks).toBe(0);
    });

    it("isn't there unless the designer says so", () => {
      const sim = near(planet(), 10);
      sim.bodies = [];
      run(sim, TICK);
      expect(sim.ship.wrecks).toBe(0);
    });

    it("lets a ship straight through ground that isn't solid", () => {
      const sim = near(planet({ surface: "none" }), 11000);
      run(sim, 1);
      expect(sim.ship.wrecks).toBe(0);
      expect(sim.ship.hull).toBe(MAX_HULL);
    });

    it("knocks a ship back off hard ground, hurting it by speed like a rock", () => {
      const slow = near(planet({ surface: "damage" }), 12000 + SHIP_RADIUS + 5, -60);
      run(slow, 0.5);
      expect(slow.ship.hull).toBe(MAX_HULL);
      expect(slow.ship.vx).toBeGreaterThan(0);
      const fast = near(planet({ surface: "damage" }), 12000 + SHIP_RADIUS + 5, -400);
      run(fast, 0.5);
      expect(fast.ship.hull).toBeLessThan(MAX_HULL);
      expect(fast.ship.vx).toBeGreaterThan(0);
      expect(Math.hypot(fast.ship.x, fast.ship.y)).toBeGreaterThanOrEqual(12000 + SHIP_RADIUS);
    });

    it("hurts a still ship that a moving body runs into", () => {
      // A body on a big orbit, moving at about 600 units/s through the ship's spot.
      const radius = 100000;
      const period = (2 * Math.PI * radius) / 600;
      const moon = planet({ radius: 1000, surface: "damage", orbits: [{ radius, period, phase: -0.0125, sign: 1 }] });
      const sim = near(moon, radius);
      sim.ship.y = 0;
      run(sim, 2);
      expect(sim.ship.hull).toBeLessThan(MAX_HULL);
    });

    it("pulls evenly harder from where it starts to where it's full, then holds", () => {
      const body = planet({ pullStart: 30000, pullFull: 15000, pullAccel: 150 });
      expect(pullAt(body, 31000)).toBe(0);
      expect(pullAt(body, 22500)).toBeCloseTo(75, 9);
      expect(pullAt(body, 15000)).toBeCloseTo(150, 9);
      expect(pullAt(body, 13000)).toBe(150);
      const sim = near(body, 22500);
      run(sim, 1);
      expect(sim.ship.vx).toBeLessThan(-70);
      expect(sim.ship.vx).toBeGreaterThan(-90);
    });

    it("pulls loose ore too, and ore that lands is gone", () => {
      const sim = near(planet({ pullStart: 30000, pullFull: 15000, pullAccel: 150 }), 50000);
      sim.ores.push({ x: 13000, y: 0, px: 13000, py: 0, vx: 0, vy: 0, kind: 0, amount: 1 });
      sim.tuning.oreForgetDistance = Infinity;
      run(sim, 0.5);
      expect(sim.ores[0].vx).toBeLessThan(-50);
      run(sim, 20);
      expect(sim.ores.length).toBe(0);
    });

    it("burns a ship going too fast in the air, and only there", () => {
      const air = { surface: "none" as const, atmosphere: 14000, burnSpeed: 300 };
      const fast = near(planet(air), 13000, 0);
      fast.ship.vy = 700;
      run(fast, 1);
      expect(fast.ship.hull).toBeLessThan(MAX_HULL - 5);
      expect(fast.ship.burning).toBeGreaterThan(0.9);
      const slow = near(planet(air), 13000, 0);
      slow.ship.vy = 200;
      run(slow, 1);
      expect(slow.ship.hull).toBe(MAX_HULL);
      expect(slow.ship.burning).toBe(0);
      const above = near(planet(air), 15000, 0);
      above.ship.vy = 700;
      run(above, 1);
      expect(above.ship.hull).toBe(MAX_HULL);
    });

    it("places a body by its chain of orbits", () => {
      const body = planet({ orbits: [{ radius: 1000, period: 100, phase: 0, sign: 1 }, { radius: 400, period: 0, phase: Math.PI / 2, sign: -1 }] });
      const at = bodyAt(body, 25);
      expect(at.x).toBeCloseTo(0, 6);
      expect(at.y).toBeCloseTo(1000 - 400, 6);
      expect(at.vx).toBeCloseTo(-1000 * ((2 * Math.PI) / 100), 6);
    });
  });

  describe("a layout changed from outside the game", () => {
    function linkedSim(): Sim {
      return new Sim(1, { ...DEFAULTS, rockCount: 30, testDrones: 0, pirates: 1, fieldOrbitPeriod: 600, orbitPeriod: 300 });
    }

    it("brings the whole scene along when the field moves out", () => {
      const sim = linkedSim();
      run(sim, 5);
      const offset = { x: sim.ship.x - sim.field.x, y: sim.ship.y - sim.field.y };
      const rock = sim.rocks[0];
      const rockOffset = { x: rock.x - sim.field.x, y: rock.y - sim.field.y };
      sim.tuning.fieldOrbitRadius = 60000;
      sim.applyLayout();
      expect(Math.hypot(sim.field.x, sim.field.y)).toBeCloseTo(60000, 6);
      expect(sim.ship.x - sim.field.x).toBeCloseTo(offset.x, 6);
      expect(sim.ship.y - sim.field.y).toBeCloseTo(offset.y, 6);
      expect(rock.x - sim.field.x).toBeCloseTo(rockOffset.x, 6);
      expect(rock.y - sim.field.y).toBeCloseTo(rockOffset.y, 6);
    });

    it("carries on smoothly the tick after, with nothing thrown by the jump", () => {
      const sim = linkedSim();
      run(sim, 5);
      sim.tuning.fieldOrbitRadius = 60000;
      sim.applyLayout();
      const before = { x: sim.ship.x - sim.field.x, y: sim.ship.y - sim.field.y };
      run(sim, TICK);
      expect(Math.hypot(sim.ship.x - sim.field.x - before.x, sim.ship.y - sim.field.y - before.y)).toBeLessThan(5);
    });

    it("keeps a ship at the station with the station when only that moves", () => {
      const sim = linkedSim();
      run(sim, 1);
      sim.ship.x = sim.station.x + 100;
      sim.ship.y = sim.station.y;
      sim.tuning.stationDistance += 3000;
      sim.applyLayout();
      expect(sim.ship.x - sim.station.x).toBeCloseTo(100, 6);
      expect(sim.ship.y - sim.station.y).toBeCloseTo(0, 6);
    });

    it("goes exactly to a phase it's given, and stays on the formula", () => {
      const sim = linkedSim();
      run(sim, 20);
      sim.tuning.fieldOrbitPeriod = 1200;
      sim.applyLayout({ field: 1 });
      const angle = 1 + ((Math.PI * 2) / 1200) * sim.now;
      expect(sim.field.x).toBeCloseTo(Math.cos(angle) * sim.tuning.fieldOrbitRadius, 6);
      run(sim, 10);
      const at = sim.poiAt(sim.field, sim.now);
      expect(at.x).toBeCloseTo(sim.field.x, 6);
    });

    it("stays where it is on the orbit when given no phase", () => {
      const sim = linkedSim();
      run(sim, 20);
      const angle = sim.field.orbitAngle;
      sim.tuning.fieldOrbitPeriod = 1200;
      sim.applyLayout();
      expect(sim.field.orbitAngle).toBeCloseTo(angle, 9);
    });

    it("orbits the other way for a negative period, and the pirate base at its own pace", () => {
      const sim = new Sim(1, { ...DEFAULTS, rockCount: 0, testDrones: 0, pirates: 1, fieldOrbitPeriod: -600, orbitPeriod: 300, pirateOrbitPeriod: 600 });
      const field = sim.field.orbitAngle;
      const station = sim.station.orbitAngle;
      const base = sim.pirateBase!.orbitAngle;
      run(sim, 10);
      expect(sim.field.orbitAngle).toBeLessThan(field);
      expect(sim.station.orbitAngle - station).toBeCloseTo(2 * (sim.pirateBase!.orbitAngle - base), 6);
    });
  });

  describe("orbits worked out from time", () => {
    /** The field circling the system's centre, the station and pirate base circling the field. */
    function orbiting(): Sim {
      return new Sim(1, { ...DEFAULTS, rockCount: 0, testDrones: 0, pirates: 1, fieldOrbitPeriod: 600, orbitPeriod: 300 });
    }

    it("puts each POI where the formula says, hours in", () => {
      const sim = orbiting();
      run(sim, 3600);
      for (const poi of [sim.field, sim.station, sim.pirateBase!]) {
        const at = sim.poiAt(poi, sim.now);
        expect(at.x).toBeCloseTo(poi.x, 6);
        expect(at.y).toBeCloseTo(poi.y, 6);
      }
    }, 30000);

    it("tells where a POI will be, matching where it gets to", () => {
      const sim = orbiting();
      run(sim, 10);
      const ahead = sim.poiAt(sim.station, sim.now + 90);
      run(sim, 90);
      expect(sim.station.x).toBeCloseTo(ahead.x, 4);
      expect(sim.station.y).toBeCloseTo(ahead.y, 4);
    });

    it("changes pace smoothly when the period is tuned mid-orbit", () => {
      const sim = orbiting();
      run(sim, 100);
      const radius = sim.station.orbitRadius;
      sim.tuning.orbitPeriod = 120;
      let biggest = 0;
      for (let i = 0; i < 240; i++) {
        const { x, y } = sim.station;
        const fx = sim.field.x;
        const fy = sim.field.y;
        sim.step();
        // Only the station's own motion around the field.
        biggest = Math.max(biggest, Math.hypot(sim.station.x - sim.field.x - (x - fx), sim.station.y - sim.field.y - (y - fy)));
      }
      expect(biggest).toBeCloseTo(((2 * Math.PI * radius) / 120) * TICK, 3);
    });

    it("starts a restarted world's POIs where a new world's start", () => {
      const fresh = orbiting();
      const sim = orbiting();
      run(sim, 500);
      sim.reset(1);
      sim.step();
      fresh.step();
      expect(sim.station.x).toBeCloseTo(fresh.station.x, 6);
      expect(sim.station.y).toBeCloseTo(fresh.station.y, 6);
    });

    it("carries on smoothly from a save made before orbits had a phase", () => {
      const sim = orbiting();
      run(sim, 200);
      const { x, y } = sim.station;
      for (const poi of [sim.field, sim.station] as Partial<Poi>[]) {
        delete poi.orbitPhase;
        delete poi.orbitPeriod;
      }
      sim.step();
      const step = Math.hypot(sim.station.x - x, sim.station.y - y);
      expect(step).toBeLessThan(5);
      expect(sim.station.orbitPhase).toBeTypeOf("number");
    });
  });

  it("does not let a very fast ship pass through the solid box", () => {
    const sim = emptySim();
    sim.tuning.damagePerSpeed = 0;
    sim.ship.x = sim.station.x - 300;
    sim.ship.y = sim.station.y;
    sim.ship.vx = 50000;
    sim.step();
    expect(sim.ship.x).toBeLessThan(sim.station.x - STATION_HALF);
    expect(sim.ship.vx).toBeLessThan(0);
  });

  it("dents the hull like a rock when hit hard", () => {
    const sim = emptySim();
    sim.ship.x = sim.station.x - 200;
    sim.ship.y = sim.station.y;
    sim.ship.vx = 300;
    run(sim, 0.5);
    expect(sim.ship.hull).toBeLessThan(MAX_HULL);
  });

  it("collides with the solid box as it is rotated", () => {
    const sim = emptySim();
    sim.station.rotation = Math.PI / 4;
    sim.tuning.orbitPeriod = 0;
    // Inside the box unrotated, but past its edge once turned 45 degrees.
    sim.ship.x = sim.station.x + 140;
    sim.ship.y = sim.station.y + 140;
    const x = sim.ship.x;
    sim.step();
    expect(sim.ship.x).toBe(x);
    // Outside the box unrotated, but inside its corner once turned.
    sim.ship.x = sim.station.x - 200;
    sim.ship.y = sim.station.y;
    sim.step();
    expect(sim.ship.x).toBeLessThan(sim.station.x - 200);
  });

  it("flies through the dock box instead of colliding", () => {
    const sim = dockedSim();
    sim.ship.vx = 100;
    sim.tuning.dockDrag = 0;
    run(sim, 0.5);
    expect(sim.ship.vx).toBeCloseTo(100, 5);
    expect(sim.ship.hull).toBe(MAX_HULL);
  });

  it("slows the ship only slightly in the dock", () => {
    const sim = dockedSim();
    sim.ship.vx = 100;
    run(sim, 1);
    expect(sim.ship.vx).toBeLessThan(100);
    expect(sim.ship.vx).toBeGreaterThan(60);
  });

  it("turns ore into credits only while docked", () => {
    const sim = dockedSim();
    sim.ship.ore = 5;
    run(sim, 1);
    expect(sim.ship.ore).toBe(0);
    expect(sim.ship.credits).toBe(5 * DEFAULTS.creditsPerOre);

    const away = emptySim();
    away.ship.ore = 5;
    run(away, 1);
    expect(away.ship.ore).toBe(5);
    expect(away.ship.credits).toBe(0);
  });

  it("finds the dock where the station's rotation has put it", () => {
    const sim = emptySim();
    sim.station.rotation = Math.PI / 2;
    sim.ship.x = sim.station.x;
    sim.ship.y = sim.station.y + DOCK_OFFSET;
    expect(sim.isDocked()).toBe(true);
    sim.ship.x = sim.station.x + DOCK_OFFSET;
    sim.ship.y = sim.station.y;
    expect(sim.isDocked()).toBe(false);
  });

  it("keeps credits when the ship is wrecked", () => {
    const sim = emptySim();
    sim.ship.credits = 70;
    sim.ship.ore = 3;
    sim.ship.hull = 1;
    sim.rocks.push(sim.makeRock(2, 100, 0, 0, 0));
    sim.ship.vx = 1000;
    run(sim, 0.2);
    expect(sim.ship.wrecks).toBe(1);
    expect(sim.ship.ore).toBe(0);
    expect(sim.ship.credits).toBe(70);
  });
});

describe("motion relative to the nearest POI", () => {
  /** Distance and bearing from a POI, in that POI's own rotating axes. */
  function localTo(poi: Poi, x: number, y: number) {
    const dx = x - poi.x;
    const dy = y - poi.y;
    const cos = Math.cos(poi.rotation);
    const sin = Math.sin(poi.rotation);
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  }

  function movingSim(): Sim {
    return fitAll(new Sim(1, {
      ...DEFAULTS,
      rockCount: 0,
      fieldOrbitPeriod: 600,
      fieldRotationPeriod: 120,
      orbitPeriod: 300,
      stationRotationPeriod: 60,
      testDrones: 0,
    }));
  }

  it("carries a resting ship with the field's orbit and rotation", () => {
    const sim = movingSim();
    sim.ship.x = sim.field.x + 500;
    sim.ship.y = sim.field.y + 200;
    const before = localTo(sim.field, sim.ship.x, sim.ship.y);
    run(sim, 30);
    const after = localTo(sim.field, sim.ship.x, sim.ship.y);
    expect(sim.ship.frame).toBe(sim.field);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(sim.ship.angle).toBeCloseTo(sim.field.rotation, 5);
  });

  it("counts how far it carried a resting ship, for the dust to drift with", () => {
    const sim = movingSim();
    sim.ship.x = sim.field.x + 500;
    sim.ship.y = sim.field.y + 200;
    const x = sim.ship.x;
    const y = sim.ship.y;
    run(sim, 30);
    // All the ship moved was carrying, so the dust, which moves with the carrying, held still around it.
    expect(Math.hypot(sim.ship.x - x, sim.ship.y - y)).toBeGreaterThan(100);
    expect(sim.ship.carriedX).toBeCloseTo(sim.ship.x - x, 5);
    expect(sim.ship.carriedY).toBeCloseTo(sim.ship.y - y, 5);
  });

  it("carries a resting ship with the station's orbit and rotation", () => {
    const sim = movingSim();
    sim.ship.x = sim.station.x + DOCK_OFFSET;
    sim.ship.y = sim.station.y;
    run(sim, 30);
    const local = localTo(sim.station, sim.ship.x, sim.ship.y);
    expect(sim.ship.frame).toBe(sim.station);
    expect(sim.isDocked()).toBe(true);
    expect(local.x).toBeCloseTo(DOCK_OFFSET, 5);
    expect(local.y).toBeCloseTo(0, 5);
    expect(sim.ship.hull).toBe(MAX_HULL);
  });

  it("keeps rocks in formation as the field moves", () => {
    const sim = movingSim();
    const a = sim.makeRock(2, sim.field.x + 900, sim.field.y, 0, 0);
    const b = sim.makeRock(2, sim.field.x, sim.field.y + 900, 0, 0);
    sim.rocks.push(a, b);
    const gap = Math.hypot(a.x - b.x, a.y - b.y);
    const start = [a.x, a.y];
    run(sim, 30);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(gap, 5);
    expect(Math.hypot(a.x - start[0], a.y - start[1])).toBeGreaterThan(100);
  });

  it("a part command is a part throttle: that share of the push, and a smaller flame", () => {
    const full = new Sim(1, { ...DEFAULTS, retro: false });
    const part = new Sim(1, { ...DEFAULTS, retro: false });
    for (const sim of [full, part]) {
      sim.ship.vx = 0;
      sim.ship.vy = 0;
      sim.ship.angle = 0;
      sim.ship.spin = 0;
    }
    full.controls.thrust = 1;
    part.controls.thrust = 0.25;
    full.step();
    part.step();
    expect(part.ship.vx).toBeCloseTo(full.ship.vx * 0.25, 9);
    expect(full.ship.firing.get("thrusterMain")).toBeCloseTo(1, 9);
    expect(part.ship.firing.get("thrusterMain")).toBeCloseTo(0.25, 9);
  });

  it("retro holds still relative to the POI without firing", () => {
    const sim = movingSim();
    sim.tuning.retro = true;
    sim.ship.x = sim.station.x + DOCK_OFFSET;
    sim.ship.y = sim.station.y;
    run(sim, 5);
    expect(sim.ship.firing.size).toBe(0);
    expect(sim.isDocked()).toBe(true);
  });

  it("retro brakes to a stop relative to the POI", () => {
    const sim = movingSim();
    sim.tuning.retro = true;
    sim.ship.x = sim.field.x + 300;
    sim.ship.y = sim.field.y;
    sim.ship.vx = 100;
    sim.ship.spin = 1;
    run(sim, 3);
    expect(Math.hypot(sim.ship.vx, sim.ship.vy)).toBeCloseTo(0, 5);
    expect(sim.ship.spin).toBe(0);
  });

  it("keeps relative speed when crossing into another POI's zone", () => {
    const sim = emptySim();
    // Halfway between the field's edge and the station's reach.
    sim.ship.x = -sim.tuning.fieldRadius - 2270;
    sim.ship.y = 0;
    sim.ship.vx = -100;
    sim.step();
    expect(sim.ship.frame).toBe(sim.field);
    run(sim, 1);
    expect(sim.ship.frame).toBe(sim.station);
    expect(sim.ship.vx).toBeCloseTo(-100, 5);
    expect(sim.ship.vy).toBeCloseTo(0, 5);
  });
});

describe("parts", () => {
  /** A ship with no parts, sitting still in the dock. */
  function bareSim(): Sim {
    const sim = new Sim(1, { ...DEFAULTS, rockCount: 0, testDrones: 0, stationRotationPeriod: 0 });
    sim.ship.x = sim.station.x + DOCK_OFFSET;
    sim.ship.y = sim.station.y;
    return sim;
  }

  it("starts with only the main engine and rotation", () => {
    const sim = bareSim();
    sim.controls.thrust = -1;
    sim.controls.strafe = 1;
    sim.step();
    expect(sim.ship.firing.size).toBe(0);
    sim.controls.thrust = 1;
    sim.controls.strafe = 0;
    sim.controls.turn = 1;
    sim.step();
    expect([...sim.ship.firing.keys()].sort()).toEqual(["thrusterMain", "thrusterRotateRight"]);
  });

  it("buys a part with credits, only in the dock, and only if affordable", () => {
    const sim = bareSim();
    const price = sim.partPrice("reverse");
    sim.ship.credits = price - 1;
    expect(sim.buyPart(sim.ship, "reverse")).toBe(false);
    sim.ship.credits = price;
    sim.ship.x += 2000;
    expect(sim.buyPart(sim.ship, "reverse")).toBe(false);
    sim.ship.x -= 2000;
    expect(sim.buyPart(sim.ship, "reverse")).toBe(true);
    expect(sim.ship.credits).toBe(0);
    expect(sim.ship.parts.has("reverse")).toBe(true);
    expect(sim.buyPart(sim.ship, "reverse")).toBe(false);
  });

  it("sells a part back at full price", () => {
    const sim = bareSim();
    sim.ship.credits = sim.partPrice("strafe");
    sim.buyPart(sim.ship, "strafe");
    expect(sim.sellPart(sim.ship, "strafe")).toBe(true);
    expect(sim.ship.credits).toBe(sim.partPrice("strafe"));
    expect(sim.ship.parts.has("strafe")).toBe(false);
  });

  it("adds weight, which divides all thrust", () => {
    const sim = bareSim();
    const part = PARTS.find((candidate) => candidate.id === "strafe")!;
    sim.ship.parts.add("strafe");
    expect(sim.shipWeight(sim.ship)).toBeCloseTo(DEFAULTS.weight + part.weight, 5);
    sim.controls.strafe = 1;
    sim.step();
    const expected = (DEFAULTS.sideThrust * TICK) / (DEFAULTS.weight + part.weight);
    expect(Math.abs(sim.ship.vy)).toBeCloseTo(expected, 1);
  });

  it("makes reverse and strafe work once owned", () => {
    const sim = bareSim();
    sim.ship.parts.add("reverse");
    sim.controls.thrust = -1;
    sim.step();
    expect(sim.ship.firing.has("thrusterReverse")).toBe(true);
    sim.ship.parts.add("strafe");
    sim.controls.strafe = 1;
    sim.step();
    expect(sim.ship.firing.has("thrusterStrafeRight")).toBe(true);
  });

  it("stabilizer stops rotation and leaves drift alone", () => {
    const sim = bareSim();
    sim.ship.x += 3000;
    sim.ship.parts.add("spinStabilizer");
    sim.ship.spin = 2;
    sim.ship.vx = 50;
    run(sim, 1);
    expect(sim.ship.spin).toBe(0);
    expect(Math.hypot(sim.ship.vx, sim.ship.vy)).toBeCloseTo(50, 3);
  });

  it("without a stabilizer, rotation keeps going", () => {
    const sim = bareSim();
    sim.ship.spin = 2;
    run(sim, 1);
    expect(sim.ship.spin).toBe(2);
  });

  it("retro does nothing without the part, even when switched on", () => {
    const sim = bareSim();
    sim.ship.x += 3000;
    sim.tuning.retro = true;
    sim.ship.vx = -50;
    run(sim, 1);
    expect(Math.hypot(sim.ship.vx, sim.ship.vy)).toBeCloseTo(50, 3);
  });

  it("retro can only brake with the thrusters the ship owns", () => {
    const sim = bareSim();
    sim.ship.x += 3000;
    sim.ship.parts.add("retro");
    sim.tuning.retro = true;
    sim.ship.vy = 0;
    sim.ship.vx = 100; // Forward, which only a reverse thruster could slow.
    run(sim, 1);
    expect(sim.ship.vx).toBeCloseTo(100, 1);
    sim.ship.parts.add("reverse");
    run(sim, 2);
    expect(sim.ship.vx).toBeCloseTo(0, 3);
  });
});

describe("rocks drifting in", () => {
  /** A small field target with one rock, so the field always wants more. */
  function inflowSim(rockInflow: number): Sim {
    return new Sim(1, {
      ...DEFAULTS,
      rockCount: 50,
      rockInflow,
      testDrones: 0,
    });
  }

  function clearRocks(sim: Sim): void {
    sim.rocks.length = 0;
  }

  it("arrives at about the set rate, starting outside the field and away from the player", () => {
    const sim = inflowSim(6);
    clearRocks(sim);
    run(sim, 60);
    expect(sim.rocks.length).toBeGreaterThanOrEqual(5);
    expect(sim.rocks.length).toBeLessThanOrEqual(7);
    const newest = sim.rocks[sim.rocks.length - 1];
    expect(newest.tier).toBe(2);
    expect(newest.arriving).toBe(true);
    expect(Math.hypot(newest.x - sim.field.x, newest.y - sim.field.y)).toBeGreaterThan(
      DEFAULTS.fieldRadius,
    );
  });

  it("never starts a rock close to the player", () => {
    const sim = inflowSim(10);
    clearRocks(sim);
    sim.ship.x = sim.field.x + DEFAULTS.fieldRadius + 1500;
    sim.ship.y = sim.field.y;
    const seen = new Set<object>();
    const ticks = Math.round(120 / TICK);
    for (let i = 0; i < ticks; i++) {
      sim.ship.vx = 0;
      sim.ship.vy = 0;
      sim.step();
      for (const rock of sim.rocks) {
        if (seen.has(rock)) continue;
        seen.add(rock);
        expect(Math.hypot(rock.x - sim.ship.x, rock.y - sim.ship.y)).toBeGreaterThan(1900);
      }
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it("stops once the field is full", () => {
    const sim = inflowSim(10);
    clearRocks(sim);
    sim.tuning.rockCount = 3;
    run(sim, 120);
    expect(sim.rocks.length).toBe(3);
  });

  it("can be turned off", () => {
    const sim = inflowSim(0);
    clearRocks(sim);
    run(sim, 60);
    expect(sim.rocks.length).toBe(0);
  });

  it("drifts in at a steady speed and joins the field", () => {
    const sim = inflowSim(10);
    clearRocks(sim);
    sim.tuning.rockCount = 1;
    run(sim, 10);
    const rock = sim.rocks[0];
    const speed = Math.hypot(rock.vx, rock.vy);
    expect(speed).toBeCloseTo(25, 0);
    let ticks = 0;
    while (rock.arriving && ticks < 12000) {
      sim.step();
      ticks++;
    }
    expect(rock.arriving).toBe(false);
    expect(Math.hypot(rock.vx, rock.vy)).toBeCloseTo(speed, 0);
  });
});

describe("repairs", () => {
  function dockedSim(): Sim {
    const sim = new Sim(1, { ...DEFAULTS, rockCount: 0, testDrones: 0, stationRotationPeriod: 0 });
    sim.ship.x = sim.station.x + DOCK_OFFSET;
    sim.ship.y = sim.station.y;
    return sim;
  }

  it("repairs in the dock for credits", () => {
    const sim = dockedSim();
    sim.ship.hull = 90;
    sim.ship.credits = 100;
    run(sim, 2);
    expect(sim.ship.hull).toBe(MAX_HULL);
    expect(sim.ship.credits).toBe(100 - 10 * DEFAULTS.repairCost);
    expect(sim.ship.upkeep).toBe(10 * DEFAULTS.repairCost);
  });

  it("repairs at the set speed", () => {
    const sim = dockedSim();
    sim.ship.hull = 10;
    sim.ship.credits = 1000;
    run(sim, 1);
    expect(sim.ship.hull).toBeCloseTo(10 + DEFAULTS.repairSpeed, 0);
  });

  it("repairs only as far as the credits go", () => {
    const sim = dockedSim();
    sim.ship.hull = 50;
    sim.ship.credits = 10;
    run(sim, 3);
    expect(sim.ship.hull).toBe(55);
    expect(sim.ship.credits).toBe(0);
  });

  it("doesn't repair away from the dock", () => {
    const sim = dockedSim();
    sim.ship.x += 3000;
    sim.ship.hull = 50;
    sim.ship.credits = 100;
    run(sim, 1);
    expect(sim.ship.hull).toBe(50);
    expect(sim.ship.credits).toBe(100);
  });

  it("charges for a rebuild even without the money, as debt", () => {
    const sim = dockedSim();
    sim.ship.x += 3000;
    sim.ship.credits = 50;
    sim.ship.hull = 1;
    sim.rocks.push(sim.makeRock(2, sim.ship.x + 100, sim.ship.y, 0, 0));
    sim.ship.vx = 1000;
    run(sim, 0.2);
    expect(sim.ship.wrecks).toBe(1);
    expect(sim.ship.credits).toBe(50 - DEFAULTS.rebuildCost);
    expect(sim.ship.upkeep).toBe(DEFAULTS.rebuildCost);
  });

  it("can't buy while in debt", () => {
    const sim = dockedSim();
    sim.ship.credits = -10;
    expect(sim.buyPart(sim.ship, "meters")).toBe(false);
    expect(sim.buyDrone(sim.ship)).toBeNull();
  });
});

describe("overlapping rocks", () => {
  it("doesn't build up speed while wedged between them", () => {
    const sim = emptySim();
    sim.tuning.damagePerSpeed = 0;
    sim.tuning.bounce = 0;
    const left = sim.makeRock(2, -60, 0, 0, 0);
    const right = sim.makeRock(2, 60, 0, 0, 0);
    left.hp = 1000;
    right.hp = 1000;
    sim.rocks.push(left, right);
    sim.controls.thrust = 1;
    let fastest = 0;
    for (let i = 0; i < 300; i++) {
      sim.step();
      fastest = Math.max(fastest, Math.hypot(sim.ship.vx, sim.ship.vy));
    }
    expect(fastest).toBeLessThan(200);
  });
});

describe("POI readings", () => {
  it("measures the field until its edge enters the view", () => {
    const sim = emptySim();
    sim.ship.x = DEFAULTS.fieldRadius + 400 + 1000;
    expect(sim.readPoi(sim.field, 400, 300).distance).toBeCloseTo(1000, 5);
    sim.ship.x = DEFAULTS.fieldRadius + 400;
    expect(sim.readPoi(sim.field, 400, 300).distance).toBe(0);
    sim.ship.x = 100;
    expect(sim.readPoi(sim.field, 400, 300).distance).toBe(0);
  });

  it("measures the station until its nearest side enters the view", () => {
    const sim = emptySim();
    const dockSide = DOCK_OFFSET + STATION_HALF;
    sim.ship.y = sim.station.y;
    sim.ship.x = sim.station.x + dockSide + 400 + 1000;
    expect(sim.readPoi(sim.station, 400, 300).distance).toBeCloseTo(1000, 5);
    sim.ship.x = sim.station.x + dockSide + 400;
    expect(sim.readPoi(sim.station, 400, 300).distance).toBe(0);
    sim.ship.x = sim.station.x - STATION_HALF - 400 - 1000;
    expect(sim.readPoi(sim.station, 400, 300).distance).toBeCloseTo(1000, 5);
  });

  it("follows the station's rotation when measuring its sides", () => {
    const sim = emptySim();
    sim.station.rotation = Math.PI / 2;
    sim.ship.x = sim.station.x;
    sim.ship.y = sim.station.y + DOCK_OFFSET + STATION_HALF + 300 + 500;
    expect(sim.readPoi(sim.station, 400, 300).distance).toBeCloseTo(500, 5);
  });

  it("measures zero once docked", () => {
    const sim = emptySim();
    sim.ship.x = sim.station.x + DOCK_OFFSET;
    sim.ship.y = sim.station.y;
    expect(sim.readPoi(sim.station, 400, 300).distance).toBe(0);
  });

  it("uses the width and height of the view", () => {
    const sim = emptySim();
    sim.ship.x = sim.station.x;
    sim.ship.y = sim.station.y + STATION_HALF + 700;
    expect(sim.readPoi(sim.station, 400, 300).distance).toBeCloseTo(400, 5);
    expect(sim.readPoi(sim.station, 300, 700).distance).toBe(0);
  });

  it("reports closing speed as positive when approaching", () => {
    const sim = emptySim();
    sim.tuning.orbitPeriod = 0;
    sim.ship.x = 3000;
    sim.ship.vx = -100;
    sim.step();
    expect(sim.readPoi(sim.field, 0, 0).closing).toBeCloseTo(100, 3);
    sim.ship.vx = 100;
    sim.step();
    expect(sim.readPoi(sim.field, 0, 0).closing).toBeCloseTo(-100, 3);
  });

  it("reads no closing speed while carried by that POI", () => {
    const sim = new Sim(1, { ...DEFAULTS, rockCount: 0, stationRotationPeriod: 60 });
    sim.ship.x = sim.station.x + DOCK_OFFSET;
    sim.ship.y = sim.station.y;
    run(sim, 5);
    expect(sim.readPoi(sim.station, 0, 0).closing).toBeCloseTo(0, 3);
  });

  it("includes the POI's own motion in closing speed", () => {
    const sim = emptySim();
    sim.tuning.orbitPeriod = 60;
    // Parked in the field's zone, directly ahead of the station's path.
    sim.ship.x = sim.station.x + 3000;
    sim.ship.y = 0;
    sim.step();
    const stationSpeed = (2 * Math.PI * sim.station.orbitRadius) / 60;
    expect(Math.abs(sim.readPoi(sim.station, 0, 0).closing)).toBeGreaterThan(0);
    expect(Math.abs(sim.readPoi(sim.station, 0, 0).closing)).toBeLessThan(stationSpeed);
  });
});

describe("mining", () => {
  it("breaks a rock into smaller rocks after enough shots", () => {
    const sim = emptySim();
    const rock = sim.makeRock(2, 300, 0, 0, 0);
    sim.rocks.push(rock);
    const hp = rock.hp;
    sim.controls.fire = true;
    run(sim, (hp + 2) / DEFAULTS.shotsPerSecond + 0.5);
    expect(sim.rocks).not.toContain(rock);
    expect(sim.rocks.length).toBeGreaterThan(0);
    expect(sim.rocks.every((r) => r.tier < 2)).toBe(true);
  });

  it("collects ore on contact", () => {
    const sim = emptySim();
    sim.tuning.oreChance = 1;
    const rock = sim.makeRock(0, 0, 0, 0, 0);
    sim.breakRock(rock);
    expect(sim.ores.length).toBe(1);
    run(sim, TICK);
    expect(sim.ship.ore).toBe(1);
    expect(sim.ores.length).toBe(0);
  });

  it("builds the same field from the same seed", () => {
    const a = new Sim(7, { ...DEFAULTS });
    const b = new Sim(7, { ...DEFAULTS });
    expect(a.rocks.map((r) => [r.x, r.y, r.tier])).toEqual(b.rocks.map((r) => [r.x, r.y, r.tier]));
  });
});

describe("the new ship", () => {
  function floater(extra: Partial<typeof DEFAULTS> = {}): Sim {
    return new Sim(1, {
      ...GAME_DEFAULTS,
      trafficRacers: 0,
      trafficFloaters: 0,
      pirates: 0,
      defenders: 0,
      stationStartParts: 100000,
      stationReserveParts: Infinity,
      stationUnlocks: false,
      rockCount: 0,
      rockInflow: 0,
      testDrones: 0,
      fieldOrbitRadius: 0,
      fieldRotationPeriod: 0,
      ...extra,
    });
  }

  it("starts with gun 2 and click to move, and a weak engine", () => {
    const sim = floater();
    expect(sim.ship.model).toBe("floater");
    expect(sim.ship.parts.has("gun2")).toBe(true);
    expect(sim.ship.parts.has("clickMove")).toBe(true);
    expect(sim.ship.parts.has("reverse")).toBe(false);
    sim.controls.thrust = 1;
    run(sim, 1);
    expect(sim.ship.vx).toBeCloseTo(
      (GAME_DEFAULTS.thrust * GAME_DEFAULTS.floaterEngine) / sim.shipWeight(sim.ship),
      0,
    );
  });

  it("can be switched off", () => {
    const sim = floater({ floaterStart: false });
    expect(sim.ship.model).toBe("racer");
    expect(sim.ship.parts.size).toBe(0);
  });

  it("gun 2 fires slower than the first gun", () => {
    const sim = floater();
    sim.controls.fire = true;
    let shots = 0;
    for (let i = 0; i < Math.round(3 / TICK); i++) {
      sim.step();
      shots += sim.events.filter((event) => event.type === "shot").length;
      sim.events.length = 0;
    }
    expect(shots).toBeLessThanOrEqual(Math.ceil(3 * GAME_DEFAULTS.gun2ShotsPerSecond));
    expect(shots).toBeGreaterThan(0);
  });

  function shootRock(preciseChance: number, toughness: number): { sim: Sim; start: number } {
    const sim = floater({ preciseChance, rockToughness: toughness });
    sim.ship.angle = 0;
    sim.rocks.push(sim.makeRock(2, sim.ship.x + 200, sim.ship.y, 0, 0));
    const start = sim.rocks[0].hp;
    sim.controls.fire = true;
    return { sim, start };
  }

  it("a precision hit frees ore at the hit that drifts with the rock, and the rock stays whole", () => {
    const { sim, start } = shootRock(1, 20);
    const rock = sim.rocks[0];
    let ticks = 0;
    while (sim.ores.length === 0 && ticks < 1200) {
      sim.step();
      ticks++;
    }
    expect(sim.ores.length).toBe(1);
    expect(sim.rocks).toContain(rock);
    expect(rock.hp).toBe(start - 1);
    const ore = sim.ores[0];
    expect(Math.hypot(ore.x - rock.x, ore.y - rock.y)).toBeLessThan(rock.radius + 15);
    expect(ore.vx).toBeCloseTo(rock.vx, 6);
    expect(ore.vy).toBeCloseTo(rock.vy, 6);
    expect(ore.amount).toBe(1);
  });

  it("a break leaves pieces and ore drifting with the rock", () => {
    const sim = floater({ oreChance: 1, rockToughness: 1 });
    const rock = sim.makeRock(2, sim.ship.x + 500, sim.ship.y, 12, -7);
    sim.rocks.push(rock);
    sim.breakRock(rock, sim.ship, false);
    expect(sim.rocks.length).toBeGreaterThanOrEqual(2);
    for (const piece of sim.rocks) {
      expect(piece.vx).toBeCloseTo(12, 6);
      expect(piece.vy).toBeCloseTo(-7, 6);
    }
    for (let i = 0; i < sim.rocks.length; i++) {
      for (let j = i + 1; j < sim.rocks.length; j++) {
        const a = sim.rocks[i];
        const b = sim.rocks[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius - 0.01);
      }
    }
    expect(sim.ores.length).toBe(3);
    for (const ore of sim.ores) {
      expect(ore.vx).toBeCloseTo(12, 6);
      expect(ore.vy).toBeCloseTo(-7, 6);
      expect(ore.amount).toBe(1);
    }
  });

  it("gun 1 breaks sometimes fling ore off, worth more; gun 2 breaks never do", () => {
    for (const gun1 of [true, false]) {
      const sim = floater({ oreChance: 1, flingChance: 0.5, flingOreAmount: 3 });
      for (let i = 0; i < 40; i++) {
        const rock = sim.makeRock(2, sim.ship.x + 500, sim.ship.y + i * 200, 0, 0);
        sim.rocks.push(rock);
        sim.breakRock(rock, sim.ship, gun1);
      }
      const flung = sim.ores.filter((ore) => Math.hypot(ore.vx, ore.vy) > 1);
      if (gun1) {
        expect(flung.length).toBeGreaterThan(20);
        expect(flung.length).toBeLessThan(100);
        for (const ore of flung) expect(ore.amount).toBe(3);
      } else {
        expect(flung).toEqual([]);
      }
      for (const ore of sim.ores.filter((o) => !flung.includes(o))) expect(ore.amount).toBe(1);
    }
  });

  it("picking up flung ore counts its worth", () => {
    const sim = floater();
    sim.ores.push({
      x: sim.ship.x,
      y: sim.ship.y,
      px: sim.ship.x,
      py: sim.ship.y,
      vx: 0,
      vy: 0,
      kind: 0,
      amount: 3,
    });
    sim.step();
    expect(sim.ship.ore).toBe(3);
  });

  it("every hit wears the rock, so it still breaks in the end", () => {
    const { sim } = shootRock(1, 2);
    const rock = sim.rocks[0];
    run(sim, 5);
    expect(sim.rocks).not.toContain(rock);
  });

  it("the first gun never makes a precision hit", () => {
    const sim = floater({ floaterStart: false, preciseChance: 1, rockToughness: 20 });
    sim.rocks.push(sim.makeRock(2, sim.ship.x + 200, sim.ship.y, 0, 0));
    sim.controls.fire = true;
    run(sim, 2);
    expect(sim.ores.length).toBe(0);
  });

  it("flies to a clicked spot and stops there, with no final turn", () => {
    const sim = floater();
    const x = sim.ship.x + 300;
    const y = sim.ship.y + 400;
    expect(sim.orderMove(x, y)).toBe(true);
    let top = 0;
    let ticks = 0;
    while (sim.clickPilot.active && ticks < Math.round(60 / TICK)) {
      sim.step();
      top = Math.max(top, Math.hypot(sim.ship.vx, sim.ship.vy));
      ticks++;
    }
    expect(sim.clickPilot.active).toBe(false);
    expect(Math.hypot(sim.ship.x - x, sim.ship.y - y)).toBeLessThan(60);
    expect(Math.hypot(sim.ship.vx, sim.ship.vy)).toBeLessThan(8);
    expect(top).toBeLessThan(GAME_DEFAULTS.clickSpeed * 1.25);
  }, 30000);

  it("uses only the main thruster and rotation when that's all it has", () => {
    const sim = floater();
    sim.orderMove(sim.ship.x + 400, sim.ship.y - 300);
    const used = new Set<string>();
    for (let i = 0; i < Math.round(30 / TICK); i++) {
      sim.step();
      for (const thruster of sim.ship.firing.keys()) used.add(thruster);
    }
    expect(used.has("thrusterMain")).toBe(true);
    expect(used.has("thrusterReverse")).toBe(false);
    expect(used.has("thrusterStrafeLeft")).toBe(false);
  }, 30000);

  it("leaves the nose where the stop left it", () => {
    const sim = floater();
    sim.orderMove(sim.ship.x + 500, sim.ship.y);
    let ticks = 0;
    while (sim.clickPilot.active && ticks < Math.round(60 / TICK)) {
      sim.step();
      ticks++;
    }
    expect(sim.clickPilot.active).toBe(false);
    expect(Math.abs(sim.ship.angle)).toBeGreaterThan(1);
  }, 30000);

  it("keeps its spot on a turning field", () => {
    const sim = floater({ fieldRotationPeriod: 120 });
    const dx = sim.ship.x - sim.field.x;
    const dy = sim.ship.y - sim.field.y;
    sim.orderMove(sim.field.x + dx + 200, sim.field.y + dy);
    const before = sim.clickPilot.target()!;
    run(sim, 30);
    const after = sim.clickPilot.target();
    if (after) expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(100);
    else expect(Math.hypot(sim.ship.x - before.x, sim.ship.y - before.y)).toBeGreaterThan(100);
  }, 30000);

  it("gives up on a spot it can't reach", () => {
    const sim = floater();
    sim.rocks.push(sim.makeRock(2, sim.ship.x + 400, sim.ship.y, 0, 0));
    sim.orderMove(sim.ship.x + 400, sim.ship.y);
    run(sim, 120);
    expect(sim.clickPilot.active).toBe(false);
    expect(sim.ship.damageTaken).toBe(0);
  }, 30000);

  it("flies blind without the route planner, and around rocks with it", () => {
    for (const planner of [false, true]) {
      const sim = floater();
      // Measured at the weight this was tuned for: the planner's margin is thin.
      sim.ship.parts.delete("clickTurn");
      if (planner) sim.ship.parts.add("clickRoute");
      const rock = sim.makeRock(2, sim.ship.x + 500, sim.ship.y, 0, 0);
      sim.rocks.push(rock);
      sim.orderMove(sim.ship.x + 1000, sim.ship.y);
      let closest = Infinity;
      for (let i = 0; i < Math.round(30 / TICK); i++) {
        sim.step();
        closest = Math.min(closest, Math.hypot(sim.ship.x - rock.x, sim.ship.y - rock.y));
      }
      const touching = rock.radius + SHIP_RADIUS + 0.5;
      if (planner) expect(closest).toBeGreaterThan(touching);
      else expect(closest).toBeLessThanOrEqual(touching);
    }
  }, 30000);

  it("turns to its next burn while coasting", () => {
    const sim = floater();
    sim.orderMove(sim.ship.x + 2500, sim.ship.y);
    let checked = 0;
    for (let i = 0; i < Math.round(30 / TICK); i++) {
      sim.step();
      const { ship } = sim;
      if (i * TICK < 15 || ship.firing.has("thrusterMain")) continue;
      const braking = Math.atan2(-ship.vy, -ship.vx);
      const off = Math.abs(Math.atan2(Math.sin(ship.angle - braking), Math.cos(ship.angle - braking)));
      expect(off).toBeLessThan(0.4);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  }, 30000);

  it("a canceled move keeps coasting", () => {
    const sim = floater();
    sim.orderMove(sim.ship.x + 2500, sim.ship.y);
    run(sim, 10);
    const speed = Math.hypot(sim.ship.vx, sim.ship.vy);
    expect(speed).toBeGreaterThan(30);
    sim.clickPilot.cancel();
    run(sim, 1);
    expect(sim.clickPilot.active).toBe(false);
    expect(sim.ship.firing.has("thrusterMain")).toBe(false);
    expect(Math.hypot(sim.ship.vx, sim.ship.vy)).toBeCloseTo(speed, 0);
  }, 30000);

  describe("tractor beam", () => {
    function withOre(distance: number, vy = 0): Sim {
      const sim = floater();
      sim.ship.parts.add("tractor");
      sim.ores.push({
        x: sim.ship.x + distance,
        y: sim.ship.y,
        px: sim.ship.x + distance,
        py: sim.ship.y,
        vx: 0,
        vy,
        kind: 0,
        amount: 1,
      });
      return sim;
    }

    it("isn't fitted from the start", () => {
      expect(floater().ship.parts.has("tractor")).toBe(false);
    });

    it("pulls in ore within range until it's picked up", () => {
      const sim = withOre(300);
      run(sim, 10);
      expect(sim.ores.length).toBe(0);
      expect(sim.ship.ore).toBe(1);
    });

    it("catches ore that's flying off", () => {
      const sim = withOre(300, 60);
      run(sim, 15);
      expect(sim.ship.ore).toBe(1);
    });

    it("leaves ore out of range alone", () => {
      const sim = withOre(GAME_DEFAULTS.tractorRange + 50);
      run(sim, 2);
      expect(sim.ores[0].vx).toBe(0);
    });

    it("does nothing without the part", () => {
      const sim = withOre(300);
      sim.ship.parts.delete("tractor");
      run(sim, 2);
      expect(sim.ores[0].vx).toBe(0);
    });

    it("can be bought for the new ship but not the first", () => {
      for (const floaterStart of [true, false]) {
        const sim = floater({ floaterStart });
        sim.ship.credits = 1000;
        sim.ship.x = sim.station.x + DOCK_OFFSET;
        sim.ship.y = sim.station.y;
        expect(sim.buyPart(sim.ship, "tractor")).toBe(floaterStart);
      }
    });
  });

  describe("orders", () => {
    const off = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const velocity = (sim: Sim) => ({
      vx: (sim.ship.x - sim.ship.px) / TICK,
      vy: (sim.ship.y - sim.ship.py) / TICK,
    });

    function finish(sim: Sim, seconds = 60): void {
      let ticks = 0;
      while (sim.clickPilot.active && ticks < Math.round(seconds / TICK)) {
        sim.step();
        ticks++;
      }
    }

    it("the new ship starts with move and facing orders", () => {
      const sim = floater();
      expect(sim.ship.parts.has("clickMove")).toBe(true);
      expect(sim.ship.parts.has("clickTurn")).toBe(true);
    });

    it("a facing with no move turns in place, using rotation only, then lets go", () => {
      const sim = floater();
      const start = { x: sim.ship.x, y: sim.ship.y };
      expect(sim.orderFace(2.4)).toBe(true);
      for (let i = 0; i < Math.round(20 / TICK) && sim.clickPilot.active; i++) {
        sim.step();
        expect(sim.ship.firing.has("thrusterMain")).toBe(false);
      }
      expect(sim.clickPilot.active).toBe(false);
      expect(off(sim.ship.angle, 2.4)).toBeLessThan(0.1);
      expect(Math.abs(sim.ship.spin)).toBeLessThan(0.2);
      expect(Math.hypot(sim.ship.x - start.x, sim.ship.y - start.y)).toBeLessThan(1);
    }, 30000);

    it("a facing during a move is held while coasting and after arriving", () => {
      const sim = floater();
      const face = Math.PI / 2;
      sim.orderMove(sim.ship.x + 2500, sim.ship.y);
      sim.orderFace(face);
      let checked = 0;
      let ticks = 0;
      while (sim.clickPilot.active && ticks < Math.round(120 / TICK)) {
        sim.step();
        ticks++;
        const { ship } = sim;
        // Settled into a coast: not burning and done turning.
        if (ship.firing.size === 0 && Math.abs(ship.spin) < 0.1 && Math.hypot(ship.vx, ship.vy) > 30) {
          expect(off(ship.angle, face)).toBeLessThan(0.15);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(100);
      expect(sim.clickPilot.active).toBe(false);
      expect(off(sim.ship.angle, face)).toBeLessThan(0.1);
    }, 30000);

    it("a dragged move ends drifting at the drawn velocity, on top of the ship's own", () => {
      const sim = floater();
      sim.ship.vx = 20;
      sim.step();
      const before = velocity(sim);
      expect(sim.orderMove(sim.ship.x + 300, sim.ship.y + 300, 0, 15)).toBe(true);
      finish(sim, 90);
      expect(sim.clickPilot.active).toBe(false);
      const after = velocity(sim);
      // Trimmed at part throttle, so it matches the drift, not just comes close.
      expect(Math.abs(after.vx - before.vx)).toBeLessThan(0.05);
      expect(Math.abs(after.vy - (before.vy + 15))).toBeLessThan(0.05);
    }, 30000);

    it("a left click shifts the ship over and leaves it moving as it was", () => {
      const sim = floater();
      sim.ship.vx = 20;
      sim.ship.vy = -10;
      sim.step();
      const before = velocity(sim);
      const goal = { x: sim.ship.x + 300, y: sim.ship.y + 300 };
      expect(sim.orderTranslate(goal.x, goal.y)).toBe(true);
      expect(sim.clickPilot.drifting).toBe(true);
      let last = { ...sim.clickPilot.target()! };
      let ticks = 0;
      while (sim.clickPilot.active && ticks < Math.round(90 / TICK)) {
        const now = sim.clickPilot.target();
        if (now) last = { ...now };
        sim.step();
        ticks++;
      }
      expect(sim.clickPilot.active).toBe(false);
      const after = velocity(sim);
      expect(Math.abs(after.vx - before.vx)).toBeLessThan(6);
      expect(Math.abs(after.vy - before.vy)).toBeLessThan(6);
      expect(Math.hypot(sim.ship.x - last.x, sim.ship.y - last.y)).toBeLessThan(80);
      const seconds = ticks * TICK;
      expect(Math.abs(last.x - (goal.x + before.vx * seconds))).toBeLessThan(40);
    }, 30000);

    it("a left click needs the same part as any other move", () => {
      const sim = floater();
      sim.ship.parts.delete("clickMove");
      expect(sim.orderTranslate(sim.ship.x + 300, sim.ship.y)).toBe(false);
      expect(sim.clickPilot.active).toBe(false);
    });

    it("a dragged move ends near its drifting destination", () => {
      const sim = floater();
      sim.orderMove(sim.ship.x + 400, sim.ship.y, 0, -10);
      const start = { ...sim.clickPilot.target()! };
      let ticks = 0;
      let last = start;
      while (sim.clickPilot.active && ticks < Math.round(90 / TICK)) {
        const now = sim.clickPilot.target();
        if (now) last = { ...now };
        sim.step();
        ticks++;
      }
      expect(sim.clickPilot.active).toBe(false);
      expect(start.y - last.y).toBeGreaterThan(50);
      expect(Math.hypot(sim.ship.x - last.x, sim.ship.y - last.y)).toBeLessThan(80);
    }, 30000);

    it("flight keys don't cancel the order: it waits, then takes back over", () => {
      const sim = floater();
      const goal = { x: sim.ship.x + 2000, y: sim.ship.y };
      sim.orderMove(goal.x, goal.y);
      run(sim, 5);
      sim.clickPilot.handsOn();
      sim.controls.turn = 1;
      sim.controls.thrust = 0;
      expect(sim.clickPilot.active).toBe(true);
      expect(sim.clickPilot.flying).toBe(false);
      run(sim, 0.5);
      // The player's control stands while the order waits.
      expect(sim.ship.firing.has("thrusterMain")).toBe(false);
      expect(sim.controls.turn).toBe(1);
      sim.controls.turn = 0;
      run(sim, 0.6);
      expect(sim.clickPilot.flying).toBe(true);
      finish(sim, 120);
      expect(sim.clickPilot.active).toBe(false);
      expect(Math.hypot(goal.x - sim.ship.x, goal.y - sim.ship.y)).toBeLessThan(60);
    }, 30000);

    it("a stop with an order cancels it and coasts on", () => {
      const sim = floater();
      sim.orderMove(sim.ship.x + 2500, sim.ship.y);
      run(sim, 10);
      const speed = Math.hypot(sim.ship.vx, sim.ship.vy);
      expect(speed).toBeGreaterThan(30);
      expect(sim.orderStop()).toBe(true);
      expect(sim.clickPilot.active).toBe(false);
      run(sim, 1);
      expect(Math.hypot(sim.ship.vx, sim.ship.vy)).toBeCloseTo(speed, 0);
    }, 30000);

    it("a stop with no order brings the ship to rest", () => {
      const sim = floater();
      sim.ship.vx = 40;
      sim.ship.vy = -20;
      sim.step();
      expect(sim.orderStop()).toBe(true);
      finish(sim, 60);
      expect(sim.clickPilot.active).toBe(false);
      const { vx, vy } = velocity(sim);
      expect(Math.hypot(vx, vy)).toBeLessThan(8);
    }, 30000);

    it("a new move keeps the facing already drawn", () => {
      const sim = floater();
      sim.orderMove(sim.ship.x + 2000, sim.ship.y);
      sim.orderFace(1);
      sim.orderMove(sim.ship.x, sim.ship.y + 2000);
      expect(sim.clickPilot.facing()).toBe(1);
    });

    it("facing needs its part", () => {
      const sim = floater();
      sim.ship.parts.delete("clickTurn");
      expect(sim.orderFace(1)).toBe(false);
      expect(sim.clickPilot.active).toBe(false);
    });
  });

  it("a new move order changes the destination", () => {
    const sim = floater();
    sim.orderMove(sim.ship.x + 2000, sim.ship.y);
    run(sim, 3);
    const x = sim.ship.x;
    const y = sim.ship.y + 500;
    sim.orderMove(x, y);
    const target = sim.clickPilot.target()!;
    expect(Math.hypot(target.x - x, target.y - y)).toBeLessThan(1);
  }, 30000);

  it("needs the part", () => {
    const sim = floater({ floaterStart: false });
    expect(sim.orderMove(0, 0)).toBe(false);
    expect(sim.clickPilot.active).toBe(false);
  });

  it("either ship can buy the systems", () => {
    const sim = floater({ floaterStart: false });
    sim.ship.credits = 1000;
    sim.ship.x = sim.station.x + DOCK_OFFSET;
    sim.ship.y = sim.station.y;
    expect(sim.buyPart(sim.ship, "gun2")).toBe(true);
    expect(sim.buyPart(sim.ship, "clickMove")).toBe(true);
    expect(sim.orderMove(sim.ship.x + 50, sim.ship.y)).toBe(true);
    sim.sellPart(sim.ship, "clickMove");
    expect(sim.clickPilot.active).toBe(false);
  });
});

describe("POI carrying zones", () => {
  function zoned(extra: Partial<typeof DEFAULTS> = {}): Sim {
    return new Sim(1, {
      ...GAME_DEFAULTS,
      trafficRacers: 0,
      trafficFloaters: 0,
      pirates: 0,
      defenders: 0,
      rockCount: 0,
      rockInflow: 0,
      testDrones: 0,
      haulers: false,
      fieldOrbitRadius: 0,
      fieldRotationPeriod: 60,
      ...extra,
    });
  }
  /** A spot straight out from the field's edge, on the side away from the station. */
  const out = (sim: Sim, distance: number) => ({
    x: sim.field.x + sim.field.reach + distance,
    y: sim.field.y,
  });

  it("by default carries only near each POI, so open space carries nothing", () => {
    const sim = zoned();
    const near = out(sim, 1000);
    expect(sim.carryShares(near.x, near.y)[0]).toBe(1);
    const far = out(sim, 50000);
    expect(Math.max(...sim.carryShares(far.x, far.y))).toBe(0);
  });

  it("with no outer range the nearest POI carries everything, everywhere", () => {
    const sim = zoned({ ...carrying(Infinity, Infinity) });
    const spot = out(sim, 50000);
    expect(sim.carryShares(spot.x, spot.y)[0]).toBe(1);
  });

  it("carries fully within the full range, fades linearly, and lets go past the outer range", () => {
    const sim = zoned({ ...carrying(1000, 3000) });
    const share = (distance: number) => {
      const spot = out(sim, distance);
      return sim.carryShares(spot.x, spot.y)[0];
    };
    expect(share(500)).toBe(1);
    expect(share(2000)).toBeCloseTo(0.5, 2);
    expect(share(3500)).toBe(0);
  });

  const looseOre = (x: number, y: number) => ({ x, y, px: x, py: y, vx: 0, vy: 0, kind: 0, amount: 1 });

  it("ore outside every zone isn't turned by the field", () => {
    const sim = zoned({ ...carrying(500, 1000) });
    const spot = out(sim, 1500);
    const ore = looseOre(spot.x, spot.y);
    sim.ores.push(ore);
    run(sim, 5);
    expect(Math.hypot(ore.x - spot.x, ore.y - spot.y)).toBeLessThan(0.001);
  });

  it("ore in the full zone turns with the field", () => {
    const sim = zoned({ ...carrying(500, 1000) });
    const spot = out(sim, 200);
    const ore = looseOre(spot.x, spot.y);
    sim.ores.push(ore);
    run(sim, 5);
    const angle = Math.atan2(ore.y - sim.field.y, ore.x - sim.field.x);
    expect(angle).toBeCloseTo((2 * Math.PI * 5) / 60, 2);
  });

  it("the outer range is never inside the full range", () => {
    const sim = zoned({ ...carrying(2000, 500) });
    const spot = out(sim, 1500);
    expect(sim.carryShares(spot.x, spot.y)[0]).toBe(1);
  });
});

describe("drag drift", () => {
  function moving(extra: Partial<typeof DEFAULTS> = {}): Sim {
    const sim = new Sim(1, {
      ...GAME_DEFAULTS,
      trafficRacers: 0,
      trafficFloaters: 0,
      pirates: 0,
      defenders: 0,
      rockCount: 0,
      rockInflow: 0,
      testDrones: 0,
      haulers: false,
      fieldOrbitRadius: 0,
      fieldRotationPeriod: 0,
      ...extra,
    });
    sim.ship.vx = 30;
    return sim;
  }

  it("is on top of the ship's motion by default", () => {
    const sim = moving();
    sim.orderMove(sim.ship.x + 500, sim.ship.y, 0, 10);
    const spot = sim.clickPilot.spot!;
    expect(spot.vx).toBe(30);
    expect(spot.vy).toBe(10);
  });

  it("a nudge adds to the destination's drift, whatever the ship is doing", () => {
    const sim = moving();
    sim.orderMove(sim.ship.x + 500, sim.ship.y, 0, 10);
    run(sim, 2);
    const spot = sim.clickPilot.spot!;
    const before = { vx: spot.vx, vy: spot.vy };
    expect(sim.orderNudge(-3, 2)).toBe(true);
    expect(spot.vx).toBeCloseTo(before.vx - 3, 9);
    expect(spot.vy).toBeCloseTo(before.vy + 2, 9);
  });

  it("a nudge needs a move under way", () => {
    const sim = moving();
    expect(sim.orderNudge(1, 1)).toBe(false);
    sim.orderFace(1);
    expect(sim.orderNudge(1, 1)).toBe(false);
  });

  it("a nudged move ends matching the corrected drift", () => {
    const sim = moving();
    sim.ship.vx = 0;
    sim.orderMove(sim.ship.x + 300, sim.ship.y, 0, 10);
    run(sim, 3);
    sim.orderNudge(5, 0);
    let ticks = 0;
    while (sim.clickPilot.active && ticks < Math.round(120 / TICK)) {
      sim.step();
      ticks++;
    }
    expect(sim.clickPilot.active).toBe(false);
    const vx = (sim.ship.x - sim.ship.px) / TICK;
    const vy = (sim.ship.y - sim.ship.py) / TICK;
    expect(Math.abs(vx - 5)).toBeLessThan(6);
    expect(Math.abs(vy - 10)).toBeLessThan(6);
  }, 30000);

  it("with the switch, is against the POI alone", () => {
    const sim = moving({ dragAbsolute: true });
    sim.orderMove(sim.ship.x + 500, sim.ship.y, 0, 10);
    const spot = sim.clickPilot.spot!;
    expect(spot.vx).toBe(0);
    expect(spot.vy).toBe(10);
  });
});

describe("loose ore far out", () => {
  function open(extra: Partial<typeof DEFAULTS> = {}): Sim {
    return new Sim(1, {
      ...GAME_DEFAULTS,
      trafficRacers: 0,
      trafficFloaters: 0,
      pirates: 0,
      defenders: 0,
      rockCount: 0,
      rockInflow: 0,
      testDrones: 0,
      haulers: false,
      fieldOrbitRadius: 0,
      fieldRotationPeriod: 0,
      ...carrying(0, 0),
      ...extra,
    });
  }
  const flying = (x: number, y: number, vx: number) => ({ x, y, px: x, py: y, vx, vy: 0, kind: 0, amount: 1 });

  it("isn't pulled back toward the field", () => {
    const sim = open();
    const ore = flying(sim.field.x + sim.field.reach + 500, sim.field.y, 40);
    sim.ores.push(ore);
    run(sim, 5);
    expect(ore.vx).toBeCloseTo(40, 6);
  });

  it("is gone once it's far from every POI and ship", () => {
    const sim = open({ oreForgetDistance: 1000 });
    sim.ores.push(flying(sim.field.x + sim.field.reach + 900, sim.field.y, 0));
    sim.ores.push(flying(sim.field.x + sim.field.reach + 1500, sim.field.y, 0));
    run(sim, 0.1);
    expect(sim.ores.length).toBe(1);
    run(sim, 0.1);
    expect(sim.ores.length).toBe(1);
  });

  it("stays while a ship is near it", () => {
    const sim = open({ oreForgetDistance: 1000 });
    const x = sim.field.x + sim.field.reach + 5000;
    sim.ship.x = sim.ship.px = x + 300;
    sim.ship.y = sim.ship.py = sim.field.y;
    sim.ores.push(flying(x, sim.field.y, 0));
    run(sim, 0.1);
    expect(sim.ores.length).toBe(1);
  });
});
