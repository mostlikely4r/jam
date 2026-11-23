# Fuel plan

Written 2026-11-20. Steps 1, 2 and 2b are built, 2026-11-23. Steps 3 and 4 are not built.

This is an experiment. Every ship and station gets a visible fuel tank, and thrusters burn fuel.
Fuel costs credits and flows from the haulers that bring it to stations, then to ships, then
from ship to ship. The user knows the risk: the AI behaviour comes before anyone has played
with fuel, and the balance between "too hard" and "trivial" is hard to hit. They want to see
how the AI and the balance turn out anyway. The reason for fuel at all (user, earlier): a good
coast should be worth something. It costs the player more than the AI, because the player
corrects far more, but it rewards learning to fly well.

Items marked *decided* are the user's calls. The rest is my proposal, open to veto. Tuning
names (`fuelPrice` and the like) are proposals too, so pick better ones if they turn up.

## How it gets built

- **In four steps, each in its own sessions** (*decided*): build → test → tune → review → next
  step. One step per `/build` thread. Don't start a step until the one before it has been
  played and reviewed.
  - **Build:** only that step's section below.
  - **Test:** `npm test` and `npm run build` pass. Start the step's slow checks in the
    background (the census lines below) and log them to `docs/parity-log.md`.
  - **Tune:** the user plays, using the tab menu lines the step adds. Write the numbers they
    settle on into this plan under that step's "Tuned" note.
  - **Review:** a code review of the step's diff, then a short "Built" note under the step:
    what changed from the plan and what's still open.
- **One off switch for all of it** (*decided*): tuning `fuel`, a line in the tab menu. With it
  off, the game is exactly today's game. Proposal: off by default until the user turns it on
  for good, so the public build doesn't change while the experiment runs. Every test that
  exists today runs with it off and must not change. Fuel tests turn it on.

## The picture

- **Every ship has a tank and thrusters burn from it** (*decided*): the player, drones,
  traffic, pirates, defenders and haulers. **Stations have one too** (*decided*). Both show how
  full they are.
- **Fuel costs credits and flows hauler → station → ship → ship** (*decided*). Every sale adds
  a markup, except ship to ship, which is free (*decided*).
- **Fuel comes from planets and moons** (*decided*). A hauler spends fuel to land on a body and
  lift off again, and sells what's left. So fuel is cheaper near a body and dearer far from
  one.
- **Ships go home to refuel when low.** "Low" is a setting in the tab menu (*decided*).
- **A ship that runs dry drifts and pings for help** (*decided*). It keeps its momentum, and
  nothing stops it but another ship.
- **Rescue** (*decided*): the nearest traffic ship with more than 80% fuel comes to help, if
  reaching the stranded ship costs it less than 10% of its fuel.
- **Transfer** (*decided*): two ships near each other trade fuel on their own when one is below
  10% and the other above 50%.
- **Balance comes from measuring** (proposal): step 1 only meters fuel, and tank sizes come from
  what ships actually burn, not from guesses.

## Step 1: meter only

Fuel is counted and nothing else changes. Ships fly exactly as today, switch on or off.

- **Burn rule:** every tick, each thruster that fires burns `fuelPerThrust` × its output × dt.
  The main, reverse, strafe and rotation thrusters all count. Hook it where `Sim` applies a
  ship's thrust (the `pushOf` calls in `src/sim.ts`, around the ship-flying code at ~5290) and
  where the hauler's thrust is set (`hauler.thrust`). One rule for every ship, so the AI and
  the player pay alike.
- **Fuel is an item** (`fuel` in `src/items.json`) so that steps 2–3 can stock, carry and price
  it with the item system that's already there. Proposal: 1 fuel = 1 volume unit.
- **Each ship keeps a burn meter:** burned since its last dock, and its total burn.
- **Trip records** (`TripRecord`, ships out of view) burn by estimate: the flown burn per unit of
  path length for that hull, measured in this step. It follows the same pattern as
  `recordOreRacer`. Proposal: `recordFuelRacer`, `recordFuelFloater` and so on.
- **What to read:**
  - The tab menu shows the player's burn since their last dock.
  - `npm run census` adds burn per trip and per game hour for each kind of ship (player left
    out: the camera is parked), flown and records.
