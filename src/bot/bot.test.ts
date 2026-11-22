import { describe, expect, it } from "vitest";
import { hullMax, refresh } from "../fitting";
import { homeSim, type Home } from "../home";
import { partOf, type PartId } from "../parts";
import { ClickPilot } from "../pilot";
import { DOCK_OFFSET, SHIP_RADIUS, STATION_HALF, TICK, type Loose, type Rock, type Ship, type Sim } from "../sim";
import { DEFAULTS, type Tuning } from "../tuning";
import { BOT_CALLS, Bot, CRUISE_SPEED, FIRE_CLOSE, SHIP_CLEARANCE, SIGHT, UNDOCK_SPEED } from "./bot";
import { BotLog, type RunInfo } from "./log";
import { FLOATER_JOURNEY, type Plan } from "./plan";

/** The plain home, with nothing else in it to make a run hard to read. */
function world(extra: Partial<Tuning> & Partial<Home> = {}): Sim {
  return homeSim(1, {
    ...DEFAULTS,
    floaterStart: true,
    trafficRacers: 0,
    trafficFloaters: 0,
    pirates: 0,
    defenders: 0,
    chatter: false,
    ...extra,
  });
}

/** Wears every module of a kind to a share of its life: past `DAMAGED_AT` it stops working. */
function wear(sim: Sim, kind: string, amount: number): void {
  for (const module of Object.values(sim.ship.fit)) {
    if (!module || partOf(module.part).kind !== kind) continue;
    module.wear = amount;
  }
  refresh(sim.ship);
}

/** Reaches the click pilot's own braking arithmetic, as `src/pilot.test.ts` does. */
class Probe extends ClickPilot {
  stopDistance(sim: Sim, speed: number): number {
    return this.stoppingDistance(sim, speed);
  }
}

/** What a report needs of a run, for the tests that read one. */
const INFO: RunInfo = { title: "Floater journey", track: "floater", seed: 1, hours: 2, world: "test" };

/** Dunks the ship in the nearest station's dock, as flying in would leave it. */
function dock(sim: Sim): Sim {
  const { station } = sim;
  sim.ship.x = sim.ship.px = station.x + Math.cos(station.rotation) * DOCK_OFFSET;
  sim.ship.y = sim.ship.py = station.y + Math.sin(station.rotation) * DOCK_OFFSET;
  sim.ship.vx = sim.ship.vy = 0;
  return sim;
}

/** Plays a bot for a stretch of game time: one step of play, then one of the world. */
function play(sim: Sim, bot: Bot, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) {
    playTick(sim, bot);
  }
}

/** A piece of ore lying in space, as a shot or a wreck leaves it. */
function oreAt(x: number, y: number, from: Ship | null = null): Loose {
  return { x, y, px: x, py: y, vx: 0, vy: 0, item: "ore" as PartId, wear: 0, count: 1, kind: 0, from };
}

/** The inputs one tick of play added: what the bot did on it. */
function inputsOf(log: BotLog, from: number) {
  return log.inputs.slice(from);
}

/** One tick of play, with the bot handed a watched sim and the world stepping the real one. */
function playTick(sim: Sim, bot: Bot, hands: Sim = sim): void {
  bot.step(hands === sim ? sim : hands);
  if (bot.end) return;
  sim.step();
}

/** The sim, but any method that isn't one a player's own hands reach throws. */
function watched(sim: Sim): Sim {
  const allowed = new Set<string>([...BOT_CALLS.inputs, ...BOT_CALLS.reads]);
  return new Proxy(sim, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      const name = String(key);
      if (!allowed.has(name)) throw new Error(`the bot called sim.${name}, which isn't a player's to call`);
      return value.bind(target);
    },
  });
}

