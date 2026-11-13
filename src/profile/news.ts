/**
 * How news spreads between bases with no player: who docks where, and when each base's
 * board first hears of each other base's held items.
 * Run with: npm run news -- [game minutes] [seed] [layout name] [flown]
 * The layout is one saved in src/designer/layouts; without one, the shipped world.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Sim, TICK } from "../sim";
import { DEFAULTS } from "../tuning";
import { useLayout } from "../designer/link";
import { shippedWorld } from "../designer/shipped";
import { parseWorld } from "../designer/world";
import { linkTo } from "./world";

const minutes = Number(process.argv[2]) || 120;
const seed = Number(process.argv[3]) || 1;
const layout = process.argv[4] && process.argv[4] !== "-" ? process.argv[4] : null;
const records = process.argv[5] !== "flown";
const sim = new Sim(seed, { ...DEFAULTS, trafficRecords: records, fighterRecords: records, chatter: false });
const world = layout ? parseWorld(readFileSync(fileURLToPath(new URL(`../designer/layouts/${layout}.json`, import.meta.url)), "utf8")) : shippedWorld();
if (!world) throw new Error(`No layout ${layout}`);
useLayout(world, linkTo(sim));
sim.reset(seed);
// The player waits far out, so everything nearby runs out of view.
const park = () => {
  sim.ship.x = sim.ship.px = 400000;
  sim.ship.y = sim.ship.py = 400000;
  sim.ship.vx = sim.ship.vy = 0;
};
const docks = new Map<string, number>();
const heard = new Map<string, number>();
const wasAt = new Map<object, string | null>();
// Where each traffic ship is working, every 30 game minutes, and how much of the time each
// board holds live word of each other base.
const fresh = new Map<string, number>();
const lastSeen = new Map<string, number>();
const deliveries = new Map<string, number>();
for (let i = 0; i < Math.round((minutes * 60) / TICK); i++) {
  park();
  sim.step();
  for (const pilot of sim.traffic) {
    const dock = sim.dockedAt(pilot.ship);
    const base = dock ? sim.baseOf(dock)?.id ?? null : null;
    if (base && wasAt.get(pilot.ship) !== base) docks.set(base, (docks.get(base) ?? 0) + 1);
    wasAt.set(pilot.ship, base);
  }
  for (const base of sim.bases) {
    for (const report of base.board) {
      if (report.base === base.id) continue;
      const key = `${sim.baseName(base.id)} hears ${report.item} at ${sim.baseName(report.base)}`;
      if (!heard.has(key)) heard.set(key, sim.now);
      fresh.set(key, (fresh.get(key) ?? 0) + TICK);
      if (report.seen > (lastSeen.get(key) ?? -1)) {
        if (lastSeen.has(key)) deliveries.set(key, (deliveries.get(key) ?? 0) + 1);
        lastSeen.set(key, report.seen);
      }
    }
  }
  if (i % Math.round(1800 / TICK) === 0) {
    const where = new Map<string, number>();
    for (const pilot of sim.traffic) {
      const field = sim.miningFields().find((each) => each.id === pilot.working);
      const base = field ? sim.baseName(sim.baseOf(sim.nearestDock(field.poi.x, field.poi.y))?.id ?? "") : "?";
      where.set(base, (where.get(base) ?? 0) + 1);
    }
    console.log(`  ${Math.round(sim.now / 60)} min: working by ${[...where].map(([b, n]) => `${b} ${n}`).join(", ")}`);
  }
}
const at = (s: number) => `${Math.floor(s / 60)} min`;
console.log(`${minutes} game minutes, seed ${seed}, ${layout ?? "shipped world"}, ${records ? "records" : "flown"}`);
for (const base of sim.bases) console.log(`  ${sim.baseName(base.id)}: ${docks.get(base.id) ?? 0} traffic stays`);
if (heard.size === 0) console.log("  No base heard of another's items.");
for (const [key, when] of heard) {
  const share = Math.round((100 * (fresh.get(key) ?? 0)) / (minutes * 60));
  console.log(`  ${key}: first at ${at(when)}, fresh word ${deliveries.get(key) ?? 0} times more, on the board ${share}% of the time`);
}
