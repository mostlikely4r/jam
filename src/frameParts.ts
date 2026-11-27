/**
 * Frame parts: what a station, the pirate base and a field deposit can do, as parts on the mounts
 * of their frames (`docs/station-frames-plan.md`, step 2). A part that isn't there is the empty
 * value: the pirate base has no refinery part, not a refinery set to 0.
 *
 * Full parts (dock, storage, trade, battery) carry real data. Thin parts (shop, refinery, repair,
 * shipyard, projects, radio, black market) wrap what exists: their presence switches the capability
 * on, they hold just what a world node held, and the code behind them stays. Each thin part is
 * marked for its current owner (`onlyOn`): fitting one anywhere else is refused, and the sim never
 * sees such a fit. The spec that redesigns a part lifts its mark.
 *
 * A frame's mounts say which part a bare frame comes with (`Mount.framePart`) and its data
 * (`Mount.data`). A place in the world holds overrides by mount id: an entry fits that part with
 * that data over the frame's, `null` leaves the mount empty, and a missing one keeps the frame's.
 */
import { FRAME_PART_KINDS, HULL_USE_NAMES, hullInfo, hullMounts, isFrame, type FramePartKind, type FrameUse, type Mount, type MountId } from "./fitting";
import { itemDef } from "./items";
import type { PartId, ShipModel } from "./parts";

export { FRAME_PART_KINDS, type FramePartKind };

/** How many world units one hull unit is: a mount's place times this is where it is on the frame. */
export const HULL_UNIT = 12;

/** The data each kind of frame part carries. */
export interface FramePartData {
  /** Where ships dock: a box `size` across each way from the mount (half its side), or a round zone of radius `size` round it. */
  dock: { shape: "box" | "ring"; size: number };
  /** Cells of storage: lockers and the store of whole modules. Without one, the tuning's `stationStorage`. */
  storage: { cells?: number };
  /** What it buys and what it sells, by item id or item type (`ore`). Prices stay the code's (spec C rewrites them). */
  trade: { buys: string[]; sells: string[] };
  /** Turrets once built: how many, the arc they stand in (degrees) and how far out. Without, the tuning's for its host. */
  battery: { count?: number; arc?: number; distance?: number };
  /** The shop's lists, as a station node held them. `programs` missing: every program. */
  shop: { unlocked: PartId[]; wanted: PartId[]; programs?: PartId[]; hulls: ShipModel[]; items: { item: string; n: number }[] };
  refinery: Record<string, never>;
  repair: Record<string, never>;
  shipyard: Record<string, never>;
  projects: Record<string, never>;
  radio: Record<string, never>;
  blackMarket: Record<string, never>;
}

/** One part fitted to a frame: what it is, which mount it's on, and its data. */
export type FramePart<K extends FramePartKind = FramePartKind> = K extends FramePartKind ? { kind: K; mount: MountId; data: FramePartData[K] } : never;

/** What a place holds for one of its frame's mounts: a part with its data over the frame's, or nothing at all. */
export type PartOverride = ({ part: FramePartKind } & Record<string, unknown>) | null;
export type PartOverrides = Partial<Record<MountId, PartOverride>>;

interface FramePartDef<K extends FramePartKind> {
  /** What the designer calls it. */
  name: string;
  /** The mount type it goes on. */
  mountType: string;
  /** A thin part's mark: the one frame use it may be fitted to for now. */
  onlyOn?: FrameUse;
  /** Its data from a file, with anything missing or invalid at its default. */
  read(raw: Record<string, unknown>): FramePartData[K];
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? [...new Set(value.filter((each): each is string => typeof each === "string"))] : []);
const count = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);
const none = (): Record<string, never> => ({});

/** Leaves out what's undefined, so a part's data says only what it has. */
function defined<T extends Record<string, unknown>>(data: T): T {
  for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
  return data;
}