describe("the bot's hands", () => {
  it("calls nothing a player's own hands can't reach", () => {
    const sim = world();
    const hands = watched(sim);
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    expect(() => {
      for (let i = 0; i < Math.round(20 / TICK); i++) playTick(sim, bot, hands);
    }).not.toThrow();
    // It did something in those 30 seconds, rather than sitting still and passing by default.
    expect(bot.log.inputs.length).toBeGreaterThan(0);
  });

  it("the same seed plays the same run", () => {
    const once = new BotLog();
    play(world(), new Bot({ plan: FLOATER_JOURNEY, log: once }), 40);
    const twice = new BotLog();
    play(world(), new Bot({ plan: FLOATER_JOURNEY, log: twice }), 40);
    expect(twice.events).toEqual(once.events);
    expect(twice.inputs).toEqual(once.inputs);
    expect(once.inputs.length).toBeGreaterThan(0);
  }, 30000);

  it("a fire held down for a while is one input, not one a tick", () => {
    const sim = world();
    // A rock dead ahead, and a ship stopped and facing it, so the only thing to check is the trigger.
    sim.rocks.length = 0;
    // A big rock, so the second of fire it takes is longer than the second this test plays.
    const rock: Rock = sim.makeRock(2, sim.ship.x + 300, sim.ship.y, 0, 0);
    rock.hp = 1000;
    sim.rocks.push(rock);
    sim.ship.angle = 0;
    sim.ship.spin = 0;
    sim.ship.vx = sim.ship.vy = 0;
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    play(sim, bot, 1);
    const fires = bot.log.inputs.filter((input) => input.kind === "fire");
    expect(fires).toHaveLength(1);
    // And it's still held at the end: the burst is one input for as long as it lasts.
    expect(sim.controls.fire).toBe(true);
  });
});

describe("the journey", () => {
  it("ends on the chart and the autopilot, in six steps, and not the route planner", () => {
    expect(FLOATER_JOURNEY.steps).toHaveLength(6);
    expect(FLOATER_JOURNEY.steps[5]).toEqual({ label: "system chart, autopilot", parts: ["starmap", "autopilot"] });
    expect(FLOATER_JOURNEY.steps.flatMap((step) => step.parts)).not.toContain("clickRoute");
  });
});

