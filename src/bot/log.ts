/**
 * A no-player run's session log: what happened, when, and every input the bot gave, then the
 * report at the end of it. Plain data in, text or one line of JSON out, so two runs can be
 * compared line for line.
 *
 * Times are game seconds since the run began, not wall clock: the same seed and the same plan
 * give the same log.
 */

/** One thing that happened, in words. */
export interface BotEvent {
  at: number;
  text: string;
}

/** One player input: an order, a burst of fire, a buy, a sale. */
export interface BotInput {
  at: number;
  kind: string;
  detail: string;
}

/** A plan step, when it was finished. */
export interface StepDone {
  index: number;
  label: string;
  at: number;
}

/** A wreck, and what it cost: logged when it happens, filled in when the ship is back. */
export interface Wreck {
  at: number;
  /** Ore aboard when it went up. */
  ore: number;
  /** When the new ship was ready, and what the yard took for it. */
  back: number | null;
  cost: number;
}

/** A time the game turned the bot down: the step can't be done, and the run should say so. */
export interface Snag {
  at: number;
  what: string;
  why: string;
}

/** A module that stopped working, and when: one that is repaired and breaks again is two. */
export interface Break {
  at: number;
  what: string;
}

/** What the hits cost the run: hull points lost, and credits spent on repairs and rebuilds. */
export interface Damage {
  hullLost: number;
  repairCredits: number;
}

export interface RunEnd {
  why: "goal" | "stuck" | "time";
  at: number;
  /** The step it was on, for a stall: "step 2, turret". */
  step: string;
  /** Why the run ended, when it ended for a reason of its own rather than the clock. */
  reason?: string;
}

/** What the run was, for the report's headings. */
export interface RunInfo {
  /** The plan's own name. */
  title: string;
  track: string;
  seed: number;
  hours: number;
  world: string;
}

