# Dev tools plan

Written 2026-11-25, from two inbox notes (I-7, I-16) the user wrote while testing hulls and parts.
Both are tools for the user as designer and tester, not for players: the tab menu's Parts group
and the hull designer. Nothing here is built yet.

## 1. The tab menu's Parts group (I-7)

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

## 2. Rename hulls in the designer (I-16)

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
