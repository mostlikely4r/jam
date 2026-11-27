# Fuel plan

Written 2026-11-20. Steps 1, 2 and 2b are built, 2026-11-23. Steps 3 and 4 are not built. Step 3
was rewritten 2026-11-27 on top of spec B1 (`docs/recipes-factories-plan.md`).

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
- **Fuel comes from planets and moons** (*decided*). Since spec B1, the moon port's hole makes it
  and haulers carry it to the stations (step 3). The 2026-11-11 picture of haulers landing on a
  body, with fuel cheaper near one, waits for spec C's lanes and prices.
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

Rewritten 2026-11-27, after spec B1 (`docs/recipes-factories-plan.md`) changed where fuel comes
from, and after the ammo talk (`docs/ammo-plan.md`), whose moving rule fuel shares. It replaces the
2026-11-11 version: haulers landing on the nearest body and a fixed landing cost. B1's stand-in
route replaced that trip, and it comes back with spec C's lanes if haulers ever fly to a body
again (see **Not in this step**).

### Why

Since step 2, a station's fuel comes from nowhere: `refuel` in `src/sim.ts` fills any tank at
`fuelPrice`, and the station's tank art is always drawn full. B1 makes fuel real at its source.
The moon port's hole factory makes it at a rate, and its stand-in hauler carries it to the
stations (B1, "Fuel's stand-in pair is Q-7's"). This step makes the stations' end real: a station
holds fuel stock, sells only what it holds, and can run short. When it runs low, its traffic
leaves (*decided*): "if you let ammo or fuel run dry you lose your traffic", the lesson future
player-owned stations will teach.

Premises: the rules are the user's own, from the 2026-11-27 talk. The numbers are guesses: the
stock target, and the band of lines at which miners leave. That's why the step stops after its
first half for the user to watch it.

### The picture

**Stations hold real fuel**

- **Fuel is the `fuel` item in a station's storage** (spec A's storage part). Haulers bring it
  through B1's stand-in route, up to a stock target (proposal: `fuelStationTarget`, 200 units, read
  by B1's `needsItem` and `itemTarget`).
- **The dock fills tanks from that stock** (proposal): `refuel` takes `fuel` items out of the
  station's storage and no longer makes them from nothing. The price stays today's `fuelPrice`
  (spec C, Q-49, brings prices from stock). Who pays is unchanged: the ship, its owner, a
  defender's station, or the pirate base.
- **The station's tank art shows its real fill** (proposal): the stock against its target. Today
  `drawTank` in `src/render.ts` is always drawn full.
- **An empty station** (proposal): ships take what's left and then wait docked, as today's
  `refuel` already stops when the purse does. The dock screen says "No fuel here".
- **The pirate base keeps fuel from nothing** (proposal, temporary), booked in `itemFlow`, as its
  ammo does in the ammo plan. Its real supply is S-86.

**Traffic leaves before it's too late**

- **Fuel is hard and ammo is soft** (*decided*). A ship without ammo can still take a job or fly
  away, so ammo waits until a miner gets none (`docs/ammo-plan.md`). A ship without fuel can't fly,
  so a miner leaves **while the station can still fill its tank**, when the stock falls below a
  line (*decided*: "10%/25%").
- **Each miner has its own line** (proposal): rolled once, between 10% and 25% of the station's
  fuel target, when the pilot is made, and saved. The nervous ones leave first, and the patient
  ones hold on until 10%. A late hauler costs a station a few miners. A long shortage costs it
  all of them.
- **Leaving** (*decided*: move away, for good, as in the ammo plan): at a dock visit, after the dock
  has filled its tank, a traffic miner whose home station's stock is below its line moves. Its new
  home (`ship.home`) is the nearest other station whose fuel stock is above that miner's own line,
  and that its full tank can reach (the route-and-burn estimate of `burnHome` in `src/pilot.ts`).
  It works that station's field (`ownField`) from then on. It moves again only if its new home
  runs low too, and never moves back on its own (*decided*). With nowhere to go, it stays.
- **Drones and defenders never move** (proposal, as for ammo): they wait at their station.
  Pirates never run short here.

**The chatter** (*decided*: "a chatter between traffic, and station optionally")

Shared with the ammo plan: whichever of this step and the ammo plan's step 5 (Q-55) is built
first writes it, and the other reuses it.

- **The leaving miner says why and where** (proposal for the words), as a radio line through the
  `chatter` event (`src/chatter.ts`, `src/radio.ts`): "Tank's down to 15% here. I'm moving to
  Ringside." For ammo: "No rounds left here. I'm off to Planet base." The number and the station
  are real.
