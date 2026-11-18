# Orbits plan: ellipses and Kepler speeds

Written 2026-11-18, before any of it is built. Today every orbit in the system designer is a
circle at a steady speed. This plan lets any orbit be an ellipse, with the speeds a real orbit
has: fast near the parent, slow far from it. There is still no gravity: nothing pulls on
anything, the path is only drawn differently. Nothing here is built yet.

## Why

Circles make the system read like clockwork: everything the same distance from its parent all
the time, moving at one steady speed. Ellipses give places a rhythm. A field is close and
fast for a while, then far and slow. Trips to it cost more or less depending on when you leave.
And the cost is small, because positions are already worked out from the clock each tick and
never added up. An ellipse is a different formula in the same place.

## The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

- **Every designer object can have an eccentric orbit** (*decided*). Stars, planets, moons,
  asteroids, fields, stations, pirate bases and anchors: anything with an orbit in the system
  designer. It is generic, not limited to some kinds.
- **Kepler speeds, no gravity** (*decided*). A body on an ellipse moves the way a real orbiting
  body does (equal areas in equal times), so it is fastest at its closest point to the parent
  and slowest at its farthest. Nothing pulls on anything. Ships and bodies are not affected by
  each other's orbits.
- **Two new numbers per object, both default 0** (mine): `eccentricity` (0 is today's circle,
  up to 0.9) and `periapsisAngle` (degrees: the direction from the parent to the closest
  point). The user asked for three extra parameters. In 2D only these two are new:
  `orbitPhase` already exists and becomes where on the orbit it is at clock 0, and the third
  usual one (tilt) only matters in 3D. If a third is meant, raise it in the build thread.
- **`orbitRadius` becomes the semi-major axis** (mine): half the long width of the ellipse. The
  closest distance is `orbitRadius × (1 − e)` and the farthest `orbitRadius × (1 + e)`. At
  `e = 0` it means exactly what it does today.
- **`orbitPhase` becomes the mean anomaly at clock 0** (mine): how far round its period it is,
  as an angle, which at `e = 0` is the same as the angle it is at. `orbitPeriod` stays as the
  free time for one lap, so Kepler's speeds come from the shape and the period, and the period
  isn't tied to the size. Negative periods still go the other way round.
