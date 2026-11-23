import { describe, expect, it } from "vitest";
import { PARTS } from "./parts";
import { PROGRAM_PARTS } from "./programs";
import { partCategory, SHOP_CATEGORIES, shopCellState } from "./shop";

describe("the shop grid", () => {
  it("maps a line's state to its dimming and badge, for each state there is", () => {
    const line = (tag: string, enabled = true) => shopCellState({ tag, enabled });
    expect(line("buy")).toEqual({ dim: false, badge: "none" });
    expect(line("load")).toEqual({ dim: false, badge: "load" });
    expect(line("loaded")).toEqual({ dim: false, badge: "run" });
    expect(line("sell")).toEqual({ dim: false, badge: "sell" });
    expect(line("unlock")).toEqual({ dim: false, badge: "lock" });
    expect(line("unlock partial")).toEqual({ dim: false, badge: "halfLock" });
    expect(line("pending", false)).toEqual({ dim: true, badge: "clock" });
    expect(line("built", false)).toEqual({ dim: true, badge: "tick" });
    // Anything that can't be acted on is dimmed, with no badge: the tooltip says why.
    for (const tag of ["doesn't fit", "not enough money", "out of parts", "no free slot", "at limit", "needs a deposit"]) {
      expect(line(tag, false), tag).toEqual({ dim: true, badge: "none" });
    }
  });

  it("the category of every part is known: none falls outside a header", () => {
    for (const part of [...PARTS, ...PROGRAM_PARTS]) {
      const category = partCategory(part);
      expect(SHOP_CATEGORIES, `${part.id} has no header`).toContain(category);
    }
    expect(partCategory(PARTS.find((part) => part.id === "gun2")!)).toBe("Weapons");
    expect(partCategory(PARTS.find((part) => part.id === "reverse")!)).toBe("Engines and thrusters");
    expect(partCategory(PARTS.find((part) => part.id === "bay")!)).toBe("Cargo bays");
    expect(partCategory(PROGRAM_PARTS.find((part) => part.id === "spinStabilizer")!)).toBe("Programs");
    expect(partCategory(PARTS.find((part) => part.id === "cockpitKite")!)).toBe("Cockpits");
    // The order the headers show in.
    expect(SHOP_CATEGORIES).toEqual([
      "Engines and thrusters",
      "Weapons",
      "Tractors",
      "Computers",
      "Cargo bays",
      "Fuel tanks",
      "Cockpits",
      "Programs",
      "Station",
    ]);
  });
});
