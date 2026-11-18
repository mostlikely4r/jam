# Inventory plan

Written 2026-11-18. The fitting plan (`docs/fitting-plan.md`) made parts into counted modules
on mounts, in the bay and in lockers, but the screens still treat them as lists: a part is
something you have or don't, and the bay is one number shared by ore and modules. This plan
makes them real things in real places: storage you can see as grids, a blueprint of the ship to
fit onto, and items with a shape that take up space. Steps 1 and 2 are built (2026-11-18).
Steps 3 and 4 are not built yet.

## The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

**Items**

- **Items have a shape on a grid, Diablo-style** (*decided*): a gun might be 1×2, a tractor
  2×2. Each part's shape is **its own, set per part** (*decided*), not worked out from the
  mount it fits, because one part can fit several mount types.
- **Items rotate in 90° steps** (*decided*): R while dragging. Nothing finer.
- Each item stays one `Module` with its own wear, as now. Items of the same kind never stack.
  Only ore stacks (mine).
- Programs aren't items. They stay software the pilot owns, loaded into computer slots, and
  never take up grid space.

**The ship's bay**

- **The bay is a grid with an entry edge of one cell** (*decided*). Everything that comes in
  during flight comes through it.
- **Items must stick** (*decided*). Nothing floats free. My rule for what sticking means: an
  item touches a wall of the bay, or touches an item that is (through a chain of others)
  touching a wall.
- **No ore can enter if the entry cell is blocked** (*decided*). Ore **bounces only in the free
  space** (*decided*): in flight the lumps in the bay's box (`src/cargoBin.ts`) stay out of
  cells that items take, and the items are drawn in the box.
- **Pockets** (mine): ore reaches only free cells connected to the entry cell. A pocket that
  items have sealed off stays empty.
- **Ore room is a number** (mine): reachable free cells × `orePerCell`. The bouncing is only
  for show, so the same bay gives the same room on every run. An empty bay of each kind
  should hold about what it holds today (small bay 10, bay 20, large bay 50).
- **Removing an item that would leave another floating is refused** (mine). The screen says
  which item would float.
- **Items only move while docked**, as now (mine, unchanged). At a dock you can reach the whole
  bay, so the entry cell only limits ore in flight.

**Lockers**

- **A locker at each base, rented and able to grow** (*decided*). Each base gives a small locker
  for free and sells more space, one of the slow, long-term savings goals.
- **Lockers take up the station's own storage** (*decided*). A base has a storage size, and
  every locker cell it rents out is space it can't stock goods in. Later, letting the space out
  could be a station owner's choice (*decided* as a direction, not built now).
- Lockers are plain grids with no entry cell and no sticking rule (mine). A locker is a room,
  not a box in flight, and moving house shouldn't be fiddly.
- Extra space is bought once and kept, in steps of one row (mine). There's no rent you keep
  paying.
- Station storage is a plain number of cells (mine). Only the player's locker is shown as a grid.

**Buying and selling**

