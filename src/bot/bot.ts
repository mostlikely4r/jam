/**
 * A player that plays. The bot flies the game's own ship with nothing but what a player has:
 * the click orders, the turret's aim, the fire button, the dock's shop. It works the first step
 * of its plan it hasn't got and mines in between, asking the game for every price and refusing
 * nothing but what the game refuses. Its worth is the snags it finds: when it stalls, the game
 * didn't support the path the plan meant.
 *
 * `step(sim)` is called once per tick, before `sim.step()`, where the game reads its own input.
 */
import { computerSize } from "../fitting";
import { isOreItem } from "../items";
import { isProgram, partOf, type PartId } from "../parts";
import { TICK, type Loose, type Poi, type Rock, type Sim } from "../sim";
import { BotLog } from "./log";
import { currentStep, missingPart, stepName, working, type Plan } from "./plan";

/** How long it can go with no step done and no credits earned before the run is stuck. */
export const STUCK_MINUTES = 15;
/** How far out it looks for a rock worth breaking. */
const ROCK_REACH = 3000;
/** How far out a piece of loose ore is worth a trip: a floater can't chase what drifts away. */
const ORE_REACH = 250;
/** Ore this close is picked up before anything is broken: a grab, not a trip. */
const GRAB_DISTANCE = 200;
/** How long it will try for the same piece of ore before leaving it to drift. */
const CHASE_SECONDS = 40;
/** How many seconds of a piece's drift to lead it by, so a move through it meets it. */
const ORE_LEAD = 4;
/** The nearest it parks to a rock, and the most of its gun's reach it will use. */
const STANDOFF = 400;
/** The fastest it fires at, so its own drift doesn't carry the shots wide. */
const FIRE_SPEED = 60;
/** The fastest the hull turns by hand, in radians a second. */
const TURN_RATE = 1;
/** How far off a rock the nose or the turret may be, in radians, for a shot to be worth taking. */
const AIM_ANGLE = 0.05;
/** How far past a rock it slips when one is in the way: more than the hull, so a pass is clean. */
const SHIP_CLEARANCE = 120;
/** Where an order aims has to move this far before it's worth giving another. */
const REPEAT_DISTANCE = 150;
/** How close to the spot it was sent to counts as arrived. */
const ARRIVED = 100;
/** And this long passes, in case the world moves under a standing order. */
const REPEAT_SECONDS = 90;

/** Everything the bot may call on the sim: player inputs, and what it reads to decide. */
export const BOT_CALLS = {
  /** What a click, a keypress or a shop click does. */
  inputs: ["orderMove", "orderMoveStraight", "orderTravel", "orderStop", "buyPart", "fitItem", "setProgram", "chooseHull"],
  /** The ship's own screens: what a player can see before deciding. */
  reads: [
    "isDocked",
    "baseAt",
    "baseOf",
    "baseName",
    "baseField",
    "nearestBase",
    "nearestDock",
    "dockPoint",
    "lockerAt",
    "miningFieldAt",
    "fieldName",
    "oreIn",
    "cargoSpace",
    "partPrice",
    "canBuy",
    "whereBuyGoes",
    "rebuildOffer",
    "shipResponse",
  ],
} as const;

export interface BotOptions {
  plan: Plan;
  log?: BotLog;
  /** Game minutes without progress before the run is stuck. Tests shorten it; a run uses STUCK_MINUTES. */
  stuckMinutes?: number;
  /** Whether it starts a game of its own, or takes the ship from a running one. */
  fresh?: boolean;
}

/** What it did in the dock it's in, so it says so once. */
interface Visit {
  /** Ore aboard when it came in, and what the dock pays for it. */
  ore: number;
  value: number;
  sold: boolean;
}

/** A wreck not yet accounted for: what it took, and whether the new ship is back. */
interface Loss {
  at: number;
  ore: number;
  cost: number;
}

