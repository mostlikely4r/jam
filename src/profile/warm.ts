/**
 * Runs the shipped world for a while with no player, and reports how long that took and what
 * the world looks like after: news on the boards, traffic on its way. With --ship it writes
 * the result as the start every new game begins in (src/start.json).
 * Run with: npm run warm -- [game minutes] [seed] [--ship]
 */
import { warmStart } from "./start";

const minutes = Number(process.argv[2]) || 60;
const seed = Number(process.argv[3]) || 1;
for (const line of warmStart(minutes, seed, process.argv.includes("--ship"))) console.log(line);
