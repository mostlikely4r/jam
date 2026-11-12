/**
 * Profiles the simulation step on the shipped world and on bigger ones, so we see what
 * grows with what. Run with: npm run profile -- [game minutes per run] [part of a scenario name]
 */
import { Sim, TICK } from "../sim";
import { StepProfile } from "./step";
import { DEFAULTS } from "../tuning";
import { useShippedWorld } from "./world";

interface Scenario {
  name: string;
  /** Copies of the first field (1 = the shipped world). */
  fields: number;
  /** Traffic ships of each model. */
  traffic: number;
  /** The camera parked out in empty space, away from every field: all traffic out of view. */
  away?: boolean;
}

const SCENARIOS: Scenario[] = [
  { name: "shipped world", fields: 1, traffic: 1 },
  { name: "10 fields", fields: 10, traffic: 1 },
  { name: "50 fields", fields: 50, traffic: 1 },
  { name: "20 traffic", fields: 1, traffic: 10 },
  { name: "100 traffic", fields: 1, traffic: 50 },
  { name: "10 fields, 100 traffic", fields: 10, traffic: 50 },
  { name: "100 traffic, camera away", fields: 1, traffic: 50, away: true },
  { name: "10 fields, 100 traffic, camera away", fields: 10, traffic: 50, away: true },
];

function run(scenario: Scenario, minutes: number) {
  const tuning = { ...DEFAULTS, trafficRacers: scenario.traffic, trafficFloaters: scenario.traffic };
  const sim = new Sim(1, tuning);
  useShippedWorld(sim, scenario.fields);
  const park = () => {
    if (!scenario.away) return;
    // 40,000 further out from the centre than the field: clear of every field and body.
    const out = Math.hypot(sim.field.x, sim.field.y) || 1;
    sim.ship.x = sim.ship.px = sim.field.x + (sim.field.x / out) * 40000;
    sim.ship.y = sim.ship.py = sim.field.y + (sim.field.y / out) * 40000;
    sim.ship.vx = sim.ship.vy = 0;
  };
  // Let the world settle (traffic sets out, rocks spread) before timing.
  for (let i = 0; i < 10 / TICK; i++) {
    park();
    sim.step();
  }
  const profile = new StepProfile();
  sim.profile = profile;
  const ticks = Math.round((minutes * 60) / TICK);
  const started = performance.now();
  for (let i = 0; i < ticks; i++) {
    park();
    sim.step();
  }
  const wall = (performance.now() - started) / ticks;
  sim.profile = null;
  return { sim, report: profile.report(), wall };
}

const minutes = Number(process.argv[2]) || 1;
/** Optional: only the scenarios whose name contains this. */
const only = process.argv[3];
const ms = (value: number) => value.toFixed(3).padStart(8);
// The game runs 120 steps a second, so a step must stay well under 8.3 ms, render included.
const BUDGET = 1000 * TICK;

console.log(`Each run: ${minutes} game minute(s) after 10 s to settle. Budget per step: ${BUDGET.toFixed(1)} ms, rendering included.\n`);
for (const scenario of SCENARIOS.filter((each) => !only || each.name.includes(only))) {
  const { sim, report, wall } = run(scenario, minutes);
  const share = (wall / BUDGET) * 100;
  console.log(`${scenario.name}`);
  console.log(
    `  ${ms(wall)} ms a step (${share.toFixed(0)}% of budget)   rocks ${sim.rocks.length}  ore ${sim.ores.length}  shots ${sim.shots.length}  fields ${1 + sim.extraFields.length}  bodies ${sim.bodies.length}`,
  );
  for (const part of report.parts.filter((part) => part.ms >= report.total * 0.02)) {
    console.log(`  ${ms(part.ms)}  ${((part.ms / report.total) * 100).toFixed(0).padStart(3)}%  ${part.name}`);
  }
  console.log("");
}
