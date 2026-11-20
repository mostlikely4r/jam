# Fuel plan

Written 2026-11-20. Nothing here is built yet.

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

## Step 2: tanks and refuelling

- **Tank size per hull** goes in `src/hulls.json`, set from step 1's numbers. Proposal: about
  4 typical trips for traffic, with the player's starter hull the same as a traffic racer's.
  A tank that can't hold a trip home from the furthest field is too small. Ships start full.
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
- Extra fuel tank modules, and tanks as damageable or explosive modules. The fitting plan's
  explosive tank can build on this later.
- Turning fuel on for the public build before the user has played it.
