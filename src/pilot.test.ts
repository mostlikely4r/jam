import { describe, expect, it } from "vitest";
import { APPROACH, BOUGHT, HEADING_BACK, OUTBOUND, THANKS } from "./chatter";
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
  stationStartParts: 100000,
  stationReserveParts: Infinity,
  detectSeconds: 0,
  haulers: false,
  stationUnlocks: false,
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
    let breaks = 0;
    run(sim, 420, () => {
      breaks += sim.events.filter((event) => event.type === "break").length;
    });
    expect(ship.trips).toBeGreaterThanOrEqual(2);
    expect(ship.credits).toBe(ship.earned);
    expect(ship.earned).toBeGreaterThanOrEqual(ship.trips * DEFAULTS.droneCargo * DEFAULTS.creditsPerOre);
    expect(sim.ship.credits).toBe(0);
    expect(breaks).toBeGreaterThan(0);
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
      for (const thruster of sim.drones[0].ship.firing.keys()) used.add(thruster);
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
    it("buys upgrades from the player's money, leaving the player a buffer", () => {
      const sim = new Sim(1, { ...SOLO, testDrones: 0, rockCount: 0, droneBuffer: 500, dronePrice: 500 });
      placeInDock(sim, sim.ship);
      sim.ship.credits = 500;
      const drone = sim.buyDrone(sim.ship)!;
      placeInDock(sim, drone.ship);
      sim.ship.credits = 500 + sim.partPrice("reverse") - 1;
      run(sim, 1, () => placeInDock(sim, drone.ship));
      expect(drone.ship.parts.size).toBe(0);
      sim.ship.credits = 500 + sim.partPrice("reverse");
      run(sim, 1, () => placeInDock(sim, drone.ship));
      expect(drone.ship.parts.has("reverse")).toBe(true);
      expect(sim.ship.credits).toBe(500);
      expect(drone.ship.credits).toBe(0);
    });

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

    it("never buys drones, and never takes the player below the buffer", () => {
      const sim = owned({ droneParts: 5, droneBuffer: 500 });
      sim.ship.credits = 5000;
      run(sim, 2);
      expect(sim.drones.length).toBe(1);
      expect(sim.ship.credits).toBeGreaterThanOrEqual(500);
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

    it("buys the upgrades it can use, never drones, and keeps a buffer", () => {
      const sim = new Sim(1, { ...SOLO, testDrones: 0, trafficRacers: 1, rockCount: 0, trafficBuffer: 400 });
      const { ship } = sim.traffic[0];
      placeInDock(sim, ship);
      ship.credits = sim.partPrice("reverse") + 399;
      run(sim, 1, () => placeInDock(sim, ship));
      expect(ship.parts.size).toBe(0);
      ship.credits = 100000;
      run(sim, 2, () => placeInDock(sim, ship));
      expect([...ship.parts].sort()).toEqual(["bay", "reverse", "spinStabilizer", "strafe"]);
      expect(sim.traffic.length).toBe(1);
      expect(sim.drones.length).toBe(0);
    });

    it("new-ship traffic buys a tractor and a turret first", () => {
      const sim = new Sim(1, { ...SOLO, testDrones: 0, trafficFloaters: 1, rockCount: 0 });
      const { ship } = sim.traffic[0];
      placeInDock(sim, ship);
      ship.credits = sim.partPrice("tractor") + sim.partPrice("turret") + 400;
      run(sim, 2, () => placeInDock(sim, ship));
      expect(ship.parts.has("tractor")).toBe(true);
      expect(ship.parts.has("turret")).toBe(true);
      expect(ship.parts.has("reverse")).toBe(false);
    });

    it("traffic with a turret mines with it, aiming without turning", () => {
      const sim = new Sim(1, {
        ...SOLO,
        testDrones: 0,
        trafficFloaters: 1,
        rockCount: 60,
        fieldRadius: 1200,
        trafficBuffer: 1e9,
      });
      const pilot = sim.traffic[0];
      pilot.ship.parts.add("turret");
      let turned = 0;
      run(sim, 240, () => {
        if (pilot.task === "shooting") turned = Math.max(turned, Math.abs(pilot.ship.turretAngle));
      });
      expect(pilot.ship.trips + pilot.ship.ore).toBeGreaterThan(0);
      expect(turned).toBeGreaterThan(0.3);
    }, 60000);

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
    ["everything", PARTS.filter((part) => !part.cargo).map((part) => part.id)],
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
      for (const thruster of ship.firing.keys()) used.add(thruster);
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
    // Pirates go for cargo, so the ship it should go after carries some.
    sim.ship.ore = 5;
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
    // Pirates go for cargo, so the ship it should go after carries some.
    sim.ship.ore = 5;
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
    // Pirates go for cargo, so the ship it should go after carries some.
    sim.ship.ore = 5;
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

  describe("sight lines and fleeing", () => {
    function addRock(sim: Sim, x: number, y: number, radius: number): void {
      sim.rocks.push({
        x,
        y,
        px: x,
        py: y,
        vx: 0,
        vy: 0,
        arriving: false,
        tier: 0,
        radius,
        hp: 1000,
        angle: 0,
        prevAngle: 0,
        spin: 0,
        shape: [1],
      });
    }

    it("a rock hides a ship from a pirate, unless the switch is off", () => {
      const sim = arena({ pirates: 1, defenders: 0 });
      const pilot = sim.fighters[0];
      const { x, y } = pilot.ship;
      pilot.ship.angle = 0;
      pin(sim.ship, x + 900, y);
      expect(pilot.sees(sim, sim.ship)).toBe(true);
      addRock(sim, x + 450, y, 60);
      expect(pilot.sees(sim, sim.ship)).toBe(false);
      pin(sim.ship, x + 900, y + 300);
      expect(pilot.sees(sim, sim.ship)).toBe(true);
      pin(sim.ship, x + 900, y);
      sim.tuning.sightLines = false;
      expect(pilot.sees(sim, sim.ship)).toBe(true);
    });

    it("the player's line of sight follows the same rules as a ship's", () => {
      const sim = arena({ pirates: 1, defenders: 0 });
      const { ship } = sim.fighters[0];
      pin(sim.ship, ship.x + 900, ship.y);
      expect(sim.playerSees(ship)).toBe(true);
      addRock(sim, ship.x + 450, ship.y, 60);
      expect(sim.playerSees(ship)).toBe(false);
      sim.rocks.length = 0;
      pin(sim.ship, ship.x + DEFAULTS.visionRange + 50, ship.y);
      expect(sim.playerSees(ship)).toBe(false);
    });

    it("a pirate has to keep a ship in its cone for a moment to spot it", () => {
      const sim = arena({ pirates: 1, defenders: 0, shotDamage: 0, detectSeconds: 1 });
      // Pirates go for cargo, so the ship it should go after carries some.
      sim.ship.ore = 5;
      const pilot = sim.fighters[0];
      const hold = () => {
        pilot.ship.angle = 0;
        pilot.ship.spin = 0;
        pin(pilot.ship, 0, 0);
        pin(sim.ship, 900, 0);
      };
      run(sim, 0.5, hold);
      expect(pilot.task).not.toBe("attacking");
      expect(pilot.spotted(sim, sim.ship)).toBeGreaterThan(0.4);
      expect(pilot.spotted(sim, sim.ship)).toBeLessThan(0.6);
      run(sim, 0.6, hold);
      expect(pilot.task).toBe("attacking");
      expect(pilot.spotted(sim, sim.ship)).toBe(1);
    });

    it("spotting fades again if the ship gets out of the cone in time", () => {
      const sim = arena({ pirates: 1, defenders: 0, shotDamage: 0, detectSeconds: 1 });
      const pilot = sim.fighters[0];
      const hold = (dx: number) => () => {
        pilot.ship.angle = 0;
        pilot.ship.spin = 0;
        pin(pilot.ship, 0, 0);
        pin(sim.ship, dx, 0);
      };
      run(sim, 0.5, hold(900));
      run(sim, 0.25, hold(-900));
      expect(pilot.spotted(sim, sim.ship)).toBeLessThan(0.4);
      expect(pilot.task).not.toBe("attacking");
    });

    it("a pirate stops attacking a ship that goes behind a rock, and goes to look for it", () => {
      const sim = arena({ pirates: 1, defenders: 0, shotDamage: 0 });
      // Pirates go for cargo, so the ship it should go after carries some.
      sim.ship.ore = 5;
      const pilot = sim.fighters[0];
      const { x, y } = pilot.ship;
      pilot.ship.angle = 0;
      pin(sim.ship, x + 900, y);
      run(sim, 0.1);
      expect(pilot.task).toBe("attacking");
      addRock(sim, x + 500, y, 150);
      run(sim, 0.1);
      expect(pilot.task).toBe("searching");
    });

    /** Traffic beside the station, with a pirate behind its tail and in range. */
    function chased(extra: Partial<typeof SOLO> = {}) {
      const sim = arena({ pirates: 1, trafficRacers: 1, shotDamage: 0, ...extra });
      const pirate = sim.fighters[0].ship;
      const pilot = sim.traffic[0] ?? sim.drones[0];
      const startX = sim.station.x + 700;
      const startY = sim.station.y;
      pin(pilot.ship, startX, startY);
      pilot.ship.angle = 0;
      // A pirate is only a danger to a ship with cargo.
      pilot.ship.ore = 5;
      pin(pirate, startX - 800, startY - 800);
      return { sim, pilot, pirate, startX, startY };
    }

    it("traffic runs for the station on seeing a pirate behind it, waits, and goes back out", () => {
      const { sim, pilot, pirate } = chased();
      run(sim, 0.1);
      expect(pilot.task).toBe("fleeing");
      const tasks = new Set<string>();
      // Out of view from here on, and it keeps running anyway.
      run(sim, 90, () => {
        pin(pirate, sim.station.x + 20000, sim.station.y);
        tasks.add(pilot.task);
        if (pilot.task === "sheltering") expect(sim.isDocked(pilot.ship)).toBe(true);
      });
      expect(tasks.has("sheltering")).toBe(true);
      expect(pilot.task).not.toBe("fleeing");
      expect(pilot.task).not.toBe("sheltering");
    }, 30000);

    it("traffic stays in the dock while a pirate is in view", () => {
      const { sim, pilot, pirate } = chased();
      placeInDock(sim, pilot.ship);
      // Marked, so unloading its cargo in the dock doesn't make it safe.
      pilot.ship.marked = true;
      run(sim, 40, () => pin(pirate, sim.station.x + 1000, sim.station.y));
      expect(pilot.task).toBe("sheltering");
      expect(sim.isDocked(pilot.ship)).toBe(true);
    }, 30000);

    it("traffic doesn't run from a pirate behind a rock", () => {
      const { sim, pilot, startX, startY } = chased();
      addRock(sim, startX - 400, startY - 400, 150);
      run(sim, 0.1);
      expect(pilot.task).not.toBe("fleeing");
    });

    it("traffic doesn't run with the switch off", () => {
      const { sim, pilot } = chased({ trafficFlees: false });
      run(sim, 0.1);
      expect(pilot.task).not.toBe("fleeing");
    });

    it("the player's drones don't run", () => {
      const { sim, pilot } = chased({ trafficRacers: 0, testDrones: 1 });
      expect(sim.drones).toContain(pilot);
      run(sim, 0.1);
      expect(pilot.task).not.toBe("fleeing");
    });
  });

  describe("pirate base trade", () => {
    function baseWorld(extra: Partial<typeof SOLO> = {}): Sim {
      return arena({ pirates: 1, pirateLimit: 1, chatter: false, blackMarketFirst: 10000, ...extra });
    }

    it("sells a full hold at the deposit's price, only to an empty hold close by", () => {
      const sim = baseWorld({ pirateStartOre: 100, pirateStartCredits: 0 });
      const base = sim.pirateBase!;
      sim.ship.credits = 1000;
      pin(sim.ship, base.x + 3000, base.y);
      expect(sim.buyFromPirateBase(sim.ship)).toBe(0);
      pin(sim.ship, base.x + 300, base.y);
      sim.ship.ore = 1;
      expect(sim.buyFromPirateBase(sim.ship)).toBe(0);
      sim.ship.ore = 0;
      const space = sim.cargoSpace(sim.ship);
      expect(sim.buyFromPirateBase(sim.ship)).toBe(space);
      expect(sim.ship.credits).toBe(1000 - space * DEFAULTS.depositSells);
      expect(sim.pirateCredits).toBe(space * DEFAULTS.depositSells);
      expect(sim.pirateOre).toBe(100 - space);
    });

    it("the black market comes in, buys what's left, and leaves the way it came", () => {
      const sim = baseWorld({ pirateStartOre: 40, pirateStartCredits: 0, blackMarketFirst: 1, blackMarketPays: 5 });
      const stages = new Set<string>();
      for (let i = 0; i < Math.round(200 / TICK); i++) {
        sim.step();
        sim.events.length = 0;
        if (sim.blackMarket) stages.add(sim.blackMarket.stage);
        else if (stages.has("leaving")) break;
      }
      expect([...stages]).toEqual(["arriving", "berthed", "leaving"]);
      expect(sim.blackMarket).toBeNull();
      expect(sim.pirateOre).toBe(0);
      expect(sim.pirateCredits).toBe(200);
    }, 30000);

    it("pirates at home buy parts from it, then a new hull once all are fitted, up to the most", () => {
      const sim = baseWorld({ pirateStartCredits: 100000, blackMarketFirst: 1, pirateCapMax: 2 });
      const first = sim.fighters[0].ship;
      const base = sim.pirateBase!;
      for (let i = 0; i < Math.round(200 / TICK); i++) {
        sim.step();
        sim.events.length = 0;
        for (const pilot of sim.fighters) pin(pilot.ship, base.x, base.y);
      }
      expect(sim.pirateWishlist(first)).toEqual([]);
      expect(sim.pirateCap).toBe(2);
      expect(sim.fighters.filter((pilot) => pilot.ship.faction === "pirate").length).toBe(2);
    }, 30000);
  });

  describe("aggro", () => {
    type Ship = Sim["ship"];
    /** A shot just behind `target`, about to fly into it, fired by `from`. */
    function hit(sim: Sim, from: Ship, target: Ship): void {
      const x = target.x - 30;
      sim.shots.push({ x, y: target.y, px: x, py: target.y, vx: 800, vy: 0, life: 1, precise: false, from });
    }
    /** Steps the world, keeping what was said. */
    function listen(sim: Sim, seconds: number, each?: () => void): string[] {
      const said: string[] = [];
      for (let i = 0; i < Math.round(seconds / TICK); i++) {
        sim.step();
        each?.();
        for (const event of sim.events) if (event.type === "chatter") said.push(event.text);
        sim.events.length = 0;
      }
      return said;
    }
    /** A pirate with the player close in front of it. */
    function facing(extra: Partial<typeof SOLO> = {}) {
      const sim = arena({ pirates: 1, defenders: 0, shotDamage: 0, detectSeconds: 0, ...extra });
      const pilot = sim.fighters[0];
      const hold = () => {
        pilot.ship.angle = 0;
        pilot.ship.spin = 0;
        pin(pilot.ship, 0, 0);
        pin(sim.ship, 700, 0);
      };
      return { sim, pilot, hold };
    }

    it("a pirate leaves an empty ship alone, and goes for one with cargo", () => {
      const empty = facing();
      run(empty.sim, 0.5, empty.hold);
      expect(empty.pilot.task).not.toBe("attacking");
      const loaded = facing();
      loaded.sim.ship.ore = 5;
      run(loaded.sim, 0.5, loaded.hold);
      expect(loaded.pilot.task).toBe("attacking");
    });

    it("one hit on any pirate marks you with all of them, empty hold or not, until you die", () => {
      const { sim, pilot, hold } = facing({ pirates: 2 });
      const other = sim.fighters[1].ship;
      const each = () => {
        hold();
        pin(other, -4000, 0);
      };
      each();
      hit(sim, sim.ship, other);
      const said = listen(sim, 0.5, each);
      expect(sim.ship.marked).toBe(true);
      expect(said).toContain("You'll regret that.");
      // The pirate that wasn't hit goes for the empty ship too.
      expect(pilot.task).toBe("attacking");
      sim.tuning.shotDamage = 500;
      hit(sim, pilot.ship, sim.ship);
      listen(sim, 0.1, each);
      expect(sim.ship.wrecks).toBe(1);
      expect(sim.ship.marked).toBe(false);
    });

    it("traffic that hits a pirate is marked too, and empty traffic doesn't run from pirates otherwise", () => {
      const sim = arena({ pirates: 1, trafficRacers: 1, shotDamage: 0 });
      const pirate = sim.fighters[0].ship;
      const traffic = sim.traffic[0].ship;
      expect(sim.threatens(pirate, traffic)).toBe(false);
      traffic.ore = 1;
      expect(sim.threatens(pirate, traffic)).toBe(true);
      traffic.ore = 0;
      // Out in the open, clear of the station.
      pin(pirate, -4000, 0);
      pin(traffic, -3400, 0);
      hit(sim, traffic, pirate);
      run(sim, 0.1);
      expect(traffic.marked).toBe(true);
      expect(sim.threatens(pirate, traffic)).toBe(true);
    });

    it("a few hits close together get you reported once the victim reaches the station", () => {
      const sim = arena({ trafficRacers: 1, defenders: 1, shotDamage: 0 });
      const pilot = sim.traffic[0];
      const dock = sim.dockPoint();
      pin(pilot.ship, dock.x + 1200, dock.y);
      pin(sim.ship, dock.x + 5000, dock.y);
      let said: string[] = [];
      for (let i = 0; i < 3; i++) {
        hit(sim, sim.ship, pilot.ship);
        said = said.concat(listen(sim, 0.2));
      }
      expect(said).toContain("Stop shooting at me! I'm reporting you.");
      expect(pilot.task).toBe("fleeing");
      expect(sim.ship.wanted).toBe(false);
      for (let i = 0; i < 60 && !sim.ship.wanted; i++) said = said.concat(listen(sim, 1, () => pin(sim.ship, dock.x + 5000, dock.y)));
      expect(sim.ship.wanted).toBe(true);
      expect(said.some((text) => text.includes("You're wanted"))).toBe(true);
      // Traffic now flees you, and the defender wants you, but the dock still lets you in.
      expect(sim.threatens(sim.ship, pilot.ship)).toBe(true);
    }, 30000);

    it("a victim near a defender reports to it on the spot", () => {
      const sim = arena({ trafficRacers: 1, defenders: 1, shotDamage: 0 });
      const pilot = sim.traffic[0];
      const defender = sim.fighters[0].ship;
      const spot = () => {
        pin(sim.ship, -9000, 3000);
        pin(defender, -6600, 0);
      };
      pin(pilot.ship, -6000, 0);
      spot();
      let said: string[] = [];
      for (let i = 0; i < 3; i++) {
        hit(sim, sim.ship, pilot.ship);
        said = said.concat(listen(sim, 0.2, spot));
      }
      expect(sim.ship.wanted).toBe(true);
      expect(said.some((text) => text.includes("You're wanted"))).toBe(true);
      expect(said).not.toContain("Stop shooting at me! I'm reporting you.");
    });

    it("hits spread out are forgotten", () => {
      const sim = arena({ trafficRacers: 1, shotDamage: 0, grudgeFadeSeconds: 10 });
      const pilot = sim.traffic[0];
      for (let i = 0; i < 4; i++) {
        hit(sim, sim.ship, pilot.ship);
        listen(sim, 12);
        expect(pilot.task).not.toBe("fleeing");
      }
      expect(sim.ship.wanted).toBe(false);
    }, 30000);

    it("the law and your own drones don't report", () => {
      const sim = arena({ testDrones: 1, defenders: 1, shotDamage: 0 });
      const drone = sim.drones[0];
      drone.ship.owner = sim.ship;
      const defender = sim.fighters[0].ship;
      sim.ship.wanted = true;
      for (let i = 0; i < 5; i++) {
        hit(sim, sim.ship, drone.ship);
        hit(sim, defender, sim.ship);
        listen(sim, 0.2);
      }
      expect(drone.task).not.toBe("fleeing");
      expect(defender.wanted).toBe(false);
      sim.ship.wanted = false;
      // Out of the dock, where shots can reach it.
      for (let i = 0; i < 3; i++) {
        pin(defender, 0, 0);
        hit(sim, sim.ship, defender);
        listen(sim, 0.2);
      }
      // The defender is the station's own: its word is enough.
      expect(sim.ship.wanted).toBe(true);
    });
  });

  describe("radio chatter", () => {
    type Line = Extract<Sim["events"][number], { type: "chatter" }>;
    function listen(sim: Sim, seconds: number, each?: () => void): Line[] {
      const heard: Line[] = [];
      run(sim, seconds, () => {
        each?.();
        for (const event of sim.events) if (event.type === "chatter") heard.push(event);
      });
      return heard;
    }
    const looseOre = (sim: Sim, x: number, y: number) => ({
      x,
      y,
      px: x,
      py: y,
      vx: 0,
      vy: 0,
      kind: 0,
      amount: 1,
      from: sim.ship,
    });

    it("traffic thanks the player for ore the player broke loose far away, once in a while", () => {
      const sim = arena({ trafficRacers: 1 });
      const { ship } = sim.traffic[0];
      pin(sim.ship, ship.x + 3000, ship.y);
      sim.ores.push(looseOre(sim, ship.x, ship.y));
      const first = listen(sim, 0.1);
      expect(first.some((line) => line.speaker === ship && THANKS.includes(line.text))).toBe(true);
      sim.ores.push(looseOre(sim, ship.x, ship.y));
      const second = listen(sim, 0.1);
      expect(second.filter((line) => THANKS.includes(line.text))).toEqual([]);
    });

    it("traffic leaves ore near the player alone unless it broke it loose itself; your drones take it", () => {
      const cases = [
        { name: "near you, not its own", near: true, own: false, drone: false, taken: false },
        { name: "near you, its own", near: true, own: true, drone: false, taken: true },
        { name: "far from you", near: false, own: false, drone: false, taken: true },
        { name: "near you, your drone", near: true, own: false, drone: true, taken: true },
      ];
      for (const test of cases) {
        const sim = test.drone ? arena({ testDrones: 1 }) : arena({ trafficRacers: 1 });
        const ship = test.drone ? sim.drones[0].ship : sim.traffic[0].ship;
        if (test.drone) ship.owner = sim.ship;
        const ore = { ...looseOre(sim, ship.x + 300, ship.y), from: test.own ? ship : null };
        sim.ores.push(ore);
        const playerAt = () => pin(sim.ship, ore.x, ore.y + (test.near ? 120 : 3000));
        playerAt();
        run(sim, 15, () => {
          playerAt();
          return false;
        });
        expect(!sim.ores.includes(ore), test.name).toBe(test.taken);
      }
    });

    it("no thanks for ore picked up right next to the player, or ore nobody shot", () => {
      const sim = arena({ trafficRacers: 1 });
      const { ship } = sim.traffic[0];
      pin(sim.ship, ship.x + 100, ship.y);
      sim.ores.push(looseOre(sim, ship.x, ship.y));
      sim.ores.push({ ...looseOre(sim, ship.x, ship.y), from: null });
      expect(listen(sim, 0.1).filter((line) => THANKS.includes(line.text))).toEqual([]);
    });

    it("a ship a pirate shoots calls a mayday, heard from anywhere", () => {
      const sim = arena({ trafficRacers: 1, pirates: 1, shotDamage: 1 });
      const { ship } = sim.traffic[0];
      const pirate = sim.fighters[0].ship;
      pin(ship, 0, 0);
      pin(sim.ship, 50000, 0);
      sim.shots.push({ x: -30, y: 0, px: -30, py: 0, vx: 800, vy: 0, life: 1, precise: false, from: pirate });
      const heard = listen(sim, 0.2, () => pin(ship, 0, 0));
      const mayday = heard.find((line) => line.mayday);
      expect(mayday?.speaker).toBe(ship);
      expect(sim.hears(mayday!)).toBe(true);
      expect(sim.hears({ ...mayday!, mayday: false })).toBe(false);
    });

    it("traffic turning for home says so, then asks for the dock once close and is cleared", () => {
      const sim = arena({ trafficRacers: 1 });
      const pilot = sim.traffic[0];
      const name = sim.chatter.nameOf(sim, pilot.ship);
      const dock = sim.dockPoint();
      pin(pilot.ship, dock.x + 2500, dock.y);
      pilot.ship.ore = DEFAULTS.droneCargo;
      const far = listen(sim, 3, () => pin(pilot.ship, dock.x + 2500, dock.y));
      expect(far.some((line) => line.speaker === pilot.ship && HEADING_BACK.includes(line.text))).toBe(true);
      expect(far.some((line) => line.speaker === null && line.text.includes(name))).toBe(false);
      const near = listen(sim, 3, () => pin(pilot.ship, dock.x + 600, dock.y));
      expect(near.some((line) => line.speaker === pilot.ship && APPROACH.includes(line.text))).toBe(true);
      expect(near.some((line) => line.speaker === null && line.text === `Roger, ${name}, cleared to dock.`)).toBe(true);
    });

    it("traffic leaving the station for the field says so, and the station sees it off", () => {
      const sim = arena({ trafficRacers: 1 });
      const pilot = sim.traffic[0];
      const name = sim.chatter.nameOf(sim, pilot.ship);
      const dock = sim.dockPoint();
      pin(pilot.ship, dock.x, dock.y);
      pilot.ship.ore = DEFAULTS.droneCargo;
      const heard = listen(sim, 60);
      const out = heard.findIndex((line) => line.speaker === pilot.ship && OUTBOUND.includes(line.text));
      expect(out).toBeGreaterThanOrEqual(0);
      expect(heard.slice(out).some((line) => line.speaker === null && line.text.includes(name))).toBe(true);
    });

    it("traffic buying a part says what it bought, and the station answers", () => {
      const sim = arena({ trafficRacers: 1 });
      const pilot = sim.traffic[0];
      const dock = sim.dockPoint();
      pin(pilot.ship, dock.x, dock.y);
      pilot.ship.credits = 100000;
      expect(sim.buyPart(pilot.ship, "reverse")).toBe(true);
      const heard = listen(sim, 2);
      const said = heard.find((line) => line.speaker === pilot.ship);
      expect(said?.text).toContain("reverse thruster");
      expect(BOUGHT.some((text) => said!.text === text.replace("{part}", "reverse thruster"))).toBe(true);
      expect(heard.some((line) => line.speaker === null && line.text.includes(sim.chatter.nameOf(sim, pilot.ship)))).toBe(true);
    });

    it("station news goes out to everyone, other station talk only nearby", () => {
      const sim = arena({});
      pin(sim.ship, sim.station.x + 50000, sim.station.y);
      sim.chatter.depositBuilt(sim);
      const news = sim.events.find((event) => event.type === "chatter");
      expect(news && sim.hears(news)).toBe(true);
      expect(news && sim.hears({ ...news, broadcast: false })).toBe(false);
    });

    it("says nothing with the switch off", () => {
      const sim = arena({ trafficRacers: 1, chatter: false });
      const pilot = sim.traffic[0];
      pin(pilot.ship, sim.station.x + 2500, sim.station.y);
      pilot.ship.ore = DEFAULTS.droneCargo;
      expect(listen(sim, 3)).toEqual([]);
    });
  });

  describe("shop unlocks", () => {
    function shopWorld(extra: Partial<typeof SOLO> = {}): Sim {
      const sim = arena({ stationUnlocks: true, haulers: false, stationStartCredits: 0, stationCashBuffer: 300, blueprintScale: 0.75, ...extra });
      placeInDock(sim, sim.ship);
      return sim;
    }

    it("the first tier is always open, and the rest need a blueprint", () => {
      const sim = shopWorld();
      sim.ship.credits = 100000;
      expect(sim.unlocked("spinStabilizer")).toBe(true);
      expect(sim.unlocked("drone")).toBe(false);
      expect(sim.buyPart(sim.ship, "reverse")).toBe(false);
      expect(sim.buyDrone(sim.ship)).toBeNull();
    });

    it("the station buys the next blueprint only from credits beyond its buffer, and announces it", () => {
      const sim = shopWorld();
      const first = sim.blueprintQueue()[0];
      expect(first).toBe("reverse");
      const price = sim.blueprintPrice(first);
      sim.stationAccount.credits = 300 + price - 1;
      sim.step();
      expect(sim.unlocked(first)).toBe(false);
      sim.stationAccount.credits = 300 + price;
      sim.step();
      expect(sim.unlocked(first)).toBe(true);
      expect(sim.stationAccount.credits).toBe(300);
      expect(sim.events.some((event) => event.type === "chatter" && event.text.includes("reverse thruster"))).toBe(true);
    });

    it("goes through the tiers in order, cheapest first", () => {
      const sim = shopWorld();
      const queue = sim.blueprintQueue();
      const tiers = queue.map((id) => PARTS.find((part) => part.id === id)?.tier ?? (id === "drone" ? 2 : 3));
      expect(tiers).toEqual([...tiers].sort());
      expect(queue).toContain("drone");
      expect(queue.slice(-2)).toEqual(["deposit", "stationGuards"]);
    });

    it("paying toward a blueprint moves it to the front, and paying it all stocks it", () => {
      const sim = shopWorld();
      const price = sim.blueprintPrice("tractor");
      sim.ship.credits = 100;
      expect(sim.fundBlueprint(sim.ship, "tractor")).toBe(true);
      expect(sim.ship.credits).toBe(0);
      expect(sim.blueprintQueue()[0]).toBe("tractor");
      expect(sim.blueprintLeft("tractor")).toBe(price - 100);
      expect(sim.fundBlueprint(sim.ship, "tractor")).toBe(false);
      sim.ship.credits = 100000;
      sim.fundBlueprint(sim.ship, "tractor");
      expect(sim.ship.credits).toBe(100000 - (price - 100));
      sim.step();
      expect(sim.unlocked("tractor")).toBe(true);
    });

    it("the station finishes paying what someone started", () => {
      const sim = shopWorld();
      sim.ship.credits = 100;
      sim.fundBlueprint(sim.ship, "tractor");
      sim.stationAccount.credits = 300 + sim.blueprintLeft("tractor");
      sim.step();
      expect(sim.unlocked("tractor")).toBe(true);
      expect(sim.stationAccount.credits).toBe(300);
    });

    it("a paid blueprint waits for the next hauler to berth, and only then stocks", () => {
      const sim = shopWorld({ haulers: true, haulerFirst: 1, haulerPartsLoad: 0, chatter: true });
      sim.ship.credits = 100000;
      expect(sim.fundBlueprint(sim.ship, "tractor")).toBe(true);
      const paid = sim.ship.credits;
      expect(sim.unlocked("tractor")).toBe(false);
      expect(sim.blueprintsOrdered.has("tractor")).toBe(true);
      expect(sim.blueprintQueue()).not.toContain("tractor");
      expect(sim.buyPart(sim.ship, "tractor")).toBe(false);
      expect(sim.fundBlueprint(sim.ship, "tractor")).toBe(false);
      expect(sim.ship.credits).toBe(paid);

      let announced = false;
      for (let seconds = 0; sim.hauler?.stage !== "loading" && seconds < 300; seconds += TICK) {
        expect(sim.unlocked("tractor")).toBe(false);
        sim.step();
        announced ||= sim.events.some((event) => event.type === "chatter" && event.text.includes("tractor"));
        sim.events.length = 0;
      }
      expect(sim.hauler?.stage).toBe("loading");
      expect(sim.unlocked("tractor")).toBe(true);
      expect(sim.blueprintsOrdered.size).toBe(0);
      expect(announced).toBe(true);
    }, 30000);

    it("a blueprint paid while a hauler sits at the berth waits for the one after", () => {
      const sim = shopWorld({ haulers: true, haulerFirst: 1, haulerPartsLoad: 0 });
      for (let seconds = 0; sim.hauler?.stage !== "loading" && seconds < 300; seconds += TICK) sim.step();
      sim.ship.credits = 100000;
      sim.fundBlueprint(sim.ship, "tractor");
      for (let seconds = 0; seconds < 5; seconds += TICK) sim.step();
      expect(sim.unlocked("tractor")).toBe(false);
      expect(sim.blueprintsOrdered.has("tractor")).toBe(true);
    }, 30000);

    describe("paying for a field deposit", () => {
      function projectWorld(extra: Partial<typeof SOLO> = {}): Sim {
        const sim = shopWorld({
          depositFree: false,
          depositPrice: 1000,
          depositParts: 10,
          depositBuildRate: 5,
          depositReach: 150,
          stationReserveParts: 20,
          stationStartParts: 100,
          stationPartsTarget: 100,
          chatter: true,
          ...extra,
        });
        return sim;
      }

      function run(sim: Sim, seconds: number): void {
        for (let time = 0; time < seconds; time += TICK) {
          sim.step();
          sim.events.length = 0;
        }
      }

      it("takes part payments, and moves to the front of the queue for them", () => {
        const sim = projectWorld();
        expect(sim.blueprintQueue()[0]).not.toBe("deposit");
        sim.ship.credits = 400;
        expect(sim.fundBlueprint(sim.ship, "deposit")).toBe(true);
        expect(sim.blueprintLeft("deposit")).toBe(600);
        expect(sim.blueprintQueue()[0]).toBe("deposit");
        expect(sim.deposits).toHaveLength(0);
      });

      it("once funded it's built from the station's parts, and only opens when finished", () => {
        const sim = projectWorld();
        sim.ship.credits = 1000;
        sim.fundBlueprint(sim.ship, "deposit");
        expect(sim.ship.credits).toBe(0);
        expect(sim.deposits).toHaveLength(1);
        expect(sim.unlocked("deposit")).toBe(false);
        expect(sim.blueprintsOrdered.has("deposit")).toBe(true);
        expect(sim.blueprintQueue()).not.toContain("deposit");
        const deposit = sim.deposits[0];
        sim.ship.x = deposit.x;
        sim.ship.y = deposit.y;
        sim.ship.px = deposit.x;
        sim.ship.py = deposit.y;
        expect(sim.depositAt()).toBeNull();
        const partsBefore = sim.stationParts;
        run(sim, 3);
        expect(sim.unlocked("deposit")).toBe(true);
        expect(sim.blueprintsOrdered.has("deposit")).toBe(false);
        expect(deposit.partsUsed).toBeCloseTo(10, 6);
        expect(sim.stationParts).toBeCloseTo(partsBefore - 10, 6);
      });

      it("doesn't carry anything until it opens", () => {
        const sim = projectWorld();
        sim.ship.credits = 1000;
        sim.fundBlueprint(sim.ship, "deposit");
        const deposit = sim.deposits[0];
        sim.ship.x = deposit.x;
        sim.ship.y = deposit.y;
        sim.ship.px = deposit.x;
        sim.ship.py = deposit.y;
        sim.step();
        expect(sim.ship.frame).not.toBe(deposit);
      });

      it("stops at the station's reserve and waits for more parts", () => {
        const sim = projectWorld({ stationStartParts: 25, depositParts: 50 });
        sim.ship.credits = 1000;
        sim.fundBlueprint(sim.ship, "deposit");
        run(sim, 20);
        expect(sim.stationParts).toBeCloseTo(20, 6);
        expect(sim.deposits[0].partsLeft).toBeCloseTo(45, 6);
        sim.stationParts = 100;
        run(sim, 20);
        expect(sim.unlocked("deposit")).toBe(true);
      });

      it("the station pays for it itself out of what it can spare", () => {
        const sim = projectWorld();
        sim.blueprintPaid.set("deposit", 999);
        sim.stationAccount.credits = 300;
        run(sim, 1);
        expect(sim.blueprintLeft("deposit")).toBe(1);
        expect(sim.deposits).toHaveLength(0);
        sim.stationAccount.credits = 301;
        run(sim, 1);
        expect(sim.deposits).toHaveLength(1);
        expect(sim.stationAccount.credits).toBe(300);
      });

      it("doesn't wait for a hauler, and isn't delivered by one", () => {
        const sim = projectWorld({ haulers: true, haulerFirst: 1, haulerPartsLoad: 0, depositBuildRate: 0.1, depositParts: 1000 });
        sim.ship.credits = 1000;
        sim.fundBlueprint(sim.ship, "deposit");
        for (let seconds = 0; sim.hauler?.stage !== "loading" && seconds < 300; seconds += TICK) sim.step();
        expect(sim.unlocked("deposit")).toBe(false);
        expect(sim.blueprintsOrdered.has("deposit")).toBe(true);
      }, 30000);

      it("the testing switch finishes one being built", () => {
        const sim = projectWorld({ depositBuildRate: 0.1, depositParts: 1000 });
        sim.ship.credits = 1000;
        sim.fundBlueprint(sim.ship, "deposit");
        sim.tuning.depositFree = true;
        sim.step();
        expect(sim.deposits).toHaveLength(1);
        expect(sim.unlocked("deposit")).toBe(true);
      });
    });

    it("you can only pay in while docked", () => {
      const sim = shopWorld();
      sim.ship.credits = 100;
      sim.ship.x += 3000;
      sim.ship.px = sim.ship.x;
      expect(sim.fundBlueprint(sim.ship, "tractor")).toBe(false);
    });

    it("the turret only fits the new ship", () => {
      const sim = arena();
      placeInDock(sim, sim.ship);
      sim.ship.credits = 100000;
      expect(sim.ship.model).toBe("racer");
      expect(sim.buyPart(sim.ship, "turret")).toBe(false);
    });
  });

  describe("cargo bays", () => {
    const looseOre = (sim: Sim, x: number, y: number) => ({ x, y, px: x, py: y, vx: 0, vy: 0, kind: 0, amount: 1, from: sim.ship });

    function bayWorld(extra: Partial<typeof SOLO> = {}): Sim {
      return arena({ playerCargo: 10, tractorRange: 500, ...extra });
    }

    it("a full ship leaves ore where it is", () => {
      const sim = bayWorld();
      const { ship } = sim;
      ship.ore = 10;
      sim.ores.push(looseOre(sim, ship.x, ship.y));
      sim.step();
      expect(ship.ore).toBe(10);
      expect(sim.ores).toHaveLength(1);
    });

    it("takes what fits from a bigger piece and leaves the rest", () => {
      const sim = bayWorld();
      const { ship } = sim;
      ship.ore = 9;
      sim.ores.push({ ...looseOre(sim, ship.x, ship.y), amount: 3 });
      sim.step();
      expect(ship.ore).toBe(10);
      expect(sim.ores[0].amount).toBe(2);
    });

    it("bays add room and weight, and stack", () => {
      const sim = bayWorld();
      const { ship } = sim;
      const light = sim.shipWeight(ship);
      expect(sim.cargoSpace(ship)).toBe(10);
      ship.parts.add("bay");
      expect(sim.cargoSpace(ship)).toBe(30);
      ship.parts.add("largeBay");
      expect(sim.cargoSpace(ship)).toBe(80);
      expect(sim.shipWeight(ship)).toBeGreaterThan(light);
    });

    it("a tractor doesn't pull ore a full ship can't take", () => {
      const sim = bayWorld();
      const { ship } = sim;
      ship.parts.add("tractor");
      ship.ore = 10;
      const ore = looseOre(sim, ship.x + 200, ship.y);
      ore.vx = 0;
      ore.vy = 0;
      sim.ores.push(ore);
      sim.step();
      expect(Math.hypot(ore.vx, ore.vy)).toBeLessThan(1);
    });

    it("an AI ship delivers at the share of its bay it's set to", () => {
      const sim = bayWorld({ trafficRacers: 1, chatter: false, deliverShare: 0.5 });
      const pilot = sim.traffic[0];
      expect(sim.deliveryLoad(pilot.ship)).toBe(5);
      pilot.ship.parts.add("bay");
      expect(sim.deliveryLoad(pilot.ship)).toBe(15);
      sim.tuning.deliverShare = 1;
      expect(sim.deliveryLoad(pilot.ship)).toBe(30);
    });

    it("buying at a deposit stops when the bay is full", () => {
      const sim = bayWorld({ depositFree: true, haulers: false });
      sim.step();
      const deposit = sim.deposits[0];
      const { ship } = sim;
      ship.x = deposit.x;
      ship.y = deposit.y;
      ship.px = deposit.x;
      ship.py = deposit.y;
      deposit.ore = 50;
      ship.ore = 4;
      ship.credits = 1000;
      expect(sim.buyFromDeposit(ship, deposit)).toBe(6);
      expect(ship.ore).toBe(10);
      expect(deposit.ore).toBe(44);
    });
  });

  describe("turrets", () => {
    function guardWorld(extra: Partial<typeof SOLO> = {}): Sim {
      const sim = arena({
        pirates: 1,
        pirateLimit: 1,
        defenders: 0,
        haulers: false,
        chatter: false,
        guardsStationFree: true,
        guardRange: 1200,
        guardShotsPerSecond: 2,
        guardTurn: 6,
        pirateRetreats: true,
        visionRange: 1500,
        visionAngle: 360,
        detectSeconds: 0,
        ...extra,
      });
      sim.step();
      // Pirates go for cargo, so the player carries some.
      sim.ship.ore = 5;
      return sim;
    }

    const outside = 2000;

    it("shoots a pirate in reach and doesn't shoot one out of reach", () => {
      const near = guardWorld();
      const nearPirate = near.fighters[0].ship;
      run(near, 3, () => pin(nearPirate, near.station.x + 900, near.station.y));
      expect(nearPirate.damageTaken).toBeGreaterThan(0);

      const far = guardWorld();
      const farPirate = far.fighters[0].ship;
      run(far, 3, () => pin(farPirate, far.station.x + outside, far.station.y));
      expect(farPirate.damageTaken).toBe(0);
    });

    it("the station's float in an arc facing the field, so its far side is open", () => {
      const sim = guardWorld({ stationGuardCount: 4, stationGuardArc: 60, stationGuardDistance: 450 });
      const { guns } = sim.batteries[0];
      const facing = Math.atan2(sim.field.y - sim.station.y, sim.field.x - sim.station.x);
      const offs = guns.map((guard) => {
        const angle = Math.atan2(guard.y - sim.station.y, guard.x - sim.station.x) - facing;
        expect(Math.hypot(guard.x - sim.station.x, guard.y - sim.station.y)).toBeCloseTo(450, 6);
        return (Math.atan2(Math.sin(angle), Math.cos(angle)) * 180) / Math.PI;
      });
      expect(Math.min(...offs)).toBeCloseTo(-30, 6);
      expect(Math.max(...offs)).toBeCloseTo(30, 6);
      expect(sim.inGuardRange(sim.station.x + Math.cos(facing) * 1400, sim.station.y + Math.sin(facing) * 1400)).toBe(true);
      expect(sim.inGuardRange(sim.station.x - Math.cos(facing) * 1400, sim.station.y - Math.sin(facing) * 1400)).toBe(false);
    });

    it("its shots pass everyone but pirates", () => {
      const sim = guardWorld();
      const { ship } = sim;
      pin(ship, sim.station.x + 3000, sim.station.y);
      const pirate = sim.fighters[0].ship;
      pin(pirate, ship.x, ship.y + 3000);
      const from = sim.batteries[0].guns[0].gun;
      const shot = (x: number, y: number) => ({ x, y, px: x, py: y, vx: 1000, vy: 0, life: 0.2, precise: false, from, guard: true });
      sim.shots.push(shot(ship.x - 60, ship.y), shot(pirate.x - 60, pirate.y));
      run(sim, 0.15, () => {
        pin(ship, sim.station.x + 3000, sim.station.y);
      });
      expect(ship.damageTaken).toBe(0);
      expect(pirate.damageTaken).toBeGreaterThan(0);
    });

    it("a hurt pirate breaks off a fight and goes home", () => {
      const sim = guardWorld({ guardsStationFree: false });
      const pilot = sim.fighters[0];
      pin(sim.ship, sim.field.x, sim.field.y);
      pin(pilot.ship, sim.ship.x + 500, sim.ship.y);
      run(sim, 0.1, () => pin(sim.ship, sim.field.x, sim.field.y));
      expect(pilot.task).toBe("attacking");
      pilot.ship.hull = 20;
      run(sim, 0.1, () => pin(sim.ship, sim.field.x, sim.field.y));
      expect(pilot.task).toBe("heading home");
    });

    it("with retreating off, it fights on", () => {
      const sim = guardWorld({ guardsStationFree: false, pirateRetreats: false });
      const pilot = sim.fighters[0];
      pin(sim.ship, sim.field.x, sim.field.y);
      pin(pilot.ship, sim.ship.x + 500, sim.ship.y);
      pilot.ship.hull = 20;
      run(sim, 0.1, () => pin(sim.ship, sim.field.x, sim.field.y));
      expect(pilot.task).toBe("attacking");
    });

    it("a healthy pirate won't start on a ship under the guns, but will on one outside them", () => {
      const inside = guardWorld();
      const inPilot = inside.fighters[0];
      const hold = (sim: Sim, shipAt: number, pirateAt: number) => {
        pin(sim.ship, sim.station.x + shipAt, sim.station.y);
        pin(sim.fighters[0].ship, sim.station.x + pirateAt, sim.station.y);
      };
      run(inside, 0.5, () => hold(inside, 1000, 2000));
      expect(inPilot.task).not.toBe("attacking");

      const out = guardWorld();
      run(out, 0.5, () => hold(out, 1800, 2500));
      expect(out.fighters[0].task).toBe("attacking");
    });

    it("a pirate already on a chase follows it under the guns", () => {
      const sim = guardWorld();
      const pilot = sim.fighters[0];
      run(sim, 0.2, () => {
        pin(sim.ship, sim.station.x + 1800, sim.station.y);
        pin(pilot.ship, sim.station.x + 2300, sim.station.y);
      });
      expect(pilot.task).toBe("attacking");
      run(sim, 0.2, () => {
        pin(sim.ship, sim.station.x + 1000, sim.station.y);
        pin(pilot.ship, sim.station.x + 1500, sim.station.y);
      });
      expect(pilot.task).toBe("attacking");
    });

    it("a pirate leaves ore under the guns alone", () => {
      const sim = guardWorld({ visionAngle: 0 });
      const pilot = sim.fighters[0];
      pin(pilot.ship, sim.station.x + 1500, sim.station.y);
      const ore = { x: sim.station.x + 1000, y: sim.station.y, px: 0, py: 0, vx: 0, vy: 0, kind: 0, amount: 1 };
      sim.ores.push(ore);
      run(sim, 0.1);
      expect(pilot.task).not.toBe("gathering");
    });

    describe("as projects", () => {
      function projectWorld(extra: Partial<typeof SOLO> = {}): Sim {
        const sim = arena({
          stationUnlocks: true,
          haulers: false,
          stationStartCredits: 0,
          stationCashBuffer: 300,
          stationReserveParts: 20,
          stationStartParts: 100,
          stationPartsTarget: 100,
          depositBuildRate: 5,
          stationGuardPrice: 1000,
          stationGuardParts: 10,
          depositGuardPrice: 500,
          depositGuardParts: 5,
          chatter: false,
          ...extra,
        });
        placeInDock(sim, sim.ship);
        sim.ship.credits = 5000;
        return sim;
      }

      it("station turrets are paid for, built from parts, and only then fire", () => {
        const sim = projectWorld();
        expect(sim.fundBlueprint(sim.ship, "stationGuards")).toBe(true);
        expect(sim.unlocked("stationGuards")).toBe(false);
        expect(sim.blueprintsOrdered.has("stationGuards")).toBe(true);
        expect(sim.inGuardRange(sim.station.x, sim.station.y)).toBe(false);
        const before = sim.stationParts;
        for (let i = 0; i < Math.round(3 / TICK); i++) {
          placeInDock(sim, sim.ship);
          sim.step();
          sim.events.length = 0;
        }
        expect(sim.unlocked("stationGuards")).toBe(true);
        expect(sim.blueprintsOrdered.has("stationGuards")).toBe(false);
        expect(sim.stationParts).toBeCloseTo(before - 10, 6);
        expect(sim.batteries[0].guns).toHaveLength(4);
        expect(sim.inGuardRange(sim.station.x, sim.station.y)).toBe(true);
      });

      it("deposit turrets wait for a deposit to stand on", () => {
        const sim = projectWorld();
        expect(sim.blueprintQueue()).not.toContain("depositGuards");
        expect(sim.fundBlueprint(sim.ship, "depositGuards")).toBe(false);
        sim.tuning.depositFree = true;
        sim.step();
        expect(sim.blueprintQueue()).toContain("depositGuards");
        expect(sim.fundBlueprint(sim.ship, "depositGuards")).toBe(true);
        expect(sim.batteries[0].host).toBe(sim.deposits[0]);
      });

      it("deposit turrets go with their deposit, and move with it", () => {
        const sim = arena({ depositFree: true, guardsDepositFree: true, fieldOrbitPeriod: 600, orbitPeriod: 300, chatter: false, haulers: false });
        sim.step();
        sim.step();
        const battery = sim.batteries[0];
        const deposit = sim.deposits[0];
        run(sim, 2);
        for (const guard of battery.guns) {
          const dx = guard.x - deposit.x;
          const dy = guard.y - deposit.y;
          expect(Math.hypot(dx, dy)).toBeCloseTo(sim.tuning.depositReach, 6);
          // Square to the way to the station.
          expect(dx * (sim.station.x - deposit.x) + dy * (sim.station.y - deposit.y)).toBeCloseTo(0, 3);
        }
        sim.tuning.depositFree = false;
        sim.tuning.guardsDepositFree = false;
        sim.step();
        sim.step();
        expect(sim.batteries).toHaveLength(0);
      });
    });
  });

  describe("field deposit", () => {
    function depositWorld(extra: Partial<typeof SOLO> = {}): Sim {
      const sim = arena({
        haulers: false,
        depositFree: true,
        depositGap: 300,
        depositReach: 150,
        depositCapacity: 300,
        depositPays: 3,
        depositSells: 7,
        depositDropChance: 0,
        stationStartCredits: 1000,
        ...extra,
      });
      sim.step();
      return sim;
    }

    describe("carrying", () => {
      const moving = { fieldOrbitPeriod: 600, orbitPeriod: 300 };

      it("carries a ship inside its ring along with it", () => {
        const sim = depositWorld(moving);
        const deposit = sim.deposits[0];
        const startX = deposit.x;
        const startY = deposit.y;
        moveTo(sim.ship, deposit.x + 50, deposit.y);
        run(sim, 5, () => false);
        expect(Math.hypot(deposit.x - startX, deposit.y - startY)).toBeGreaterThan(10);
        expect(sim.ship.x - deposit.x).toBeCloseTo(50, 6);
        expect(sim.ship.y - deposit.y).toBeCloseTo(0, 6);
        expect(sim.ship.frame).toBe(deposit);
        expect(sim.ship.frameShare).toBe(1);
      });

      const kits = [[], ["reverse"], ["strafe"], ["reverse", "strafe"]] as const;
      /** How far the ship slides against the deposit in ten seconds after its order is done. */
      function driftAfter(sim: Sim): number {
        const deposit = sim.deposits[0];
        const dx = sim.ship.x - deposit.x;
        const dy = sim.ship.y - deposit.y;
        run(sim, 10, () => false);
        return Math.hypot(sim.ship.x - deposit.x - dx, sim.ship.y - deposit.y - dy);
      }

      it("a stop inside it trims away the last of the speed with real thrusters, at part throttle", () => {
        for (const kit of kits) {
          const sim = depositWorld(moving);
          const deposit = sim.deposits[0];
          const { ship } = sim;
          ship.parts.add("clickMove");
          for (const part of kit) ship.parts.add(part);
          moveTo(ship, deposit.x + 20, deposit.y);
          ship.vx = 30;
          ship.px = ship.x - 30 * TICK;
          expect(sim.orderStop()).toBe(true);
          let trims = 0;
          run(sim, 30, () => {
            if (sim.clickPilot.task !== "settling") return false;
            for (const level of ship.firing.values()) if (level > 0 && level < 1) trims++;
            return false;
          });
          expect(sim.clickPilot.active, kit.join()).toBe(false);
          expect(trims, kit.join()).toBeGreaterThan(0);
          expect(sim.depositAt()).toBe(deposit);
          expect(driftAfter(sim), kit.join()).toBeLessThan(0.05);
        }
      });

      it("a move and stop ends on its spot, at rest, with or without side thrusters", () => {
        for (const kit of kits) {
          const sim = depositWorld(moving);
          const deposit = sim.deposits[0];
          const { ship } = sim;
          ship.parts.add("clickMove");
          for (const part of kit) ship.parts.add(part);
          moveTo(ship, deposit.x - 80, deposit.y);
          expect(sim.orderMove(deposit.x + 60, deposit.y + 30)).toBe(true);
          run(sim, 30, () => false);
          expect(sim.clickPilot.active, kit.join()).toBe(false);
          // The spot rides along with the deposit from the moment it's ordered. A ship that
          // has to turn around to brake lands within a wider circle.
          const circle = kit.some((part) => part === "strafe") ? 1 : 2.5;
          expect(Math.hypot(ship.x - deposit.x - 60, ship.y - deposit.y - 30), kit.join()).toBeLessThan(circle);
          expect(driftAfter(sim), kit.join()).toBeLessThan(0.05);
        }
      });

      it("leaves a ship outside its ring to the POIs", () => {
        const sim = depositWorld(moving);
        const deposit = sim.deposits[0];
        moveTo(sim.ship, deposit.x + sim.tuning.depositReach + 20, deposit.y);
        sim.step();
        expect(sim.ship.frame).not.toBe(deposit);
      });
    });

    function moveTo(ship: Sim["ship"], x: number, y: number): void {
      ship.x = x;
      ship.y = y;
      ship.px = x;
      ship.py = y;
      ship.vx = 0;
      ship.vy = 0;
    }

    it("stands just outside the field on the station's side, and goes with the switch", () => {
      const sim = depositWorld();
      const deposit = sim.deposits[0];
      const { field, station } = sim;
      expect(Math.hypot(deposit.x - field.x, deposit.y - field.y)).toBeCloseTo(field.reach + 300, 3);
      expect(Math.hypot(deposit.x - station.x, deposit.y - station.y)).toBeLessThan(Math.hypot(field.x - station.x, field.y - station.y));
      sim.tuning.depositFree = false;
      sim.step();
      expect(sim.deposits).toHaveLength(0);
    });

    it("every credit and ore traces through a drop, a purchase and the station", () => {
      const sim = depositWorld();
      const deposit = sim.deposits[0];
      moveTo(sim.ship, deposit.x, deposit.y);
      sim.ship.ore = 10;
      sim.ship.credits = 100;
      const stationBefore = sim.stationAccount.credits;
      expect(sim.sellToDeposit(sim.ship, deposit)).toBe(10);
      expect(sim.ship.credits).toBe(130);
      expect(deposit.ore).toBe(10);
      expect(sim.stationAccount.credits).toBe(stationBefore - 30);
      expect(sim.buyFromDeposit(sim.ship, deposit)).toBe(10);
      expect(sim.ship.ore).toBe(10);
      expect(sim.ship.credits).toBe(60);
      expect(deposit.ore).toBe(0);
      expect(sim.stationAccount.credits).toBe(stationBefore + 40);
    });

    it("only takes what fits, only sells what you can pay for, and only in reach", () => {
      const sim = depositWorld({ depositCapacity: 5 });
      const deposit = sim.deposits[0];
      moveTo(sim.ship, deposit.x, deposit.y);
      sim.ship.ore = 8;
      expect(sim.sellToDeposit(sim.ship, deposit)).toBe(5);
      expect(sim.ship.ore).toBe(3);
      expect(sim.sellToDeposit(sim.ship, deposit)).toBe(0);
      sim.ship.credits = 15;
      expect(sim.buyFromDeposit(sim.ship, deposit)).toBe(2);
      moveTo(sim.ship, deposit.x + 500, deposit.y);
      sim.ship.credits = 1000;
      expect(sim.buyFromDeposit(sim.ship, deposit)).toBe(0);
      sim.ship.ore = 1;
      expect(sim.sellToDeposit(sim.ship, deposit)).toBe(0);
    });

    /** A traffic ship with a load, out in the middle of the field. */
    function loaded(sim: Sim, ore: number): Sim["traffic"][number] {
      const pilot = sim.traffic[0];
      moveTo(pilot.ship, sim.field.x, sim.field.y);
      pilot.ship.ore = ore;
      return pilot;
    }

    function run(sim: Sim, seconds: number, done: () => boolean): void {
      for (let time = 0; time < seconds && !done(); time += TICK) {
        sim.step();
        sim.events.length = 0;
      }
    }

    it("traffic that chooses to save the trip drops its load and goes back to work", () => {
      const sim = depositWorld({ trafficRacers: 1, depositDropChance: 1, chatter: false });
      const pilot = loaded(sim, DEFAULTS.droneCargo);
      run(sim, 200, () => sim.deposits[0].ore > 0);
      expect(sim.deposits[0].ore).toBe(DEFAULTS.droneCargo);
      expect(pilot.ship.ore).toBe(0);
      expect(pilot.ship.credits).toBeGreaterThanOrEqual(DEFAULTS.droneCargo * 3);
    }, 30000);

    it("traffic flies a full load home if it doesn't choose the deposit", () => {
      const sim = depositWorld({ trafficRacers: 1, chatter: false });
      const pilot = loaded(sim, DEFAULTS.droneCargo);
      run(sim, 300, () => pilot.ship.trips > 0);
      expect(pilot.ship.trips).toBe(1);
      expect(sim.deposits[0].ore).toBe(0);
    }, 30000);

    it("a badly damaged ship takes its load to the station it's going to for repairs", () => {
      const sim = depositWorld({ trafficRacers: 1, depositDropChance: 1, chatter: false });
      const pilot = loaded(sim, DEFAULTS.droneCargo);
      pilot.ship.hull = 10;
      run(sim, 300, () => pilot.ship.trips > 0);
      expect(pilot.ship.trips).toBe(1);
      expect(sim.deposits[0].ore).toBe(0);
    }, 30000);

    it("a full deposit sends the load on to the station", () => {
      const sim = depositWorld({ trafficRacers: 1, depositDropChance: 1, depositCapacity: 2, chatter: false });
      sim.deposits[0].ore = 2;
      const pilot = loaded(sim, DEFAULTS.droneCargo);
      run(sim, 300, () => pilot.ship.trips > 0);
      expect(pilot.ship.trips).toBe(1);
      expect(sim.deposits[0].ore).toBe(2);
    }, 30000);
  });

  describe("haulers", () => {
    function haulerWorld(extra: Partial<typeof SOLO> = {}): Sim {
      return arena({
        haulers: true,
        haulerFirst: 10,
        haulerInterval: 600,
        haulerCapacity: 50,
        haulerPrice: 15,
        haulerPartsLoad: 100,
        haulerPartPrice: 16,
        haulerLoadRate: 10,
        stationReserveParts: 20,
        stationStartOre: 40,
        stationStartParts: 100,
        stationPartsTarget: 100,
        stationStartCredits: 0,
        ...extra,
      });
    }

    /** Runs until the hauler reaches a stage, or the time runs out. Returns the seconds taken. */
    function until(sim: Sim, stage: string, limit: number): number {
      let seconds = 0;
      while (sim.hauler?.stage !== stage && seconds < limit) {
        sim.step();
        sim.events.length = 0;
        seconds += TICK;
      }
      return seconds;
    }

    it("comes in from away from the field, slowing all the way, then locks on beside the station", () => {
      const sim = haulerWorld();
      until(sim, "arriving", 20);
      const start = sim.haulerSpot()!;
      const fromField = Math.hypot(start.x - sim.field.x, start.y - sim.field.y);
      expect(fromField).toBeGreaterThan(Math.hypot(sim.station.x - sim.field.x, sim.station.y - sim.field.y));
      const speeds: number[] = [];
      let seconds = 0;
      while (sim.hauler?.stage === "arriving" && seconds < 400) {
        sim.step();
        sim.events.length = 0;
        seconds += TICK;
        const now = sim.haulerSpot()!;
        const before = sim.haulerSpot(true)!;
        speeds.push(Math.hypot(now.x - before.x, now.y - before.y) / TICK);
      }
      expect(sim.hauler?.stage).toBe("docking");
      expect(speeds[10]).toBeGreaterThan(speeds[Math.floor(speeds.length / 2)]);
      until(sim, "loading", 40);
      const spot = sim.haulerSpot()!;
      const berth = sim.haulerBerth();
      expect(Math.hypot(spot.x - berth.x, spot.y - berth.y)).toBeLessThan(1);
      const dock = sim.dockPoint();
      expect(Math.hypot(spot.x - dock.x, spot.y - dock.y)).toBeGreaterThan(400);
    }, 30000);

    it("tells roughly when it'll be at the berth", () => {
      const sim = haulerWorld();
      const promised = sim.haulerEta()!;
      const taken = until(sim, "loading", 400);
      expect(Math.abs(promised - taken)).toBeLessThan(15);
      expect(sim.haulerEta()).toBe(0);
      expect(haulerWorld({ haulers: false }).haulerEta()).toBeNull();

      until(sim, "leaving", 200);
      const left = sim.haulerEta()!;
      expect(left).toBeGreaterThan(600);
      let seconds = 0;
      while (sim.hauler && seconds < 400) {
        sim.step();
        sim.events.length = 0;
        seconds += TICK;
      }
      expect(sim.hauler).toBeNull();
      expect(Math.abs(left - seconds - sim.haulerEta()!)).toBeLessThan(40);
    }, 30000);

    it("clears the station's ore, pays for it, then leaves and is gone", () => {
      const sim = haulerWorld();
      until(sim, "loading", 400);
      until(sim, "undocking", 60);
      expect(sim.stationOre).toBe(0);
      expect(sim.stationParts).toBe(100);
      expect(sim.hauler?.parts).toBe(100);
      expect(sim.hauler?.cargo).toBe(40);
      expect(sim.stationAccount.credits).toBe(40 * 15);
      until(sim, "leaving", 40);
      let seconds = 0;
      while (sim.hauler && seconds < 400) {
        sim.step();
        sim.events.length = 0;
        seconds += TICK;
      }
      expect(sim.hauler).toBeNull();
    }, 30000);

    it("sells parts as far as this visit's ore pays for them, even to a station in debt", () => {
      for (const start of [0, -5000]) {
        const sim = haulerWorld({ stationStartParts: 40, stationStartCredits: start });
        until(sim, "loading", 400);
        until(sim, "undocking", 60);
        expect(sim.hauler?.cargo).toBe(40);
        expect(sim.stationParts).toBe(40 + 37);
        expect(sim.hauler?.parts).toBe(100 - 37);
        expect(sim.stationAccount.credits).toBe(start + 40 * 15 - 37 * 16);
      }
    }, 30000);

    it("a station with money buys parts up to what it wants, even with no ore to sell", () => {
      const sim = haulerWorld({ stationStartOre: 0, stationStartParts: 70, stationStartCredits: 1000 });
      until(sim, "loading", 400);
      until(sim, "undocking", 60);
      expect(sim.stationParts).toBe(100);
      expect(sim.hauler?.parts).toBe(70);
      expect(sim.stationAccount.credits).toBe(1000 - 30 * 16);
    }, 30000);

    it("once it unlocks, the station's turning no longer carries it", () => {
      const sim = haulerWorld();
      until(sim, "undocking", 500);
      sim.step();
      const spot = sim.haulerSpot()!;
      const before = sim.haulerSpot(true)!;
      // Undocking: its turn stopped the moment it unlocked.
      expect(spot.angle).toBeCloseTo(before.angle, 6);
    }, 30000);

    it("leaves straight away once full", () => {
      const sim = haulerWorld({ stationStartOre: 1000 });
      until(sim, "loading", 400);
      const seconds = until(sim, "undocking", 60);
      expect(sim.hauler?.cargo).toBe(50);
      expect(seconds).toBeLessThan(6);
    }, 30000);

    it("says hello at the berth and goodbye when it leaves", () => {
      const sim = haulerWorld();
      const lines: string[] = [];
      run(sim, 220, () => {
        for (const event of sim.events) if (event.type === "chatter") lines.push(`${event.name}: ${event.text}`);
      });
      expect(lines.some((line) => line.startsWith("Long Haul: At your berth"))).toBe(true);
      expect(lines.some((line) => line.startsWith("Station: Roger, Long Haul"))).toBe(true);
      expect(lines.some((line) => line.startsWith("Long Haul: 40 ore aboard"))).toBe(true);
    }, 30000);
  });

  describe("the money loop", () => {
    const ore =(x: number, y: number) => ({ x, y, px: x, py: y, vx: 0, vy: 0, kind: 0, amount: 1 });

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

    it("the player's rebuilt ship starts in the dock, safe from what wrecked it", () => {
      const sim = arena();
      pin(sim.ship, sim.station.x + 3000, sim.station.y);
      sim.ship.hull = 1;
      shoot(sim, sim.ship, { ...sim.ship });
      run(sim, 0.2);
      expect(sim.ship.wrecks).toBe(1);
      expect(sim.isDocked()).toBe(true);
    });

    it("a pirate is rebuilt from its base's money until the money runs out", () => {
      const sim = arena({ pirates: 1, pirateLimit: 1, rebuildCost: 300, pirateStartCredits: 300 });
      const { ship } = sim.fighters[0];
      wreck(sim, ship);
      expect(sim.fighters.length).toBe(1);
      expect(sim.pirateCredits).toBe(0);
      wreck(sim, ship);
      expect(sim.fighters.length).toBe(0);
    });

    it("the base builds pirates from money beyond its reserve, up to its cap", () => {
      const sim = arena({
        pirates: 1,
        pirateLimit: 2,
        defenderPrice: 500,
        pirateReserve: 400,
        pirateStartCredits: 899,
      });
      sim.step();
      expect(sim.fighters.length).toBe(1);
      sim.pirateCredits = 900;
      sim.step();
      expect(sim.fighters.length).toBe(2);
      expect(sim.fighters[1].ship.faction).toBe("pirate");
      expect(sim.pirateCredits).toBe(400);
      sim.pirateCredits = 10000;
      sim.step();
      expect(sim.fighters.length).toBe(2);
    });

    it("pirates leave each other alone", () => {
      const sim = arena({ pirates: 2 });
      const [one, two] = sim.fighters;
      one.ship.angle = 0;
      pin(two.ship, one.ship.x + 500, one.ship.y);
      expect(one.sees(sim, two.ship)).toBe(true);
      run(sim, 0.1);
      expect(one.task).not.toBe("attacking");
    });

    it("a pirate repairs with its base's money, and the station's parts are left alone", () => {
      const sim = arena({
        pirates: 1,
        pirateLimit: 1,
        repairCost: 2,
        pirateStartCredits: 3,
        stationStartParts: 7,
      });
      const pilot = sim.fighters[0];
      pilot.ship.hull = 50;
      expect(sim.canRepair(pilot.ship)).toBe(true);
      run(sim, 0.5);
      expect(sim.pirateCredits).toBeLessThan(2);
      expect(sim.stationParts).toBe(7);
    });

    it("a pirate with nothing to hunt mines rocks and takes the ore to its base", () => {
      const sim = arena({
        pirates: 1,
        pirateLimit: 1,
        pirateStartOre: 0,
        droneCargo: 2,
        visionAngle: 0,
        rockCount: 20,
        fieldRadius: 1200,
      });
      const pilot = sim.fighters[0];
      const tasks = new Set<string>();
      let ticks = 0;
      while (sim.pirateOre < 2 && ticks < Math.round(600 / TICK)) {
        sim.step();
        sim.events.length = 0;
        tasks.add(pilot.task);
        ticks++;
      }
      expect(tasks.has("mining")).toBe(true);
      expect(sim.pirateOre).toBeGreaterThanOrEqual(2);
    }, 60000);

    it("a defender with nothing to hunt doesn't mine", () => {
      const sim = arena({ defenders: 1, visionAngle: 0, rockCount: 20 });
      const pilot = sim.fighters[0];
      run(sim, 5);
      expect(pilot.task).toBe("patrolling");
    });

    it("a pirate collects loose ore with no target and sells it into its base's pile", () => {
      const sim = arena({ pirates: 1, pirateStartOre: 0 });
      const pilot = sim.fighters[0];
      const { ship } = pilot;
      sim.ores.push(ore(ship.x + 300, ship.y));
      run(sim, 1);
      expect(pilot.task).toBe("gathering");
      let ticks = 0;
      while (sim.pirateOre === 0 && ticks < Math.round(120 / TICK)) {
        sim.step();
        ticks++;
      }
      expect(sim.pirateOre).toBe(1);
      expect(ship.credits).toBe(0);
      expect(sim.stationParts).toBe(SOLO.stationStartParts);
      expect(sim.stationAccount.credits).toBe(DEFAULTS.stationStartCredits);
    }, 30000);

    it("a defender brings ore home to the station's pile, at no cost to the station", () => {
      const sim = arena({ defenders: 1, stationStartCredits: 0, stationStartOre: 0 });
      const { ship } = sim.fighters[0];
      sim.ores.push(ore(ship.x + 800, ship.y + 800));
      let ticks = 0;
      while (sim.stationOre === 0 && ticks < Math.round(120 / TICK)) {
        sim.step();
        ticks++;
      }
      expect(sim.stationOre).toBe(1);
      expect(sim.stationAccount.credits).toBe(0);
      expect(ship.credits).toBe(0);
    }, 30000);

    it("selling ore adds to the pile and takes credits from the station, even below zero", () => {
      const sim = traffic({ stationStartOre: 0, stationStartCredits: 0 });
      const { ship } = sim.traffic[0];
      placeInDock(sim, ship);
      ship.ore = 3;
      run(sim, 1);
      expect(sim.stationOre).toBe(3);
      expect(ship.credits).toBe(3 * DEFAULTS.creditsPerOre);
      expect(sim.stationAccount.credits).toBe(-3 * DEFAULTS.creditsPerOre);
    });

    describe("the station's ore", () => {
      /** Ore goes 1 to 20 credits of service, so 500 credits is 25 ore and 300 is 15. */
      const STOCK = {
        serviceCreditsPerPart: 20,
        defenderPrice: 500,
        rebuildCost: 300,
        stationReserveParts: 20,
        stationStartParts: 0,
      };

      it("builds no defenders, whatever its ore, until a traffic ship is lost", () => {
        const sim = traffic({ ...STOCK, stationStartParts: 5000 });
        sim.step();
        expect(sim.fighters.length).toBe(0);
        wreck(sim, sim.traffic[0].ship);
        expect(sim.fighters.length).toBe(1);
      });

      it("a defender gets no second one while nothing is lost, and only one while something is", () => {
        const sim = traffic({ ...STOCK, defenders: 1, trafficRacers: 2, stationStartParts: 5000 });
        sim.step();
        expect(sim.fighters.length).toBe(1);
        wreck(sim, sim.traffic[0].ship);
        run(sim, 1);
        expect(sim.fighters.length).toBe(1);
        expect(sim.traffic.length).toBe(2);
      });

      it("a wrecked defender isn't rebuilt, and is replaced only when traffic is lost", () => {
        const sim = traffic({ ...STOCK, defenders: 1, stationStartParts: 5000 });
        wreck(sim, sim.fighters[0].ship);
        run(sim, 1);
        expect(sim.fighters.length).toBe(0);
        wreck(sim, sim.traffic[0].ship);
        run(sim, 1);
        expect(sim.fighters.length).toBe(1);
        expect(sim.traffic.length).toBe(1);
      });

      it("traffic that can pay is still lost when the pile is empty, but the player isn't", () => {
        const sim = traffic({ ...STOCK });
        const { ship } = sim.traffic[0];
        ship.credits = 1000;
        wreck(sim, ship);
        expect(sim.traffic.length).toBe(0);
        expect(sim.lostTraffic).toEqual(["racer"]);
        sim.ship.hull = 1;
        shoot(sim, sim.ship, { ...sim.ship });
        run(sim, 0.2);
        expect(sim.ship.wrecks).toBe(1);
        expect(sim.ship.credits).toBe(-300);
        expect(sim.stationParts).toBe(0);
      });

      it("parts bring a dead system back: a defender first, then the lost traffic", () => {
        const sim = traffic({ ...STOCK });
        wreck(sim, sim.traffic[0].ship);
        sim.step();
        expect(sim.fighters.length).toBe(0);
        expect(sim.traffic.length).toBe(0);

        // Enough for one thing, and the defender comes first.
        sim.stationParts = 45;
        sim.step();
        expect(sim.fighters.length).toBe(1);
        expect(sim.traffic.length).toBe(0);

        sim.stationParts = 35;
        sim.step();
        expect(sim.traffic.map((pilot) => pilot.ship.model)).toEqual(["racer"]);
        expect(sim.isDocked(sim.traffic[0].ship)).toBe(true);
        expect(sim.lostTraffic).toEqual([]);
        expect(sim.stationParts).toBe(20);
      });

      it("a delivery of ore revives a dead station once the next hauler has traded it for parts", () => {
        const sim = traffic({
          ...STOCK,
          stationStartOre: 0,
          stationStartCredits: -2000,
          haulers: true,
          haulerFirst: 10,
          haulerLoadRate: 10,
          haulerPrice: 15,
          haulerPartPrice: 16,
          haulerPartsLoad: 100,
          stationPartsTarget: 100,
        });
        wreck(sim, sim.traffic[0].ship);
        placeInDock(sim, sim.ship);
        sim.ship.ore = 60;
        run(sim, 30, () => placeInDock(sim, sim.ship));
        expect(sim.ship.ore).toBe(0);
        expect(sim.stationOre).toBe(60);
        expect(sim.fighters.length).toBe(0);
        run(sim, 400, () => placeInDock(sim, sim.ship));
        expect(sim.stationOre).toBe(0);
        expect(sim.fighters.length).toBe(1);
      }, 30000);

      it("repairs use parts, stop when they run out, and start again when more arrive", () => {
        const sim = arena({ ...STOCK, repairCost: 2, stationStartParts: 1, repairSpeed: 100 });
        placeInDock(sim, sim.ship);
        sim.ship.hull = 50;
        sim.ship.credits = 1000;
        run(sim, 2, () => placeInDock(sim, sim.ship));
        expect(sim.ship.hull).toBeGreaterThanOrEqual(59);
        expect(sim.ship.hull).toBeLessThanOrEqual(60);
        expect(sim.canRepair(sim.ship)).toBe(false);
        sim.stationParts = 100;
        run(sim, 2, () => placeInDock(sim, sim.ship));
        expect(sim.ship.hull).toBe(100);
      });

      it("a part needs ore in the pile, and selling it back returns the ore", () => {
        const sim = arena({ ...STOCK, stationReserveParts: Infinity });
        placeInDock(sim, sim.ship);
        sim.ship.credits = 10000;
        const id = "reverse";
        expect(sim.buyPart(sim.ship, id)).toBe(false);
        const ore = sim.stockFor(sim.partPrice(id));
        sim.stationParts = ore;
        expect(sim.buyPart(sim.ship, id)).toBe(true);
        expect(sim.stationParts).toBe(0);
        expect(sim.sellPart(sim.ship, id)).toBe(true);
        expect(sim.stationParts).toBe(ore);
      });

      it("a damaged ship doesn't wait in the dock for ore that may never come", () => {
        const sim = new Sim(1, { ...SOLO, ...STOCK, testDrones: 0, trafficRacers: 1, repairCost: 2 });
        const pilot = sim.traffic[0];
        placeInDock(sim, pilot.ship);
        pilot.ship.hull = 10;
        pilot.ship.credits = 1000;
        run(sim, 20);
        expect(sim.isDocked(pilot.ship)).toBe(false);
      }, 30000);
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
