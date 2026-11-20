/**
 * A no-player run's journey, as data: the things to own, in the order a designer means them to
 * be found. Nothing here judges: the bot works the first step it doesn't have and mines in
 * between (see bot.ts). Every price comes from the game, never from this list.
 *
 * Idle floating's list, and the reason for each step, is in docs/no-player-runs-plan.md.
 */
import type { ShipModel } from "../parts";
import type { PartId } from "../parts";
import type { Ship } from "../sim";

/** One thing the journey wants: a step is done when every part of it is fitted and working. */
export interface Step {
  /** How the log and the report name it. */
  label: string;
  parts: PartId[];
}

export interface Plan {
  /** What the run calls itself, as the report's title. */
  name: string;
  steps: Step[];
}

/**
 * The floater's journey: what a player settling into idle floating buys, in the order that
 * makes each next trip easier. The all-round tractor is left out on purpose: it's at the far
 * base, and the cone is enough for a ship that parks by its rock.
 */
export const FLOATER_JOURNEY: Plan = {
  name: "Floater journey",
  steps: [
    { label: "bay", parts: ["bay"] },
    { label: "turret", parts: ["turret"] },
    { label: "tractor, cone", parts: ["tractor"] },
    { label: "targeting", parts: ["targeting"] },
    { label: "large bay", parts: ["largeBay"] },
    { label: "route planner, system chart, autopilot", parts: ["clickRoute", "starmap", "autopilot"] },
  ],
};

/** The journey a ship's track plays, or null while that track is still unwritten. */
export function planFor(model: ShipModel): Plan | null {
  return model === "floater" ? FLOATER_JOURNEY : null;
}

/**
 * Whether the ship has a part *working*: a program counts only while it's loaded, so a
 * program bought with no free slot is a step not yet done, which is what the run should show.
 */
export function working(ship: Ship, part: PartId): boolean {
  return ship.parts.has(part);
}

/** The first step this ship still has to do, or null when the journey is complete. */
export function currentStep(ship: Ship, plan: Plan): number | null {
  const at = plan.steps.findIndex((step) => step.parts.some((part) => !working(ship, part)));
  return at < 0 ? null : at;
}

/** The first part of a step the ship hasn't got working, or null when the step is done. */
export function missingPart(ship: Ship, step: Step): PartId | null {
  return step.parts.find((part) => !working(ship, part)) ?? null;
}

/** The step it's on, in words for the log and the report: "step 3, tractor, cone". */
export function stepName(ship: Ship, plan: Plan): string {
  const at = currentStep(ship, plan);
  return at === null ? `all ${plan.steps.length} steps done` : `step ${at + 1}, ${plan.steps[at].label}`;
}
