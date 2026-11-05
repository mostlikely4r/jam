import { describe, expect, it } from "vitest";
import { PARTS } from "./parts";
import { DEFAULTS } from "./tuning";
import { DOCK_OFFSET, MAX_HULL, Sim, TICK } from "./sim";

/** One drone that stays bare unless a test says otherwise. */
const SOLO = {
  ...DEFAULTS,
  floaterStart: false,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 1,
  droneParts: 0,
  droneLimit: 1,
  repairCost: 0,
  rebuildCost: 0,
};

function run(sim: Sim, seconds: number, each?: () => void): void {
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i++) {
    sim.step();
    each?.();
    sim.events.length = 0;
  }
}

function placeInDock(sim: Sim, ship: Sim["ship"]): void {
  ship.x = sim.station.x + DOCK_OFFSET;
  ship.y = sim.station.y;
  ship.px = ship.x;
  ship.py = ship.y;
}

describe("drone", () => {
  it("mines, hauls to the dock, sells, and goes back for more", () => {
    const sim = new Sim(1, { ...SOLO });
    const { ship } = sim.drones[0];
    const start = sim.rocks.length;
    run(sim, 420);
    expect(ship.trips).toBeGreaterThanOrEqual(2);
    expect(ship.credits).toBe(ship.trips * DEFAULTS.droneCargo * DEFAULTS.creditsPerOre);
    expect(sim.ship.credits).toBe(0);
    expect(sim.rocks.length).not.toBe(start);
  }, 30000);

  it("only fires what it has, whatever the player's panel says", () => {
    const sim = new Sim(1, {
      ...SOLO,
      retro: true,
      thrusterMain: false,
      thrusterRotateLeft: false,
      thrusterRotateRight: false,
    });
    const used = new Set<string>();
    run(sim, 60, () => {
      for (const thruster of sim.drones[0].ship.firing) used.add(thruster);
    });
    expect([...used].sort()).toEqual(["thrusterMain", "thrusterRotateLeft", "thrusterRotateRight"]);
  }, 30000);

  it("restarts in the dock without its cargo when wrecked, and that isn't a trip", () => {
    const sim = new Sim(1, { ...SOLO, safeImpactSpeed: 0, damagePerSpeed: 100 });
    const { ship } = sim.drones[0];
    ship.ore = 5;
    ship.vx = 400;
    sim.rocks.push(sim.makeRock(2, ship.x + 80, ship.y, 0, 0));
    let dockedWhenRebuilt = false;
    run(sim, 1, () => {
      if (ship.wrecks === 1 && ship.hull === MAX_HULL && ship.ore === 0) {
        dockedWhenRebuilt ||= sim.isDocked(ship);
      }
    });
    expect(ship.wrecks).toBe(1);
    expect(ship.trips).toBe(0);
    expect(dockedWhenRebuilt).toBe(true);
    expect(sim.ship.wrecks).toBe(0);
  });

  it("delivers what it has when the field runs out, then waits", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0 });
    const { ship } = sim.drones[0];
    ship.ore = 3;
    run(sim, 180);
    expect(ship.credits).toBe(3 * DEFAULTS.creditsPerOre);
    expect(sim.drones[0].task).toBe("idle");
  }, 30000);

  it("leaves the player's cargo and wrecks alone", () => {
    const sim = new Sim(1, { ...SOLO });
    sim.ship.ore = 2;
    run(sim, 30);
    expect(sim.ship.ore).toBeGreaterThanOrEqual(2);
    expect(sim.ship.wrecks).toBe(0);
  }, 30000);

  it("buys parts with its own earnings when it's empty in the dock, in order", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0, droneParts: 5 });
    const { ship } = sim.drones[0];
    placeInDock(sim, ship);
    ship.credits = 320;
    run(sim, 0.1);
    expect([...ship.parts]).toEqual(["spinStabilizer", "reverse"]);
    expect(ship.credits).toBe(20);
    expect(sim.ship.parts.size).toBe(0);
  });

  it("stops buying at the limit", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0, droneParts: 1 });
    const { ship } = sim.drones[0];
    placeInDock(sim, ship);
    ship.credits = 1000;
    run(sim, 0.1);
    expect([...ship.parts]).toEqual(["spinStabilizer"]);
  });

  it("sells a new drone only in the dock, for the price, and up to the limit", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0, testDrones: 0, droneLimit: 1 });
    sim.ship.credits = DEFAULTS.dronePrice;
    expect(sim.buyDrone(sim.ship)).toBeNull();
    placeInDock(sim, sim.ship);
    sim.ship.credits = DEFAULTS.dronePrice - 1;
    expect(sim.buyDrone(sim.ship)).toBeNull();
    sim.ship.credits = DEFAULTS.dronePrice * 2;
    const drone = sim.buyDrone(sim.ship);
    expect(drone).not.toBeNull();
    expect(sim.drones).toHaveLength(1);
    expect(sim.ship.credits).toBe(DEFAULTS.dronePrice);
    expect(sim.isDocked(drone!.ship)).toBe(true);
    expect(drone!.ship.credits).toBe(0);
    expect(drone!.ship.parts.size).toBe(0);
    expect(sim.buyDrone(sim.ship)).toBeNull();
  });

  it("buys a drone only after everything on its parts list", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0, droneParts: 1, droneLimit: 5 });
    const { ship } = sim.drones[0];
    placeInDock(sim, ship);
    ship.credits = DEFAULTS.dronePrice;
    sim.drones[0].update(sim);
    expect(ship.parts.has("spinStabilizer")).toBe(true);
    expect(sim.drones).toHaveLength(1);
    ship.credits = DEFAULTS.dronePrice;
    sim.drones[0].update(sim);
    expect(sim.drones).toHaveLength(2);
    expect(ship.credits).toBe(0);
  });

  it("flies a bought drone through the same loop", () => {
    const sim = new Sim(1, { ...SOLO, testDrones: 0, droneLimit: 1 });
    placeInDock(sim, sim.ship);
    sim.ship.credits = DEFAULTS.dronePrice;
    const drone = sim.buyDrone(sim.ship)!;
    run(sim, 420);
    expect(drone.ship.trips).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("stays at the drone limit on its own earnings", () => {
    const sim = new Sim(1, { ...SOLO, testDrones: 1, droneLimit: 2, dronePrice: 50 });
    run(sim, 420);
    expect(sim.drones).toHaveLength(2);
  }, 30000);

  it("repairs before buying anything", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0, droneParts: 5, repairCost: 2 });
    const { ship } = sim.drones[0];
    placeInDock(sim, ship);
    ship.hull = 50;
    ship.credits = 150;
    run(sim, 0.5);
    expect(sim.drones[0].task).toBe("repairing");
    expect(ship.parts.size).toBe(0);
    run(sim, 2);
    expect(ship.hull).toBe(MAX_HULL);
    expect(ship.credits).toBe(50);
    expect(ship.upkeep).toBe(100);
    expect(ship.parts.size).toBe(0);
  });

  it("heads home early on a low hull when it can pay", () => {
    const sim = new Sim(1, { ...SOLO, repairCost: 2 });
    const { ship } = sim.drones[0];
    ship.hull = 20;
    ship.ore = 1;
    sim.step();
    expect(sim.drones[0].task).toBe("to station");
  });

  it("keeps mining on a low hull when it has no way to pay", () => {
    const sim = new Sim(1, { ...SOLO, repairCost: 2 });
    const { ship } = sim.drones[0];
    ship.hull = 20;
    sim.step();
    expect(sim.drones[0].task).not.toBe("to station");
  });

  it("works off a rebuild's debt instead of stopping", () => {
    const sim = new Sim(1, { ...SOLO, repairCost: 2, rebuildCost: 300 });
    const { ship } = sim.drones[0];
    ship.credits = -100;
    run(sim, 420);
    expect(ship.trips).toBeGreaterThanOrEqual(2);
    expect(ship.credits).toBeGreaterThan(-100);
  }, 30000);

  describe("a drone the player bought", () => {
    function owned(extra: Partial<typeof SOLO> = {}): Sim {
      const sim = new Sim(1, { ...SOLO, testDrones: 0, droneLimit: 5, dronePrice: 500, ...extra });
      placeInDock(sim, sim.ship);
      sim.ship.credits = 500;
      expect(sim.buyDrone(sim.ship)).not.toBeNull();
      return sim;
    }

    it("earns for the player", () => {
      const sim = owned();
      const { ship } = sim.drones[0];
      expect(ship.owner).toBe(sim.ship);
      expect(sim.ship.credits).toBe(0);
      run(sim, 420);
      expect(ship.trips).toBeGreaterThanOrEqual(1);
      expect(ship.credits).toBe(0);
      expect(ship.earned).toBeGreaterThan(0);
      expect(sim.ship.credits).toBe(ship.earned);
    }, 30000);

    it("is repaired from the player's account", () => {
      const sim = owned({ repairCost: 2 });
      const { ship } = sim.drones[0];
      sim.ship.credits = 100;
      ship.hull = 90;
      run(sim, 1);
      expect(ship.hull).toBe(MAX_HULL);
      expect(sim.ship.credits).toBe(80);
      expect(ship.upkeep).toBe(20);
    });

    it("doesn't spend the player's money on parts or drones", () => {
      const sim = owned({ droneParts: 5 });
      sim.ship.credits = 5000;
      run(sim, 2);
      expect(sim.drones[0].ship.parts.size).toBe(0);
      expect(sim.drones.length).toBe(1);
      expect(sim.ship.credits).toBe(5000);
    });

    it("leaves other drones keeping their own money", () => {
      const sim = new Sim(1, { ...SOLO, droneLimit: 5, dronePrice: 500 });
      const rival = sim.drones[0].ship;
      placeInDock(sim, rival);
      rival.credits = 500;
      const bought = sim.buyDrone(rival)!;
      expect(rival.owner).toBeNull();
      expect(bought.ship.owner).toBeNull();
    });
  });

  describe("traffic", () => {
    it("starts as one of each ship, apart from drones", () => {
      const sim = new Sim(1, { ...DEFAULTS, pirates: 0, defenders: 0 });
      expect(sim.drones.length).toBe(0);
      expect(sim.traffic.map((pilot) => pilot.ship.model)).toEqual(["racer", "floater"]);
      expect(sim.traffic[1].ship.parts.has("gun2")).toBe(true);
    });

    it("never buys anything", () => {
      const sim = new Sim(1, { ...SOLO, testDrones: 0, trafficRacers: 1, rockCount: 0 });
      const { ship } = sim.traffic[0];
      placeInDock(sim, ship);
      ship.credits = 100000;
      run(sim, 2);
      expect(ship.parts.size).toBe(0);
      expect(sim.traffic.length).toBe(1);
      expect(sim.drones.length).toBe(0);
    });

    it("doesn't count against the player's drone limit", () => {
      const sim = new Sim(1, { ...SOLO, testDrones: 0, trafficRacers: 2, droneLimit: 1, rockCount: 0 });
      placeInDock(sim, sim.ship);
      sim.ship.credits = 1000;
      expect(sim.buyDrone(sim.ship)).not.toBeNull();
    });

    it.each(["racer", "floater"])("a %s completes the mining loop", (model) => {
      const sim = new Sim(1, {
        ...SOLO,
        testDrones: 0,
        trafficRacers: model === "racer" ? 1 : 0,
        trafficFloaters: model === "floater" ? 1 : 0,
        rockCount: 60,
        fieldRadius: 1200,
      });
      const { ship } = sim.traffic[0];
      run(sim, 600);
      expect(ship.trips).toBeGreaterThanOrEqual(1);
      expect(ship.credits).toBeGreaterThan(0);
    }, 60000);
  });

  it("goes back to a rock it gave up on when nothing else is left", () => {
    const sim = new Sim(1, { ...SOLO, rockCount: 0 });
    const drone = sim.drones[0];
    const rock = sim.makeRock(1, drone.ship.x + 400, drone.ship.y, 0, 0);
    sim.rocks.push(rock);
    (drone as unknown as { ignored: WeakSet<object> }).ignored.add(rock);
    run(sim, 30);
    expect(sim.rocks.includes(rock)).toBe(false);
  }, 30000);

  it.each([
    ["spin stabilizer", ["spinStabilizer"]],
    ["reverse", ["reverse"]],
    ["strafe", ["strafe"]],
    ["reverse and strafe", ["reverse", "strafe"]],
    ["everything", PARTS.map((part) => part.id)],
  ] as const)("still completes trips with %s", (_name, parts) => {
    const sim = new Sim(1, { ...SOLO });
    const { ship } = sim.drones[0];
    for (const part of parts) ship.parts.add(part);
    run(sim, 420);
    expect(ship.trips).toBeGreaterThanOrEqual(1);
    expect(ship.wrecks).toBe(0);
  }, 30000);

  it("uses reverse when it has it, and strafe when it has it", () => {
    const sim = new Sim(1, { ...SOLO });
    const { ship } = sim.drones[0];
    ship.parts.add("reverse");
    ship.parts.add("strafe");
    const used = new Set<string>();
    run(sim, 120, () => {
      for (const thruster of ship.firing) used.add(thruster);
    });
    expect(used.has("thrusterReverse")).toBe(true);
    expect(used.has("thrusterStrafeLeft") || used.has("thrusterStrafeRight")).toBe(true);
  }, 30000);
});

