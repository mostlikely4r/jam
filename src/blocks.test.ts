import { afterEach, describe, expect, it } from "vitest";
import { homeSim } from "./home";
import { isBlock } from "./sim";
import { roundTrip } from "./save";
import { DEFAULTS } from "./tuning";
import { type Block, Sim, TICK } from "./sim";

// Long runs never give the worker a turn of the event loop otherwise (see pilot.test.ts).
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** A still world: no traffic or pirates, no rocks, and a station with parts to spare. */
const WORLD = {
  ...DEFAULTS,
  floaterStart: true,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  haulers: false,
  chatter: false,
  rockCount: 0,
  rockInflow: 0,
  fieldOrbitRadius: 0,
  fieldOrbitPeriod: 0,
  fieldRotationPeriod: 0,
  stationRotationPeriod: 0,
  orbitPeriod: 0,
  repairCost: 0,
  stationStartCredits: 100000,
  stationStartParts: 1000,
  stationStorage: 100000,
  stationReserveParts: 0,
  depositPrice: 1000,
  depositParts: 20,
  depositBuildRate: 100,
  depositGap: 300,
};

function run(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) {
    sim.step();
    sim.events.length = 0;
  }
}

/** The player's ship at the home station's dock. */
function dock(sim: Sim): void {
  const at = sim.dockPoint(false, sim.bases[0].poi);
  Object.assign(sim.ship, { x: at.x, y: at.y, px: at.x, py: at.y, vx: 0, vy: 0 });
}

/** A world with a funded deposit building, its first blocks at the pad, and the player docked with a clamp. */
function building(settings: Partial<typeof WORLD> = {}): Sim {
  const sim = homeSim(1, { ...WORLD, ...settings });
  dock(sim);
  sim.ship.credits = 100000;
  expect(sim.fundBlueprint(sim.ship, "deposit")).toBe(true);
  sim.devSet(sim.ship, "clamp", true);
  run(sim, 1);
  return sim;
}

/** Takes a job if it has none, then takes the block from the pad and lets it go at its site. */
function carry(sim: Sim, base = sim.bases[0]): Block {
  if (!sim.blockJobFor(sim.ship)) expect(sim.takeBlockJob(sim.ship)).not.toBeNull();
  const pad = sim.blockSpot(base);
  Object.assign(sim.ship, { x: pad.x, y: pad.y, px: pad.x, py: pad.y, vx: 0, vy: 0 });
  expect(sim.grabPadBlock(sim.ship)).toBe(true);
  const held = sim.ship.tow;
  if (!held || !isBlock(held)) throw new Error("the clamp should hold a block");
  const at = sim.siteSpot(held.site);
  Object.assign(sim.ship, { x: at.x, y: at.y, px: at.x, py: at.y, vx: 0, vy: 0 });
  // A tick for the clamp to carry it where the ship now is, then it's let go of there.
  sim.step();
  sim.releaseTow(sim.ship);
  run(sim, 2);
  return held;
}

