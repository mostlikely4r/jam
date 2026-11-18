/**
 * The dock shop's grid: which category each part hangs under, and what a line's state says on
 * its cell. Pure, so the mapping from a `ShopLine`'s state to dimming and badge is tested
 * without the screen. The tooltip always says why in words; the cell only shows state.
 */
import type { Part } from "./parts";

/** The shop's category headers, in the order they show. One with nothing under it is left out. */
export const SHOP_CATEGORIES = [
  "Engines and thrusters",
  "Weapons",
  "Tractors",
  "Computers",
  "Cargo bays",
  "Cockpits",
  "Programs",
  "Station",
] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

/** Which header a part's cell hangs under. The Station items aren't parts: they come last on their own. */
export function partCategory(part: Part): ShopCategory {
  switch (part.kind) {
    case "thruster":
      return "Engines and thrusters";
    case "gun":
    case "turret":
      return "Weapons";
    case "tractor":
      return "Tractors";
    case "computer":
      return "Computers";
    case "section":
      return "Cargo bays";
    case "cockpit":
      return "Cockpits";
    case "program":
      return "Programs";
  }
}

/** What a cell's corner badge draws. `none` draws nothing. */
export type ShopBadge = "none" | "sell" | "load" | "run" | "lock" | "halfLock" | "clock" | "tick";

/**
 * What a shop line's state says on its cell:
 * - can buy: full colour;
 * - already yours: a corner badge (`$` sell, `▸` load, `■` running), full colour;
 * - can't be bought: dimmed;
 * - a blueprint to fund: a lock badge, half-lit when only part of it can be paid;
 * - paid and on its way: a clock badge, dimmed;
 * - built (station items): a tick badge, dimmed.
 */
export function shopCellState(line: { tag: string; enabled: boolean }): { dim: boolean; badge: ShopBadge } {
  switch (line.tag) {
    case "buy":
      return { dim: false, badge: "none" };
    case "load":
      return { dim: false, badge: "load" };
    case "loaded":
      return { dim: false, badge: "run" };
    case "sell":
      return { dim: false, badge: "sell" };
    case "unlock":
      return { dim: false, badge: "lock" };
    case "unlock partial":
      return { dim: false, badge: "halfLock" };
    case "pending":
      return { dim: true, badge: "clock" };
    case "built":
      return { dim: true, badge: "tick" };
    default:
      return { dim: true, badge: "none" };
  }
}
