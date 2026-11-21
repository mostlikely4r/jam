# Go home broken plan

Written 2026-11-21, after a throwaway log of the floater run that stalls on step 2. Nothing here
is built yet. It makes the no-player bot (`src/bot/`, `docs/no-player-runs-plan.md`) do two
things the user does by hand: go home when a module breaks, and come into a field slowly enough
to stop at the first rock it sees. Each step is measured with `npm run bot`.

## Why

`npm run bot -- floater 2 1` on commit f2c81d3 docks eight times, buys the cargo bay at 0:41, and
at 1:30 is called "stuck on step 2, turret: nothing bought and nothing earned for 15 game
minutes". A throwaway per-second log of that run (not committed; numbers below are from it) shows
why:

- **The gun is broken, and the bot doesn't notice** (measured). At 1:16:01, eleven seconds out
  of the dock on its way back to the field, the ship hits a rock 592 units outside the field at
  152 units a second: 15.5 hull, landing on the gun mount. The gun's wear goes from 0 to 0.52;
  a module stops working at 0.5 (`DAMAGED_AT`, `src/fitting.ts`). For the next 14 minutes the
  bot parks beside rocks, its nose within a degree of them and in reach, holds fire, and no shot
  leaves the ship (the ship's shot count stays at 1,164). It never goes home, because it only
  goes home with a full hold or nothing in reach, and it has 0 to 3 ore aboard. The dock had the
  parts to repair it and the bot had 128 credits.
- **Knocks cost about 40% of the income** (measured). 28 hits, 160 hull in 1.5 hours, nearly all
  the ship moving into a near-still rock. Each dock visit spent 60 to 80 credits of a 160-credit
  sale on hull and module repairs. The hardest hits come on the trips out and home (100 to 270
  units a second); the rest are small taps while turning by hand or moving through loose ore.
- **Ore lost to drift** (measured, not addressed here): of 419 pieces the ship broke loose, it
  picked up 95. That is `docs/no-player-runs-findings.md` finding 5, and the tractor (step 3)
  is its answer.

The user's own play (*decided*: this is how the user flies the floater and what the bot should
copy):

- "I burn towards the field marker a half screen drag move. This caps my speed but it is still
  pretty fast."
- "The moment I see any asteroid I stop move and hope it stops in time (not always correct). But
  a little under half a screen to brake is ok."
- "When a module is broken I go home."

## The picture

*Decided* marks the user's calls; the rest is my proposal.

- **A broken module sends the bot home** (*decided*). Any fitted module that stops working, not
  only the gun.
- **The dock repairs before the bot shops or leaves** (proposal). Repairs are automatic while
  docked (`repairHull`, `src/sim.ts`); the bot just waits for them.
- **A module the dock can't fix ends the run, with the reason** (proposal), instead of 15 minutes
  of firing a dead gun. That is a real gap in the game, not in the bot: see "Not in this build".
- **Out to the field like the user** (*decided*): a right drag towards the field marker that caps
  the speed, and a stop the moment any rock is in sight.
- **"In sight" is half a screen** (proposal, from the user's "a little under half a screen to
  brake"): 1,200 world units, which is half of a 1920-pixel-wide window at the default zoom of
  0.8 (960 / 0.8). The screen width is a guess; the constant is easy to change.
- **The report counts the damage** (proposal), so every later run shows whether the bot got less
  clumsy: hull lost, repair credits, and each module that broke and when.

## What to build

### 1. Home when broken: `src/bot/bot.ts`, `src/bot/log.ts`

Measured, not a guess: the log above. Build it, then measure (below).

- **Broken means** any module in `sim.ship.fit` that is fitted and doesn't work (`works()` from
  `src/fitting.ts` is false: wear at or past `DAMAGED_AT`, or destroyed). Read it each tick in
  `step()`, out in space only.
- **When one is broken:** stop firing (`trigger(sim, false, "")`) and `home(sim, "<label> broken")`,
  with the module's part label in lower case, e.g. "heading home: gun broken, 3 ore aboard". It
  overrides mining and fetching ore, as "the hold is full" does in `inSpace`.
- **Log it once per break:** an event `<label> broken at <x>, <y>` the tick it first sees it,
  and a record in the log (below). A module that breaks, is repaired, and breaks again is two
  breaks.
