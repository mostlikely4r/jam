/**
 * The dock shop's grid: which category each part hangs under, and what a line's state says on
 * its cell. Pure, so the mapping from a `ShopLine`'s state to dimming and badge is tested
 * without the screen. The tooltip always says why in words; the cell only shows state.
 */
import type { Part } from "./parts";

/** The shop's category headers, in the order they show. One with nothing under it is left out. */
export const SHOP_CATEGORIES = [
  "Hulls",
  "Engines and thrusters",
  "Weapons",
  "Tractors",
  "Computers",
  "Cargo bays",
  "Fuel tanks",
  "Cockpits",
  "Programs",
  "Station",
] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

/** Which header a part's cell hangs under. Hulls and the Station items aren't parts: they come first and last on their own. */
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
    case "tank":
      return "Fuel tanks";
    case "cockpit":
      return "Cockpits";
    case "program":
      return "Programs";
    case "item":
      // Items are never on sale; this only keeps the mapping whole.
      return "Station";
  }
}

/** What a shop line sells, which is what decides what the station spends to supply it. */
export type ShopSupply = "store" | "program" | "service";

/**
 * Whether the station can supply a line of its shop. A part for sale comes out of the store the
 * station builds it into; a program is only software, so the station's parts are not spent on
 * it and it is always there to sell; a service, a new drone, is made from the station's parts.
 */
export function canSupplyLine(what: ShopSupply, station: { stocked: boolean; hasParts: boolean }): boolean {
  if (what === "program") return true;
  return what === "store" ? station.stocked : station.hasParts;
}

/** What a cell's corner badge draws. `none` draws nothing. */
export type ShopBadge = "none" | "sell" | "load" | "run" | "lock" | "halfLock" | "clock" | "tick";

/**
 * What a shop line's state says on its cell:
 * - can buy: full colour;
 * - already yours: a corner badge (`$` sell, `▸` load, `■` running), full colour;
 * - can't be bought: dimmed;
 * - a blueprint to fund: a lock badge, half-lit when only part of it can be paid;
 * - a part the station can't make for want of the items its recipe needs: dimmed, a lock badge;
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
    case "lacks":
      // The station holds what it needs to sell it, except the items its recipe takes in.
      return { dim: true, badge: "lock" };
    case "pending":
      return { dim: true, badge: "clock" };
    case "built":
      return { dim: true, badge: "tick" };
    default:
      return { dim: true, badge: "none" };
  }
}
