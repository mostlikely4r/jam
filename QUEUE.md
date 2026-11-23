# Queue

<!-- vibeview queue v1. Order = the order tasks go to agents; top is next. Format: see vibeview/FORMAT.md -->

## Q-1 · Fuel step 2: test and commit · test
- state: in progress
- backlog: S-13
- plan: docs/fuel-plan.md
- added: 2026-11-23

Step 2 (tanks and refuelling) is built but uncommitted. Run `npm test` and `npm run build`, start
the census with `--fuel` in the background, then commit. Leave `src/hulls.json` out: it holds the
user's own hull work.

## Q-2 · Fuel step 2: tune · other
- state: queued
- backlog: S-13
- plan: docs/fuel-plan.md
- added: 2026-11-23

The user plays with fuel on. Watch `fuelPrice` 5 and `fuelReturn` 1.5, and whether a 20 tank
sends the floaters home all the time. Write the settled numbers into the plan's "Tuned" note.

## Q-3 · Fuel step 2: review · other
- state: queued
- backlog: S-13
- plan: docs/fuel-plan.md
- added: 2026-11-23

A code review of step 2's diff, then the short "Built" note under the step.

## Q-4 · Fuel step 2b: tanks as modules · build
- state: queued
- backlog: S-13
- plan: docs/fuel-plan.md
- added: 2026-11-23

Two tank mounts on every hull; small 10, medium 20, large 40. A damaged tank leaks, a destroyed one
loses its fuel. Every hull's default layout still holds 20.

## Q-5 · Clamp tow, first slice · build
- state: queued
- plan: docs/clamp-tow-plan.md
- added: 2026-11-23

Tow a whole rock to a station for more ore than mining it gives: the cheap test of whether towing
feels good. Nothing built yet.

## Q-6 · Route: the ring round the station, then look ahead · build
- state: queued
- plan: docs/look-ahead-plan.md
- added: 2026-11-23

Two separate numbers in `ShipPilot.routeAround`, both measured by `npm run dockchase`. Ring first.
Nothing built yet.

## Q-7 · Fuel step 3: the supply chain · build
- state: queued
- backlog: S-13
- plan: docs/fuel-plan.md
- added: 2026-11-23

Haulers bring fuel from a body; the station gets a fuel stock, prices and markups. Waits for 2b.

## Done