export class Bot {
  readonly plan: Plan;
  readonly log: BotLog;
  /** Why the run ended, once it has: the goal is reached, or it's stuck. */
  end: "goal" | "stuck" | null = null;
  /** The step it's on, in words, for whatever is watching it play. */
  where = "";
  /** The step it last started, so each is announced once. -1 until the first tick. */
  private at = -1;
  private began = false;
  private readonly stuck: number;
  private readonly fresh: boolean;
  private lastProgress = 0;
  /** The ship's earned credits as last seen, for what counts as progress. */
  private earned = 0;
  /** Wrecks this ship had last time it was looked at. */
  private wrecks = 0;
  /** Ore counted on the tick before: the wreck itself empties the bay. */
  private oreAboard = 0;
  /** The wreck still to be accounted for. */
  private loss: Loss | null = null;
  /** Said once per wreck: the pod is on its way. */
  private podSaid = false;
  /** The dock it's in, when it's in one. */
  private visit: Visit | null = null;
  /** When the last order was given, and where it was sent, so a standing one isn't repeated. */
  private orderAt: number | null = null;
  private ordered: { x: number; y: number } | null = null;
  /** When the last order was given afresh: a chased piece of ore is followed as it drifts. */
  private freshAt: number | null = null;
  /** When a click order was last given, so a loop of them can't flood the log. */
  private clickedAt: number | null = null;
  /** The ore it's after, and since when: what drifts away isn't worth chasing for ever. */
  private chase: { ore: Loose; since: number; from: number } | null = null;
  /** Ore it has given up on. */
  private ignored = new Set<Loose>();
  /** The rock it's working, kept until it's broken: a new nearest one every tick would be a dancer. */
  private mark: Rock | null = null;
  /** The standoff point it picked beside a rock, kept while the rock stays put. */
  private beside: { rock: Rock; x: number; y: number } | null = null;
  /** Which way the turn keys are held, when they last went down, so a held turn is one input. */
  private turnPush = 0;
  private turnAt: number | null = null;
  /** Whether it's holding the fire button down. */
  private firing = false;
  /** Why it last set out for home, so the trip is announced once. */
  private homeSaid: string | null = null;
  /** The dock it's making for, kept until it's in. */
  private dock: Poi | null = null;
  /** Whether it was in a dock last tick, so arriving is said once. */
  private port = false;
  /** Snags already said, by part and reason: the same refusal at every dock is one finding. */
  private said = new Set<string>();

  constructor(options: BotOptions) {
    this.plan = options.plan;
    this.log = options.log ?? new BotLog();
    this.stuck = (options.stuckMinutes ?? STUCK_MINUTES) * 60;
    this.fresh = options.fresh ?? true;
  }

  /** One tick of play, before the world moves. */
  step(sim: Sim): void {
    if (this.end) return;
    if (!this.began) this.begin(sim);
    this.oreAboard = sim.oreIn(sim.ship);
    this.noteWreck(sim);
    if (sim.down) {
      this.down(sim);
      return;
    }
    this.noteBack(sim);
    this.track(sim);
    if (this.end) return;
    const docked = sim.isDocked();
    if (docked && !this.port) this.arrive(sim);
    this.port = docked;
    if (docked) this.inDock(sim);
    else this.inSpace(sim);
    if (sim.ship.earned !== this.earned) {
      this.earned = sim.ship.earned;
      this.log.sample(sim.now, this.earned);
    }
  }

  private begin(sim: Sim): void {
    this.began = true;
    this.log.begin(sim.now);
    this.lastProgress = sim.now;
    this.earned = sim.ship.earned;
    this.wrecks = sim.ship.wrecks;
    this.where = stepName(sim.ship, this.plan);
    this.log.event(sim.now, `${this.fresh ? "new game" : "bot in"}, ${sim.ship.model}, ${Math.round(sim.ship.credits)} cr`);
  }

  // The plan, and how the run ends.

  /** Announces the step it's on, and ends the run at the goal or once it has stalled. */
  private track(sim: Sim): void {
    const { now } = sim;
    const step = currentStep(sim.ship, this.plan);
    if (step === null) {
      // The last step done counts too, so the report has the time of it.
      for (let done = Math.max(0, this.at); done < this.plan.steps.length; done++) this.log.step(done, this.plan.steps[done].label, now);
      this.at = this.plan.steps.length;
      this.where = stepName(sim.ship, this.plan);
      this.log.event(now, `goal reached: all ${this.plan.steps.length} steps`);
      this.finish(sim, "goal");
      return;
    }
    if (step !== this.at) {
      // Steps only go backwards when a wreck takes something away, which the log says above.
      if (this.at >= 0 && step > this.at) for (let done = this.at; done < step; done++) this.log.step(done, this.plan.steps[done].label, now);
      this.at = step;
      this.where = stepName(sim.ship, this.plan);
      this.log.event(now, `step ${step + 1}: ${this.plan.steps[step].label}`);
      this.lastProgress = now;
      this.orderAt = null;
    }
    if (sim.ship.earned > this.earned) {
      this.earned = sim.ship.earned;
      this.log.sample(now, this.earned);
      this.lastProgress = now;
    }
    if (now - this.lastProgress > this.stuck) this.finish(sim, "stuck");
  }