describe("the run", () => {
  it("ends stuck, naming the step, when there's nothing to work", () => {
    // No rocks and no ore anywhere: mining has nothing to do, so the run can only stall.
    const sim = world({ rockCount: 0 });
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog(), stuckMinutes: 0.5 });
    play(sim, bot, 120);
    expect(bot.end).toBe("stuck");
    expect(bot.log.end?.why).toBe("stuck");
    expect(bot.log.end?.step).toBe("step 1, bay");
    const said = bot.log.events.map((event) => event.text).join("\n");
    expect(said).toContain("stuck on step 1, bay");
    expect(said).toContain("last inputs:");
  });

  it("logs what the shop says when a program won't fit, and plays on", () => {
    const plan: Plan = { name: "A program", steps: [{ label: "targeting", parts: ["targeting"] }] };
    const sim = dock(world());
    expect(sim.isDocked()).toBe(true);
    sim.ship.credits = 1000;
    // Its flight computer's four slots are full, so a bought program has nowhere to run.
    expect(sim.ship.programs).toEqual(["clickMove", "clickTurn"]);
    sim.devSet(sim.ship, "meters", true);
    sim.devSet(sim.ship, "retro", true);
    expect(sim.ship.programs).toHaveLength(4);
    const bot = new Bot({ plan, log: new BotLog() });
    play(sim, bot, 30);
    // One snag, in the game's own numbers, and no loop of them.
    expect(bot.log.snags).toHaveLength(1);
    expect(bot.log.snags[0].what).toBe("targeting");
    expect(bot.log.snags[0].why).toContain("no free program slot (4 of 4");
    expect(bot.end).toBeNull();
    // The program is the pilot's now, even though it isn't running: bought once, not every tick.
    expect(sim.ship.software.has("targeting")).toBe(true);
    expect(bot.log.inputs.filter((input) => input.kind === "buy")).toHaveLength(1);
  });

  it("flies home by a click on the berth, and ends in the dock", () => {
    const sim = world();
    // A hold full of ore, so the only thing left is the trip home.
    sim.setOre(sim.ship, 100);
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    const hands = watched(sim);
    // A click order, not a course: the journey hasn't got the autopilot yet.
    expect(sim.ship.parts.has("autopilot")).toBe(false);
    let at = -1;
    for (let i = 0; i < Math.round(600 / TICK) && !sim.isDocked(); i++) {
      playTick(sim, bot, hands);
      if (at < 0 && bot.log.inputs.some((input) => input.kind === "move" && input.detail.startsWith("home to"))) at = sim.now;
    }
    expect(at, "set out for home").toBeGreaterThanOrEqual(0);
    expect(sim.isDocked()).toBe(true);
    // There and in, not a chase that never ends: the settle finishes what it arrives at, so a
    // click on the berth is enough however far the dock has gone round.
    expect(sim.now - at).toBeLessThan(240);
  }, 60000);

  it("makes room in a full computer by unloading click-to-turn once the turret is fitted", () => {
    const plan: Plan = { name: "A chart", steps: [{ label: "system chart", parts: ["starmap"] }] };
    const sim = dock(world());
    sim.ship.credits = 1000;
    sim.devSet(sim.ship, "turret", true);
    // Owned but with nowhere to run: the computer is full of the ship's own programs.
    sim.devSet(sim.ship, "meters", true);
    sim.devSet(sim.ship, "retro", true);
    expect(sim.ship.programs).toHaveLength(4);
    sim.giveProgram(sim.ship, "starmap");
    const bot = new Bot({ plan, log: new BotLog() });
    play(sim, bot, 30);
    expect(sim.ship.parts.has("starmap")).toBe(true);
    expect(sim.ship.parts.has("clickTurn")).toBe(false);
    // What the bot flies with is untouched: the click orders and the turn keys.
    expect(sim.ship.parts.has("clickMove")).toBe(true);
    expect(bot.log.inputs.some((input) => input.kind === "unload")).toBe(true);
  });

  it("buys a step's part at the dock and calls it done", () => {
    const plan: Plan = { name: "A part", steps: [{ label: "bay", parts: ["bay"] }] };
    const sim = dock(world());
    sim.ship.credits = 1000;
    const bot = new Bot({ plan, log: new BotLog() });
    play(sim, bot, 20);
    expect(sim.ship.parts.has("bay")).toBe(true);
    expect(bot.end).toBe("goal");
    expect(bot.log.steps).toHaveLength(1);
    expect(bot.log.steps[0].label).toBe("bay");
  });
});

