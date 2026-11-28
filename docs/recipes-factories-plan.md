# Recipes, factories and holes plan (spec B1)

Written 2026-11-27, from a product talk with the user (roadmap steps 3–4, `docs/roadmap.md`).
Slice 1 (steps 1–2) is built (2026-11-28); slice 2 is not. Items marked *decided* are the user's calls; the rest is proposal, open
to veto. The words (frame, mount, part, capability) are in `docs/framework.md`. This plan builds on
spec A, `docs/station-frames-plan.md` (Q-51), which turns stations into frames with parts, gives
every entity an owner and an account, and adds storage and trade point parts.

## Why

The economy has no place where things are made. Today:

- **Recipes are just "from" and "yields"** (`Recipe` in `src/items.ts`, data in `src/items.json`).
  Part A is 2 ore, part B is 2 ore B, and every module is so many part A (gun 1 is 5, the nav
  computer 60). Recipes have no time and no conditions.
- **Parts are made by the hub** (`Sim.hub`, `feedHub`, `loadFromHub`, `unloadToHub` in
  `src/sim.ts`). It's an invisible, infinite store. A hauler that leaves out of sight drops its
  ore there, the hub runs the ore → part recipes on the spot, and the next hauler (every
  `haulerInterval`, 600 s) arrives loaded with whatever its base asks for. If the hub doesn't hold
  it, it makes it from nothing (`loadFromHub` books the difference in `itemFlow`).
- **Modules are made at the moment of sale** (`supply`, `hasInputsFor`, `missingFor` in
  `src/sim.ts`): buying a gun 1 takes 5 part A out of the station's stock at once.
- **A blueprint is a flag** (`Base.blueprints`, a set of ids). Funding (`fundBlueprint`,
  `buyBlueprints`) puts it on order, and the next hauler "brings it" from the hub
  (`deliverBlueprints`).

So nothing a station sells is ever really short, and the roadmap's far base, which "builds it
from goods it actually holds" (*decided*, roadmap), can't exist. B1 splits the hub's two jobs
apart. **Holes** become real places at the edge of the modelled economy. **Factories** become a
part on real stations that takes time and works only with what it holds.

Premises: the shape of the flow is the user's own design (the roadmap talk and this one). The
numbers are guesses: build times, factory speeds, a hole's rate, and whether one ore → parts
factory keeps three stations supplied. That's why slice 1 stops for the user to try the feel, and
slice 2 is watched on the dev cards, not judged by a test.

## The picture

**One shape for every recipe**

- **Inputs, conditions, output, time** (*decided*, roadmap). Inputs are consumed. Conditions are
  needed but not consumed. In B1 the conditions are a factory part that can run the recipe and a
  blueprint item held by the factory's station. Power, a place and the rest come later.
- **Time lives on the recipe and speed lives on the factory part** (proposal). A gun 1 is, say,
  60 s of work. A factory at 20× makes it in 3 s, and a far yard at 1× takes a minute. Stations
  differ only in their data.

**A factory is a part, and a station is a station**

- **There's no "factory station"** (*decided*). A station is a frame with parts, and one kind of
  part is a factory. What a station does depends on which parts it has and how they're
  configured. Any station can carry one or more factories.
- **A factory part** holds a list of recipes it can run, a speed, a mode (to stock or to order),
  and, for to-stock, a target count per output. It works out of its station's storage: it takes
  inputs from there and puts outputs back.
- **Two modes** (*decided*, "both, by item"):
  - **Made to order, for modules and hulls.** Today's stations each get a fast factory, the
    "super factory" (*decided*). You click buy, a progress bar runs for a few seconds, and the item
    is yours before you leave the screen. It isn't instant, but it's fast (*decided*). The far
    base's slow build of the end-game miner is the same factory at a lower speed. That base isn't
    built here.
  - **Made to stock, for goods.** Parts, fuel and, later, ammo are made ahead of time into the
    station's storage, and haulers carry them away.
- **What a to-stock factory makes next** (proposal): of the recipes it can run now (inputs and
  conditions met), the one whose output is furthest below its target, as a share of the target.
  When nothing is below target, it idles. When something is below target but can't run, it
  *waits*, and it knows which input or condition is missing.