- **The parent sits at a focus, not the middle** (mine), as in real orbits. Everything that
  rides an orbit (children, the pilot's frame) uses the parent's position, which stands still
  in its own frame. Only the drawn ellipse is offset.
- **Existing worlds and saves don't change** (mine). A node with no eccentricity reads as 0.
  The shipped system stays circular until someone sets it otherwise. Recipes and the shipped
  `world.json` are not touched.
- **Stations and pirate bases** (mine, advice only): near-circular orbits are kinder for
  docking, since speed at the closest point is `(1 + e) / (1 − e)` times speed at the farthest
  (about 1.9× at `e = 0.3`). Nothing enforces it. The designer shows the two speeds so the
  author can see.

## What to build

One shared piece of maths, then each place that today does circle maths switches to it.

### 1. The orbit function

A new pure module (mine: `src/kepler.ts`, no world, no sim imports) that both the sim and the
designer use, so there is one formula and no drift between them.

- Inputs: semi-major axis, eccentricity, periapsis angle (radians), mean anomaly at clock 0
  (radians), period, and a time.
- Output: position relative to the parent, and velocity (worked out analytically, not by
  sampling).
- Solve Kepler's equation `M = E − e sin E` by Newton's method. Start from `E = M + e sin M`
  (or `π` when `e > 0.8`), stop at about 1e-12 or 30 steps. The result has to be smooth in
  time: the route planner takes velocities by sampling positions half a second either side.
- With `e = 0` the result must equal today's `cos`/`sin` circle exactly, not just closely, so
  nothing existing moves a pixel.
- A negative period runs the same ellipse the other way round.

### 2. The sim

- `Orbit` in `src/sim.ts` (around line 521) gains `eccentricity` and `periapsisAngle`, and
  `orbitsAt` (around line 605) calls the shared function. Its `sign` still flips the whole
  vector from the parent, which gives the same ellipse with the closest point on the other
  side, so the game's centre moving to a different body stays correct.
- The old field, station and pirate base don't use `orbitsAt`: they have their own circle
  maths in `movePoi`, `place`, `poiAt` and `makePoi` (around lines 1529 and 3610–3720). Move
  them onto the same function and carry the two new numbers on the `Poi`. Carrying of nearby
  objects by a place's motion must use the place's real movement each tick, as it does now.
- `orbitPhases()` and the `keep` path of `apply` (saves, and layout changes from outside the
  game) store the phase. It is now the mean anomaly, which equals the old angle at `e = 0`, so
  old saves load the same.
- `SolidBody`, `Spawn`, anchors, and the field and station specs all take their orbits through
  `Orbit`, so they come along. `OrbitRing` (the chart's one true orbit per thing) gains the
  two numbers too.

### 3. The designer

- `WorldNode` (`src/designer/world.ts`) gets `eccentricity` and `periapsisAngle`. The loader
  reads them with a default of 0, so `WORLD_VERSION` doesn't need to change.
- `orbitAngle`, `positions`, `copyPositions` and `orbitSpeed` use the shared function.
  `orbitSpeed` becomes two numbers when `e > 0`: speed at the closest and at the farthest
  point.
- Copies (`copiesOf`) keep the node's eccentricity and periapsis angle. Their start phases are
  spread evenly in mean anomaly, as angle is today, and `orbitVariance` scales the semi-major
  axis as it scales the radius today.
- `closestApproach` rebuilds its own chain of circles. It must use the shared function, or
  its numbers will be wrong for any eccentric orbit. A body whose closest point comes inside
  its parent's reach, or a place that passes inside another body's reach, already shows as a
  negative gap, so this carries over.
- `makeChild`'s "outermost reach" sum (around line 252) uses the farthest point of each
  sibling's orbit, `orbitRadius × (1 + e)`, plus its radius.
- `src/designer/designer.ts`: two number fields next to `orbitPhase` (around line 655), with a
  readout of closest and farthest distance and the speeds there. Draw the orbit as an ellipse
  with the parent at a focus, where it draws circles now (around line 1145). Right-drag still
  sets `orbitRadius`. Shift right-drag sets the start angle from the mouse: with `e > 0` it
  has to turn that direction into a mean anomaly, not use it directly.
- `src/designer/link.ts`: `placer` and `ringsOf` pass the two numbers to the sim. Stations are
  linked to the game through tuning, where `stationDistance` is the orbit radius minus the
  field's radius. With an ellipse the gap varies, so the designer should warn when the closest
  point of a station's or base's orbit comes inside the thing it orbits.

### 4. The chart

`src/chart.ts` draws each orbit as a ring round the parent, or a 20° arc round the orbiting
thing when the parent isn't found (the `ring` helper, around line 249). It has to draw
ellipses, with the parent at a focus, and keep the partial arc centred on the thing. Get the
ellipse's centre and axes from the shared module so the chart and the sim cannot disagree.

### 5. The route planner

`planRoute` (`src/route.ts`) takes positions as functions of time, so it needs no change for
ellipses. The three places that feed it do:

- `Sim.poiAt` (around line 3631) has its own circle branch. It is covered by step 2.
- `positions()` in the designer is covered by step 3.
- `Pilot.plan` (`src/pilot.ts`, around line 307) fixes the keep-out body where it is now, and
  subtracts that fixed point from the start and the end as they move. With circles this is a
  small error. On a fast eccentric orbit a long trip lets the body move a long way. Work in
  the body's own frame instead: subtract where the body is at each time `t`, as
  `tripBetween` in `src/designer/trips.ts` already does.

Trips will vary more with departure time, so `tripSpread`'s minimum and maximum widen. That is
expected.

## Edge cases

- **`e` at or above 1** is not an ellipse. The designer clamps the field to 0–0.9, and the
  loader clamps what it reads.
- **A period of 0** stands still (as today): a fixed point on the ellipse at its start phase.
- **A body on an orbit that crosses its sibling's** is allowed. The designer already measures
  closest approach and can show it.
- **A child's orbit inside its parent's surface** (closest point under the parent's radius)
  should be flagged in the designer, not forbidden.
- **Saves**: phase is stored as before and reads as the mean anomaly, so saves from before this
  load as circles with the same phases.

## How we'll know it works

Unit tests (the whole suite must still pass unchanged with `e = 0`):

- **`src/kepler.test.ts`**, new:
  - `e = 0` equals the circle exactly, at several times.
  - The position repeats after one period.
  - The closest distance is `a(1 − e)` and the farthest `a(1 + e)`; the speed ratio between
    them is `(1 + e) / (1 − e)`.
  - Equal areas in equal times: sweep two equal time slices and compare.
  - Speed fits `v² = μ(2/r − 1/a)` with `μ = n²a³`, `n = 2π / period`.
  - The analytic velocity matches a sampled one.
  - A negative period goes the other way round; `e` near 0.9 converges.
- **`orbitsAt`**: a chain with `sign = −1` gives the mirrored ellipse.
- **Designer** (`world.test.ts`, `link.test.ts`): `positions` for an eccentric tree matches
  the sim's bodies, places and anchors at several times; copies keep the shape;
  `closestApproach` agrees with a brute-force check on an eccentric orbit.
- **Sim**: `poiAt` agrees with where an eccentric station actually is after ticking; things
  near it are carried along with its changing speed.
- **Route** (`route.test.ts`, `pilot.test.ts`): `planRoute` to an eccentric target arrives at
  where the target then is, within a tolerance, and `settled` is true; a pilot's trip to an
  eccentric field arrives at it.

Try in the game: in the designer, give a planet `e = 0.5`. The orbit draws as an ellipse with
its star at a focus, and the planet visibly speeds up near the star. Open the chart and the
rings match. Autopilot to a field on that planet from the far point, then from the near
point: the trips take different times and both arrive.

## Not doing

- **Real gravity.** Nothing attracts anything. Ships are not pulled by bodies' orbits.
- **Tilt or any 3D orbit parameter.**
- **Tying the period to the size** (Kepler's third law as a rule). The period stays a free
  number per node. `makeChild`'s starting guess already follows the law and stays as it is.
- **Changing the shipped system or the recipes' output.** The shipped layout stays circular
  until the author chooses otherwise.
- **Refusing or adjusting an eccentric station orbit.** The designer reports it. It never
  blocks it.
