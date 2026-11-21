/**
 * How the click pilot alone gets home, and how a course does: a floater with a full hold at
 * the home field's edge, sent to the dock. No bot in the way, so the numbers say what the
 * game's own flying does, not what a bot does around it.
 *
 * Run with: npm run dockchase -- [starts] [seed]
 *       or: npm run dockchase -- course [starts] [seed]
 *
 * The plain mode clicks the berth, the way a player with no autopilot sends the ship home.
 * The course mode gives the ship its autopilot, sets a course for the station, and starts it
 * on the far side of the field, so the way home crosses the field and its rocks.
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
const course = words[0] === "course";
const starts = Number(words[course ? 1 : 0]) || 20;
const seed = Number(words[course ? 2 : 1]) || 1;

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

interface Result {
  docked: boolean;
  seconds: number;
  orders: number;
  /** Hull lost on the way home. */
  damage: number;
}

/** The floater at rest at the field's edge, full, with the order given. */
function start(warm: number, far: boolean): { sim: Sim; ship: Sim["ship"]; hull: number } {
  const sim = world();
  sim.warmUp(warm);
  const { field, station } = sim;
  const dx = station.x - field.x;
  const dy = station.y - field.y;
  const out = Math.hypot(dx, dy) || 1;
  // The edge nearest the station, or the edge away from it, with the field in between.
  const side = far ? -1 : 1;
  const { ship } = sim;
  ship.x = ship.px = field.x + (dx / out) * field.reach * side;
  ship.y = ship.py = field.y + (dy / out) * field.reach * side;
  ship.vx = ship.vy = 0;
  ship.angle = Math.atan2(dy, dx);
  ship.spin = 0;
  sim.setOre(ship, 100);
  sim.orderStop();
  if (far) sim.devSet(ship, "autopilot", true);
  sim.step();
  return { sim, ship, hull: ship.hull };
}

/** One start: a floater sent home, a click at a time or on a course. */
function attempt(warm: number): Result {
  const { sim, ship, hull } = start(warm, course);
  let orders = 0;
  let since = REPEAT_SECONDS;
  const order = () => {
    if (course) sim.orderTravel(sim.station);
    else {
      const berth = sim.dockPoint(false, sim.station);
      sim.orderMove(berth.x, berth.y);
    }
    orders++;
  };
  for (let tick = 0; tick < Math.round(LIMIT_SECONDS / TICK); tick++) {
    if (sim.isDocked()) return { docked: true, seconds: tick * TICK, orders, damage: hull - ship.hull };
    // A player clicks again whenever the ship has no order: no leading, no stopping by hand.
    if (!sim.clickPilot.active && since >= REPEAT_SECONDS) {
      order();
      since = 0;
    }
    since += TICK;
    sim.step();
    sim.events.length = 0;
  }
  return { docked: false, seconds: LIMIT_SECONDS, orders, damage: hull - ship.hull };
}

const results: Result[] = [];
for (let start = 0; start < starts; start++) {
  const result = attempt((start * orbit) / starts);
  results.push(result);
  console.log(
    `start ${String(start + 1).padStart(2)}: ${result.docked ? "docked" : "missed"} in ${result.seconds.toFixed(1)} s,` +
      ` ${result.damage.toFixed(1)} hull lost, ${result.orders} order${result.orders === 1 ? "" : "s"}`,
  );
}

const made = results.filter((result) => result.docked).map((result) => result.seconds);
const times = made.sort((a, b) => a - b);
const median = times.length === 0 ? Infinity : times[Math.floor(times.length / 2)];
const mean = times.reduce((sum, time) => sum + time, 0) / (times.length || 1);
const orders = results.reduce((sum, result) => sum + result.orders, 0);
const damage = results.reduce((sum, result) => sum + result.damage, 0);
console.log(
  `\ndocked ${made.length} of ${starts}, median ${median.toFixed(1)} s, mean ${mean.toFixed(1)} s,` +
    ` ${damage.toFixed(1)} hull lost, ${orders} orders`,
);