  private finish(sim: Sim, why: "goal" | "stuck"): void {
    const step = stepName(sim.ship, this.plan);
    this.end = why;
    this.log.end = { why, at: sim.now, step };
    if (why === "stuck") {
      const field = sim.miningFieldAt(sim.ship.x, sim.ship.y);
      const past = Math.hypot(field.poi.x - sim.ship.x, field.poi.y - sim.ship.y) - field.radius;
      const last = this.log.inputs.slice(-3).map((input) => `${input.kind} ${input.detail}`);
      this.log.event(
        sim.now,
        [
          `stuck on ${step}: nothing bought and nothing earned for ${Math.round(this.stuck / 60)} game minutes`,
          `  at ${Math.round(sim.ship.x)}, ${Math.round(sim.ship.y)}, ${Math.round(past)} past the edge of ${sim.fieldName(field.id)}`,
          `  credits ${Math.round(sim.ship.credits)}, ${sim.oreIn(sim.ship)} ore aboard`,
          `  last inputs: ${last.join(" | ") || "none"}`,
        ].join("\n"),
      );
    }
    this.trigger(sim, false, "");
    if (sim.clickPilot.active) sim.orderStop();
    this.orderAt = null;
  }

  // A wreck, the pod, and the yard.

  private noteWreck(sim: Sim): void {
    if (sim.ship.wrecks <= this.wrecks) return;
    this.wrecks = sim.ship.wrecks;
    const field = sim.miningFieldAt(sim.ship.x, sim.ship.y);
    this.log.event(sim.now, `wrecked in ${sim.fieldName(field.id)}, ${this.oreAboard} ore and ${Math.max(0, Math.round(sim.ship.credits))} cr aboard`);
    this.loss = { at: sim.now, ore: this.oreAboard, cost: 0 };
    this.visit = null;
    this.orderAt = null;
    this.trigger(sim, false, "");
  }

  /** The yard has handed the ship back: says what the wreck cost, and plays on from the dock. */
  private noteBack(sim: Sim): void {
    const loss = this.loss;
    if (!loss || !sim.isDocked()) return;
    this.loss = null;
    this.podSaid = false;
    const minutes = Math.max(1, Math.round((sim.now - loss.at) / 60));
    this.log.wrecks.push({ at: loss.at, ore: loss.ore, back: sim.now, cost: loss.cost });
    this.log.event(sim.now, `back in a ship ${minutes} min later, the yard took ${loss.cost} cr, ${Math.round(sim.ship.credits)} cr aboard`);
    this.visit = null;
    this.orderAt = null;
    this.lastProgress = sim.now;
  }

  /** Riding the pod, or waiting on the yard: the game flies it, and the choice is the player's. */
  private down(sim: Sim): void {
    this.trigger(sim, false, "");
    this.visit = null;
    this.orderAt = null;
    const down = sim.down;
    if (!down) return;
    if (down.stage === "pod") {
      // Said once the wreck itself is on the record, so the log reads in the order it happened.
      if (this.podSaid || !this.loss) return;
      this.podSaid = true;
      this.log.event(sim.now, "the pod is on its way to the yard");
      return;
    }
    if (down.stage !== "choosing") return;
    // A journey is worth keeping: rebuild as it was when that can be paid for, else a bare hull.
    const offer = sim.rebuildOffer();
    const hull = sim.hullPrice(sim.ship.model);
    if (offer.missing.length === 0 && sim.ship.credits >= offer.cost - hull) {
      this.log.input(sim.now, "rebuild", `as it was, ${offer.cost} cr and ${Math.ceil(offer.seconds)} s`);
      if (this.loss) this.loss.cost = offer.cost;
      if (sim.chooseHull(true)) return;
    }
    this.log.input(sim.now, "hull", `a bare ${sim.ship.model}, ${hull} cr`);
    if (this.loss) this.loss.cost = hull;
    sim.chooseHull(false);
  }

