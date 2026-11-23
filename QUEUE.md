# Queue

<!-- vibeview queue v1. Order = the order tasks go to agents; top is next. Format: see vibeview/FORMAT.md -->

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

## Q-8 · Faces: the combining pool · spec
- state: queued
- backlog: S-39
- added: 2026-11-23

Name the parts and let a face be assembled from them, so a few hundred variants can be generated
and the good ones kept, and so aliens are extra shapes in a pool rather than new art. The
vocabulary and the renderer are built (`src/faces.ts`, `src/voices.json`); what's missing is the
pool and the selection. Write the plan first; the gallery can then show combinations instead of one
hand-written face per voice.

## Q-9 · Faces: settle the shapes · other
- state: queued
- backlog: S-40
- plan: docs/chatter-faces-plan.md
- added: 2026-11-23

Little to build: the dev page already puts the open calls side by side. Ask for the letters (brows,
scar, lean, plain traffic, station), put the picks into `src/voices.json`, delete the options block,
and check the faces again at 26px in the radio log. Waits on the user's word, not on Q-8.

## Q-10 · Faces: familiarity · build
- state: queued
- backlog: S-41
- plan: docs/chatter-faces-plan.md
- added: 2026-11-23

Step 2 of the plan: meetings, the stranger to regular to friend levels, saved with the game, and the
two tweaks. Regular and friend lines go into the two packs in `src/voices.json`. Bump
`SAVE_VERSION`.

## Done

## Q-4 · Fuel step 2b: tanks as modules · build
- state: done
- done: 2026-11-23
- backlog: S-13
- plan: docs/fuel-plan.md

## Q-2 · Fuel step 2: tune · other
- state: done
- done: 2026-11-23
- backlog: S-13
- plan: docs/fuel-plan.md

## Q-3 · Fuel step 2: review · other
- state: done
- done: 2026-11-23
- backlog: S-13
- plan: docs/fuel-plan.md

## Q-1 · Fuel step 2: test and commit · test
- state: done
- done: 2026-11-23
- backlog: S-13
- plan: docs/fuel-plan.md