- **Done when:** a table of the measured numbers is written into this plan: burn per typical
  trip for traffic racer and floater, drone, pirate, defender and hauler, plus the user's own
  burn per trip from a play session. Records must come within about 20% of flown.

**Built 2026-11-23.** `fuel` in `src/items.json`; the switch `fuel` (off by default) and
`fuelPerThrust` 0.1 in `src/tuning.ts`, with a "Fuel" group in the tab menu: the switch, the
rates, and a line of the player's burn since their last dock, kept current by the frame loop.
`src/sim.ts` meters every thruster that fired, and the hauler's, and takes the same off
`itemFlow`; each ship keeps `burned` (since its last dock, started again in `unloadOre`) and
`burnTotal`. Records burn as they fly, at `recordFuel*` per 1000 units of path. `npm run census`
prints fuel per kind: all, a trip, an hour, per 1000 flown, flown or as records, and
`--drones=N` puts test drones in the world. New tests in `src/fuel.test.ts`: what fires burns,
the ledger counts it, nothing burns with the switch off or while coasting, a dock starts the
meter again, the meters save, a record burns its path at its hull's rate, and the hauler burns
on its way in.

Where the build differs from this section:

- **Fuel is a `part`, not a type of its own.** `ITEM_TYPES` drives a test that lists the three
types, and *every test that exists today must not change*. Nothing reads a part's type unless
it has a recipe, so fuel is never mined, never made and never asked for by a base: it sits in
a store and a hauler's hold like any item, ready to be stocked and priced in steps 2–3.
- **Metered once, at the end of `moveShip`, from `ship.firing`,** rather than in each `pushOf`
call. That one line covers the main, reverse, strafe and both turning thrusters, counts only
what really pushed (a steadying push that doesn't, or a control with no thruster behind it,
costs nothing), and the same `fuelBurn` rule burns the hauler's thrust after its tick.
- **A record is charged as it flies** (`placeRecord`), not its whole leg as it sets out: a leg
re-planned before the ship had moved a step was charging a trip never made, which showed in the
first census as four times the fuel of the path actually flown.
- **The black market freighter isn't metered.** It isn't in the picture's list of tanks, and
step 3 gives it fuel for the pirate base.

**Measured 2026-11-23**, `npm run census`, the shipped world, camera parked, two seeds of 20
game minutes each, flown. Per-1000 is what the record rates are set from, averaged over the two
seeds, and the two agree within 30%.

| Kind | Burn a trip | Burn an hour | Burn per 1000 flown | Trips an hour |
|---|---:|---:|---:|---:|
| Traffic, racer | 4.5 | 380 | 0.21 | 85 |
| Traffic, floater | 12.4 | 260 | 0.26 | 21 |
| Drone (a racer hull, `--drones=2`) | 4.9 | 250 | 0.33 | 51 |
| Pirate | 3.5 | 310 | 0.32 | 88 |
| Defender | 23 | 180 | 0.12 | 9 |
| Hauler | 18.2 | 327 | 0.58 | 18 |

The drone row is one run with two test drones, which are racer hulls, not the drone hull. The
hauler's "trip" is one visit, from coming in to leaving.

**The player's own burn, from the first play session (2026-11-23): 5–8 fuel a trip.** Not a
census number: a person at the controls, in the starter ship, on short first trips. It is well
under the floater traffic's 12.4, which is a good sign for the plan's reason for fuel, that a
good coast should be worth something.

The same two seeds as records, with the rates above:

| Kind | Burn a trip | Burn an hour | Trips an hour |
|---|---:|---:|---:|
| Traffic, racer | 4.9 | 238 | 17 |
| Traffic, floater | 15.2 | 91 | 2 |
| Pirate | 4.2 | 164 | 13 |
| Defender | 17 | 42 | 0.5 |
| Hauler | 18.2 | 327 | 18 |