  // In a dock: sell, buy, leave.

  /** In the dock at last: the trip is over, so nothing is flown and nothing is fired at. */
  private arrive(sim: Sim): void {
    this.trigger(sim, false, "");
    if (sim.clickPilot.active) sim.orderStop();
    this.orderAt = null;
    this.visit = null;
    this.homeSaid = null;
    this.dock = null;
  }

  private inDock(sim: Sim): void {
    const base = sim.baseAt();
    if (!base) return;
    const { now } = sim;
    const ore = sim.oreIn(sim.ship);
    const visit = this.visit ?? (this.visit = { ore, value: this.oreValue(sim), sold: false });
    // The dock sells the ore aboard by itself, a piece at a time: stay until it's gone.
    if (ore > 0) return;
    if (visit.ore > 0 && !visit.sold) {
      visit.sold = true;
      this.log.event(now, `docked at ${sim.baseName(base.id)}, sold ${visit.ore} ore for ${visit.value} cr, ${Math.round(sim.ship.credits)} in hand`);
    }
    if (this.buy(sim)) return;
    // Nothing the journey wants is here or affordable: back out to the rocks.
    this.leave(sim);
  }

  /** What the dock pays for the ore aboard: each item's own price, which is what it gives. */
  private oreValue(sim: Sim): number {
    let value = 0;
    for (const placed of sim.ship.hold) if (isOreItem(placed.module.part)) value += partOf(placed.module.part).price;
    return value;
  }

  /** Buys the next thing the journey needs, if this shop will sell it. Says whether it did anything. */
  private buy(sim: Sim): boolean {
    const { ship, now } = sim;
    const step = currentStep(ship, this.plan);
    if (step === null) return false;
    const want = missingPart(ship, this.plan.steps[step]);
    if (!want) return false;
    const label = partOf(want).label.toLowerCase();
    this.makeRoom(sim, want);
    // Owned but not running: a program with no free slot, which the game reports by doing nothing.
    if (ship.software.has(want)) {
      if (sim.setProgram(ship, want, true)) {
        this.log.event(now, `${label} loaded and running`);
        return true;
      }
      this.snag(sim, want, this.slotsReason(sim));
      return false;
    }
    if (!sim.canBuy(ship, want)) {
      this.snag(sim, want, "this shop can't sell it to this ship");
      return false;
    }
    // Where the game would put it, asked before it's bought: a bay that isn't free goes in the hold.
    const where = sim.whereBuyGoes(ship, want);
    const price = sim.partPrice(want);
    // What it can't pay for, the shop's own line won't sell: mine some more first.
    if (ship.credits < price) return false;
    this.log.input(now, "buy", `${label} for ${price} cr`);
    if (!sim.buyPart(ship, want)) {
      this.snag(sim, want, sim.buyRefused ?? "the shop turned it down");
      return false;
    }
    if (isProgram(want)) {
      if (working(ship, want)) this.log.event(now, `bought ${label} (${price}), running`);
      else this.snag(sim, want, this.slotsReason(sim));
      return true;
    }
    if (where === null || where === "mount") {
      this.log.event(now, `bought ${label} (${price}), fitted`);
      return true;
    }
    // It went into the bay or the locker: fit it from there, as a click on Fit does.
    const base = sim.baseAt();
    const index = where === "hold" ? ship.hold.length - 1 : base ? sim.lockerAt(base).items.length - 1 : -1;
    if (index >= 0 && sim.fitItem(ship, where === "hold" ? { at: "hold", index } : { at: "locker", index })) {
      this.log.event(now, `bought ${label} (${price}), fitted`);
    } else {
      this.snag(sim, want, "the ship wouldn't take it");
    }
    return true;
  }

  /**
   * Makes room in a full computer for a program the journey still wants. The turret aims for
   * the ship, so click-to-turn is the one that goes: what it does by hand the bot does with the
   * turn keys anyway. A player unloads it in the inventory the same way.
   */
  private makeRoom(sim: Sim, want: PartId): void {
    const { ship } = sim;
    if (!isProgram(want) || ship.programs.length < computerSize(ship)) return;
    if (!ship.parts.has("turret") || !ship.parts.has("clickTurn")) return;
    if (!sim.setProgram(ship, "clickTurn", false)) return;
    this.log.input(sim.now, "unload", `${partOf("clickTurn").label.toLowerCase()}, making room for ${partOf(want).label.toLowerCase()}`);
  }

