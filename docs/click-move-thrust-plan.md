# Click move thrust plan

Written 2026-11-25, from two inbox notes (I-2, I-14) the user wrote while flying hulls with more
thrusters. All three steps are built; the build stops for the user to try it.

## Why

The user's notes (*decided*, their own words): click move "should check what is faster: turn
front to face direction and main thrust vs side/back thrust. With multiple thrusters the ship can
thrust while turning too." And: "Click move tweak: top speed."

How it flies today (`src/pilot.ts`):

- `ShipPilot.steer` (`pilot.ts:625`) turns the nose toward the needed change and burns the main
  thruster (or the reverse, when that faces closer). Only a small correction (under `DIRECT_LIMIT`,
  80) is made without turning, by `correctDirectly`, and only with the `strafe` part.
- It knows the ship by part ids (`parts.has("strafe")`, `"reverse"`) and by tuning constants
  (`tuning.thrust`, `reverseThrust`, `sideThrust`), not by the thrusters really fitted, where they
  sit and how hard they push. `fitting.ts:770` `thrustOf(ship)` already has that: each role's push
  as a vector in the ship's frame.
- While turning toward a burn, nothing fires until the nose is within `BURN_START_ANGLE`.
- A click move's top speed is set by the trip: 75% of the peak a half-burn, half-brake trip would
  reach (`ClickPilot.speedLimitHere`, `pilot.ts:2144`), capped at `autopilotSpeed`. The player
  can't set it. The old `clickSpeed` slider in the tab menu no longer reaches the click pilot,
  whose `speedLimitHere` overrides the one that reads it.

## The picture

- **Pick the faster way** (*decided*, the note). For each burn the pilot compares two ways to get
  the velocity change it needs: turn the nose to it and burn the main thruster, or push with what
  already points the right way without turning (side, back, or a mix). It takes whichever ends
  sooner: turn time (from `flipSeconds`, scaled by the angle) plus burn time at the main's push,
  against burn time at the push the fitted thrusters give along that direction. The pushes come
  from `thrustOf`, not from part ids or constants, so a hull with a big reverse or strong strafe
  flies differently from one with weak ones.