**On the 20% the section asks for:** a trip comes close (racer +9%, floater +23%, pirate +20%,
defender -26%), but an hour does not: records burn 30–65% less, because a flown ship also
moves about inside its field, and that wandering is both distance and fuel, while a record's
path is only travel between places. A single per-path rate can't match both: matching the hour
would put a record's trip about 80% above a flown one. Left as it is, for the user to decide
(the options are under "Not in this build"): step 2's tank sizing only needs the trip numbers,
and the per-hour gap is the record/travel difference the parity log already tracks, not
something fuel introduced.

**Not in this build:**

- Tanks, the visible bars, refuelling, `fuelReturn`, and the save of a tank: step 2.
- Haulers going to a body, the station's fuel stock, prices and markups: step 3.
- Running dry, the ping, rescue and transfer: step 4.
- A tank for the black market freighter, and any decision on the per-hour gap above. The
  question for the user: leave records cheaper per hour, or add a burn for a record's time in
  its field, the way `recordOreRacer` stands in for mining it?

**Tuned 2026-11-23.** The user flew the first few trips with the switch on: 5–8 fuel a trip, so
the scale stands (`fuelPerThrust` 0.1, a tenth of a unit a second at full thrust), and the four
record rates stay as measured. The one number they settled on for step 2 is the starting tank.

**Try it:** turn `fuel` on in the Fuel group of the tab menu (`?dev`, then Tab) and the line
above the rates shows what a trip burns; keep Tab open to watch it climb.

## Step 2: tanks and refuelling

- **Tank size per hull** goes in `src/hulls.json`: **20 for every hull's default layout**
  (*decided* 2026-11-23). Everyone works the same, so a racer, a floater, a pirate, a defender
  and a drone all start with 20, and the tank is raised later (a medium or large one, or the
  starting number) if the numbers say it should be. Ships start full. A tank that can't hold a
  trip home from the furthest field is too small: 20 is only 1.6 of a traffic floater's trips,
  so if that turns out unplayable the fix is its default layout in step 2b, or `fuelReturn` here.
  The hauler's own tank comes with step 3, where it first pays for its fuel.
- **Visible** (*decided*):
  - Every ship draws a small fuel bar beside its hull in `src/render.ts`. Proposal: shown for
    ships near the camera, like the other ship markers.
  - The player also gets a gauge in the HUD.
  - The station draws its tank with a fill level. In this step its stock is unlimited, so the
    station's tank shows full.
- **Empty tank:** thrusters don't fire. The ship drifts. Rescue doesn't exist until step 4, so
  for now the tab menu has a "fill tank" button for the player.
- **Refuelling at a dock:**
  - Docking fills the tank at `fuelPrice` per unit, or as much as the ship can afford.
  - Traffic pays from its own credits.
  - Defenders are paid for by their home base, the same way their pay works today.
  - Pirates refuel at the pirate base from pirate credits.
  - Drones refuel at a dock and the player pays.
  - Records do the same in their dock-visit `update`.
- **Going home when low** (*decided*, the setting itself):
  - Tab menu line `fuelReturn`. Proposal: it's a margin, not a flat percentage. A ship heads
    home when its fuel is below (its burn estimate for the trip home) × `fuelReturn`. Default
    1.5. Setting it near 1 makes strandings happen, which is how the user will force step 4's
    behaviour to show.
  - The trip-home estimate is the route planner's path length × the hull's burn per unit length
    from step 1.
  - It's the same decision in `src/pilot.ts` for flown ships and records.
  - Pirates go to the pirate base and defenders to their home base.
- **Save:** each ship's fuel. `src/save.ts` round-trips it.
- **Tests:**
  - A ship with an empty tank doesn't accelerate.
  - Docking charges the price and fills up.
  - A ship below its threshold picks home over its field.
  - With the switch off, nothing burns and the existing suite passes untouched.
- **Try in game:** turn fuel on, play a few trips, and watch your gauge and the traffic bars.
  Lower `fuelReturn` until traffic cuts trips short.

