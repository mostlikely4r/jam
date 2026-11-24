import { isProgram, partFits, partOf, PARTS, SHIP_MODELS, type Part, type PartIcon, type PartId, type PartKind, type ShipModel, type ThrusterRole } from "./parts";
import shipFile from "./hulls.json";
import { hasGlyph } from "./glyphs";
import { itemDef } from "./items";
import { programDef, type ProgramTweak, type TweakPicks } from "./programs";
import type { Placed } from "./grid";

/**
 * Where things fit on a hull. Each hull has a list of mounts, kept in src/hulls.json and changed
 * with the hull designer: as shipped, six thrusters, a gun, a tractor, a computer and a cargo bay.
 * A mount supports some mount types and a part fits some: it goes on where they share one.
 * A turret brings a gun mount of its own while it's on.
 * A decal mount only shows a look: a ship gets a random decal part that fits it, and nothing
 * real is ever fitted there.
 */
export type MountId = string;

export interface Mount {
  id: MountId;
  /** What the ship screen calls it. */
  name: string;
  /** For a thruster: which control fires it. Without one, a thruster on it never fires. */
  role?: ThrusterRole;
  /** The mount types it supports: a part goes on if it fits one of them. */
  types: string[];
  /** Where it sits on the hull, in ship radii: x toward the nose, y to the right. */
  x: number;
  y: number;
  /**
   * Which way what's on it faces, in degrees from the nose, clockwise: where a thruster's
   * flame goes (so it pushes the other way), where a gun fires, where a tractor's dish looks.
   */
  angle: number;
  /** How big what's on it is drawn. Looks only. */
  scale: number;
  /** How transparent what's on it is drawn in game: 0 invisible, 1, the default, solid. */
  alpha?: number;
  /**
   * Which layer what's on it is drawn on in game: 0, the default, at the hull level with the
   * other parts; below 0, underneath the hull itself, so only what sticks out past its edge shows.
   */
  order?: number;
  /** What a bare hull comes from the yard with on this mount. Must be a part that fits it. */
  default?: PartId;
  /** A decal mount: shows a random decal part that fits it, for looks only. Nothing real goes on it. */
  decal?: boolean;
}

/** Where a mount sits and faces. */
export type MountPlace = Pick<Mount, "x" | "y" | "angle" | "scale">;

/** What a hull is used for. The flags are kept for the parts of the game that will pick hulls by them. */
export const HULL_USES = ["newGame", "sold", "traffic", "defender", "pirate", "drone"] as const;
export type HullUse = (typeof HULL_USES)[number];
export const HULL_USE_NAMES: Record<HullUse, string> = {
  newGame: "New game",
  sold: "Sold",
  traffic: "Traffic",
  defender: "Defender",
  pirate: "Pirate",
  drone: "Drone",
};

/**
 * A set of programs a hull is likely to fly with: what a loop needs to work (core) and what
 * makes it comfortable (comfort). Names come from the designer.
 */
export interface Loadout {
  name: string;
  core: PartId[];
  comfort: PartId[];
}

/** What a hull has besides its mounts. */
export interface HullInfo {
  /** The programs a ship of this hull comes with, loaded into its computer as far as it has slots. */
  programs: PartId[];
  /** The loops this hull is meant for, each with the programs it needs and the ones that help. */
  loadouts: Loadout[];
  /** What the hull is used for. */
  usedBy: HullUse[];
  /** Credits a bare hull costs at a yard. Without one, the game's own rebuild cost. */
  price?: number;
  /** The weight of the bare hull. Without one, the game's base weight. */
  weight?: number;
  /** How many hull points it has. Without one, `MAX_HULL`. */
  hull?: number;
}

/**
 * The stats of a part the parts page can edit, kept in the ship file over the code's own in
 * `parts.ts`. Only the ones that differ from the code's are kept. A module's shape, price and
 * icon are its item's, so they aren't here: the item designer owns those.
 */
export type PartStats = Partial<Pick<Part, "weight" | "tier" | "bay" | "slots" | "set" | "explosive" | "shape" | "icon">>;

/**
 * How a part draws, over the code's own art in `shipArt.ts`: its drawing stretched, faded, or in
 * other colours. Kept in the ship file, and only the values that differ from the default. A part
 * with drawn shapes of its own uses those instead of the code's drawing.
 */
export interface PartArt {
  /** How wide its drawing is against the code's, 0.2 to 4. */
  scaleX?: number;
  /** How tall its drawing is against the code's, 0.2 to 4. */
  scaleY?: number;
  /** A transparency multiplier, 0 to 1. */
  alpha?: number;
  /** The metal it's made of, and the colour of its edge, as `#rrggbb`. */
  metal?: string;
  rim?: string;
  /** Shapes of its own, drawn at its own origin facing the nose, instead of the code's drawing. */
  shapes?: ArtShape[];
}

/** Whether an item stands behind a part, and owns its shape, price and icon. */
export function itemOwned(id: PartId): boolean {
  return itemDef(id) !== undefined;
}

/**
 * What src/hulls.json holds: the mount types, which each part fits, which parts are decals,
 * each hull's outline, shapes and mounts, and what else each hull has.
 */
export interface ShipFile {
  mountTypes: string[];
  partMounts: Partial<Record<PartId, string[]>>;
  /** The parts flagged as decals: looks only, and only for decal mounts. */
  decalParts?: PartId[];
  /** Each hull, by name: a hull is just a name, and this is the list of them. */
  hulls: Record<string, Hull>;
  hullInfo?: Record<string, HullInfo>;
  /** The part stats that differ from the code's own, changed on the parts page. */
  partStats?: Partial<Record<PartId, PartStats>>;
  /** How each part draws, where that differs from the code's own art on the parts page. */
  partArt?: Partial<Record<PartId, PartArt>>;
}

/** A point in hull units: x toward the nose, y to the right, a hull radius being one. */
export type HullPoint = [number, number];

/** What a shape's colour comes from: the ship's own colour, worked out once per role. */
export const SHAPE_ROLES = ["body", "shade", "rim", "glass"] as const;
export type ShapeRole = (typeof SHAPE_ROLES)[number];
export const SHAPE_ROLE_NAMES: Record<ShapeRole, string> = {
  body: "Body",
  shade: "Shade (a darker panel)",
  rim: "Rim (the lit edge)",
  glass: "Glass and glow",
};

