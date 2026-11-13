import type { Sim } from "./sim";

/**
 * Bump this whenever what a save holds changes shape, so an old save is turned away
 * rather than loaded into a world it no longer fits.
 */
export const SAVE_VERSION = 3;

/** Where the two saves live: the one kept for you, and the one you make yourself. */
export const SAVE_SLOTS = { auto: "jam-save-auto", manual: "jam-save-manual" } as const;
export type SaveSlot = keyof typeof SAVE_SLOTS;

interface SaveFile {
  version: number;
  /** When it was saved, for showing next to Continue and Load. */
  savedAt: number;
  data: Encoded;
}

/**
 * Plain data in which one object can be referred to from many places, as the world's are:
 * a ship is in its pilot, in the ore it shot loose, as a drone's owner. Every object, array,
 * set and map gets an entry in `table`, and a value refers to one by number.
 */
interface Encoded {
  root: Value;
  table: Entry[];
}
type Value = null | boolean | number | string | { $: number } | { n: string };
type Entry =
  | { o: Record<string, Value> }
  | { a: Value[] }
  | { s: Value[] }
  | { m: [Value, Value][] };

function encode(root: unknown): Encoded {
  const ids = new Map<object, number>();
  const table: Entry[] = [];
  const value = (item: unknown): Value => {
    if (item === null || item === undefined) return null;
    if (typeof item === "number") return Number.isFinite(item) ? item : { n: String(item) };
    if (typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item !== "object") throw new Error(`Can't save a ${typeof item}`);
    const known = ids.get(item);
    if (known !== undefined) return { $: known };
    const id = table.length;
    ids.set(item, id);
    table.push({ a: [] });
    if (Array.isArray(item)) table[id] = { a: item.map(value) };
    else if (item instanceof Set) table[id] = { s: [...item].map(value) };
    else if (item instanceof Map) table[id] = { m: [...item].map(([key, entry]) => [value(key), value(entry)]) };
    else {
      const fields: Record<string, Value> = {};
      for (const [key, entry] of Object.entries(item)) {
        if (typeof entry !== "function") fields[key] = value(entry);
      }
      table[id] = { o: fields };
    }
    return { $: id };
  };
  return { root: value(root), table };
}

function decode({ root, table }: Encoded): unknown {
  // Make every container first, so references can be filled in whatever order they come.
  const made: unknown[] = table.map((entry) =>
    "o" in entry ? {} : "a" in entry ? [] : "s" in entry ? new Set() : new Map(),
  );
  const value = (item: Value): unknown => {
    if (item === null || typeof item !== "object") return item;
    if ("n" in item) return Number(item.n);
    return made[item.$];
  };
  table.forEach((entry, id) => {
    const into = made[id];
    if ("o" in entry) for (const [key, item] of Object.entries(entry.o)) (into as Record<string, unknown>)[key] = value(item);
    else if ("a" in entry) (into as unknown[]).push(...entry.a.map(value));
    else if ("s" in entry) for (const item of entry.s) (into as Set<unknown>).add(value(item));
    else for (const [key, item] of entry.m) (into as Map<unknown, unknown>).set(value(key), value(item));
  });
  return value(root);
}

/** Saves the world to a slot. Returns whether it worked: storage can be full or switched off. */
export function saveGame(sim: Sim, slot: SaveSlot): boolean {
  try {
    const file: SaveFile = { version: SAVE_VERSION, savedAt: Date.now(), data: encode(sim.snapshot()) };
    localStorage.setItem(SAVE_SLOTS[slot], JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

/** What's in a slot, if anything: when it was saved, and whether this version can load it. */
export function saveInfo(slot: SaveSlot): { savedAt: number; fits: boolean } | null {
  try {
    const raw = localStorage.getItem(SAVE_SLOTS[slot]);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    return { savedAt: file.savedAt, fits: file.version === SAVE_VERSION };
  } catch {
    return null;
  }
}

/** Loads a slot into the world. Returns whether it worked; if not, the world is left as it was. */
export function loadGame(sim: Sim, slot: SaveSlot): boolean {
  try {
    const raw = localStorage.getItem(SAVE_SLOTS[slot]);
    if (!raw) return false;
    const file = JSON.parse(raw) as SaveFile;
    if (file.version !== SAVE_VERSION) return false;
    sim.restore(decode(file.data));
    return true;
  } catch {
    return false;
  }
}

export function forgetSave(slot: SaveSlot): void {
  localStorage.removeItem(SAVE_SLOTS[slot]);
}

/** For tests: a save and load through plain JSON, without storage. */
export function roundTrip(sim: Sim, into: Sim): void {
  into.restore(decode(JSON.parse(JSON.stringify(encode(sim.snapshot())))));
}

/**
 * A world that has already run for a while, for new games to start in: traffic on its way
 * and news on the boards. Made ahead of time (npm run warm), as running it takes too long
 * to do when a game starts. It only fits the layout it was made in.
 */
export interface StartFile {
  version: number;
  /** A fingerprint of the layout it was made in (`layoutKey`). */
  layout: string;
  /** Game seconds it ran before a player joins. */
  warmed: number;
  data: Encoded;
}

/** A short fingerprint of a layout's text: any change to the layout changes it. */
export function layoutKey(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return `${text.length}-${hash.toString(16)}`;
}

/** The world as it is now, as a start for new games. The player's ship is made anew on loading. */
export function makeStart(sim: Sim, layout: string): StartFile {
  return { version: SAVE_VERSION, layout, warmed: sim.warmedUp, data: encode(sim.snapshot()) };
}

/**
 * Puts a start into the world, keeping the world's own tuning, if it fits this version and
 * layout. Returns whether it did; if not, the world is left as it was. The caller then lays
 * the places out at the start's clock and makes the player's ship (`Sim.startPlayer`).
 */
export function loadStart(sim: Sim, file: StartFile | null, layout: string): boolean {
  if (!file || file.version !== SAVE_VERSION || file.layout !== layout) return false;
  try {
    const data = decode(file.data) as { tuning: object };
    data.tuning = {};
    sim.restore(data);
    sim.warmedUp = file.warmed;
    return true;
  } catch {
    return false;
  }
}
