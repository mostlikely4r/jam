# Indicator plan: two arrows, and the player aims them

*2026-11-19. **Built 2026-11-19**: see "Built" at the end.* The brief for a fresh `/build`
thread. Line numbers are from `ba0a529`. Status markers: **decided** is the owner's call;
everything else is a proposal.*

## Why

The corner arrows are the game's only navigation. Today there are two, and neither is the
player's: `drawPointers` (`render.ts:1396`) works out the nearest field (`miningFieldAt`) and
the nearest dock (`nearestDock`) afresh on every frame, and draws them until they come into
view. That is a good tutorial and a poor tool. It cannot say "the station I call home", and it
cannot say "that field the board mentioned".

Everything needed to aim one already exists: bases have ids, fields have ids, POIs move with
their orbits, the news board already names places, and the chart already knows what's under the
cursor. What's missing is two slots that hold a choice.

## The picture (decided)

**Two indicators, in normal play**: home and destination. The dev pointers (drones, traffic,
pirates) stay exactly as they are, behind `this.dev`.

**A new game starts on the tutorial pair**: home is the nearest station, destination the nearest
field. Both are worked out live, so they move as the ship does.

**Any manual set ends the tutorial pair for good.** One flag, not two: setting either slot in
any of the ways below means the automatic indicators are gone until a new game. They do not come
back when a manual slot is later cleared.

**Toggle.** Pressing whatever set a slot again clears that slot. Home too: having no home arrow
is a legal state, and a player who wants it back pins again at a station (**decided**, over a
proposal that home could never be cleared).

**Space is absolute; everything picked on the chart is followed** (**decided**). A destination is
held as a live handle on the thing that was picked, so the arrow moves with its orbit; a point
picked in empty space never moves. The chart shows and can pick:

- **places** — fields, stations, the pirate base, each a POI with its own orbit chain;
- **deposits** — only after one has been found (`chart.ts:155`), drawn as an orange dot and
  labelled `Deposit`;
- **bodies** — planets and stars, drawn once seen, `place: false` so no course can end there.

Anchors are drawn as diamonds but are not picks (`chart.ts:149`), so they cannot be pinned.
`place` gates the course, not the arrow: a planet can be pointed at, it just can't be flown to
on autopilot.

**Labels are the role for home, and the thing itself for a destination.** The home arrow reads
`home`. The destination arrow reads the kind of what was pinned — `field`, `station`, `pirate
base`, `deposit`, `planet` or `star` — and `space` for a point, with the full name on hover
(**decided**). `Poi.name` (`sim.ts:342`) gives the first three; `ChartPick.kind` (`chart.ts:153`)
already gives each pick its word.

**Distance and speed for all of them**, as the `meters` part does today (**decided**): the
numbers stay a module, and every arrow answers to it.

**Hidden when the target is on screen.** That is what `readPoi` already does — it answers zero
distance once the POI is in view, and the pointer is skipped — and every kind of target gets the
same rule (**decided**). Manual arrows are not held to the `near` limit the tutorial pair uses
(`POINTER_SCREENS`): a destination twenty minutes out is exactly when the arrow is wanted.

**Both slots on one place**: draw the destination and leave home pinned behind it
(**decided**).

**Colours stay as they are** (**decided**): blue for a field, green for a station, the lighter
green for the full-hold flash. `space` takes one neutral colour; which one is open.

**Only the home arrow flashes when the hold is full** (**decided**). It is the arrow saying
*come and sell*, home or far from it.

## State

One existing field does the work:

- `Ship.home: string | null` (`sim.ts:149`) is already "the base a ship belongs to", and
  `homeBaseOf` (`sim.ts:1319`) already answers *the pinned base, or the nearest*. So the home
  slot is `ship.home`, and it needs no new state. Null while the tutorial pair is live means the
  nearest base; null once manual means no home arrow.