  /** Why a program won't load, in the game's own numbers. */
  private slotsReason(sim: Sim): string {
    const { programs } = sim.ship;
    return `no free program slot (${programs.length} of ${computerSize(sim.ship)} in use)`;
  }

  /** Out of the dock and back to the rocks, by the click order a player has from the start. */
  private leave(sim: Sim): void {
    const base = sim.baseAt();
    const station = base?.poi;
    if (!base || !station) return;
    const field = this.field(sim);
    const from = sim.dockPoint(false, station);
    const dx = field.poi.x - from.x;
    const dy = field.poi.y - from.y;
    const out = Math.hypot(dx, dy) || 1;
    const spot = { x: field.poi.x - (dx / out) * field.radius * 0.45, y: field.poi.y - (dy / out) * field.radius * 0.45 };
    this.visit = null;
    this.head(sim, spot, `out to ${sim.fieldName(field.id)}`);
  }

  // Out in space: rock, ore, and the way home.

  private inSpace(sim: Sim): void {
    const { ship } = sim;
    this.visit = null;
    // `cargoSpace` is the room left, not the hold's size: none left and it's full.
    if (this.oreAboard > 0 && sim.cargoSpace(ship) < 1) {
      this.home(sim, "the hold is full");
      return;
    }
    const rock = this.nearestRock(sim);
    const ore = this.nearestOre(sim);
    // Ore already loose and close is the cheapest thing to carry: take it before breaking more.
    // Farther out, the rock in reach comes first, since it's the ore it lets go that's wanted.
    if (ore && (!rock || Math.hypot(ore.x - ship.x, ore.y - ship.y) < GRAB_DISTANCE)) {
      this.fetch(sim, ore);
      return;
    }
    if (rock && this.inReach(sim, rock)) {
      this.shoot(sim, rock);
      return;
    }
    if (ore) {
      this.fetch(sim, ore);
      return;
    }
    if (rock) {
      this.shoot(sim, rock);
      return;
    }
    // Nothing to work: deeper into the field, or home with what it has.
    if (this.oreAboard > 0) {
      this.home(sim, "nothing left in reach");
      return;
    }
    const field = this.field(sim);
    const spot = { x: field.poi.x - field.radius * 0.4, y: field.poi.y };
    this.trigger(sim, false, "");
    if (Math.hypot(spot.x - ship.x, spot.y - ship.y) > field.radius * 0.5) {
      this.head(sim, spot, `deeper into ${sim.fieldName(field.id)}`);
      return;
    }
    // Sitting in an empty field: nothing to do until rocks drift in.
    if (sim.clickPilot.active) sim.orderStop();
  }

  /** The field it works: the one whose edge is nearest the ship, as a player drifting in would pick. */
  private field(sim: Sim): { id: string; poi: Poi; radius: number; full: number } {
    return sim.miningFieldAt(sim.ship.x, sim.ship.y);
  }

  /** The nearest piece of ore close enough to be worth the trip, or null. */
  private nearestOre(sim: Sim): Loose | null {
    const { ship } = sim;
    let best: Loose | null = null;
    let bestDistance = ORE_REACH;
    for (const ore of sim.ores) {
      if (this.ignored.has(ore)) continue;
      const distance = Math.hypot(ore.x - ship.x, ore.y - ship.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = ore;
      }
    }
    return best;
  }

  /** The rock it's working, or else the nearest one worth breaking, or null. */
  private nearestRock(sim: Sim): Rock | null {
    const { ship } = sim;
    let best: Rock | null = null;
    let bestScore = Infinity;
    for (const rock of sim.rocks) {
      if (rock.arriving || rock.hp <= 0) continue;
      const distance = Math.hypot(rock.x - ship.x, rock.y - ship.y);
      if (distance > ROCK_REACH) continue;
      // A bigger rock holds more ore for the same turning: the nearest of the biggest it can see.
      const score = distance / (rock.tier + 1);
      if (score < bestScore) {
        bestScore = score;
        best = rock;
      }
    }
    // One rock at a time: its pieces come loose where it was, and a ship that keeps changing its
    // mind never breaks anything. Only something much better takes over.
    if (this.mark && this.mark.hp > 0 && sim.rocks.includes(this.mark)) {
      const distance = Math.hypot(this.mark.x - ship.x, this.mark.y - ship.y);
      if (distance <= ROCK_REACH && distance / (this.mark.tier + 1) <= bestScore * 2.5) return this.mark;
    }
    this.mark = best;
    return best;
  }