- **In the dock, repairs first:** in `inDock`, after the ore is sold and before `buy()`, return
  while `sim.canRepair(sim.ship)` is true. The dock repairs hull first, then worn modules, then
  replaces destroyed ones, as long as it can be paid (`nextRepair`, `src/sim.ts`).
- **When the dock is done and a module is still broken** (it can't be paid for, or the dock has no
  stock): end the run at once as stuck, with the event
  `stuck: <label> broken and the dock can't fix it, <credits> cr in hand`. Add a reason to
  `finish()` so `log.end` carries it; the stuck text keeps its current lines after this one.
- **The report** (`src/bot/log.ts`, `text` and `json`) adds:
  - `Damage: <hull> hull lost, <credits> cr on repairs` for the run: the change in
    `ship.damageTaken` and `ship.upkeep` since `begin`. A wreck's lost ship counts what it took
    before it went; read both fields before the wreck resets them, if it does (check `wreckShip`).
  - `Broken: gun 1:16, turn thrusters 0:54` (each break with its time), or nothing when none
    broke.
  - Flat `--json` keys: `hullLost`, `repairCredits`, `breaks`, and `break1`, `break2`... as
    `"<label> <time>"`.

Tests in `src/bot/bot.test.ts`:

- A floater out in space with its gun's wear set past `DAMAGED_AT` and 2 ore aboard: the next
  `step` gives a move home and doesn't set `controls.fire`; the log has one "gun broken" event
  after several ticks.
- Docked, ore sold, hull below full and credits to pay: `step` neither buys nor gives an order
  until `sim.canRepair` is false.
- Docked with a destroyed gun and 0 credits: the run ends `stuck`, and the event names the gun.
- The report shows hull lost and repair credits from a run with one knock (set `damageTaken` and
  `upkeep` by hand, or give the ship a known impact).

**Measure:** `npm run bot -- floater 2 1` (and a 6-hour run, `npm run bot -- floater 6 1`) in the
background with output to a log. Write down where it stalls now, the damage line, and the breaks.
The run should get past 1:30 on step 2; if it buys the turret, note when.

### 2. Out to the field like the user: `src/bot/bot.ts`

Rests on the user's own play and one measured hit (1:16:01, 152 units a second, on the way out).
Whether it cuts the bot's damage is a guess until step 1's numbers are compared with this step's.

- **The trip out** is today's `leave()`, given when the bot leaves the dock, and any later
  "deeper into" move in `inSpace` that heads for a field from outside it. It becomes the right
  drag a player gives: `sim.orderMove(field.poi.x, field.poi.y, dvx, dvy)`, where `(dvx, dvy)` is
  `CRUISE_SPEED` along the line from the ship to the field marker. That is what a drag of that
  length from the marker gives in `main.ts` (drag length / zoom / `dragSeconds`).
- **`CRUISE_SPEED`** (proposal): the fastest the floater can come to rest from within 90% of
  `SIGHT`. Pick the number by hand and pin it with a test that asserts the floater's stopping
  distance from `CRUISE_SPEED` is at most `0.9 * SIGHT`. `ClickPilot.stoppingDistance` in
  `src/pilot.ts` is protected; `src/pilot.test.ts` already reaches it through a small subclass
  (`stopDistance`), so reuse that probe pattern rather than opening the API. Write the resulting
  speed, and the drag length on screen it equals, in the code comment.
- **`SIGHT = 1200`** world units (proposal, above).
- **Stop on sight:** while the trip out is flying, the moment any rock that isn't `arriving` and
  has hp is within `SIGHT` of the ship, `sim.orderStop()` and log the input
  `stop, a rock in sight`. Then the trip out is over: the normal mining beat in `inSpace` takes
  it from there (the rock it saw is within `ROCK_REACH`, so it works that one or a better one).
  A stray outside the field counts: the user stops for any asteroid.
- **One stop per trip out.** The bot doesn't re-give the drag after the stop; if nothing is
  within `ROCK_REACH` once stopped, the existing "deeper into" move runs, and it is a trip out
  again only if the ship is outside the field.
- The drag must cap the speed, as the user finds it does. If the click pilot's move with a drift
  peaks well above `CRUISE_SPEED` on the way, stop and report it; don't change the click pilot in
  this build.

Tests in `src/bot/bot.test.ts`:

