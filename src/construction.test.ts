import { describe, expect, it } from "vitest";
import { addParts, blockPay, blocksToGo, builtShare, constructionFromOld, isBuilt, placeBlock, startConstruction } from "./construction";

describe("construction", () => {
  it("pays its purse out over its blocks, a rounded share each and never more than is left", () => {
    const build = startConstruction(25, 1000, 10);
    expect(build).toEqual({ left: 25, used: 0, purse: 1000, blocks: 3, paid: 0 });
    expect(blocksToGo(build, 10)).toBe(3);
    expect(placeBlock(build, 10)).toBe(333);
    expect(builtShare(build)).toBeCloseTo(10 / 25);
    expect(placeBlock(build, 10)).toBe(333);
    expect(isBuilt(build)).toBe(false);
    expect(placeBlock(build, 10)).toBe(333);
    expect(build).toEqual({ left: 0, used: 25, purse: 1000, blocks: 3, paid: 999 });
    expect(blockPay(startConstruction(20, 900, 10))).toBe(450);
    const short = { ...startConstruction(20, 100, 10), paid: 80 };
    expect(blockPay(short)).toBe(20);
    expect(isBuilt(build)).toBe(true);
    expect(builtShare(build)).toBe(1);
  });

  it("can be built straight from parts, as a station builds its own turrets", () => {
    const build = startConstruction(10, 0, 10);
    expect(addParts(build, 4)).toBe(false);
    expect(addParts(build, 100)).toBe(true);
    expect(build.used).toBe(10);
  });

  it("reads an old save's project: its funding, or the share of its price still to pay", () => {
    expect(constructionFromOld({ partsLeft: 20, partsUsed: 10, purse: 900, blocks: 3, paid: 300 }, 5, 10)).toEqual({
      left: 20, used: 10, purse: 900, blocks: 3, paid: 300,
    });
    // From before projects were carried in blocks: two thirds of the price left, two blocks to go.
    expect(constructionFromOld({ partsLeft: 20, partsUsed: 10 }, 900, 10)).toEqual({ left: 20, used: 10, purse: 600, blocks: 2, paid: 0 });
  });
});
