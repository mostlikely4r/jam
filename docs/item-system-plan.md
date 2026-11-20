# Item system plan

Written 2026-11-19, the day after the items plan (`docs/items-plan.md`) was built. That plan
added ore B and part B as items with a shape, a volume and recipes, but left plain ore, the
station's "parts" number and the modules as they were. This plan finishes the job: **one generic
system for every item**, with plain ore, parts and modules all on it. Nothing here is built yet.

## Why

The game still has four kinds of goods that follow four sets of rules. Plain ore is a number
(`Ship.ore`, `Base.ore`, `Hauler.cargo`, `Deposit.ore`), loose in space as an `Ore` body and in
the bay as ore that flows like a liquid, with locked blocks (`ORE_BLOCK`). "Parts" is one number
per station (`Base.parts`) that pays for repairs, programs, projects, defenders, drones and any
module the station has none of in store. Modules are `PARTS` in `src/parts.ts`. Ore B and part B
are items. Every new good, and every reason to travel for one, has to pick which rules it
follows. One system means the next ore, part or module is just a new entry in the item designer.

## The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

**What an item is** (*decided*)

- One generic system for all items. Every item has a **type**: ore, part or module (more types
  may come later).
- Every item has an **x by y size** (ore B is 1x2) for the bay and locker grids, and a **volume**
  for storage without a grid (stations, haulers, deposits).
- **Recipes live on the item**, not in a list somewhere else: the items needed to make it, with
  numbers in and the number out.
- Every item has its own **blueprint price**, set in the item editor.
- **Ore items** are picked in a field as a drop chance.
- **Module items** are picked at the module: the module names its item. That item drops when the
  module drops, and slotting that item into a mount is that module.
- Recipes decide what a station imports, buys and stocks.

**Plain ore goes all the way** (*decided*)

- Every piece of plain ore is a 1x1 ore item. It floats loose, is picked up, and sits on the bay
  grid, placed with **the same auto-place as ore B**.
- One ore is one cell, so a full bay holds about as much plain ore as today.
- The loose, liquid ore in the bay and the lock and unlock actions go. Loose ore that bounces
  around inside the bay may come back as a later, separate step.

**Part A replaces the parts number** (*decided*)

- **Part A** is a 1x1 part item, made from plain ore at the hub. It replaces `Base.parts`.
- **Every module's recipe is part A, scaled to the module's price.** The 360 tractor
  (`tractorAll`) takes its part A plus the one part B it already needs.
- **Repairs take part A.**

**Programs leave the item system** (*decided*)

- Programs (spin stabilizer, retro, meters, click to move, route planner, click to turn, starmap,
  autopilot) are not items or modules. They get **their own records and their own designer
  page**, because they need different stats.
- A program costs a **flat credit price** and takes nothing from the station's stock.
- A program **stays with the player through death** (it already does: `bareHull` keeps
  `software`).

**Where crafting happens** (*decided*)

- **The hub** (off-screen, `sim.hub`) makes parts from ore. **A station** makes a module from its
  parts at the moment of sale, and repairs from part A.
- **The hauler buys every ore type** the station holds, whether anything needs it or not, and
  carries it off to the hub.
- **The hauler brings every part the station wants to stock** for the modules it sells, as far as
  the hub has them.
- **The hub's stock is infinite** for everything, for now.

**Station blueprints** (*decided*)

- Each station has **two multi-selects of module items** in the system designer:
  - **Blueprints unlocked:** it has them from the start and sells those modules.
  - **Blueprints wanted:** it buys them when it can afford them, the way it orders blueprints
    today.
- This replaces today's single "Holds the 360 tractor blueprint" checkbox.

**Dev tab** (*decided*)

- The tab menu's **Parts** checkboxes (modules and programs, "free for testing") and the
  **Thrusters** switches go. Equipping a thruster item does the same job the switch did.
- In their place: a **dropdown of every item with an "Add to bay" button**, and a **"Give money"
  button**.

**My proposals on the rest**

1. **The `held` flag on parts goes.** The two lists replace it: a module in no station's lists is
   sold nowhere.
2. **The player can fund only a blueprint the station wants.**
3. **Projects and drones stay as they are.** The deposit, the guard batteries and drones are
   blueprints but not items, so they stay outside the two lists and keep today's rules
   (`spec.projects`, `canOrder`).
