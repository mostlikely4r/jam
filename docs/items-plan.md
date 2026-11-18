# Items plan

Written 2026-11-18, after the 183 fields were laid out and the user asked for variety. The fields
all give the same plain ore, and the game has only "ore" and "parts" as goods. This plan starts
the move to one kind of thing, the **item**, with the smallest chain that tests it: one new ore,
one new part, and the 360 tractor that needs it. Nothing here is built yet.

## Why

Today ore is one number everywhere (a ship's hold, a base's pile, a hauler's cargo, a rock's
yield), "parts" is another single number at each base, and modules are a third thing with their
own shapes. A reason to travel to different places (a special field, cheap parts near where they
are made, a specific module) needs goods that differ, and per-item stock at each base. Per-item
stock was already step 4 of `docs/shopping-trip-test.md`, and modules in lockers and bays
(`docs/inventory-plan.md`) already behave like items. This plan joins them.

## The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

**What an item is** (*decided*, the long-term model)

- There are no separate modules, ore and parts, only items. An item has a shape, can drop from
  asteroids, can float in space and be picked up, and needs space wherever it is kept (a ship's
  bay, a station, a hauler).
- An item can be crafted from other items (n in, m out), or into a hull, or be consumed by
  something. Some items can be put in a slot as a module and do something.
- Everything about an item is set in the **item designer**.

**Shape for the player, volume for everyone else** (*decided*)

- In the player's bay and locker an item is a shaped thing on a grid (the rules of
  `docs/inventory-plan.md` hold: it can turn, it has to stick, the entry stays open).
- Stations, haulers and (by design) traffic don't lay things out. Each holds a **count per item
  id** and looks at a new stat, **volume**, to see whether another one fits.
- Volume is its own stat, set in the item designer. It starts as the shape's area in cells
  (*proposal*), so every existing part behaves exactly as now until someone changes it.

**The first slice** (*decided*)

- **One new ore and one new part.** The 360 tractor (`tractorAll`) needs the new part, and the
  new part is made from the new ore.
- Haulers bound for a station that needs the new part carry some. Any station buys the new ore
  and passes it on to its hauler.
- **Plain ore stays as it is** (*decided*): a count, with its tuned rates, trip records and
  parity numbers. It moves onto items later, as its own step.

Working names here are **ore B** and **part B**. The user picks the real names, icons and
numbers in the item designer.

**Icons** (*decided*): an item's icon is what a part's is today (glyph, primary, secondary,
border, mark) plus a **glow** colour. The glow is for the item's look loose in the world.

**Fields** (*decided* as direction): a field has several item types with abundances, set in the
system designer. This slice builds one entry, the new ore, on one field.

### Where the chain runs (my proposal)

1. **Ore B drops** from rocks broken in one far field (one of Bulwark's two ring fields in the
   shipped layout; the designer decides) as a loose item. Only the player collects it: traffic,
   pirates and defenders don't pick up items.
2. The player flies through it to pick it up. It goes into the bay grid where it sticks.
3. At any dock the player sells it (the existing sell action). The station pays its price and
   keeps it in its store, taking its volume out of the station's storage.
4. The station's **hauler** buys ore B from that store when it loads, paying the item's price.
5. A world-level **hub** takes whatever items haulers carry off. It runs the recipe (n ore B
   becomes m part B) the moment ore B arrives. This is the same off-screen conversion that
   today's hauler already implies for parts, now written down as a recipe and counted.
6. A hauler arriving at a station that needs part B brings some from the hub's stock. A station
   needs it when it sells something whose recipe uses it and its own stock is under a target.
7. The station sells the 360 tractor only while it holds part B, and **spends one part B for
   each tractor sold**.

The hub's own starting stock and the stations' starting stock are the holes: both come from
nowhere. They're listed in the code where they sit, as the shopping-trip test did for
blueprints.

## What to build

One step, played at the end. It is large, so build it in this order, with the full suite green
after each.

### 1. The item data and the designer

