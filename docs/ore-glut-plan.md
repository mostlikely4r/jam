# Ore glut plan

Written 2026-11-23, after auto-mining (d5275d5) went in. All four steps are built (2026-11-23).

## Why

From the user's own play (a save from 2026-11-23): the player and traffic sit docked at a full
station, about 4 minutes before the hauler comes, just to offload ore. The user started a station
project only so the station would have something to spend its parts on. With auto-mining, the
user wants a bigger hull that floats for 30 minutes and comes back with a lot of ore. Today's
flow can't take that.

The cause, from the code: each station's demand is fixed. One hauler comes every 10 minutes
(`haulerInterval` 600 s) with room for 120 volume (`haulerVolume`), loading 2 items a second
(`haulerLoadRate`). The station stores 200 or 300 cells (`storage` in `src/designer/world.json`,
default `stationStorage` 300 in `src/tuning.ts`). No reason was ever recorded for these numbers
against the ore coming in. They date from 2026-11-05, when only the player mined. 120 was sized
for parts A coming in, not for ore going out. Meanwhile supply grew: traffic sells ore, and now
auto-mining.

This plan is the short-term half: you can see the deal before you dock, there's more room, and
traffic that's turned away does something you can see. Where ore finally *ends* (burned as fuel
or wear, or built into new stations) is the long-term question, left open below.

## The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

- **Station tooltip** (*decided*). Hovering over a station in flight shows its credits, when its
  hauler arrives, what it would pay for the ore in your hold, and a red cross when it's full.
  It answers the worry that a sale should never surprise you: you see the deal before you dock.
- **4× station storage and hauler room** (*decided*). The load rate goes up 4× with them
  (mine), or the wait just moves from "no hauler yet" to "hauler still loading".
- **No dynamic prices for ore yet** (*decided*).
- **Traffic turned away chooses** (*decided*). A trader that can't sell at a full station holds
  a few seconds, then picks one of four things, says why on the radio, and offers a link that sets
  your destination (not your home) to where it's going. The four are *decided* (the user: "all
  could work together... maybe some small logic or just a random dice"):
  - (a) wait at this station for its hauler
  - (b) sell at a field deposit
  - (c) go back to mining with what it carries, and return when full
  - (d) fly to the next station over
- **A weighted dice, not pure logic or pure random** (mine, the user agreed in principle).
  Random alone looks aimless, and pillar 1 wants every trip to have a reason. Pure logic sends
  every trader the same way at once. The weights below make each choice explain itself, and the
  radio line says the reason.
- **Wrecks cost parts** (*decided*). While writing this plan I found it is **already true**. See
  step 3.

## The build

Two halves, *decided*: steps 1 to 3 first, then step 4. Play between them.

### 1. Station tooltip (*built*): `src/sim.ts`, `src/render.ts`, `src/tooltip.ts`, `index.html`

Hover over a station in the flight view to get a canvas tooltip (`canvasTip` in
`src/tooltip.ts`, used today for the destination arrows in `src/render.ts`). Lines:

- The station's name (`placeName`).
- **Credits**: `base.account.credits`. A station buys on credit and can go below zero (see
  `unloadOre` in `src/sim.ts`), so it never refuses ore for want of money. Show the number
  as it is, negative included.
- **Hauler**: from `haulerEta(base)`. "at the berth" for 0, "none coming" for null, otherwise
  minutes and seconds.
- **For your hold**: what it would pay for the ore in your bay. Count only as much as fits in
  its free room (`storageFree`) and in the order `unloadOre` sells it. If not all of it fits,
  say how much: "pays 340 for 34 of 60 ore".
- **Room**: free cells against total (`storageFree`, `storageOf`).
- **A red cross** before the name when it has no room for even one of the ore items in your
  hold, or, with an empty hold, for one plain ore.

Edge cases: the pirate base gets no tooltip (or only its name). Hovering while docked works the
same. The tooltip follows the station as it moves on its orbit.

### 2. 4× storage and hauler room (*built*): `src/tuning.ts`, `src/designer/world.json`, `src/start.json`

