# Look-ahead plan: a course looks as far ahead as it takes to stop

Written 2026-11-21, from `docs/no-player-runs-findings.md` ("Coming home" and "Where a run stalls
next") and `docs/dock-click-plan.md` ("What the plan didn't foresee"). Nothing here is built yet.
Items marked *decided* are the user's calls; the rest is my proposal, open to veto.

## Why

The route planner watches a fixed 500 units ahead for rocks (`AVOID_LOOK_AHEAD` in
`src/pilot.ts`), whatever the ship's speed. A course (the autopilot's `ClickPilot.travelTo`) flies
as fast as its trip lets it stop: on the 2,600-unit haul from the home field to the station that is
about 257 units a second. At that speed, 500 units is two seconds of warning, and a floater needs
about three to turn its nose round. So a course through a field runs into rocks at close to 200
units a second, and the dock's repairs eat what the trip earned. In the bot runs this stalled the
floater on step 1 at 0:25 with no credits.

Today nothing in the game feels this yet: the bot no longer flies home on a course. The dock click
is gone (*decided*: a right click on the pad keeps meaning "fly there and stop, where I clicked"),
so a floater without the autopilot flies home by a straight click order on a line the bot picks to
miss the rocks. But the journey's last step is the autopilot, and its course runs the same route
code, so the first course home through a field meets the same rock. This plan fixes the route
before that step is reached.

## The picture