- **Working or waiting** (*decided*: a small visible sign). Each factory part has a state:
  `working`, `waiting` (with what it lacks) or `idle`. In the world, a live shape on the factory
  part reacts to that state: it spins or is lit while working, and goes still while waiting. B1
  provides the state. Q-46 (live shapes slice 2: state lights and spinning shapes) provides the
  look and reads this state like any other. Neither waits for the other: until Q-46 is built, the
  state is only on the dev card.

**Holes**

- **A hole is a station whose factory has looser rules** (*decided*): its recipes take **no
  inputs**. Planets and moons will one day become real factories (*decided*, the user's note:
  "make the hub or planets factories where possible, as they will become that later"), so a hole
  is built from the same parts as any station and nothing about it is special code.
- **A hole keeps the time rule** (*decided*: a rate, "assuming we have a good way to visualise
  it"). It makes its goods at a rate into its own storage, and haulers can empty it. The default
  rate is high enough that it rarely binds. Turning it down is how starving gets tested on purpose.
- **A hole takes anything** (roadmap, *decided*). Its trade point buys every item at the item's
  fixed price, and what it takes leaves the world, booked in `itemFlow` the way the hub's making
  from nothing is today. It sells what its factories have made.
- **The first hole is the moon's** (roadmap, *decided*: "the moon's fuel is the first case"). It
  makes fuel and blueprints (below). Proposal: a new station node, "Moon port", a child of the
  home Station's moon (`Star > Planet > Moon` in `src/designer/world.json`), placed by a layout
  recipe in `src/designer/recipes.ts`. Its frame is drawn by the user later. Its parts are a dock,
  storage, a trade point and a hole factory. It has no shop, repair or refinery. Note: the
  existing "Planet base" station (`n10`) is a normal full station despite its name, not a hole.

**Blueprints are items**

- **A blueprint is an item** (*decided*): type `blueprint`, 1×1, held in a station's storage and
  never used up. A factory runs a recipe only while its station holds the recipe's blueprint.
  Later a blueprint can be loot, a gift, carried by the player to a far base, or copied by a
  recipe with conditions only. None of that is built here.
- **One blueprint item per sellable thing** (proposal): derived from every module item, not
  written into `src/items.json` one by one. The id is `blueprint:<item id>`, the price is the
  item's `blueprintPrice`, and the icon is the item's own with a blueprint mark. Programs and hulls
  get theirs with Q-32.
- **Holes sell blueprints** (*decided*): the knowledge comes from the planet base, the way it comes
  from the hub today. The moon port's hole factory has a no-input recipe for every blueprint item.
- **Funding plays as today** (*decided*: today's flow stays): the player or the station funds a
  blueprint (`fundBlueprint`, `buyBlueprints`). It goes on order, the base's next hauler buys it at
  the hole and brings it, and from then on the station's factory can make the module.
  `Base.blueprints` stops being a set of flags and becomes "the blueprint items in this station's
  storage". `unlocked` reads it that way.
- **Projects are not items** (proposal): the deposit, the station's and the deposit's guards, and
  the drone keep the funding they have today (`orderBlueprint` starts their construction). Spec A
  made their construction generic, and they stay as they are.

**The hub goes away**

- **No infinite store** (*decided*). `Sim.hub`, `feedHub`, `loadFromHub`, `unloadToHub` and the
  making from nothing go. Ore really goes to a station with an ore → parts factory, and parts come
  back only after that factory has made them. If the factory runs short, the stations it supplies
  run short: "you wait or bring them" (roadmap). Starving is allowed, measured and shown, not fixed
  (*decided*, roadmap).
- **The default setup** (*decided*: designer configuration, not code; the setup itself is a
  proposal): the ore → parts factory (part A from ore, part B from ore B, to stock) sits on the
  existing "Planet base" (`n10`). The home Station has none, so home ↔ Planet base is the one real
  flow the roadmap's build-up asks for (moon ↔ mining station, then mining station ↔ factory).
  Ringside (`n24`, far out at Ferrum) gets its own ore → parts factory, so a far island doesn't
  starve on a trip that the stand-in route below can't make sensibly. All three stations keep a
  super factory for their shops. The user changes any of this in the designer.

**The stand-in route**

- **Today's hauler gets a new address** (*decided*), written as temporary and replaced by spec C's
  lanes (Q-49). Each base still has one hauler arriving every `haulerInterval`, and the interval is
  still the trip.
- **Its supplier** is the nearest *other* station with a factory part that takes ore as input,
  asked by capability, never by name (*decided*). It is measured by straight-line distance between
  the two stations at the moment the hauler leaves (proposal).
- **Leaving:** the ore it carries goes into the supplier's storage, through the supplier's trade
  point. That replaces `unloadToHub`. If the supplier's storage is full, the ore that doesn't fit
  stays aboard and comes back.
- **Arriving:** it loads what its base asks for (`needsItem`, today's targets
  `stationPartsTarget` and `itemTarget`), but only what the supplier holds. That replaces
  `loadFromHub`. Blueprints on order come from the nearest hole on the same trip.
- **Money stays as today's code** (spec C rewrites prices): goods change hands at each trade point
  at the item's price, and the hauler's markup (`haulerPays`) is unchanged. The supplier's account
  is paid for the parts and pays for the ore.
- **A base with its own ore factory** needs no supplier for what it makes itself. Its hauler only
  fetches what it can't make (blueprints, part B if it has no ore B), and its ore stays home for
  its own factory.
- **No supplier at all** (no other station has an ore factory): the hauler still comes for
  blueprints, but brings no parts. The dev card says "no supplier".
- **Fuel's stand-in pair is Q-7's** (proposal): the moon port makes fuel in B1, and Q-7 (fuel step
  3), rewritten by this plan, has haulers fetch it from the nearest hole the same way.

**Construction gets real recipes**

- Spec A made construction generic, but always "N blocks". Proposal: **a block becomes an item**
  (`block`, made from part A, with today's count of part A per crate as its recipe). A frame's or
  part's recipe lists blocks, using today's counts (`depositParts`, `stationGuardParts`,
  `depositGuardParts`). The block job keeps playing as today: the station's super factory makes
  the crate when the job starts, so blocks are now made from parts the station actually holds.

**Watching it**

- **A dev card per factory and hole** (proposal; it brings forward a small piece of the roadmap's
  step 8, because B1 can't be tried without it): on the chart (`src/chart.ts`) when `?dev` is on,
  each station with a factory shows a small card with:
  - its storage, as one bar per item against its target;
  - each factory's current recipe with a progress ring, its speed, and its state (working,
    waiting on *what*, idle);
  - for a hole, its rate;
  - its hauler's supplier, or "no supplier".

  Spec C adds the lane lines and the hours-long log.

## The build

Two slices. Each step plays and is committed on its own.

### Slice 1: the recipe shape, the factory part, the super factory

**1. The recipe shape.** *Built 2026-11-28.* In `src/items.ts`, `Recipe` becomes inputs (today's `from`), conditions,
yields and `time` (seconds of work at speed 1). `from` is still read from old files. In B1,
conditions are `factory` (what kind of factory part may run it) and `blueprint` (an item id the
station must hold). Defaults read from today's data: a module's recipe has the condition
`factory: workshop` and a time of 10 s per 5 part A (proposal, as a starting point). A part's
recipe has `factory: ore` and 2 s per item. The hull designer's recipe editor
(`src/designer/hulls.ts`, around line 1550) gets fields for time and conditions. `HUB_RECIPES` and
`SALE_RECIPES` become one list of recipes, filtered by the factory that asks. Programs keep their
own path until Q-32.

**2. The factory part and the super factory.** *Built 2026-11-28.* A new part kind on spec A's parts: `factory`, with
data `{ kind, speed, mode: "stock" | "order", targets? }`, a store of its current job (recipe,
time left) that saves, and a state (working, waiting with what's missing, idle). A system in
`src/sim.ts` ticks every factory part. Each of today's three stations gets a `workshop` factory at
order mode, speed 20 (proposal). Buying (`buyPart`, `buyHull`) no longer makes the item in
`supply`. Instead it starts an order on the station's workshop: the inputs come out of stock when
the order starts (checked by today's `hasInputsFor` and `missingFor`, so the refusal reads as
today), the shop shows a progress bar on the item (`src/shop.ts`), and the item lands where the
buy would have put it (mount, hold or locker, from today's `planBuy`) when the bar fills. A module
or hull in store as a whole is still handed over at once. Leaving the dock mid-order (proposal):
the order finishes and the item waits in the station's locker for you. AI buyers (traffic,
`attempt`) skip the bar and get the item at once, so their behaviour doesn't change. The dev card
(chart, `?dev`) shows the workshop and its state.

**What changed from the plan in slice 1** (built 2026-11-28):

- **Recipe time: 12 s per input item for a module, not 10 s per 5 part A.** The step said 10 s per
  5 part A, but the Why and the Try it line both want a gun 1 to take about 3 s at speed 20, so a
  gun 1 is 60 s of work. A nav computer (60 part A) is 36 s at the workshop: a number to tune.
- **A hull's time** has no recipe to come from: 12 s for each part A its price spends
  (`serviceCreditsPerPart`), so a 300-credit hull takes 9 s. One hull is on order at a time.
- **The `blueprint` condition is left for step 3**, where blueprint items arrive. In slice 1 the
  only condition is `factory`.
- **The factory logic is its own module**, `src/factories.ts`, pure over a store, so it's tested
  without a world. To-stock mode (pick the output furthest below its target, wait naming what's
  missing, idle) is built and tested there, though nothing in the world uses it until step 5.
- **The buy plans where a module lands** (mount, bay or locker) and holds that spot while the bar
  runs, so a second buy plans round the first. Left the dock, the module waits in your locker
  there. With no room even there, the station keeps it whole and pays you back. A hull finished
  while you're away waits on the workshop until you're back in that dock.
- **A station with no factory that runs a module's recipe can't make it**: the shop says "The
  station needs a workshop to make it".
- **Factory data is edited in `hulls.json`, not the designer**: the designer picks the part for a
  mount, as for a dock, but has no fields for its data yet. Each station gets its workshop from
  the station frame's new `workshop` mount (workshop, to order, speed 20).
- **Tests that look at what they bought** go through `buyNow` / `buyHullNow` (`src/testing.ts`),
  which hand the order over at once (`Sim.finishOrders`). The ledger books an order's inputs when
  it starts and its output when it's done.
- **A dev button**, "Dock at nearest station" in the dev panel's Parts section, for trying the
  shop without the trip.
- Saves are version 13. A version 12 save loads with its stations' factories idle.

**Stop here for the user to try.** Does a few seconds of build feel right? Is the bar where the
eye is? The numbers (time per recipe, speed 20) get tuned here, before anything depends on them.

### Slice 2: blueprints, holes, the hub gone

**3. Blueprint items.** Derive `blueprint:<id>` for every module item (type `blueprint`).
`Base.blueprints` becomes a read of blueprint items in the station's storage. The designer's
starting `unlocked` list (`world.json`) puts those items in storage at the start. Recipes get the
`blueprint` condition from their item. The station's workshop runs a module's recipe only with its
blueprint held. Funding is unchanged up to the order. Delivery comes in step 5.

**4. Holes.** A hole factory is a factory part whose recipes take no inputs and have a rate (the
recipe's time at the part's speed). Its trade point takes any item at its price (taken items leave
the world, booked in `itemFlow`) and sells what's in storage. Add the moon port by a layout recipe,
with a hole factory making fuel and every blueprint item, a dock, storage and a trade point. A rate
dial per hole goes in the system designer's station page.

**5. The hub goes; the stand-in route.** Remove `hub`, `feedHub`, `loadFromHub` and
`unloadToHub`. Add the ore → parts factory (kind `ore`, to stock, targets part A 200 and part B 20
as a proposal) to Planet base and Ringside in `world.json`. Rewrite the hauler's spawn and leave
as under **The stand-in route**: supplier by capability, ore into its storage, parts out of it,
blueprints on order bought at the nearest hole. `deliverBlueprints` puts the blueprint item into
the base's storage. With `haulers` off (tuning), blueprints still arrive at once, as today. The
radio line on arrival is unchanged. The dev card shows the supplier.

**6. Blocks as items.** `block` gets a recipe from part A. Construction (spec A's generic path)
counts blocks, and the workshop makes a crate when a block job starts.

### Saves

`SAVE_VERSION` goes from spec A's 12 to 13, in the step that first changes what's saved (step 2:
a factory's job). Loading an older save:

- a base's blueprint set becomes blueprint items in its storage;
- the hub's counts go into the Planet base's storage (proposal), so nothing that existed is lost;
- an open order doesn't exist yet in old saves.

## How we'll know

- **Unit tests** (new, in `src/factories.test.ts` unless a suite fits better):
  - A to-stock factory with inputs runs its recipe in `time / speed` seconds, takes the inputs
    when it starts, puts the output in storage, and picks the output furthest below its target.
  - A factory lacking an input waits and names it. One lacking a blueprint waits and names it.
    With nothing below target it is idle.
  - A hole makes at its rate with no inputs, stops at its storage's room, and its trade point
    buys any item at its price.
  - The workshop: buying a gun 1 takes 5 part A at the start, delivers the gun after
    `time / 20`, and refuses with today's words when parts are short. An item in store as a
    whole is handed over at once. An AI buyer gets it at once.
  - Blueprints: a station without the blueprint item can't sell the module. A funded blueprint
    arrives as an item on the next hauler, bought at the hole, and the shop sells the module.
  - Stand-in route: the home Station's hauler drops ore at Planet base and comes back with only
    the parts Planet base held. With Planet base's factory removed, the home Station's part A
    runs down and the dev card says "no supplier".
  - No item is made from nothing anywhere except at a hole: `itemFlow` books every making from
    nothing to a hole.
  - Saves: a version 12 save with blueprints and hub counts loads into storage.
- **Existing suites:** `shop.test.ts`, `hullbuy.test.ts`, `stations.test.ts`, `blocks.test.ts`,
  `items.test.ts`, `save.test.ts`, `sim.test.ts` and `farside.test.ts` pass. They may change
  where they read the hub or expect an instant module sale, and only there.
- **No-player run:** `npm run parity` (background, log to `docs/parity-log.md`), plus the
  no-player run with the three stations' part A over a few hours. Starving is measured, never a
  failure (*decided*, roadmap).
- Full check: `npm test`, then `npm run build`.

**Try it (slice 1):** `npm run dev`, dock at the Station, buy a gun 1. A bar fills for about
3 s, then the gun is on its mount. Buy something you can't afford in parts: refused, same words
as before. Then `?dev`, open the chart (C): the Station's card shows its workshop working while
you buy, idle after.

**Try it (slice 2):** `?dev`, open the chart. Planet base's card shows its ore factory turning ore
into part A, and the moon port's card shows fuel and blueprints at a rate. Fund a blueprint at the
Station: the next hauler brings it, and the module shows up in the shop. In the system designer,
remove Planet base's ore factory and speed up time: the Station's part A falls, its card says "no
supplier", and the shop starts refusing.

## Needs first

- **Spec A built** (Q-51, `docs/station-frames-plan.md`): frames, parts, storage and trade point
  parts, owners and accounts, generic construction. It's queued and not built yet, and every step
  here sits on it.
- Live shapes slice 1 (Q-38, built and passed 2026-11-26). The look of "working" waits for Q-46,
  which isn't specced, and B1 doesn't wait for it.
- The fuel item (`fuel` in `src/items.json`, exists) and fuel steps 1–2 (`docs/fuel-plan.md`).

## Rewrites

- **Q-32** (blueprints for programs and hulls, `docs/blueprints-plan.md`): programs and hulls get
  blueprint items too, sold by holes and run as conditions, instead of a second unlock system. Its
  plan is rewritten before it's built.
- **Q-7** (fuel step 3, `docs/fuel-plan.md`): the station's fuel comes from the moon port's hole,
  fetched by the stand-in route. Its plan is rewritten before it's built.

## Not in this build

- **Ammo** and factory 2 (parts → ammo): spec B2, Q-50.
- **Factory 3** (parts → guns or thrusters, made to stock for other shops) on a third station:
  roadmap step 9, as designer configuration once lanes exist.
- **Prices from stock and wants**, who owns and pays a hauler, real lanes, and the lane lines and
  hours-long log: spec C, Q-49. Until then, the stand-in route and today's prices.
- **The far base's slow made-to-order build** of the end-game miner: the same workshop at a low
  speed, placed when that base exists.
- **Power, place and other conditions.** Copying blueprints, blueprints as loot or gifts.
- **The refinery as a factory:** it stays a thin part (spec A) until something needs it to change.
- **Real visible production** (goods moving between parts on screen, S-53's refinery laser): parked
  as the picture to aim for.
- **Lifting the thin parts' "station only" mark:** each in its own spec.

## Not doing

- **No "factory station" type.** A station is a station, and factories are parts on it
  (*decided*).
- **No infinite source next to the factory.** Holes keep a rate, and the hub is gone (*decided*).
