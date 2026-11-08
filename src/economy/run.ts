/** Prints the ore cycle calculator's results. Run with: npm run economy */
import { type CycleResult, LINKS, runCycle, runToday, SCENARIOS, totalCash, USER_PRICES } from "./cycle";

const n = (value: number) => Math.round(value).toLocaleString("en-US").padStart(10);

function margins(): void {
  const p = USER_PRICES;
  const steps: [string, number][] = [
    ["Miners: asteroid to ore", p.minerOre],
    ["Station: holds ore", p.stationOre - p.minerOre],
    ["Hauler: moves ore", p.factoryOre - p.stationOre],
    ["Factory: ore to parts", p.factoryParts - p.factoryOre],
    ["Shop: holds parts", p.shopParts - p.factoryParts],
    ["Hauler: moves parts", p.stationParts - p.shopParts],
    ["Station: parts to service", p.service - p.stationParts],
  ];
  console.log("Who earns what on one unit");
  for (const [name, margin] of steps) {
    console.log(`  ${name.padEnd(28)}${n(margin)}  ${Math.round((margin / p.service) * 100)}%`);
  }
  const sum = steps.reduce((total, [, margin]) => total + margin, 0);
  console.log(`  ${"Total earned".padEnd(28)}${n(sum)}  (a service costs ${p.service})\n`);
}

function cycle(result: CycleResult): void {
  const { scenario, holders } = result;
  console.log(scenario.name);
  console.log(`  Over ${scenario.hours} hours: ${n(result.mined)} ore mined, ${n(result.partsMade)} parts made, ${n(result.services)} services`);
  console.log(`  By the end, per hour:  ${n(result.lateMinedPerHour)} ore mined, ${n(result.lateServicesPerHour)} services`);
  console.log(`  ${"".padEnd(10)}${"cash".padStart(10)}${"ore".padStart(10)}${"parts".padStart(10)}`);
  for (const name of [...LINKS, "crews"] as const) {
    const holder = holders[name];
    console.log(`  ${name.padEnd(10)}${n(holder.cash)}${n(holder.ore)}${n(holder.parts)}`);
  }
  console.log(`  Money from nowhere: ${n(totalCash(result) - result.startCash)}\n`);
}

function today(): void {
  const result = runToday(48, 15);
  console.log("The game today (ore sold at 10, services at 20, spare ore bought by haulers)");
  console.log(`  Over ${result.hours} hours: ${n(result.mined)} ore mined, ${n(result.services)} ore used for services`);
  console.log(`  Miners' cash ${n(result.miners)}   Station's cash ${n(result.station)}   Pile ${n(result.pile)}`);
  console.log(`  HOLE: credits from nowhere ${n(result.creditsFromNowhere)}, ore to nowhere ${n(result.oreToNowhere)}\n`);
}

margins();
today();
for (const scenario of SCENARIOS) cycle(runCycle(scenario));