export const FRAME_PARTS: { [K in FramePartKind]: FramePartDef<K> } = {
  dock: {
    name: "Dock",
    mountType: "dock",
    read: (raw) => ({ shape: raw.shape === "ring" ? "ring" : "box", size: count(raw.size) ?? 0 }),
  },
  storage: {
    name: "Storage",
    mountType: "storage",
    read: (raw) => defined({ cells: count(raw.cells) }),
  },
  trade: {
    name: "Trade point",
    mountType: "trade",
    read: (raw) => ({ buys: strings(raw.buys), sells: strings(raw.sells) }),
  },
  battery: {
    name: "Turret battery",
    mountType: "turret battery",
    read: (raw) => defined({ count: count(raw.count) === undefined ? undefined : Math.floor(count(raw.count)!), arc: count(raw.arc), distance: count(raw.distance) }),
  },
  shop: {
    name: "Shop",
    mountType: "shop",
    onlyOn: "station",
    read: (raw) => {
      const items = Array.isArray(raw.items)
        ? (raw.items as unknown[])
            .filter((each): each is { item: string; n: number } => !!each && typeof (each as { item?: unknown }).item === "string" && typeof (each as { n?: unknown }).n === "number")
            .map((each) => ({ item: each.item, n: each.n }))
        : [];
      const shop: FramePartData["shop"] = { unlocked: strings(raw.unlocked) as PartId[], wanted: strings(raw.wanted) as PartId[], hulls: strings(raw.hulls), items };
      if (Array.isArray(raw.programs)) shop.programs = strings(raw.programs) as PartId[];
      return shop;
    },
  },
  refinery: { name: "Refinery", mountType: "refinery", onlyOn: "station", read: none },
  repair: { name: "Repair", mountType: "repair", onlyOn: "station", read: none },
  shipyard: { name: "Shipyard", mountType: "shipyard", onlyOn: "station", read: none },
  projects: { name: "Projects", mountType: "projects", onlyOn: "station", read: none },
  radio: { name: "Radio", mountType: "radio", onlyOn: "station", read: none },
  blackMarket: { name: "Black market", mountType: "black market", onlyOn: "pirateBase", read: none },
};

/** The mount types frame parts and the pads and berths use, for the ship file's list. */
export const FRAME_MOUNT_TYPES = [...FRAME_PART_KINDS.map((kind) => FRAME_PARTS[kind].mountType), "refinery pad", "block pad", "berth"];

/** Whether a string names a frame part. */
export function isFramePart(kind: unknown): kind is FramePartKind {
  return typeof kind === "string" && (FRAME_PART_KINDS as readonly string[]).includes(kind);
}

/**
 * Why a frame part can't go on a mount of a hull, or null when it can: the mount must support its
 * type, the hull must be a frame (station parts on ships aren't built), and a thin part only goes
 * on a frame of the use it's marked for ("Station only for now").
 */
export function framePartRefusal(model: ShipModel, mount: Pick<Mount, "types">, kind: FramePartKind): string | null {
  const def = FRAME_PARTS[kind];
  if (!mount.types.includes(def.mountType)) return `Needs a ${def.mountType} mount`;
  if (!isFrame(model)) return "Frames only for now";
  if (def.onlyOn && !hullInfo(model).usedBy.includes(def.onlyOn)) return `${HULL_USE_NAMES[def.onlyOn]} only for now`;
  return null;
}

/** A part's data read through its kind, from the frame's data and a place's on top. */
function partData<K extends FramePartKind>(kind: K, ...layers: (Record<string, unknown> | undefined)[]): FramePartData[K] {
  const raw: Record<string, unknown> = {};
  for (const layer of layers) if (layer) Object.assign(raw, layer);
  delete raw.part;
  return FRAME_PARTS[kind].read(raw);
}

/**
 * The parts a frame has at a place: each of its mounts with the frame's part on it, or the
 * place's override instead. A fit the frame or the mount refuses is left out, so the sim never
 * sees a thin part where it isn't allowed.
 */
export function resolveParts(model: ShipModel, overrides: PartOverrides = {}): FramePart[] {
  const parts: FramePart[] = [];
  for (const mount of hullMounts(model)) {
    const override = overrides[mount.id];
    if (override === null) continue;
    const kind = override ? override.part : mount.framePart;
    if (!isFramePart(kind) || framePartRefusal(model, mount, kind) !== null) continue;
    // The frame's data counts only for the part it comes with.
    const base = mount.framePart === kind ? mount.data : undefined;
    parts.push({ kind, mount: mount.id, data: partData(kind, base, override ?? undefined) } as FramePart);
  }
  return parts;
}