- `Ship.destination`, new: a live handle on what was picked — a POI, a deposit or a body — or a
  point, or null. On `Ship` rather than `Sim`, so that a ship turned into traffic later carries
  its own errand (the owner's note about turning the player's ship into traffic is why). A live
  handle is read afresh each frame, which is what makes the arrow follow an orbit; a point is a
  pair of numbers and nothing moves it. The chart's `ChartPick` is the same union and is built
  from the same three things, so the two should share one type with `sim` owning it.
- `Sim.pointersManual: boolean`, new: the one bit that ends the tutorial pair.

A handle to something gone reads as nothing and empties its slot. Fields and bases can be deleted
from the layout (`applyLayout`, `sim.ts:3797`), and a deposit goes with its base; none of them
falls back to the nearest, because that would be the tutorial pair returning.

Restoring a save needs no version bump. `restore` fills a ship's missing keys from the
`makeShip` template (`sim.ts:1044`), so `destination` arrives as its template default on an old
save. `pointersManual` is a `Sim` field and must join the `plain` list (`sim.ts:1068`) or it is
silently dropped on load. That is the one save-shaped trap here.

Resolution belongs in `Sim`, not the renderer: `pointers()` answers at most two
`{ slot, target, label }`, and `drawPointers` only draws what it is given. Today's logic is in
the renderer, which is why none of it is tested.

One reading covers all four kinds of target. `readPoi` already knows the two shapes that matter
— a circle, and the station's box — and it picks between them by asking the POI. It needs to be
handed the radius and the box instead: a field gives its `reach`, a deposit its ring, a body its
`radius`, a point nothing. Then "hide once it is on screen" means the same thing for every kind
(**decided**), and the closing trend still comes from comparing this tick with the last.

## The three ways to set one (decided)

1. **The dock shop**: a `pin as home` button in the station panel (`main.ts updateShop`) that
   sets `ship.home` to the docked base, and clears it when pressed at the base it already names.
   A plain small button beside `Ship and locker`, not a shop cell — there is no price and nothing
   to drag. The panel is only built while docked and open, so the way to correct a mistake is
   the same screen the mistake is made on. The panel's `state` string needs the home in it, or
   the button will not repaint.
2. **A news board line**: the ore line described below becomes a button that points the
   destination at the field it names.
3. **The chart**: right-click on a pick opens a short menu — `Move here` when click-to-move is
   fitted, `Set destination`, `Set home` when the pick is a station, and `Clear destination` or
   `Clear home` when the pick already holds that slot. Left-click keeps picking, so looking
   around the system costs nothing. A right-click where there is nothing to pick sets a point,
   labelled `space` (**decided**). Setting home from the chart is allowed whether docked or not
   (**decided**). Keep the menu flat and three or four items; nothing else in the game nests.

## Ore news (decided)

The board gains a line of the shape `Ore B mined in field Y`, naming a field and clickable, and
that click is the second way to set a destination above. It comes from traffic that sold ore at
that station — never from the player's own mining (**decided**).

Two things from the discussion that make it smaller than it sounds:

- **Ore is an item, not the old number.** `items.json` already holds ore of its own (`oreB`), and
  the news names the item. The type flag itself (ore/part/equipment) is a separate plan — see
  *Out of scope*. This one needs only "an item that is ore", and until the flag exists the sale
  path's own short list will do.
- **Post it at the sale, not at the pickup.** `sellToDeposit` (`sim.ts:2817`) and `unloadOre`
  (`sim.ts:6223`) are where ore becomes credits, and the seller's trip already knows the field it
  worked: `takeOre` (`sim.ts:4602`) takes the field id. News invented at the pickup needed an
  invented "nearest station" hop and could name a station the ship never visits; the sale already
  happens at the station that will show the line.

It rides the existing board instead of a list of its own: proposal, `Report` (`sim.ts:461`)
gains `field?: string`, and the board's key in `swapNews` (`sim.ts:6179`) becomes
`(base, item, field)`. The same ore from the same field is one line however often it arrives; a
second ore from a second field is a second line.