- `stationStorage` 300 → 1200 in `src/tuning.ts`, and each station's `storage` in
  `src/designer/world.json` ×4 (200 → 800, 300 → 1200). Edit the world file, then run
  `npm run world`. The station default in `src/designer/world.ts` comes from the tuning
  default, so check that it follows.
- `haulerVolume` 120 → 480 and `haulerLoadRate` 2 → 8 in `src/tuning.ts`. Update the doc
  comment on `haulerVolume`: 480 now, for ore going out, and still enough for a station's whole
  stock of parts A coming in.
- Update the tweak ranges in `src/tuning.ts` so the new values sit well inside them.
- Saves: check whether a loaded save keeps the old storage (if a base's spec is saved) or picks up
  the new one. The user's save should get the new room after loading. If it doesn't, the build
  fixes that without breaking `SAVE_VERSION` 9 saves.
- `src/economy/cycle.ts` is a paper model with its own numbers. Leave it alone.

### 3. Wrecks cost parts: already built (*built*)

Found while writing this plan, in `src/sim.ts`:
- A traffic ship rebuilt at a shipyard pays through `chargeForService`, which spends the
  station's parts A at `serviceCreditsPerPart` (20). A floater's 300-credit hull uses 15 parts A.
  With too few parts, it isn't rebuilt (`hasStockFor`).
- The player's bare hull is paid the same way. A rebuild's extra parts come from the station's
  store or are made from its parts (`supply`).
- Pirates are rebuilt from the pirate base's credits only. Defenders aren't rebuilt; the station
  builds new ones from parts (`stationGuardParts`).

Nothing to build here. If no test pins "a rebuilt traffic ship spends the yard's parts A", add one
so this stays true.

**Stop here for the user to play.** The premise of steps 1 and 2 is the user's own play. The 4×
is a guess at enough. Does the wait at the dock go away? Does the tooltip make the choice clear?

### 4. Traffic turned away (*built*): `src/pilot.ts`, `src/sim.ts`, `src/chatter.ts`, `src/radio.ts`, `src/main.ts`, `index.html`

One thing the plan has wrong, found in the code: `depositFor` (`src/sim.ts`) only offers a deposit
*closer than the nearest dock*, and a ship at the berth is already at that dock, so it would never
find one. (b) needs the nearest deposit with room for its ore, the dock not counted.

Applies to traffic (`DronePilot` with `buys === "upgrades"` and no owner) in `src/pilot.ts`. Not
the player's own drones, pirates or defenders.

**Turned away.** It's docked, hauling, with ore aboard, and the station has no room for the
next ore item `unloadOre` would sell. Today it sits in the dock ("unloading") until there's room.
Instead it holds for a few seconds (proposal: 5), so it doesn't flicker on a store that's emptying
anyway, then rolls once for this stop.

**The weights** (mine, start values; tune in play). Each starts at 1, then:
- (a) wait for the hauler: ×4 if `haulerEta` is under 2 minutes, ×0.3 if none is coming or it's
  more than 6 minutes away.
- (b) a deposit: 0 if no deposit has room for its ore (`depositFor`). ×3 when the ship is short
  on credits (proposal: under the price of the next item on its wishlist, or under 100).
- (c) back to mining: 0 when its hold is at or above `deliveryLoad`, since a full ship can't
  mine more. ×2 when under half full.
- (d) the next station over: 0 if there is no other station with a dock, or once this load has
  already been turned away twice. ×0.5 when the trip is long (proposal: over 3 minutes by
  `tripSeconds`).

If all weights are 0, it takes (a). (a) never sits at 0, so the ship never wanders forever.

**What each does.**
- (a) Holds at the dock as it does today, until there's room. No new roll on this stop.
- (b) Sells at the deposit as `dropLoad` does now. Whatever the deposit won't take, it brings back
  to a dock as normal.
- (c) Goes back to its working field (`chooseField` as on any stay), keeps its cargo, and hauls
  again when full. Its next stop rolls afresh.
- (d) Picks the nearest *other* base with a dock. It's a guess, not knowledge: traffic doesn't
  know another station's store from afar (pillar 1). There it sells as usual. Turned away again,
  it rolls again. The load remembers which bases turned it away and won't pick them for (d).

Today `haul` always sells at `nearestDock`. With (d) the ship has to keep a target station for
this load, cleared when the hold is empty.

**Out of view.** Traffic away from the player runs as trip records (`dockVisit` in
`src/sim.ts`). It loops up to 120 seconds while the ship has ore, then carries on, ore and all.
Records must make the same choice: roll when turned away, then make the next leg (a: wait out
the stay; b: a leg to the deposit; c: a mining leg with the ore aboard; d: a leg to the next
station). Same dice, so a no-player run behaves like flown traffic.

**Radio.** Each choice has a few lines in `src/chatter.ts` that give the reason, such as "Store's
full. Hauler's three minutes out, I'll wait.", "Selling at the deposit, need the cash.", "Full
up here. Back to the rocks till the hauler's been.", "No room here. Trying {station}." They are
only said within `chatterRange` of the player, like other chatter. Records out of view say
nothing.

**The link.** Lines for (b), (c) and (d) carry a small button that sets the player's
*destination* (not home) to where the ship is going: the deposit, the field or the station.
It's `toggleDestination`, as the news board's ore lines do in `src/main.ts`. The radio log
(`src/radio.ts`, `#chatter` in `index.html`) is `pointer-events: none` today. Only the button
takes the mouse, so the log still doesn't block clicks in space. The line fades as usual
(14 s); the button goes with it.

## How we'll know

**Tests** (in the style of `src/items.test.ts` and `src/pilot.test.ts`):
- Tooltip numbers: what a station pays for a hold that fits partly, and the red cross when full.
- The new defaults: storage, hauler room and load rate. A hauler empties a full store of plain
  ore in one visit, in about the same time at the berth as before.
- A save from before keeps loading, and its stations get the new room (or the build's chosen rule).
- Rebuilt traffic spends parts A (step 3, if not already pinned).
- Turned away: with a fixed roll, each of (a) to (d) happens, and each weight rule holds (no (c)
  when full, no (b) without a deposit with room, no (d) to a base that turned this load away,
  (a) when everything else is 0).
- A record turned away makes the same choice as a flown ship with the same roll.
- No ship sits in the dock with ore for more than a set time (proposal: 3 minutes) unless it
  chose (a).

**No-player run** (background, log to `docs/parity-log.md`): over an hour, how long traffic
spends docked with unsold ore, before and after, and how often each choice is made.

**Try it.** Load your save. Hover over the station: you see its credits, the hauler's time and
what it would pay for your hold, with a red cross if it's full. Dock: you no longer wait minutes
to unload. After step 4: let the store fill (or turn `stationStorage` down in the tweaks), watch a
trader dock and be turned away. Within seconds it says what it'll do. Click the link in its line,
and your destination arrow points where it's going.

## Needs first

All exist today (checked 2026-11-23): `haulerEta`, `storageFree` and `storageOf`, `canvasTip`,
`depositFor` and `sellToDeposit`, `toggleDestination`, the chatter and the radio log with faces,
trip records with `dockVisit`, and `chargeForService` spending parts A on rebuilds. Nothing to
build before this.

## What changed from the plan

Steps 1 to 3, as built:

- **The tooltip's numbers are the sim's** (`oreSale` and `stationTip` in `src/sim.ts`), not the
  renderer's, so a test pins them without a canvas. The renderer only finds the station under the
  pointer, in the station's own turning frame, and hands the lines to `canvasTip`.
- **The red cross needed a colour**, which plain tooltip text has none of: `canvasTip` takes a
  `warn` flag, and `.tooltip.warn b` in `index.html` paints the name red with its cross.
- **Storage isn't saved**, and never was: a base's spec stays the world's, so a save from before
  loads into the new room. A test pins it rather than a change.
- **"A hauler empties a full store of plain ore in one visit" was never true and still isn't**:
  1200 cells of store holds more than a hauler's 480. The test checks what the plan's arithmetic
  does give: the hauler's whole hold (480 ore) loaded in the same 60 seconds the old 120 took,
  and a station holding that much emptied by one visit. Where the rest of a full store ends is
  the long-term question below.
- **`npm run world`** rewrote `world.json` (only the three storages: 200 → 800, 300 → 1200 twice)
  and re-warmed `src/start.json`.
- **The tweak range for `haulerVolume`** had to grow: 400 was its top and the new 480 is past it.
  It's now 0 to 2000, and `haulerLoadRate` 0.5 to 40.
- **Step 3's test** now exists: a rebuilt traffic ship spends 15 parts A of its yard's store, the
  same 300 credits at 20 credits a part any other service pays.

Step 4, as built (`src/pilot.ts`, `src/sim.ts`, `src/chatter.ts`, `src/radio.ts`, `src/main.ts`,
`index.html`, `src/tuning.ts`; tests in `src/turnaway.test.ts`):

- **The pilot decides, so records get it for free.** `turnsAway` in `DronePilot.haul` holds
  `turnAwaySeconds` (a new tweak, 5) while `oreSale` says not one item would go, then rolls
  `pickTurnAway` over `turnAwayWeights`. A record's `dockVisit` runs the same pilot tick by tick,
  so it rolls the same dice; its stay ends once the pilot `leavesStop`, and `nextLeg` reads the
  choice: a "trade" leg to the deposit, a field leg with the ore aboard, or a dock leg to the base
  it chose.
- **(b) needed its own deposit search**, as found in the code: `depositWithRoom` (nearest open
  deposit with room for one of the hold's ore items, the dock not counted). The chosen deposit is
  kept for the load (`sellDeposit`); what it won't take goes to the nearest dock.
- **(c) is off for a damaged ship** as well as a full one: low hull turns it for the dock again
  at once, so it would only bounce.
- **"Short on credits"** is under the next wishlist item's price, or under 100 with nothing left
  to buy.
- **(d) counts turn-aways, not bases**: a load turned away more than twice (the same base twice
  counts) no longer tries another station. `otherBase` gives the nearest base not yet tried.
- **The waiting line** says the hauler's time when one is due within 10 minutes, and otherwise
  just that it waits. Lines come from shared lists, not the voice packs; Gus and Pip say the same
  as anyone here.
- **The link** is a "Point there" button at the end of the line (`button.follow`), the only part
  of `#chatter` that takes the mouse. It calls `toggleDestination`, as the news board does.
- **Not pinned by a test:** that each weight is exactly as written for every mix of conditions.
  The tests pin the main rules (no deposit, full hold, no other station, a hauler due soon),
  each choice happening, records choosing as flown ships do, the radio line and its link, and a
  15-minute run where no one sits laden in a dock for 3 minutes unless it chose to wait.
- **The no-player run** to `docs/parity-log.md` (time docked with unsold ore, and how often each
  choice is made) isn't run yet. It's a background measurement, not a gate.

## Not doing

- **Dynamic ore prices** (*decided*: not yet). A full store pays the same; it just has no room.
- **Raising the hauler's visit rate.** The 10-minute interval stays. More room per visit is the
  fix chosen.

## Not in this build

- **The no-player measurement** of step 4: time traffic spends docked with unsold ore, before
  and after, and how often each choice is made, logged to `docs/parity-log.md`.
- **Voice-pack lines for being turned away.** Gus and Pip use the shared lines for now.
- **Saving a turned-away choice.** Pilot state isn't saved, so a load reloaded mid-detour goes
  to the nearest dock and may be turned away again.
- **Where ore finally ends.** Two kinds of sink were raised: burn (ore → fuel, wear, ships lost)
  and build (stations and projects that grow the world, the expansion-as-sim idea in
  `docs/maybe-later.md`). Undecided which carries most. 4× room only buys time against the big
  30-minute hull.
- **Factories at the far end of the hauler route.** Today haulers unload into an abstract hub.
  Real factories would fill up the same way unless a sink exists.
- **Traffic knowing other stations' stores**, through news carried by ships, so (d) aims better.
- **Pirate rebuilds using goods**, not only the pirate base's credits.
- **More things for traffic to buy.** Traffic buys its fixed upgrade list once and stops.
