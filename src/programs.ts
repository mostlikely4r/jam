import file from "./programs.json";
import { hasGlyph } from "./glyphs";
import { forgetThing, PART_KINDS, registerThing, type Part, type PartIcon, type PartId, type PartKind } from "./parts";

/**
 * Programs: what a pilot buys, owns and loads into a computer. They are not items and not
 * modules: they have their own records here, their own page in the designer, and their own
 * rules (a flat credit price, nothing taken from a station's stock, and carried through
 * death). Kept in src/programs.json, in the game at once.
 *
 * They still go through the game as `PartId`s, so `ship.software` and `ship.programs` are the
 * lists they always were: each is registered as a part of its own kind (`isProgram`).
 */
/** One named choice a program's tweak offers. */
export interface ProgramTweakOption {
  id: string;
  name: string;
}

/**
 * A choice about how a program does its job, with a name and a list of options. A different
 * job is a different program; a tweak only adjusts this one.
 */
export interface ProgramTweak {
  id: string;
  name: string;
  options: ProgramTweakOption[];
  /** The option a pilot gets without picking one. Always one of `options`. */
  default: string;
  /**
   * A tweak that repeats per mount: one pick for each mount of the ship holding a working part
   * of this kind ("Fires" once per gun). Without it, the tweak is one pick for the program.
   */
  each?: PartKind;
}

/**
 * A pilot's picks: program id, then tweak id, then the option id picked. A program or tweak
 * without a pick reads as its default, so only the changes have to be kept. A tweak that repeats
 * per mount keeps each mount's pick under `<tweak>@<mount>` (see `tweakKey`).
 */
export type TweakPicks = Partial<Record<string, Record<string, string>>>;

export interface ProgramDef {
  id: string;
  name: string;
  /** For compact lists of what a pilot has: `spin`, `retro`, `auto`. */
  short: string;
  description: string;
  /** What it costs, flat: no stock, no price scale. */
  price: number;
  /** 0 = sold from the start, 1 and 2 = once haulers have bought enough of the station's ore. */
  tier: 0 | 1 | 2;
  icon: PartIcon;
  /** How it can be adjusted. Empty or missing: it has no tweaks. */
  tweaks?: ProgramTweak[];
  /** Programs this one needs loaded to do anything: Relative lines needs Targeting. */
  needs?: string[];
}

export interface ProgramsFile {
  programs: ProgramDef[];
}

/** The programs there are. Changed in place by the program designer. */
export const PROGRAMS: ProgramDef[] = [];

/** The programs as parts, in the file's order: what the shop lists and a hull's default programs name. */
export const PROGRAM_PARTS: Part[] = [];

const FALLBACK_ICON: PartIcon = { glyph: "chip", primary: "#2f6e74", secondary: "#7fdfe6", border: "#c4a4f0" };

const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const colour = (value: unknown): value is string => typeof value === "string" && value !== "";

/** An icon read from a file: the glyph must exist and the colours be there, else the fallback. */
function readIcon(raw: Partial<PartIcon> | undefined): PartIcon {
  if (!raw || !hasGlyph(String(raw.glyph)) || !colour(raw.primary) || !colour(raw.secondary) || !colour(raw.border)) return { ...FALLBACK_ICON };
  const mark = typeof raw.mark === "string" ? raw.mark : "";
  return { glyph: raw.glyph!, primary: raw.primary, secondary: raw.secondary, border: raw.border, ...(mark ? { mark } : {}) };
}

/** A tweak's options read from a file: each a fresh id and a name, and at least two of them. */
function readTweakOptions(raw: unknown): ProgramTweakOption[] {
  if (!Array.isArray(raw)) return [];
  const taken = new Set<string>();
  const options: ProgramTweakOption[] = [];
  for (const each of raw as Partial<ProgramTweakOption>[]) {
    if (!each || typeof each.id !== "string" || each.id === "" || taken.has(each.id)) continue;
    taken.add(each.id);
    options.push({ id: each.id, name: typeof each.name === "string" && each.name ? each.name : each.id });
  }
  return options.length >= 2 ? options : [];
}

/** The tweaks a program has, read defensively: two options at least, a default that's one. */
function readTweaks(raw: unknown): ProgramTweak[] {
  if (!Array.isArray(raw)) return [];
  const taken = new Set<string>();
  const tweaks: ProgramTweak[] = [];
  for (const each of raw as Partial<ProgramTweak>[]) {
    if (!each || typeof each.id !== "string" || each.id === "" || taken.has(each.id)) continue;
    const options = readTweakOptions(each.options);
    if (options.length === 0) continue;
    const name = typeof each.name === "string" && each.name ? each.name : each.id;
    // A tweak that repeats over a kind of part the game doesn't have is bad data, and goes.
    if (each.each != null && !(PART_KINDS as readonly unknown[]).includes(each.each)) continue;
    taken.add(each.id);
    const picked = options.some((option) => option.id === each.default) ? each.default! : options[0].id;
    tweaks.push({ id: each.id, name, options, default: picked, ...(each.each ? { each: each.each } : {}) });
  }
  return tweaks;
}

