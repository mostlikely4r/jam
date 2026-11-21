import { describe, expect, it } from "vitest";
import { hullMax, refresh } from "../fitting";
import { homeSim, type Home } from "../home";
import { partOf } from "../parts";
import { ClickPilot } from "../pilot";
import { DOCK_OFFSET, type Rock, type Sim, TICK } from "../sim";
import { DEFAULTS, type Tuning } from "../tuning";
import { BOT_CALLS, Bot, CRUISE_SPEED, SIGHT } from "./bot";
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
