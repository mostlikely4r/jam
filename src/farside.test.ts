import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOT_PARTS, PILOTS, STEP_PARTS } from "./farside";

// Windows checkouts may have CRLF line ends.
const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** Every call the step makes, as `name` or `field.name`, read from the source. */
function stepCalls(): Set<string> {
  const sim = source("./sim.ts");
  const start = sim.indexOf("\n  step(): void {");
  const end = sim.indexOf("\n  }\n", start);
  const body = sim.slice(start, end);
  const calls = new Set<string>();
  for (const match of body.matchAll(/this\.([a-zA-Z]+(?:\.[a-zA-Z]+)?)\(/g)) calls.add(match[1]);
  for (const match of body.matchAll(/\bpilot\.([a-zA-Z]+)\(/g)) calls.add(`pilot.${match[1]}`);
  return calls;
}

describe("what happens out of view", () => {
  it("is decided for every part of the step: a new one needs an entry in farside.ts", () => {
    const calls = [...stepCalls()].filter((call) => !NOT_PARTS.has(call));
    expect(calls.length).toBeGreaterThan(10);
    const undecided = calls.filter((call) => !(call in STEP_PARTS));
    expect(undecided, "Add these to STEP_PARTS in farside.ts: what do they do out of view?").toEqual([]);
    const stale = Object.keys(STEP_PARTS).filter((part) => !calls.includes(part));
    expect(stale, "No longer in the step: remove them from STEP_PARTS").toEqual([]);
  });

  it("is decided for every kind of pilot", () => {
    const classes = [...source("./pilot.ts").matchAll(/export class (\w+) extends ShipPilot/g)].map((match) => match[1]);
    expect(classes.length).toBeGreaterThan(0);
    const undecided = classes.filter((name) => !(name in PILOTS));
    expect(undecided, "Add these to PILOTS in farside.ts: what do they do out of view?").toEqual([]);
    expect(Object.keys(PILOTS).filter((name) => !classes.includes(name))).toEqual([]);
  });
});