- Leaving the dock, the bot's first order is a move with a drift of `CRUISE_SPEED` towards the
  field marker (check `sim.clickPilot` and the logged input).
- A rock placed 1,000 units ahead on the trip out: the bot stops (`clickPilot` stopping or
  inactive), the log has "stop, a rock in sight", and the ship doesn't touch the rock (hull
  unchanged) over the next 20 seconds.
- On a trip out with no rock in sight, the ship's peak speed stays under `CRUISE_SPEED * 1.15`.
- `CRUISE_SPEED`'s stopping distance is within `0.9 * SIGHT` (above).

**Measure:** the same two bot runs as step 1, in the background. Compare the damage line and the
repair credits per dock visit with step 1's, and where it stalls.

### 3. Write it down: `docs/no-player-runs-findings.md`

A new section, "Broken modules, and coming in like the user", with: the stall at 1:30 and its
cause (above), step 1's run and step 2's run side by side (where each stalls, hull lost, repair
credits, breaks), and where the wall is next. Update the journey line in
`docs/no-player-runs-plan.md` only if a step's meaning changed (it shouldn't).

## Edge cases

- **A module breaks while the bot is already heading home:** the reason changes to "<label>
  broken"; the trip is the same.
- **A broken thruster:** the bot still goes home by the same click order. If it can't get there,
  the existing stuck timer ends the run, and the report's "Broken" line shows why. The bot doesn't
  try to fly around a dead thruster.
- **A destroyed bay** drops the ore beyond the room left (`damageModule`); the bot goes home
  anyway, it doesn't stay to collect it.
- **Broken in the dock** can't happen (shots pass through a docked ship); repairs run there.
- **Wreck:** handled as today (`noteWreck`); the break is still in the report.
- **Stop on sight right at the dock:** a rock within `SIGHT` of the dock's exit stops the ship
  there; it then mines that rock. That is what the user does too.
- **A rock already in sight when the trip out begins:** no drag; go straight to the mining beat.

## How we'll know it works

- `npm test` and `npm run build` pass, with the tests above.
- Step 1's bot run gets past the 1:30 stall and its report has a damage line and a breaks line.
- Step 2's run shows less hull lost per hour than step 1's, and no hit on a trip out above about
  `CRUISE_SPEED`. Fewer credits on repairs per visit.
- **Try it:** `npm run dev`, open the game with `?dev`, pick the floater, and press **G** to hand
  the ship to the bot. Watch it leave the dock: it drifts out towards the field and stops when the
  first rock comes on screen, a little under half a screen short of it. To see step 1, press G to
  take the ship back, ram a rock until a module breaks (its mount shows damage), and press G again:
  the bot turns for home, and the console says "<module> broken".

## Needs first

- The bot and its plan: `src/bot/bot.ts`, `src/bot/plan.ts`, `src/bot/log.ts`, `src/bot/run.ts`
  (committed, exist).
- `sim.canRepair`, `works`, `DAMAGED_AT`, `ship.damageTaken`, `ship.upkeep`, `sim.orderStop`,
  `sim.orderMove` with a drift (all exist).
- The stopping-distance probe in `src/pilot.test.ts` (exists).

## Not in this build

- **A way back from a broken module you can't pay for** (raised by the user 2026-11-21): "we might
  need some recovery system since a broken gun or thruster at start really kills a run (but then
  you can always kill yourself and go in debt)". Parked in `docs/maybe-later.md`. Step 1 makes the
  bot report the case instead of hiding it.
- **The trip home and moves inside the field** keep today's orders. Measured: 9 of the 28 hits
  were on a "move home" order; the rest were small taps. A later step if step 2's numbers say so.
- **The course check's grazing** (`npm run dockchase -- course 20 1`: docks 20 of 20, 663.9 hull
  lost): every hit is the ship at 200 to 500 units a second into a near-still rock, and it bats
  the smallest rocks out at up to 400 units a second (the runaway rocks the user has seen). Open
  decision for the user: should the route's clearance from a rock grow with speed, or is the
  grazing accepted? Not decided; not in this build.
- **Ore lost to drift** (finding 5): the tractor's job, step 3 of the journey.

## Not doing

- No change to the click pilot, the route planner or the ring round the station (built and
  measured in `docs/look-ahead-plan.md`).
- No game-side rule that sends a broken ship home: the bot does what a player does.
