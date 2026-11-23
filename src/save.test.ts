import { describe, expect, it } from "vitest";
import { homeSim } from "./home";
import { layoutKey, loadStart, makeStart, roundTrip, type StartFile } from "./save";
import { Sim, TICK } from "./sim";
import { applyTuning, changedTuning, DEFAULTS } from "./tuning";

function run(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TICK); i++) {
    sim.step();
    sim.events.length = 0;
  }
}

describe("kept tuning", () => {
  it("keeps only what differs from the defaults, so a later default reaches it", () => {
    const tuning = { ...DEFAULTS, zoom: DEFAULTS.zoom + 0.1, retro: !DEFAULTS.retro, dockDrag: Infinity };
    const kept = JSON.parse(JSON.stringify(changedTuning(tuning)));
    expect(Object.keys(kept).sort()).toEqual(["dockDrag", "retro", "zoom"]);
    // JSON's null comes back as infinity, and a key the game no longer has is left out.
    const back = applyTuning({ ...DEFAULTS }, { ...kept, gone: 5 });
    expect(back).toEqual(tuning);
    expect("gone" in back).toBe(false);
  });

  it("brings a save's tweaks back, and leaves an old save's full tuning unread", () => {
    const sim = homeSim(3, { ...DEFAULTS, haulerVolume: DEFAULTS.haulerVolume + 7 });
    const into = homeSim(99, { ...DEFAULTS });
    roundTrip(sim, into);
    expect(into.tuning.haulerVolume).toBe(DEFAULTS.haulerVolume + 7);

    // A save from before kept every value, old defaults and all, under \`tuning\`.
    const old = sim.snapshot() as unknown as Record<string, unknown>;
    delete old.tweaks;
    old.tuning = { ...DEFAULTS, haulerVolume: 40 };
    const fresh = homeSim(99, { ...DEFAULTS });
    fresh.restore(old);
    expect(fresh.tuning.haulerVolume).toBe(DEFAULTS.haulerVolume);
  });
});

describe("save and load", () => {
  it("carries on from where it was: the ship, the money, the world, and who's linked to whom", () => {
    const sim = homeSim(3, { ...DEFAULTS, haulers: true, depositFree: true, guardsDepositFree: true });
    run(sim, 30);
    sim.ship.credits = 1234;
    sim.ship.marked = true;
    sim.ores.push({ x: 1, y: 2, px: 1, py: 2, vx: 0, vy: 0, kind: 0, item: "ore", wear: 0, count: 1, from: sim.ship });
    const into = homeSim(99, { ...DEFAULTS });
    roundTrip(sim, into);

    expect(into.ship.x).toBe(sim.ship.x);
    expect(into.ship.credits).toBe(1234);
    expect(into.ship.marked).toBe(true);
    expect([...into.ship.parts]).toEqual([...sim.ship.parts]);
    expect(into.rocks.length).toBe(sim.rocks.length);
    expect(into.traffic.length).toBe(sim.traffic.length);
    expect(into.traffic[0].ship.credits).toBe(sim.traffic[0].ship.credits);
    expect(into.fighters.map((pilot) => pilot.ship.faction)).toEqual(sim.fighters.map((pilot) => pilot.ship.faction));
    expect(into.deposits.length).toBe(sim.deposits.length);
    expect(into.pirateCredits).toBe(sim.pirateCredits);
    expect(into.now).toBe(sim.now);
    // The same ship everywhere it's mentioned, and the keys still fly it.
    expect(into.ores[into.ores.length - 1].from).toBe(into.ship);
    expect(into.ship.controls).toBe(into.controls);
    // The same random numbers from here on.
    expect(into.roll()).toBe(sim.roll());
    // And the world goes on.
    run(into, 10);
    expect(into.ship.hull).toBeGreaterThan(0);
  }, 30000);

  it("remembers the places found, which a new game forgets", () => {
    const sim = homeSim(1, { ...DEFAULTS });
    expect(sim.discovered.has("dock")).toBe(false);
    sim.ship.x = sim.dockPoint(false, sim.station).x;
    sim.ship.y = sim.dockPoint(false, sim.station).y;
    sim.step();
    expect(sim.discovered.has("dock")).toBe(true);
    const into = homeSim(2, { ...DEFAULTS });
    roundTrip(sim, into);
    expect(into.discovered.has("dock")).toBe(true);
    into.reset(3);
    // A new game forgets what was found: places are discovered by getting near them.
    expect(into.discovered.size).toBe(0);
    expect(into.discovered.has("dock")).toBe(false);
  });

  it("a save from before the bigger stores loads, and its stations take the room the world gives them", () => {
    // Storage is the place's, not the save's: a save carries no station spec, so a station
    // written when 300 cells was a full store comes back with the 1200 the layout says now.
    const before = homeSim(1, { ...DEFAULTS });
    before.bases[0].spec.storage = 300;
    before.ship.credits = 777;
    const now = homeSim(2, { ...DEFAULTS });
    now.bases[0].spec.storage = DEFAULTS.stationStorage;
    roundTrip(before, now);
    expect(now.ship.credits).toBe(777);
    expect(now.storageOf(now.bases[0])).toBe(DEFAULTS.stationStorage);
  });

  it("a ship saved before a field existed gets it as new", () => {
    const sim = homeSim(1, { ...DEFAULTS });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (sim.ship as any).wanted;
    const into = homeSim(2, { ...DEFAULTS });
    roundTrip(sim, into);
    expect(into.ship.wanted).toBe(false);
  });

  it("carries a pilot's program tweaks, and a save from before them gives each ship its own", () => {
    const sim = homeSim(1, { ...DEFAULTS });
    sim.devSet(sim.ship, "targeting", true);
    sim.setTweak(sim.ship, "targeting", "boxPicks", "ships");
    const into = homeSim(2, { ...DEFAULTS });
    roundTrip(sim, into);
    expect(into.ship.tweaks.targeting?.boxPicks).toBe("ships");
    // A pick that belongs to a mount comes back with it.
    sim.devSet(sim.ship, "autoMine", true);
    expect(sim.setTweak(sim.ship, "autoMine", "fires", "off", "turretGun")).toBe(true);
    const again = homeSim(5, { ...DEFAULTS });
    roundTrip(sim, again);
    expect(again.ship.tweaks.autoMine?.["fires@turretGun"]).toBe("off");

    // A save from before tweaks existed: every ship comes back without one, and each gets its
    // own empty picks rather than one object shared by all of them.
    const old = homeSim(3, { ...DEFAULTS });
    const strip = (ship: Sim["ship"]) => delete (ship as { tweaks?: unknown }).tweaks;
    strip(old.ship);
    for (const pilot of [...old.traffic, ...old.fighters, ...old.drones]) strip(pilot.ship);
    expect(old.traffic.length).toBeGreaterThan(0);
    const older = homeSim(4, { ...DEFAULTS });
    roundTrip(old, older);
    older.ship.tweaks.targeting = { boxPicks: "everything" };
    expect(older.traffic[0].ship.tweaks.targeting).toBeUndefined();
  });
});