describe("a module that stops working", () => {
  it("sends it home, with its fire held, and says so once", () => {
    const sim = world();
    sim.setOre(sim.ship, 2);
    wear(sim, "gun", 0.6);
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    play(sim, bot, 6);
    const said = bot.log.events.map((event) => event.text);
    expect(said.filter((text) => text.includes("broken at"))).toHaveLength(1);
    expect(said.some((text) => text.startsWith("heading home: gun 2 broken"))).toBe(true);
    expect(bot.log.breaks).toHaveLength(1);
    expect(bot.log.breaks[0].what).toBe("gun 2");
    expect(sim.controls.fire).toBe(false);
    expect(bot.log.inputs.some((input) => input.kind === "move" && input.detail.startsWith("home to"))).toBe(true);
  });

  it("waits for the dock to repair before it shops or leaves", () => {
    const plan: Plan = { name: "A part", steps: [{ label: "bay", parts: ["bay"] }] };
    const sim = dock(world());
    sim.ship.credits = 1000;
    sim.ship.hull = 40;
    const bot = new Bot({ plan, log: new BotLog() });
    let ticks = 0;
    while (sim.canRepair(sim.ship) && ticks < Math.round(120 / TICK)) {
      playTick(sim, bot);
      expect(bot.log.inputs.filter((input) => input.kind === "buy"), "no shopping with repairs owing").toHaveLength(0);
      expect(sim.isDocked(), "no order to leave").toBe(true);
      ticks++;
    }
    expect(ticks, "the dock had repairs to do").toBeGreaterThan(0);
    // The hull first, as the dock does it, and only then the shopping.
    expect(sim.ship.hull).toBe(hullMax(sim.ship.model));
    play(sim, bot, 5);
    expect(bot.log.inputs.filter((input) => input.kind === "buy")).toHaveLength(1);
  });

  it("ends the run when the dock can't fix it", () => {
    const sim = dock(world());
    sim.ship.credits = 0;
    wear(sim, "gun", 1);
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    play(sim, bot, 2);
    expect(bot.end).toBe("stuck");
    expect(bot.log.end?.reason).toContain("gun 2 broken and the dock can't fix it, 0 cr in hand");
    expect(bot.log.events.map((event) => event.text).join("\n")).toContain(
      "stuck: gun 2 broken and the dock can't fix it, 0 cr in hand",
    );
  });

  it("keeps what a wrecked ship took, after the yard hands a new hull back", () => {
    const sim = world();
    const log = new BotLog();
    const bot = new Bot({ plan: FLOATER_JOURNEY, log });
    play(sim, bot, 1);
    sim.ship.damageTaken += 30;
    sim.ship.upkeep += 90;
    play(sim, bot, 1);
    // The new hull comes back with clean tallies: what the old one took is still the run's.
    sim.ship.damageTaken = 0;
    sim.ship.upkeep = 0;
    play(sim, bot, 1);
    expect(log.damage).toEqual({ hullLost: 30, repairCredits: 90 });
    expect(log.text(INFO)).toContain("Damage: 30 hull lost, 90 cr on repairs");
  });

  it("counts the hull lost and the credits spent on repairs", () => {
    const sim = world();
    const log = new BotLog();
    const bot = new Bot({ plan: FLOATER_JOURNEY, log });
    play(sim, bot, 1);
    sim.ship.damageTaken += 12;
    sim.ship.upkeep += 40;
    play(sim, bot, 1);
    expect(log.text(INFO)).toContain("Damage: 12 hull lost, 40 cr on repairs");
    const flat = JSON.parse(log.json(INFO));
    expect(flat.hullLost).toBe(12);
    expect(flat.repairCredits).toBe(40);
    expect(flat.breaks).toBe(0);
  });
});

