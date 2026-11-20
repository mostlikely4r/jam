/**
 * How the click pilot alone gets home: a floater with a full hold at the home field's edge,
 * sent to the dock as a player with no autopilot would send it. No bot in the way, so the
 * numbers say what the game's click does, not what a bot does around it.
 *
 * Run with: npm run dockchase -- [before|after] [starts] [seed]
 * - before: a click order to the berth, given again whenever the pilot has none.
 * - after: one dock order, given again only if it ended without docking.
 *
 * Each start is its own game, warmed by its own share of the station's orbit, so the starts
 * meet the dock at points all the way round its orbit and none of them inherits the last one's
 * clock.
 */
import { useLayout } from "../designer/link";
import { shippedWorld } from "../designer/shipped";
import { Sim, TICK } from "../sim";
import { DEFAULTS } from "../tuning";
import { linkTo } from "./world";

/** How long a start may take before it counts as not making it. */
const LIMIT_SECONDS = 5 * 60;
/** A start gives the order again no more often than this. */
const REPEAT_SECONDS = 1;

const words = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const after = (words[0] ?? "after").toLowerCase() !== "before";
const starts = Number(words[1]) || 20;
const seed = Number(words[2]) || 1;

/** A new game of the shipped world, from scratch, as `src/bot/run.ts` builds one. */
function world(): Sim {
  const sim = new Sim(seed, { ...DEFAULTS, chatter: false, floaterStart: true });
  useLayout(shippedWorld(), linkTo(sim));
  sim.reset(seed);
  return sim;
}

const { station } = world();
/** One turn of the station: the starts are spread over it. */
const orbit = station.orbits?.find((each) => each.period > 0)?.period ?? 900;

/** One start: the floater at rest at the field's edge nearest the station, full, sent home. */
function attempt(warm: number): { docked: boolean; seconds: number; orders: number } {
  const sim = world();
  sim.warmUp(warm);
  const { field, station } = sim;
  const dx = station.x - field.x;
  const dy = station.y - field.y;
  const out = Math.hypot(dx, dy) || 1;
  const { ship } = sim;
  ship.x = ship.px = field.x + (dx / out) * field.reach;
  ship.y = ship.py = field.y + (dy / out) * field.reach;
  ship.vx = ship.vy = 0;
  ship.angle = Math.atan2(dy, dx);
  ship.spin = 0;
  sim.setOre(ship, 100);
  sim.orderStop();
  sim.step();
  let orders = 0;
  let since = REPEAT_SECONDS;
  for (let tick = 0; tick < Math.round(LIMIT_SECONDS / TICK); tick++) {
    if (sim.isDocked()) return { docked: true, seconds: tick * TICK, orders };
    // Before, a player clicks again whenever the ship has no order. After, only when one ended.
    if (!sim.clickPilot.active && since >= REPEAT_SECONDS) {
      // A dock order, or before there was one, a click on where the berth is now.
      const sent = after ? sim.orderDock(station) : sim.orderMove(sim.dockPoint(false, station).x, sim.dockPoint(false, station).y);
      if (sent) orders++;
      since = 0;
    }
    since += TICK;
    sim.step();
    sim.events.length = 0;
  }
  return { docked: false, seconds: LIMIT_SECONDS, orders };
}

const results: { docked: boolean; seconds: number; orders: number }[] = [];
for (let start = 0; start < starts; start++) {
  const result = attempt((start * orbit) / starts);
  results.push(result);
  console.log(
    `start ${String(start + 1).padStart(2)}: ${result.docked ? "docked" : "missed"} in ${result.seconds.toFixed(1)} s, ${result.orders} order${result.orders === 1 ? "" : "s"}`,
  );
}

const made = results.filter((result) => result.docked).map((result) => result.seconds);
const times = made.sort((a, b) => a - b);
const median = times.length === 0 ? Infinity : times[Math.floor(times.length / 2)];
const mean = times.reduce((sum, time) => sum + time, 0) / (times.length || 1);
const orders = results.reduce((sum, result) => sum + result.orders, 0);
console.log(`\n${after ? "after" : "before"}: docked ${made.length} of ${starts}, median ${median.toFixed(1)} s, mean ${mean.toFixed(1)} s, ${orders} orders`);