/**
 * A shape drawn on a hull or a part: shading, a panel, a decal or a lit edge. A hull's are in hull
 * radii, the units mounts use; a part's are in the same units, a twelfth of one.
 */
export interface ArtShape {
  kind: "polygon" | "circle" | "rect";
  /** Which of the ship's colours it takes. */
  role: ShapeRole;
  /** Draw order: lower draws first, and 0 is the hull level. */
  order?: number;
  /** A transparency multiplier, 0 to 1. */
  alpha?: number;
  /** Clipped to the hull's edge. Shading is. Parts have no edge, so nothing of theirs clips. */
  clip?: boolean;
  /** A polygon's points. A rim shape is stroked through them, open with two points, else closed. */
  points?: HullPoint[];
  /** A circle's or a rect's middle. */
  x?: number;
  y?: number;
  /** A circle's reach. */
  r?: number;
  /** A rect's size. */
  w?: number;
  h?: number;
  /** A rect's turn, degrees clockwise. */
  angle?: number;
  /** A rim shape's line width. Without one, the hull edge's own. */
  width?: number;
}

/** One hull as the ship file keeps it. */
export interface Hull {
  /** The outline: the clip line every hull shape clips against, and what collisions will use. */
  edge: HullPoint[];
  /** Shading, panels and decals drawn over the body, and any lit edges of their own. */
  shapes: ArtShape[];
  /** Where things go on it. */
  mounts: Mount[];
}

/** One fitted part: what it is and how worn. */
export interface Module {
  part: PartId;
  /** 0 is as new. From `DAMAGED_AT` it stops working, and at 1 it's destroyed. */
  wear: number;
}

/** Everything a ship carries that isn't ore: its fitted modules and its pilot's programs. */
export interface Fitting {
  fit: Partial<Record<MountId, Module>>;
  /** Programs the pilot owns. They go wherever the pilot goes, and need a computer to run. */
  software: Set<PartId>;
  /** The programs loaded in the computer, in the order they were loaded. */
  programs: PartId[];
  /** The pilot's pick for each tweak of each program they own. Missing reads as the default. */
  tweaks: TweakPicks;
  /** What works right now: every working module's part and every running program. Kept up by `refresh`. */
  parts: Set<PartId>;
  /** Modules placed on the cargo bay's grid, taking room from the ore. */
  hold: Placed[];
  /** Ore locked in place in the bay, one cell each: part of the ship's ore, but it stays put. */
  oreBlocks: { x: number; y: number }[];
  /** The decal part each decal mount shows. Looks only. A ship without one shows the first that fits. */
  decals?: Partial<Record<MountId, PartId>>;
}

export const DAMAGED_AT = 0.5;

export const THRUSTER_ROLES: ThrusterRole[] = ["thrusterMain", "thrusterReverse", "thrusterStrafeLeft", "thrusterStrafeRight", "thrusterRotateLeft", "thrusterRotateRight"];

/** How far behind the middle the turn thrusters pushed sideways when turning was tuned. */
const STANDARD_TURN_LEVER = 0.7;

const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/** A mount read from a file, with anything missing filled in. */
function readMount(raw: Partial<Mount>, index: number): Mount {
  const mount: Mount = {
    id: typeof raw.id === "string" && raw.id ? raw.id : `mount${index + 1}`,
    name: typeof raw.name === "string" && raw.name ? raw.name : `Mount ${index + 1}`,
    types: strings(raw.types),
    x: finite(raw.x, 0),
    y: finite(raw.y, 0),
    angle: finite(raw.angle, 0),
    scale: finite(raw.scale, 1),
  };
  if (raw.role && THRUSTER_ROLES.includes(raw.role)) mount.role = raw.role;
  if (typeof raw.default === "string" && PARTS.some((part) => part.id === raw.default)) mount.default = raw.default;
  if (typeof raw.alpha === "number" && Number.isFinite(raw.alpha) && raw.alpha < 1) mount.alpha = Math.max(0, raw.alpha);
  if (typeof raw.order === "number" && Number.isFinite(raw.order) && raw.order !== 0) mount.order = raw.order;
  if (raw.decal === true) mount.decal = true;
  return mount;
}