**Built 2026-11-23.** The tank is `fuel` on every ship, 20 by default (`TANK` in
`src/fitting.ts`, with `hullInfo[model].tank` there for a hull to say its own). A dock fills it
at `fuelPrice` 5 a unit, as far as the ship can pay: its own credits, its owner's, its base's
for a defender, the pirate base's for a pirate, and the dock it filled at keeps the money. An
empty tank fires nothing, turning included, so the ship drifts. Ships head home when their fuel
is under `fuelReturn` 1.5 trips home, the route planner's path at the hull's per-1000 burn,
checked every couple of seconds; it's the same rule in `src/pilot.ts` for flown ships and in the
record legs. Every ship draws a thin tank bar under its hull and the station draws its tank, full
for now. The tab menu's Fuel group has `fuelPrice`, `fuelReturn`, the player's tank and burn, and
a **Fill the tank** button, since rescue is step 4. `src/farside.ts` says what refuelling does
out of view: a record fills up during its dock visit, run all at once.

Where the build differs from this section:

- **`src/hulls.json` is untouched, on purpose:** the user's own uncommitted hull work is in that
  file, so the number is the code's default instead of five hull entries. `hullInfo[model].tank`
  is read and the designer can set it; step 2b brings the tanks that make it moot.
- **Docking fills at once** rather than at a rate: the section says "docking fills the tank", and
  a rate would have meant another knob for the tune step to chase.
- **The player's gauge is the dev HUD line and the tab-menu line**, not a new always-on HUD
  element: the game's HUD is the `?dev` one, and an always-on gauge is a public-build change that
  waits for fuel to be on by default.
- **The census leaves fuel off** and takes `--fuel` to turn it on, because fuel changes how ships
  behave now and `npm run parity` has to keep comparing the world it always did. Step 1's numbers
  come back with `npm run census -- 20 1 flown 1 --fuel`.

**Tests:** five more in `src/fuel.test.ts`: no acceleration or turn on an empty tank, docking
charges and fills (and only as far as the money goes), nothing at a dock with the switch off, a
low tank heads home instead of out to its field, and a record with a low tank picks a dock over
its field. The save test now checks the tank round-trips too.

**Tuned 2026-11-23.** The user played with fuel on and found it good as it stood, so the numbers
stay: `fuelPrice` 5, `fuelReturn` 1.5, 20 a tank. Traffic still sells what it did without fuel (a
10 game-minute census: 95 ore, against about 96 a 10 minutes before), and the per-1000 burns came
back where step 1 measured them. Two things to keep an eye on as the supply chain lands: what a
fill costs a trader against the money it saves for parts, and whether a floater's 20 still lets it
work a trip, since 12.4 a trip is most of a tank.

## Step 2b: tanks as modules

**Decided 2026-11-23**, after step 2: the tank becomes a module like the cargo bay, so it can be
upgraded, damaged and destroyed, and so a ship's range is a fitting choice.

- **Two tank mounts on every hull** (*decided*): a little either side of the cargo bay, placed by
  eye in the hull designer. A large bay and large tanks may overlap a little: it's art, not a
  rule. All five hulls take tanks (*decided*).
- **Tank parts** (proposal): small 10, medium 20 and large 40 fuel, one per mount. The default
  layout of every hull keeps **20**, as two smalls, so step 2's numbers carry over. Pirates start
  with a medium either side (**40**) and defenders with a large either side (**80**) (*decided*
  2026-11-23: both mounts carry the same tank). The player's ladder: 20 → 30 → 50 (a medium
  beside a small) → 40 → 60 → 80.

  **Built 2026-11-23.** Two mounts on every hull, `tankLeft` and `tankRight`, either side of the
  cargo bay and faded to `alpha` 0.45 so the level reads through the hull; `smallTank`, `mediumTank`
  and `largeTank` are parts of their own kind, `tank`, with item entries and recipes of their own.
  A bare hull carries two smalls (pirates a medium each, defenders a large each). The tanks weigh
  nothing for now, so nothing anyone flies handles differently from step 2: a tank's weight is a
  lever left for the tune, not one taken by surprise.

- **Capacity is the sum of the fitted tanks.** Every hull's bare fit carries its tanks: without
  that, a ship has no tank and can't move. Only the upgrade needs the AI to learn to buy tanks.
- **Damaged** (*decided*): the tank that took the hit slowly loses its fuel, a leak. The ship
  keeps the rest: its other tank, or nothing.
- **Destroyed** (*decided*): the fuel in that tank is gone with it.
- **A tank is not a `section`**: `bayBox` in `src/shipArt.ts` draws a cargo well at any fitted
  module of that kind, so a tank on its own mount would get a phantom bay.
