import { describe, expect, it } from "vitest";
import { PARTS } from "./parts";
import { DEFAULTS } from "./tuning";
import { DOCK_OFFSET, MAX_HULL, type Poi, Sim, STATION_HALF, TICK } from "./sim";

/** Every part, weighing nothing, so tests of the thrusters themselves see plain numbers. */
function fitAll(sim: Sim): Sim {
  sim.tuning.partWeightScale = 0;
  for (const part of PARTS) sim.ship.parts.add(part.id);
  return sim;
}

/** No rocks, and the field stays put, so tests can reason in plain coordinates. */
function emptySim(): Sim {
  const sim = new Sim(1, {
    ...DEFAULTS,
    rockCount: 0,
    droneCount: 0,
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
      droneCount: 0,
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
    sim.ship.x = -4870;
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
    const sim = new Sim(1, { ...DEFAULTS, rockCount: 0, droneCount: 0, stationRotationPeriod: 0 });
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
    expect([...sim.ship.firing].sort()).toEqual(["thrusterMain", "thrusterRotateRight"]);
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
    const a = new Sim(7);
    const b = new Sim(7);
    expect(a.rocks.map((r) => [r.x, r.y, r.tier])).toEqual(b.rocks.map((r) => [r.x, r.y, r.tier]));
  });
});