- **A buy never swaps** (*decided*, "WoW style"). The bought item goes to the first place in
  this list:
  1. an empty mount it's allowed on,
  2. the cargo bay,
  3. the locker at this base,
  4. otherwise the buy is refused with an error that says why ("no room on the ship or in
     your locker").

  Auto-placing in the bay follows the bay's rules (mine): a spot that sticks and leaves the
  entry cell reachable. If the only legal spot would block the entry, skip the bay. Upgrading
  is then buy, then swap on the blueprint.
- **The shop no longer opens when you dock** (*decided*). While docked, a hint shows its key.
  B is free (mine).
- **Drag and drop from the shop is an alternative to click-buy** (*decided*). Dragging a shop
  item onto a mount, a bay cell or a locker cell buys it straight into that spot, if the spot
  is legal.
- Selling (mine): drag an item onto the shop, or click it and use Sell. Every drag has a click
  alternative: clicking an item selects it and shows its buttons (Sell, To bay, To locker, Fit).

**The blueprint screen**

- The ship screen (I) becomes a blueprint: the hull drawn large in its vector art, with each
  mount from `src/hulls.json` drawn as a port, Starsector-style, and the fitted part on it.
  Damaged and destroyed parts show it.
- While dragging, every mount the item is allowed on lights up, and every other mount is dimmed.
- Dropping onto a filled mount swaps: the old part goes to where the new one came from, if it
  fits there. Otherwise the drop is refused (mine).
- The computer's program slots show as a row of slots beside the blueprint, with the pilot's
  programs next to them. Click or drag to load and unload.
- The bay grid sits beside the blueprint, and the locker grid (L) beside that when docked. A
  small button in the shop opens both, as now.

## The question

**Do grids and a blueprint make your stuff feel like things you own and place, and does the
bay's entry cell make packing a small, real choice instead of a chore?**

**It fails if** packing the bay feels like admin, or the screens are slower than today's lists
for a simple buy. If it fails, keep the shapes and the WoW-style buy, and auto-pack the bay.

## The build

Each step is played before the next starts. Every step keeps `npm test` and `npm run build`
green.

### 1. Shapes and grids in the sim

- `src/parts.ts`: replace each part's `size` (ore units) with a shape `{ w, h }` in cells. Bay
  parts (`cargo` today: 10, 20, 50) get a grid `{ w, h }` and an entry cell on one edge instead
  of `cargo`. New tuning value `orePerCell` in `src/tuning.ts`.
- A grid model, new file `src/grid.ts`, holding placed items `{ module, x, y, turned }`: fits,
  overlap, sticks, floats-after-removal, reachable free cells from the entry, and auto-place
  (sticking, keeping the entry reachable). Pure functions, unit tested.
- `src/sim.ts`: `ship.hold` becomes a placed grid. `cargoSpace`, `bayTotal`, `holdSize` and
  `hasRoomFor` work from reachable cells. Tractor and pickup see zero room when the entry is
  blocked. `ItemPlace` gains a cell and turn for the bay and locker.
- Swapping bays carries the contents across. What doesn't fit goes to the locker, and if that's
  full too, the swap is refused (mine).
- AI ships keep today's behaviour: they swap on buy and sell the old part to the base. They
  never hold items in the bay, so for them the bay is just its full ore room (mine).
- The hull designer (`src/designer/hulls.ts`) edits shapes in place of the size stat, and bay
  grids with their entry cell.

*Tests:* a bay's room drops by exactly the cells an item takes, but only those reachable from
the entry; a blocked entry gives zero room and the tractor lets go; an item that doesn't touch
a wall or a chain to one is refused; removing a supporting item is refused; rotation swaps w
and h.

**Built 2026-11-18.** Where it differs from the above, or settles what the plan left open:

- `orePerCell` is 1, and the bay grids keep today's room exactly: small bay 5×2, bay 5×4,
  large bay 10×5, each with its entry at the top middle. So AI ships carry what they did.
- Shapes as shipped: turning thrusters and computers 1×1; guns, reverse and strafe 1×2;
  tractors, turret and main thrusters 2×2; bays as items 2×2, 2×3 and 3×4.
- Auto-place in a bay picks the spot that leaves the most room reachable from the entry, then
  the one farthest from the entry. In a locker it takes the first free spot from the top left.
  `src/grid.ts`, tested in `src/grid.test.ts`.
- Placing by hand doesn't use a cell on `ItemPlace`. `toHold` takes an optional `Spot`
  (cell and turn) instead, and moves an item within the bay when it comes from the bay. The
  locker is still a plain list until step 2.
- A bay can't take an item where the ore already aboard would no longer fit.
- When a bay changes, its contents stay put if they still fit and stick. Otherwise they're packed
  again, biggest first, and what won't go in goes to the locker, which has no limit until step 2.
  A bay destroyed in flight lets its items drift out. Removing an item that would leave
  another floating is refused, and `floatingWithout` names the item that would float.
- The save format changed in this step, not in step 2: `SAVE_VERSION` is 4, and `src/start.json`
  was made again.
- The ship screen is still a list. It shows each bay item's cell, and the ore room as
  reachable room. The grid screens are step 4.
- The hull designer edits a part's cells across and down, and a bay's grid and entry cell. An
  entry that isn't on an edge is moved to the nearest edge.

### 2. Lockers with a size, station storage

- `Base` gets `storage` (cells) set by the layout. Lockers come out of it.
- The locker in `sim.lockers` becomes a placed grid with a width and a row count. A free
  starting size (tuning `lockerFreeRows`), plus `buyLockerRow` at `lockerRowPrice`, refused
  when the base's storage has no room.
- The base's own store of whole modules (`stock`) counts against storage too. A module sold
  to a full base is broken down into parts, as damaged ones are today. Ore and the `parts`
  count stay outside storage for now.
- Save format changes: bump `SAVE_VERSION` in `src/save.ts`. Old saves start fresh.
  Regenerate `src/start.json` (`npm run warm -- 60 1 --ship`).

*Tests:* the free locker size; buying a row costs credits and base storage; a full base refuses
a row; selling a whole module to a full base breaks it down.

**Built 2026-11-18.** Where it differs from the above, or settles what the plan left open:

- Tuning: `stationStorage` 200 cells (the first base), `lockerWidth` 6, `lockerFreeRows` 2,
  `lockerRowPrice` 500. Every other station's storage is set in the world designer, 200 by
  default.
- A base's free locker counts against its storage from the start, even before the player
  opens it. A row can only be bought while docked there.
- A module stored by a base takes its shape's cells.
- When a change needs room in the locker and there isn't any, the whole change is undone and
  refused: a buy that swaps (until step 3), fitting from the bay or locker, or moving or selling
  something off a mount. This was step 1's "the swap is refused".
- `toLocker` takes an optional spot too, and moves an item within the locker. The ship
  screen's locker list shows each item's cell, the cells taken, the station's free storage and
  a button to buy a row.
- `SAVE_VERSION` is 5, and `src/start.json` was made again.

### 3. WoW-style buying and the shop key

- `buyPart` for the player: empty allowed mount, then bay (auto-place), then locker, then
  refuse with a reason the shop shows. `equip`/`stow` no longer swap for the player.
- The shop panel in `src/main.ts` stays hidden on docking. B opens and closes it while docked,
  and a hint line shows "B: shop" while docked and it's closed. The button that opens ship and
  locker stays.
- Drag from a shop line onto a mount, bay cell or locker cell buys into that spot.
- The R key restarts the game under `?dev`. While a drag is held, R rotates and must not
  restart.

*Tests:* each fall-through of the buy order; a full ship and full locker refuse with the
reason; the buy never removes a fitted part.

*Try in game:* dock and see the hint, not the shop. Buy gun 2 with gun 1 fitted, and it lands
in the bay. Fill the bay and buy again, and it lands in the locker.

### 4. The blueprint and grid screens

- `src/inventory.ts` is rewritten: the blueprint (hull and ports, drawn with `src/shipArt.ts`),
  the bay grid with its entry cell marked, the locker grid, and program slots.
- Drag with rotation, legal drops highlighted, refused drops snap back with the reason. A click
  alternative for every drag.
- In flight the screens only show, as now.
- In flight the bay's box draws items as shapes, and `src/cargoBin.ts` keeps lumps out of their
  cells.

*Try in game:* move your stuff to Planet base. Pack the bay so the entry gets blocked, undock,
and see that no ore comes in. Seal off a pocket and see it stay empty.

## Not doing

- **Swapping on buy for the player.** It was today's behaviour. The buy order above replaces
  it on purpose.
- **Physics deciding ore capacity.** Lumps are only for show.
- **Rotation finer than 90°, or free placement off the grid.**
- **Entry and sticking rules in lockers.**
- **Rent you keep paying.** Locker space is bought once.
- **Stacking items.** Only ore stacks.

## What could grow out of scope

- **The drag code.** Keep it to one drag model shared by the shop, blueprint, bay and locker.
- **Ore types.** There's one ore today. A mixed pile of types in the bay is a later question,
  as is how goods flow.
- **Station storage.** It only limits lockers and the module store here. Capping ore and parts
  is the economy's job, not this plan's.
