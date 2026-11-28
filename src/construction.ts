/**
 * How anything is built (`docs/station-frames-plan.md`, step 4): a frame or a part under
 * construction has parts to go, delivered as blocks, and a purse its owner's account funded when
 * it was ordered, paid out over its blocks to whoever places them. It is open once the last part
 * is in. A frame still under construction is a construction site: it exists and is owned, but
 * can't dock, store or trade.
 *
 * In this build construction is always "N parts, in blocks of the tuning's `blockParts`"; spec B1
 * gives each frame and part a real recipe.
 */

export interface Construction {
  /** Parts still to come before it opens, and the parts already built into it. */
  left: number;
  used: number;
  /** The funding held to pay the blocks that build it, the blocks it is paid over, and what has gone out. */
  purse: number;
  blocks: number;
  paid: number;
}

/** A construction of so many parts, funded with `purse`, carried in blocks of `blockParts`. */
export function startConstruction(parts: number, purse: number, blockParts: number): Construction {
  return { left: parts, used: 0, purse, blocks: Math.max(1, Math.ceil(parts / blockParts)), paid: 0 };
}

/** Whether it's open: every part is in. */
export function isBuilt(build: Construction): boolean {
  return build.left <= 0;
}

/** How much of it is built, from 0 to 1. */
export function builtShare(build: Construction): number {
  return build.left > 0 ? build.used / (build.used + build.left) : 1;
}

/** Blocks it still wants. */
export function blocksToGo(build: Construction, blockParts: number): number {
  return Math.ceil(build.left / blockParts);
}

/** What one block pays its placer: the purse shared over its blocks, rounded, and never more than is left. */
export function blockPay(build: Construction): number {
  const share = Math.round(build.purse / Math.max(1, build.blocks));
  return Math.min(share, build.purse - build.paid);
}

/** Sets a block in: its parts are used and its pay goes out. Answers the pay. */
export function placeBlock(build: Construction, blockParts: number): number {
  const pay = blockPay(build);
  build.paid += pay;
  build.used += Math.min(blockParts, build.left);
  build.left = Math.max(0, build.left - blockParts);
  return pay;
}

/** Builds parts straight in, as a station does its own turrets from its parts A. Answers whether that finished it. */
export function addParts(build: Construction, parts: number): boolean {
  const used = Math.min(parts, build.left);
  build.left -= used;
  build.used += used;
  return build.left <= 1e-9;
}

/** Finishes it at once, as the testing switches do. */
export function finishConstruction(build: Construction): void {
  build.left = 0;
}

/**
 * A construction from a save made before construction was generic (version 11 and older): the
 * parts it had, and its funding if it had any, or the share of `price` that was still to pay.
 */
export function constructionFromOld(
  old: { partsLeft: number; partsUsed: number; purse?: number; blocks?: number; paid?: number },
  price: number,
  blockParts: number,
): Construction {
  const total = old.partsLeft + old.partsUsed;
  return {
    left: old.partsLeft,
    used: old.partsUsed,
    purse: old.purse ?? (total > 0 ? Math.round(price * (old.partsLeft / total)) : 0),
    blocks: old.blocks ?? Math.max(1, Math.ceil(old.partsLeft / blockParts)),
    paid: old.paid ?? 0,
  };
}