4. **The tractor catches every ore item**, ore B included. Parts and modules are still picked up
   only by flying through them. Gun 1's flung ore and gun 2's freed ore are plain ore items.
5. **Traffic and AI miners collect ore items into their bays** with the same auto-place. Pirates,
   the pirate base and the black market take any ore item.
6. **The off-screen trip records** keep their shape. Ore a record mines goes into the ship's bay
   as items when the record arrives, not tick by tick.
7. **Prices.** An item's `price` is what a station pays the one who sells it. Every rate that is
   "per ore" today becomes a share of the ore item's price, with defaults that give plain ore
   exactly today's numbers:
   - plain ore's price is `creditsPerOre` (10), and that slider goes;
   - the hauler pays the station price x `haulerMarkup` (new, 1.5, in place of `haulerPrice`,
     15 / 10);
   - the black market pays price x `blackMarketShare` (new, 0.5, in place of
     `blackMarketPays`, 5 / 10).

   Ore B then sells to a hauler at 45, not 30, so stations make the same margin on it as on plain
   ore.
8. **Part A** costs 16 (today's `haulerPartPrice`, which goes). The hub makes 1 part A from
   2 plain ore. A module's part A count is `ceil(price x partPriceScale / serviceCreditsPerPart)`,
   at least 1. That is what the module costs the station today when it isn't in store.
9. **Services spend whole part A.** A repair, project, defender or drone that used
   `stockFor(credits)` parts now uses that many part A, rounded up. A station with too little part
   A can't do it and says so, as "out of parts" does today.
10. **Capacities counted in ore become volume:** `haulerCapacity`, `blackMarketCapacity`,
    `depositCapacity`, `pirateStartOre` and `stationStartOre` keep their numbers as volume.
11. The parity numbers get a new baseline, `SAVE_VERSION` goes up, and older saves fail to load as
    they do today.

## What to build

One spec, built in this order, with `npm test` and `npm run build` green after each step. Steps 1
and 2 must not change how the game plays. Step 3 is where plain ore changes.

### 1. The item model

- **Item record** in `src/items.json` (read by `src/items.ts`): `id`, `name`, `type`
  (`"ore" | "part" | "module"`), `description`, `shape {w,h}`, `volume` (defaults to the shape's
  area), `price`, `blueprintPrice`, `icon` (glyph, primary, secondary, border, mark, glow) and an
  optional `recipe`: `{ from: [{ item, n }], yields }` (yields defaults to 1).
- **Recipes move onto items.** The top-level `recipes` list in `items.json` goes. Ore B's
  recipe-less entry stays as it is; part B gets `recipe: { from: [{ item: "oreB", n: 2 }] }`.
  Where a recipe runs follows the item's type: a **part** is made at the hub, a **module** at a
  station at the moment of sale. An ore has no recipe.
- **Module items.** Each module in `PARTS` gets an `item` field naming its item. Generate one
  module item per module from its current values: the same shape, price, icon, description and
  a `blueprintPrice` of `price x blueprintScale` (then the `blueprintScale` slider goes). The
  item owns shape, volume, price, blueprint price, icon, description and recipe; the module keeps
  what makes it a module (kind, mounts it fits, stats, weight, tier, wear). Everything that
  stores, drops, sells or slots a module goes through the item. `thingOf(id)` and `volumeOf(id)`
  answer for every item.
- **Programs move out** of `PARTS` into their own records (`src/programs.json` or similar, the
  builder's call) with name, description, icon, price, tier and whatever stats they use. The
  ship's `software` and `programs`, the shop's program list, `TRAFFIC_BUY_ORDER`,
  `DRONE_BUY_ORDER` and the hull designer's "Default programs" point at them. Buying a program
  costs its price and nothing else: `chargeForService` no longer takes parts for it.
- **Decals stay parts.** They are looks only and never stored, dropped or sold.
- **Item designer** (the Items page in `src/designer/hulls.ts`): a type picker, the blueprint
  price, and the recipe edited on the item (a list of input items and counts, and the count out).
  The separate recipes section goes. The **Parts** page gets a picker for the module's item.
- **Program designer:** a new Programs page beside Hulls, Parts, Mount types and Items, writing
  the program records, with the same icon editor.
- A test checks that every module has exactly one module item, and that every module item is
  named by exactly one module.

### 2. Part A, the hub and station blueprints

- Add **part A** (`partA`, placeholder name "Part A", 1x1, price 16, recipe 2 plain ore → 1).
  Plain ore itself (`ore`, placeholder name "Ore", 1x1, price 10) is added here as an item too,
  so the module recipes can be written; step 3 moves the game onto it.
- **Every module item gets a recipe** of part A by proposal 8, and `tractorAll` also takes 1
  part B.
- **`Base.parts` goes.** Part A is counted in `Base.stock` like every other item. Every user of
  the parts number moves to part A: `chargeForService`, `hasStockFor`, `spendBaseParts`
  (defenders and drones), project building (`depositParts`, `stationGuardParts`,
  `depositGuardParts` count part A), repairs, and the shop's "out of parts" checks.
  `stationStartParts` becomes the starting part A.
- **The hub:** `sim.hub` keeps a count for each item but is infinite: every request is met. It
  still takes what haulers carry off, so the ledger can see it go.
- **What a station wants:** every part used in the recipe of a module it has unlocked, plus part A
  for repairs. It stocks part A toward `stationPartsTarget` and every other part toward
  `itemTarget`.
- **Hauler:**
  - *Arriving:* it brings each part the station wants, up to its target, paid at the item's
    price as part B is today (from the station's credits or this visit's earnings).
    `haulerPartsLoad` and `haulerItemLoad` go; `Hauler.parts` goes into `Hauler.items`.
  - *Loading:* it buys every **ore-type** item in the station's stock, needed or not, up to
    `haulerVolume`, paying price x `haulerMarkup`. (Plain ore joins in step 3.)
  - *Leaving:* what it carries goes into the hub.
- **Station blueprints:** `StationSpec.blueprints` becomes `unlocked` and `wanted`, two lists of
  module item ids, in `src/designer/world.ts` (`WorldNode`), carried by `src/designer/link.ts`. The
  system designer (`src/designer/designer.ts`) shows two multi-selects of every module item. A
  station orders only blueprints in `wanted` that it doesn't hold, at their `blueprintPrice`;
  `canOrder` and `fundBlueprint` check the list. Projects and drones keep today's rules. The
  `held` flag and `HELD_PARTS` go.
- **The shipped lists** go in `src/designer/recipes.ts`, set so the shipped world plays as now:
  each station's `unlocked` is what it can sell at the start today, `wanted` is every module it
  could order today, and `Planet base` has the 360 tractor unlocked.

### 3. Plain ore as an item

- **One loose body for every item.** `Ore` and `Loot` (`src/sim.ts`) become one body with an
  item id and a `count` (1 for nearly everything; a flung piece of ore carries
  `flingOreAmount`). `caughtBy` and `from` stay. Plain ore keeps its look (`kind` picks the rock
  look); other items draw as today's loot, with their glow.
- **Rocks:** `breakRock` drops plain ore items where it drops ore today, with the same random
  rolls in the same order, so seeded tests stay comparable. Field drops (`FieldSpec.drops`) work
  as they do now. Plain ore stays the default drop of every field; it isn't listed in `drops`.
- **Pickup:** an ore-type item is picked up the way ore is today (the tractor pulls it in, and
  touching it takes it, in `collectOre`); other items still by flying through. Every pickup puts
  the item in the bay with `holdSpotFor` / `autoPlace`. A piece with a count above 1 places as
  many as fit and stays loose with the rest. A full or blocked bay leaves it loose.
- **The tractor** (`tractorOn`) runs while an ore item would fit, and catches every ore-type item.
- **The ship's ore** is the ore items in its bay. `Ship.ore`, `oreBlocks`, `ORE_BLOCK`,
  `lockOre`, `unlockOre`, `lockedOre`, `pinnedOre`, `trimBlocks`, `oreRoom` and the loose-ore
  rule in `holdSpotFor` go, and so does `orePerCell`. A helper (`oreIn(ship)` or similar) counts
  ore items for the pilot, the HUD and the radio. `cargoSpace` becomes "how many 1x1 ore items
  still fit".
- **The inventory** (`src/inventory.ts`) shows ore items on the grid like any item. The loose-ore
  readout and the lock and unlock actions go.
- **Selling:** "sell ore" at a dock or deposit sells every ore-type item in the bay, each at its
  price. A deposit (`Deposit.ore`) and the station (`Base.ore`) keep a count for each item in a
  map, as `Base.stock` does. Buying ore from a deposit (`depositBuyable`) gives items into the
  bay by auto-place.
- **Traffic and AI** (`src/pilot.ts`): miners collect, carry and sell ore items as they do ore
  now, through the helper. Pirates, the pirate base (its ore for `stockFor`) and the black market
  take any ore-type item by volume.
- **Trip records** (`TripRecord`, `src/farside.ts`): a mining stop adds its yield to the ship's
  bay as plain ore items when the record arrives. Update the notes in `src/farside.ts` that talk
  about loose ore.
- **Death and wrecks:** everything in the bay, ore included, goes adrift as loose items, as
  modules do now.
- **Haulers** now load plain ore too, by the rule of step 2. `haulerCapacity` becomes the volume
  `haulerVolume` uses (one limit, not two).
- `creditsPerOre`, `haulerPrice` and `blackMarketPays` give way to the item price,
  `haulerMarkup` and `blackMarketShare` (proposal 7), with lines in the tab menu.

### 4. The dev tab

- In `src/main.ts`, the "Parts" group's per-module and per-program checkboxes and the
  "Thrusters" group's switches go, and so do `devSet` and the `thruster*` tuning switches
  (`canFire` no longer checks them).
- Add a dropdown of every item (by name) and an **Add to bay** button. It places one with
  `holdSpotFor`, and if there's no room it says so in the menu.
- Add a **Give money** button that adds a fixed sum (say 1000) to the player's credits.

### 5. Make it the shipped world

- Set the lists and starting stock in `src/designer/recipes.ts` and run
  `npm run layout -- full-system --ship`. Don't hand-edit `world.json`; run `npm run world` if the
  format changed.
- `SAVE_VERSION` in `src/save.ts` goes up by one.
- Regenerate `src/start.json` (`npm run warm -- 60 1 --ship`).
- Start `npm run parity` in the background on the finished commit and log the new baseline in
  `docs/parity-log.md`. It never gates done.

## Edge cases

- **Bay full or entry blocked:** ore stays loose and drifts, like any loot; the tractor stops
  pulling.
- **Ore splits the free space:** auto-place may leave a 2x2 module with no spot although enough
  cells are free. That's accepted; it's what ore B does. Note in *Built* whether it shows in play.
- **A flung piece worth 3 with room for 1:** one goes in, the piece stays loose worth 2.
- **A service the station can't cover:** with too little part A, a repair, project, defender or
  drone waits, and the player's request is refused with the reason, as "out of parts" is today.
- **A station whose unlocked modules use no part but part A:** it still stocks part A.
- **A wanted blueprint that's also unlocked:** unlocked wins; it's never ordered.
- **Station storage:** ore at a station now counts against its storage volume, as ore B does.
  Check that the shipped storage holds today's ore flow, and raise the defaults if not, noting it.
- **Infinite hub:** the hauler never arrives empty-handed. The ore → part recipes don't limit
  anything yet, but they're stored, shown and tested.
- **Programs at death:** kept, as now. A program never drops and is never a loose item.
- **Old saves:** fail to load as they do today.

## How we'll know it works

Tests (`npm test` and `npm run build` must pass):

- `src/items.test.ts`: every item has a type; ids don't collide with each other, with programs or
  with decals; shapes and volumes are positive; every recipe names real items; every module has
  exactly one module item and the other way round; a module item's recipe matches proposal 8;
  part B and the 360 tractor have their recipes.
- Programs: they load from their own file; buying one costs its price and leaves the station's
  part A alone; they survive death.
- Part A: a repair, a project, a defender and a drone each spend part A by the rule; a station
  short of part A refuses; buying a module with none in store spends its recipe.
- Blueprints: a station sells what's unlocked; orders only what's wanted; a player can't fund an
  unwanted one; the price is the item's `blueprintPrice`.
- Hauler: it buys every ore type, needed or not, up to its volume, at price x markup; it brings
  each wanted part up to its target; for a station that wants nothing but part A it brings only
  part A.
- Plain ore: a broken rock drops plain ore items; the tractor catches ore B and plain ore but not a
  module; picking up ore places it on a sticking spot; a full bay leaves it loose; a flung piece
  places as many as fit; selling pays each item's price; a traffic miner fills its bay with ore
  items and sells them; a trip record's yield lands in the bay on arrival.
- Prices: with the default tunings, plain ore pays exactly today's numbers at a dock, a hauler and
  the black market.
- Dev tab: adding an item puts it in the bay or says there's no room; giving money adds credits.
- Save: a save round-trips loose items, bay ore, station and deposit counts, hauler items and
  programs.
- **Conservation:** the item ledger (`sim.itemFlow`) now covers plain ore and part A too. Over
  2 game hours and 4 seeds, every item counted across bays, lockers, stations, deposits, haulers,
  pirates, the black market and loose in space changes only by drops, recipes, sales to and
  buys from the hub (the hub is a listed hole), and the listed starting stock.
- The shipped-world tests (`start.json` matches `world.json`) pass after regenerating.

Try it in the game (`?dev` for the designers):

1. Open the item designer: plain ore, part A, ore B, part B and a module each show their type,
   recipe and blueprint price. Open the Programs page.
2. Mine a near field. Does packing plain ore by auto-place feel like today's full bay, or like
   admin? Does the tractor still feel the same?
3. Fill the bay, then try to fly through a dropped module. Is the split free space a problem?
4. Sell at a dock, watch a hauler load ore and bring part A, then buy a module and get a repair.
5. Use the dev tab to add any item and give money, and check that a station lacking part B still
   shows the 360 tractor locked.
6. Speed up time for an hour. Do traffic and the stations' money look like they did before?

**The question this plan answers:** can every good in the game live in one item system without
the game losing its feel, so the next ore, part or module is only content?

**It fails if** packing common ore becomes admin, traffic slows the game down, or the station
economy drifts away from today's numbers. If it fails, the data model stays and the next step
changes how ore sits in the bay (the loose, bouncing ore), not how items are stored.

## Not doing

- **Loose, bouncing ore in the bay.** A later step (*decided*).
- **A finite hub.** It's infinite for now (*decided*); its recipes don't limit anything yet.
- **Stations making parts from ore themselves, or haulers trading between stations.** The hub
  split stays (*decided*).
- **Programs as items.** They have their own records (*decided*).
- **Placing each ore by hand.** Auto-place, as for ore B (*decided*).
- **Traffic, pirates or defenders picking up parts or modules.** Only ore items.
- **The tractor catching parts or modules.**
- **Decals as items, and projects or drones in the blueprint lists.**
- **The economy calculator** (`src/economy/`) stays as it is.
- **New items or new content.** Names, icons and numbers are placeholders for the item designer.

## Built

Built 2026-11-19, in the order above. `npm test` (619 tests) and `npm run build` pass, and the
shipped world, `src/start.json` and `SAVE_VERSION` (9) are regenerated. Not played yet: the
question this plan asks — whether packing common ore by auto-place feels the same — is still open.

What is there, and where it differs from the plan:

- **A module's item is the module.** The plan gave each module an `item` naming its item. Instead
  the item takes the module's own id: `items.json` has an entry per module with `type: "module"`,
  and everything in the game keys on one string. `partOf(id)` and `itemDef(id)` answer for it
  alike, and the item owns the module's name, description, shape, volume, price, blueprint price
  and icon, which `useItemsFile` lays over the module's record. So `Base.stock`, the bay, the
  locker, loot, recipes and the blueprint lists never had to learn a second id. A test checks the
  two sets are the same.
- **Recipes are on the item**: `ItemDef.recipe` is `{ from, yields }`, `ITEM_RECIPES` is gone, and
  `recipeFor`, `hubRecipes` and `saleRecipes` work them out when the file is read. Where one runs
  follows the type: a part at the hub, a module at the station that sells it.
- **Programs**: `src/programs.json` and `src/programs.ts`, with their own designer page. They
  still register as parts of kind `program`, so `software`, `programs`, the shop, the hull
  designer's default programs and both buy orders are the `PartId` lists they were. A program
  costs its price and nothing else (`chargeCredits`, not `chargeForService`).
- **Part A is whole, with a carry.** *Decided against proposal 9*: a service still costs a
  fraction of a part (2 credits of repair is a tenth of one at 20 credits a part), so it is not
  rounded up. `Base.parts` is gone; part A is counted in `Base.stock`, and each base holds
  `partCarry`, under one part, spending a whole part when the fraction adds up. `hasStockFor`
  counts the store plus the carry. That keeps today's rates: 100 hull points still cost ten
  parts. The alternative, a whole part up front for every service, would have made repairs and the
  rest dearer than they were.
- **A module is made by its recipe, and that is its cost.** `supply` used to take `price /
  serviceCreditsPerPart` parts *and* the recipe's inputs; now the recipe is the whole cost, so a
  bay (13 parts A) is charged 13, not 26.
- **Blueprints are lists.** `StationSpec.unlocked` and `.wanted` (module item ids) replace
  `blueprints` and the `held` flag; `HELD_PARTS` is gone. A module is sold only by a station whose
  `unlocked` holds it, and ordered only if it's in `wanted`: nobody can push one on a station. A
  station that says nothing sells no module, so a new station in the designer starts with none.
  Programs and the drone keep the old tier rule and the `stationUnlocks` switch.
- **The shipped lists**: every station sells every module but the all-round tractor, and `Planet
  base` sells that too, as the one that held its blueprint. `wanted` is empty everywhere, because
  with `stationUnlocks` off nothing could be ordered today. `listEveryStation` in `recipes.ts` is
  what gave the home station a list, which came from a world from before the lists existed.
- **News** is now word of a module only one base sells (the tractor), rather than of a held part.
- **Prices**: as proposed. `haulerMarkup` 1.5 and `blackMarketShare` 0.5 replace `haulerPrice` and
  `blackMarketPays`; plain ore's price is the item's, 10, and `creditsPerOre` is gone. Deposits
  keep their own `depositPays` and `depositSells` rather than the item's price: they are a cheap
  outlet either way, and both at the item's price would leave them no margin at all.
- **The hauler carries items only.** `Hauler.cargo`, `haulerCapacity`, `haulerItemLoad`,
  `haulerPartsLoad` and `haulerPartPrice` are gone: ore, parts A and everything else are items in
  one `items` map, and `haulerVolume` (raised from 40 to 120, so a station's whole stock of parts A
  comes in one visit) is the one limit besides the targets. It loads every ore in the station's
  ore store and stock, and brings the parts the station's unlocked recipes want, part A included.
- **Loose things**: `Ore` and `Loot` are one `Loose` body (`item`, `wear`, `count`, `kind`,
  `from`, `caughtBy`). They still sit in two lists, `ores` and `loot`, split by whether the item is
  an ore: that keeps the tractor, the lead-on-touch rule and the drawing of each simple.
- **A bay's entry row takes ore.** A part or a module never sits on the way in, but a piece of ore
  does, so a small bay still holds ten of them, as it did. `cargoSpace` is the cells reachable from
  the entry; `bayTotal` is the grid.
- **Storage counts ore**: `storageUsed` adds the ore waiting for the hauler. `stationStorage` went
  from 200 to 300 to leave room for a station holding its 100 parts A and its ore: the shipped
  stations sat at 156 to 160 of 200 before the change.
- **Kept on purpose**: `devSet` (many tests fit a part with it, and it's the same free hand the dev
  tab had), `Base.ore` as its own store apart from `Base.stock`, and `pirateOre` as a map of ore.
- **Parity** ran on the finished tree (8 seeds × 60 minutes, 44 minutes): its new baseline is in
  `docs/parity-log.md`, with three lines marked to check — traffic hits taken, defender hits taken
  and base ore — as the baseline before it had four of its own. Base ore is the one this plan
  could have moved: the records side leaves more ore waiting at the bases than the flown side.
- **The ledger** (`itemFlow`) counts plain ore too: a rock that breaks, a shot that frees ore and a
  record's mining count it in; ore forgotten far from everything, or burned on a body, counts it
  out; the hub counts what it makes from nothing.
