# Ammo plan (spec B2)

Written 2026-11-27, from a product talk with the user (roadmap step 5, `docs/roadmap.md`). Nothing
here is built yet. Items marked *decided* are the user's calls; the rest is proposal, open to veto.
The words (frame, mount, part, capability) are in `docs/framework.md`. This plan sits on spec A
(`docs/station-frames-plan.md`, Q-51) and spec B1 (`docs/recipes-factories-plan.md`, Q-52 and
Q-53): station storage, trade points, owners and accounts, factory parts, and the stand-in hauler
route.

## Why

Nothing is used up while you work, except fuel. Gun 1 fires forever, so goods only flow one way
(ore in, parts out), and nothing answers "what is my gun shooting". The roadmap picked ammo as the
second thing a factory makes because a flow needs something consumed all the time (*decided*,
roadmap). It's fuel's twin: a part consumes an item from where its entity stores it
(`docs/framework.md`, "What parts consume").

Ammo also gives a shortage a face. A station that runs out of ammo loses its miners, who move to
a station that has it, for good (*decided*). That's the same lesson future player-owned stations
will teach: let fuel or ammo run dry and you lose your traffic (*decided*, the user's words).

Premises: the rules are the user's own design, from this talk. The numbers are guesses: rounds per
box, the box price, and the factory's speed. The user's target for them (*decided*): with normal
rough play, **the bay fills with ore before the ammo runs out, and the ammo runs out before the
fuel does**. Today's only measurement is the gun's rate: Gun 1 fires 7 shots a second
(`shotsPerSecond` in `src/tuning.ts`), so the 20 rounds the talk began with last about 3 seconds.
That's why step 1 measures before anything is set, and slice 1 stops for the user to try.

## The picture

**The ammo box**

- **Ammo lives in the cargo bay** (*decided*), as an item: an ammo box, one cell, the room of one
  ore (proposal for the size).
- **A box holds charges** (*decided*): rounds, up to the box's full count. A box with rounds left
  stays in the bay as it is. Rounds per box is a tuning number (*decided*: "we tune that"), set by
  step 1's measurement.
- **Buying tops up the lowest box first** (*decided*), before a new box is added. You buy rounds,
  not boxes: topping a box from 12 to 20 costs 8 rounds' worth.
- **The gun draws from the lowest box too** (proposal), so a nearly empty box runs out first and
  leaves the bay, freeing its cell.
- **An empty box is gone** (proposal): it leaves the bay when its last round is fired.
- **The shop buys boxes back** (proposal) at the rounds left in them, as it buys other items.

**What uses it**

- **Gun 1 uses ammo** (*decided*, roadmap): one round per shot, on every mount it sits on
  (straight or on a turret). Several Gun 1s fire from the same boxes.
- **The part declares it** (*decided*, framework: "a part declares what it consumes"): Gun 1's item
  data gets `consumes: { item: "ammo", each: 1 }`, and the gun system reads that, not the part's
  id. Proposal: Gun 2 stays ammo-free in this build. That's a choice in its data, so the designer
  can change it.
- **The ammo-free mining tool is the laser** (*decided*), bought later if you want it, not needed
  for idle mining. It isn't in this build.

**Running out**

- **An empty Gun 1 stops** (*decided*). You fly home with what you have.
- **The player knows** (*decided*: "a sound or visible effect"; the shape is proposal):
  - a dry click on fire, at most at the gun's own rate (a new `dry` sim event, played in
    `src/audio.ts`);
  - "Out of ammo" floating up from the ship once when the last round goes, drawn the way a
    refinery's payout shows its credits where it was paid;
  - in the ship screen (I), each box shows its rounds, and Gun 1's icon greys out with a 0 while no
    rounds are aboard.

**The bay's two settings**

- **Selling ore and keeping ammo are settings on the cargo bay** (*decided*), not a program, so
  they cost no computer slot. They become a program with the computer rework (*decided*). Until
  then they're written as temporary.
- **Two tweaks** (*decided*), opened by right clicking any cargo bay in the ship screen, the way a
  program's tweaks open:
  - **Sell ore:** on or off. Today every dock sells your ore with no say in it. Off, the ore stays
    aboard, for carrying elsewhere or for the deposit.
  - **Keep ammo boxes:** how many full boxes the dock tops you up to (proposal: 0, 1, 2, 3, 5 or 8).
