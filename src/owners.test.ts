import { describe, expect, it } from "vitest";
import { homeSim } from "./home";
import { accountOf, ownerLoop, type Owned } from "./owners";
import { roundTrip } from "./save";
import { depositId, PIRATE_BASE_ID, type Sim } from "./sim";
import { DEFAULTS } from "./tuning";

const QUIET = {
  ...DEFAULTS,
  trafficRacers: 0,
  trafficFloaters: 0,
  pirates: 0,
  defenders: 0,
  testDrones: 0,
  haulers: false,
  stationStartCredits: 1000,
  depositGap: 300,
  depositReach: 150,
  depositCapacity: 300,
  depositPays: 3,
  depositSells: 7,
  depositDropChance: 0,
};

function quiet(extra: Partial<typeof QUIET> = {}): Sim {
  const sim = homeSim(1, { ...QUIET, ...extra });
  sim.step();
  return sim;
}

describe("owner chains", () => {
  const station: Owned = { id: "s", owner: "stations", account: { credits: 50 } };
  const deposit: Owned = { id: "s/deposit", owner: "s", account: "owner" };
  const guards: Owned = { id: "s/depositGuards", owner: "s/deposit", account: "owner" };
  const byId = (id: string) => [station, deposit, guards].find((each) => each.id === id) ?? null;

  it("end at an agent, and money goes up the chain to the first account of its own", () => {
    expect(ownerLoop([station, deposit, guards])).toBeNull();
    expect(accountOf(guards, byId)).toBe(station.account);
    expect(accountOf(deposit, byId)).toBe(station.account);
    expect(accountOf(station, byId)).toBe(station.account);
  });

  it("refuse a loop: nothing may end up owning itself", () => {
    const a: Owned = { id: "a", owner: "b", account: "owner" };
    const b: Owned = { id: "b", owner: "a", account: "owner" };
    expect(ownerLoop([station, a, b])).toBe("a");
    expect(ownerLoop([{ id: "self", owner: "self", account: "owner" }])).toBe("self");
    // A chain with no account of its own on the way has none.
    expect(accountOf({ id: "lone", owner: "pirates", account: "owner" }, () => null)).toBeNull();
  });
});

describe("owners in the world", () => {
  it("a deposit is its station's, and its sales move the station's credits", () => {
    const sim = quiet({ depositFree: true });
    sim.step();
    const base = sim.bases[0];
    const deposit = sim.deposits[0];
    expect(deposit.owner).toBe(base.id);
    expect(sim.accountFor(deposit)).toBe(base.account);
    Object.assign(sim.ship, { x: deposit.x, y: deposit.y, px: deposit.x, py: deposit.y, vx: 0, vy: 0 });
    sim.setOre(sim.ship, 10);
    sim.ship.credits = 100;
    const before = base.account.credits;
    expect(sim.sellToDeposit(sim.ship, deposit)).toBe(10);
    expect(base.account.credits).toBe(before - 30);
    expect(sim.buyFromDeposit(sim.ship, deposit)).toBe(10);
    expect(base.account.credits).toBe(before - 30 + 70);
  });

  it("turrets are what they stand on's, and pay through the same station", () => {
    const sim = quiet({ depositFree: true, guardsStationFree: true, guardsDepositFree: true });
    sim.step();
    sim.step();
    const base = sim.bases[0];
    const station = sim.batteries.find((battery) => battery.id === "stationGuards")!;
    const atDeposit = sim.batteries.find((battery) => battery.id === "depositGuards")!;
    expect(station.owner).toBe(base.id);
    expect(atDeposit.owner).toBe(depositId(base.id));
    expect(sim.accountFor(station)).toBe(base.account);
    expect(sim.accountFor(atDeposit)).toBe(base.account);
  });

  it("the pirate base's money is its account", () => {
    const sim = quiet();
    sim.pirateCredits = 120;
    expect(sim.accountFor(PIRATE_BASE_ID)).toBe(sim.pirateAccount);
    expect(sim.pirateAccount.credits).toBe(120);
  });

  it("ships read their owner from the links they have", () => {
    const sim = homeSim(1, { ...QUIET, pirates: 1, trafficRacers: 1, defenders: 1 });
    sim.step();
    expect(sim.ownerOf(sim.ship)).toBe("player");
    const pirate = sim.fighters.find((pilot) => pilot.ship.faction === "pirate")!.ship;
    expect(sim.ownerOf(pirate)).toBe(sim.pirateBase ? PIRATE_BASE_ID : "pirates");
    const defender = sim.fighters.find((pilot) => pilot.ship.faction === "defender")!.ship;
    expect(sim.ownerOf(defender)).toBe(sim.homeBaseOf(defender).id);
    const traffic = sim.traffic[0]?.ship;
    if (traffic) expect(sim.ownerOf(traffic)).toBe(traffic.home ?? sim.homeBaseOf(traffic).id);
    const drone = { ...sim.ship, owner: sim.ship };
    expect(sim.ownerOf(drone)).toBe(sim.ship);
  });

  it("a save where something ends up owning itself is turned away, and the world is left as it was", () => {
    const sim = quiet({ depositFree: true, guardsDepositFree: true });
    sim.step();
    sim.step();
    const deposit = sim.deposits[0];
    const guards = sim.batteries.find((battery) => battery.id === "depositGuards")!;
    deposit.owner = `${guards.base}/${guards.id}`;
    const into = quiet();
    const clock = into.now;
    expect(() => roundTrip(sim, into)).toThrow(/owning itself/);
    expect(into.now).toBe(clock);
    expect(into.deposits).toHaveLength(0);
  });
});
