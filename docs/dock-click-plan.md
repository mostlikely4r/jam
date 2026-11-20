# Dock click plan: coming home before the autopilot

*Written 2026-11-20, from the first no-player runs (`docs/no-player-runs-findings.md`). Nothing
here is built yet. Items marked *decided* are the user's calls; the rest is my proposal.*

## Why

The floating idle mining target in `docs/vision.md` says the trip home is effortless. The first
bot runs (`npm run bot -- floater`) found that, before the autopilot, it isn't even reliable: the
floater mines a full hold in a minute or two, then stalls a few thousand units short of the dock
and the run ends stuck. The autopilot that would fix it is the journey's last step, paid for by
docking. A floater that can't dock can't buy its way out.

Reading the code shows why, apart from the bot:

- A right-click without the autopilot is a plain `ClickPilot.moveTo` to a fixed world spot
  (`orderTranslate`, or `orderMove` on a double click). The spot is a loose body that only the
  station's carry moves, and the carry fades with distance from the station. So a click on a
  far dock points at where the berth **was**. The berth moves about 50 units a second.
- The pilot flies there, arrives, and settles. For a hull with no side thrusters the settle turns
  the nose for every tiny correction and tumbles for 20 to 40 seconds (finding 2). By then the
  dock is long gone, and the player clicks again.
- Docking itself is just being inside the dock box (`Sim.dockedAt`: 300 units square beside the
  station, no speed check), and `tuning.dockDrag` then holds the ship. Getting into the box is the
  whole problem.

The journey also can't finish on the floater's own computer (finding 4). The flight computer runs
4 programs; click-to-move and click-to-turn take 2, and the journey adds targeting, route planner,
system chart and autopilot.

## How the findings were judged

The findings came from a bot, so each was first judged: the game's, or the bot being dumb.

- **1, coming home stalls: the game's.** Mechanism above. A person may learn to click ahead of the
  dock, but leading a moving dock by eye isn't effortless either way.
- **2, an arrived order never finishes: the game's.** It is all inside `ClickPilot.settle` and
  `trim`; the bot only works around it.
- **3, click-turn can't hold a facing: dropped.** The bot re-issued `orderFace` every tick for a
  drifting rock, restarting the turn each time. That shows nothing about one order. Bring it back
  only if a single order is seen to overshoot.
- **4, four slots for four programs: the game's.** Plain arithmetic.
- **5, ore drifts off: dropped.** "Ore keeps the rock's velocity" is in the vision's chain; that's
  the design working. The 28-minute chase was the bot.
- **6, every new game has the same dice: the game's, but separate.** It wants its own decision and
  is not part of this plan.

## The picture

- **A right-click on a dock you can see flies in and docks, and follows the berth as it moves**
  (*decided*). It needs only click-to-move, not the autopilot. It is the follow the autopilot
  already uses (`ClickPilot.travelTo(poi, DOCK_OFFSET, 0)`), given by a click on the screen.
