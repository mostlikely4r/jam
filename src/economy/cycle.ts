/**
 * A rough calculator for the future ore cycle, separate from the game. It follows every
 * credit and every unit of goods minute by minute, so anything that can't be traced shows
 * up as a hole. The rates are illustrative: read the shape of the results, not the numbers.
 *
 * Asteroid -> ore (miners) -> parts (factory) -> service (station).
 * Between them: the station and the shop hold goods, the hauler moves them.
 *
 * Every link's income beyond its working cash goes out as pay to the crews, who are the
 * people buying services. Without them the money has nowhere to go.
 */

export interface Prices {
  /** What the station pays miners for ore. */
  minerOre: number;
  /** What the hauler pays the station for ore. */
  stationOre: number;
  /** What the factory pays the hauler for ore. */
  factoryOre: number;
  /** What the shop pays the factory for parts. */
  factoryParts: number;
  /** What the hauler pays the shop for parts. */
  shopParts: number;
  /** What the station pays the hauler for parts. */
  stationParts: number;
  /** What a service costs at the station. One unit of parts makes one service. */
  service: number;
}

export const USER_PRICES: Prices = {
  minerOre: 30,
  stationOre: 40,
  factoryOre: 50,
  factoryParts: 70,
  shopParts: 100,
  stationParts: 110,
  service: 140,
};

export type Link = "miners" | "station" | "hauler" | "factory" | "shop";
export const LINKS: Link[] = ["miners", "station", "hauler", "factory", "shop"];

export interface Holder {
  cash: number;
  ore: number;
  parts: number;
}

export interface Scenario {
  name: string;
  prices: Prices;
  /** Links that pay out their spare cash to crews. The others keep it. */
  payCrews: Link[];
  hours: number;
  orePerMinute: number;
  haulerLoad: number;
  haulerRoundTripMinutes: number;
  /** The most ore or parts each store can hold. */
  storeLimit: number;
  /** Off-screen stores that never fill up, standing in for customers we haven't made. */
  bottomlessElsewhere: boolean;
  /** Cash each link other than the miners starts with and keeps working with. */
  workingCash: number;
  /** Money the crews start with: what's in circulation beyond the links' working cash. */
  circulating: number;
}

export interface CycleResult {
  scenario: Scenario;
  holders: Record<Link | "crews", Holder>;
  mined: number;
  partsMade: number;
  services: number;
  /** Services per hour over the last tenth of the run. Near zero means the cycle stalled. */
  lateServicesPerHour: number;
  lateMinedPerHour: number;
  startCash: number;
}

const MINER_CASH = 1000;
/** The share of spare cash paid out, and of crews' cash spent, each minute. */
const SPEND_SHARE = 0.2;

export const totalCash = (result: CycleResult): number =>
  Object.values(result.holders).reduce((sum, holder) => sum + holder.cash, 0);

/** Pays for an amount of goods, limited to what the buyer can afford. Returns the amount. */
function affordable(amount: number, buyer: Holder, price: number): number {
  return Math.max(0, Math.min(amount, buyer.cash / price));
}

