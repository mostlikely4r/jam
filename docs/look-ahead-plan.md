# Route plan: the ring round the station, then looking as far ahead as it takes to stop

Written 2026-11-21, from `docs/no-player-runs-findings.md` ("Coming home: the settle, and the ring
round the station", "Where a run stalls next") and `docs/dock-click-plan.md` ("What the plan didn't
foresee"). Updated the same day to put the ring first. Nothing here is built yet. Items marked
*decided* are the user's calls; the rest is my proposal, open to veto.

Both steps change one function, `ShipPilot.routeAround` in `src/pilot.ts`, and both are measured by
the same check, `npm run dockchase`. They are separate numbers, though. Step 1 is how far from the
station's centre the route *keeps out*. Step 2 is how far ahead the route *looks*. Changing one
does nothing for the other.

## Why

**The ring stalls a floater on its way home today.** The route keeps every routed ship out of a
circle round each station's centre: `hypot(STATION_HALF, STATION_HALF) + SHIP_RADIUS + 30`, which
is 254 units. The circle is there to clear the corners of the station's solid box (half-size 150).
The berth, the middle of the dock box beside the solid box along the station's own x axis, is
`DOCK_OFFSET` = 300 from the centre. A ship coming from the dock's side reaches the dock box before
the circle matters. A ship coming from the far side has to go round the circle, and sometimes it
never gets round. The chase check (`npm run dockchase -- 20 1`) has 3 of its 20 starts stall like
this: about 462 units from the berth, at 0 to 1 unit a second, with the order still "flying" and
re-given every 30 seconds until the five minutes run out. The bot run on seed 1 hits the same wall
at 85 minutes, after eight good dockings.

**A fast course will ram rocks once something flies one.** The route watches a fixed 500 units
ahead for rocks (`AVOID_LOOK_AHEAD`), whatever the speed. A course (the autopilot's
`ClickPilot.travelTo`) flies as fast as its trip lets it stop: about 257 units a second on the
2,600-unit haul from the home field. That gives two seconds of warning, and a floater needs about
three to turn its nose round. An earlier build that sent the bot home on a course rammed rocks and
ran out of credits paying for repairs. Nothing meets this today: the dock click is gone
(*decided*: a right click on the pad keeps meaning "fly there and stop, where I clicked"), so the
bot flies home by a plain click order on a line it picks to miss the rocks. The journey's last
step is the autopilot, though, so the first course home through a field would meet the rock.

The ring goes first (*decided*), because it is the stall that runs actually hit.

## The picture

- **Step 1, the ring:** a ship going to a station's berth gets round the station and into the dock
  from any side. The smaller change is the one chosen (*decided*): the berth's own station stops
  guarding the approach once the way in is clear, rather than the route learning the station's box
  as a new shape. The ring is unchanged for every other trip, such as passing a station on the way
  somewhere else.
- **Step 2, the look-ahead:** a ship sees every rock within the distance it would need to stop from
  its current speed (*decided*: "a course needs to look ahead as far as it takes to stop"), and
  never less than today's 500 units. Slow ships see exactly what they see now.

## What to build

### 1. The ring round the station: `src/pilot.ts`

**1a. Reproduce first, and see which heading it picks.** Run the three stalling starts from
`npm run dockchase -- 20 1` and log, every tick near the station: the heading `routeAround`
returns, which branch gave it (straight, tangent, or "inside the circle, straight out"), the gap to
the station's centre, and the ship's speed and nose. Do this in a throwaway script, not in the
committed check.

My reading of the geometry (proposal, for the log to confirm): a ship 462 units from the berth on
the 254 circle is about 113° round from the berth, on the far side of the solid box. There the
route flips between two headings about 90° apart. Just inside the circle it gives "straight out";
just outside, it gives the tangent. A floater has no side thrusters, so it has to turn its nose
before each burn, and with the heading flipping it does neither burn. It sits still.

**1b. The berth's station stops guarding the way in** (the shape *decided*, the rule a proposal).
In `routeAround`, when the target is a station's berth, so within half a dock box of
`sim.dockPoint(false, station)`, skip that station's circle once the ship is past the dock face:
its position in the station's own axes (rotated by `station.rotation`) has
`x >= STATION_HALF + SHIP_RADIUS`. Beyond that line the straight line to the berth can't touch the
solid box. Before it, the circle guards as now and carries the ship round. Other stations, and the
same station when the trip isn't to its berth, keep the circle as they are.

**1c. No flipping at the circle's edge.** If 1a shows the flip, then when the ship is inside the
circle (`gap <= blockRadius`), steer along the circle's tangent on the side nearer the target,
tilted outward, instead of straight out. Proposal for the tilt: aim at the tangent point of a
circle 10% larger, so "inside" and "outside" pick nearly the same heading. If 1a shows something
else, record what it found under "Built" and fix that cause instead. The done-check below decides
either way.

**Check:** `npm run dockchase -- 20 1` docks 20 of 20, where it docks 17 of 20 now, and the median
time doesn't get worse.

### 2. The look-ahead: `src/pilot.ts`

**2a. Stopping distance.** Add `ShipPilot.stoppingDistance(sim, speed)`, the inverse of the
existing `stoppingSpeed(sim, distance)`, with the same acceleration (`thrust` or `reverseThrust`,
times `shipResponse`, times `BRAKE_MARGIN`) and the same flip time:

- `lead = accel * flipSeconds`, as in `stoppingSpeed`
- `distance = (speed² + 2 · speed · lead) / (2 · accel)`

Put the shared acceleration and flip-time sums in one private helper that both call, so the two
can't drift apart.

**2b. Use it in `routeAround`.**

- Speed is the ship's speed relative to the target, as `relativeVelocity(target)` gives it
  (proposal: that is the frame `flyTo` plans its speed in).
- `lookAhead = max(AVOID_LOOK_AHEAD, stoppingDistance(sim, speed))`.
- Rocks: `along` starts at `min(distance, lookAhead)` instead of `min(distance, AVOID_LOOK_AHEAD)`.
- Stations: the *range* at which a station counts as in the way becomes
  `min(distance, max(AVOID_LOOK_AHEAD * 3, lookAhead))`. That is how far ahead it looks, not the
  circle's radius, which stays as step 1 leaves it.

`ClickPilot.routeAround` still decides *whether* the route is used: on a course, or with
`clickRoute` on an order that isn't straight. A plain straight click order still flies straight.

**2c. Who this touches.** `routeAround` lives on `ShipPilot`, so this reaches every routed flight:
courses, click orders with the route planner, and the drone, pirate and defender pilots. That is
on purpose (proposal), since a fast drone has the same problem as a fast course. Drones and
fighters cap their speed near and inside a field (`speedLimitHere`), so their stopping distance
mostly stays under 500 and their flying shouldn't change. If one of their tests in
`src/pilot.test.ts` or `src/sim.test.ts` shifts, check that the cause is the longer look-ahead, and
note it under "Built".

**2d. A check that measures a course home:** `src/profile/dockchase.ts`. Add a `course` mode next
to the click-on-the-berth mode it has now: `npm run dockchase -- course [starts] [seed]`. Each start
is the same floater with a full hold, at rest at the home field's edge but on the *far* side from
the station, so the way home crosses the field. Give it `autopilot`, as the journey's last step
does, and send it home with `sim.orderTravel(station)`. For each start, report whether it docked,
the time, and the hull lost on the way, and print totals the way the click mode does. Run it before
and after step 2. This check also crosses the ring from the far side, so run it after step 1 is
in.

### 3. Tests: `src/pilot.test.ts`

Fast, pure-logic tests:

- **From the far side, a click to the berth docks.** A floater with `clickMove` and `clickRoute`, at
  rest on the far side of a station (opposite the dock, about 500 units out), clicks the berth. It
  docks within a minute. Write it first and check that it fails on today's code. If the stall needs
  the station's own motion to show, put the start where 1a found it.
- **Passing a station still goes round it.** A routed order to a spot beyond a station, whose
  straight line crosses the solid box, never touches the solid box.
- **`stoppingDistance` and `stoppingSpeed` are inverses**, with and without `reverse`, for a few
  speeds and distances.
- **A fast course misses a rock it would have hit.** A ship with `autopilot` on a course at about
  250 units a second, with a rock on its line 900 units ahead and nothing else near, never comes
  within the rock's radius plus its own, and its hull doesn't change. It must fail on the code
  before step 2.
- **Slow flights see what they saw.** At 50 units a second, a rock 600 units ahead doesn't change
  `routeAround`'s heading.
- **A straight click order still flies straight** at a rock 900 units ahead, without `clickRoute`.

### 4. Write-up

- In `docs/no-player-runs-findings.md`, add a dated section at the end: the click check before and
  after step 1, the course check before and after step 2 (docked, median time, hull lost), and
  what 1a's log showed.
- Run `npm run bot -- floater 2 1` after both steps. It should get past 85 minutes on seed 1. Write
  down where it stops next.
- Under "Built" at the end of this plan, record what changed from the plan.

## Edge cases

- **The target is a berth, but the ship is passing another station on the way.** Only the
  target's own station gets the rule from 1b. Others keep the full circle.
- **The station turns while the ship comes round.** "Past the dock face" is measured in the
  station's axes every tick, so it turns with the station.
- **A target closer than the stopping distance.** The look-ahead is already capped at the distance
  to the target.
- **Moving rocks.** The check uses where rocks are now, as today, and runs every tick, with
  `AVOID_MARGIN` as the slack. Proposal: no predicting rock motion.
- **Inside a dense field at speed.** The nearest blocker still wins, since `consider` shrinks the
  range at each hit, so a longer look-ahead doesn't pick a far rock over a near one.
- **The corner path round a body** (`travel`, `cornerToward`). It goes through `flyTo` and gets
  both changes with no extra code.
- **Hand flying with the keys.** Not routed, so no change.

## How we'll know it works

- `npm test` and `npm run build` pass, and the far-side docking test and the fast-rock test each
  fail on the code before their step.
- `npm run dockchase -- 20 1`: 20 of 20, where it is 17 of 20 now.
- `npm run dockchase -- course 20 1`: every start docks, with hull lost near zero.
- `npm run bot -- floater 2 1` gets past the 85-minute stall.
- In the game: from the far side of the station, double-click the pad. The ship should come round
  the station and in. Then fit the autopilot, sit on the far side of the home field, and set a
  course for the station. It should bend round the rocks on its way through.

## Not doing

- **Bringing the dock click back.** It was removed by the user's call (*decided*). The bot flies
  home by the plain click order a player gives.
- **The station's box as the route's keep-out.** It was weighed against the berth rule, and the
  smaller change was chosen (*decided*).
- **Dropping the station's circle altogether for a trip to its berth.** From the far side, that
  flies the ship straight into the solid box.
- **Slowing courses down inside fields.** The fix is seeing further, not flying slower.

## Built

Built 2026-12-02, in one commit, with the numbers in
`docs/no-player-runs-findings.md` ("The ring, and looking as far ahead as it takes to stop").

**Steps 1 and 2 are in as planned**, with three things to know.

1. **The three starts that miss were not on the ring.** Step 1a's log found no route in them to
   log: a bare floater has `clickMove` and `clickTurn`, not `clickRoute`, so
   `ClickPilot.routeAround` handed it the straight line and the ring never applied. The ship flew
   that line into the station's solid box, bounced, and sat 460 to 520 from the berth swinging its
   nose. So the ring changes alone could not make the check: *a click on a station's pad now takes
   the ring round the station it is going to*, which is what `How we'll know it works` asks of a
   double-click on the pad. The plan's sentence in step 2, "A plain straight click order still
   flies straight", holds for everything else: a pad click takes the ring and no rocks, so a hull
   without the planner still flies its own line and takes its chances with the field.

2. **1c's tilt is not a circle 10% larger.** Inside the circle there is no tangent point to aim
   at, so the tangent is taken where the ship stands and scaled by `gap / blockRadius`: none of it
   in the middle, where straight out is the only way out, all of it at the edge, which is where
   the flip was. Across the edge the heading moves by at most 19 degrees.

3. **The bot needed one change of its own**, which the plan did not see: `head()` gave every order
   with `orderMoveStraight`, the chart's kind, which flies the line whatever is in the way *even
   with the route planner*, so the ring could not reach the bot either. Its own comment already
   said "as a player gives with a right click", and a right click is `orderMove`. With that the
   bot gets past the 85-minute stall and stops next on step 2, the turret, at 1:30.

**What the checks came to.** `npm run dockchase -- 20 1`: 20 of 20, median 19.1 s, mean 18.9 s,
was 17 of 20 at 18.7 s and 18.9 s. `npm run dockchase -- course 20 1`: 20 of 20, median 50.2 s,
mean 65.3 s, 663.9 hull lost, was 17 of 20 at 50.9 s and 73.0 s with 1047.9 lost. `npm run bot --
floater 2 1` gets past 85 minutes.

**Still short of the plan, and left for the user to call.** The course check docks every start but
loses 663.9 hull, not the "near zero" the plan expected. The cause is in the plan's own spec: a
rock's keep-out is `radius + SHIP_RADIUS + AVOID_MARGIN` whatever the speed, so a ship following a
tangent passes exactly that close, and a crossing at 480 units a second lags the aim by more than
30. Getting near zero means letting the margin grow with speed, or slowing a course that is
blocked, and the second is in *Not doing*. Neither was done: it is a decision, not a fix.
