import file from "./programs.json";
import { hasGlyph } from "./glyphs";
import { forgetThing, registerThing, type Part, type PartIcon, type PartId } from "./parts";

/**
 * Programs: what a pilot buys, owns and loads into a computer. They are not items and not
 * modules: they have their own records here, their own page in the designer, and their own
 * rules (a flat credit price, nothing taken from a station's stock, and carried through
 * death). Kept in src/programs.json, in the game at once.
 *
 * They still go through the game as `PartId`s, so `ship.software` and `ship.programs` are the
 * lists they always were: each is registered as a part of its own kind (`isProgram`).
 */
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

/** A program read from a file, or null when it has no usable id, or the id is taken. */
function readProgram(raw: Partial<ProgramDef> | undefined, taken: Set<string>): ProgramDef | null {
  if (!raw || typeof raw.id !== "string" || raw.id === "" || taken.has(raw.id)) return null;
  taken.add(raw.id);
  const name = typeof raw.name === "string" && raw.name ? raw.name : raw.id;
  return {
    id: raw.id,
    name,
    short: typeof raw.short === "string" && raw.short ? raw.short : name.slice(0, 5),
    description: typeof raw.description === "string" ? raw.description : "",
    price: Math.max(0, finite(raw.price, 0)),
    tier: raw.tier === 1 || raw.tier === 2 ? raw.tier : 0,
    icon: readIcon(raw.icon),
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
