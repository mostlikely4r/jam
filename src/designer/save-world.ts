/**
 * Writes the shipped world (src/designer/world.json) in the fixed key order, then re-warms the
 * start new games begin in (src/start.json), which is keyed to the layout and goes stale with
 * any change to it. Run after editing world.json by hand or by script.
 * Run with: npm run world -- [game minutes]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { warmStart } from "../profile/start";
import { parseWorld, stringifyWorld } from "./world";

const file = fileURLToPath(new URL("./world.json", import.meta.url));
const world = parseWorld(readFileSync(file, "utf8"));
if (!world) {
  console.error("src/designer/world.json doesn't read as a world");
  process.exit(1);
}
writeFileSync(file, stringifyWorld(world));
console.log("Wrote src/designer/world.json");
for (const line of warmStart(Number(process.argv[2]) || 60, 1, true)) console.log(line);
