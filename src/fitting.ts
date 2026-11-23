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
  /** Fuel its tank holds. Without one, `TANK`. */
  tank?: number;
}

/**
 * The stats of a part the parts page can edit, kept in the ship file over the code's own in
 * `parts.ts`. Only the ones that differ from the code's are kept. A module's shape, price and
 * icon are its item's, so they aren't here: the item designer owns those.
 */
export type PartStats = Partial<Pick<Part, "weight" | "tier" | "bay" | "slots" | "set" | "explosive" | "shape" | "icon">>;

/** Whether an item stands behind a part, and owns its shape, price and icon. */
export function itemOwned(id: PartId): boolean {
  return itemDef(id) !== undefined;
}

/**
 * What src/hulls.json holds: the mount types, which each part fits, which parts are decals,
 * each hull's mounts and what else each hull has.
 */
export interface ShipFile {
  mountTypes: string[];
  partMounts: Partial<Record<PartId, string[]>>;
  /** The parts flagged as decals: looks only, and only for decal mounts. */
  decalParts?: PartId[];
  hulls: Record<ShipModel, Mount[]>;
  hullInfo?: Record<ShipModel, HullInfo>;
  /** The part stats that differ from the code's own, changed on the parts page. */
  partStats?: Partial<Record<PartId, PartStats>>;
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
  const stat = (key: "price" | "weight" | "hull" | "tank"): number | undefined => {
    const value = raw?.[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  return { programs: [...new Set(programs)], loadouts: readLoadouts(raw?.loadouts), usedBy, price: stat("price"), weight: stat("weight"), hull: stat("hull"), tank: stat("tank") };
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

/** The mount types there are. Changed in place by the hull designer. */
export const MOUNT_TYPES: string[] = [];
/** The mount types each part fits. Changed in place by the hull designer. */
export const PART_MOUNTS: Partial<Record<PartId, string[]>> = {};
/** The parts flagged as decals: looks only, and only for decal mounts. Changed in place by the hull designer. */
export const DECAL_PARTS: PartId[] = [];
/** Each hull's mounts. The arrays are changed in place, so everything holding them sees it. */
export const HULL_MOUNTS = Object.fromEntries(SHIP_MODELS.map((model) => [model, [] as Mount[]])) as Record<ShipModel, Mount[]>;
/** What else each hull has: its default programs and what it's used for. Changed in place by the hull designer. */
export const HULL_INFO = Object.fromEntries(SHIP_MODELS.map((model) => [model, { programs: [], loadouts: [], usedBy: [] } as HullInfo])) as Record<ShipModel, HullInfo>;

/** The hull points every hull has unless its own say otherwise. */
export const MAX_HULL = 100;
/** The fuel every hull's tank holds unless its own says otherwise (docs/fuel-plan.md). */
export const TANK = 20;

/** The hull points a ship of this model has: its own, or `MAX_HULL`. */
export function hullMax(model: ShipModel): number {
  return HULL_INFO[model].hull ?? MAX_HULL;
}

/** The fuel its tank holds: its own, or `TANK`. Until step 2b it's the hull's own, not a part. */
export function hullTank(model: ShipModel): number {
  return HULL_INFO[model].tank ?? TANK;
}

/** Puts a ship file into play: mount types, which parts fit them, every hull's mounts and stats. */
export function useShipFile(file: ShipFile): void {
  MOUNT_TYPES.splice(0, MOUNT_TYPES.length, ...strings(file.mountTypes));
  for (const part of PARTS) {
    if (part.kind === "program") continue;
    PART_MOUNTS[part.id] = strings(file.partMounts?.[part.id]);
  }
  // The parts' stats start as the code has them, then the file's sit on top.
  for (const part of PARTS) resetPartStats(part.id);
  for (const [id, stats] of Object.entries(file.partStats ?? {}) as [PartId, PartStats][]) applyPartStats(id, stats);
  DECAL_PARTS.splice(0, DECAL_PARTS.length, ...strings(file.decalParts).filter((id): id is PartId => PARTS.some((part) => part.id === id && part.kind !== "program")));
  for (const model of SHIP_MODELS) {
    const mounts = (Array.isArray(file.hulls?.[model]) ? file.hulls[model] : []).map(readMount);
    HULL_MOUNTS[model].splice(0, HULL_MOUNTS[model].length, ...mounts);
    Object.assign(HULL_INFO[model], readHullInfo(file.hullInfo?.[model]));
  }
}
useShipFile(SHIPPED_SHIPS);

/** The ship file as it is now, to save. */
export function shipFileNow(): ShipFile {
  return JSON.parse(
    JSON.stringify({ mountTypes: MOUNT_TYPES, partMounts: PART_MOUNTS, decalParts: DECAL_PARTS, hulls: HULL_MOUNTS, hullInfo: HULL_INFO, partStats: partStatsNow() }),
  ) as ShipFile;
}

/** Whether a part is a decal: it shows on decal mounts for looks only, and is never fitted for real. */
export function isDecal(id: PartId): boolean {
  return DECAL_PARTS.includes(id);
}

/** Kept for the hull designer's callers: nothing is cached any more. */
export function mountsMoved(): void {}

export function mountOf(model: ShipModel, id: MountId): Mount | undefined {
  return HULL_MOUNTS[model].find((mount) => mount.id === id);
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
  for (const mount of HULL_MOUNTS[ship.model]) {
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
  for (const mount of HULL_MOUNTS[model]) {
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
  for (const id of HULL_INFO[model].programs) {
    fitting.software.add(id);
    install(fitting, id);
  }
  for (const mount of HULL_MOUNTS[model]) {
    const choices = decalChoices(model, mount);
    if (choices.length > 0) fitting.decals![mount.id] = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  }
  return fitting;
}

/** The mount holding a turret, if one is on. */
export function turretMount(ship: Fitting & { model: ShipModel }): Mount | null {
  for (const mount of HULL_MOUNTS[ship.model]) {
    const module = ship.fit[mount.id];
    if (module && partOf(module.part).kind === "turret") return mount;
  }
  return null;
}

/** The mounts a ship has now: its hull's, plus a turret's gun mount while one is on. */
export function mountsOf(ship: Fitting & { model: ShipModel }): Mount[] {
  const mounts = HULL_MOUNTS[ship.model];
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
  const mounts = HULL_MOUNTS[ship.model].filter((mount) => mountTakes(mount, id));
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