describe("out to the field", () => {
  it("leaves the dock on a drag towards the field's marker, at the cruising speed", () => {
    const sim = dock(world());
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    bot.step(sim);
    expect(sim.clickPilot.drifting).toBe(true);
    const spot = sim.clickPilot.spot;
    expect(spot).not.toBeNull();
    const driftX = spot!.vx - sim.ship.vx;
    const driftY = spot!.vy - sim.ship.vy;
    expect(Math.hypot(driftX, driftY)).toBeCloseTo(CRUISE_SPEED, 6);
    const field = sim.miningFieldAt(sim.ship.x, sim.ship.y);
    expect(Math.atan2(driftY, driftX)).toBeCloseTo(Math.atan2(field.poi.y - sim.ship.y, field.poi.x - sim.ship.x), 6);
    expect(bot.log.inputs.some((input) => input.kind === "move" && input.detail.includes("drifting"))).toBe(true);
  });

  it("backs out clear of the hull with the field behind the station", () => {
    // The station's dock facing straight away from the field, close enough in to reach, and
    // neither of them turning: a trip out of it is a drag straight through the solid box.
    const sim = dock(
      world({ stationDistance: 1200, stationPhase: Math.PI, stationSpinPhase: Math.PI, orbitPeriod: 1e9, stationRotationPeriod: 1e9 }),
    );
    const station = sim.station;
    const field = sim.miningFieldAt(sim.ship.x, sim.ship.y);
    // Nothing on the way to stop for, so the station is the only thing in it.
    sim.rocks.length = 0;
    const cos = Math.cos(station.rotation);
    const sin = Math.sin(station.rotation);
    const dx = field.poi.x - sim.ship.x;
    const dy = field.poi.y - sim.ship.y;
    // The field straight behind the dock, in the station's own axes.
    expect(dx * cos + dy * sin).toBeLessThan(0);
    expect(Math.abs(-dx * sin + dy * cos)).toBeLessThan(1);
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    const reach = STATION_HALF + SHIP_RADIUS;
    let closest = Infinity;
    let reached = 0;
    for (let i = 0; i < Math.round(20 / TICK); i++) {
      playTick(sim, bot);
      // The ship in the station's own axes, as the hull sweep sees it.
      const sx = sim.ship.x - station.x;
      const sy = sim.ship.y - station.y;
      closest = Math.min(closest, Math.max(Math.abs(sx * cos + sy * sin), Math.abs(-sx * sin + sy * cos)) - reach);
      if (!reached && Math.hypot(field.poi.x - sim.ship.x, field.poi.y - sim.ship.y) < field.radius) reached = i * TICK;
    }
    // Never within the hull's width of the solid box, and at the field inside the twenty seconds.
    expect(closest).toBeGreaterThan(0);
    expect(reached).toBeGreaterThan(0);
    expect(reached).toBeLessThan(20);
    // It went round the station, slowly, rather than dragging straight through it.
    expect(bot.log.inputs.some((input) => input.kind === "move" && input.detail.includes("round Station"))).toBe(true);
    expect(bot.log.inputs.some((input) => input.kind === "move" && input.detail.includes(`drifting ${UNDOCK_SPEED}`))).toBe(true);
  });

  it("backs out clear of the hull when the dock drift has already left it", () => {
    // The drift step 1 measured: the ship is out of the berth, sideways and still moving, before
    // `Bot.leave` ever runs, so the way out has to be given from space.
    const sim = world({ stationDistance: 1200, stationPhase: Math.PI, stationSpinPhase: Math.PI, orbitPeriod: 1e9, stationRotationPeriod: 1e9 });
    const station = sim.station;
    const cos = Math.cos(station.rotation);
    const sin = Math.sin(station.rotation);
    const at = (x: number, y: number) => ({ x: station.x + x * cos - y * sin, y: station.y + x * sin + y * cos });
    // Just out of the berth's side, at the dock's own distance out: inside the station's ring, and
    // still crossing the hull on the way to the field.
    const out = at(DOCK_OFFSET, STATION_HALF + 5);
    Object.assign(sim.ship, { x: out.x, px: out.x, y: out.y, py: out.y, vx: -sin * 70, vy: cos * 70 });
    expect(sim.isDocked()).toBe(false);
    const field = sim.miningFieldAt(sim.ship.x, sim.ship.y);
    sim.rocks.length = 0;
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    const reach = STATION_HALF + SHIP_RADIUS;
    let closest = Infinity;
    let reached = false;
    for (let i = 0; i < Math.round(20 / TICK); i++) {
      playTick(sim, bot);
      const sx = sim.ship.x - station.x;
      const sy = sim.ship.y - station.y;
      closest = Math.min(closest, Math.max(Math.abs(sx * cos + sy * sin), Math.abs(-sx * sin + sy * cos)) - reach);
      if (Math.hypot(field.poi.x - sim.ship.x, field.poi.y - sim.ship.y) < field.radius) reached = true;
    }
    expect(closest).toBeGreaterThan(0);
    expect(reached).toBe(true);
    // The way out was still owed, and given from space: round the station, slowly.
    expect(bot.log.inputs.some((input) => input.kind === "move" && input.detail.includes("round Station"))).toBe(true);
  });

  it("stops the moment a rock is in sight, and leaves it alone", () => {
    const sim = dock(world());
    const field = sim.miningFieldAt(sim.ship.x, sim.ship.y);
    const dx = field.poi.x - sim.ship.x;
    const dy = field.poi.y - sim.ship.y;
    const out = Math.hypot(dx, dy);
    const rock = sim.makeRock(2, sim.ship.x + (dx / out) * 1000, sim.ship.y + (dy / out) * 1000, 0, 0);
    rock.hp = 500;
    sim.rocks.push(rock);
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    let stopped: { active: boolean; task: string } | null = null;
    for (let i = 0; i < Math.round(20 / TICK); i++) {
      playTick(sim, bot);
      if (stopped === null && bot.log.inputs.some((input) => input.kind === "stop" && input.detail === "a rock in sight")) {
        stopped = { active: sim.clickPilot.active, task: sim.clickPilot.task };
      }
    }
    expect(stopped, "said it stopped for the rock").not.toBeNull();
    // The move is off and the ship is coming to rest, not coasting into what it saw.
    expect(stopped!.active).toBe(true);
    expect(stopped!.task).toBe("stopping");
    expect(sim.ship.damageTaken).toBe(0);
  });

  it("holds the speed to the cruise on a clear trip out", () => {
    const sim = dock(world());
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    let peak = 0;
    for (let i = 0; i < Math.round(120 / TICK); i++) {
      playTick(sim, bot);
      peak = Math.max(peak, Math.hypot(sim.ship.vx, sim.ship.vy));
      if (bot.log.inputs.some((input) => input.kind === "stop")) break;
    }
    // It really is cruising, and the drag holds it there rather than throwing it at the rocks.
    expect(peak).toBeGreaterThan(CRUISE_SPEED * 0.9);
    expect(peak).toBeLessThan(CRUISE_SPEED * 1.25);
  });

  it("can come to rest from the cruising speed inside SIGHT", () => {
    const sim = world();
    const probe = new Probe(sim.ship);
    expect(probe.stopDistance(sim, CRUISE_SPEED)).toBeLessThanOrEqual(0.9 * SIGHT);
  });
});