describe("construction blocks", () => {
  it("are made at the station's pad from spare part A, never past the reserve or the two it holds", () => {
    const sim = building({ depositParts: 50, blockParts: 10 });
    const base = sim.bases[0];
    expect(sim.deposits).toHaveLength(1);
    // Spare parts make blocks, up to the pad's room and the project's need.
    expect(base.blocks).toHaveLength(2);
    expect(sim.partA(base)).toBe(1000 - 20);
    run(sim, 5);
    expect(base.blocks).toHaveLength(2);
    // Parts held back for repairs make no block.
    const short = building({ stationStartParts: 25, stationReserveParts: 20 });
    expect(short.bases[0].blocks).toHaveLength(0);
    expect(short.partA(short.bases[0])).toBe(25);
  });

  it("takes the deposit when a job is taken, and pays it back with the project's share when placed", () => {
    const sim = building({ depositParts: 10, blockParts: 10, depositPrice: 1000 });
    const base = sim.bases[0];
    const deposit = sim.deposits[0];
    const depositWorth = sim.blockDeposit();
    const before = sim.ship.credits;
    const job = sim.takeBlockJob(sim.ship);
    expect(job).not.toBeNull();
    expect(job!.carrier).toBe(sim.ship);
    expect(sim.ship.credits).toBe(before - depositWorth);
    // The purse is the funding, shared over the blocks: one block here.
    expect(deposit.purse).toBe(1000);
    expect(deposit.blocks).toBe(1);
    expect(deposit.partsLeft).toBe(10);
    dock(sim);
    carry(sim, base);
    expect(deposit.partsLeft).toBe(0);
    expect(deposit.partsUsed).toBe(10);
    // The deposit comes back, and the whole purse with it.
    expect(sim.ship.credits).toBe(before + 1000);
    expect(sim.unlocked("deposit")).toBe(true);
    expect(sim.bases[0].blueprintsOrdered.has("deposit")).toBe(false);
    // What it paid for is the ledger's too: nothing came from nowhere.
    expect(sim.ship.earned).toBeGreaterThanOrEqual(1000);
  });

  it("keeps the deposit with the base when a block breaks, and loses its parts", () => {
    const sim = building({ depositParts: 10, blockParts: 10 });
    const base = sim.bases[0];
    const deposit = sim.deposits[0];
    expect(sim.takeBlockJob(sim.ship)).not.toBeNull();
    const pad = sim.blockSpot(base);
    Object.assign(sim.ship, { x: pad.x, y: pad.y, px: pad.x, py: pad.y, vx: 0, vy: 0 });
    expect(sim.grabPadBlock(sim.ship)).toBe(true);
    const block = sim.ship.tow as Block;
    const credits = sim.ship.credits;
    sim.breakBlock(block);
    sim.step();
    expect(sim.blocks).toHaveLength(0);
    expect(sim.ship.tow).toBeNull();
    // Its parts are gone, and the base keeps the deposit: none of it comes back.
    expect(deposit.partsLeft).toBe(10);
    expect(deposit.partsUsed).toBe(0);
    expect(sim.ship.credits).toBe(credits);
  });

  it("finishes a multi-block project only when the last block is placed", () => {
    const sim = building({ depositParts: 30, blockParts: 10, depositPrice: 900 });
    const base = sim.bases[0];
    const deposit = sim.deposits[0];
    expect(deposit.blocks).toBe(3);
    for (let i = 0; i < 2; i++) {
      if (i > 0) dock(sim);
      carry(sim, base);
      if (i === 0) run(sim, 2);
      expect(deposit.partsLeft).toBe(20 - i * 10);
      expect(sim.unlocked("deposit")).toBe(false);
    }
    dock(sim);
    carry(sim, base);
    expect(deposit.partsLeft).toBe(0);
    expect(sim.unlocked("deposit")).toBe(true);
    // The whole purse went out over the three blocks.
    expect(deposit.paid).toBe(900);
  });

  it("gives a deposit back when its project finishes without its block", () => {
    const sim = building({ depositParts: 10, blockParts: 10 });
    const base = sim.bases[0];
    const deposit = sim.deposits[0];
    const worth = sim.blockDeposit();
    // A block made and claimed, still out at the field: the extra a stray or an older save can hold.
    sim.ship.credits -= worth;
    base.account.credits += worth;
    const extra = sim.makeBlock(base, deposit, 5000, 5000);
    extra.payer = sim.ship;
    extra.carrier = sim.ship;
    sim.blocks.push(extra);
    const before = sim.ship.credits;
    // Another block finishes the project; the one still out there can never be placed.
    carry(sim, base);
    expect(deposit.partsLeft).toBe(0);
    expect(sim.blocks).not.toContain(extra);
    // Its deposit came back, on top of the finished one's pay.
    expect(sim.ship.credits).toBe(before + worth + 1000);
  });

  it("leaves the station's own turrets a stock build, with no trip to make", () => {
    const sim = building({ depositParts: 10, stationGuardParts: 10, stationGuardPrice: 500 });
    const base = sim.bases[0];
    dock(sim);
    sim.ship.credits = 100000;
    expect(sim.fundBlueprint(sim.ship, "stationGuards")).toBe(true);
    const before = sim.partA(base);
    run(sim, 3);
    expect(sim.unlocked("stationGuards")).toBe(true);
    expect(sim.partA(base)).toBeCloseTo(before - 10, 6);
    expect(base.blocks.every((job) => job.site === sim.deposits[0])).toBe(true);
  });

  it("saves blocks waiting, held and in the open", () => {
    const sim = building({ depositParts: 30, blockParts: 10 });
    const base = sim.bases[0];
    // One taken and let go of in the open.
    if (!sim.blockJobFor(sim.ship)) expect(sim.takeBlockJob(sim.ship)).not.toBeNull();
    const pad = sim.blockSpot(base);
    Object.assign(sim.ship, { x: pad.x, y: pad.y, px: pad.x, py: pad.y, vx: 0, vy: 0 });
    expect(sim.grabPadBlock(sim.ship)).toBe(true);
    const loose = sim.ship.tow as Block;
    sim.releaseTow(sim.ship);
    Object.assign(loose, { x: 40000, y: 40000, px: 40000, py: 40000, vx: 0, vy: 0 });
    // Another made and waiting, and one taken and held.
    run(sim, 1);
    dock(sim);
    expect(sim.takeBlockJob(sim.ship)).not.toBeNull();
    Object.assign(sim.ship, { x: pad.x, y: pad.y, px: pad.x, py: pad.y, vx: 0, vy: 0 });
    expect(sim.grabPadBlock(sim.ship)).toBe(true);
    const held = sim.ship.tow;
    expect(held).not.toBeNull();
    const waiting = base.blocks.length;

    const into = homeSim(99, { ...WORLD });
    roundTrip(sim, into);
    const back = into.bases[0];
    expect(back.blocks).toHaveLength(waiting);
    expect(into.ship.tow).not.toBeNull();
    expect(into.ship.tow!.held).toBe("tow");
    expect(isBlock(into.ship.tow!)).toBe(true);
    expect(into.blocks).toContain(into.ship.tow);
    // The one let go of is in the open, where it was.
    const open = into.blocks.find((block) => block !== into.ship.tow);
    expect(open).toBeDefined();
    expect(Math.hypot(open!.x - 40000, open!.y - 40000)).toBeLessThan(1);
    // And the project's own funding and plan came with them.
    const project = into.deposits[0];
    expect(project.purse).toBe(1000);
    expect(project.blocks).toBe(3);
  });
});