export function runCycle(scenario: Scenario): CycleResult {
  const { prices: p, storeLimit, workingCash } = scenario;
  const keeps = (link: Link) => (link === "miners" ? MINER_CASH : workingCash);
  const make = (cash: number): Holder => ({ cash, ore: 0, parts: 0 });
  const holders = {
    miners: make(keeps("miners")),
    station: make(keeps("station")),
    hauler: make(keeps("hauler")),
    factory: make(keeps("factory")),
    shop: make(keeps("shop")),
    crews: make(scenario.circulating),
  };
  const { miners, station, hauler, factory, shop, crews } = holders;
  const elsewhereLimit = scenario.bottomlessElsewhere ? Infinity : storeLimit;
  const startCash = Object.values(holders).reduce((sum, holder) => sum + holder.cash, 0);

  const minutes = scenario.hours * 60;
  const halfTrip = Math.max(1, Math.round(scenario.haulerRoundTripMinutes / 2));
  const lateFrom = Math.floor(minutes * 0.9);
  let mined = 0;
  let partsMade = 0;
  let services = 0;
  let lateServices = 0;
  let lateMined = 0;

  /** Moves goods and their price between two holders. */
  const trade = (from: Holder, to: Holder, good: "ore" | "parts", amount: number, price: number) => {
    from[good] -= amount;
    to[good] += amount;
    to.cash -= amount * price;
    from.cash += amount * price;
  };

  for (let minute = 0; minute < minutes; minute++) {
    // Miners sell straight to the station, as far as it has room and money.
    const dug = affordable(Math.min(scenario.orePerMinute, storeLimit - station.ore), station, p.minerOre);
    station.ore += dug;
    station.cash -= dug * p.minerOre;
    miners.cash += dug * p.minerOre;
    mined += dug;
    if (minute >= lateFrom) lateMined += dug;

    // The factory turns ore into parts and sells them to the shop.
    const made = affordable(Math.min(factory.ore, elsewhereLimit - shop.parts), shop, p.factoryParts);
    factory.ore -= made;
    shop.parts += made;
    shop.cash -= made * p.factoryParts;
    factory.cash += made * p.factoryParts;
    partsMade += made;

    // The hauler swings between the station and the factory's end of the route.
    if (minute % (halfTrip * 2) === 0) {
      trade(hauler, station, "parts", affordable(Math.min(hauler.parts, storeLimit - station.parts), station, p.stationParts), p.stationParts);
      trade(station, hauler, "ore", affordable(Math.min(scenario.haulerLoad - hauler.ore, station.ore), hauler, p.stationOre), p.stationOre);
    } else if (minute % halfTrip === 0) {
      trade(hauler, factory, "ore", affordable(Math.min(hauler.ore, elsewhereLimit - factory.ore), factory, p.factoryOre), p.factoryOre);
      const wanted = Math.min(scenario.haulerLoad - hauler.parts, storeLimit - station.parts, shop.parts);
      trade(shop, hauler, "parts", affordable(wanted, hauler, p.shopParts), p.shopParts);
    }

    // Spare cash becomes pay, and crews spend it on services while there are parts to make them.
    for (const link of scenario.payCrews) {
      const spare = Math.max(0, holders[link].cash - keeps(link));
      const pay = spare * SPEND_SHARE;
      holders[link].cash -= pay;
      crews.cash += pay;
    }
    const sold = Math.min(affordable(crews.cash * SPEND_SHARE / p.service, crews, p.service), station.parts);
    crews.cash -= sold * p.service;
    station.cash += sold * p.service;
    station.parts -= sold;
    services += sold;
    if (minute >= lateFrom) lateServices += sold;
  }

  const lateHours = (minutes - lateFrom) / 60;
  return {
    scenario,
    holders,
    mined,
    partsMade,
    services,
    lateServicesPerHour: lateServices / lateHours,
    lateMinedPerHour: lateMined / lateHours,
    startCash,
  };
}

export interface TodayResult {
  hours: number;
  mined: number;
  services: number;
  miners: number;
  station: number;
  pile: number;
  /** Credits haulers brought from nowhere, and ore they took to nowhere. */
  creditsFromNowhere: number;
  oreToNowhere: number;
  startCash: number;
}

/** The game as it is now: ore sold at 10, used for services at 20, spare ore bought by haulers. */
export function runToday(hours: number, orePerMinute: number): TodayResult {
  const start = { miners: 1000, station: 300 };
  let miners = start.miners;
  let station = start.station;
  let pile = 40;
  let mined = 0;
  let services = 0;
  let creditsFromNowhere = 0;
  let oreToNowhere = 0;
  for (let minute = 0; minute < hours * 60; minute++) {
    pile += orePerMinute;
    miners += orePerMinute * 10;
    station -= orePerMinute * 10;
    mined += orePerMinute;

    const budget = Math.max(0, miners - start.miners) * SPEND_SHARE;
    const used = Math.min(budget / 20, Math.max(0, pile - 20));
    miners -= used * 20;
    station += used * 20;
    pile -= used;
    services += used;

    if (minute % 10 === 5) {
      const load = Math.min(200, Math.max(0, pile - 150));
      pile -= load;
      station += load * 15;
      creditsFromNowhere += load * 15;
      oreToNowhere += load;
    }
  }
  return {
    hours,
    mined,
    services,
    miners,
    station,
    pile,
    creditsFromNowhere,
    oreToNowhere,
    startCash: start.miners + start.station,
  };
}

const BASE = {
  prices: USER_PRICES,
  hours: 48,
  orePerMinute: 15,
  haulerLoad: 200,
  haulerRoundTripMinutes: 10,
  storeLimit: 300,
  bottomlessElsewhere: false,
  workingCash: 50000,
  circulating: 30000,
};

export const SCENARIOS: Scenario[] = [
  { ...BASE, name: "Whole chain real, every link pays its crews", payCrews: LINKS },
  { ...BASE, name: "Whole chain real, only miners pay crews", payCrews: ["miners"] },
  { ...BASE, name: "Whole chain real, every link pays crews, thin working cash", payCrews: LINKS, workingCash: 5000 },
  { ...BASE, name: "Whole chain real, every link pays crews, no money in circulation", payCrews: LINKS, circulating: 0 },
  { ...BASE, name: "Whole chain real, every link pays crews, little money in circulation", payCrews: LINKS, circulating: 3000 },
  {
    ...BASE,
    name: "Factory and shop off-screen: they keep what they earn",
    payCrews: ["miners", "station", "hauler"],
    bottomlessElsewhere: true,
  },
];
