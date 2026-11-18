import type { Module } from "./fitting";
import { shapeOf, type Cell, type Shape } from "./parts";

export type { Cell, Shape };

/** A grid: a bay has an entry cell on its edge (and the sticking rule); a locker has none. */
export interface GridSpec { w: number; h: number; entry?: Cell }
/** An item placed on a grid: its top-left cell, and whether it's turned 90°. */
export interface Placed { module: Module; x: number; y: number; turned: boolean }

/** The width and height an item takes up, swapped when it is turned. */
export function footprint(item: { module: Module; turned: boolean }): Shape {
  const { w, h } = shapeOf(item.module.part);
  return item.turned ? { w: h, h: w } : { w, h };
}

/** Every cell an item covers, row by row from the top left. */
export function cellsOf(item: Placed): Cell[] {
  const { w, h } = footprint(item);
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push({ x: item.x + x, y: item.y + y });
  return cells;
}

/** True when the item lies inside the grid and overlaps none of the other items. */
export function fits(grid: GridSpec, items: Placed[], item: Placed): boolean {
  const taken = new Set<number>();
  for (const other of items) if (other !== item) for (const c of cellsOf(other)) taken.add(c.y * grid.w + c.x);
  return cellsOf(item).every((c) => c.x >= 0 && c.y >= 0 && c.x < grid.w && c.y < grid.h && !taken.has(c.y * grid.w + c.x));
}

const touchesWall = (grid: GridSpec, item: Placed) =>
  cellsOf(item).some((c) => c.x === 0 || c.y === 0 || c.x === grid.w - 1 || c.y === grid.h - 1);

const touchesEdge = (a: Placed, b: Placed) =>
  cellsOf(a).some((p) => cellsOf(b).some((q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1));

/** The items held up by a wall, directly or through a chain of neighbours. */
function supportedItems(grid: GridSpec, items: Placed[]): Set<Placed> {
  const supported = new Set(items.filter((i) => touchesWall(grid, i)));
  const queue = [...supported];
  for (let cur = queue.pop(); cur; cur = queue.pop()) {
    for (const other of items) {
      if (!supported.has(other) && touchesEdge(cur, other)) {
        supported.add(other);
        queue.push(other);
      }
    }
  }
  return supported;
}

/** True when the item would be held up by a wall or by items that are (always true without an entry). */
export function sticks(grid: GridSpec, items: Placed[], item: Placed): boolean {
  if (!grid.entry) return true;
  return supportedItems(grid, items.includes(item) ? items : [...items, item]).has(item);
}

/** True when the item fits and, in a bay, would stick. */
export function canPlace(grid: GridSpec, items: Placed[], item: Placed): boolean {
  return fits(grid, items, item) && sticks(grid, items, item);
}

/** The items that would be left hanging if this one were taken out (none without an entry). */
export function floatsAfterRemoval(grid: GridSpec, items: Placed[], item: Placed): Placed[] {
  if (!grid.entry) return [];
  const rest = items.filter((i) => i !== item);
  const supported = supportedItems(grid, rest);
  return rest.filter((i) => !supported.has(i));
}

/** How many cells the items cover in total. */
export function usedCells(items: Placed[]): number {
  return items.reduce((sum, i) => sum + cellsOf(i).length, 0);
}

/** How many free cells ore can reach from the entry (every free cell in a locker). */
export function reachableCells(grid: GridSpec, items: Placed[]): number {
  const taken = new Set<number>();
  for (const i of items) for (const c of cellsOf(i)) taken.add(c.y * grid.w + c.x);
  if (!grid.entry) return grid.w * grid.h - taken.size;
  const key = (c: Cell) => c.y * grid.w + c.x;
  if (taken.has(key(grid.entry))) return 0;
  const seen = new Set([key(grid.entry)]);
  const queue: Cell[] = [grid.entry];
  for (let cur = queue.pop(); cur; cur = queue.pop()) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: cur.x + dx, y: cur.y + dy };
      if (n.x < 0 || n.y < 0 || n.x >= grid.w || n.y >= grid.h) continue;
      if (taken.has(key(n)) || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return seen.size;
}

/** Finds a spot for a new item: in a bay the one that keeps the most room reachable, in a locker the first free one. */
export function autoPlace(grid: GridSpec, items: Placed[], module: Module): Placed | null {
  const { w, h } = shapeOf(module.part);
  const entry = grid.entry;
  let best: Placed | null = null;
  let bestReach = -1;
  let bestFar = -1;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      for (const turned of w === h ? [false] : [false, true]) {
        const spot: Placed = { module, x, y, turned };
        if (!canPlace(grid, items, spot)) continue;
        const cells = cellsOf(spot);
        if (!entry) return spot;
        if (cells.some((c) => c.x === entry.x && c.y === entry.y)) continue;
        const reach = reachableCells(grid, [...items, spot]);
        const far = Math.min(...cells.map((c) => Math.abs(c.x - entry.x) + Math.abs(c.y - entry.y)));
        // Scan order is already y, x, unturned first, so only a strict improvement replaces the best.
        if (reach > bestReach || (reach === bestReach && far > bestFar)) {
          best = spot;
          bestReach = reach;
          bestFar = far;
        }
      }
    }
  }
  return best;
}