/** A hull's settings read from a file, with anything missing or unknown left out. */
function readHullInfo(raw: Partial<HullInfo> | undefined): HullInfo {
  const programs = strings(raw?.programs).filter((id): id is PartId => programDef(id) !== undefined);
  const usedBy = strings(raw?.usedBy).filter((use): use is HullUse => (HULL_USES as readonly string[]).includes(use));
  // The stats are always present as keys, so a file without one clears a value read before.
  const stat = (key: "price" | "weight" | "hull"): number | undefined => {
    const value = raw?.[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  return { programs: [...new Set(programs)], loadouts: readLoadouts(raw?.loadouts), usedBy, price: stat("price"), weight: stat("weight"), hull: stat("hull") };
}

/** A hull's loadouts read from a file: a name, program ids the game knows, and no repeated names. */
function readLoadouts(raw: unknown): Loadout[] {
  if (!Array.isArray(raw)) return [];
  const loadouts: Loadout[] = [];
  const names = new Set<string>();
  for (const each of raw as Partial<Loadout>[]) {
    if (!each || typeof each.name !== "string" || each.name === "" || names.has(each.name)) continue;
    names.add(each.name);
    const list = (value: unknown) => [...new Set(strings(value).filter((id): id is PartId => programDef(id) !== undefined))];
    loadouts.push({ name: each.name, core: list(each.core), comfort: list(each.comfort) });
  }
  return loadouts;
}

/** The ship file the game shipped with, as read. */
export const SHIPPED_SHIPS: ShipFile = JSON.parse(JSON.stringify(shipFile)) as ShipFile;

/**
 * Each part's editable stats as the code in `parts.ts` ships them. A ship file's `partStats`
 * sit on top of these, so putting a file into play starts by putting them back.
 */
const BASE_STATS = new Map(
  PARTS.map((part) => [
    part.id,
    {
      price: part.price,
      weight: part.weight,
      tier: part.tier,
      ...(part.shape !== undefined ? { shape: { ...part.shape } } : {}),
      ...(part.bay !== undefined ? { bay: { ...part.bay, entry: { ...part.bay.entry } } } : {}),
      ...(part.slots !== undefined ? { slots: part.slots } : {}),
      ...(part.set !== undefined ? { set: part.set } : {}),
      ...(part.explosive !== undefined ? { explosive: part.explosive } : {}),
      ...(part.icon !== undefined ? { icon: { ...part.icon } } : {}),
    },
  ]),
);

/** Puts a part's editable stats back as the code ships them. */
export function resetPartStats(id: PartId): void {
  const part = PARTS.find((each) => each.id === id);
  const base = BASE_STATS.get(id);
  if (!part || !base || part.kind === "program") return;
  for (const key of ["slots", "set", "explosive"] as const) {
    if (base[key] === undefined) delete part[key];
    else part[key] = base[key];
  }
  if (base.bay) part.bay = { ...base.bay, entry: { ...base.bay.entry } };
  else delete part.bay;
  // A module's shape and icon are its item's: the item designer owns them.
  if (!itemOwned(id)) {
    if (base.shape) part.shape = { ...base.shape };
    else delete part.shape;
    part.icon = { ...base.icon! };
  }
  part.weight = base.weight!;
  part.tier = base.tier!;
}

/** The cell on a grid's edge nearest to this one: where a bay's entry has to be. */
export function onEdge(w: number, h: number, cell: { x: number; y: number }): { x: number; y: number } {
  const x = Math.max(0, Math.min(w - 1, Math.round(cell.x)));
  const y = Math.max(0, Math.min(h - 1, Math.round(cell.y)));
  if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return { x, y };
  const gaps = [x, w - 1 - x, y, h - 1 - y];
  const side = gaps.indexOf(Math.min(...gaps));
  return side === 0 ? { x: 0, y } : side === 1 ? { x: w - 1, y } : side === 2 ? { x, y: 0 } : { x, y: h - 1 };
}

/** Sits a file's stats for a part over the code's own, skipping anything invalid. */
function applyPartStats(id: PartId, stats: PartStats): void {
  const part = PARTS.find((each) => each.id === id);
  if (!part || part.kind === "program") return;
  for (const key of ["weight", "slots", "explosive"] as const) {
    const value = stats[key];
    if (value !== undefined && Number.isFinite(value) && value >= 0) part[key] = value;
  }
  // A module's shape and icon are its item's: the item designer owns them.
  if (itemOwned(id)) {
    if (stats.set !== undefined && Number.isFinite(stats.set) && stats.set >= 1) part.set = Math.round(stats.set);
    if (stats.tier === 0 || stats.tier === 1 || stats.tier === 2) part.tier = stats.tier;
    return;
  }
  const cells = (value: unknown, min: number) => typeof value === "number" && Number.isInteger(value) && value >= min;
  const shape = stats.shape;
  if (shape && cells(shape.w, 1) && cells(shape.h, 1)) part.shape = { w: shape.w, h: shape.h };
  const bay = stats.bay;
  if (bay && cells(bay.w, 1) && cells(bay.h, 1) && bay.entry && cells(bay.entry.x, 0) && cells(bay.entry.y, 0)) {
    const size = cells(bay.entry.size, 1) ? (bay.entry.size as number) : 1;
    part.bay = { w: bay.w, h: bay.h, entry: { ...onEdge(bay.w, bay.h, bay.entry), ...(size > 1 ? { size } : {}) } };
  }
  if (stats.tier === 0 || stats.tier === 1 || stats.tier === 2) part.tier = stats.tier;
  if (stats.set !== undefined && Number.isFinite(stats.set) && stats.set >= 1) part.set = Math.round(stats.set);
  applyIcon(part, stats.icon);
}

/** Sits a designed icon over the code's own, skipping anything invalid. */
function applyIcon(part: Part, icon: PartIcon | undefined): void {
  if (!icon || typeof icon !== "object" || !hasGlyph(String(icon.glyph))) return;
  const colour = (value: unknown): value is string => typeof value === "string" && value !== "";
  if (!colour(icon.primary) || !colour(icon.secondary) || !colour(icon.border)) return;
  const mark = typeof icon.mark === "string" ? icon.mark : "";
  part.icon = { glyph: icon.glyph, primary: icon.primary, secondary: icon.secondary, border: icon.border, ...(mark ? { mark } : {}) };
}

/** The part stats that differ from the code's own, to keep in the ship file. */
function partStatsNow(): NonNullable<ShipFile["partStats"]> {
  const out: NonNullable<ShipFile["partStats"]> = {};
  for (const part of PARTS) {
    if (part.kind === "program") continue;
    const base = BASE_STATS.get(part.id)!;
    const diff: PartStats = {};
    for (const key of ["weight", "slots", "set", "explosive"] as const) {
      if (part[key] !== base[key]) diff[key] = part[key];
    }
    // A module's shape and icon are its item's: they aren't the ship file's to keep.
    if (!itemOwned(part.id)) {
      if (part.shape && JSON.stringify(part.shape) !== JSON.stringify(base.shape)) diff.shape = { ...part.shape };
      if (part.icon && JSON.stringify(part.icon) !== JSON.stringify(base.icon)) diff.icon = { ...part.icon };
    }
    if (part.bay && JSON.stringify(part.bay) !== JSON.stringify(base.bay)) diff.bay = { ...part.bay, entry: { ...part.bay.entry } };
    if (part.tier !== base.tier) diff.tier = part.tier;
    if (Object.keys(diff).length > 0) out[part.id] = diff;
  }
  return out;
}

/**
 * The parts' art as it is now, kept in the ship file only where it differs from the code's own
 * drawing: stretched, faded or in other colours. Changed in place by the hull designer.
 */
export const PART_ART: Partial<Record<PartId, PartArt>> = {};

/** Puts a part's art back as the code draws it. */
export function resetPartArt(id: PartId): void {
  delete PART_ART[id];
}

/** The part of an art someone set that says something, with anything invalid or at the default left out. */
function cleanPartArt(art: PartArt): PartArt {
  const clean: PartArt = {};
  const scale = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) && value >= 0.2 && value <= 4 && value !== 1 ? value : undefined;
  const colour = (value: unknown) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined);
  const scaleX = scale(art.scaleX);
  const scaleY = scale(art.scaleY);
  if (scaleX !== undefined) clean.scaleX = scaleX;
  if (scaleY !== undefined) clean.scaleY = scaleY;
  if (typeof art.alpha === "number" && Number.isFinite(art.alpha) && art.alpha >= 0 && art.alpha < 1) clean.alpha = art.alpha;
  const metal = colour(art.metal);
  const rim = colour(art.rim);
  if (metal) clean.metal = metal;
  if (rim) clean.rim = rim;
  const shapes = readShapes(art.shapes);
  if (shapes.length > 0) clean.shapes = shapes;
  return clean;
}