- **Starter ships start with Sell ore on and 3 full boxes** (*decided*). Every new ship does: the
  player's, traffic, drones, defenders and pirates.
- **One set per ship** (proposal): the bay is one grid however many bay modules it has, so the
  picks are stored once, under `cargo` in the ship's `tweaks`, and every bay opens the same two.
  Tweaks today live only on programs (`src/programs.json`, `TweakPicks` in `src/programs.ts`). The
  bay items get a `tweaks` list in the same shape in `src/items.json`, read by the same menu.

**At the dock**

- **Ore sells first, then ammo restocks** (proposal), so the room the ore leaves can take boxes.
- **The dock restocks at any dock it holds ammo** (proposal), like ore selling (`isHome` in
  `src/sim.ts`): it buys rounds from the station's storage through its trade point, topping the
  lowest box first, then adding boxes, until the ship holds its keep count of full boxes. Extra
  boxes are never sold off. It stops at what the bay has room for and what the purse can pay.
- **Ammo ignores the traffic buffer** (proposal), as fuel does: it's what lets a ship work.
- **Who pays** (proposal) is who pays for fuel today: the ship's account (its owner's for a drone),
  a defender's station, and the pirate base's account for a pirate.

**Where ammo comes from**

- **Made by a factory, carried by haulers** (*decided*: a factory making ammo is a requirement of
  this build). It's a B1 recipe, parts → ammo box, run to stock by a factory part.
- **The default setup** (proposal, designer configuration): an ammo factory (kind `ammo`, to stock)
  next to the ore → parts factory on Planet base (`n10`), and one on Ringside (`n24`), which B1
  already made a self-supplied far island. Recipe: 1 part A → 1 box, 5 s at speed 1. Target 40
  boxes. No blueprint condition, like parts.
- **Every station keeps an ammo target** (proposal: 30 boxes) through B1's `needsItem` and
  `itemTarget`, so the stand-in hauler brings ammo with the parts from its supplier. The home
  Station gets its ammo only when its hauler comes back.
- **The pirate base is the one exception** (proposal, temporary): it has no hauler and no factory,
  so its storage is topped up from nothing, booked in `itemFlow`, the way pirates' fuel comes today.
  Where it really gets ammo (raids, the black market) is parked as S-86.

**Everyone follows the same rule** (*decided*)

- **Traffic, drones, defenders and pirates** use ammo as the player does. A ship whose Gun 1s are
  all dry breaks off and goes home, the way a low tank does today (`fuelLow` in `src/pilot.ts`).
  For traffic and drones that means `hauling = true`. For defenders and pirates it means
  `headHome`.
- **A miner that docks and gets no ammo** (*decided*: "C and D"). "No ammo" means no rounds aboard
  after the dock's restock (proposal). If it got some but not all, it goes back to work. It then
  tries, in this order:
  1. **Another job here**, one its parts allow (*decided*): a block job if it's a tow ship
     (`takeBlockJob`), or else a trade run (`chooseTrade`, which buys a load to bring back and
     needs no gun). It keeps its home and checks again at its next dock.
  2. **Move** (*decided*, for good): its home (`ship.home`) becomes the nearest other station that
     has ammo in storage now and that its fuel can reach (proposal: the same route-and-burn
     estimate as `burnHome`). It works that station's field from then on and moves again only if
     its new home starves too (*decided*). It says so on the radio as it leaves, a staying
     miner sometimes answers, and the station signs off plainly (*decided*). The chatter and the
     move are shared with fuel: see **The chatter** in step 3 of `docs/fuel-plan.md`.
  3. **Wait at the dock** (proposal), checking again every few seconds, so a stuck ship stays
     visible.
- **Drones never move** (proposal): they're the player's. They take a job if they can, or wait.
- **Defenders never move** (proposal): they wait at their station, which is now open to pirates.
  A pirate waits at its base, which never runs dry in this build.
- **Out of view** (proposal): a trip record is charged rounds for its mining stay at the measured
  shots per ore, and never runs dry out there, just as its tank is charged per leg. It restocks at
  its dock visit (`dockVisit`, `fighterArrived` in `src/sim.ts`), taking real boxes from storage.
  A record that gets no ammo runs the same three choices at that visit.

## The build

Two slices, every step committed on its own.

### Slice 1: the box, the gun, the bay, the factory

