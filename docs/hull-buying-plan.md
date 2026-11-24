# Hull buying plan

Written 2026-11-24. Third of five plans from one talk about reworking the hull designer (see
`docs/designer-comforts-plan.md` for the list). Nothing here is built yet.

## Why

The user wants hulls to be things you buy at stations: "replace first, store later". Today you
pick a hull only when starting a new game (`spawns` on a place, from `SHIP_CHOICES`), and a
shipyard only rebuilds the one you lost. The hull price already exists (`hullInfo.price`, else
the tuning's `rebuildCost`, through `Sim.hullPrice`), so the game side is small. It also fits the
game's habit of letting things be found: a new hull at a far station is a discovery.

## The picture

Items marked *decided* are the user's calls; the rest is my proposal, open to veto.

- **Each station picks what it sells** (*decided*): its items, programs and hulls, each a
  multi-select list in the world designer (`src/designer/designer.ts`, the station section,
  using the multi-select from the comforts plan). Which station sells what is system design work
  done there, not a rule in code.
  - Modules already work this way: `unlocked` is "the modules it starts able to sell".
  - Hulls: a new `hulls` list on the station. A hull is simply on the list and for sale
    (*decided*); stations building hulls from parts comes later.
  - Programs and items: proposal, a list each that starts filled with what the station sells
    today, so loading the current world changes nothing. Program blueprints a station buys later
    still add to what it sells, as they do now.
- **Buying replaces your hull** (*decided*). You can't keep the old one yet ("store later").
- **Trade-in at the full price** (*decided*): you get back what the old hull costs bare at this
  station (`hullPrice` of the old model). The shop shows the net price: new minus trade-in.
- **Your parts move over wherever they fit** (*decided*). Proposal for the details:
  - The new hull arrives with its default fit ("Bare hull comes with"), as the price says.
  - Each of your fitted parts goes onto a mount of the new hull that takes it, preferring the
    mount with the same id, then the same role, then any fitting one. Where it lands on a mount
    that had a default part, that default part becomes yours and goes where a leftover goes.
  - Leftovers (your parts with no mount, displaced defaults) go into your locker at this
    station, then into the new hull's bay if the locker is full, the same order S-44 uses for an
    old bay. If neither has room, the purchase is refused with the reason.
  - Parts keep their wear; tanks keep their fuel; cargo moves with its bay. If a bay with cargo
    can't move and its cargo has nowhere to go, the purchase is refused: unload first.
  - Programs belong to the pilot, so they load into the new computer as far as it has slots,
    the way `trimPrograms` already handles a computer change.
  - The new hull starts at its full hull points.
- **Where you buy it** (proposal): the station shop gets a Hulls category in its grid, each hull
  shown by its own drawing (from the hull drawing plan) with price and trade-in in the tooltip.
  Buying asks once, listing what moves, what goes to the locker and the net price.

## The build

### 1. Station sell lists

Add `hulls` (and the programs and items lists, filled from today's behaviour) to station nodes in
`src/designer/world.ts`: reading, defaults, the fixed key order in `npm run world`. Edit them in the
world designer with the multi-select. Run `npm run world` to rewrite `world.json` and re-warm
`src/start.json`. Nothing sells a hull yet.

### 2. Buying a hull

A `buyHull(model)` in `src/sim.ts` with a planning half that says what would happen (like
`planBuy` / `whereBuyGoes` do for parts), so the shop can show it before the buy. The shop's Hulls
category in `src/main.ts` / the shop grid. Bump `SAVE_VERSION` (now 9 in `src/save.ts`) if the
station lists go into the save.

Then stop for the user to try: buy a hull, check the parts land where expected.

## How we'll know

- Unit tests in `src/shop.test.ts` or a new `hullbuy.test.ts`: net price is new minus old; parts
  move by same id, then role, then any fit; a displaced default goes to the locker; locker full
  falls back to the bay, then refuses; a bay with cargo that can't move refuses; wear and fuel
  carry over; programs trimmed to the new computer's slots; a station without the hull on its list
  doesn't offer it. World tests: a station's new lists round trip, and loading today's world fills
  them so nothing changes.
- `npm test` and `npm run build` pass.
- **Try it:** in the world designer, put the floater on the first station's hull list and run
  `npm run world`. Start a new game in the racer, dock, open the shop's Hulls category: the floater
  shows with its net price. Buy it: you fly a floater, your gun and engines that fit are on it, the
  rest is in your locker, and your credits dropped by the difference.

## Needs first

- `docs/designer-comforts-plan.md` for the multi-select.
- `docs/hull-drawing-plan.md` for hulls being data (a hull id is a name) and for the drawing the
  shop shows. Step 1 here can go before it; step 2 should go after.
- Check how a station offers items today: if it simply sells what it holds, the items list is a
  filter over that, not a new stock.

## Not in this build

- Keeping the old hull (storage) and owning several ships.
- Stations building hulls from parts and ore, like module blueprints.
- AI ships buying hulls: see `docs/ai-hulls-plan.md`, where stations rebuild from templates.