- `src/items.json` (new): the items and the recipes. A new `src/items.ts` loads it and gives one
  lookup (`thingOf(id)`, name is the builder's call) that answers for a part or an item alike
  with its label, shape, volume, price and icon, so the grid, shop, loot, locker and stock code
  can take either.
- An **item** record: `id`, `name`, `shape {w,h}`, `volume`, `price`, `icon` (glyph, primary,
  secondary, border, mark, glow), and a short description. Items never wear. Item ids must not
  collide with a part id; a test checks it.
- A **recipe** record: `makes` (an item id or a part id), `from` (a list of `{item, n}`), and
  `yields` (m, default 1). Two recipes exist in this slice:
  - part B from n ore B, run by the hub;
  - `tractorAll` from 1 part B, run by a station at the moment of sale.
- The **item designer**: a new page in the dev hull designer (`src/designer/hulls.ts`, key H
  under `?dev`), beside Hulls, Parts and Mount types. It lists and edits items and recipes, with
  the same icon editor the Parts page has, plus the glow colour, volume and price. It writes
  `src/items.json`. Existing parts stay where they are in code; the page only adds items.
- `PartIcon` (in `src/parts.ts`) gets an optional `glow`. Only items use it; parts are
  unchanged.
- Stop treating the module's part id as only a part id: `Module.part` (`src/fitting.ts`),
  `Base.stock` and `Loot` take an **item id** that is either. The builder decides how wide to
  make `PartId`; the limit is that every current test passes unchanged.

### 2. Items in the world

- The field spec in the system designer (`src/designer/world.ts`, `WorldNode`) gets `drops`:
  a list of `{item, chance}`. Default none. The designer shows it as a small list on a field.
  `src/designer/link.ts` carries it into the sim's field spec.
- `breakRock` in `src/sim.ts`: after the plain ore rolls, for the field the rock sits in, roll
  each drop (chance per roll, the same number of rolls as plain ore) and push a `Loot` with the
  item at the rock's spot, with no fling. **Draw from the random stream only when the field has
  drops,** so every existing seeded test and the warm start stay identical.
- Loose items draw with their glow. `src/render.ts` already draws loot; add the glow there.
- Pickup is the existing loot pickup in `collectOre` (the player flies through, `holdSpotFor`
  finds a sticking spot, a full or blocked bay leaves it floating). Nothing new.
- Body pull and carrying already apply to loot.

### 3. Items at stations, the hauler and the shop

- `Base.stock` already counts whole modules per id, and `takeBack` and `sellItem` already sell
  an item from the bay or locker to the base. They now take any item: an item pays its `price`
  and is stored whole. A station with no room (its storage minus the locker rows and the stock,
  measured in **volume**) refuses the sale and says why.
- `storageUsed` and `storageFree` count volume, not cell count. Because volume defaults to the
  shape's area, nothing changes for current parts.
- `Hauler` (`src/sim.ts`) gets `items: Map<id, number>` next to `cargo` and `parts`, and a
  volume limit (`tuning.haulerVolume`, a new tuning value with a line in the tab menu). Plain
  ore and generic parts stay as they are.
  - **Loading:** at the berth it takes items the base holds that are *inputs of a recipe* (ore B
    here), paying their price, up to its volume. It runs inside the existing `loading` stage.
  - **Leaving:** the items it carries off move into `sim.hub`.
  - **Arriving:** it brings from `sim.hub` the items the base needs (see below), up to
    `tuning.haulerItemLoad`, as today's `haulerPartsLoad` does for generic parts.
- `sim.hub`: a `Map<id, number>`, saved. `feedHub()` runs every recipe whose inputs it has,
  right when items arrive.
- A base **needs** an item when some part or item it can sell has a recipe that uses it and
  its stock is under `tuning.itemTarget`. Which parts a base sells already follows its held
  blueprints (`Base.blueprints`).
- **Starting stock:** a station gets an `items` list in the designer (`{item, n}`), like its
  `blueprints`. The shipped layout gives the base that holds the 360 tractor a few part B.
- **The shop:** `canSupply` and `supply` (`src/sim.ts`) also require a part's recipe inputs in
  the base's stock, and `supply` spends them. A part that lacks them shows as locked in the shop
  (`src/shop.ts` already has lock badges), and its tooltip says what's missing. Buying never
  spends from the player's bay.
- **Traffic buys the same way:** the "what next" list respects `canSupply`, so no traffic ship
  gets a 360 tractor without part B in stock. Traffic doesn't carry or collect items.

### 4. Make it the shipped world

- Set the drop on the chosen field and the starting part B in `src/designer/recipes.ts` (the
  `full-system` recipe, or the one that holds the 360 tractor), then run
  `npm run layout -- full-system --ship`. Don't hand-edit `world.json`.
- `SAVE_VERSION` in `src/save.ts` goes up by one: hauler, hub and base stock change shape.
- Regenerate `src/start.json` (`npm run warm -- 60 1 --ship`). A test fails when `world.json`
  has moved on without a new start.

## Edge cases

- **A full bay or blocked entry:** the item stays loose and drifts, like any loot.
- **Sell with no room at the station:** refused, with the reason on the radio or the message
  line, never silently dropped.
- **Item left in a field that falls asleep:** it follows whatever loot does today. The builder
  checks that and notes the result in a "Built" section; it must not be duplicated or lost in a
  way the ledger test can see.
- **Ore B sitting in a station when no hauler wants it:** it stays in the store and counts
  against storage. That's fine.
- **The hauler arrives and the hub has none:** it brings none. The station's tractor stays
  locked until ore B has made the round trip.
- **Wear:** items never wear; the damaged and destroyed rules don't apply to them.
- **Out of view:** station and hauler item counts are plain numbers, so they run the same in
  view and out of view. Nothing here makes a trip record carry items.

## How we'll know it works

Tests (`npm test`, and `npm run build` must pass too):

- `src/items.test.ts`: `items.json` loads; ids are unique and don't collide with part ids; shapes
  and volumes are positive; every recipe names real items; volume defaults to the shape's area.
- Drops: a field with a drop of chance 1 yields the item when a rock breaks; a field without
  drops yields none; with no drops the random stream is untouched (the same seed gives the same
  game as before, which the current suite already proves).
- Pickup and sale: flying through an item puts it in the bay on a sticking spot; a full bay
  leaves it; selling it pays the price and puts it in the store; a full store refuses.
- Hauler: it loads ore B and pays for it; the hub turns n ore B into m part B; a hauler for a
  base that sells the 360 tractor and is low on part B brings part B; for a base with no such
  recipe it brings none; it never carries past its volume.
- Shop: the 360 tractor is locked without part B in stock; buying it spends one; traffic can't
  buy it without part B.
- Save: a save round-trips items, hauler cargo, hub and stock; an older save version still
  fails to load as it does today.
- **Conservation** (the ledger test): over 2 game hours and 4 seeds, ore B and part B counted
  across the bay, lockers, stations, haulers, the hub and loose in space, plus what recipes have
  made and spent, change only by the listed holes (starting stock).
- Designer: the Items page edits an item and a recipe, writes `src/items.json`, and reads it
  back unchanged, including the glow colour.
- The shipped-world tests (`start.json` matches `world.json`) pass after regenerating.

Try it in the game (`?dev` for the designer):

1. Open the item designer, name and draw ore B and part B, set prices and shapes.
2. Fly to the chosen far field and shoot rocks. Ore B should drop glowing and be picked up into
   the bay as a shaped item.
3. Dock, sell it, and check the station's store and credits.
4. Watch (or speed up time) until a hauler loads it, then until a hauler brings part B to the
   station that holds the 360 tractor.
5. Buy the tractor. Does the trip feel like a reason to go somewhere, and does packing a shaped
   item in the bay feel like a choice and not admin?

**The question this slice answers:** does a special ore in a far field give a reason to travel,
and does the chain (ore, part, module) read from what the player sees without any text?

**It fails if** the far field is just a longer commute for the same reward, or the chain is
invisible to the player. If it fails, the data model stays and the next step changes what the
items do, not how they're stored.

## Not doing

- **Plain ore stays a count.** Moving it onto items is a later, separate step (*decided*).
- **No processing place.** The hub's conversion is off-screen, as it already is for parts.
- **No tractor catching of loose items.** The beam still catches ore only; items are picked up
  by flying through them.
- **Traffic, pirates and defenders don't pick up or carry items** in this slice.
- **No tree editor, logistics planner or hull recipes.** The recipe list is a plain list, and
  its output is an item or a part, not a hull yet.
- **No new item beyond the two.** More types are content, added in the designer afterwards.
