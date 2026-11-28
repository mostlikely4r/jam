/**
 * Helpers for tests that buy: since the workshop builds what the player buys behind a bar
 * (`docs/recipes-factories-plan.md`, step 2), a test that looks at what it bought hands the
 * order over at once. A test of the wait itself calls `buyPart` and steps the sim.
 */
import type { Sim } from "./sim";

/** Buys a part, then hands over what the workshop would make of it at once. Returns whether the buy went through. */
export function buyNow(sim: Sim, ...args: Parameters<Sim["buyPart"]>): boolean {
  const bought = sim.buyPart(...args);
  sim.finishOrders();
  return bought;
}

/** Buys a hull, then hands it over at once. Returns whether the buy went through. */
export function buyHullNow(sim: Sim, ...args: Parameters<Sim["buyHull"]>): boolean {
  const bought = sim.buyHull(...args);
  sim.finishOrders();
  return bought;
}
