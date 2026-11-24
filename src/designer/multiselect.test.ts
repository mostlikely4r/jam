import { describe, expect, it } from "vitest";
import { offered, withPick, withoutPick, type MultiOption } from "./multiselect";

const OPTIONS: MultiOption[] = [
  { id: "haul", label: "Hauling" },
  { id: "mine", label: "Mining" },
  { id: "map", label: "Field map" },
  { id: "dodge", label: "Dodging" },
];

describe("picking out of a long list", () => {
  it("adds on the end, keeping the order picked, and never twice", () => {
    expect(withPick([], "mine")).toEqual(["mine"]);
    expect(withPick(["mine"], "haul")).toEqual(["mine", "haul"]);
    expect(withPick(["mine", "haul"], "mine")).toEqual(["mine", "haul"]);
  });

  it("takes one off and leaves the rest in order", () => {
    expect(withoutPick(["mine", "haul", "map"], "haul")).toEqual(["mine", "map"]);
    expect(withoutPick(["mine"], "dodge")).toEqual(["mine"]);
  });

  it("offers the rest in their own order, matching the label or the id", () => {
    expect(offered(OPTIONS, [], "").map((each) => each.id)).toEqual(["haul", "mine", "map", "dodge"]);
    expect(offered(OPTIONS, [], "mi").map((each) => each.id)).toEqual(["mine"]);
    expect(offered(OPTIONS, [], "MAP").map((each) => each.id)).toEqual(["map"]);
    // "dodge" is its id; "Dodging" is its label.
    expect(offered(OPTIONS, [], "dodg").map((each) => each.id)).toEqual(["dodge"]);
    expect(offered(OPTIONS, [], "  haul ").map((each) => each.id)).toEqual(["haul"]);
  });

  it("never offers one that is picked already", () => {
    expect(offered(OPTIONS, ["mine"], "").map((each) => each.id)).toEqual(["haul", "map", "dodge"]);
    expect(offered(OPTIONS, ["mine"], "min")).toEqual([]);
  });

  it("trims what it reads, and finds nothing for a filter that matches none", () => {
    expect(offered(OPTIONS, [], "   ").length).toBe(4);
    expect(offered(OPTIONS, [], "zzz")).toEqual([]);
  });
});