- **The autopilot keeps its own job** (*decided*): courses to places you can't see, picked on the
  system chart. Today a course can only be given from the chart (`main.ts` calls `orderTravel`
  only from the chart's pick), so that stays as it is.
- **The settle gets fixed first** (my proposal, agreed): a floater ordered onto a spot lands and
  the order ends, instead of tumbling. It is in the path of every dock, and it may be most of
  finding 1 on its own.
- **A pilot-only chase check, before and after** (my proposal, agreed): it measures the game's
  click pilot with no bot in the way, so the numbers say what the game does, not what the bot does.
- **The floater's journey ends on four slots** (*decided* along with the dock call):
  - **System chart and autopilot are one step**: the autopilot is useless without the chart.
  - **The route planner leaves the journey.** It only routes click moves round things, and a
    course already routes itself. It stays in the shop for whoever wants it.
  - **Click-to-turn is unloaded once the turret is fitted**: the turret aims for you, so the slot
    goes to the chart. The four then are click-to-move, targeting, system chart, autopilot.
    Choosing what runs becomes a real trade-off, not a seventh purchase. This rests on the
    hand check below: if a turret floater misses click-to-turn, come back to it.

## What to build

### 1. The pilot-only chase check

A slow script, `src/profile/dockchase.ts` and `npm run dockchase`, in the style of the other
`src/profile` scripts: it logs results and never gates done.

- Shipped world, floater start, `chatter: false`, as `src/bot/run.ts` builds it.
- For each of 20 starts, spread over the home station's orbit phase (step the clock, or use
  different seeds): put the floater at rest at the home field's edge nearest the station, give it a
  full hold, and send it home the way a player with no autopilot would.
  - **Before** (today's game): `orderMove` to `sim.dockPoint(false, station)`, and again whenever
    the click pilot has no order. No more than once a second. Nothing else: no leading, no
    stopping by hand.
  - **After** (once step 3 is in): one `orderDock(station)`, and again only if the order ends
    without docking.
- For each start, log: docked or not within 5 game minutes, the time it took, how many orders it
  took. End with the count docked of 20 and the median time.
- Write the before numbers into `docs/no-player-runs-findings.md` (step 5) before anything else
  changes, so the after numbers have something to stand against.

### 2. The settle fix (finding 2)

In `src/pilot.ts`, `ClickPilot.settle` and `trim`, for a hull **without** side thrusters (no
`strafe` part). Hulls with side thrusters must land exactly as they do today.

What done looks like: a floater with a click order onto a fixed spot 50 units away lands, and the
order ends (it reaches `facing` and then cancels), within about 15 game seconds. While settling, its
spin stays small (under about 0.3 radians a second), and the nose doesn't swing back and forth.

The shape of the fix is the builder's call. My proposal, in the order to try:

- Once it is landed (inside `LANDING_TURNING` and slower than `LANDING_SPEED`) or close to it,
  stop turning the nose for corrections smaller than what a flip is worth. Burn only when the nose
  already points near the needed direction, and otherwise coast.
- Let the spin settle (the turn controls cancel spin the order itself made) before it turns for
  the next burn.
- If neither is enough, widen the landing circle for hulls without side thrusters: landing a slow
  hull within 2 units isn't worth 30 seconds of tumbling.

### 3. The dock order

**`Sim.orderDock(station: Poi): boolean`** in `src/sim.ts`, beside `orderTravel`.

- Refuses (returns false) without `clickMove` on the ship, or if the place isn't a station dock.
- Otherwise `this.clickPilot.travelTo(station, DOCK_OFFSET, 0)`, with the order marked as a dock
  order.

**`ClickPilot`** in `src/pilot.ts`:

- `travelTo` takes a flag (or a second entry point) marking the order as a dock order. In
  `update`, a follow order needs `"autopilot"` today; a dock order needs `"clickMove"` instead.
  Losing click-to-move mid-flight cancels it, as for any click order.
- The follow is the existing one: `courseSpot`, `travel`, then `stopping` and `settling` against
  the berth's real motion. Nothing new about how it flies.
- **It ends when the ship is docked at that station** (`sim.dockedAt(ship) === station`), not
  when it has finished settling on the berth's centre. Inside the box the dock drag holds the ship,
  so there is nothing left to do, and ending there keeps step 2's settle out of the dock.
- `task` reads as for a course ("on course", "coming in").
- Hands on the keys work as for any order: it waits, then flies again from where they left it.

**The click**, in `main.ts`'s right-button handler (around line 1355):

- Today: not dragged, not on the ship or the destination, so `orderTranslate` (single) or
  `orderMove` (double click).
- New: before those, if the world spot under the click is on a station, whether its solid box or its
  dock box, call `sim.orderDock(station)` and return. Single and double click do the same.
- It needs a hit test, `Sim.stationAt(x, y): Poi | null`, using the station's own axes as
  `dockedAt` does, against the combined shape (`STATION_SHAPE_CENTER`, `STATION_SHAPE_HALF`).
  Add a small margin in screen pixels if a click on a zoomed-out station is too hard to land.
- A **drag** that starts on a station stays a drawn move, as today. Only a plain click docks.
- "You can see" means it is on the screen to be clicked. There is no distance limit beyond that.
  Far docks are the chart's and the autopilot's.
- If `orderDock` refuses (no click-to-move), the click falls through to today's orders.
- The help list (`main.ts` around line 373) gets a line, shown with `has("clickMove")`:
  "Right click a dock: fly in and dock, following it as it goes round".

### 4. The journey and the bot

- **`src/bot/plan.ts`**: step 6 becomes `{ label: "system chart, autopilot", parts: ["starmap",
  "autopilot"] }`. The route planner leaves the plan.
- **`src/bot/bot.ts`**:
  - `home()` without the autopilot calls `sim.orderDock(dock)` instead of a click order to
    `dockPoint`. It is given again only if the order has ended without docking, at most once a
    second. Add `orderDock` to `BOT_CALLS`.
  - With the autopilot, `home()` keeps using `orderTravel` (the chart's course), as now.
  - Once the turret is fitted and the computer is full, it unloads `clickTurn` with
    `sim.setProgram(ship, "clickTurn", false)`, as a player does in the inventory, and logs it as an
    input. Add `setProgram` to `BOT_CALLS` if it isn't there. The bot turns the hull with
    `controls.turn`, not `orderFace`, so it loses nothing it uses.
  - A program that still finds no free slot is logged as the refusal it is today. It is not worked
    around.
- The workaround for finding 2 (`orderStop` once in range and slow) stays in the bot until step 2
  is in and the check shows it isn't needed. Then remove it, so the bot flies as a player would.

### 5. The findings doc

In `docs/no-player-runs-findings.md`, add a short dated section at the end:

- The judgement on each finding (as under "How the findings were judged" above), so 3 and 5 aren't
  picked up again as if they stood.
- The chase check's before numbers, then after numbers.
- A one-line pointer to this plan.

## Edge cases

- **Two docks near each other**: the click picks the station under the cursor; there is no
  nearest-dock guess.
- **Already in the dock**: `orderDock` on the station it's docked at ends at once (it's docked).
- **The station passes between the ship and its berth**: the follow already routes round things in
  the way (a follow order uses `routeAround`). If the solid box gets hit in the check's runs, that
  is a finding for the route, not a reason to change the click.
- **Another order given mid-dock** (a click elsewhere, a stop): it replaces the dock order, as
  any order does.
- **Wrecked while docking**: the order goes with the ship, as today.
- **A hull with the autopilot**: a click on a visible dock gives the same dock order. The chart's
  course is unchanged.
- **The racer** (no click-to-move): the click falls through and nothing changes for it.

## How we'll know it works

- `src/pilot.test.ts`:
  - A floater settles onto a fixed spot 50 units away, and the order ends within the time and
    spin above. A hull with side thrusters still lands within `SETTLED_DISTANCE`.
  - `orderDock` with click-to-move and no autopilot, from the home field's edge, docks within
    5 game minutes at three or more orbit phases of the station, and the order is gone once docked.
  - `orderDock` refuses without click-to-move, and a dock order is cancelled when click-to-move is
    unloaded mid-flight.
  - Hit test: `stationAt` finds the station for points on its solid and dock boxes, at a few
    rotations, and nothing just outside.
- `src/bot/bot.test.ts`: the surface test passes with `orderDock` (and `setProgram`) in
  `BOT_CALLS`; the plan has six steps, the last chart and autopilot.
- These tests run the sim: put them where the existing pilot and bot tests are, in `test:fast`'s
  slow list if they're slow.
- `npm test` and `npm run build` pass.
- **In the background, never gating done**: `npm run dockchase`, after numbers against before, and
  `npm run bot -- floater 6 <seed>` for seeds 1 to 5. Success looks like the after check docking
  20 of 20, and bot runs that get past step 1 to the turret and beyond. How far they get, and where
  they stall next, goes in the findings doc.
- **By hand, in the game**:
  - Floater, no autopilot: fill the hold in the home field, right-click the dock once, and look
    away. It should dock without another click, five times out of five.
  - With `?dev`, after the turret is fitted: unload click-to-turn and mine for five minutes. If you
    never miss it, four slots are enough. If you do, the slot decision comes back.
- Then revisit the floating idle mining target in `docs/vision.md` (it stands at 3, revisit next).

## Not doing

- No stationary berths: stations keep their orbits.
- No bigger dock box, and no cheaper or earlier autopilot: they move the problem instead of
  fixing the click.
- No navigation computer as a seventh journey step.
- No station that draws ships in by itself. It's held in reserve if the click proves not enough.
- No fix for finding 6 (the warmed start's dice) here.
