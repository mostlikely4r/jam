# Dev tools plan

Written 2026-11-25, from two inbox notes (I-7, I-16) the user wrote while testing hulls and parts.
Both are tools for the user as designer and tester, not for players: the tab menu's Parts group
and the hull designer. Both are built (2026-11-25), as noted under each.

## 1. The tab menu's Parts group (I-7) (*built* 2026-11-25)

*Decided* (the note): "In the parts tab/cheat menu should be an option to add programs (like
parts), an option to switch hull and a checkbox to allow fitting outside of station docks."

Today the Parts group (`src/main.ts:1325`) has "Add to bay" for any item and "Give money".

- **Add a program.** A second picker listing every program (`PROGRAMS`, `src/programs.ts`) and a
  "Give program" button. It calls the existing `Sim.devSet(ship, id, true)` (`sim.ts:4812`),
  which already gives a program and fits a navigation computer if the one fitted is full. The
  program is loaded if there's a slot, owned either way.
- **Switch hull.** A picker of every hull (`SHIP_MODELS`, named with `hullName`) and a "Switch"
  button. Free, anywhere, the shop's list ignored. It does what `Sim.buyHull` (`sim.ts:4377`) does
  after the money: the plan's carry-over of fitted parts and cargo (`planHull`'s `fit`, `hold`,
  `tankFuel`), the new hull's decals, hull points and programs trimmed. Proposal: split
  `buyHull` into the charge and a `changeHull(ship, model, plan)` that both call, and give
  `planHull` a `free` flag that skips the dock, list and credit checks. What the plan would send to
  the locker goes to the bay if it fits there and is dropped in space beside the ship if not
  (proposal: a dev tool shouldn't need a dock).
- **Fit anywhere.** A checkbox, a tuning switch `fitAnywhere` (default off, saved with the tuning
  like the others). On, the ship screen's fitting works in flight: fitting from the bay onto a
  mount, taking a part off into the bay, and loading or unloading programs. What comes off goes
  into the bay; with no room there the fit is refused, as in a dock with a full locker. The
  locker and the shop stay dock-only: they belong to a station. The gates are `this.docked` in
  `src/inventory.ts` (`actionsFor`, the drop rules, `programHandle`) and `atShop`/`baseAt` in
  `Sim.setProgram` (`sim.ts:4167`), `fitItemNow` (`sim.ts:4557`) and `toHold`; each checks
  "docked, or `fitAnywhere`" instead.

**Check:** tests that with `fitAnywhere` on a bay part fits in flight and the part it replaces
lands in the bay; off, the same call is refused. A test that the free hull switch keeps the
fitted parts that fit the new hull.

As built, all of it as proposed:

- The program picker lists `PROGRAM_PARTS` (the programs as parts) rather than `PROGRAMS`: it
  gives each one its label and id, which is what `devSet` takes.
- `Sim.fitsHere(ship)` is the one gate: a dock, or `fitAnywhere` for the player's own ship only,
  so turning the switch on never changes how traffic and pilots fit.
- Hull switching: `planHull(…, free = true)` skips the dock, the list and the money, and returns a
  `dropped` list for what the locker and the new bay both refuse; `buyHull` and the dev panel's
  `devChangeHull` both end in a shared `changeHull`, which sets what has nowhere to go adrift
  with `setAdrift` (the same rule a bay spill already uses in flight). The player's cargo is
  still refused when the new bay can't take it: ore isn't dropped overboard.
- `Inventory` has a `fits` getter for the screen's fitting, keeping the locker column, the shop
  drop target and every Sell button on `docked`.
- The tests are `src/devtools.test.ts`.

## 2. Rename hulls in the designer (I-16) (*built* 2026-11-25)

*Decided* (the note): "It should be possible to rename hulls in the designer."

Today a hull's name is made from its id (`hullName`, `src/fitting.ts:495`): `racer` reads
"Racer". The id is in saves (`ship.model`), in `src/designer/world.json` (each station's hull
list), in `src/start.json`, and in the code itself (`model === "floater"` and `"racer"`, seven
places).

**A name beside the id** (proposal). A hull gets an optional `name` in `src/hulls.json`, beside its
mounts and stats. `hullName(model)` returns it when it is set, and builds one from the id as today
when it isn't. The designer's hull page gets a "Name" text field at the top; empty means "from
the id". The id never changes, so no save, world file or code needs to follow it.

**Copies:** the designer's "New hull (copy of this one)" (`designer/hulls.ts:2279`) makes ids like
`racerCopy2`, shown as "Racer Copy2". That stays (proposal); the Name field is how a copy gets a
real name, which is the case the note is about.

**Check:** a test that `hullName` returns the saved name and falls back to the id's words; the
designer's hull list sorts by the shown name (it already sorts by `hullName`).

As built: the name lives in `hullInfo` (`HullInfo.name`), so the designer's save writes it with
nothing new to the file's shape; `hullIdName` is the old body of `hullName`, kept for the
field's placeholder and the fallback. A copy of a hull drops the name, so two hulls never share
one: a copy shows its id's words until it's renamed. No shipped hull has a name, so nothing
reads differently until one is given one.

## How we'll know

- The checks above, `npm test` and `npm run build` (the editor-boundary check in the build covers
  the designer's imports).
- **Try it:** open the tab menu, Parts: give yourself Auto-mine, switch to another hull, tick "Fit
  anywhere" and move a part from the bay onto a mount far from any station. Then, in the designer,
  rename a hull: the new name shows in the designer's list, the shop and the start menu.

## Needs first

Nothing: hull buying (Q-18) and the designer's hull pages are built.

## Not in this build

- Changing a hull's id: only needed if ids ever show to players, and they don't.
- A cheat for station stock or blueprints.
- A hull picker that marks which hull you fly: the list's current value is the one flown, which
  is enough for a tool.