- **A staying miner sometimes answers** (proposal: one chance in two, a miner of the same station
  that's docked or in its field): "I'll hold out a while longer."
- **The station signs off plainly** (*decided*: plain to start, which matches today's chatter):
  "Copy, safe flight." Later the reply depends on the station's personality (*decided*), through
  the face cast's knobs (`docs/face-cast-plan.md`, Q-39 to Q-41). Not in this step.

### The build

**3.1. Real stock.** With `fuel` on: `refuel` takes from the station's `fuel` storage and stops at
none. Add the station fuel target through B1's targets, so the stand-in hauler brings fuel from
the moon port. The station's tank art draws its real fill. The dock screen says "No fuel here" at
zero. The pirate base's fuel comes from nothing, booked in `itemFlow`.

**3.2. Leaving, and the chatter.** Each traffic pilot rolls its line (saved). At a dock visit,
after refuelling: the line check, the choice of new home, the move (`ship.home`, the pilot's
`working` field) and the chatter. Write the move as one function shared with the ammo plan's step
5 (proposal: `Sim.moveHome(pilot, reason)`), so both shortages move ships the same way. The dev
card (B1's, on the chart with `?dev`) shows each station's fuel bar and the miners moved in and
out.

**Stop here for the user to try.** Does the station's tank read at a glance? Do miners leave at
a pace that feels like a shortage and not a stampede? Is the chatter clear about why? The band
(10% to 25%) and the target get tuned here.

**3.3. Out of view.** Trip records refuel at their dock visit (`dockVisit`, `fighterArrived` in
`src/sim.ts`) from the station's real stock, run the same line check and move, and send the
chatter only when the player can hear it. `src/farside.ts`'s `refuel` line says so. A record's
own tank still never runs dry out there (step 2).

### Saves

One more `SAVE_VERSION` than whatever it is when this step is built (B1 makes it 13, the ammo plan
14), in 3.2: each traffic pilot's line. Station fuel stock is already saved in spec A's storage.
An older save rolls a line for every traffic pilot on load.

### How we'll know

- **Unit tests** (in `src/fuel.test.ts`):
  - A dock fills a tank from the station's stock, takes the units out of storage, and stops at
    none. An empty station leaves the ship docked and short.
  - The stand-in hauler brings fuel from the moon port up to the station's target.
  - A miner whose line is above the stock moves after it fills up, to the nearest station above
    its line that it can reach. One whose line is below stays. With nowhere to go, it stays.
  - Lines are rolled between 10% and 25% and saved. A save without them rolls them on load.
  - A drone and a defender never move. The pirate base's fuel comes from nothing, and the ledger
    (`itemFlow`) balances.
  - A move sends the miner's line with the real number and station, and the station's sign-off.
  - Out of view (3.3): a record at its dock visit refuels from stock and moves by the same rule.
- **Existing suites:** `fuel.test.ts`, `farside.test.ts`, `records.test.ts`, `pilot.test.ts`,
  `save.test.ts` and `sim.test.ts` pass. With `fuel` off, nothing changes.
- **No-player run** (background, `docs/parity-log.md`): a few hours with fuel on. Per station, its
  fuel stock over time and the miners moved in and out. A station emptied of traffic is measured,
  never a failure.
- Full check: `npm test`, then `npm run build`.

**Try it (3.1–3.2):** `npm run dev`, turn on `fuel` in the tab menu, `?dev`, open the chart (C).
In the system designer, turn the moon port's fuel rate down and speed up time. The home Station's
tank art drains. Miners start saying they're moving to another station, the station signs them
off, and its card counts them out one by one. Dock there yourself at zero: "No fuel here".

**Try it (3.3):** the same with the camera far from the home Station. Fly back after a while: its
traffic has thinned the same way.

### Needs first

- **Spec A built** (Q-51): storage, owners and accounts. Queued, not built.
- **Spec B1 built** (Q-52, Q-53): the moon port's hole making fuel, the stand-in route, targets
  and the dev cards. Queued, not built. This step waits for Q-53.
- Fuel steps 1, 2 and 2b (built): `refuel`, `fuelLow`, `burnHome`, record charging per leg.
- Chatter (`src/chatter.ts`, `src/radio.ts`, exists).

### Not in this step

- **Haulers landing on a body** and its fixed landing cost (*decided* 2026-11-11): B1's stand-in
  route replaced the trip. They return with spec C's lanes if a lane ends at a body.
- **The hauler's own tank:** stand-in haulers stay unmetered until spec C's lanes.
- **Prices and markups** (source → hauler → station → ship): spec C, Q-49.
- **The pirate base's real fuel:** S-86.
- **Personality in the station's reply:** the face cast.
- **Running dry and rescue:** step 4, unchanged.

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
