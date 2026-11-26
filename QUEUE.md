# Queue

<!-- vibeview queue v1. Order = the order tasks go to agents; top is next. Format: see vibeview/FORMAT.md -->

## Q-39 · Face cast, step 1: the pool and the roll page · build
- state: queued
- who: strong
- backlog: S-39
- plan: docs/face-cast-plan.md
- added: 2026-11-26

Stops for the user to roll and keep faces on the dev page (F under `?dev`).
strong: rests on a guess (that parts knowing their moods roll faces worth keeping); design by eye.

## Q-40 · Face cast: first interviews · other
- state: queued
- who: pair
- after: Q-39
- backlog: S-39
- plan: docs/face-cast-plan.md
- added: 2026-11-26

Bring kept faces into chat, one at a time; the agent follows "The interview" in the plan and writes
each entry in `src/cast.json`. Gus and Pip get interviewed too. Needs the pack format of step 2;
until it is built, write the fields as the plan names them.
pair: the answers are the user's.

## Q-41 · Face cast, steps 2–3: knobs, situations and dealing the cast · build
- state: queued
- who: strong
- after: Q-39, Q-10, Q-40
- backlog: S-39
- plan: docs/face-cast-plan.md
- added: 2026-11-26

Knobs read by chatter, the new situation line kinds, the cast dealt to every base and saved.
Bumps `SAVE_VERSION`. Stops for the user to play.
strong: changes the save format and widens Q-10's regulars record.

## Q-30 · Nothing vanishes in view · build
- state: queued
- who: strong
- backlog: S-64
- plan: docs/in-view-plan.md
- added: 2026-11-25

Rests on a guess about where it was seen: step 1 (the camera as the viewer) stops for the user
to try.
strong: rests on a guess about where things are seen, so the ground is unclear.

## Q-32 · Blueprints for programs and hulls · build
- state: queued
- who: strong
- backlog: S-65
- plan: docs/blueprints-plan.md
- added: 2026-11-25

Hulls first, then programs; stops after hulls for the user to fund one. Bumps `SAVE_VERSION`.
strong: changes the save format (bumps SAVE_VERSION).

## Q-19 · AI hulls: templates and spawn points · build
- state: queued
- who: strong
- backlog: S-49
- plan: docs/ai-hulls-plan.md
- added: 2026-11-24

Step 1 (templates and a spawn point) stops for the user to try. Waits on Q-17.
strong: wide: templates, spawning, and part ids moving from code to data.

## Q-42 · Auto targeting: keep one pick inside its Max range · build
- state: queued
- who: cheap
- after: Q-31
- backlog: S-63
- plan: docs/auto-targeting-plan.md
- added: 2026-11-26

Q-31's step leaves the queue alone while anything at all is picked, so a ship floating slowly keeps a
rock behind it and never takes a fresh one. Decided 2026-11-26: the gate is the program's own Max
range instead — pick again while nothing picked is inside it, pushed to the tail, never moving the
head — so the program stays blind to what reads the queue (guns now, a tractor or a scan later).
Never gate it on a consumer's reach. The plan's Built section and the try-it lines say 300 now, since
600 is past a turret. One condition in `Sim.autoTarget`, one line in `Sim.autoTargetPick`, and tests
for both halves: adds while nothing picked is in range, adds nothing while one is, and the head is
never replaced.
cheap: one rule, on top of Q-31's step; the plan names it.

## Q-20 · Damage levels · build
- state: queued
- who: cheap
- backlog: S-50
- plan: docs/damage-levels-plan.md
- added: 2026-11-24

Stands alone. Step 1 (thresholds, looks, weaker thruster) stops for the user to try.
cheap: stands alone and the plan is precise.

## Q-12 · Clouds, step 2: dampening, nanites and the arc · build
- state: queued
- who: cheap
- backlog: S-42
- plan: docs/clouds-plan.md
- added: 2026-11-24

The effect machinery, a gap that turns with the cloud, dampening as the penalty and nanites as the
gift. Ships fly straight through. Waits on the user flying step 1 (Q-11).
cheap: precise plan; step 1 is played.

## Q-7 · Fuel step 3: the supply chain · build
- state: queued
- who: strong
- backlog: S-13
- plan: docs/fuel-plan.md
- added: 2026-11-23

Haulers bring fuel from a body; the station gets a fuel stock, prices and markups. Waits for 2b.
strong: the supply chain touches haulers, station stock and prices.

## Q-9 · Faces: settle the shapes · other
- state: queued
- who: pair
- backlog: S-40
- plan: docs/chatter-faces-plan.md
- added: 2026-11-23