describe("pirate and defender", () => {
  function arena(extra: Partial<typeof SOLO> = {}): Sim {
    const sim = new Sim(1, {
      ...SOLO,
      testDrones: 0,
      rockCount: 0,
      rockInflow: 0,
      floaterStart: false,
      fieldOrbitRadius: 0,
      fieldRotationPeriod: 0,
      stationRotationPeriod: 0,
      orbitPeriod: 0,
      ...extra,
    });
    return sim;
  }

  /** Keeps a ship still at a spot, with nothing else going on. */
  function pin(ship: Sim["ship"], x: number, y: number): void {
    ship.x = x;
    ship.y = y;
    ship.px = x;
    ship.py = y;
    ship.vx = 0;
    ship.vy = 0;
  }

  it("the pirate starts away from the field, opposite the station, and the defender in the dock", () => {
    const sim = new Sim(1, { ...SOLO, testDrones: 0, pirates: 1, defenders: 1 });
    const pirate = sim.fighters[0].ship;
    const defender = sim.fighters[1].ship;
    const toPirate = Math.atan2(pirate.y - sim.field.y, pirate.x - sim.field.x);
    const toStation = Math.atan2(sim.station.y - sim.field.y, sim.station.x - sim.field.x);
    const apart = Math.abs(Math.atan2(Math.sin(toPirate - toStation), Math.cos(toPirate - toStation)));
    expect(apart).toBeCloseTo(Math.PI, 3);
    expect(Math.hypot(pirate.x - sim.field.x, pirate.y - sim.field.y)).toBeGreaterThan(
      DEFAULTS.fieldRadius,
    );
    expect(sim.isDocked(defender)).toBe(true);
    for (const { ship } of sim.fighters) {
      expect(ship.parts.has("reverse")).toBe(true);
      expect(ship.parts.has("strafe")).toBe(true);
    }
  });

  it("sees only inside its cone and range", () => {
    const sim = arena({ pirates: 1, defenders: 0 });
    const pilot = sim.fighters[0];
    const { x, y } = pilot.ship;
    pilot.ship.angle = 0;
    const at = (dx: number, dy: number) => {
      pin(sim.ship, x + dx, y + dy);
      return pilot.sees(sim, sim.ship);
    };
    expect(at(800, 0)).toBe(true);
    expect(at(800, 800 * Math.tan((20 * Math.PI) / 180))).toBe(true);
    expect(at(800, 800 * Math.tan((25 * Math.PI) / 180))).toBe(false);
    expect(at(-800, 0)).toBe(false);
    expect(at(DEFAULTS.visionRange + 50, 0)).toBe(false);
  });

  it("a pirate chases and kills what it sees, and the wreck is charged", () => {
    const sim = arena({ pirates: 1, defenders: 0, rebuildCost: 300 });
    const pilot = sim.fighters[0];
    const { ship } = pilot;
    ship.angle = 0;
    pin(sim.ship, ship.x + 900, ship.y);
    let tasks = new Set<string>();
    for (let i = 0; i < Math.round(30 / TICK) && sim.ship.wrecks === 0; i++) {
      sim.step();
      tasks.add(pilot.task);
    }
    expect(tasks.has("attacking")).toBe(true);
    expect(sim.ship.wrecks).toBe(1);
    expect(sim.ship.credits).toBe(-300);
  }, 30000);

  it("a pirate goes to the last place it saw a ship, then back to patrolling", () => {
    const sim = arena({ pirates: 1, defenders: 0, shotDamage: 0 });
    const pilot = sim.fighters[0];
    const { ship } = pilot;
    ship.angle = 0;
    const seenX = ship.x + 700;
    const seenY = ship.y;
    pin(sim.ship, seenX, seenY);
    run(sim, 0.5);
    expect(pilot.task).toBe("attacking");
    // Gone, somewhere behind it and out of range.
    pin(sim.ship, ship.x - 5000, ship.y);
    sim.step();
    expect(pilot.task).toBe("searching");
    let closest = Infinity;
    for (let i = 0; i < Math.round(30 / TICK) && pilot.task === "searching"; i++) {
      pin(sim.ship, ship.x - 5000, ship.y);
      sim.step();
      closest = Math.min(closest, Math.hypot(ship.x - seenX, ship.y - seenY));
    }
    expect(closest).toBeLessThan(150);
    expect(pilot.task).toBe("patrolling");
  }, 30000);

  it("a pirate leaves a docked ship alone, and shots can't hurt it there", () => {
    const sim = arena({ pirates: 1, defenders: 0 });
    const pilot = sim.fighters[0];
    placeInDock(sim, sim.ship);
    const dock = sim.dockPoint();
    pin(pilot.ship, dock.x - 900, dock.y + 900);
    pilot.ship.angle = Math.atan2(-900, 900);
    sim.step();
    expect(pilot.task).not.toBe("attacking");
    const before = sim.ship.hull;
    sim.shots.push({
      x: sim.ship.x - 40,
      y: sim.ship.y,
      px: sim.ship.x - 40,
      py: sim.ship.y,
      vx: 800,
      vy: 0,
      life: 1,
      precise: false,
      from: pilot.ship,
    });
    run(sim, 0.2);
    expect(sim.ship.hull).toBe(before);
  });

  it("a defender ignores everyone but pirates", () => {
    const sim = arena({ pirates: 0, defenders: 1 });
    const pilot = sim.fighters[0];
    pilot.ship.angle = 0;
    pin(pilot.ship, 0, 0);
    pin(sim.ship, 500, 0);
    run(sim, 2);
    expect(pilot.task).not.toBe("attacking");
    expect(sim.ship.damageTaken).toBe(0);
  }, 30000);

  it("a defender attacks a pirate it sees", () => {
    const sim = arena({ pirates: 1, defenders: 1 });
    const pirate = sim.fighters[0];
    const defender = sim.fighters[1];
    pin(defender.ship, 0, 0);
    defender.ship.angle = 0;
    pin(pirate.ship, 800, 0);
    pirate.ship.angle = 0;
    sim.step();
    expect(defender.task).toBe("attacking");
  });

  it("a defender with no target goes to a ship under fire", () => {
    const sim = arena({ pirates: 0, defenders: 1 });
    const defender = sim.fighters[0];
    pin(defender.ship, 0, 0);
    defender.ship.angle = Math.PI;
    pin(sim.ship, 1500, 0);
    sim.distress = { ship: sim.ship, age: 0 };
    run(sim, 0.1);
    expect(defender.task).toBe("responding");
    const start = Math.hypot(sim.ship.x - defender.ship.x, sim.ship.y - defender.ship.y);
    for (let i = 0; i < Math.round(8 / TICK); i++) {
      pin(sim.ship, 1500, 0);
      sim.step();
    }
    expect(Math.hypot(sim.ship.x - defender.ship.x, sim.ship.y - defender.ship.y)).toBeLessThan(start - 200);
  }, 30000);

  it("a pirate killed comes back at its start", () => {
    const sim = arena({ pirates: 1, defenders: 0 });
    const { ship } = sim.fighters[0];
    const startX = ship.x;
    const startY = ship.y;
    pin(ship, 0, 0);
    ship.hull = 1;
    sim.shots.push({
      x: -30,
      y: 0,
      px: -30,
      py: 0,
      vx: 800,
      vy: 0,
      life: 1,
      precise: false,
      from: sim.ship,
    });
    run(sim, 0.2);
    expect(ship.wrecks).toBe(1);
    expect(ship.hull).toBe(MAX_HULL);
    expect(Math.hypot(ship.x - startX, ship.y - startY)).toBeLessThan(100);
  });

  it("a rebuilt pirate forgets what it was doing", () => {
    const sim = arena({ pirates: 1, defenders: 0, shotDamage: 0 });
    const pilot = sim.fighters[0];
    pilot.ship.angle = 0;
    pin(sim.ship, pilot.ship.x + 700, pilot.ship.y);
    sim.step();
    expect(pilot.task).toBe("attacking");
    pin(sim.ship, pilot.ship.x - 5000, pilot.ship.y);
    pilot.ship.wrecks++;
    sim.step();
    expect(pilot.task).toBe("patrolling");
  });

  describe("the money loop", () => {
    const ore = (x: number, y: number) => ({ x, y, px: x, py: y, vx: 0, vy: 0, kind: 0 });

    function shoot(sim: Sim, ship: Sim["ship"], from: Sim["ship"]): void {
      sim.shots.push({
        x: ship.x - 30,
        y: ship.y,
        px: ship.x - 30,
        py: ship.y,
        vx: ship.vx + 800,
        vy: ship.vy,
        life: 1,
        precise: false,
        from,
      });
    }

    function traffic(extra: Partial<typeof SOLO> = {}): Sim {
      return arena({ trafficRacers: 1, rebuildCost: 300, ...extra });
    }

    function wreck(sim: Sim, ship: Sim["ship"]): void {
      pin(ship, 0, 0);
      ship.hull = 1;
      shoot(sim, ship, sim.ship);
      run(sim, 0.2);
    }

    it("a wreck's cargo stays where it died", () => {
      const sim = traffic();
      const { ship } = sim.traffic[0];
      ship.credits = 300;
      ship.ore = 4;
      wreck(sim, ship);
      expect(ship.ore).toBe(0);
      expect(sim.ores.length).toBe(4);
      for (const piece of sim.ores) expect(Math.hypot(piece.x, piece.y)).toBeLessThan(100);
    });

    it("traffic that can pay is rebuilt and charged", () => {
      const sim = traffic();
      const { ship } = sim.traffic[0];
      ship.credits = 500;
      wreck(sim, ship);
      expect(sim.traffic.length).toBe(1);
      expect(ship.credits).toBe(200);
      expect(ship.hull).toBe(MAX_HULL);
    });

    it("traffic that can't pay is gone for good, and early death means no ship", () => {
      const sim = traffic();
      wreck(sim, sim.traffic[0].ship);
      expect(sim.traffic.length).toBe(0);
      run(sim, 1);
    });

    it("a player's drone is gone if the player can't pay", () => {
      const sim = arena({ rebuildCost: 300, dronePrice: 100, droneLimit: 5 });
      placeInDock(sim, sim.ship);
      sim.ship.credits = 100;
      const drone = sim.buyDrone(sim.ship)!;
      wreck(sim, drone.ship);
      expect(sim.drones.length).toBe(0);
    });

    it("the player still rebuilds on credit", () => {
      const sim = arena({ rebuildCost: 300 });
      sim.ship.hull = 1;
      shoot(sim, sim.ship, sim.ship);
      sim.shots[0].from = sim.fighters[0]?.ship ?? ({} as Sim["ship"]);
      run(sim, 0.2);
      expect(sim.ship.wrecks).toBe(1);
      expect(sim.ship.credits).toBe(-300);
    });

    it("a pirate starts with money, and pays for its own rebuilds until it runs out", () => {
      const sim = arena({ pirates: 1, rebuildCost: 300, pirateStartCredits: 300 });
      const { ship } = sim.fighters[0];
      expect(ship.credits).toBe(300);
      wreck(sim, ship);
      expect(sim.fighters.length).toBe(1);
      expect(ship.credits).toBe(0);
      wreck(sim, ship);
      expect(sim.fighters.length).toBe(0);
    });

    it("a pirate collects loose ore with no target, sells it at its base, and keeps the money", () => {
      const sim = arena({ pirates: 1, pirateStartCredits: 0 });
      const pilot = sim.fighters[0];
      const { ship } = pilot;
      sim.ores.push(ore(ship.x + 300, ship.y));
      run(sim, 1);
      expect(pilot.task).toBe("gathering");
      let ticks = 0;
      while (ship.credits === 0 && ticks < Math.round(120 / TICK)) {
        sim.step();
        ticks++;
      }
      expect(ship.credits).toBe(DEFAULTS.creditsPerOre);
      expect(sim.stationOre).toBe(0);
      expect(sim.stationAccount.credits).toBe(DEFAULTS.stationStartCredits);
    }, 30000);

    it("a defender collects ore for the station's balance, and the station keeps the ore", () => {
      const sim = arena({ defenders: 1, stationStartCredits: 0 });
      const { ship } = sim.fighters[0];
      sim.ores.push(ore(ship.x + 800, ship.y + 800));
      let ticks = 0;
      while (sim.stationOre === 0 && ticks < Math.round(120 / TICK)) {
        sim.step();
        ticks++;
      }
      expect(sim.stationOre).toBe(1);
      expect(sim.stationAccount.credits).toBe(DEFAULTS.creditsPerOre);
      expect(ship.credits).toBe(0);
    }, 30000);

    it("traffic selling ore adds to the station's ore but not its balance", () => {
      const sim = traffic();
      const { ship } = sim.traffic[0];
      placeInDock(sim, ship);
      ship.ore = 3;
      run(sim, 1);
      expect(sim.stationOre).toBe(3);
      expect(ship.credits).toBe(3 * DEFAULTS.creditsPerOre);
      expect(sim.stationAccount.credits).toBe(DEFAULTS.stationStartCredits);
    });

    it("the station buys a defender when it can afford one, up to its limit", () => {
      const sim = arena({ defenders: 1, stationStartCredits: 0, defenderPrice: 500, defenderLimit: 2 });
      sim.stationAccount.credits = 1500;
      sim.step();
      expect(sim.fighters.length).toBe(2);
      expect(sim.stationAccount.credits).toBe(1000);
      sim.step();
      expect(sim.fighters.length).toBe(2);
    });

    it("a defender is rebuilt from the station's balance, or lost", () => {
      const sim = arena({ defenders: 1, rebuildCost: 300, stationStartCredits: 300, defenderPrice: 5000 });
      const { ship } = sim.fighters[0];
      wreck(sim, ship);
      expect(sim.fighters.length).toBe(1);
      expect(sim.stationAccount.credits).toBe(0);
      wreck(sim, ship);
      expect(sim.fighters.length).toBe(0);
    });

    it("a kill for good leaves its cargo and the pirate carries on", () => {
      const sim = arena({ pirates: 1, trafficRacers: 1, rebuildCost: 300 });
      const pirate = sim.fighters[0].ship;
      const prey = sim.traffic[0].ship;
      pirate.angle = 0;
      pin(prey, pirate.x + 500, pirate.y);
      prey.ore = 2;
      for (let i = 0; i < Math.round(30 / TICK) && sim.traffic.length > 0; i++) sim.step();
      expect(sim.traffic.length).toBe(0);
      run(sim, 2);
      expect(sim.ores.length + pirate.ore + pirate.earned / DEFAULTS.creditsPerOre).toBe(2);
    }, 30000);
  });

  it("shots don't hit whoever fired them", () => {
    const sim = arena();
    sim.controls.fire = true;
    run(sim, 1);
    expect(sim.ship.damageTaken).toBe(0);
  });
});