- **The bar moves onto the tank**: the tank art fills as it drains, and the hull's bar from step 2
  goes. What a hull's fill level is when it has two tanks is a sum, drawn as a level in each.
- **Tests:** capacity is the sum of the fitted tanks; a damaged tank leaks into nothing rather
  than staying put; a destroyed one takes its fuel with it; the default layouts still hold 20.

**Built 2026-11-23.** `Sim.fuelMax` is the sum of a ship's working tanks, and each ship keeps its
fuel per tank (`tankFuel`), the total in `fuel` as before so everything that reads it, the
planner included, is untouched. Burning drains the tanks in proportion, so they stay level; a
damaged tank leaks its own fuel at `fuelLeak` (0.01 a second of what it holds, in the tab menu's
Fuel group) until it is empty, and the other tank keeps what it has; a destroyed tank's fuel is
gone with it, and both losses go into `itemFlow`, so the ledger still adds up. `src/shipArt.ts`
draws a tank on its mount, filled to the hull's own level, in its mount's transparency; a tank
whose mount is faded is a ghost inside the hull. The step 2 bar under the hull is gone, the dock
fills each tank's room, and the ship screen's Fuel tanks row and the shop's new header sell them.

Where the build differs from this section:

- **The tanks are drawn only with fuel on.** With the switch off the game is the one before fuel,
  tanks and all: no tank art on a ship, no tanks in a station's shop, and no station spending its
  credits on a tank blueprint. That's the same rule as everything else in the plan.
- **The leak is a share of the tank a second**, not a fixed rate: a large tank leaks faster in
  absolute terms, at the same fraction. It is in the tab menu's Fuel group, so the tune can move
  it. A leak isn't counted in a ship's own burn meters: those count what its thrusters burned.
- **Nothing re-fills a destroyed tank's fuel**, and nothing needs to: a dock replaces the tank and
  then fills it, as it fills any tank that's come aboard.
- **The AI doesn't buy tanks yet.** It keeps the tanks its hull came with; only the player
  upgrades. That was the section's own point (`Only the upgrade needs the AI to learn to buy tanks`).
- **Tanks weigh nothing.** A hull's tanks are in everyone's bare fit, so weight there would have
  re-tuned every ship in the game. The bays keep their weight; a tank's is the tune's to add.

**Tests:** six in `src/fuel.test.ts`'s "tanks as modules": every bare hull's tanks and what they
add up to (20 for the three working hulls, 40 for pirates, 80 for defenders), a medium fitted
alongside a small making 30, a damaged tank leaking to nothing while the other keeps its fuel, a
destroyed one losing its fuel and its room, no tanks in the shop while the switch is off, and each
tank's fuel in a save. Two fitting tests now name the tanks in a bare hull's fit.

**Not in this build:**

- The AI buying or upgrading tanks, and the shop pricing that would need: step 3 or later.
- Tanks weighing anything: the tune's, if the numbers say.
- The station's tank drawing its real fill: step 3 makes it finite.

**Try in game:** fit a large tank beside a large bay and see whether the overlap reads; get a
pump loose and watch one tank drop.

## Step 3: the supply chain

- **Haulers go to the nearest body** (*decided* 2026-11-11):
  - The nearest planet or moon by trip time, picked when the hauler sets out, never a star.
  - Today a hauler comes in from nothing along `haulerLane` and leaves to the off-screen `hub`.
    Now it flies to the body.
  - Landing is a placeholder: it reaches the surface, is gone for a while (`haulerLandedSeconds`),
    and lifts off again.
  - A base with no body in range keeps today's arrive-from-nothing hauler.
  - The hub stays the place where carried ore and parts go and come from. The hauler just
    reaches it by way of the body.
- **Land and lift-off cost a fixed amount of fuel per body** (*decided*). Proposal:
  `fuelLanding` × the body's radius ÷ a reference radius, so big planets cost more. This is a
  set cost, not flying in gravity.