/** A program read from a file, or null when it has no usable id, or the id is taken. */
function readProgram(raw: Partial<ProgramDef> | undefined, taken: Set<string>): ProgramDef | null {
  if (!raw || typeof raw.id !== "string" || raw.id === "" || taken.has(raw.id)) return null;
  taken.add(raw.id);
  const name = typeof raw.name === "string" && raw.name ? raw.name : raw.id;
  const tweaks = readTweaks(raw.tweaks);
  const needs = Array.isArray(raw.needs) ? raw.needs.filter((id): id is string => typeof id === "string" && id !== "" && id !== raw.id) : [];
  return {
    id: raw.id,
    name,
    short: typeof raw.short === "string" && raw.short ? raw.short : name.slice(0, 5),
    description: typeof raw.description === "string" ? raw.description : "",
    price: Math.max(0, finite(raw.price, 0)),
    tier: raw.tier === 1 || raw.tier === 2 ? raw.tier : 0,
    icon: readIcon(raw.icon),
    ...(tweaks.length > 0 ? { tweaks } : {}),
    ...(needs.length > 0 ? { needs } : {}),
  };
}

/** The program as a part, which is how everything holding one sees it. */
function asPart(program: ProgramDef): Part {
  return {
    id: program.id as PartId,
    kind: "program",
    label: program.name,
    short: program.short,
    price: program.price,
    weight: 0,
    description: program.description,
    tier: program.tier,
    icon: { ...program.icon },
  };
}

/** Puts a programs file into play: the records, and `partOf` answering for each of them. */
export function useProgramsFile(data: Partial<ProgramsFile> | undefined): void {
  for (const program of PROGRAMS) forgetThing(program.id as PartId);
  const taken = new Set<string>();
  const programs = (Array.isArray(data?.programs) ? data!.programs : []).map((raw) => readProgram(raw, taken)).filter((each): each is ProgramDef => each !== null);
  // A need is only worth keeping when the program it names is there.
  for (const program of programs) {
    if (!program.needs) continue;
    program.needs = [...new Set(program.needs)].filter((id) => taken.has(id));
    if (program.needs.length === 0) delete program.needs;
  }
  PROGRAMS.splice(0, PROGRAMS.length, ...programs);
  PROGRAM_PARTS.splice(0, PROGRAM_PARTS.length, ...programs.map(asPart));
  for (const part of PROGRAM_PARTS) registerThing(part);
}

/** The programs file as it is now, to save. */
export function programsFileNow(): ProgramsFile {
  return JSON.parse(JSON.stringify({ programs: PROGRAMS })) as ProgramsFile;
}

/** The programs file the game shipped with, as read. */
export const SHIPPED_PROGRAMS: ProgramsFile = JSON.parse(JSON.stringify(file)) as ProgramsFile;
useProgramsFile(SHIPPED_PROGRAMS);

/** The record of a program, if there is one. */
export function programDef(id: string): ProgramDef | undefined {
  return PROGRAMS.find((program) => program.id === id);
}

/** One tweak of a program, if there is one. */
export function tweakOf(programId: string, tweakId: string): ProgramTweak | undefined {
  return programDef(programId)?.tweaks?.find((tweak) => tweak.id === tweakId);
}

/**
 * Where a pick is kept among a program's picks: the tweak's id, or for a tweak that repeats per
 * mount, `<tweak>@<mount>`, so the pick stays with the mount whatever is fitted on it.
 */
export function tweakKey(tweakId: string, mount?: string): string {
  return mount ? `${tweakId}@${mount}` : tweakId;
}

/**
 * The option a pilot has picked for a tweak, or its default when they've picked none. A tweak
 * that repeats per mount reads the given mount's pick; without a mount, it reads its default. A
 * plain tweak ignores the mount.
 */
export function pickOf(picks: TweakPicks | undefined, programId: string, tweakId: string, mount?: string): string {
  const tweak = tweakOf(programId, tweakId);
  if (!tweak) return "";
  if (tweak.each && !mount) return tweak.default;
  const pick = picks?.[programId]?.[tweakKey(tweakId, tweak.each ? mount : undefined)];
  return tweak.options.some((option) => option.id === pick) ? pick! : tweak.default;
}

/**
 * Puts a pilot's pick for a tweak in place. False when the tweak or the option doesn't exist, or
 * the tweak repeats per mount and no mount is given.
 */
export function setPick(picks: TweakPicks, programId: string, tweakId: string, optionId: string, mount?: string): boolean {
  const tweak = tweakOf(programId, tweakId);
  if (!tweak || !tweak.options.some((option) => option.id === optionId)) return false;
  if (tweak.each && !mount) return false;
  (picks[programId] ??= {})[tweakKey(tweakId, tweak.each ? mount : undefined)] = optionId;
  return true;
}

/** A copy of a pilot's picks, so one ship's changes never reach another's. */
export function copyPicks(picks: TweakPicks | undefined): TweakPicks {
  const copy: TweakPicks = {};
  for (const [program, tweaks] of Object.entries(picks ?? {})) copy[program] = { ...tweaks };
  return copy;
}

/** Whether a program can do its job with what else is loaded: every program it needs is in `loaded`. */
export function needsMet(id: string, loaded: Iterable<string>): boolean {
  const have = new Set(loaded);
  return (programDef(id)?.needs ?? []).every((each) => have.has(each));
}