/** The first part of a kind among these, if there is one. */
export function partOn<K extends FramePartKind>(parts: readonly FramePart[] | undefined, kind: K): FramePart<K> | undefined {
  return parts?.find((part) => part.kind === kind) as FramePart<K> | undefined;
}

/**
 * The mount a part of this kind goes on, on this frame: the one it comes with, or else the first
 * that takes it. Null when the frame has nowhere for it. A place's override for it is keyed by this.
 */
export function partMount(model: ShipModel, kind: FramePartKind): MountId | null {
  const mounts = hullMounts(model);
  const own = mounts.find((mount) => mount.framePart === kind);
  if (own) return own.id;
  return mounts.find((mount) => framePartRefusal(model, mount, kind) === null)?.id ?? null;
}

/** Whether a frame comes with a part of this kind, before any place says otherwise. */
export function frameHas(model: ShipModel, kind: FramePartKind): boolean {
  return resolveParts(model).some((part) => part.kind === kind);
}

/** A place's overrides read from a file: entries for mounts, each null or a frame part with its data. */
export function readOverrides(raw: unknown): PartOverrides {
  const out: PartOverrides = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [mount, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (entry === null) out[mount] = null;
    else if (entry && typeof entry === "object" && isFramePart((entry as { part?: unknown }).part)) out[mount] = JSON.parse(JSON.stringify(entry)) as PartOverride;
  }
  return out;
}

/**
 * A place's overrides from a station's settings named one by one, for a frame (the station's by
 * default): what code that builds a station by hand (the plain home, tests) says instead of the
 * loose fields a station spec had. A setting left out keeps the frame's part as it comes.
 */
export function placeParts(
  settings: {
    shipyard?: boolean;
    storage?: number;
    unlocked?: PartId[];
    wanted?: PartId[];
    programs?: PartId[];
    hulls?: ShipModel[];
    items?: { item: string; n: number }[];
    projects?: boolean;
    radio?: boolean;
    guards?: { count?: number; arc?: number; distance?: number };
  },
  model: ShipModel = "station",
): PartOverrides {
  const parts: PartOverrides = {};
  const put = (kind: FramePartKind, entry: PartOverride) => {
    const mount = partMount(model, kind);
    if (mount) parts[mount] = entry;
  };
  for (const kind of ["shipyard", "projects", "radio"] as const) {
    const on = settings[kind];
    if (on !== undefined) put(kind, on ? override(kind) : null);
  }
  if (settings.storage !== undefined) put("storage", override("storage", { cells: settings.storage }));
  const { unlocked, wanted, programs, hulls, items } = settings;
  if ([unlocked, wanted, programs, hulls, items].some((each) => each !== undefined)) {
    const shop: Partial<FramePartData["shop"]> = { unlocked: unlocked ?? [], wanted: wanted ?? [], hulls: hulls ?? [], items: items ?? [] };
    if (programs) shop.programs = programs;
    put("shop", override("shop", shop));
  }
  if (settings.guards) put("battery", override("battery", settings.guards));
  return parts;
}

/** Where a mount sits on a frame, in world units from its middle: x forward, y to the right. */
export function mountPlace(mount: Pick<Mount, "x" | "y">): { x: number; y: number } {
  return { x: mount.x * HULL_UNIT, y: mount.y * HULL_UNIT };
}

/** Where the first mount of a type sits on a frame, in world units from its middle, or null when it has none. */
export function frameMountSpot(model: ShipModel, type: string): { x: number; y: number } | null {
  const mount = hullMounts(model).find((each) => each.types.includes(type));
  return mount ? mountPlace(mount) : null;
}

/** Where a fitted part's mount sits on its frame, in world units from its middle. */
export function partSpot(model: ShipModel, part: FramePart): { x: number; y: number } {
  const mount = hullMounts(model).find((each) => each.id === part.mount);
  return mount ? mountPlace(mount) : { x: 0, y: 0 };
}

/** Whether a trade list names an item: by its id, or by its type. */
export function tradeNames(list: readonly string[], item: string): boolean {
  return list.includes(item) || list.includes(itemDef(item)?.type ?? "");
}

/** An override's own data, as a place would write it: a part and the fields that differ. */
export function override<K extends FramePartKind>(kind: K, data: Partial<FramePartData[K]> = {}): NonNullable<PartOverride> {
  return { part: kind, ...(JSON.parse(JSON.stringify(data)) as Record<string, unknown>) };
}
