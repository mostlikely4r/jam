# Blueprints for programs and hulls plan

Written 2026-11-25, from an inbox note (I-12). Nothing here is built yet.

## Why

The note (*decided*, the user's own words): "Programs and hulls should have blueprints which
station can 'want' or 'have unlocked'."

Today the three kinds of thing a station sells work three ways:

- **Modules** have the full model. A station spec (`src/designer/world.json`, edited in the world
  designer) lists the modules it starts with `unlocked` and the ones it `wanted`. A wanted one's
  blueprint can be funded, by the player in the shop (`Sim.fundBlueprint`, `sim.ts:2990`) or by
  the station from its own credits (`blueprintQueue`); once paid it is on order, and the next
  hauler brings it (`deliverBlueprints`, `sim.ts:3010`). From then on the station makes and sells
  it. Its price is the item's `blueprintPrice`.
- **Programs** follow a station's `programs` list (every program when it has none). With the
  `stationUnlocks` switch on (off by default, `tuning.ts:173`) a program above tier 0 needs a
  blueprint too, bought the same way, but there is no "wanted": any program on the list can be
  funded.
- **Hulls** follow a station's `hulls` list (Q-18, hull buying), and nothing more. A station can
  never come to sell a new hull.

The note asks for one model for all three. It feeds two of the vision's threads: the shopping
journey (items missing from most shops, so a far station's hull is worth the trip) and "your work
becomes something" (a station you fund comes to sell what you paid for).

## The picture

- **One model** (*decided*, the note): for programs and hulls as for modules, a station has
  blueprints it has unlocked (it sells those) and blueprints it wants (it can be funded toward
  them). Anything in neither isn't shown in its shop.
- **The station lists move over** (proposal): today's `programs` list becomes the programs it
  starts with unlocked; today's `hulls` list, the hulls. Each gets a `wanted` list beside it:
  `wantedPrograms` and `wantedHulls` in the station spec (proposal for the names). The world
  designer's station page gets the two new lists, as it has for modules (`designer.ts:772`).
- **A station with no program list keeps selling every program** (proposal), as today, so the
  stations nobody has set up keep working.
- **Tiers stop gating programs** (proposal): with "wanted" there, the `stationUnlocks` tier rule
  for programs is redundant. A program's blueprint price stays 75% of its price
  (`BLUEPRINT_SHARE`).
- **A hull's blueprint price** (proposal): a new `blueprintPrice` stat on the hull (designer, hull
  page, beside price), defaulting to the hull's price × 1.5, so funding a hull at a station is a
  saving-up goal, not an impulse.
- **Same funding, same delivery** (proposal): the player funds in the shop, the station may fund
  from its own credits (the hull last: proposal, only once it has every wanted module and
  program), and the next hauler brings it. The radio says so, as for modules.
- **Saves**: a station's unlocked and wanted sets for programs and hulls go into its saved state
  beside `blueprints` and `wanted`. Bump `SAVE_VERSION`.

## The build

### 1. Hulls

Hull blueprints: unlocked and wanted hull lists, the shop's hull rows showing a wanted hull with
"fund" like a module's blueprint row, delivery by hauler, the world designer's lists. A test
world puts one wanted hull at Planet base.

Stop here for the user to try: fund a hull at a station and fly it once the hauler has been.

### 2. Programs

The same for programs: the old list read as unlocked, the wanted list, tiers no longer gating.

## How we'll know

- Tests in `src/hullbuy.test.ts` and `src/shop.test.ts`: a wanted hull isn't for sale, can be
  funded, arrives with the next hauler and is then for sale; a hull neither unlocked nor wanted
  isn't listed. The same for a program. A station with no program list sells every program.
  A save holds a funded-but-undelivered hull blueprint.
- `npm run parity` (background, logged): stations' own funding changes their spending, so the
  no-player economy numbers move; read the log, it doesn't gate.
- `npm test` and `npm run build`.
- **Try it:** at Planet base, the shop shows a hull you can't buy yet, with "fund". Give yourself
  money from the tab menu, fund it, undock and wait for the hauler to dock and leave. Dock again:
  the hull is for sale.

## Needs first

Hull buying (Q-18, built). The pricing plan (Q-23) changes prices but not this model; whichever
lands second routes the blueprint price through `price()`.

## Not in this build

- Blueprints a player owns and carries (the "software is yours" idea for programs): a different
  thing from a station's unlocks.
- Stations wanting things because of what the player does (S-27, shop unlocks as haulers buy ore).