**1. Measure.** Before ammo exists, count what a trip fires. A probe, `src/profile/ammo-probe.ts`,
runs the no-player sim for an hour of game time and logs, per traffic trip: Gun 1 shots fired, ore
delivered, fuel burned, and why the trip ended (full, fuel, hull). It also runs the bot
(`src/bot/bot.ts`) as a stand-in for rough player play. From its medians, set the starting
numbers in `src/tuning.ts`: `ammoRounds` (rounds per box), so that a starter's 3 boxes last about
1.5 full loads, and below the shots a full tank's worth of mining fires. If those two bounds
cross, write that down and pick the middle. Log the run to `docs/parity-log.md`. This is the one
time the probe gates a step, because the numbers come from it. Afterwards it runs in the
background like the other `src/profile` scripts.

**2. The ammo item and charges.** In `src/items.json`, add `ammo` ("Ammo box", type `ammo`, 1×1,
`charges` from `ammoRounds`, a starting price of 5 per box as a guess, recipe from step 4). A
`Module` (`src/fitting.ts`) gains an optional `charges`, saved, for items that have them. The bay
grid (`src/grid.ts`) treats a box like any other item, including the bay's settling. The ship
screen (`src/inventory.ts`) shows each box's rounds on its tile. Buying (`buyPart` and the shop,
`src/shop.ts`) tops up the lowest box before placing a new one. Selling a box pays for its rounds
left. The shop lists ammo with the goods. The tab menu's Parts group gives full boxes.

**3. Gun 1 consumes.** Add `consumes` to item data and the matching part (`src/parts.ts`: Gun 1
only). `fireGun` (`src/sim.ts`) takes a round from the lowest box per shot and doesn't fire
without one. `workingGuns` stays as it is (a dry gun is undamaged). A separate check, "has
rounds", decides firing, auto-mine (`autoMine`) and auto targeting's fire. On Space with no
rounds, a `dry` event, at most once per the gun's cooldown. The last round fired raises
"Out of ammo" once, and Gun 1's icon greys out with a 0. AI: a ship whose Gun 1s are all dry and
that has no other working gun goes home (traffic and drones `hauling = true`, fighters
`headHome`).

