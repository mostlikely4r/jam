import { describe, expect, it } from "vitest";
import { copyPicks, needsMet, pickOf, programDef, programsFileNow, setPick, tweakKey, useProgramsFile, type ProgramDef, type ProgramsFile } from "./programs";

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

describe("per-mount tweaks", () => {
  const onOff = [
    { id: "on", name: "On" },
    { id: "off", name: "Off" },
  ];

  it("reads `each` when it names a part kind, and drops a tweak that names an unknown one", () => {
    withFile(() => {
      useProgramsFile(
        file([
          {
            id: "test",
            tweaks: [
              { id: "fires", name: "Fires", default: "on", options: onOff, each: "gun" },
              { id: "bad", name: "Bad", default: "on", options: onOff, each: "noSuchKind" as never },
              { id: "plain", name: "Plain", default: "on", options: onOff },
            ],
          },
        ]),
      );
      const tweaks = programDef("test")!.tweaks!;
      expect(tweaks.map((tweak) => tweak.id)).toEqual(["fires", "plain"]);
      expect(tweaks[0].each).toBe("gun");
      expect("each" in tweaks[1]).toBe(false);
    });
  });

  it("a mount without a pick reads the default, a set one its own pick, and each mount apart", () => {
    const picks = {};
    expect(pickOf(picks, "autoMine", "fires", "turretGun")).toBe("on");
    expect(setPick(picks, "autoMine", "fires", "off", "turretGun")).toBe(true);
    expect(pickOf(picks, "autoMine", "fires", "turretGun")).toBe("off");
    expect(pickOf(picks, "autoMine", "fires", "gun")).toBe("on");
    expect(picks).toEqual({ autoMine: { [tweakKey("fires", "turretGun")]: "off" } });
    expect(tweakKey("fires", "turretGun")).toBe("fires@turretGun");
  });

  it("a per-mount tweak needs a mount to be set; a plain one ignores it", () => {
    const picks = {};
    expect(setPick(picks, "autoMine", "fires", "off")).toBe(false);
    expect(pickOf(picks, "autoMine", "fires")).toBe("on");
    expect(setPick(picks, "autoMine", "shootsAt", "primary", "turretGun")).toBe(true);
    expect(pickOf(picks, "autoMine", "shootsAt")).toBe("primary");
    expect(picks).toEqual({ autoMine: { shootsAt: "primary" } });
  });

  it("the four mining programs ship as planned: each needs Targeting, both auto-mines carry Fires per gun", () => {
    for (const id of ["turretTracking", "autoMine", "faceTarget", "autoMine2"]) expect(programDef(id)?.needs).toEqual(["targeting"]);
    for (const id of ["autoMine", "autoMine2"]) {
      const tweaks = programDef(id)!.tweaks!;
      expect(tweaks.map((tweak) => [tweak.id, tweak.default, tweak.each ?? null])).toEqual([
        ["shootsAt", "any", null],
        ["fires", "on", "gun"],
      ]);
    }
  });
});