describe("mining close and clean", () => {
  /** The ship at rest inside the field, with the field's own rocks out, so a test's rock is all there is. */
  function cleared(extra: Partial<Tuning> & Partial<Home> = {}): Sim {
    const sim = world(extra);
    sim.rocks.length = 0;
    // Inside the field: a rock outside its edge is drawn back in, and wouldn't hold still under the ore.
    const field = sim.miningFieldAt(sim.ship.x, sim.ship.y);
    sim.ship.x = sim.ship.px = field.poi.x - field.radius * 0.4;
    sim.ship.y = sim.ship.py = field.poi.y;
    sim.ship.vx = sim.ship.vy = 0;
    sim.ship.spin = 0;
    return sim;
  }

  it("goes in close before it fires, rather than shooting from the gun's full reach", () => {
    const sim = cleared();
    const rock = sim.makeRock(1, sim.ship.x + 900, sim.ship.y, 0, 0);
    rock.hp = 4000;
    sim.rocks.push(rock);
    sim.ship.angle = 0;
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    const near = rock.radius + FIRE_CLOSE;
    let shots = 0;
    let far = 0;
    for (let i = 0; i < Math.round(40 / TICK); i++) {
      const at = Math.hypot(rock.x - sim.ship.x, rock.y - sim.ship.y);
      const before = bot.log.inputs.length;
      playTick(sim, bot);
      for (const input of inputsOf(bot.log, before)) {
        if (input.kind !== "fire") continue;
        shots++;
        if (at > near) far++;
      }
    }
    // It moved in, and every burst it opened was from inside the close range.
    expect(bot.log.inputs.some((input) => input.kind === "move")).toBe(true);
    expect(shots, "it fired at all").toBeGreaterThan(0);
    expect(far, "no shot from beyond the close range").toBe(0);
  }, 30000);

  it("goes back for ore its own shot freed before it breaks another rock", () => {
    const sim = cleared();
    // A rock it could break straight away, and a piece its own gun freed 600 out: a trip, but its own.
    const rock = sim.makeRock(2, sim.ship.x + 250, sim.ship.y, 0, 0);
    rock.hp = 4000;
    sim.rocks.push(rock);
    sim.ores.push(oreAt(sim.ship.x - 600, sim.ship.y, sim.ship));
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    play(sim, bot, 6);
    const said = bot.log.inputs.map((input) => `${input.kind} ${input.detail}`);
    expect(said.some((line) => line.startsWith("move through a piece of ore"))).toBe(true);
    expect(said.some((line) => line.startsWith("fire")), "nothing broken for a second rock").toBe(false);
  }, 30000);

  it("works the pieces of the rock it broke until they are gone, before it starts another", () => {
    const sim = cleared();
    // A rock that breaks in one shot, and a bigger one further off that scores better once its
    // pieces are small: without the set of worked rocks, the bot would turn to the bigger one.
    const rock = sim.makeRock(2, sim.ship.x + 300, sim.ship.y, 0, 0);
    rock.hp = 40;
    sim.rocks.push(rock);
    const better = sim.makeRock(2, sim.ship.x - 700, sim.ship.y, 0, 0);
    better.hp = 4000;
    sim.rocks.push(better);
    sim.ship.angle = 0;
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    const worked = new Set<Rock>([rock]);
    const seen = new Set(sim.rocks);
    let broke = false;
    for (let i = 0; i < Math.round(120 / TICK); i++) {
      const before = bot.log.inputs.length;
      playTick(sim, bot);
      for (const each of sim.rocks) {
        if (seen.has(each)) continue;
        seen.add(each);
        worked.add(each);
        broke = true;
      }
      // Every burst it opens is at a rock of the set it's working.
      for (const input of inputsOf(bot.log, before)) {
        if (input.kind !== "fire") continue;
        const aim = sim.ship.aim;
        let nearest: Rock | null = null;
        let best = Infinity;
        for (const each of sim.rocks) {
          const away = aim === null ? Infinity : Math.hypot(each.x - aim.x, each.y - aim.y);
          if (away < best) {
            best = away;
            nearest = each;
          }
        }
        expect(nearest !== null && worked.has(nearest), "a shot at a rock it set out on").toBe(true);
      }
      const left = [...worked].filter((each) => each.hp > 0 && sim.rocks.includes(each));
      if (broke && left.length === 0) break;
    }
    // It broke the rock it set out on, worked its pieces, and never turned to the better one.
    expect(broke, "it broke the rock it set out on").toBe(true);
    expect(worked.size).toBeGreaterThan(1);
    expect(better.hp).toBe(4000);
  }, 60000);

  it("goes in at the ore a rock holds against itself, slowly, rather than round the rock", () => {
    const sim = cleared();
    const rock = sim.makeRock(1, sim.ship.x - 500, sim.ship.y, 0, 0);
    rock.hp = 4000;
    sim.rocks.push(rock);
    const start = { x: rock.x, y: rock.y };
    const from = { x: sim.ship.x, y: sim.ship.y };
    // Its own ore, lying against the rock's near side: inside the reach of a hull up against it.
    const ore = oreAt(rock.x + rock.radius - 8, rock.y, sim.ship);
    sim.ores.push(ore);
    sim.ship.angle = Math.PI;
    const bot = new Bot({ plan: FLOATER_JOURNEY, log: new BotLog() });
    let closest = Infinity;
    let speedAtTake: number | null = null;
    let last = 0;
    for (let i = 0; i < Math.round(20 / TICK); i++) {
      last = Math.hypot(sim.ship.vx, sim.ship.vy);
      playTick(sim, bot);
      closest = Math.min(closest, Math.hypot(rock.x - sim.ship.x, rock.y - sim.ship.y));
      if (sim.oreIn(sim.ship) > 0) {
        speedAtTake = last;
        break;
      }
    }
    // The order goes at the ore through the rock's line, not round the rock: a way round the
    // rock keeps a hull's clearance from it, which is the slip this step takes away.
    const spot = bot.log.inputs.find((input) => input.kind === "move" && input.detail.startsWith("through a piece of ore"));
    expect(spot, "an order at the ore").toBeDefined();
    const [x, y] = spot!.detail.replace(/^through a piece of ore at /, "").split(", ").map(Number);
    const out = Math.hypot(x - from.x, y - from.y) || 1;
    const across = Math.abs((start.x - from.x) * ((y - from.y) / out) - (start.y - from.y) * ((x - from.x) / out));
    expect(across, "the order goes at the rock, not round it").toBeLessThan(rock.radius + 20);    // In at it, well inside the clearance a way round the rock would have kept.
    expect(closest).toBeLessThan(rock.radius + SHIP_CLEARANCE / 2);
    expect(sim.oreIn(sim.ship), "the ore in the bay within 20 s").toBeGreaterThan(0);
    // A walking pace, which `safeImpactSpeed` makes free: no dent, and no hull lost.
    expect(speedAtTake).not.toBeNull();
    expect(speedAtTake!).toBeLessThan(sim.tuning.safeImpactSpeed);
    expect(sim.ship.damageTaken).toBe(0);
  }, 30000);
});
