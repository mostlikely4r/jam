import { describe, expect, it } from "vitest";
import { GLYPHS, GLYPH_IDS, hasGlyph } from "./glyphs";
import { markShown } from "./icons";
import { PARTS, partOf } from "./parts";
import { resetPartStats, shipFileNow, useShipFile, type ShipFile } from "./fitting";

describe("glyphs and part icons", () => {
  /** Runs `body` with the ship file changed, and puts it back after. */
  function withFile(change: () => void, body: () => void): void {
    const was = shipFileNow();
    try {
      change();
      body();
    } finally {
      useShipFile(was);
    }
  }

  it("has at least 30 glyphs, and no two share an id", () => {
    expect(GLYPHS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(GLYPH_IDS).size).toBe(GLYPH_IDS.length);
    for (const id of GLYPH_IDS) expect(hasGlyph(id)).toBe(true);
    expect(hasGlyph("no such glyph")).toBe(false);
  });

  it("every part's default icon names a known glyph and carries its colours", () => {
    for (const part of PARTS) {
      const icon = part.icon;
      expect(icon, part.id).toBeDefined();
      expect(hasGlyph(icon.glyph), `${part.id} names ${icon.glyph}`).toBe(true);
      expect(icon.primary, part.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(icon.secondary, part.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(icon.border, part.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("an icon override round-trips through the ship file, and a reset puts the code's back", () => {
    const coded = { ...partOf("gun2").icon };
    withFile(
      () => (partOf("gun2").icon = { ...coded, glyph: "star", mark: "test mark" }),
      () => {
        expect(partOf("gun2").icon.glyph).toBe("star");
        const file = shipFileNow();
        expect(file.partStats!.gun2).toEqual({ icon: { glyph: "star", primary: coded.primary, secondary: coded.secondary, border: coded.border, mark: "test mark" } });
        // Putting the file in play keeps the change.
        useShipFile(file);
        expect(partOf("gun2").icon.glyph).toBe("star");
        expect(partOf("gun2").icon.mark).toBe("test mark");
        // Resetting the part puts the code's own icon back, and the diff is gone.
        resetPartStats("gun2");
        expect(partOf("gun2").icon).toEqual(coded);
        expect(shipFileNow().partStats!.gun2).toBeUndefined();
      },
    );
  });

  it("a file's icon is only sat over the code's when its glyph and colours are valid", () => {
    const coded = { ...partOf("bay").icon };
    const file = (): ShipFile => shipFileNow();
    withFile(
      () => {},
      () => {
        const bad: ShipFile = { ...file(), partStats: { ...file().partStats, bay: { icon: { ...coded, glyph: "no such glyph" } } } };
        useShipFile(bad);
        expect(partOf("bay").icon.glyph).toBe(coded.glyph);
        const colourless: ShipFile = { ...file(), partStats: { ...file().partStats, bay: { icon: { ...coded, border: "" } } } };
        useShipFile(colourless);
        expect(partOf("bay").icon.border).toBe(coded.border);
      },
    );
  });

  it("a mark shows at most its first 3 characters", () => {
    expect(markShown("360")).toBe("360");
    expect(markShown("1234")).toBe("123");
    expect(markShown("  *  ")).toBe("*");
    expect(markShown("")).toBe("");
    expect(markShown(undefined)).toBe("");
  });
});