**Ore news stays where it was sold** (**decided**). `swapNews` merges the board with what ships
carry and then writes `base.board = merged`, so the merge must carry ore reports through
unchanged while keeping them out of `ship.news`. They age with the same `newsLife` as price news.

## Out of scope (decided)

- **The item type selector**, and anything that moves `parts.ts` into `items.json`. The news
  needs a way to say "this item is ore"; the migration needs a plan of its own.
- **Ore news that travels.** Price news hops ship to ship; ore news does not.
- **Home as anything but a base id.** "Where the player stores his stuff" is the direction;
  storage, respawn and rebuild rules are not this change.

## Open (proposal, not decided)

- **The hover tooltip on a canvas label.** `tooltip.ts` takes an `HTMLElement`. Either cache the
  two arrow positions each frame and hit-test the mouse, or give the tooltip a rectangle to hang
  off. Small, but it is the only part of "the full name on hover" that doesn't already exist.
- **Which neutral colour `space` takes**, out of the ones already in `render.ts`.

## Tests

`pointers()` and the news hook are `Sim` logic, so the fast suite covers them: the tutorial pair
before any manual set; one manual set clearing both; each slot's own toggle; home null while
manual meaning no arrow; a point staying put while a pinned deposit or body moves with its orbit;
hiding once on screen for each kind of target; both slots on one place drawing one arrow; ore
news posted at a sale, kept out of `ship.news`, and ageing out with `newsLife`. `render.ts` stays
untested as now, because after this it will hold no decisions.

## Built

*2026-11-19, in one commit: `e92ce1a`.* `npm test` (606, 11 of them new) and `npm run build`
pass. Nothing in the layout changed, so `start.json` needed no re-warm.

### What changed from the plan

- **Ore news names the item it has.** The plan's "sale path's own short list" is
  `ORE_ITEMS` in `sim.ts`: the one item that is ore. A sale puts up a line per ore item *its
  field drops*, so a field with no ore item in its drops has no line — there would be no item
  to name. The rest of the line is as planned: `Report.field`, posted in `sellToDeposit` and
  `unloadOre`, keyed by base, item and field, `price` 0, and kept out of `ship.news`.
- **The field a sale came from** is `Ship.oreField`, the second new field on a ship: set where
  a record mines (`takeOre`) and where a flown ship picks ore up, and cleared when a load is
  bought instead. So a bought load posts nothing, and a load carried from one field to another's
  deposit names the field it was mined in, not the one it was sold at.
- **`space` takes the traffic grey**, `#a8adb8`, the one neutral already in `render.ts`.
- **A right click on empty space no longer flies the spot.** It points the destination there,
  as decided, so flying to a spot from the chart is now the menu's `Move here`. The main view's
  click-to-move is untouched. The chart's hint line and the help page say what the click does.
- **`readPoi` became `readTarget(target, …)`**, null when what it names is gone, with
  `outlineOf` handing the reading a circle or a station's box. The POI-reading tests in
  `sim.test.ts` go through a one-line helper for the non-null reading.
- **The shared words are `Sim.kindOf`**, so the arrows, the chart's panel and the news line all
  say the same thing. A deposit now reads `deposit` on the chart's panel too, where it read
  `field deposit`.
- **The tests are a file of their own**: `src/indicators.test.ts`, which `test:fast` covers.
  `sim.test.ts` is excluded from the fast suite, and the plan wanted these there.
- **The dev view no longer overrides the tutorial pair's two screens.** It never had a reason
  to; the dev pointers it is for are unchanged.

### Known, and left alone

- A save's destination is a live handle, and handles aren't saved (the places come from the
  layout). So a loaded game keeps a pinned home, which is a base id, but not a destination:
  it reads as gone and the slot is empty. The plan's "no version bump" holds either way;
  re-linking a saved destination would need ids on places, which this change didn't take on.