/** Sits a file's art for a part over the code's own drawing, skipping anything invalid. */
function applyPartArt(id: PartId, art: PartArt): void {
  if (!PARTS.some((part) => part.id === id && part.kind !== "program")) return;
  const clean = cleanPartArt(art);
  if (Object.keys(clean).length > 0) PART_ART[id] = clean;
}

/** The parts' art that differs from the code's own, to keep in the ship file. */
function partArtNow(): NonNullable<ShipFile["partArt"]> {
  const out: NonNullable<ShipFile["partArt"]> = {};
  for (const [id, art] of Object.entries(PART_ART) as [PartId, PartArt][]) {
    const clean = cleanPartArt(art);
    if (Object.keys(clean).length > 0) out[id] = clean;
  }
  return out;
}

/** The mount types there are. Changed in place by the hull designer. */
export const MOUNT_TYPES: string[] = [];
/** The mount types each part fits. Changed in place by the hull designer. */
export const PART_MOUNTS: Partial<Record<PartId, string[]>> = {};
/** The parts flagged as decals: looks only, and only for decal mounts. Changed in place by the hull designer. */
export const DECAL_PARTS: PartId[] = [];
/** Each hull's mounts, by hull name. The arrays are changed in place, so everything holding them sees it. */
export const HULL_MOUNTS: Record<string, Mount[]> = {};
/** Each hull's outline, by hull name: what it's filled with, clipped against and edged with. */
export const HULL_EDGE: Record<string, HullPoint[]> = {};
/** The shapes drawn on each hull, by hull name: shading, panels and decals over the outline. */
export const HULL_SHAPES: Record<string, ArtShape[]> = {};
/** What else each hull has: its default programs and what it's used for. Changed in place by the hull designer. */
export const HULL_INFO: Record<string, HullInfo> = {};

/** Hull names already warned about, so a ship drawn every frame doesn't flood the console. */
const NO_SUCH_HULL = new Set<string>();

/**
 * A hull the game can fly, by name: the racer when a save or a world names one the file hasn't
 * got, so an old or edited file falls back rather than crashing.
 */
export function hullNamed(model: ShipModel): ShipModel {
  if (HULL_MOUNTS[model]) return model;
  const fallback = HULL_MOUNTS.racer ? "racer" : Object.keys(HULL_MOUNTS)[0] ?? "";
  if (!NO_SUCH_HULL.has(model)) {
    NO_SUCH_HULL.add(model);
    console.warn(`jam: no hull called "${model}" in src/hulls.json; the ${fallback || "nothing"} stands in for it`);
  }
  return fallback;
}

/** A hull's mounts, falling back as `hullNamed` does. */
export function hullMounts(model: ShipModel): Mount[] {
  return HULL_MOUNTS[hullNamed(model)] ?? [];
}

/** A hull's outline, falling back as `hullNamed` does. */
export function hullEdge(model: ShipModel): HullPoint[] {
  return HULL_EDGE[hullNamed(model)] ?? [];
}

/** The shapes drawn on a hull, falling back as `hullNamed` does. */
export function hullShapes(model: ShipModel): ArtShape[] {
  return HULL_SHAPES[hullNamed(model)] ?? [];
}

/** The hull points every hull has unless its own say otherwise. */
export const MAX_HULL = 100;

/** A hull's own record: its default programs, loadouts and uses. */
export function hullInfo(model: ShipModel): HullInfo {
  return HULL_INFO[hullNamed(model)] ?? { programs: [], loadouts: [], usedBy: [] };
}

/** The hulls a new game offers: those the file marks `newGame`, in the file's order. */
export function newGameHulls(): ShipModel[] {
  return SHIP_MODELS.filter((model) => hullInfo(model).usedBy.includes("newGame"));
}

/** A hull's name as people read it: its id in words, `racerCopy` being "Racer Copy". */
export function hullName(model: string): string {
  const words = model
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== "");
  if (words.length === 0) return model;
  return words.map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

/** The hull points a ship of this model has: its own, or `MAX_HULL`. */
export function hullMax(model: ShipModel): number {
  return HULL_INFO[hullNamed(model)]?.hull ?? MAX_HULL;
}

/** The point pairs of an outline or a polygon, with anything that isn't a finite pair left out. */
function readPoints(raw: unknown): HullPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: HullPoint[] = [];
  for (const each of raw as unknown[]) {
    if (!Array.isArray(each) || each.length !== 2) continue;
    const [x, y] = each as unknown[];
    if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) points.push([x, y]);
  }
  return points;
}

/**
 * One shape read from a file, with anything invalid or missing dropped: a polygon needs three
 * points (two for a rim line), a circle a reach, a rect a size.
 */
function readShape(raw: Partial<ArtShape>): ArtShape | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = raw.kind;
  if (kind !== "polygon" && kind !== "circle" && kind !== "rect") return null;
  const role = (SHAPE_ROLES as readonly string[]).includes(raw.role as string) ? (raw.role as ShapeRole) : "body";
  const shape: ArtShape = { kind, role };
  // A reach, a size or a line's width: a number, and more than nothing.
  const size = (value: unknown, min: number): number | undefined =>
    typeof value === "number" && Number.isFinite(value) && value >= min ? value : undefined;
  if (typeof raw.order === "number" && Number.isFinite(raw.order) && raw.order !== 0) shape.order = raw.order;
  if (typeof raw.alpha === "number" && Number.isFinite(raw.alpha) && raw.alpha >= 0 && raw.alpha < 1) shape.alpha = raw.alpha;
  if (raw.clip === true) shape.clip = true;
  if (kind === "polygon") {
    const points = readPoints(raw.points);
    const fewest = role === "rim" ? 2 : 3;
    if (points.length < fewest) return null;
    shape.points = points;
    const width = size(raw.width, 0.05);
    if (role === "rim" && width !== undefined) shape.width = width;
    return shape;
  }
  const x = typeof raw.x === "number" && Number.isFinite(raw.x) ? raw.x : undefined;
  const y = typeof raw.y === "number" && Number.isFinite(raw.y) ? raw.y : undefined;
  if (x === undefined || y === undefined) return null;
  shape.x = x;
  shape.y = y;
  if (kind === "circle") {
    const r = size(raw.r, 0.01);
    if (r === undefined) return null;
    shape.r = r;
    return shape;
  }
  const w = size(raw.w, 0.01);
  const h = size(raw.h, 0.01);
  if (w === undefined || h === undefined) return null;
  shape.w = w;
  shape.h = h;
  if (typeof raw.angle === "number" && Number.isFinite(raw.angle) && raw.angle !== 0) shape.angle = raw.angle;
  return shape;
}