**4. The bay's settings, the dock, the factory.** The two tweaks on the bay items, stored under
`cargo`. `unloadOre` reads Sell ore. A new dock service, `restockAmmo` (next to `refuel` in the
sim step, for the player and every pilot), runs once the ore to sell is gone, as under **At the
dock**. New ships start with 3 full boxes placed in the bay. Add the ammo factory and recipe to
Planet base and Ringside in `src/designer/world.json` (then `npm run world`), and the ammo
targets. Top up the pirate base's storage from nothing, booked in `itemFlow`. `src/farside.ts`
gets a `restockAmmo` line (in view only, with the record's stand-in from step 6). Until step 5,
a miner that gets no ammo waits at the dock.

**Stop here for the user to try.** Do 3 boxes feel right next to a full bay? Is the dry click and
"Out of ammo" enough of a sign? Do the box price and the cells the boxes take from the starter's
bay feel fair? The numbers get tuned here, before slice 2 leans on them.

### Slice 2: the shortage

**5. No ammo at the dock.** For traffic, the three choices under **Everyone follows the same
rule**: a job here, else a move, else a wait. Drones and defenders take a job or wait. The move
changes `ship.home` and the pilot's `working` field (`ownField`), with the chatter. The move and
the chatter are one function shared with fuel step 3 (`docs/fuel-plan.md`, proposal:
`Sim.moveHome(pilot, reason)`): whichever is built first writes it, and the other reuses it. The dev
card on the chart (B1's, `src/chart.ts`, `?dev`) adds each station's ammo bar (it's an item in
storage, so the bar comes with B1's card) and a count of miners moved in and out.

**6. Out of view.** Trip records are charged rounds per mining stay. Restocking at `dockVisit` and
`fighterArrived` takes real boxes. A record that gets none runs step 5's choices there. The
`farside.ts` lines say so.

### Saves

`SAVE_VERSION` goes up by one from B1's 13 to 14, in step 2 (a box's charges). Loading an older
save: every ship with Gun 1 gets its keep count of full boxes, placed where they fit in the bay, so
nobody starts dry. The bay tweaks read as their defaults when missing. `ship.home` is already
saved.

## How we'll know

- **Unit tests** (new, `src/ammo.test.ts` unless a suite fits better):
  - A shot takes one round from the lowest box. A box at 0 leaves the bay. No rounds: no shot, one
    `dry` event per cooldown.
  - Buying rounds tops up the lowest box first, then adds boxes, and stops at the bay's room and
    the purse.
  - The dock: Sell ore off keeps the ore aboard. Keep ammo boxes 3 tops a ship with boxes at 4 and
    20 rounds up to three full boxes and never sells a fourth. Restock waits for the ore to sell.
  - Who pays: the ship, its owner for a drone, the station for a defender, the pirate base for a
    pirate.
  - The ammo factory makes boxes from part A at its rate into storage, and the stand-in hauler
    brings them to the home Station.
  - A traffic miner whose guns go dry goes home. At a dock with no ammo it takes a trade run (or a
    block job if it's a tow ship), else moves its home to the nearest station with ammo it can
    reach, else waits. A drone and a defender never move.
  - A record out of view is charged rounds per stay and restocks at its dock visit. With no ammo
    there it makes the same choice.
  - Saves: a version 13 save loads with full boxes on every Gun 1 ship.
- **Existing suites:** `fuel.test.ts`, `automine.test.ts`, `targeting.test.ts`, `pilot.test.ts`,
  `shop.test.ts`, `farside.test.ts`, `save.test.ts`, `sim.test.ts` and `records.test.ts` pass.
  They may change only where they assume a gun fires forever or a new ship's bay is empty.
- **The probe** (step 1) is rerun after step 4 and step 6, in the background, logged to
  `docs/parity-log.md`: per trip, how it ended. Fuel should end fewer trips than ammo, and ammo
  fewer than a full bay. Moves per station over a few hours are measured, never a failure.
- Full check: `npm test`, then `npm run build`.

**Try it (slice 1):** `npm run dev`, new game. Open the ship screen (I): three ammo boxes sit in
the bay with their rounds. Mine as you like: the boxes count down, the lowest first. Fill the bay
and dock: the ore sells and the boxes fill back to three. Then hold Space at nothing until it runs
dry: a dry click, "Out of ammo", and a grey Gun 1. Right click the bay to try Sell ore off and a
different box count.

**Try it (slice 2):** `?dev`, open the chart (C). In the system designer, turn Planet base's ammo
factory off and speed up time. The home Station's ammo bar falls. Its miners take trade runs, then
move to Ringside one by one, saying so on the radio, and the Station's card counts them out.

## Needs first

- **Spec A built** (Q-51): storage, trade point, owners and accounts, the pirate base as a frame.
  Queued, not built.
- **Spec B1 built** (Q-52, Q-53): the recipe shape, factory parts, `needsItem`, the stand-in
  route and the dev cards. Queued, not built. Slice 1 waits for Q-53.
- Fuel steps 1–2 (`docs/fuel-plan.md`, built): `fuelLow`, `refuel`, record charging per leg.
- Auto targeting (Q-31, built) and the bot (`src/bot/bot.ts`, exists).

## Not in this build

- **The laser** (ammo-free mining, bought later) and **ammo types with damage types** for the
  hunt (S-80's notes).
- **The pirate base's real supply** of ammo (raids, the black market): S-86.
- **The bay settings as a program:** with the computer rework.
- **Prices from stock** for ammo, and lanes instead of the stand-in route: spec C, Q-49.
- **Knowing where ammo is by news:** a moving miner reads stock directly for now. Later it could
  go by what it has heard (`news`), going stale like the rest.
- **Moving thrusters onto `consumes`:** fuel keeps its tanks and its own path. The field is
  general, and the thrusters move onto it when fuel step 3 (Q-7) is rewritten, if that helps.
- **Player-owned stations** whose traffic leaves when they run dry: the picture this points at,
  not built here.
- **The running-low light for ammo** (live shapes, slice 2, `docs/live-shapes-plan.md`): a shape
  can blink while the ship runs low on a named item. If that slice is built first, this build adds
  one line: `shipArtState` (`src/artState.ts`) fills `supply` for the ammo item with the rounds
  held as a share of what the ship's bay keeps (0 to 1). No other ammo code is needed for the
  light.

## Not doing

- **No magazine part or ammo inside the gun.** Ammo lives in the cargo bay (*decided*).
- **No ammo from nowhere at stations.** It's made by a factory and hauled (*decided*), except at
  the pirate base for now.
- **No weak fire when empty.** An empty Gun 1 stops (*decided*).
- **No lean back home.** A miner that moved stays (*decided*).
