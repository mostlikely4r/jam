/**
 * Warms up the shipped world with no player and keeps it as the start every new game begins
 * in (src/start.json). Shared by `npm run warm -- ... --ship` and `npm run world`.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { shippedWorld } from "../designer/shipped";
import { stringifyWorld } from "../designer/world";
import { layoutKey, makeStart } from "../save";
import { Sim } from "../sim";
import { DEFAULTS } from "../tuning";
import { useShippedWorld } from "./world";

/** Runs the shipped world for `minutes` of game time; with `ship`, writes it as the start. Returns what it saw. */
export function warmStart(minutes: number, seed: number, ship: boolean): string[] {
  const sim = new Sim(seed, { ...DEFAULTS, chatter: false });
  useShippedWorld(sim, 1, seed);
  const started = performance.now();
  sim.warmUp(minutes * 60);
  const took = performance.now() - started;
  const ago = (seen: number) => `${Math.round((sim.now - seen) / 60)} min old`;
  const lines = [`Warm-up of ${minutes} game minutes, seed ${seed}: ${(took / 1000).toFixed(1)} s`];
  for (const base of sim.bases) {
    const news = base.board.filter((report) => report.base !== base.id);
    lines.push(`  ${sim.baseName(base.id)} board: ${news.length === 0 ? "nothing from elsewhere" : news.map((r) => `${r.item} at ${sim.baseName(r.base)}, ${ago(r.seen)}`).join("; ")}`);
  }
  const moving = sim.traffic.filter((pilot) => !sim.isDocked(pilot.ship)).length;
  lines.push(`  traffic: ${sim.traffic.length}, ${moving} away from a dock; ship at ${Math.round(Math.hypot(sim.ship.x - sim.field.x, sim.ship.y - sim.field.y))} from the field`);
  if (ship) {
    const text = JSON.stringify(makeStart(sim, layoutKey(stringifyWorld(shippedWorld()))));
    writeFileSync(fileURLToPath(new URL("../start.json", import.meta.url)), text);
    lines.push(`Wrote src/start.json, ${Math.round(text.length / 1024)} KB`);
  }
  return lines;
}