- **The look-ahead is the stopping distance** (*decided*: "a course needs to look ahead as far as it
  takes to stop"). A ship sees every rock in the distance it would need to stop from its current
  speed, and never less than today's 500 units. Slow ships see exactly what they see now.
- Why stopping distance is enough (proposal): getting past a rock sideways never needs more than
  stopping does. Both are a turn of the nose and a burn, and the sideways change past a rock is
  smaller than the whole speed. A rock found at stopping distance can always be missed. A rock found
  further off needs only a small change of heading, because the tangent past it is a small angle.
- The way round a rock is unchanged: the tangent past the nearest blocker on the side the ship is
  already on. Only how far ahead it looks changes.
- The station's own keep-out works the same way (proposal): it is looked for three times further
  than rocks today (1,500 units). It becomes the larger of that and the stopping distance.

## What to build

### 1. Stopping distance: `src/pilot.ts`

Add `ShipPilot.stoppingDistance(sim, speed)`, the inverse of the existing `stoppingSpeed(sim,
distance)`. It uses the same acceleration (`thrust` or `reverseThrust`, times `shipResponse`,
times `BRAKE_MARGIN`) and the same flip time, so the two always agree:

- `lead = accel * flipSeconds` as in `stoppingSpeed`
- `distance = (speed² + 2 · speed · lead) / (2 · accel)`

Put the shared accel and flip-time sums in one private helper that both methods call, so they
can't drift apart.

### 2. The look-ahead in `routeAround`: `src/pilot.ts`

In `ShipPilot.routeAround`:

- Measure the ship's speed relative to the target, as `relativeVelocity(target)` already gives
  (proposal: relative to the target, because that is the frame `flyTo` plans its speed in).
- `lookAhead = max(AVOID_LOOK_AHEAD, stoppingDistance(sim, speed))`.
- Rocks: `along` starts at `min(distance, lookAhead)` instead of `min(distance, AVOID_LOOK_AHEAD)`.
- The station: its range is `min(distance, max(AVOID_LOOK_AHEAD * 3, lookAhead))`.

Everything else in `routeAround` stays as it is. `ClickPilot.routeAround` still decides *whether*
the route is used: on a course, or with `clickRoute` and an order that isn't straight. A plain
straight click order still flies straight, so the bot's way home is untouched.

### 3. Who this touches

`routeAround` lives on `ShipPilot`, so this reaches every routed flight: courses, click orders with
the route planner, and the drone, pirate and defender pilots. That is on purpose (proposal): a fast
drone has the same problem as a fast course. Drones and fighters cap their speed near and inside a
field (`speedLimitHere`), so at their speeds the stopping distance mostly stays under 500, and
their flying shouldn't change. If a drone or fighter test in `src/pilot.test.ts` or
`src/sim.test.ts` does shift, check that it is the longer look-ahead and not a bug, and note it under
"Built".

### 4. A check that measures a course home: `src/profile/dockchase.ts`

Add a `course` mode next to the click-on-the-berth mode the check has now:
`npm run dockchase -- course [starts] [seed]`. Each start is the same floater, full hold, at rest
at the home field's edge, but on the *far* side from the station, so the way home crosses the
field. Give it `autopilot` the way the journey's last step does, and send it home with
`sim.orderTravel(station)`. Per start, report whether it docked, the time, and the hull lost on the
way. Print the totals the way the click mode does.

Run it on the build before the change and after it, and add both rows to the findings doc (step 6).

### 5. Tests: `src/pilot.test.ts`

Fast, pure-logic tests:

- **`stoppingDistance` and `stoppingSpeed` are inverses**, with and without `reverse`, for a few
  speeds and distances.
- **A fast course misses a rock it would have hit.** A ship with `autopilot` is flying a course at
  about 250 units a second, with a rock on its line 900 units ahead and nothing else near. Over the
  following seconds it never comes within the rock's radius plus the ship's radius of it, and its
  hull doesn't change. Write this test first and check that it fails on today's code. If it
  doesn't fail, it isn't testing the fix.
- **Slow flights see what they saw.** Below the speed whose stopping distance is 500, the look-ahead
  is exactly `AVOID_LOOK_AHEAD`. Test this through `routeAround`'s choice of heading: a rock 600
  units ahead is ignored at 50 units a second.
- **A straight click order still flies straight** into a rock 900 units ahead at speed, without
  `clickRoute`. This keeps the bot's line-picking honest.

### 6. Write-up

- In `docs/no-player-runs-findings.md`, add a dated section at the end with the course check
  before and after: docked, median time, and hull lost.
- Under "Built" at the end of this plan, record what changed from the plan.
- Run `npm run bot -- floater 2 1` once after the change. The bot doesn't fly courses before its
  last step, so the numbers should match "Where a run stalls next". If they don't, find out why.

## Edge cases

- **A target closer than the stopping distance.** The look-ahead is already capped at the distance
  to the target, so nothing past the destination is ever considered.
- **Moving rocks.** The check uses where rocks are now, as today. Over a longer look-ahead a rock
  can drift a little before the ship gets there. The margin (`AVOID_MARGIN`) and the re-check every
  tick cover that. Proposal: don't predict rock motion.
- **Inside a dense field at speed.** The nearest blocker still wins, since `consider` shrinks the
  range to each hit, so a longer look-ahead doesn't pick a far rock over a near one.
- **The corner path round a body** (`travel`, `cornerToward`). It calls `flyTo` on a still corner
  point and gets the same look-ahead with no extra code.
- **Hand flying with the keys.** Not routed, so no change.

## How we'll know it works

- `npm test` and `npm run build` pass, including the new tests, and the rock test fails on the old
  code.
- The course check docks every start from the far side, with hull lost near zero, where the build
  before loses hull on the way through.
- In the game: fit the autopilot on a floater, sit on the far side of the home field, and set a
  course for the station. It should bend round the rocks on its way through rather than hitting one.

## Not doing

- **Bringing the dock click back.** It was removed by the user's call (*decided*); the bot flies
  home by the straight click order a player gives.
- **Slowing courses down inside fields.** The fix is seeing further, not flying slower. A course
  keeps the pace its trip allows.
- **The ring round the station.** The route keeps out of a 254-unit circle round the station's
  centre, while the berth sits 300 from it, so an approach from the far side can circle and not
  close. That is the next route fix, a finding of its own in the findings doc, and outside this plan.