- **The hauler's fuel:**
  - At the body it fills its own tank first, then loads fuel as cargo at `fuelSourcePrice` per
    unit, money from outside the world.
  - It burns from its own tank, never from the cargo, and it never strands: if its tank can't
    cover the trip it fills up again before leaving.
  - At the station it sells the fuel cargo at `fuelSourcePrice` × `fuelHaulerMarkup`.
  - An arrive-from-nothing hauler sells at a higher price: proposal `fuelFarPrice`.
- **Stations hold fuel stock now, no longer unlimited:**
  - It's kept in station storage as the `fuel` item, and the station's tank draws its real fill.
  - Ships pay the station's buying price × `fuelStationMarkup`.
  - When the station runs out, ships take what's left and wait docked for the hauler (proposal),
    and the player sees "no fuel".
  - The station orders fuel from the hauler the way it orders parts, up to a stock target
    (proposal: `fuelStationTarget`).
- **The pirate base:** the black market freighter brings its fuel the same way, at its own price
  (proposal).
- **The ledger:** fuel made at a body and fuel burned by thrusters both show in `itemFlow`, so
  the existing item-count check still balances.
- **Save:** station fuel stock and hauler fuel.
- **Tests:**
  - A hauler picks the nearest body by trip time.
  - Landing and lift-off cost the body's amount.
  - The markups stack: source → hauler → station → ship.
  - The ledger balances over a long run with fuel on.
- **Try in game:** compare the fuel price at a station near a moon with one far from any body.
  Watch a station run low and a hauler come in to fill it.

## Step 4: running dry

- **Out of fuel** (*decided*): thrusters stop and the ship drifts with its momentum. A drifting
  record's position is simple: start + velocity × time.
- **The ping** (*decided*):
  - A stranded ship sends a call for help. It's separate from today's `distress` (which is one
    call at a time, for defenders), because many ships can be stranded at once.
  - Shown as a pulse ring on the ship and a radio line (`src/radio.ts`, `src/chatter.ts`).
  - It lasts until the ship has fuel again.
- **Rescue** (*decided* rule, proposal details):
  - The nearest traffic ship with more than 80% fuel goes, if the burn to reach the stranded
    ship is less than 10% of its tank (estimated as in step 2's trip home).
  - One rescuer per stranded ship. Others ignore the ping while a rescuer is on its way.
  - The rescuer matches the drifting ship's velocity, stops alongside, and the transfer rule
    does the rest. Then it goes back to what it was doing.
  - It's the same decision in `src/pilot.ts` for flown and recorded traffic. A recorded rescuer
    makes a trip to where the drifting ship will be.
- **Transfer** (*decided* rule, proposal details):
  - Two ships within `fuelTransferRange` with a small relative speed trade fuel when one is below
    10% and the other above 50%. Free, no markup.
  - It flows over a few seconds and is drawn as a line between the ships, like the tractor beam.
  - It stops when the low ship has enough for its trip home × `fuelReturn`, or the high ship
    would drop to 50%, whichever comes first. This keeps fuel from going back and forth and
    rescuers from bleeding themselves dry.
  - Who trades with whom (proposal): the player, drones, traffic and defenders with each other;
    pirates only with pirates.
  - The player gives and receives like anyone else. The tab menu line `fuelPlayerGives` (default
    on) lets them stop giving.
- **Nobody comes:** the ship drifts on. It can hit things, and it waits for anyone passing.
  Nothing rescues it by magic.
- **Tests:**
  - A stranded ship drifts and pings.
  - The nearest eligible traffic comes, a ship that's too far or too empty doesn't, and only one
    comes.
  - A transfer starts and stops at the thresholds and doesn't flip back and forth.
  - A recorded rescue meets the drifting ship.
- **Census:** strandings, rescues and time stranded per game hour, flown and records.
- **Try in game:** set `fuelReturn` near 1 and watch traffic run dry and get rescued. Run your
  own tank dry in a field and wait for help.

## Not doing

- Real gravity-well flight for landing. Landing costs a fixed amount per body.
- Pirates answering fuel pings to hunt stranded ships. A fun idea, not part of this.
- Extra fuel tank modules: those are step 2b. Tanks as explosive modules stay here, for the
  fitting plan's explosive tank to build on later.
- Turning fuel on for the public build before the user has played it.