/** Whole thousands with commas, the same in every place. */
function thousands(value: number): string {
  const whole = Math.round(value);
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Game time as h:mm, the way the report reads. */
export function clock(seconds: number): string {
  const at = Math.max(0, seconds);
  return `${Math.floor(at / 3600)}:${String(Math.floor((at % 3600) / 60)).padStart(2, "0")}`;
}

/** A gap in seconds, as words: seconds under two minutes, minutes after that. */
function span(seconds: number): string {
  if (seconds < 120) return `${Math.round(seconds)} s`;
  return `${Math.round(seconds / 60)} min`;
}

/** The longest of a list, without spreading it into a call: a run's list is long. */
function longest(values: number[]): number {
  let most = 0;
  for (const value of values) most = Math.max(most, value);
  return most;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export class BotLog {
  /** When the run began, on the game's clock. Every time in here is measured from it. */
  start = 0;
  events: BotEvent[] = [];
  inputs: BotInput[] = [];
  steps: StepDone[] = [];
  wrecks: Wreck[] = [];
  snags: Snag[] = [];
  breaks: Break[] = [];
  /** What the hull and the modules have cost so far, kept up as the run goes. */
  damage: Damage = { hullLost: 0, repairCredits: 0 };
  /** Ore its own shots broke loose, and how much of that it picked up. */
  own: { freed: number; picked: number } = { freed: 0, picked: 0 };
  /** How far from the rock it was each time it opened fire, one a burst. */
  fired: number[] = [];
  /** The ship's credits earned, sampled as it grew: the report's credits an hour come from it. */
  earned: { at: number; total: number }[] = [];
  /** When Auto-mine was first working, on the game's clock, or null if the run never got there. */
  autoMineAt: number | null = null;
  end: RunEnd | null = null;
  /** Where each line goes as it happens, for watching a run: the headless one keeps quiet. */
  private print: ((line: string) => void) | null;

  constructor(print: ((line: string) => void) | null = null) {
    this.print = print;
  }

  /** The run's own zero. */
  begin(now: number): void {
    this.start = now;
    this.earned = [{ at: now, total: 0 }];
  }

  /** Game seconds since the run began. */
  since(at: number): number {
    return at - this.start;
  }

  event(at: number, text: string): void {
    this.events.push({ at, text });
    this.say(at, text);
  }

  input(at: number, kind: string, detail: string): void {
    this.inputs.push({ at, kind, detail });
    this.say(at, `> ${kind}: ${detail}`);
  }

  step(index: number, label: string, at: number): void {
    this.steps.push({ index, label, at });
  }

  snag(at: number, what: string, why: string): void {
    this.snags.push({ at, what, why });
    this.event(at, `snag: ${what} - ${why}`);
  }

  /** A module that has stopped working: its label, and when. */
  broke(at: number, what: string): void {
    this.breaks.push({ at, what });
  }

  /** The ship's earned credits, as the run goes: the report reads the growth of this. */
  sample(at: number, total: number): void {
    this.earned.push({ at, total });
  }

  /** Credits earned in all, as of a game time. */
  private earnedAt(at: number): number {
    let total = 0;
    for (const sample of this.earned) {
      if (sample.at > at) break;
      total = sample.total;
    }
    return total;
  }

  /** The gaps between inputs, in seconds: the vision's minutes between decisions, measured. */
  gaps(): number[] {
    const gaps: number[] = [];
    for (let i = 1; i < this.inputs.length; i++) gaps.push(this.inputs[i].at - this.inputs[i - 1].at);
    return gaps;
  }

  /**
   * Inputs an hour before and after Auto-mine was first working, and the longest quiet gap after
   * it: the road's minutes between decisions. Null when the run never got there.
   */
  autoMineSplit(): { before: number; after: number; longestGap: number } | null {
    const at = this.autoMineAt;
    if (at === null) return null;
    const endAt = Math.max(this.endAt(), at);
    const before = this.inputs.filter((input) => input.at < at);
    const after = this.inputs.filter((input) => input.at >= at);
    const rate = (count: number, seconds: number) => (seconds > 0 ? Math.round((count * 3600) / seconds) : 0);
    // The quiet runs from the moment it started working to the first input, and between each after.
    let longestGap = 0;
    let last = at;
    for (const input of after) {
      longestGap = Math.max(longestGap, input.at - last);
      last = input.at;
    }
    return { before: rate(before.length, at - this.start), after: rate(after.length, endAt - at), longestGap };
  }

  /** How many whole and part hours the run ran, from its first event to its end. */
  private hours(endAt: number): number {
    const last = this.events.length > 0 ? this.events[this.events.length - 1].at : this.start;
    return Math.max(1, Math.ceil(this.since(Math.max(endAt, last)) / 3600));
  }

  private perHour(kind: "credits" | "inputs"): number[] {
    const hours = this.hours(this.endAt());
    const values: number[] = [];
    for (let hour = 0; hour < hours; hour++) {
      const from = this.start + hour * 3600;
      const to = from + 3600;
      if (kind === "credits") values.push(Math.round(this.earnedAt(to) - this.earnedAt(from)));
      else values.push(this.inputs.filter((input) => input.at >= from && input.at < to).length);
    }
    return values;
  }

  private endAt(): number {
    if (this.end) return this.end.at;
    const last = this.events.length > 0 ? this.events[this.events.length - 1].at : this.start;
    const lastInput = this.inputs.length > 0 ? this.inputs[this.inputs.length - 1].at : this.start;
    return Math.max(last, lastInput);
  }

  /** The run as text, for reading. */
  text(info: RunInfo): string {
    const lines = [`${info.title}, seed ${info.seed}, ${info.hours} h limit, ${info.world}`];
    for (const event of this.events) lines.push(`${clock(this.since(event.at))}  ${event.text}`);
    const done = this.steps.map((step) => `${step.index + 1} ${step.label} ${clock(this.since(step.at))}`);
    if (done.length > 0) lines.push(`Steps:  ${done.join(" | ")}`);
    if (this.snags.length > 0) {
      const seen = new Set<string>();
      const reasons: string[] = [];
      for (const snag of this.snags) {
        const line = `${snag.what}: ${snag.why}`;
        if (seen.has(line)) continue;
        seen.add(line);
        reasons.push(line);
      }
      lines.push(`Snags:  ${reasons.join(" | ")}`);
    }
    const gaps = this.gaps();
    if (gaps.length > 0) {
      lines.push(`Inputs: ${thousands(this.inputs.length)} total, median gap ${span(median(gaps))}, longest gap ${span(longest(gaps))}`);
    }
    const credits = this.perHour("credits");
    const perHour = this.perHour("inputs");
    lines.push(`Per hour: credits earned ${credits.join(", ")} | inputs ${perHour.join(", ")}`);
    const split = this.autoMineSplit();
    if (split) {
      lines.push(`Auto-mine: from ${clock(this.since(this.autoMineAt!))}, inputs an hour ${thousands(split.before)} before, ${thousands(split.after)} after | longest gap after ${span(split.longestGap)}`);
    }
    lines.push(`Mining: fires from a median ${Math.round(median(this.fired))} | own shots freed ${thousands(this.own.freed)} ore, ${thousands(this.own.picked)} of it picked up`);
    lines.push(`Damage: ${thousands(this.damage.hullLost)} hull lost, ${thousands(this.damage.repairCredits)} cr on repairs`);
    if (this.breaks.length > 0) {
      const broke = this.breaks.map((each) => `${each.what} ${clock(this.since(each.at))}`).join(", ");
      lines.push(`Broken: ${broke}`);
    }
    if (this.wrecks.length > 0) {
      const wrecked = this.wrecks
        .map((wreck) => `${wreck.back === null ? "no" : span(wreck.back - wreck.at)} (${wreck.ore} ore, ${thousands(wreck.cost)} cr)`)
        .join("; ");
      lines.push(`Setbacks: ${this.wrecks.length} wreck${this.wrecks.length === 1 ? "" : "s"}: ${wrecked}`);
    }
    return lines.join("\n");
  }

  /** The same as one line of flat keys, for comparing runs with a script. */
  json(info: RunInfo): string {
    const flat: Record<string, string | number | boolean> = {
      track: info.track,
      seed: info.seed,
      hours: info.hours,
      world: info.world,
      end: this.end?.why ?? "time",
      endAt: Math.round(this.since(this.endAt())),
      step: this.end?.step ?? "",
    };
    for (const step of this.steps) flat[`done${step.index + 1}`] = Math.round(this.since(step.at));
    flat.inputs = this.inputs.length;
    const gaps = this.gaps();
    if (gaps.length > 0) {
      flat.gapMedian = Math.round(median(gaps));
      flat.gapLongest = Math.round(longest(gaps));
    }
    this.perHour("credits").forEach((value, hour) => (flat[`credits.h${hour + 1}`] = value));
    this.perHour("inputs").forEach((value, hour) => (flat[`inputs.h${hour + 1}`] = value));
    const split = this.autoMineSplit();
    if (split) {
      flat.inputsPerHourBeforeAutoMine = split.before;
      flat.inputsPerHourAfterAutoMine = split.after;
      flat.longestGapAfterAutoMine = Math.round(split.longestGap);
    }
    flat.wrecks = this.wrecks.length;    this.wrecks.forEach((wreck, index) => {
      flat[`wreck${index + 1}.at`] = Math.round(this.since(wreck.at));
      flat[`wreck${index + 1}.minutes`] = wreck.back === null ? 0 : Math.round((wreck.back - wreck.at) / 60);
      flat[`wreck${index + 1}.ore`] = wreck.ore;
      flat[`wreck${index + 1}.credits`] = wreck.cost;
    });
    flat.snags = this.snags.length;
    [...new Set(this.snags.map((snag) => `${snag.what}: ${snag.why}`))].forEach((line, index) => (flat[`snag${index + 1}`] = line));
    flat.hullLost = Math.round(this.damage.hullLost);
    flat.repairCredits = Math.round(this.damage.repairCredits);
    flat.fires = this.fired.length;
    flat.fireMedian = Math.round(median(this.fired));
    flat.ownFreed = this.own.freed;
    flat.ownPicked = this.own.picked;
    flat.breaks = this.breaks.length;
    this.breaks.forEach((each, index) => (flat[`break${index + 1}`] = `${each.what} ${clock(this.since(each.at))}`));
    return JSON.stringify(flat);
  }

  private say(at: number, text: string): void {
    this.print?.(`${clock(this.since(at))}  ${text}`);
  }
}