/** The shapes a hull or a part is drawn with, read from a file. */
function readShapes(raw: unknown): ArtShape[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Partial<ArtShape>[]).map(readShape).filter((shape): shape is ArtShape => shape !== null);
}

/**
 * A hull's outline read from a file. An outline is the one thing a hull can't do without, so a
 * file that has none for a hull the shipped file knows falls back to the shipped one.
 */
function readEdge(raw: unknown, model: string): HullPoint[] {
  const edge = readPoints(raw);
  if (edge.length >= 3) return edge;
  return readPoints(SHIPPED_SHIPS.hulls?.[model]?.edge);
}

/**
 * Puts a ship file into play: mount types, which parts fit them, every hull's outline, shapes,
 * mounts and stats. A hull is just a name: the file's list is `SHIP_MODELS`.
 */
export function useShipFile(file: ShipFile): void {
  MOUNT_TYPES.splice(0, MOUNT_TYPES.length, ...strings(file.mountTypes));
  for (const part of PARTS) {
    if (part.kind === "program") continue;
    PART_MOUNTS[part.id] = strings(file.partMounts?.[part.id]);
  }
  // The parts' stats start as the code has them, then the file's sit on top.
  for (const part of PARTS) resetPartStats(part.id);
  for (const [id, stats] of Object.entries(file.partStats ?? {}) as [PartId, PartStats][]) applyPartStats(id, stats);
  // The same for how they draw.
  for (const id of Object.keys(PART_ART) as PartId[]) delete PART_ART[id];
  for (const [id, art] of Object.entries(file.partArt ?? {}) as [PartId, PartArt][]) applyPartArt(id, art);
  DECAL_PARTS.splice(0, DECAL_PARTS.length, ...strings(file.decalParts).filter((id): id is PartId => PARTS.some((part) => part.id === id && part.kind !== "program")));
  // The hulls: the file's names, in its order, and each one's outline, shapes and mounts.
  const hulls = (file.hulls ?? {}) as Record<string, Partial<Hull>>;
  const models = Object.keys(hulls).filter((model) => model !== "");
  SHIP_MODELS.splice(0, SHIP_MODELS.length, ...models);
  for (const model of Object.keys(HULL_MOUNTS)) {
    if (models.includes(model)) continue;
    delete HULL_MOUNTS[model];
    delete HULL_EDGE[model];
    delete HULL_SHAPES[model];
    delete HULL_INFO[model];
  }
  for (const model of models) {
    const hull = hulls[model] ?? {};
    // A draft kept before hulls nested their mounts has the mounts array itself.
    const raw = Array.isArray(hull) ? (hull as unknown as Mount[]) : hull.mounts;
    const mounts = (Array.isArray(raw) ? raw : []).map(readMount);
    // The arrays are kept and filled, so everything holding one sees the change.
    (HULL_MOUNTS[model] ??= []).splice(0, HULL_MOUNTS[model].length, ...mounts);
    (HULL_EDGE[model] ??= []).splice(0, HULL_EDGE[model].length, ...readEdge(hull.edge, model));
    (HULL_SHAPES[model] ??= []).splice(0, HULL_SHAPES[model].length, ...readShapes(hull.shapes));
    Object.assign((HULL_INFO[model] ??= { programs: [], loadouts: [], usedBy: [] }), readHullInfo(file.hullInfo?.[model]));
  }
}
useShipFile(SHIPPED_SHIPS);

/** The ship file as it is now, to save. */
export function shipFileNow(): ShipFile {
  const hulls: Record<string, Hull> = {};
  for (const model of SHIP_MODELS) hulls[model] = { edge: HULL_EDGE[model] ?? [], shapes: HULL_SHAPES[model] ?? [], mounts: HULL_MOUNTS[model] ?? [] };
  return JSON.parse(
    JSON.stringify({ mountTypes: MOUNT_TYPES, partMounts: PART_MOUNTS, decalParts: DECAL_PARTS, hulls, hullInfo: HULL_INFO, partStats: partStatsNow(), partArt: partArtNow() }),
  ) as ShipFile;
}

/** Whether a ship has no tank fitted at all: nothing to burn, and nothing to fill. */
export function tankless(ship: Fitting & { model: ShipModel }): boolean {
  return tankMounts(ship).length === 0;
}
/** A fuel tank on a mount: how much it holds, and how worn it is (from a leak to gone). */
export interface TankMount {
  mount: Mount;
  /** The fuel it holds, full. */
  capacity: number;
  wear: number;
}

/**
 * The fuel tanks a ship has fitted and not destroyed, in the hull's order. A damaged one is still
 * a tank: it holds fuel, and slowly loses it (see the leak in `Sim`). A destroyed one is a stub
 * that holds nothing, so its room is gone with its fuel.
 */
export function tankMounts(ship: Fitting & { model: ShipModel }): TankMount[] {
  const tanks: TankMount[] = [];
  for (const mount of hullMounts(ship.model)) {
    const module = ship.fit[mount.id];
    if (!module || module.wear >= 1) continue;
    const capacity = partOf(module.part).tank ?? 0;
    if (capacity > 0) tanks.push({ mount, capacity, wear: module.wear });
  }
  return tanks;
}

/** How much fuel a ship's tanks hold between them: its range in one number. */
export function tankCapacity(ship: Fitting & { model: ShipModel }): number {
  return tankMounts(ship).reduce((held, tank) => held + tank.capacity, 0);
}

