# Queue

<!-- vibeview queue v1. Order = the order tasks go to agents; top is next. Format: see vibeview/FORMAT.md -->

## Q-21 · Clamp tow, slice 2, step 2: safe towing program · build
- state: queued
- plan: docs/clamp-tow-plan.md
- added: 2026-11-24

The `towControl` program: the autopilot keeps a towed rock under the safe bump speed, routes
round with room for it, and delivers it to the refinery pad. Stops for the user to try.

## Q-22 · Clamp tow, slice 2, steps 3–4: tow traffic and blocks · build
- state: queued
- plan: docs/clamp-tow-plan.md
- added: 2026-11-24

A few traffic floaters turn tow ships (whole rocks home, block jobs first); the deposit and its
turrets get built from blocks carried to the site, for a deposit and pay. Waits on the user
trying Q-21.

## Q-16 · Designer comforts · build
- state: queued
- backlog: S-46
- plan: docs/designer-comforts-plan.md
- added: 2026-11-24

Editor only: deselect, wheel zoom, undo, layer toggles, the multi-select, part art, the turret circle.
Stands alone; the drawing plan leans on its undo and layers.

## Q-17 · Hulls as data, and the shape editor · build
- state: queued
- backlog: S-47
- plan: docs/hull-drawing-plan.md
- added: 2026-11-24

Shapes into src/hulls.json, a model becomes a name, then the editor. Today's hulls must look the
same. Waits on Q-16.

## Q-18 · Hull buying · build
- state: queued
- backlog: S-48
- plan: docs/hull-buying-plan.md
- added: 2026-11-24

Station sell lists, then buying with trade-in. Step 2 waits on Q-17. Stops for the user to try.

## Q-19 · AI hulls: templates and spawn points · build
- state: queued
- backlog: S-49
- plan: docs/ai-hulls-plan.md
- added: 2026-11-24

Step 1 (templates and a spawn point) stops for the user to try. Waits on Q-17.

## Q-20 · Damage levels · build
- state: queued
- backlog: S-50
- plan: docs/damage-levels-plan.md
- added: 2026-11-24

Stands alone. Step 1 (thresholds, looks, weaker thruster) stops for the user to try.

## Q-11 · Clouds, step 1: clouds you can see · build
- state: queued
- backlog: S-42
- plan: docs/clouds-plan.md
- added: 2026-11-24

A new place kind: a turned ellipse with a ring and falloff, two looks (gas, dust) on a back or
front layer. Visuals only, no effects, no AI. Stops for the user to fly through one.

## Q-12 · Clouds, step 2: dampening, nanites and the arc · build
- state: queued
- backlog: S-42
- plan: docs/clouds-plan.md
- added: 2026-11-24

The effect machinery, a gap that turns with the cloud, dampening as the penalty and nanites as the
gift. Ships fly straight through. Waits on the user flying step 1 (Q-11).

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

## Q-13 · Small fixes: fitting by mounts, news links, traffic beams, tank art · build
- state: queued
- backlog: S-45
- added: 2026-11-24

Four independent fixes; the decided spec is the S-45 text in BACKLOG.md. The racer tractor fit
(I-7) is the one the user hit in play.

## Q-14 · Face target faces any target, main or closest · build
- state: queued
- backlog: S-43
- added: 2026-11-24

The decided spec is the S-43 text in BACKLOG.md: any target, a main/closest tweak (main by
default), no target no effect.

## Q-15 · Cargo bays: buying swaps the smallest, unloading starts at the top · build
- state: queued
- backlog: S-44
- added: 2026-11-24

The decided spec is the S-44 text in BACKLOG.md: a bigger bay bought replaces the smallest, cargo
moves over, the old bay to the locker; ore nearest the entry sells first.

## Done

## Q-5 · Clamp tow, first slice · build
- state: done
- done: 2026-11-24
- plan: docs/clamp-tow-plan.md

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