  /** Collects a piece of ore: a move through where it will be, so the sweep takes it. */
  private fetch(sim: Sim, ore: Loose): void {
    const { ship, now } = sim;
    this.trigger(sim, false, "");
    // A piece that keeps getting away is left to drift: a floater can't catch what it can't reach.
    const away = Math.hypot(ore.x - ship.x, ore.y - ship.y);
    if (this.chase?.ore !== ore) {
      if (this.ignored.size > 100) this.ignored = new Set([...this.ignored].filter((each) => sim.ores.includes(each)));
      this.chase = { ore, since: now, from: away };
    } else if (now - this.chase.since > CHASE_SECONDS && away > this.chase.from * 0.9) {
      this.ignored.add(ore);
      this.chase = null;
      return;
    }
    // Where it will be when the ship gets there, and on past it: what the hull sweeps through is taken.
    const leadX = ore.x + ore.vx * ORE_LEAD;
    const leadY = ore.y + ore.vy * ORE_LEAD;
    this.aimAt(sim, leadX, leadY);
    const dx = leadX - ship.x;
    const dy = leadY - ship.y;
    const out = Math.hypot(dx, dy) || 1;
    this.head(sim, { x: leadX + (dx / out) * 250, y: leadY + (dy / out) * 250 }, "through a piece of ore", true);
  }