/** What a ship's tanks hold, full, as the amount in each mount. */
export function fullTanks(ship: Fitting & { model: ShipModel }): Partial<Record<MountId, number>> {
  const held: Partial<Record<MountId, number>> = {};
  for (const tank of tankMounts(ship)) held[tank.mount.id] = tank.capacity;
  return held;
}

/**
 * The same fuel, shared out over the tanks as they are now: each takes a share in proportion to
 * what it holds. Used when a ship's fuel arrives without its tanks (an older save), and when the
 * fitting changes under it.
 */
export function shareTanks(ship: Fitting & { model: ShipModel }, fuel: number): Partial<Record<MountId, number>> {
  const tanks = tankMounts(ship);
  const capacity = tanks.reduce((held, tank) => held + tank.capacity, 0);
  const held: Partial<Record<MountId, number>> = {};
  let left = Math.max(0, fuel);
  tanks.forEach((tank, i) => {
    const share = i === tanks.length - 1 ? left : capacity > 0 ? (fuel * tank.capacity) / capacity : 0;
    const amount = Math.max(0, Math.min(tank.capacity, share, left));
    held[tank.mount.id] = amount;
    left -= amount;
  });
  return held;
}

/** Whether a part is a decal: it shows on decal mounts for looks only, and is never fitted for real. */
export function isDecal(id: PartId): boolean {
  return DECAL_PARTS.includes(id);
}

/** Kept for the hull designer's callers: nothing is cached any more. */
export function mountsMoved(): void {}

export function mountOf(model: ShipModel, id: MountId): Mount | undefined {
  return hullMounts(model).find((mount) => mount.id === id);
}

/** The mount types a part fits. */
export function partMounts(id: PartId): string[] {
  return PART_MOUNTS[id] ?? [];
}

/** Whether a part can go on a mount: they share a mount type, and both are decals or neither is. */
export function mountTakes(mount: Mount, id: PartId): boolean {
  if ((mount.decal === true) !== isDecal(id)) return false;
  const fits = partMounts(id);
  return mount.types.some((type) => fits.includes(type));
}

/** The decal parts a decal mount can show on a hull. */
export function decalChoices(model: ShipModel, mount: Mount): PartId[] {
  if (!mount.decal) return [];
  return PARTS.filter((part) => partFits(part, model) && mountTakes(mount, part.id)).map((part) => part.id);
}

/** The decal a ship shows on a mount: the one it was given, or else the first that fits. */
export function decalOf(ship: { model: ShipModel; decals?: Partial<Record<MountId, PartId>> }, mount: Mount): PartId | null {
  const choices = decalChoices(ship.model, mount);
  const own = ship.decals?.[mount.id];
  return own && choices.includes(own) ? own : choices[0] ?? null;
}

/** Which way a mount faces, in radians in the ship's frame. */
export function facing(mount: MountPlace): number {
  return (mount.angle * Math.PI) / 180;
}

/** The first mount whose module is of this kind, with the module. */
export function mountWith(ship: Fitting & { model: ShipModel }, kind: PartKind): { mount: Mount; module: Module } | null {
  for (const mount of mountsOf(ship)) {
    const module = ship.fit[mount.id];
    if (module && partOf(module.part).kind === kind) return { mount, module };
  }
  return null;
}

/**
 * What a ship's thrusters do where they sit. A pushing thruster pushes the way its flame doesn't
 * go, at full strength whichever way that is. A turn thruster turns by its lever: how far from
 * the middle it pushes across, against the lever it was tuned at, so one moved closer in or
 * turned away turns less, and one turned right round turns the other way. Two on the same
 * control add up. Only working thrusters count.
 */
export interface Thrust {
  /** The push of each control's thrusters together, in the ship's frame (x to the nose, y to the right). */
  push: Partial<Record<ThrusterRole, { x: number; y: number }>>;
  /** How hard each turn control turns, against the tuned turn. Negative turns the other way. */
  turn: { thrusterRotateLeft: number; thrusterRotateRight: number };
  /** The controls with a working thruster on them. */
  has: Set<ThrusterRole>;
}

/** What one thruster mount does: its push, and as a turn thruster, its turn. */
export function mountThrust(mount: Mount): { push: { x: number; y: number }; turn: number } {
  const away = facing(mount) + Math.PI;
  // Rounded, so a thruster facing straight back pushes straight ahead and nothing sideways.
  const push = { x: Math.round(Math.cos(away) * 1e9) / 1e9 + 0, y: Math.round(Math.sin(away) * 1e9) / 1e9 + 0 };
  // Turning right is clockwise: the lever's sign for a right turn is positive.
  const lever = mount.x * push.y - mount.y * push.x;
  const turn = (mount.role === "thrusterRotateLeft" ? -lever : lever) / STANDARD_TURN_LEVER;
  return { push, turn };
}

export function thrustOf(ship: Fitting & { model: ShipModel }): Thrust {
  const thrust: Thrust = { push: {}, turn: { thrusterRotateLeft: 0, thrusterRotateRight: 0 }, has: new Set() };
  for (const mount of hullMounts(ship.model)) {
    const role = mount.role;
    if (!role) continue;
    const module = ship.fit[mount.id];
    if (!works(module) || partOf(module.part).kind !== "thruster") continue;
    const { push, turn } = mountThrust(mount);
    thrust.has.add(role);
    if (role === "thrusterRotateLeft" || role === "thrusterRotateRight") thrust.turn[role] += turn;
    else {
      const sum = thrust.push[role];
      thrust.push[role] = sum ? { x: sum.x + push.x, y: sum.y + push.y } : push;
    }
  }
  return thrust;
}

/**
 * What every hull of a model comes with from the yard: each mount's default part, where it
 * still fits the mount. Set per mount in the hull designer.
 */
export function hullDefaults(model: ShipModel): Partial<Record<MountId, PartId>> {
  const defaults: Partial<Record<MountId, PartId>> = {};
  for (const mount of hullMounts(model)) {
    if (mount.default && mountTakes(mount, mount.default) && partFits(partOf(mount.default), model)) defaults[mount.id] = mount.default;
  }
  return defaults;
}

/**
 * A new ship of a hull: its default parts, its computer's default programs, and a decal on each
 * decal mount, picked with `random` (0 up to 1).
 */
