import { describe, expect, it } from "vitest";
import { copyPicks, needsMet, pickOf, programDef, programsFileNow, setPick, useProgramsFile, type ProgramDef, type ProgramsFile } from "./programs";

/** Runs `body` with the programs file changed, and puts the shipped one back after. */
function withFile(body: () => void): void {
  const was = programsFileNow();
  try {
    body();
  } finally {
    useProgramsFile(was);
  }
}

/** A programs file holding just what's given: the game fills in what a record needs. */
const file = (programs: Partial<ProgramDef>[]): ProgramsFile => ({ programs: programs as ProgramDef[] });

describe("program tweaks", () => {
  it("reads tweaks defensively: a fresh id, two options at least, and a default that is one", () => {
    withFile(() => {
      useProgramsFile(
        file([
          {
            id: "test",
            tweaks: [
              // No id: dropped.
              { id: "", name: "Bad", default: "a", options: [{ id: "a", name: "A" }, { id: "b", name: "B" }] },
              // One unique option: dropped.
              { id: "dupes", name: "Dupes", default: "a", options: [{ id: "a", name: "A" }, { id: "a", name: "Again" }] },
              // A default that isn't an option: the first option takes it.
              { id: "order", name: "", default: "nope", options: [{ id: "a", name: "A" }, { id: "b", name: "B" }] },
              // The same id twice: the second is dropped.
              { id: "order", name: "Copy", default: "b", options: [{ id: "x", name: "X" }, { id: "y", name: "Y" }] },
            ],
          },
        ]),
      );
      const tweaks = programDef("test")!.tweaks!;
      expect(tweaks).toHaveLength(1);
      expect(tweaks[0].id).toBe("order");
      // A missing name reads as the id.
      expect(tweaks[0].name).toBe("order");
      expect(tweaks[0].default).toBe("a");
      expect(tweaks[0].options).toEqual([
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ]);
    });
  });

  it("keeps a need only for a program that exists, and never one for itself", () => {
    withFile(() => {
      useProgramsFile(
        file([
          { id: "base" },
          { id: "other", needs: ["base", "noSuch", "other"] },
        ]),
      );
      expect(programDef("other")!.needs).toEqual(["base"]);
      expect(needsMet("other", ["base"])).toBe(true);
      expect(needsMet("other", ["other"])).toBe(false);
      expect(needsMet("base", [])).toBe(true);
    });
  });

  it("the shipped Relative lines needs Targeting, and Targeting has its Box picks tweak", () => {
    const targeting = programDef("targeting")!;
    expect(targeting.tweaks?.map((tweak) => tweak.id)).toEqual(["boxPicks"]);
    expect(targeting.tweaks?.[0].options.map((option) => option.id)).toEqual(["rocks", "ships", "everything"]);
    expect(targeting.tweaks?.[0].default).toBe("rocks");
    const lines = programDef("relativeLines")!;
    expect(lines.needs).toEqual(["targeting"]);
    expect(lines.tweaks?.map((tweak) => tweak.id)).toEqual(["show", "relativeTo"]);
  });

  it("a missing or unknown pick reads as the default", () => {
    const picks = { targeting: { boxPicks: "everything" } };
    expect(pickOf(picks, "targeting", "boxPicks")).toBe("everything");
    expect(pickOf(undefined, "targeting", "boxPicks")).toBe("rocks");
    expect(pickOf({ targeting: { boxPicks: "noSuchOption" } }, "targeting", "boxPicks")).toBe("rocks");
    expect(pickOf(picks, "noSuchProgram", "boxPicks")).toBe("");
  });

  it("a pick is only set when the tweak and the option are there, and picks copy apart", () => {
    const picks = {};
    expect(setPick(picks, "targeting", "boxPicks", "ships")).toBe(true);
    expect(pickOf(picks, "targeting", "boxPicks")).toBe("ships");
    expect(setPick(picks, "targeting", "boxPicks", "noSuchOption")).toBe(false);
    expect(setPick(picks, "targeting", "noSuchTweak", "ships")).toBe(false);
    const copy = copyPicks(picks);
    copy.targeting!.boxPicks = "everything";
    expect(pickOf(picks, "targeting", "boxPicks")).toBe("ships");
    expect(copyPicks(undefined)).toEqual({});
  });
});