  /** Breaks the rock it's beside: parks it close, then turns the hull on it by hand and fires. */
  private shoot(sim: Sim, rock: Rock): void {
    const { ship, now } = sim;
    const reach = this.reach(sim);
    const distance = Math.hypot(rock.x - ship.x, rock.y - ship.y);
    // Where the rock will be when a shot gets there, less the way the ship carries its own shots.
    // Only from a near standstill: a ship still coming in would swing the aim about by its own
    // drift, and a facing that moves that fast never settles.
    const flight = distance / sim.tuning.shotSpeed;
    const still = Math.hypot(ship.vx, ship.vy) < FIRE_SPEED;
    const aimX = rock.x + (rock.vx - (still ? ship.vx : 0)) * flight;
    const aimY = rock.y + (rock.vy - (still ? ship.vy : 0)) * flight;
    this.aimAt(sim, aimX, aimY);
    // Close enough to shoot from: no more flying. A click order that has arrived settles on its
    // spot for a long while, tumbling as it trims the last of its speed, so a player clicks the
    // ship to stop and turns by hand. That handover is here, as soon as it's in range and slow.
    const inRange = distance <= reach * 0.8;
    const slow = Math.hypot(ship.vx, ship.vy) < FIRE_SPEED * 2.5;
    if (!inRange || !slow) {
      if (inRange) this.trigger(sim, false, "");
      // Beside it, on the side it came from, inside the guns' reach. The spot is kept while the
      // rock stays put, so a ship still coming in isn't chased by a moving order.
      const stand = Math.min(STANDOFF, Math.max(rock.radius + 160, 200));
      if (!this.beside || this.beside.rock !== rock || Math.hypot(this.beside.x - rock.x, this.beside.y - rock.y) > REPEAT_DISTANCE) {
        const dx = ship.x - rock.x;
        const dy = ship.y - rock.y;
        const out = Math.hypot(dx, dy) || 1;
        this.beside = { rock, x: rock.x + (dx / out) * stand, y: rock.y + (dy / out) * stand };
      }
      this.head(sim, this.beside, "beside a rock");
      return;
    }
    if (sim.clickPilot.active) {
      this.log.input(now, "stop", "close enough to shoot");
      sim.orderStop();
      this.orderAt = null;
    }
    this.turnTo(sim, Math.atan2(rock.y - ship.y, rock.x - ship.x));
    if (!ship.parts.has("turret")) {
      // The hull's own gun shoots where the nose points, so the nose has to point at it.
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(aimY - ship.y, aimX - ship.x) - ship.angle), Math.cos(Math.atan2(aimY - ship.y, aimX - ship.x) - ship.angle)));
      this.trigger(sim, off < (this.firing ? AIM_ANGLE * 3 : AIM_ANGLE), "at a rock");
      return;
    }
    // A turret turns to the aim on its own, so it may fire while the ship is still coming in.
    const want = Math.atan2(aimY - ship.y, aimX - ship.x) - ship.angle;
    const off = Math.abs(Math.atan2(Math.sin(want - ship.turretAngle), Math.cos(want - ship.turretAngle)));
    this.trigger(sim, off < (this.firing ? AIM_ANGLE * 3 : AIM_ANGLE), "at a rock");
  }

  /** Whether a rock is close enough that breaking it is worth a shot. */
  private inReach(sim: Sim, rock: Rock): boolean {
    return Math.hypot(rock.x - sim.ship.x, rock.y - sim.ship.y) <= this.reach(sim) * 0.8;
  }

  /** How far its guns reach, which the turret cuts to a third of. */
  private reach(sim: Sim): number {
    const { tuning } = sim;
    return tuning.shotSpeed * tuning.shotLife * (sim.ship.parts.has("turret") ? tuning.turretRange : 1);
  }

  /** Home to sell, by the autopilot's course once it has one and a click order before. */
  private home(sim: Sim, why: string): void {
    const { now } = sim;
    // One dock, picked and kept: two of them either side of the ship would have it turning
    // for a new one every few seconds, and never arriving at either.
    const nearest = sim.nearestDock(sim.ship.x, sim.ship.y);
    const held = this.dock;
    const away = held ? Math.hypot(sim.dockPoint(false, held).x - sim.ship.x, sim.dockPoint(false, held).y - sim.ship.y) : Infinity;
    const there = Math.hypot(sim.dockPoint(false, nearest).x - sim.ship.x, sim.dockPoint(false, nearest).y - sim.ship.y);
    const dock = held && away < there * 1.5 ? held : nearest;
    this.dock = dock;
    const name = sim.baseName(sim.baseOf(dock)?.id ?? "");
    this.trigger(sim, false, "");
    if (!this.homeSaid || this.homeSaid !== why) {
      this.homeSaid = why;
      this.log.event(now, `heading home: ${why}, ${this.oreAboard} ore aboard`);
    }
    if (!sim.ship.parts.has("autopilot")) {
      // A click on the berth, as a player gives with a right click, on a line picked to miss
      // the rocks in the way. The berth rides with the station, so the spot keeps up with the
      // dock as it goes round and the ship comes to rest in the box.
      this.head(sim, sim.dockPoint(false, dock), `home to ${name}`);
      return;
    }
    // A course chases the place as it moves: given once, and again if it has lost it.
    if (sim.clickPilot.target() !== null && this.orderAt !== null && now - this.orderAt < REPEAT_SECONDS) return;
    this.log.input(now, "course", `home to ${name}`);
    sim.orderTravel(dock);
    this.orderAt = now;
    this.ordered = sim.dockPoint(false, dock);
  }

  /**
   * A click order to a spot, as a player gives with a right click. While one is flying it's left
   * alone: the click pilot stops where it was told, and the next one comes from there.
   */
  private head(sim: Sim, spot: { x: number; y: number }, what: string, chase = false): void {
    const { now } = sim;
    // No more than one click a second: a loop of them would say nothing a player could read,
    // and a player's hand couldn't click faster either.
    if (this.clickedAt !== null && now - this.clickedAt < 1) return;
    // A click order brings the ship to rest on its spot and ends itself, so a click for a spot
    // it is already at is one it doesn't need. (It used to stand for twenty to forty seconds,
    // tumbling: docs/dock-click-plan.md, finding 2.)
    const target = sim.clickPilot.target();
    const close = target !== null && Math.hypot(target.x - sim.ship.x, target.y - sim.ship.y) < ARRIVED;
    if (sim.clickPilot.active && close) {
      this.log.input(now, "stop", "close enough");
      sim.orderStop();
      this.orderAt = null;
      this.ordered = null;
      return;
    }
    if (chase) {
      // What it's after drifts: a fresh order every so often keeps the aim on it, as a player
      // chasing a slow piece of ore would.
      const moved = this.ordered === null || Math.hypot(this.ordered.x - spot.x, this.ordered.y - spot.y) > 60;
      if (!moved && this.freshAt !== null && now - this.freshAt < 1) return;
    } else if (sim.clickPilot.target() !== null && this.orderAt !== null && now - this.orderAt < REPEAT_SECONDS) {
      return;
    }
    if (sim.clickPilot.active && sim.clickPilot.target() === null) sim.orderStop();
    const run = this.clearRun(sim, spot);
    this.log.input(now, "move", `${what} at ${Math.round(run.x)}, ${Math.round(run.y)}`);
    // The plain click a player gives, not the chart's straight line: a click on a pad comes
    // round the station to the dock instead of through the solid box, which is where a run
    // home used to end up sitting, 500 units out with its order still "flying".
    sim.orderMove(run.x, run.y);
    this.orderAt = now;
    this.clickedAt = now;
    this.freshAt = now;
    this.ordered = { x: run.x, y: run.y };
  }

  /**
   * How far it dares fly in one click order. A straight order flies at speed and smashes into
   * whatever drifts across its line, so it looks along the line and slips past the first rock
   * on it. A player sees that rock; a bot has to work it out.
   */
  private clearRun(sim: Sim, to: { x: number; y: number }): { x: number; y: number } {
    const { ship } = sim;
    const dx = to.x - ship.x;
    const dy = to.y - ship.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 150) return to;
    const ux = dx / distance;
    const uy = dy / distance;
    let first: Rock | null = null;
    let firstAt = Infinity;
    for (const rock of sim.rocks) {
      if (rock.hp <= 0) continue;
      const rx = rock.x - ship.x;
      const ry = rock.y - ship.y;
      const along = rx * ux + ry * uy;
      if (along <= 0 || along > distance + rock.radius) continue;
      if (Math.abs(rx * uy - ry * ux) > rock.radius + SHIP_CLEARANCE / 2) continue;
      if (along < firstAt) {
        firstAt = along;
        first = rock;
      }
    }
    if (!first) return to;
    // Past it on the side it's not, anchored to the rock so the order holds still as the ship comes on.
    const across = (first.x - ship.x) * uy - (first.y - ship.y) * ux;
    const slip = across >= 0 ? -1 : 1;
    const clear = first.radius + SHIP_CLEARANCE;
    return { x: first.x - uy * slip * clear + ux * clear, y: first.y + ux * slip * clear + uy * clear };
  }

  /**
   * Turns the hull by hand, as the keys do, to point the nose at something. The click pilot's
   * facing order whips a bare floater about: nothing on the hull damps a spin, and the order
   * changes every tick for a rock that drifts. A hand on the keys, with the spin held in its
   * own correction, comes to rest pointing where it was told.
   */
  private turnTo(sim: Sim, angle: number): void {
    const { ship, tuning } = sim;
    const accel = ((tuning.rotationThrust * Math.PI) / 180) * sim.shipResponse(ship);
    const error = Math.atan2(Math.sin(angle - ship.angle), Math.cos(angle - ship.angle));
    // A rate to settle on that keeps room to brake, then just make the spin that rate.
    const wanted = Math.max(-TURN_RATE, Math.min(TURN_RATE, error * 3));
    const change = wanted - ship.spin;
    // A deadband wide enough that a nose hunting a hair's width doesn't flicker the keys.
    const push = Math.abs(change) < Math.max(accel * TICK * 2, 0.08) ? 0 : Math.sign(change);
    // A held turn is one input: said when it starts, not every tick it's held.
    if (push !== 0 && (push !== this.turnPush || this.turnAt === null || sim.now - this.turnAt > 2)) {
      this.log.input(sim.now, "turn", `${Math.round((angle * 180) / Math.PI)} deg`);
      this.turnAt = sim.now;
    }
    this.turnPush = push;
    ship.controls.turn = push;
  }

  /** Where the turret, or the player's mouse, is pointed. */
  private aimAt(sim: Sim, x: number, y: number): void {
    sim.ship.aim = { x, y };
  }

  /** Fire is one input a burst: pressing it counts, holding it doesn't. */
  private trigger(sim: Sim, on: boolean, what: string): void {
    if (on === this.firing) return;
    this.firing = on;
    sim.controls.fire = on;
    if (on) this.log.input(sim.now, "fire", what);
  }

  /** A snag is said once per part and reason. */
  private snag(sim: Sim, part: PartId, why: string): void {
    const key = `${part}: ${why}`;
    if (this.said.has(key)) return;
    this.said.add(key);
    this.log.snag(sim.now, partOf(part).label.toLowerCase(), why);
  }
}
