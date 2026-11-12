/**
 * Counts what happens between pirates, defenders and traffic over a stretch of game time
 * with the camera far away: the numbers out-of-view dice have to match.
 * Run with: npm run census -- [game minutes] [seed] [flown|records] [spot chances ×] [--json]
 * With --json it prints one line of totals instead, for `npm run parity`.
 */
import { Sim, TICK } from "../sim";
import { DEFAULTS } from "../tuning";
import { useShippedWorld } from "./world";

const minutes = Number(process.argv[2]) || 30;
const seed = Number(process.argv[3]) || 1;
const records = process.argv[4] === "records";
const spotScale = Number(process.argv[5]) || 1;
const json = process.argv.includes("--json");
const sim = new Sim(seed, { ...DEFAULTS, trafficRecords: records, fighterRecords: records, recordSpotPirate: DEFAULTS.recordSpotPirate * spotScale, recordSpotDefender: DEFAULTS.recordSpotDefender * spotScale, chatter: false });
useShippedWorld(sim, 1, seed);
const park = () => {
  const out = Math.hypot(sim.field.x, sim.field.y) || 1;
  sim.ship.x = sim.ship.px = sim.field.x + (sim.field.x / out) * 40000;
  sim.ship.y = sim.ship.py = sim.field.y + (sim.field.y / out) * 40000;
  sim.ship.vx = sim.ship.vy = 0;
};
const count = new Map<string, number>();
const add = (key: string, n = 1) => count.set(key, (count.get(key) ?? 0) + n);
// Why records wake: dice, a call for help, or a flown ship near enough to fight.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inner = sim as any;
const wakeFighter = inner.wakeFighter.bind(sim);
inner.wakeFighter = (pilot: { ship: { faction: string } }, spotted: unknown = null) => {
  const why = spotted ? "dice" : inner.answersDistress(pilot) ? "distress" : "a ship near";
  add(`${pilot.ship.faction} woken by ${why}`);
  wakeFighter(pilot, spotted);
};
const hulls = new Map<object, number>();
const started = performance.now();
for (let i = 0; i < Math.round((minutes * 60) / TICK); i++) {
  park();
  const before = new Map(sim.ships.map((ship) => [ship, { hull: ship.hull, wrecks: ship.wrecks, ore: ship.ore }]));
  const all = [...sim.traffic.map((p) => p.ship), ...sim.fighters.map((p) => p.ship)];
  for (const ship of all) hulls.set(ship, ship.wrecks);
  const tasks = new Map(sim.fighters.map((pilot) => [pilot, pilot.task]));
  // Each second: every fighter on its round in its field, with each ship there it would go after.
  if (Math.floor(sim.now) !== Math.floor(sim.now + TICK)) {
    for (const pilot of sim.fighters) {
      // Picking up loose ore counts: it looks round while it does, as a record does all along.
      if (pilot.record || pilot.fighting) continue;
      const field = pilot.patrolField(sim);
      const reach = field.radius + sim.tuning.visionRange;
      if (Math.hypot(pilot.ship.x - field.poi.x, pilot.ship.y - field.poi.y) > field.radius) continue;
      for (const other of sim.ships) {
        if (other === pilot.ship || Math.hypot(other.x - field.poi.x, other.y - field.poi.y) > reach) continue;
        if (pilot.goesAfter(sim, other)) add(`pair seconds ${pilot.ship.faction} on ${other.faction ?? "traffic"}`);
      }
    }
  }
  sim.step();
  for (const pilot of sim.fighters) {
    if (pilot.task === "attacking" && tasks.get(pilot) !== "attacking" && tasks.get(pilot) !== "searching") add(`attacks begun by ${pilot.ship.faction}`);
  }
  add("fighter record ticks", sim.fighters.filter((pilot) => pilot.record).length);
  add("traffic record ticks", sim.traffic.filter((pilot) => pilot.record).length);
  add("fighter ticks", sim.fighters.length);
  add("traffic ticks", sim.traffic.length);
  for (const event of sim.events) if (event.type === "wreck") add("wrecks");
  sim.events.length = 0;
  for (const ship of all) {
    const kind = ship.faction === "pirate" ? "pirate" : ship.faction === "defender" ? "defender" : "traffic";
    const was = before.get(ship);
    if (ship.wrecks !== hulls.get(ship)) add(`${kind} wrecked`);
    if (was && ship.hull < was.hull && ship.wrecks === was.wrecks) add(`${kind} hits taken`);
  }
}
const lost = (sim as unknown as { bases: { lostTraffic: unknown[] }[] }).bases.reduce((sum, base) => sum + base.lostTraffic.length, 0);
const sold = sim.traffic.reduce((sum, p) => sum + p.ship.earned, 0) / sim.tuning.creditsPerOre;
const left = (faction: string | null) => sim.fighters.filter((p) => p.ship.faction === faction).length;
if (json) {
  const totals: Record<string, number> = Object.fromEntries(count);
  Object.assign(totals, {
    "traffic left": sim.traffic.length,
    "pirates left": left("pirate"),
    "defenders left": left("defender"),
    "traffic sold": Math.round(sold),
    "pirate credits": Math.round(sim.pirateCredits),
    "pirate ore": Math.round(sim.pirateOre),
    "base ore": Math.round(sim.bases.reduce((sum, base) => sum + base.ore, 0)),
    "seconds": Math.round((performance.now() - started) / 1000),
  });
  console.log(JSON.stringify(totals));
  process.exit(0);
}
console.log(`${minutes} min, seed ${seed}, ${records ? `records, spot ×${spotScale}` : "flown"}, ${((performance.now() - started) / 1000).toFixed(0)} s`);
console.log(`  traffic ${sim.traffic.length} (lost waiting ${lost}), pirates ${left("pirate")}, defenders ${left("defender")}`);
console.log(`  traffic sold ${sold.toFixed(0)} ore, pirate credits ${sim.pirateCredits.toFixed(0)}`);
console.log(`  fields ${sim.miningFields().map((f) => f.id).join(", ")}; bases ${sim.bases.map((b) => b.id).join(", ")}`);
for (const [key, value] of [...count].sort()) console.log(`  ${key}: ${value}`);
const where = (ship: { x: number; y: number }) => sim.miningFieldAt(ship.x, ship.y).id;
console.log(`  fighters: ${sim.fighters.map((p) => `${p.ship.faction}@${where(p.ship)} ${p.task}`).join("; ")}`);
