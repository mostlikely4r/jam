/**
 * A player that plays. The bot flies the game's own ship with nothing but what a player has:
 * the click orders, the turret's aim, the fire button, the dock's shop. It works the first step
 * of its plan it hasn't got and mines in between, asking the game for every price and refusing
 * nothing but what the game refuses. Its worth is the snags it finds: when it stalls, the game
 * didn't support the path the plan meant.
 *
 * `step(sim)` is called once per tick, before `sim.step()`, where the game reads its own input.
 */
import { computerSize, works, type Module, type MountId } from "../fitting";
import { isOreItem } from "../items";
import { isProgram, partOf, type PartId } from "../parts";
import { DOCK_OFFSET, isRock, SHIP_RADIUS, STATION_HALF, TICK, type Loose, type Poi, type Rock, type Sim } from "../sim";
import { BotLog } from "./log";
import { currentStep, missingPart, stepName, working, type Plan } from "./plan";

/** How long it can go with no step done and no credits earned before the run is stuck. */
export const STUCK_MINUTES = 15;
/** How far out it looks for a rock worth breaking. */
const ROCK_REACH = 3000;
/** How far out a piece of loose ore is worth a trip: a floater can't chase what drifts away. */
const ORE_REACH = 250;
/**
 * How far out the ore its own shots freed is worth a trip. Its own work is a place it knows, so
 * it goes back for it, and the limit is what it can still catch rather than what it can see.
 */
const OWN_ORE_REACH = 800;
/** Ore this close is picked up before anything is broken: a grab, not a trip. */
const GRAB_DISTANCE = 200;
/** How near the ship a piece of its own ore has to leave the water to have been taken, not lost. */
const OWN_TAKEN = 60;
/** How long it will try for the same piece of ore before leaving it to drift. */
const CHASE_SECONDS = 40;
/** How many seconds of a piece's drift to lead it by, so a move through it meets it. */
const ORE_LEAD = 4;
/** How far off a rock's edge it fires from: near enough that what it frees lands on the ship. */
export const FIRE_CLOSE = 250;
/** How near a rock a piece of ore lies for the ship to bump the rock rather than go round it. */
const ORE_AGAINST = 40;
/**
 * How far past a piece of ore a slow move at it aims. A click order stops a hull's length and
 * more short of its spot, so this is what keeps the move going through the ore rather than
 * stopping beside it; it is also short enough that the pilot is braking as it arrives. Measured
 * on a piece lying against a rock: 40 to 50 units a second at the rock's edge, under
 * `safeImpactSpeed`, so the bump costs nothing.
 */
const ORE_EDGE = 150;
/** How fast a piece has to be drifting before the ship overtakes it rather than going in at it. */
const ORE_STILL = 30;
/** The fastest it fires at, so its own drift doesn't carry the shots wide. */
const FIRE_SPEED = 60;
/** The fastest the hull turns by hand, in radians a second. */
const TURN_RATE = 1;
/** How far off a rock the nose or the turret may be, in radians, for a shot to be worth taking. */
const AIM_ANGLE = 0.05;
/** How far past a rock it slips when one is in the way: more than the hull, so a pass is clean. */
export const SHIP_CLEARANCE = 120;
/** Where an order aims has to move this far before it's worth giving another. */
const REPEAT_DISTANCE = 150;
/** How close to the spot it was sent to counts as arrived. */
const ARRIVED = 100;
/** And this long passes, in case the world moves under a standing order. */
const REPEAT_SECONDS = 90;
/** How far out it counts a rock as in sight: half a 1920-wide window at the default zoom of 0.8. */
export const SIGHT = 1200;
/**
 * The fastest it crosses open space coming in to a field: 170 units a second, which the bare
 * floater can come to rest from in 1,034 units, inside 90% of `SIGHT`. A player's drag of it is
 * 544 pixels on screen (170 * `dragSeconds` 4 s * `zoom` 0.8), a little over a quarter of the
 * window: the user's own half-screen drag is 300 a second, which needs 1,800 to brake, more than
 * the half screen they have.
 */
export const CRUISE_SPEED = 170;
/** How far ahead of the ship a drag's spot sits: a hand starts one just off the ship, not on it. */
const DRAG_START = 60;
/**
 * How far from a station's middle the ship counts as clear of it: past every corner of the solid
 * box, the hull's own radius, and 40 more for the curve the pilot flies getting there.
 */
const STATION_CLEAR = Math.hypot(STATION_HALF, STATION_HALF) + SHIP_RADIUS + 40;
/**
 * How far from a station's middle a trip out still counts as leaving it: the far corner of its
 * dock, so a ship docked anywhere in the berth is leaving, and one passing further out is not.
 */
