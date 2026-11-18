import { describe, expect, it } from "vitest";
import { binRoom, newBin, stepBin, type Box, type Rect } from "./cargoBin";

const box: Box = { x: 0, y: 0, angle: 0, w: 10, h: 4 };
/** The left 4 of the box's 10 across, top to bottom: in the box's frame, centred on its middle. */
const blocked: Rect[] = [{ x: -5, y: -2, w: 4, h: 4 }];

/** Shakes the ship about for ten seconds. */
function shake(share: number, rects: Rect[]) {
  const bin = newBin(0);
  for (let t = 1; t <= 600; t++) {
    stepBin(bin, box, share, { vx: Math.sin(t * 0.3) * 80, vy: Math.cos(t * 0.21) * 80, spin: Math.sin(t * 0.05), angle: t * 0.01 }, t * 16, rects);
  }
  return bin;
}

describe("the cargo bin", () => {
  it("keeps lumps out of what's blocked, however the ship moves", () => {
    const bin = shake(0.7, blocked);
    expect(bin.lumps.length).toBeGreaterThan(0);
    for (const lump of bin.lumps) expect(lump.x).toBeGreaterThanOrEqual(-1);
  });

  it("a full bin fills only the free part of the box", () => {
    const bin = shake(1, blocked);
    expect(bin.lumps.length).toBe(Math.round(binRoom(box) * 0.6));
    expect(shake(1, []).lumps.length).toBe(binRoom(box));
  });

  it("works as before with nothing blocked", () => {
    const bin = shake(0.5, []);
    expect(bin.lumps.length).toBe(Math.round(binRoom(box) * 0.5));
    for (const lump of bin.lumps) {
      expect(Math.abs(lump.x)).toBeLessThanOrEqual(5);
      expect(Math.abs(lump.y)).toBeLessThanOrEqual(2);
    }
  });
});
