import file from "./items.json";
import { hasGlyph } from "./glyphs";
import { forgetThing, PARTS, registerThing, volumeOf, type Part, type PartIcon, type PartId, type Shape } from "./parts";
import { PROGRAMS } from "./programs";

/**
 * Items: every good in the game. Each is an ore, a part made from ore, or a module. An item has
 * a shape (what it takes on the player's grid), a volume (what it takes everywhere else), a
 * price, a blueprint price, an icon, and a recipe for what it is made from. Set in the item
 * designer, kept in src/items.json, in the game at once.
 *
 * A module is an item and a part at once, with the same id: the item owns what shows and what it
 * costs (shape, volume, price, blueprint price, icon, description, recipe), and the module in
 * `PARTS` keeps what makes it a module (its kind, the mounts it fits, its stats, weight, tier and
 * wear). `partOf` answers for every item, so the bay, a locker and a base's store hold one
 * without knowing the difference.
 *
 * Where a recipe runs follows the item's type: a part is made at the hub, off-screen, and a
 * module at the station that sells it, at the moment of sale. An ore has no recipe.
 */
export const ITEM_TYPES = ["ore", "part", "module"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** n of an item, as a recipe takes it in. */
export interface Ingredient {
  item: string;
  n: number;
}

/** What an item is made from: the items it takes in, and how many it makes. */
export interface Recipe {
  from: Ingredient[];
  /** How many it makes. Without one, 1. */
  yields?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  description: string;
  shape: Shape;
  /** How much room it takes in a station's storage or a hauler. Without one, its shape's area. */
  volume?: number;
  /** What a station pays whoever sells it one, and asks for it in its shop. */
  price: number;
  /** What a station pays for the blueprint, if it's a module. */
  blueprintPrice: number;
  icon: PartIcon;
  /** What it's made from. Ores have none. */
  recipe?: Recipe;
}

export interface ItemsFile {
  items: ItemDef[];
}

/** A recipe with what it makes: the shape the rest of the game reads. */
export interface AppliedRecipe extends Recipe {
  makes: string;
}

/** What the lookup `thingOf` answers with, for a part, an item or a program alike. */
export interface Thing {
  id: PartId;
  label: string;
  description: string;
  shape: Shape;
  volume: number;
  price: number;
  icon: PartIcon;
  /** Whether it's in the items file at all. */
  isItem: boolean;
  /** What kind of item it is, or null for a part with no item behind it (a decal). */
  type: ItemType | null;
}

/** The items there are. Changed in place by the item designer. */
export const ITEMS: ItemDef[] = [];

/** The items by id, and the recipes worked out from them: rebuilt whenever the file is read. */
const BY_ID = new Map<string, ItemDef>();
let HUB_RECIPES: AppliedRecipe[] = [];
let SALE_RECIPES: AppliedRecipe[] = [];
let ORE_ITEMS: ItemDef[] = [];

/** The icon of an item whose own is missing or unreadable. */
const FALLBACK_ICON: PartIcon = { glyph: "crate", primary: "#566274", secondary: "#c8d4e8", border: "#f0d86a" };

const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const cells = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1;
const colour = (value: unknown): value is string => typeof value === "string" && value !== "";

/** An icon read from a file: the glyph must exist and the colours be there, else the fallback. */
function readIcon(raw: Partial<PartIcon> | undefined): PartIcon {
  if (!raw || !hasGlyph(String(raw.glyph)) || !colour(raw.primary) || !colour(raw.secondary) || !colour(raw.border)) return { ...FALLBACK_ICON };
  const mark = typeof raw.mark === "string" ? raw.mark : "";
  return { glyph: raw.glyph!, primary: raw.primary, secondary: raw.secondary, border: raw.border, ...(mark ? { mark } : {}), ...(colour(raw.glow) ? { glow: raw.glow } : {}) };
}

/** The part a module item is: the module in `PARTS` that has this id. A module is the one item that is a part as well. */
function modulePart(id: string): Part | undefined {
  const part = PARTS.find((each) => each.id === id);
  return part && part.kind !== "cockpit" ? part : undefined;
}

/** A recipe read from a file, or null when it takes in nothing real. */
function readRecipe(raw: unknown, known: (id: string) => boolean): Recipe | null {
  const data = raw as Partial<Recipe> | undefined;
  if (!data || !Array.isArray(data.from) || data.from.length === 0) return null;
  const from = data.from
    .filter((each): each is Ingredient => !!each && known(each.item) && Number.isInteger(each.n) && each.n >= 1)
    .map((each) => ({ item: each.item, n: each.n }));
  if (from.length !== data.from.length) return null;
  const yields = Number.isInteger(data.yields) && (data.yields as number) >= 1 ? (data.yields as number) : 1;
  return { from, ...(yields > 1 ? { yields } : {}) };
}

/**
 * An item read from a file, or null when it has no usable id: an ore or a part can't take a
 * part's id, a program's or another item's, and a module takes the id of the module it is.
 */
function readItem(raw: Partial<ItemDef> | undefined, taken: Set<string>, known: (id: string) => boolean): ItemDef | null {
  if (!raw || typeof raw.id !== "string" || raw.id === "" || taken.has(raw.id)) return null;
  const type: ItemType = (ITEM_TYPES as readonly string[]).includes(raw.type as string) ? (raw.type as ItemType) : "part";
  const id = raw.id;
  if (type === "module") {
    if (!modulePart(id)) return null;
  } else if (PARTS.some((part) => part.id === id) || PROGRAMS.some((program) => program.id === id)) return null;
  taken.add(id);
  const shape = raw.shape && cells(raw.shape.w) && cells(raw.shape.h) ? { w: raw.shape.w, h: raw.shape.h } : { w: 1, h: 1 };
  const volume = typeof raw.volume === "number" && Number.isFinite(raw.volume) && raw.volume > 0 ? raw.volume : undefined;
  const price = Math.max(0, finite(raw.price, 0));
  return {
    id,
    name: typeof raw.name === "string" && raw.name ? raw.name : id,
    type,
    description: typeof raw.description === "string" ? raw.description : "",
    shape,
    ...(volume !== undefined ? { volume } : {}),
    price,
    blueprintPrice: Math.max(0, finite(raw.blueprintPrice, Math.round(price * 0.75))),
    icon: readIcon(raw.icon),
    ...(raw.recipe ? { recipe: readRecipe(raw.recipe, known) ?? undefined } : {}),
  };
}

/** The item as a part, which is how `partOf` and everything holding an ore or a part sees it. */
function asPart(item: ItemDef): Part {
  return {
    id: item.id as PartId,
    kind: "item",
    label: item.name,
    short: item.name,
    price: item.price,
    weight: 0,
    description: item.description,
    tier: 0,
    shape: { ...item.shape },
    ...(item.volume !== undefined ? { volume: item.volume } : {}),
    icon: { ...item.icon },
  };
}

/**
 * Sits an item over the module it is: the item owns what shows and what the module costs, the
 * module keeps what makes it a module.
 */
function applyToModule(part: Part, item: ItemDef): void {
  part.label = item.name;
  part.description = item.description;
  part.price = item.price;
  part.shape = { ...item.shape };
  if (item.volume !== undefined) part.volume = item.volume;
  else delete part.volume;
  part.icon = { ...item.icon };
}

/** Puts an items file into play: the items, and `partOf` answering for each of them. */
export function useItemsFile(data: Partial<ItemsFile> | undefined): void {
  for (const item of ITEMS) forgetThing(item.id as PartId);
  const taken = new Set<string>();
  const raw = Array.isArray(data?.items) ? data!.items : [];
  // A recipe may take in an item the file lists further down, so every id it names counts.
  const declared = new Set(raw.map((each) => each?.id).filter((id): id is string => typeof id === "string"));
  const known = (id: string) => declared.has(id) || PARTS.some((part) => part.id === id);
  const items = raw.map((each) => readItem(each, taken, known)).filter((item): item is ItemDef => item !== null);
  ITEMS.splice(0, ITEMS.length, ...items);
  BY_ID.clear();
  for (const item of ITEMS) BY_ID.set(item.id, item);
  for (const item of ITEMS) {
    const part = modulePart(item.id);
    if (part) applyToModule(part, item);
    else registerThing(asPart(item));
  }
  const applied = (type: ItemType): AppliedRecipe[] =>
    ITEMS.filter((item) => item.type === type && item.recipe)
      .map((item) => ({ makes: item.id, from: item.recipe!.from, ...(item.recipe!.yields !== undefined ? { yields: item.recipe!.yields } : {}) }));
  HUB_RECIPES = applied("part");
  SALE_RECIPES = applied("module");
  ORE_ITEMS = itemsOf("ore");
}

/** The items file as it is now, to save. */
export function itemsFileNow(): ItemsFile {
  return JSON.parse(JSON.stringify({ items: ITEMS })) as ItemsFile;
}

/** The items file the game shipped with, as read. */
export const SHIPPED_ITEMS: ItemsFile = JSON.parse(JSON.stringify(file)) as ItemsFile;
useItemsFile(SHIPPED_ITEMS);

/** The item with this id, if there is one. */
export function itemDef(id: string): ItemDef | undefined {
  return BY_ID.get(id);
}

/** Every item of one type. */
export function itemsOf(type: ItemType): ItemDef[] {
  return ITEMS.filter((item) => item.type === type);
}

/** The ore items there are: what loose ore bodies and a bay's grid hold. */
export function oreItems(): ItemDef[] {
  return ORE_ITEMS;
}

/** Whether a thing is an ore: what the tractor catches and a station buys as ore rather than as stock. */
export function isOreItem(id: string | PartId): boolean {
  return itemDef(id)?.type === "ore";
}

/** A part, an item or a program by its id, as one thing: its label, shape, volume, price and icon. */
export function thingOf(id: PartId): Thing | undefined {
  const item = itemDef(id);
  if (item) return { id, label: item.name, description: item.description, shape: item.shape, volume: volumeOf(id), price: item.price, icon: item.icon, isItem: true, type: item.type };
  const part = PARTS.find((each) => each.id === id);
  if (!part) return undefined;
  return { id, label: part.label, description: part.description, shape: part.shape ?? { w: 1, h: 1 }, volume: volumeOf(id), price: part.price, icon: part.icon, isItem: false, type: null };
}

/** The recipe that makes an item, if there is one. */
export function recipeFor(makes: string): AppliedRecipe | undefined {
  const item = itemDef(makes);
  if (!item?.recipe) return undefined;
  return { makes, from: item.recipe.from, ...(item.recipe.yields !== undefined ? { yields: item.recipe.yields } : {}) };
}


/** The recipes the hub runs: the ones that make a part. */
export function hubRecipes(): AppliedRecipe[] {
  return HUB_RECIPES;
}

/** The recipes a station runs at the moment it sells: the ones that make a module. */
export function saleRecipes(): AppliedRecipe[] {
  return SALE_RECIPES;
}

/** The modules there are, as items. */
export function moduleItems(): ItemDef[] {
  return itemsOf("module");
}

/** The ids of every module: what a station's blueprint lists hold. */
export function moduleIds(): PartId[] {
  return itemsOf("module").map((item) => item.id as PartId);
}
