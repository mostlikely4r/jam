import file from "./items.json";
import { hasGlyph } from "./glyphs";
import { forgetThing, PARTS, registerThing, volumeOf, type Part, type PartIcon, type PartId, type Shape } from "./parts";

/**
 * Items: goods that aren't parts. Each has a shape (what it takes on the player's grid), a
 * volume (what it takes everywhere else), a price and an icon, set in the item designer and
 * kept in src/items.json. They go through the game as `PartId`s, so a module can be an item:
 * `partOf` answers for them once they are put into play (`useItemsFile`).
 *
 * A recipe makes an item or a part from items: two exist, and run where the plan says
 * (docs/items-plan.md): the hub, off-screen, and a station at the moment it sells.
 */
export interface ItemDef {
  id: string;
  name: string;
  description: string;
  shape: Shape;
  /** How much room it takes in a station's storage or a hauler. Without one, its shape's area. */
  volume?: number;
  price: number;
  icon: PartIcon;
}

/** n of an item, as a recipe takes it in. */
export interface Ingredient {
  item: string;
  n: number;
}

export interface Recipe {
  /** An item or a part. */
  makes: string;
  from: Ingredient[];
  /** How many it makes. Without one, 1. */
  yields?: number;
}

export interface ItemsFile {
  items: ItemDef[];
  recipes: Recipe[];
}

/** What the lookup `thingOf` answers with, for a part or an item alike. */
export interface Thing {
  id: PartId;
  label: string;
  description: string;
  shape: Shape;
  volume: number;
  price: number;
  icon: PartIcon;
  isItem: boolean;
}

/** The items there are. Changed in place by the item designer. */
export const ITEMS: ItemDef[] = [];
/** The recipes there are. Changed in place by the item designer. */
export const ITEM_RECIPES: Recipe[] = [];

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

/** An item read from a file, or null when it has no usable id, or the id is a part's or already taken. */
function readItem(raw: Partial<ItemDef> | undefined, taken: Set<string>): ItemDef | null {
  if (!raw || typeof raw.id !== "string" || raw.id === "" || taken.has(raw.id) || PARTS.some((part) => part.id === raw.id)) return null;
  taken.add(raw.id);
  const shape = raw.shape && cells(raw.shape.w) && cells(raw.shape.h) ? { w: raw.shape.w, h: raw.shape.h } : { w: 1, h: 1 };
  const volume = typeof raw.volume === "number" && Number.isFinite(raw.volume) && raw.volume > 0 ? raw.volume : undefined;
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name ? raw.name : raw.id,
    description: typeof raw.description === "string" ? raw.description : "",
    shape,
    ...(volume !== undefined ? { volume } : {}),
    price: Math.max(0, finite(raw.price, 0)),
    icon: readIcon(raw.icon),
  };
}

/** Recipes read from a file: each must make something that exists and take in real items. */
function readRecipes(raw: unknown, items: ItemDef[]): Recipe[] {
  if (!Array.isArray(raw)) return [];
  const known = (id: unknown): id is string => typeof id === "string" && (items.some((item) => item.id === id) || PARTS.some((part) => part.id === id));
  const out: Recipe[] = [];
  for (const each of raw as Partial<Recipe>[]) {
    if (!each || !known(each.makes) || !Array.isArray(each.from)) continue;
    const from = each.from
      .filter((ingredient) => ingredient && items.some((item) => item.id === ingredient.item) && Number.isInteger(ingredient.n) && ingredient.n >= 1)
      .map((ingredient) => ({ item: ingredient.item, n: ingredient.n }));
    if (from.length === 0 || from.length !== each.from.length) continue;
    const yields = Number.isInteger(each.yields) && (each.yields as number) >= 1 ? (each.yields as number) : 1;
    out.push({ makes: each.makes, from, ...(yields > 1 ? { yields } : {}) });
  }
  return out;
}

/** The item as a part, which is how `partOf` and everything holding a module sees it. */
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

/** Puts an items file into play: the items and recipes, and `partOf` answering for the items. */
export function useItemsFile(data: Partial<ItemsFile> | undefined): void {
  for (const item of ITEMS) forgetThing(item.id as PartId);
  const taken = new Set<string>();
  const items = (Array.isArray(data?.items) ? data!.items : []).map((raw) => readItem(raw, taken)).filter((item): item is ItemDef => item !== null);
  ITEMS.splice(0, ITEMS.length, ...items);
  ITEM_RECIPES.splice(0, ITEM_RECIPES.length, ...readRecipes(data?.recipes, items));
  for (const item of ITEMS) registerThing(asPart(item));
}

/** The items file as it is now, to save. */
export function itemsFileNow(): ItemsFile {
  return JSON.parse(JSON.stringify({ items: ITEMS, recipes: ITEM_RECIPES })) as ItemsFile;
}

/** The items file the game shipped with, as read. */
export const SHIPPED_ITEMS: ItemsFile = JSON.parse(JSON.stringify(file)) as ItemsFile;
useItemsFile(SHIPPED_ITEMS);

/** The item with this id, if there is one. */
export function itemDef(id: string): ItemDef | undefined {
  return ITEMS.find((item) => item.id === id);
}

/** A part or an item by its id, as one thing: its label, shape, volume, price and icon. */
export function thingOf(id: PartId): Thing | undefined {
  const item = itemDef(id);
  if (item) return { id, label: item.name, description: item.description, shape: item.shape, volume: volumeOf(id), price: item.price, icon: item.icon, isItem: true };
  const part = PARTS.find((each) => each.id === id);
  if (!part) return undefined;
  return { id, label: part.label, description: part.description, shape: part.shape ?? { w: 1, h: 1 }, volume: volumeOf(id), price: part.price, icon: part.icon, isItem: false };
}

/** The recipe that makes a part or an item, if there is one. */
export function recipeFor(makes: string): Recipe | undefined {
  return ITEM_RECIPES.find((recipe) => recipe.makes === makes);
}

/** The recipes that take this item in. */
export function recipesUsing(item: string): Recipe[] {
  return ITEM_RECIPES.filter((recipe) => recipe.from.some((ingredient) => ingredient.item === item));
}

/** The recipes the hub runs: the ones that make another item. (A recipe that makes a part runs at the station that sells it.) */
export function hubRecipes(): Recipe[] {
  return ITEM_RECIPES.filter((recipe) => itemDef(recipe.makes) !== undefined);
}

/** The recipes a station runs at the moment it sells: the ones that make a part. */
export function saleRecipes(): Recipe[] {
  return ITEM_RECIPES.filter((recipe) => itemDef(recipe.makes) === undefined);
}

/** The items the hub takes in: what a hauler is willing to carry off a station. */
export function hubInputs(): string[] {
  return [...new Set(hubRecipes().flatMap((recipe) => recipe.from.map((ingredient) => ingredient.item)))];
}