describe("a warmed start", () => {
  it("starts a new game in a world that has already run, with a fresh ship by the field, only in the layout it was made in", async () => {
    const { useLayout } = await import("./designer/link");
    const { shippedWorld } = await import("./designer/shipped");
    const { stringifyWorld } = await import("./designer/world");
    const { linkTo, useShippedWorld } = await import("./profile/world");
    const tuning = { ...DEFAULTS, floaterStart: false, chatter: false };
    const warm = new Sim(1, { ...tuning });
    useShippedWorld(warm, 1, 1);
    const fresh = Math.hypot(warm.ship.x - warm.station.x, warm.ship.y - warm.station.y);
    warm.warmUp(60);
    expect(warm.warmedUp).toBeCloseTo(60, 0);
    // The ship is back where a game starts, at the station, which has moved on.
    expect(Math.hypot(warm.ship.x - warm.station.x, warm.ship.y - warm.station.y)).toBeCloseTo(fresh, 0);
    const key = layoutKey(stringifyWorld(shippedWorld()));
    const file: StartFile = JSON.parse(JSON.stringify(makeStart(warm, key)));

    const sim = new Sim(5, { ...tuning, floaterStart: true });
    useShippedWorld(sim, 1, 5);
    expect(loadStart(sim, file, "another layout")).toBe(false);
    expect(loadStart(sim, file, key)).toBe(true);
    useLayout(shippedWorld(), linkTo(sim));
    sim.startPlayer();
    expect(sim.now).toBeCloseTo(warm.now, 5);
    expect(sim.traffic.length).toBe(warm.traffic.length);
    expect(sim.tuning.floaterStart).toBe(true);
    expect(sim.ship.model).toBe("floater");
    expect(sim.ship.credits).toBe(new Sim(1, tuning).ship.credits);
    expect(Math.hypot(sim.ship.x - sim.station.x, sim.ship.y - sim.station.y)).toBeLessThan(fresh + 1);
    for (let i = 0; i < Math.round(5 / TICK); i++) sim.step();
    // A minute of the shipped world is a few seconds of its own: the rest of the suite running
    // beside it is what pushes it past the default.
  }, 30000);
});

describe("the shipped start", () => {
  it("fits the shipped world, so new games begin warmed up (if not: npm run warm -- 60 1 --ship)", async () => {
    const { shippedWorld } = await import("./designer/shipped");
    const { stringifyWorld } = await import("./designer/world");
    const { useLayout } = await import("./designer/link");
    const { linkTo, useShippedWorld } = await import("./profile/world");
    const file = (await import("./start.json")).default as unknown as StartFile;
    const sim = new Sim(1, { ...DEFAULTS, chatter: false });
    useShippedWorld(sim, 1, 1);
    expect(loadStart(sim, file, layoutKey(stringifyWorld(shippedWorld())))).toBe(true);
    useLayout(shippedWorld(), linkTo(sim));
    sim.startPlayer();
    // The world has run: the base that sells the all-round tractor has put up word of it.
    expect(sim.bases.some((base) => base.board.some((report) => report.item === "tractorAll"))).toBe(true);
    for (let i = 0; i < Math.round(5 / TICK); i++) sim.step();
  });
});