const STATION_NEAR = Math.hypot(DOCK_OFFSET + STATION_HALF, STATION_HALF);
/**
 * How fast a trip out backs away from the station it leaves, before it turns for the field: slow
 * enough that a hull rested against the dock's edge has nothing to run into.
 */
export const UNDOCK_SPEED = 60;
/** How far the solid box is padded when the way to the field is checked: the hull, and a margin. */
const STATION_PAD = STATION_HALF + SHIP_RADIUS + 20;
/**
 * How far out a way round a station may take the ship before it gives up and drags for the field
 * regardless: a field that close behind sits in the station's own shadow, and no way round.
 */
const STATION_GIVE_UP = STATION_CLEAR * 4;

/** Everything the bot may call on the sim: player inputs, and what it reads to decide. */
export const BOT_CALLS = {
  /** What a click, a keypress or a shop click does. */
  inputs: ["orderMove", "orderMoveStraight", "orderTravel", "orderStop", "buyPart", "fitItem", "setProgram", "chooseHull", "selectTarget", "setTweak"],
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
    "canRepair",
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

/** A world position in a station's own axes, so it turns with the station. */
function stationAxes(station: Poi, x: number, y: number): { x: number; y: number } {
  const dx = x - station.x;
  const dy = y - station.y;
  const cos = Math.cos(station.rotation);
  const sin = Math.sin(station.rotation);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

/**
 * Whether a straight line between two spots given in a station's own axes passes through the
 * square `half` across at its middle: a line that starts inside counts, since it has to leave.
 */
function crossesBox(from: { x: number; y: number }, to: { x: number; y: number }, half: number): boolean {
  let enter = 0;
  let exit = 1;
  for (const [start, span] of [[from.x, to.x - from.x], [from.y, to.y - from.y]] as const) {
    if (span === 0) {
      if (Math.abs(start) > half) return false;
      continue;
    }
    const near = (-half - start) / span;
    const far = (half - start) / span;
    enter = Math.max(enter, Math.min(near, far));
    exit = Math.min(exit, Math.max(near, far));
  }
  return enter <= exit;
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
  /** The most ore it has had aboard, so a hold filling up counts as the run working. */
  private oreBest = 0;
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
  /**
   * The rocks it's working: the one it set out on, and the pieces its breaks made of it. Kept
   * until all of them are gone, since a new nearest one every tick would be a dancer.
   */
  private worked = new Set<Rock>();
  /** Every rock it has seen, so a piece a break has just made can be told from one drifting in. */
  private known = new Set<Rock>();
  /** Where each rock of `worked` was last seen, for telling its pieces from the rest of the field. */
  private wasAt = new Map<Rock, { x: number; y: number }>();
  /** Ore its own shots freed that is still out there, and where it last saw each piece. */
  private ownOre = new Map<Loose, { x: number; y: number }>();
  /** The standoff point it picked beside a rock, and where the rock was then, kept while it stays put. */
  private beside: { rock: Rock; x: number; y: number; at: { x: number; y: number } } | null = null;
  /** Which way the turn keys are held, when they last went down, so a held turn is one input. */
  private turnPush = 0;
  private turnAt: number | null = null;
  /** Whether it's holding the fire button down. */
  private firing = false;
  /** Why it last set out for home, so the trip is announced once. */
  private homeSaid: string | null = null;
  /** The dock it's making for, kept until it's in. */
  private dock: Poi | null = null;
  /** The field a trip out is flying to, kept until it's stopped or in: one drag a trip. */
  private outbound: Poi | null = null;
  /** The station a trip out is still getting clear of, or null. */
  private clearing: Poi | null = null;
  /** Which way round that station it goes: settled once, so a field dead behind can't flap it. */
  private exitSide = 1;
  /** Whether it was in a dock last tick, so arriving is said once. */
  private port = false;
  /** Snags already said, by part and reason: the same refusal at every dock is one finding. */
  private said = new Set<string>();
  /** The mounts that don't work, as last seen: a break is said once, and a repaired one again. */
  private broken = new Set<MountId>();
  /** The mount that broke most recently, for why it's heading home. */
  private brokeMount: MountId | null = null;
  /** The hull and the upkeep the run began with, so the report says what it cost. */
  private hullAt = 0;
  private upkeepAt = 0;

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
    this.noteDamage(sim);
    this.noteOwnOre(sim);
    if (sim.down) {
      this.down(sim);
      return;
    }
    this.noteBack(sim);
    this.track(sim);
    if (this.end) return;
    if (this.log.autoMineAt === null && this.autoMines(sim)) {
      this.log.autoMineAt = sim.now;
      this.log.event(sim.now, "auto-mine working: the trigger is the program's from here");
    }
    const docked = sim.isDocked();
    if (docked && !this.port) this.arrive(sim);
    this.port = docked;
    this.noteBreaks(sim, docked);
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
    this.hullAt = sim.ship.damageTaken;
    this.upkeepAt = sim.ship.upkeep;
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
    // A hold filling up is the run working, even before anything is sold: mining close to the
    // rock takes longer per load than shooting from across the field, and being slow at it isn't
    // being stuck.
    if (this.oreAboard > this.oreBest) {
      this.oreBest = this.oreAboard;
      this.lastProgress = now;
    }
    if (now - this.lastProgress > this.stuck) this.finish(sim, "stuck");
  }

  private finish(sim: Sim, why: "goal" | "stuck", reason?: string): void {
    const step = stepName(sim.ship, this.plan);
    this.end = why;
    this.log.end = { why, at: sim.now, step, reason };
    if (reason) this.log.event(sim.now, reason);
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
    this.outbound = null;
    this.clearing = null;
  }

  // What broke, and what the hits cost.

  /**
   * Notices a module that has stopped working: every one of them, not only the gun, and one
   * that breaks, is repaired and breaks again is two breaks. Said in space only, since a docked
   * ship is being repaired by its dock and its break is not the run's news.
   */
  private noteBreaks(sim: Sim, docked: boolean): void {
    const found = new Set<MountId>();
    for (const [mount, module] of Object.entries(sim.ship.fit) as [MountId, Module | undefined][]) {
      if (!module || works(module)) continue;
      found.add(mount);
      if (this.broken.has(mount)) continue;
      this.brokeMount = mount;
      if (docked) continue;
      const label = this.labelOf(mount, sim);
      this.log.broke(sim.now, label);
      this.log.event(sim.now, `${label} broken at ${Math.round(sim.ship.x)}, ${Math.round(sim.ship.y)}`);
    }
    this.broken = found;
  }

  /** The module that isn't working, in the shop's words, or null while every one does. */
  private brokenReason(sim: Sim): string | null {
    const newest = this.brokeMount;
    if (newest !== null && sim.ship.fit[newest] && !works(sim.ship.fit[newest])) return this.labelOf(newest, sim);
    for (const [mount, module] of Object.entries(sim.ship.fit) as [MountId, Module | undefined][]) {
      if (module && !works(module)) return this.labelOf(mount, sim);
    }
    return null;
  }

  private labelOf(mount: MountId, sim: Sim): string {
    const module = sim.ship.fit[mount];
    return module ? partOf(module.part).label.toLowerCase() : "module";
  }

  /**
   * What the hits have cost so far: hull lost, and credits on repairs and rebuilds. Counted as
   * the growth of the ship's own two tallies each tick, so a wreck that reset them would lose
   * nothing (it doesn't: `respawn` and `bareHull` leave both alone).
   */
  private noteDamage(sim: Sim): void {
    const { damageTaken, upkeep } = sim.ship;
    const hull = Math.max(0, damageTaken - this.hullAt);
    const credits = Math.max(0, upkeep - this.upkeepAt);
    this.hullAt = damageTaken;
    this.upkeepAt = upkeep;
    if (hull === 0 && credits === 0) return;
    this.log.damage = {
      hullLost: this.log.damage.hullLost + hull,
      repairCredits: this.log.damage.repairCredits + credits,
    };
  }

  /**
   * Counts the ore its own shots freed, and how much of it the ship took: a piece that leaves the
   * water within a hull's length of the ship was taken, not lost to the drift.
   */
  private noteOwnOre(sim: Sim): void {
    const { ship } = sim;
    const here = new Set(sim.ores);
    for (const ore of sim.ores) {
      if (ore.from !== ship) continue;
      if (!this.ownOre.has(ore)) this.log.own.freed += ore.count;
      this.ownOre.set(ore, { x: ore.x, y: ore.y });
    }
    for (const [ore, at] of this.ownOre) {
      if (here.has(ore)) continue;
      this.ownOre.delete(ore);
      if (Math.hypot(at.x - ship.x, at.y - ship.y) < OWN_TAKEN) this.log.own.picked += ore.count;
    }
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
    this.outbound = null;
    this.clearing = null;
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
    this.outbound = null;
    this.clearing = null;
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
    // The dock repairs hull first, then worn modules, then destroyed ones: wait for it, so a
    // broken gun doesn't leave the dock with the bot. Then shop.
    if (sim.canRepair(sim.ship)) return;
    // Done, and a module still doesn't work: this dock can't fix it, and nothing out there will.
    const broken = this.brokenReason(sim);
    if (broken) {
      this.finish(sim, "stuck", `stuck: ${broken} broken and the dock can't fix it, ${Math.round(sim.ship.credits)} cr in hand`);
      return;
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

  /** Out of the dock and back to the rocks: a drag towards the field, at the cruising speed. */
  private leave(sim: Sim): void {
    const base = sim.baseAt();
    if (!base?.body) return;
    this.visit = null;
    // One drag a trip: the dock calls this every tick until the ship is out of it.
    if (this.outbound) return;
    this.outTo(sim, `out to ${sim.fieldName(this.field(sim).id)}`);
  }

  /**
   * The way out of a station's own space, before the trip out proper: back out of the dock's open
   * side, then round the station on the side the field is on when the straight way to it crosses
   * the hull, at the undocking speed. One drag a leg. Says whether the trip out is still waiting
   * on it, in which case nothing is given towards the field yet.
   *
   * A field on the dock's own side leaves after the open-side leg alone, so there is one rule.
   * Which side it goes round is the side the field is on, settled when the way out starts.
   */
  private wayOut(sim: Sim, to: { x: number; y: number }, what: string): boolean {
    const { ship } = sim;
    const station = this.stationLeaving(sim);
    if (!station) {
      this.clearing = null;
      return false;
    }
    const here = stationAxes(station, ship.x, ship.y);
    const field = stationAxes(station, to.x, to.y);
    const out = Math.hypot(here.x, here.y);
    // Past every corner, with a clear way to the field: the trip out proper from here.
    if (out >= STATION_CLEAR && !crossesBox(here, field, STATION_PAD)) {
      this.clearing = null;
      return false;
    }
    // A field so close behind that no way round the near side clears it is not worth going round
    // for ever: past this the trip out is given as it used to be.
    if (out > STATION_GIVE_UP) {
      this.clearing = null;
      return false;
    }
    if (this.clearing !== station) {
      this.clearing = station;
      this.exitSide = field.y !== 0 ? Math.sign(field.y) : Math.sign(here.y) || 1;
    }
    // One drag a leg: while the last leg's drag is still flying, it has the work in hand. A ship
    // still drifting out of a berth gets a leg straight away, whatever speed it drifted at.
    if (sim.clickPilot.active) return true;
    const cos = Math.cos(station.rotation);
    const sin = Math.sin(station.rotation);
    // Out of the dock's open side first, as a player backs out, then along the station's own side.
    const backing = out < STATION_CLEAR;
    const ux = backing ? cos : -sin * this.exitSide;
    const uy = backing ? sin : cos * this.exitSide;
    const base = sim.baseOf(station);
    const name = base ? sim.baseName(base.id) : "the station";
    this.dragAt(sim, ux, uy, UNDOCK_SPEED, `${what}, ${backing ? `out of ${name}'s dock` : `round ${name}`}`);
    return true;
  }

  /**
   * A drag that puts the ship on a heading at a speed of its own, rather than adding to the speed
   * it already has: the drawn velocity is against the ship's own motion, which is what the game's
   * `dragAbsolute` setting draws. Backing out of a station at sixty it goes sixty, and the trip
   * out that follows is the cruising speed rather than the cruising speed plus the backing out.
   */
  private dragAt(sim: Sim, ux: number, uy: number, speed: number, what: string): void {
    const { ship, now } = sim;
    const spot = { x: ship.x + ux * DRAG_START, y: ship.y + uy * DRAG_START };
    this.log.input(now, "move", `${what} at ${Math.round(spot.x)}, ${Math.round(spot.y)}, drifting ${speed}`);
    sim.orderMove(spot.x, spot.y, ux * speed - ship.vx, uy * speed - ship.vy);
    this.orderAt = now;
    this.clickedAt = now;
    this.ordered = spot;
  }

  /** The station a trip out still has to clear first, or null when none is close enough to be in it. */
  private stationLeaving(sim: Sim): Poi | null {
    const { ship } = sim;
    const dock = sim.nearestDock(ship.x, ship.y);
    return Math.hypot(dock.x - ship.x, dock.y - ship.y) <= STATION_NEAR ? dock : null;
  }

  /**
   * Sets out for a field the way the user flies: a right drag towards its marker, a start's
   * length long, so the ship comes up to `CRUISE_SPEED` and coasts there rather than being
   * thrown at the rocks by a click on the far side of the field.
   *
   * Out of a station's own space it backs clear of the hull first: see `wayOut`.
   */
  private outTo(sim: Sim, what: string, again = false): void {
    if (this.outbound && !again) return;
    const { ship } = sim;
    const field = this.field(sim);
    if (this.wayOut(sim, field.poi, what)) return;
    const dx = field.poi.x - ship.x;
    const dy = field.poi.y - ship.y;
    const out = Math.hypot(dx, dy) || 1;
    this.dragAt(sim, dx / out, dy / out, CRUISE_SPEED, what);
    this.outbound = field.poi;
  }

  /** Whether any rock worth breaking is close enough to stop for. */
  private sighted(sim: Sim): boolean {
    const { ship } = sim;
    for (const rock of sim.rocks) {
      if (rock.arriving || rock.hp <= 0) continue;
      if (Math.hypot(rock.x - ship.x, rock.y - ship.y) <= SIGHT) return true;
    }
    return false;
  }

  /** Stops the trip out where it is: the drag cancelled, then the coast braked, as two clicks do. */
  private stopOut(sim: Sim): void {
    this.outbound = null;
    this.clearing = null;
    // A click on the ship cancels the move and leaves it coasting; the second stops the coast.
    sim.orderStop();
    sim.orderStop();
    this.orderAt = null;
    this.ordered = null;
    this.clickedAt = sim.now;
  }

  // Out in space: rock, ore, and the way home.

  private inSpace(sim: Sim): void {
    const { ship } = sim;
    this.visit = null;
    // A module that doesn't work is the whole trip, the way a full hold is: nothing out here
    // pays for it, and the dock does.
    const broken = this.brokenReason(sim);
    if (broken) {
      this.home(sim, `${broken} broken`);
      return;
    }
    // `cargoSpace` is the room left, not the hold's size: none left and it's full.
    if (this.oreAboard > 0 && sim.cargoSpace(ship) < 1) {
      this.home(sim, "the hold is full");
      return;
    }
    // Getting clear of the station it just left, before the trip out proper is given.
    if (this.clearing) {
      this.outTo(sim, `out to ${sim.fieldName(this.field(sim).id)}`);
      return;
    }
    // The trip out: a drag towards the field, stopped the moment a rock comes into sight.
    if (this.outbound) {
      if (this.sighted(sim)) {
        this.log.input(sim.now, "stop", "a rock in sight");
        this.stopOut(sim);
        return;
      }
      const field = this.field(sim);
      const inside = Math.hypot(field.poi.x - ship.x, field.poi.y - ship.y) < field.radius;
      // Still out and nothing in sight: the drag is doing the work, so there's nothing to give it.
      if (!inside) {
        // Unless the coast has died, short of the rocks: then one more leg.
        if (!sim.clickPilot.active && Math.hypot(ship.vx, ship.vy) < CRUISE_SPEED * 0.5) {
          this.outTo(sim, `deeper into ${sim.fieldName(field.id)}`, true);
        }
        return;
      }
      // At the field: the beat takes it from here.
      this.outbound = null;
    }
    this.noteRocks(sim);
    // With Auto-mine the program pulls the trigger: while a rock it picked is still in reach, the
    // hold fills on its own, and there is nothing to do but wait.
    if (this.autoMines(sim)) {
      this.trigger(sim, false, "");
      if (ship.targets.some((target) => isRock(target) && this.inReach(sim, target))) return;
    }
    const rock = this.nearestRock(sim);
    const ore = this.nearestOre(sim);
    // Ore its own shots freed is the work it set in motion: back for that before it breaks
    // anything else, however far it has drifted. Any other ore is a grab when it's close.
    if (ore && ore.from === ship) {
      this.fetch(sim, ore);
      return;
    }
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
    this.trigger(sim, false, "");
    // Outside it and nothing to work: a trip out to the rocks, as from the dock.
    const outside = Math.hypot(field.poi.x - ship.x, field.poi.y - ship.y) - field.radius;
    if (outside > 0) {
      this.outTo(sim, `deeper into ${sim.fieldName(field.id)}`);
      return;
    }
    const spot = { x: field.poi.x - field.radius * 0.4, y: field.poi.y };
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
    // The piece it is already after stays the one it is after: a new nearest one every tick would
    // have it turning between two of them, reaching neither.
    const held = this.chase?.ore;
    if (held && !this.ignored.has(held) && sim.ores.includes(held) && this.oreReach(sim, held) > Math.hypot(held.x - ship.x, held.y - ship.y)) {
      return held;
    }
    let best: Loose | null = null;
    let bestDistance = Infinity;
    for (const ore of sim.ores) {
      if (this.ignored.has(ore)) continue;
      const reach = this.oreReach(sim, ore);
      const distance = Math.hypot(ore.x - ship.x, ore.y - ship.y);
      if (distance < reach && distance < bestDistance) {
        bestDistance = distance;
        best = ore;
      }
    }
    return best;
  }

  /** How far out a piece of ore is worth a trip: its own shots' work goes further than anyone's. */
  private oreReach(sim: Sim, ore: Loose): number {
    return ore.from === sim.ship ? OWN_ORE_REACH : ORE_REACH;
  }

  /** The rock it's working, or else the nearest one worth breaking, or null. */
  private nearestRock(sim: Sim): Rock | null {
    const { ship } = sim;
    // One rock to the end: while anything of the rock it set out on is left -- its pieces are
    // rocks too -- that comes before anything new, however much better the rest of the field looks.
    const left = this.workedLeft(sim);
    if (left) return left;
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
    this.worked.clear();
    if (best) this.worked.add(best);
    return best;
  }

  /** The nearest rock still standing of the set it's working, or null once the set is done. */
  private workedLeft(sim: Sim): Rock | null {
    let best: Rock | null = null;
    let bestDistance = Infinity;
    for (const rock of this.worked) {
      // Broken, or gone from the field: not this rock's work any more.
      if (rock.hp <= 0 || !sim.rocks.includes(rock)) {
        this.worked.delete(rock);
        continue;
      }
      const distance = Math.hypot(rock.x - sim.ship.x, rock.y - sim.ship.y);
      // Out of reach for the moment is not the same as finished: a piece a break set down just
      // past `ROCK_REACH` stays in the set, and is worked if the ship comes back to it. It isn't
      // flown to either, which is what a rock knocked out of the field would cost.
      if (distance > ROCK_REACH) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = rock;
      }
    }
    return best;
  }

  /**
   * Keeps the set of rocks it's working up to date: a worked rock that has gone was broken, and
   * the rocks that have just appeared at its spot are its pieces, so they join the set.
   */
  private noteRocks(sim: Sim): void {
    for (const rock of this.worked) {
      if (rock.hp > 0 && sim.rocks.includes(rock)) continue;
      this.worked.delete(rock);
      const at = this.wasAt.get(rock);
      this.wasAt.delete(rock);
      if (!at) continue;
      // The pieces are set down around where it stood, so the next rock to break doesn't fall
      // into the set by having drifted past.
      const spread = rock.radius * 3;
      for (const piece of sim.rocks) {
        if (this.known.has(piece)) continue;
        if (Math.hypot(piece.x - at.x, piece.y - at.y) > spread) continue;
        this.worked.add(piece);
      }
    }
    for (const rock of sim.rocks) {
      this.known.add(rock);
      if (this.worked.has(rock)) this.wasAt.set(rock, { x: rock.x, y: rock.y });
    }
    // A long run meets more rocks than it can remember; the set that matters is small.
    if (this.known.size > 2000) this.known = new Set(sim.rocks);
  }

  /**
   * Collects a piece of ore: a slow move at it, so the hull takes it by touching it. Where a rock
   * holds the ore against itself, the ship goes in and may touch the rock rather than round it.
   */
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
    // Where it will be when the ship gets there: what the hull sweeps through is taken.
    const leadX = ore.x + ore.vx * ORE_LEAD;
    const leadY = ore.y + ore.vy * ORE_LEAD;
    this.aimAt(sim, leadX, leadY);
    const dx = leadX - ship.x;
    const dy = leadY - ship.y;
    const out = Math.hypot(dx, dy) || 1;
    // A piece lying still, which is how one against a rock sits, is gone at just past its edge:
    // the move ends slowly, and may touch the rock it lies on, which the way round leaves out.
    // A drifting piece is overtaken the way it always was, well past where it will be.
    const still = Math.hypot(ore.vx, ore.vy) < ORE_STILL;
    const past = still ? ORE_EDGE : 250;
    this.head(sim, { x: leadX + (dx / out) * past, y: leadY + (dy / out) * past }, "through a piece of ore", {
      chase: true,
      exclude: still ? this.againstRock(sim, ore) : null,
    });
  }

  /**
   * The rock a piece of ore lies against: the nearest one whose edge is within a bump of it. The
   * way round the rocks leaves that one out, since the ore is on the far side of it.
   */
  private againstRock(sim: Sim, ore: Loose): Rock | null {
    let best: Rock | null = null;
    let bestGap = ORE_AGAINST;
    for (const rock of sim.rocks) {
      if (rock.hp <= 0) continue;
      const gap = Math.hypot(rock.x - ore.x, rock.y - ore.y) - rock.radius;
      if (gap < bestGap) {
        bestGap = gap;
        best = rock;
      }
    }
    return best;
  }

  /** Breaks the rock it's beside: parks it close, then turns the hull on it by hand and fires. */
  private shoot(sim: Sim, rock: Rock): void {
    const { ship, now } = sim;
    const distance = Math.hypot(rock.x - ship.x, rock.y - ship.y);
    // Where the rock will be when a shot gets there, less the way the ship carries its own shots.
    // Only from a near standstill: a ship still coming in would swing the aim about by its own
    // drift, and a facing that moves that fast never settles.
    const flight = distance / sim.tuning.shotSpeed;
    const still = Math.hypot(ship.vx, ship.vy) < FIRE_SPEED;
    const aimX = rock.x + (rock.vx - (still ? ship.vx : 0)) * flight;
    const aimY = rock.y + (rock.vy - (still ? ship.vy : 0)) * flight;
    this.aimAt(sim, aimX, aimY);
    // Close enough to fire from: near the rock, so what it frees lands within the ship's own
    // reach, with the nose on it and the drift small. A click order that has arrived settles on
    // its spot for a long while, tumbling as it trims the last of its speed, so a player clicks
    // the ship to stop and turns by hand. That handover is here, as soon as it's in range and slow.
    const inRange = this.inReach(sim, rock);
    const slow = Math.hypot(ship.vx, ship.vy) < FIRE_SPEED * 2.5;
    if (!inRange || !slow) {
      if (inRange) this.trigger(sim, false, "");
      // Beside it, on the side it came from, and a stop's length inside the line it fires from:
      // a click order stops `ARRIVED` short of its spot, so a spot on that line would leave the
      // ship out of range, ordering the same spot again. A rock that drifts is met where it will
      // be by the time the ship gets there, since a spot on the rock itself is one the ship chases
      // for as long as it drifts. The spot is kept while the rock stays put.
      const stand = Math.max(rock.radius + 40, this.fireDistance(sim, rock) - ARRIVED * 1.2);
      const rvx = (rock.x - rock.px) / TICK;
      const rvy = (rock.y - rock.py) / TICK;
      const lead = Math.min(6, distance / Math.max(1, sim.tuning.clickSpeed));
      const moving = Math.hypot(rvx, rvy) > 5;
      const at = { x: rock.x + rvx * lead, y: rock.y + rvy * lead };
      if (!this.beside || this.beside.rock !== rock || Math.hypot(this.beside.at.x - rock.x, this.beside.at.y - rock.y) > REPEAT_DISTANCE) {
        const dx = ship.x - at.x;
        const dy = ship.y - at.y;
        const out = Math.hypot(dx, dy) || 1;
        this.beside = { rock, x: at.x + (dx / out) * stand, y: at.y + (dy / out) * stand, at: { x: rock.x, y: rock.y } };
      }
      this.head(sim, this.beside, "beside a rock", { chase: moving });
      return;
    }
    if (sim.clickPilot.active) {
      this.log.input(now, "stop", "close enough to shoot");
      sim.orderStop();
      this.orderAt = null;
    }
    if (this.autoMines(sim)) {
      // The program fires: the bot picks the rock, once, and its pieces join the picks as it breaks.
      if (!ship.targets.includes(rock)) {
        sim.selectTarget(ship, rock);
        this.log.input(now, "pick", "a rock to mine");
      }
      // A turret that tracks needs no hull turned under it; the hull's own gun does.
      if (!this.tracks(sim)) this.turnTo(sim, Math.atan2(rock.y - ship.y, rock.x - ship.x));
      return;
    }
    this.turnTo(sim, Math.atan2(rock.y - ship.y, rock.x - ship.x));
    if (!ship.parts.has("turret")) {
      // The hull's own gun shoots where the nose points, so the nose has to point at it.
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(aimY - ship.y, aimX - ship.x) - ship.angle), Math.cos(Math.atan2(aimY - ship.y, aimX - ship.x) - ship.angle)));
      this.trigger(sim, off < (this.firing ? AIM_ANGLE * 3 : AIM_ANGLE), "at a rock", distance);
      return;
    }
    // A turret turns to the aim on its own, so it may fire while the ship is still coming in.
    const want = Math.atan2(aimY - ship.y, aimX - ship.x) - ship.angle;
    const off = sim.turretOff(ship, want);
    this.trigger(sim, off < (this.firing ? AIM_ANGLE * 3 : AIM_ANGLE), "at a rock", distance);
  }

  /** Whether a rock is close enough that breaking it is worth a shot. */
  private inReach(sim: Sim, rock: Rock): boolean {
    return Math.hypot(rock.x - sim.ship.x, rock.y - sim.ship.y) <= this.fireDistance(sim, rock);
  }

  /**
   * How close a rock has to be before a shot is worth it: near, so the ore lands on the ship, and
   * no further than the guns carry, since a turret cuts their reach to a third.
   */
  private fireDistance(sim: Sim, rock: Rock): number {
    return Math.min(rock.radius + FIRE_CLOSE, this.reach(sim) * 0.8);
  }

  /** How far its guns reach, which the turret cuts to a third of. */
  private reach(sim: Sim): number {
    const { tuning } = sim;
    return tuning.shotSpeed * tuning.shotLife * (sim.ship.parts.has("turret") ? tuning.turretRange : 1);
  }

  /** Home to sell, by the autopilot's course once it has one and a click order before. */
  private home(sim: Sim, why: string): void {
    const { now } = sim;
    this.outbound = null;
    this.clearing = null;
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
  /**
   * A click order to a spot, as a player gives with a right click. While one is flying it's left
   * alone: the click pilot stops where it was told, and the next one comes from there. `exclude`
   * is a rock the order may touch on the way, which is the one a piece of ore lies on.
   */
  private head(
    sim: Sim,
    spot: { x: number; y: number },
    what: string,
    { chase = false, exclude = null }: { chase?: boolean; exclude?: Rock | null } = {},
  ): void {
    const { now } = sim;
    // No more than one click a second: a loop of them would say nothing a player could read,
    // and a player's hand couldn't click faster either.
    if (this.clickedAt !== null && now - this.clickedAt < 1) return;
    // A click order brings the ship to rest on its spot and ends itself, so a click for a spot
    // it is already at is one it doesn't need. (It used to stand for twenty to forty seconds,
    // tumbling: docs/dock-click-plan.md, finding 2.)
    //
    // Close enough means at the spot it meant to reach, not at a slip round a rock on the way:
    // that point is one to fly through, and stopping on it leaves the ship beside the rock it
    // was getting past, ordering the same slip again.
    const target = sim.clickPilot.target();
    const meant = target !== null && Math.hypot(target.x - spot.x, target.y - spot.y) < ARRIVED;
    const close = meant && Math.hypot(target!.x - sim.ship.x, target!.y - sim.ship.y) < ARRIVED;
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
    const run = this.clearRun(sim, spot, exclude);
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
   * on it. A player sees that rock; a bot has to work it out. The rock the ore lies against is
   * left out: going to that ore means touching it, and a touch at walking pace costs nothing.
   */
  private clearRun(sim: Sim, to: { x: number; y: number }, exclude: Rock | null = null): { x: number; y: number } {
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
      if (rock.hp <= 0 || rock === exclude) continue;
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

  /** Where the turret, or the player's mouse, is pointed. With Turret tracking, the program aims instead. */
  private aimAt(sim: Sim, x: number, y: number): void {
    if (this.tracks(sim)) return;
    sim.ship.aim = { x, y };
  }

  /** Whether Turret tracking is working: a turret, the program, and Targeting it needs. */
  private tracks(sim: Sim): boolean {
    const { parts } = sim.ship;
    return parts.has("turret") && parts.has("turretTracking") && parts.has("targeting");
  }

  /** Whether Auto-mine is working: the program and Targeting it needs. The trigger is then its. */
  private autoMines(sim: Sim): boolean {
    const { parts } = sim.ship;
    return parts.has("autoMine") && parts.has("targeting");
  }

  /** Fire is one input a burst: pressing it counts, holding it doesn't. */
  private trigger(sim: Sim, on: boolean, what: string, from = 0): void {
    // With Auto-mine working the bot never presses fire: the program shoots.
    if (on && this.autoMines(sim)) return;
    if (on === this.firing) return;
    this.firing = on;
    sim.controls.fire = on;
    if (!on) return;
    this.log.input(sim.now, "fire", what);
    // How far out it opens a burst, for the report's median: the distance to the rock it fires at.
    if (from > 0) this.log.fired.push(from);
  }

  /** A snag is said once per part and reason. */
  private snag(sim: Sim, part: PartId, why: string): void {
    const key = `${part}: ${why}`;
    if (this.said.has(key)) return;
    this.said.add(key);
    this.log.snag(sim.now, partOf(part).label.toLowerCase(), why);
  }
}
