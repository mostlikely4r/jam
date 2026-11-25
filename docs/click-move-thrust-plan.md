# Click move thrust plan

Written 2026-11-25, from two inbox notes (I-2, I-14) the user wrote while flying hulls with more
thrusters. Nothing here is built yet.

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
- **Drop the dead `clickSpeed` slider** (proposal), or point it at the default when there is no
  tweak. It misleads as it is.

## The build

### 1. The top speed tweak

The tweak in `programs.json`, read in `ClickPilot.speedLimitHere`, with a test that a 100 pick
holds a long move under 100. Remove `clickSpeed` from the tab menu (`src/tuning.ts:451`), keeping
the value where the floater's drone code still reads it.

Stop here for the user to try: does a slower cap make click moves feel calmer?

### 2. Faster of turn-and-burn or push direct

`steer`, `correctDirectly` and `trim` read `thrustOf(ship)`; the choice above replaces the
`DIRECT_LIMIT` size rule and the part-id checks. The braking flip (`coastIn`, `coastNose`) keeps
its own logic, but uses the same comparison to pick between turning and reversing.

### 3. Thrust while turning

In `steer`, while the burn isn't lined up yet, fire the thrusters whose push helps, as above.

Stop here for the user to try: fly the floater and a hull with strafe and a strong reverse.

## How we'll know

- Tests in `src/pilot.test.ts`: a ship with a strong reverse moved a short way backwards gets
  there without turning round; one with a weak reverse turns and burns; with strafe, a sideways
  move fires the strafe while the nose turns; a move with the 100 tweak never passes 100.
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