export function newFitting(model: ShipModel, random: () => number = Math.random): Fitting {
  const fitting: Fitting = { fit: {}, software: new Set(), programs: [], parts: new Set(), hold: [], oreBlocks: [], decals: {}, tweaks: {} };
  for (const [mount, part] of Object.entries(hullDefaults(model)) as [MountId, PartId][]) fitting.fit[mount] = { part, wear: 0 };
  refresh(fitting);
  for (const id of hullInfo(model).programs) {
    fitting.software.add(id);
    install(fitting, id);
  }
  for (const mount of hullMounts(model)) {
    const choices = decalChoices(model, mount);
    if (choices.length > 0) fitting.decals![mount.id] = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  }
  return fitting;
}

/** The mount holding a turret, if one is on. */
export function turretMount(ship: Fitting & { model: ShipModel }): Mount | null {
  for (const mount of hullMounts(ship.model)) {
    const module = ship.fit[mount.id];
    if (module && partOf(module.part).kind === "turret") return mount;
  }
  return null;
}

/** The mounts a ship has now: its hull's, plus a turret's gun mount while one is on. */
export function mountsOf(ship: Fitting & { model: ShipModel }): Mount[] {
  const mounts = hullMounts(ship.model);
  const base = turretMount(ship);
  if (!base) return mounts;
  return [...mounts, { id: "turretGun", name: "Turret gun", types: ["gun"], x: base.x, y: base.y, angle: base.angle, scale: base.scale }];
}

/**
 * The mounts a tweak that repeats per mount covers on this ship: each mount holding a working
 * part of the tweak's kind, a turret's gun mount included. A plain tweak covers none. The menu
 * shows a row for each, and the sim reads each one's pick.
 */
export function tweakMounts(ship: Fitting & { model: ShipModel }, tweak: Pick<ProgramTweak, "each">): Mount[] {
  if (!tweak.each) return [];
  return mountsOf(ship).filter((mount) => {
    const module = ship.fit[mount.id];
    return works(module) && partOf(module.part).kind === tweak.each;
  });
}

export function works(module: Module | undefined): module is Module {
  return module !== undefined && module.wear < DAMAGED_AT;
}

export function destroyed(module: Module | undefined): boolean {
  return module !== undefined && module.wear >= 1;
}

/** The fitted computer, wherever it's mounted. */
function computerOf(ship: Fitting): Module | undefined {
  return Object.values(ship.fit).find((module) => module && partOf(module.part).kind === "computer");
}

/** How many programs the fitted computer runs, if it works. */
export function programSlots(ship: Fitting): number {
  const computer = computerOf(ship);
  return works(computer) ? partOf(computer.part).slots ?? 0 : 0;
}

/** The computer's slots, whether it works or not: what can be loaded into it. */
export function computerSize(ship: Fitting): number {
  const computer = computerOf(ship);
  return computer && !destroyed(computer) ? partOf(computer.part).slots ?? 0 : 0;
}

/** Works out what the ship can use right now. Call after any change to its modules or programs. */
export function refresh(ship: Fitting): void {
  ship.parts.clear();
  for (const module of Object.values(ship.fit)) if (works(module)) ship.parts.add(module.part);
  const slots = programSlots(ship);
  ship.programs.slice(0, slots).forEach((id) => ship.parts.add(id));
}

/**
 * The mounts a part would go on, each taking one of a set: none if it can't be fitted. Of the
 * mounts it fits, empty ones come first, then the hull's order.
 */
export function mountsFor(ship: Fitting & { model: ShipModel }, id: PartId): MountId[] {
  const part = partOf(id);
  // Decals and cockpit glass are looks only: never fitted for real.
  if (part.kind === "program" || part.kind === "cockpit" || isDecal(id) || !partFits(part, ship.model)) return [];
  // A gun goes on the turret when there is one.
  if (part.kind === "gun" && turretMount(ship)) return ["turretGun"];
  const mounts = hullMounts(ship.model).filter((mount) => mountTakes(mount, id));
  const ids = [...mounts.filter((mount) => !ship.fit[mount.id]), ...mounts.filter((mount) => ship.fit[mount.id])].map((mount) => mount.id);
  // A set keeps the hull's order, so a pair goes on left then right.
  const set = part.set ?? 1;
  if (ids.length < set) return [];
  const chosen = new Set(ids.slice(0, set));
  return mounts.map((mount) => mount.id).filter((mount) => chosen.has(mount));
}

/** Whether the ship has the part on, or (a program) owns it, working or not. */
export function owns(ship: Fitting, id: PartId): boolean {
  if (isProgram(id)) return ship.software.has(id);
  return Object.values(ship.fit).some((module) => module?.part === id);
}

/**
 * Puts a part on its mounts. What was there comes off and is returned, except that a gun
 * makes way for a turret by moving onto it, and moves back off when the turret goes.
 */
export function fitPart(ship: Fitting & { model: ShipModel }, id: PartId, wear = 0): Module[] {
  const mounts = mountsFor(ship, id);
  if (mounts.length === 0) return [];
  const off: Module[] = [];
  for (const mount of mounts) {
    const old = ship.fit[mount];
    if (old) off.push(old);
    ship.fit[mount] = { part: id, wear };
  }
  // A gun that was on the gun mount moves up onto the new turret.
  if (partOf(id).kind === "turret") {
    const gun = off.find((module) => partOf(module.part).kind === "gun");
    if (gun) {
      ship.fit.turretGun = gun;
      off.splice(off.indexOf(gun), 1);
    }
    // Swapping one turret for another, the gun stays on: its mount is the same.
  }
  refresh(ship);
  return off;
}

/** Takes whatever is on a mount off, and returns it. A turret's gun drops back onto the turret's mount. */
export function unfit(ship: Fitting & { model: ShipModel }, mount: MountId): Module | null {
  const module = ship.fit[mount];
  if (!module) return null;
  delete ship.fit[mount];
  if (partOf(module.part).kind === "turret") {
    const gun = ship.fit.turretGun;
    delete ship.fit.turretGun;
    if (gun) ship.fit[mount] = gun;
  }
  refresh(ship);
  return module;
}

/** Every mount holding this part. */
export function mountsHolding(ship: Fitting, id: PartId): MountId[] {
  return (Object.entries(ship.fit) as [MountId, Module | undefined][]).filter(([, module]) => module?.part === id).map(([mount]) => mount);
}

