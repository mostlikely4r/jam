/**
 * A no-player run: the bot plays a new game of the shipped world in node, faster than real
 * time, and reports how the session went. The same bot plays in the running game behind `?dev`.
 *
 * Run with: npm run bot -- [track] [game hours] [seed] [--json]
 * The track defaults to the floater, the limit to 6 game hours, the seed to 1.
 */
import { useLayout } from "../designer/link";
import { shippedWorld } from "../designer/shipped";
import { linkTo } from "../profile/world";
import { Sim, TICK } from "../sim";
import { DEFAULTS } from "../tuning";
import { Bot } from "./bot";
import { BotLog, type RunInfo } from "./log";
import { planFor, stepName } from "./plan";

const args = process.argv.slice(2);
const json = args.includes("--json");
const words = args.filter((arg) => !arg.startsWith("--"));
const track = (words[0] ?? "floater").toLowerCase();
const hours = Number(words[1]) || 6;
const seed = Number(words[2]) || 1;

const plan = track === "floater" ? planFor("floater") : null;
if (!plan) {
  console.error(`No track called "${track}": the floater is the only one written so far.`);
  process.exit(1);
}

// A new game of the shipped world, from scratch: no chatter, and the ship the track asks for.
// Not the warmed start a player's new game gets: that carries the world's dice with it, so
// every seed would play the same game. Worth settling when runs want a warmed world on purpose.
const sim = new Sim(seed, { ...DEFAULTS, chatter: false, floaterStart: track === "floater" });
useLayout(shippedWorld(), linkTo(sim));
sim.reset(seed);

const log = new BotLog();
const bot = new Bot({ plan, log });
const ticks = Math.round((hours * 3600) / TICK);
for (let i = 0; i < ticks; i++) {
  bot.step(sim);
  if (bot.end) break;
  sim.step();
}
if (!bot.end) {
  const step = stepName(sim.ship, plan);
  log.end = { why: "time", at: sim.now, step };
  log.event(sim.now, `${hours} h up on ${step}`);
}

const info: RunInfo = { title: plan.name, track, seed, hours, world: "shipped world" };
console.log(json ? log.json(info) : log.text(info));
