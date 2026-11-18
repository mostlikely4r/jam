import { describe, expect, it } from "vitest";
import { autoPlace, canPlace, cellsOf, fits, floatsAfterRemoval, footprint, reachableCells, sticks, usedCells, type GridSpec, type Placed } from "./grid";
import type { PartId } from "./parts";

// Shapes as shipped: turnThrusters 1x1, gun1 1x2, tractor 2x2.
const item = (part: PartId, x: number, y: number, turned = false): Placed => ({ module: { part, wear: 0 }, x, y, turned });
const smallBay: GridSpec = { w: 5, h: 2, entry: { x: 2, y: 0 } };
const tallBay: GridSpec = { w: 5, h: 4, entry: { x: 2, y: 0 } };
const locker: GridSpec = { w: 4, h: 3 };

describe("grid", () => {
  it("turning swaps width and height", () => {
    expect(footprint(item("gun1", 0, 0))).toEqual({ w: 1, h: 2 });
    expect(footprint(item("gun1", 0, 0, true))).toEqual({ w: 2, h: 1 });
    expect(cellsOf(item("gun1", 3, 1, true))).toEqual([
      { x: 3, y: 1 },
      { x: 4, y: 1 },
    ]);
  });

  it("fits only inside the grid and off other items", () => {
    expect(fits(smallBay, [], item("gun1", 4, 0))).toBe(true);
    expect(fits(smallBay, [], item("gun1", 4, 1))).toBe(false);
    expect(fits(smallBay, [], item("gun1", 4, 0, true))).toBe(false);
    expect(fits(smallBay, [], item("gun1", -1, 0))).toBe(false);
    expect(fits(smallBay, [item("gun1", 0, 0)], item("gun1", 0, 1, true))).toBe(false);
    expect(fits(smallBay, [item("gun1", 0, 0)], item("gun1", 1, 0))).toBe(true);
  });

  it("an item must touch a wall, or a chain of items that does", () => {
    expect(sticks(tallBay, [], item("turnThrusters", 2, 1))).toBe(false);
    expect(canPlace(tallBay, [], item("turnThrusters", 2, 1))).toBe(false);
    const floor = item("gun1", 2, 2);
    expect(canPlace(tallBay, [], floor)).toBe(true);
    expect(canPlace(tallBay, [floor], item("turnThrusters", 2, 1))).toBe(true);
    // Touching only at a corner is not touching.
    expect(canPlace(tallBay, [floor], item("turnThrusters", 1, 1))).toBe(false);
  });

  it("a locker has no sticking rule", () => {
    expect(sticks(locker, [], item("turnThrusters", 1, 1))).toBe(true);
    expect(canPlace(locker, [], item("turnThrusters", 1, 1))).toBe(true);
  });

  it("names the items that would float if one were taken out", () => {
    const floor = item("gun1", 2, 2);
    const top = item("turnThrusters", 2, 1);
    expect(floatsAfterRemoval(tallBay, [floor, top], floor)).toEqual([top]);
    expect(floatsAfterRemoval(tallBay, [floor, top], top)).toEqual([]);
    expect(floatsAfterRemoval(locker, [floor, top], floor)).toEqual([]);
  });

  it("counts the free cells ore can reach from the entry", () => {
    expect(reachableCells(smallBay, [])).toBe(10);
    expect(usedCells([item("gun1", 0, 0)])).toBe(2);
    expect(reachableCells(smallBay, [item("gun1", 0, 0)])).toBe(8);
    // A pocket sealed off from the entry stays empty.
    expect(reachableCells(smallBay, [item("gun1", 1, 0)])).toBe(6);
    // A blocked entry lets nothing in.
    expect(reachableCells(smallBay, [item("gun1", 2, 0)])).toBe(0);
    // Without an entry, every free cell counts.
    expect(reachableCells(locker, [item("gun1", 1, 0)])).toBe(10);
  });

  it("auto-places where it sticks, keeps the entry open and seals no pocket", () => {
    expect(autoPlace(smallBay, [], { part: "gun1", wear: 0 })).toMatchObject({ x: 0, y: 0, turned: false });
    expect(autoPlace(smallBay, [], { part: "tractor", wear: 0 })).toMatchObject({ x: 0, y: 0, turned: false });
    const second = autoPlace(smallBay, [item("tractor", 0, 0)], { part: "tractor", wear: 0 });
    expect(second).toMatchObject({ x: 3, y: 0, turned: false });
    expect(reachableCells(smallBay, [item("tractor", 0, 0), second!])).toBe(2);
    // The only spot would block the entry: no spot.
    expect(autoPlace({ w: 1, h: 1, entry: { x: 0, y: 0 } }, [], { part: "turnThrusters", wear: 0 })).toBeNull();
    expect(autoPlace(smallBay, [], { part: "largeBay", wear: 0 })).toBeNull();
  });

  it("auto-places in a locker at the first free spot, top left first", () => {
    expect(autoPlace(locker, [], { part: "gun1", wear: 0 })).toMatchObject({ x: 0, y: 0, turned: false });
    expect(autoPlace(locker, [item("gun1", 0, 0)], { part: "gun1", wear: 0 })).toMatchObject({ x: 1, y: 0, turned: false });
    // Only room left turned.
    const full = [item("tractor", 0, 0), item("tractor", 2, 0), item("turnThrusters", 0, 2)];
    expect(autoPlace(locker, full, { part: "gun1", wear: 0 })).toMatchObject({ x: 1, y: 2, turned: true });
  });
});