/** Loads a program the pilot owns into the computer, if there's a free slot. Returns whether it went in. */
export function install(ship: Fitting, id: PartId): boolean {
  if (!ship.software.has(id) || ship.programs.includes(id)) return false;
  if (ship.programs.length >= computerSize(ship)) return false;
  ship.programs.push(id);
  refresh(ship);
  return true;
}

export function uninstall(ship: Fitting, id: PartId): boolean {
  const at = ship.programs.indexOf(id);
  if (at < 0) return false;
  ship.programs.splice(at, 1);
  refresh(ship);
  return true;
}

/** After a computer is swapped for a smaller one, the programs that no longer fit come out. */
export function trimPrograms(ship: Fitting): void {
  ship.programs.length = Math.min(ship.programs.length, computerSize(ship));
  refresh(ship);
}

/** The mount whose module a hit at this spot (relative to the ship, in world units) lands on. */
export function nearestMount(ship: Fitting & { model: ShipModel; angle: number }, dx: number, dy: number, radius: number): MountId | null {
  const cos = Math.cos(-ship.angle);
  const sin = Math.sin(-ship.angle);
  const x = (dx * cos - dy * sin) / radius;
  const y = (dx * sin + dy * cos) / radius;
  let best: MountId | null = null;
  let bestDistance = Infinity;
  for (const mount of mountsOf(ship)) {
    if (!ship.fit[mount.id] || destroyed(ship.fit[mount.id])) continue;
    const distance = Math.hypot(mount.x - x, mount.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = mount.id;
    }
  }
  return best;
}

// ---------- drawing a hull or a part's shapes ----------

/** A number rounded to a grid, for the drag that snaps with Shift. */
export function onGrid(value: number, step: number): number {
  const rounded = Math.round(value / step) * step;
  // Clean, so 0.30000000000000004 never reaches the file.
  return Math.round(rounded * 1e6) / 1e6;
}

/** Two points the same place, either side of the middle line, give or take rounding. */
const samePlace = (a: HullPoint, b: HullPoint): boolean => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/**
 * A point's twin across the hull's middle line (hulls face +x, so the line is y = 0): the other
 * point of the shape at the same x and the opposite y. -1 when the shape has no twin for it,
 * which is what a point on the line, or an odd shape, has.
 */
export function twinOf(points: HullPoint[], index: number): number {
  const at = points[index];
  if (!at) return -1;
  const twin: HullPoint = [at[0], -at[1]];
  if (samePlace(at, twin)) return -1;
  return points.findIndex((point, i) => i !== index && samePlace(point, twin));
}

/**
 * The points after one is dragged to `at`: with mirroring on, its twin across the middle line
 * moves with it, and a point dragged onto the line stays single there.
 */
export function dragPoint(points: HullPoint[], index: number, at: HullPoint, mirror: boolean, step = 0): HullPoint[] {
  if (!points[index]) return points;
  const next = points.map((point): HullPoint => [...point] as HullPoint);
  const twin = mirror ? twinOf(points, index) : -1;
  const snapped: HullPoint = step > 0 ? [onGrid(at[0], step), onGrid(at[1], step)] : [at[0], at[1]];
  next[index] = snapped;
  if (twin >= 0) next[twin] = [snapped[0], -snapped[1]];
  return next;
}

/**
 * The points after a new one is added on the segment from `after` to the one past it: with
 * mirroring on, its twin goes on the segment that mirrors that one too, so the shape stays even.
 * A point added on the middle line, or a shape without a mirroring segment, gets no twin.
 */
export function addPoint(points: HullPoint[], after: number, at: HullPoint, mirror: boolean, step = 0): HullPoint[] {
  const count = points.length;
  if (count === 0 || after < 0 || after >= count) return points;
  const snapped: HullPoint = step > 0 ? [onGrid(at[0], step), onGrid(at[1], step)] : [at[0], at[1]];
  const next = points.map((point): HullPoint => [...point] as HullPoint);
  next.splice(after + 1, 0, snapped);
  if (!mirror || snapped[1] === 0) return next;
  // The segment the twin belongs on joins the twins of this segment's two ends.
  const ends = [points[after], points[(after + 1) % count]];
  const twins = ends.map((end) => points.findIndex((point) => samePlace(point, [end[0], -end[1]])));
  if (!ends.every((end) => Math.abs(end[1]) > 1e-9) || twins.some((index) => index < 0)) return next;
  const [a, b] = twins;
  const where = b === (a + 1) % count ? a + 1 : a === (b + 1) % count ? a : -1;
  if (where < 0) return next;
  // The first insert may have moved the segment the twin goes after, so count from the twin end.
  const shift = after + 1 < where ? 1 : 0;
  next.splice(where + shift, 0, [snapped[0], -snapped[1]]);
  return next;
}

/**
 * The points after one is removed: its twin goes with it, and a polygon keeps at least three.
 * Returns the points it was given when nothing can be removed.
 */
export function removePoint(points: HullPoint[], index: number, mirror: boolean): HullPoint[] {
  if (!points[index] || points.length <= 3) return points;
  const twin = mirror ? twinOf(points, index) : -1;
  if (twin >= 0 && points.length <= 4) return points;
  const drop = new Set([index, ...(twin >= 0 ? [twin] : [])]);
  return points.filter((_, i) => !drop.has(i)).map((point): HullPoint => [...point] as HullPoint);
}

/** A shape's points after `flip` puts it on the other side of the middle line: x stays, y turns. */
export function flipPoints(points: HullPoint[]): HullPoint[] {
  return points.map(([x, y]): HullPoint => [x, -y]);
}

/**
 * A hull copied from another: its outline, shapes, mounts and stats, under a name of its own.
 * What it's used for starts empty, so a copy doesn't quietly join the new game's ships. The copy
 * is a copy: changing it leaves the hull it came from alone.
 */
export function copyHull(from: ShipModel, to: ShipModel): void {
  const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  if (HULL_MOUNTS[to]) return;
  SHIP_MODELS.push(to);
  HULL_MOUNTS[to] = copy(HULL_MOUNTS[from] ?? []);
  HULL_EDGE[to] = copy(HULL_EDGE[from] ?? []);
  HULL_SHAPES[to] = copy(HULL_SHAPES[from] ?? []);
  HULL_INFO[to] = { ...copy(HULL_INFO[from] ?? { programs: [], loadouts: [], usedBy: [] }), usedBy: [] };
}
