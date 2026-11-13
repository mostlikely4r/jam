/**
 * Runs the shipped world for a while with no player, and reports how long that took and what
 * the world looks like after: news on the boards, traffic on its way. With --ship it writes
 * the result as the start every new game begins in (src/start.json).
 * Run with: npm run warm -- [game minutes] [seed] [--ship]
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { shippedWorld } from "../designer/shipped";
import { stringifyWorld } from "../designer/world";
import { layoutKey, makeStart } from "../save";
import { Sim } from "../sim";
import { DEFAULTS } from "../tuning";
import { useShippedWorld } from "./world";

const minutes = Number(process.argv[2]) || 60;
const seed = Number(process.argv[3]) || 1;
const sim = new Sim(seed, { ...DEFAULTS, chatter: false });
useShippedWorld(sim, 1, seed);
const started = performance.now();
sim.warmUp(minutes * 60);
const took = performance.now() - started;
const ago = (seen: number) => `${Math.round((sim.now - seen) / 60)} min old`;
console.log(`Warm-up of ${minutes} game minutes, seed ${seed}: ${(took / 1000).toFixed(1)} s`);
for (const base of sim.bases) {
  const news = base.board.filter((report) => report.base !== base.id);
  console.log(`  ${sim.baseName(base.id)} board: ${news.length === 0 ? "nothing from elsewhere" : news.map((r) => `${r.item} at ${sim.baseName(r.base)}, ${ago(r.seen)}`).join("; ")}`);
}
const moving = sim.traffic.filter((pilot) => !sim.isDocked(pilot.ship)).length;
console.log(`  traffic: ${sim.traffic.length}, ${moving} away from a dock; ship at ${Math.round(Math.hypot(sim.ship.x - sim.field.x, sim.ship.y - sim.field.y))} from the field`);
if (process.argv.includes("--ship")) {
  const text = JSON.stringify(makeStart(sim, layoutKey(stringifyWorld(shippedWorld()))));
  writeFileSync(fileURLToPath(new URL("../start.json", import.meta.url)), text);
  console.log(`Wrote src/start.json, ${Math.round(text.length / 1024)} KB`);
}
