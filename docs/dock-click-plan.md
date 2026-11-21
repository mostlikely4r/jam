# Dock click plan: coming home before the autopilot

*Written 2026-11-20, from the first no-player runs (`docs/no-player-runs-findings.md`). Built
2026-12-01, and the click itself taken back out the same day, by the player's call: see "What was
built" at the end. Items marked *decided* are the user's calls; the rest is my proposal.*

**What stands:** the settle fix (finding 2), the journey's four slots (finding 4), and the
pilot-only check, which came back with finding 1 pinned on the route rather than on a stale berth.
The click and its dock order are gone, and this plan is why they were built before they weren't.

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

## What was built

*2026-12-01. All five parts went in, then part 3 came out again the same day. Numbers are in
`docs/no-player-runs-findings.md`, under "Coming home: the settle, and the ring round the
station".*

1. **The pilot-only check**: `src/profile/dockchase.ts`, `npm run dockchase -- [starts] [seed]`.
   Each start is its own game, warmed by its own share of the station's orbit, so the starts meet
   the dock all round it. It now measures one thing: a floater with a full hold at the home field's
   edge, sent home by a click on the berth whenever it has no order. **17 of 20, median 18.7 s** —
   the same before and after the settle fix, which is how the check earned its keep: it moved
   finding 1 off "the berth has moved by the time you get there".
2. **The settle fix**: the shape changed, and the plan was wrong about the spin.
   - What was proposed — "stop turning the nose for corrections smaller than what a flip is worth,
     let the spin settle, widen the landing circle if needed" — cannot get a spin of 0.3 radians a
     second. A hull with no side thrusters brakes only by turning its nose against its motion, and
     its rotation thrusters make that turn at about 1.5 radians a second. So the settling stage
     could only ever be quiet by not being needed.
   - What was built: `ClickPilot.coastIn`, for a plain click move on a hull without side thrusters.
     It coasts in at the speed it came in at and makes *one* turn and *one* burn, timed so they end
     it on its spot, instead of stopping on arrival and easing the last stretch — which is what
     turned the nose for every flicker of the correction and tumbled the hull. It counts as landed
     at rest within 8 units of the spot (`BRAKE_MISS`, inside the ship's own 12-unit radius)
     because such a hull can't hover; the plan's own fallback, a wider circle.
   - Only where the line to the spot stays a line: not inside a deposit's ring, whose carrying
     swings it round, and not where a POI's carry fades with distance. Those keep the old ease.
   - Measured on a fixed spot: 50 units 7–8 s (was 14–16), 300 units 12–13 s (was 19–21), with one
     turn of the nose instead of three or four. Hulls with side thrusters land exactly as before,
     and their tests are untouched.
3. **The dock order and the click: built, then removed.** `Sim.orderDock`, `Sim.stationAt`, the
   right-click handler in `main.ts`, the help line, and the pilot's dock flag all went in and all
   came out again, by the player's call:
   - A right click on the pad has to keep meaning *fly there and stop, **where I clicked***. Being
     able to choose the spot on the pad is worth more than one click saved.
   - A double click already worked on a moving dock: measured 12 of 12 from 400 to 2,600 units out,
     on the build before this work and after it, in the same times. Finding 1's premise — that a
     person has to learn to lead the dock — was a guess from a bot log and was wrong.
   - A dock order given to the bot only would have broken the rule the bot is held to (`BOT_CALLS`:
     every input it makes is one a player's hands can reach), so it went with the click. The bot
     flies home by the click a player gives, on a line picked to miss the rocks.
4. **The journey and the bot**: the last step is `{ label: "system chart, autopilot", parts:
   ["starmap", "autopilot"] }`, the route planner has left it, and a full computer makes room by
   unloading click-to-turn once the turret is fitted. `setProgram` was already in `BOT_CALLS`.
   - Of finding 2's workaround, the "arrived and slow, click the ship to stop" re-stop in
     `head()` has gone: an arrived order now ends itself. The stop before shooting stays, because
     the hand on the turn keys needs the pilot out of the way, which is a different reason than
     the one the workaround was for.
5. **The findings doc**: a dated section at the end of `docs/no-player-runs-findings.md` with the
   judgement on each finding, the numbers above, and where a run stalls next.

### The review

Run by codex/gpt-6-luna against the uncommitted tree, on this plan and `AGENTS.md`. Two findings:

- *"The coasting branch returns without controls, so a ship may coast past its target and never
  recover."* Checked and left as it is: passing the spot is not a hole, since the closing check
  drops out of the coast the moment the ship is past and the brake takes it from there. Measured on
  orders of 600 to 6,000 units (up to 308 units a second, from three starting angles each): every
  one ended, within 6.5 units of its spot, apart from the ones that stopped further off and were
  eased in, which also ended.
- *"The bot should stop its dock order when it is near the berth, as `head()` did."* As the plan
  asks, a dock order was to be given again only if it ended without docking. Moot now: the dock
  order has gone, and the bot's click orders go through `head()`, which does stop once it is close.

### What the plan didn't foresee

- **The click was the wrong call, and the player knew it.** A click on the pad, or a double click
  for move-and-stop, already docked a moving dock, from inside the screen. Nothing about the
  player's way home needed fixing. What needed fixing was the order standing for 20 to 40 seconds
  after it arrived (finding 2), which the player never saw *because* docking ends the order.
- **Finding 1 is the route's ring, not the berth moving.** The route keeps a ship outside a
  254-unit circle round the station's centre; the berth is 300 from that centre, so an approach
  from the far side circles and never closes. That is the three misses in 20 in the check, and the
  same wall the bot meets an hour in, not the stale destination the plan blamed. **The ring is the
  next thing to fix**, and it is a route change, which this plan put out of scope.
- **A course at speed rams rocks.** A follow order flew at 257 units a second with 500 units of
  look-ahead, straight into the field's rocks; the click order the bot gives itself picks a line
  with none on it. That difference is why the bot's home trip went back to a click.
- **A hull with `strafe` and no `reverse` never lands a click order** on a fixed spot in open
  space: it can only brake to about 9 units and its landing circle is half a unit. Pre-existing,
  and left alone because hulls with side thrusters were to land exactly as they did.