- **Thrust while turning** (*decided*, the note). While the nose comes round, every thruster
  whose push has a useful share along the needed change fires, at a throttle in proportion to
  that share (proposal: one with under 30% of its push along the need stays off, so the ship
  doesn't waste fuel or drift sideways). With fuel on, that is a real cost, burned the one way
  all thrusters burn (`Sim.burnFuel`).
- **A top speed tweak on Click to move** (*decided*, the note; the options are a proposal):
  `"topSpeed"`, options *Trip* (today's rule, the default), 400, 200, 100 and 50 units a second.
  A pick caps `speedLimitHere` for click moves; a course (`order.follow`) is the autopilot's and
  isn't capped by it. It lives in `src/programs.json` like the other tweaks and is read with
  `pickOf(ship.tweaks, "clickMove", "topSpeed")`.
- **A relative speed limit as well** (*decided* 2026-11-25, the user: "a second tweak? Relative
  speed limit... the lowest limit obviously counts"; the options are a proposal):
  `"relativeSpeed"`, the share of that top speed a move holds to. A flight already stops burning
  once it's within 60% of its speed and coasts the rest, which is why a 100 cap parks at about
  60; this is that 60 made a number the pilot can set. Options *The limit*, 75%, 60% (the
  default, today's) and 40%. The lower of the two limits is the speed it keeps, so the whole
  limit holds at about 60 of a 100 cap and just under 100 at *The limit*. The 60% is
  `COAST_SHARE`, every pilot's, now behind a `coastShare` hook that a click move answers from the
  pick: drones, traffic and courses keep the constant.
- **Drop the dead `clickSpeed` slider** (proposal), or point it at the default when there is no
  tweak. It misleads as it is.

## The build

### 1. The top speed tweak

The tweak in `programs.json`, read in `ClickPilot.speedLimitHere`, with a test that a 100 pick
holds a long move under 100. Remove `clickSpeed` from the tab menu (`src/tuning.ts:451`), keeping
the value where the floater's drone code still reads it.

**Built 2026-11-25.** What changed from the plan, all small:

- The pick is a ceiling, and a flight stops burning within its steering tolerance of that speed.
  With the relative limit at its 60% default a 100 cap holds a long move near 60, not at 100; at
  *The limit* it holds at about 93 of 100, since it stops just short rather than hunting. The
  tests pin both: under 100, and the same move on the trip's own rule running past 200, plus 75%
  and 40% landing where their names say.
- `clickSpeed`'s tuning value stays because a floater flown by a drone or traffic reads it; its
  comment now says it isn't in the tab menu, and that nothing the player flies uses it.
- Click to move's description mentions right-clicking it in the ship screen to set the top speed,
  as Targeting's does.

Stop here for the user to try: does a slower cap make click moves feel calmer?

### 2. Faster of turn-and-burn or push direct

`steer`, `correctDirectly` and `trim` read `thrustOf(ship)`; the choice above replaces the
`DIRECT_LIMIT` size rule and the part-id checks. The braking flip (`coastIn`, `coastNose`) keeps
its own logic, but uses the same comparison to pick between turning and reversing.

**Built 2026-11-25.** How it came out:

- `waysAlong` asks `thrustOf` for each control's push, in the ship's frame, and keeps the better
  half of each pair: main or reverse on `thrust`, right or left on `strafe`, with the push it
  really has where it's mounted (two thrusters on a control add up). `fastestWay` then compares
  the three ways by time: the turn (`turnTime`, from `flipSeconds`) plus the burn after it, against
  the change made where the ship already points.
- **What changed from the plan, after trying it:** a push made across the change leaves motion
  across it that has to be undone, and the pilot's aim follows that motion, so a hull pushing well
  off the change chased its own spot and circled it forever. Two rules came out of that. The
  combined push has to lie at least 0.7 along the change (`STRAIGHT_PUSH`), and the pair the nose
  is turned for has to be within about 18 degrees (`ALIGNED_SHARE`) — below that the turn is
  cheaper than the sideways motion it saves. The across time is in the comparison, as
  `need × tan(off)` over the main's push.
- `trim` kept its old shape, with `parts.has("strafe")` and `parts.has("reverse")` replaced by
  whether a strafe or a reverse thruster is fitted. Rewriting it to fire on `along` shares turned
  the settle inside a carried field into a limit cycle: the ship spun up and never braked.
- `coastNose` asks `fastestWay` which way round to put the nose for the brake; `coastIn`, which
  measures the turn before it commits to braking, is unchanged.
- `flipSeconds` and a `turnTime` on top of it moved from `ClickPilot` up to `ShipPilot`, so the
  comparison and the old braking sums share one reckoning of a turn.

### 3. Thrust while turning

In `steer`, while the burn isn't lined up yet, fire the thrusters whose push helps, as above.

**Built 2026-11-25.** Only the side thrusters fire while the nose comes round, each at the share
of its push that helps, and only when that push lies at least 0.7 along the change. Firing the
pair that is waiting on the nose was tried first and it was the circling in step 2: a burn that
far off the change turns the ship's own motion, and then the aim it is chasing never settles.

Stop here for the user to try: fly the floater and a hull with strafe and a strong reverse.

## How we'll know

- Tests in `src/pilot.test.ts`, all built: a ship with a strong reverse moved a short way
  backwards gets there without turning round; the same move with nothing but the main turns the
  nose round and burns; with strafe, a diagonal move fires the strafe while the nose turns; a move
  with the 100 tweak never passes 100, and the relative speed limit sets how much of it it holds.
- `npm run dockchase` (a `src/profile` script, in the background, logged) still docks every hull:
  click moves feed the dock approach.
- `npm test` and `npm run build`.
- **Try it:** buy reverse and strafe for the floater, set Click to move's top speed to 200 (right
  click the program in the ship screen, I), then right click a spot behind and to the side. The
  ship should start moving at once, sliding while it turns, and not pass 200.

## Needs first

Nothing: tweaks, `thrustOf` and the click pilot are built.

## Not in this build

- Fuel-saving modes (a "cheapest, not fastest" tweak): only if the try shows fuel matters here.
- The autopilot's course flying (`order.follow`, `travel`): it keeps its own rules.
- The route planner's look-ahead (Q-6, its own plan).
