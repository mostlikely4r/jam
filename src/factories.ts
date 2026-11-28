/**
 * Factories: the part that makes things (`docs/recipes-factories-plan.md`, step 2). A factory
 * part runs the recipes whose `factory` condition names its kind, at its speed, out of its
 * station's storage. Time lives on the recipe, speed on the part: a recipe of 60 s at speed 20
 * takes 3 s.
 *
 * It works in one of two modes. Made to order (a workshop): it works through the orders it is
 * given, in turn, and nothing else. Made to stock: once its orders are done, it makes whichever
 * of its outputs is furthest below its target, as a share of the target, and waits, knowing on
 * what, when that one can't be made.
 *
 * This file is the logic alone, on a store it is handed, so it is tested without a world. The
 * sim keeps one `Factory` per factory part on each station, and books what the store gives and
 * takes in its ledger.
 */
import type { MountId } from "./fitting";
import type { Placed } from "./grid";
import { recipesFor, type AppliedRecipe, type FactoryKind } from "./items";
import type { PartId, ShipModel } from "./parts";

export type FactoryMode = "stock" | "order";

/** A factory part's data: its kind, how fast it works, its mode, and for to-stock how many of each output it keeps. */
export interface FactoryData {
  kind: FactoryKind;
  speed: number;
  mode: FactoryMode;
  targets?: Record<string, number>;
}

/** Where a module made to order goes when it's done: what the buy planned for it. */
export type OrderPlan = { where: "mount"; mounts: MountId[] } | { where: "hold" | "locker"; spots: Placed[] };

/**
 * What a job made to order is for: a module bought by the player, paid for and its inputs
 * taken, or a hull. Only the player's buys wait; every other buyer gets what it buys at once.
 */
export type WorkOrder = ModuleOrder | HullOrder;
export interface ModuleOrder {
  kind: "module";
  part: PartId;
  count: number;
  plan: OrderPlan;
  paid: number;
}
/** A hull for the player: the hull it replaces, and what they paid for it less the trade-in. */
export interface HullOrder {
  kind: "hull";
  model: ShipModel;
  from: ShipModel;
  net: number;
}

/** One run of work: what it makes and how many, and the seconds of work at speed 1 it has left of its total. */
export interface FactoryJob {
  makes: string;
  yields: number;
  left: number;
  total: number;
  order?: WorkOrder;
}

/** What a factory is doing, for its dev card and, later, its live shapes. */
export type FactoryState = { is: "idle" } | { is: "working"; makes: string } | { is: "waiting"; makes: string; on: string[] };

/** One factory part's work, kept by the station it's on: the job under way, the orders in line, and hulls done but not yet handed over. */
export interface Factory {
  mount: MountId;
  job: FactoryJob | null;
  queue: FactoryJob[];
  ready: HullOrder[];
  state: FactoryState;
}

/** What a factory works out of: its station's storage. */
export interface FactoryStore {
  held(id: string): number;
  take(id: string, n: number): void;
  put(id: string, n: number): void;
  /** Whether n more of an item fit. */
  fits(id: string, n: number): boolean;
  /** An item's name, for what a factory waits on. */
  label(id: string): string;
}

export function newFactory(mount: MountId): Factory {
  return { mount, job: null, queue: [], ready: [], state: { is: "idle" } };
}

/** How many of an output a to-stock factory keeps: its target, or 0 when it has none for it. */
export function targetOf(data: FactoryData, id: string): number {
  return Math.max(0, data.targets?.[id] ?? 0);
}

/** What a recipe lacks in a store, in words: "3 Part A". Nothing when it lacks nothing. */
export function lacking(recipe: AppliedRecipe, store: FactoryStore): string[] {
  const words = recipe.inputs.filter((each) => store.held(each.item) < each.n).map((each) => `${each.n - store.held(each.item)} ${store.label(each.item)}`);
  if (words.length === 0 && !store.fits(recipe.makes, recipe.yields ?? 1)) words.push("room in storage");
  return words;
}

/**
 * What a to-stock factory makes next: of the outputs below target, the furthest below as a share
 * of its target that it can make now. It takes that recipe's inputs and returns the job. When an
 * output is below target but none can be made, it waits on the furthest below. With nothing
 * below target it's idle.
 */
export function pickStockJob(data: FactoryData, store: FactoryStore): { job: FactoryJob } | { waiting: FactoryState } | null {
  const below = recipesFor(data.kind)
    .filter((recipe) => store.held(recipe.makes) < targetOf(data, recipe.makes))
    .map((recipe) => ({ recipe, share: store.held(recipe.makes) / targetOf(data, recipe.makes) }))
    .sort((a, b) => a.share - b.share);
  if (below.length === 0) return null;
  for (const { recipe } of below) {
    if (lacking(recipe, store).length > 0) continue;
    for (const each of recipe.inputs) store.take(each.item, each.n);
    return { job: { makes: recipe.makes, yields: recipe.yields ?? 1, left: recipe.time, total: recipe.time } };
  }
  const first = below[0].recipe;
  return { waiting: { is: "waiting", makes: first.makes, on: lacking(first, store) } };
}

/**
 * Runs a factory for dt seconds: its job gets dt times its speed of work, a job done hands over
 * (an order to `done`, made-to-stock output into the store) and the next starts in the time
 * left. Orders come first; a to-stock factory picks its own once they're done.
 */
export function tickFactory(factory: Factory, data: FactoryData, dt: number, store: FactoryStore, done: (job: FactoryJob) => void): void {
  let work = Math.max(0, dt) * Math.max(0, data.speed);
  // A recipe of no time could run forever in one tick: a few runs a tick is plenty.
  for (let runs = 0; runs < 32; runs++) {
    if (!factory.job) {
      const next = factory.queue.shift();
      if (next) factory.job = next;
      else if (data.mode === "stock") {
        const pick = pickStockJob(data, store);
        if (!pick) factory.state = { is: "idle" };
        else if ("waiting" in pick) factory.state = pick.waiting;
        else factory.job = pick.job;
      } else factory.state = { is: "idle" };
      if (!factory.job) return;
    }
    const job = factory.job;
    factory.state = { is: "working", makes: job.makes };
    const used = Math.min(work, job.left);
    job.left -= used;
    work -= used;
    if (job.left > 1e-9) return;
    factory.job = null;
    if (job.order) done(job);
    else store.put(job.makes, job.yields);
    if (work <= 1e-9 && factory.queue.length === 0 && data.mode !== "stock") {
      factory.state = { is: "idle" };
      return;
    }
  }
}

/** How far along a job is, 0 to 1. */
export function progressOf(job: FactoryJob): number {
  return job.total > 0 ? Math.min(1, Math.max(0, 1 - job.left / job.total)) : 1;
}

/** Every job a factory holds that is made to order: the one under way, then the line. */
export function orderJobs(factory: Factory): FactoryJob[] {
  return [...(factory.job?.order ? [factory.job] : []), ...factory.queue.filter((job) => job.order)];
}