Little to build: the dev page already puts the open calls side by side. Since the face cast plan
(`docs/face-cast-plan.md`) only Gus's and Pip's calls are left: ask for the letters (Gus's brows and
scar, Pip's lean), put the picks into `src/voices.json`, and delete the options block. Plain traffic
keeps the generic face and the station display becomes the station role's leaning in the pool.
pair: needs the user's picks.

## Q-10 · Faces: familiarity · build
- state: queued
- who: strong
- backlog: S-41
- plan: docs/chatter-faces-plan.md
- added: 2026-11-23

Step 2 of the plan: meetings, the stranger to regular to friend levels, saved with the game, and the
two tweaks. Regular and friend lines go into the two packs in `src/voices.json`. Bump
`SAVE_VERSION`.
strong: changes the save format (bumps SAVE_VERSION).

## Q-23 · Pricing: one price function, then the new rules · build
- state: queued
- who: strong
- backlog: S-55
- plan: docs/pricing-plan.md
- added: 2026-11-25

Step 1 moves every price into `price()` with no change in play and stops for a check; step 2
brings the 60% buy share, frame-plus-parts hulls and the contracts, then stops for the user to try.
strong: moves every price into one function.

## Q-13 · Small fixes: fitting by mounts, news links, traffic beams, tank art · build
- state: queued
- who: cheap
- backlog: S-45
- added: 2026-11-24

Four independent fixes; the decided spec is the S-45 text in BACKLOG.md. The first, fit by mounts
(I-7), was built 2026-11-25 with the hull buying fixes; the tank art one is settled too, by S-60
(Q-26): a width of 2 on each tank's part page in the designer. News links and traffic beams are
left.
cheap: the spec is settled in S-45.

## Q-14 · Face target faces any target, main or closest · build
- state: queued
- who: cheap
- backlog: S-43
- added: 2026-11-24

The decided spec is the S-43 text in BACKLOG.md: any target, a main/closest tweak (main by
default), no target no effect.
cheap: the spec is settled in S-43.

## Q-15 · Cargo bays: buying swaps the smallest, unloading starts at the top · build
- state: queued
- who: cheap
- backlog: S-44
- added: 2026-11-24

The decided spec is the S-44 text in BACKLOG.md: a bigger bay bought replaces the smallest, cargo
moves over, the old bay to the locker; ore nearest the entry sells first.
cheap: the spec is settled in S-44.

## Q-43 · Designer defaults reach the ship: turret guns and default programs · build
- state: queued
- who: cheap
- backlog: S-75
- added: 2026-11-26

Minor. Let a turret mount take a gun as its default part in the hull designer, and load the hull's
Default programs into the computer (as far as it has slots) when the hull is bought at a station or
switched to from the tab menu. Find where a new hull's default parts are fitted and do the programs
the same way, in both paths; a test for each path.
cheap: two small fixes with a clear outcome.

## Q-44 · Credits and fuel level in the ship screen · build
- state: queued
- who: cheap
- backlog: S-76
- added: 2026-11-26

Minor. Show the player's credits and the fuel level (amount and capacity) in the ship screen (I),
in the same style as its other numbers.
cheap: a small UI addition with a clear outcome.

## Done

## Q-31 · Auto targeting · build
- state: done
- who: cheap
- backlog: S-63
- plan: docs/auto-targeting-plan.md
- added: 2026-11-25
- done: 2026-11-26

Step 2 stops for the user to try idle mining with it.
cheap: precise plan on top of targeting that is already built.

## Q-8 · Faces: the combining pool · spec
- state: done
- done: 2026-11-26
- backlog: S-39
- plan: docs/face-cast-plan.md
- added: 2026-11-23

## Q-38 · Live shapes: colour change and glow · build
- state: done
- who: cheap
- backlog: S-71
- plan: docs/live-shapes-plan.md
- after: Q-36
- added: 2026-11-26
- done: 2026-11-26

One build, no stop: blink and glow on any shape, a phase per ship, the glow's cost measured, then
the designer's fields. Tools only: no lights put on any hull.
cheap: precise plan on top of the shape code Q-36 built; the tests pin the timing rules.

## Q-37 · Live shapes: colour change and glow · spec
- state: done
- done: 2026-11-26
- backlog: S-71
- plan: docs/live-shapes-plan.md
- added: 2026-11-26

## Q-36 · Hull designer shapes: new kinds, gradients, default shade, code art to the file · build
- state: done
- done: 2026-11-26
- who: cheap
- backlog: S-57
- plan: docs/hull-shapes-plan.md
- added: 2026-11-26

One build, no stop: the shape kinds and fade, the editor's handles, part colours, then the cockpit
and tractor art moved into the file with a looks-the-same test.
cheap: precise plan, and the old drawing kept as a test fixture catches any drift.

## Q-24 · Hull designer: ellipse and arc shapes, a default decal · spec
- state: done
- done: 2026-11-26
- backlog: S-57
- plan: docs/hull-shapes-plan.md
- added: 2026-11-25

## Q-11 · Clouds, step 1: clouds you can see · build
- state: done
- done: 2026-11-26
- backlog: S-42
- plan: docs/clouds-plan.md
- added: 2026-11-24

A new place kind: a turned ellipse with a ring and falloff, two looks (gas, dust) on a back or
front layer. Visuals only, no effects, no AI. Stops for the user to fly through one. Step 1 is
built (`cf39eea`): this waits on their try, so it isn't work for an agent.

## Q-6 · Route: the ring round the station, then look ahead · build
- state: done
- done: 2026-11-26
- plan: docs/look-ahead-plan.md
- added: 2026-11-23

Two separate numbers in `ShipPilot.routeAround`, both measured by `npm run dockchase`. Ring first.
Nothing built yet.

## Q-29 · Click move: the faster way, thrust while turning, top speed · build
- state: done
- backlog: S-59
- plan: docs/click-move-thrust-plan.md
- added: 2026-11-25
- done: 2026-11-26

Step 1 (the top speed tweak) stops for the user to try; step 3 stops again.

## Q-28 · Dev tools: tab menu programs, hull switch, fit anywhere, hull names · build
- state: done
- done: 2026-11-25
- backlog: S-62
- plan: docs/dev-tools-plan.md
- added: 2026-11-25

Tools for testing, not for players. Stands alone. Built 2026-11-25: a program picker and a hull
switch in the Parts group, a "Fit anywhere" switch, and a hull's own name in the designer.

## Q-35 · Chatter faces swing to the music · build
- state: done
- done: 2026-11-25
- backlog: S-68
- plan: docs/chatter-faces-sway-plan.md
- added: 2026-11-25

## Q-34 · Chatter faces swing to the music · spec
- state: done
- done: 2026-11-25
- backlog: S-68
- plan: docs/chatter-faces-sway-plan.md
- added: 2026-11-25

## Q-27 · Many mounts: every turret and tractor counts · build
- state: done
- done: 2026-11-25
- backlog: S-58
- plan: docs/many-mounts-plan.md
- added: 2026-11-25

Turrets first, then tractors. Bumps `SAVE_VERSION`. Built 2026-11-25: each turret has its own gun
mount and angle, each tractor its own cone, and `SAVE_VERSION` is 11.

## Q-26 · Ship art fixes: tank drain, part art everywhere, hull tint · build
- state: done
- done: 2026-11-25
- backlog: S-60
- plan: docs/ship-art-fixes-plan.md
- added: 2026-11-25

Three small fixes, one commit each. The second makes the tank item of Q-13 a designer setting.
Built 2026-11-25.

## Q-25 · Dock shop fixes: shift-click sells, programs ignore parts, your credits · build
- state: done
- done: 2026-11-25
- backlog: S-61
- plan: docs/dock-shop-fixes-plan.md
- added: 2026-11-25

Three small fixes, one commit each. Stands alone. Built 2026-11-25.

## Q-33 · Music: funk under the work · build
- state: done
- done: 2026-11-25
- backlog: S-66
- plan: docs/music-plan.md
- added: 2026-11-25

Both steps built 2026-11-25 (step 1 tried), with four Kevin MacLeod tracks. Docked, the track is
held and picks up on undocking (the user's call after the first try). Later: S-67, S-68, S-69.

## Q-18 · Hull buying · build
- state: done
- done: 2026-11-25
- backlog: S-48
- plan: docs/hull-buying-plan.md
- added: 2026-11-24

Station sell lists, then buying with trade-in. Built and tried 2026-11-25; the fixes from the try
are in 58936d4, the rest went to Q-24, S-56 and the pricing plan (Q-23).

## Q-17 · Hulls as data, and the shape editor · build
- state: done
- done: 2026-11-24
- backlog: S-47
- plan: docs/hull-drawing-plan.md
- added: 2026-11-24

Shapes into src/hulls.json, a model becomes a name, then the editor. Today's hulls must look the
same. Waits on Q-16.

## Q-16 · Designer comforts · build
- state: done
- done: 2026-11-24
- backlog: S-46
- plan: docs/designer-comforts-plan.md
- added: 2026-11-24

Editor only: deselect, wheel zoom, undo, layer toggles, the multi-select, part art, the turret circle.
Stands alone; the drawing plan leans on its undo and layers.

## Q-22 · Clamp tow, slice 2, steps 3–4: tow traffic and blocks · build
- state: done
- done: 2026-11-24
- plan: docs/clamp-tow-plan.md
- added: 2026-11-24

A few traffic floaters turn tow ships (whole rocks home, block jobs first); the deposit and its
turrets get built from blocks carried to the site, for a deposit and pay. Q-21 is played and
done, so the autopilot it flies with is settled.

## Q-21 · Clamp tow, slice 2, step 2: safe towing program · build
- state: done
- done: 2026-11-24
- plan: docs/clamp-tow-plan.md
- added: 2026-11-24

The `towControl` program: the autopilot keeps a towed rock under the safe bump speed, routes
round with room for it, and delivers it to the refinery pad. Played and approved.

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
