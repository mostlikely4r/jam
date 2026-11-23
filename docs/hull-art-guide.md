# Hull art: how a hull should look, and what to do when a test says no

Written 2026-11-23, out of a conversation about the racer's and floater's drafts. The user's own
calls are marked *decided*; the numbers are the code's, not opinions.

Read this before drawing a hull or placing its mounts, when a fitting test fails against a hull
draft, and when designing new hulls: 200+ are coming and agents will draw most of them.

## What a hull is for

The silhouette is the subject. Mounts are detail on it: a part sits inside, under, or half through
the hull rather than bolted to the outside (*decided* — "part of the hull" is the default, and
should become the norm). A part that stands out should be a choice, not the only thing the file
knows how to do.

A silhouette is a handful of points in `HULL` in `src/shipArt.ts`. A mount is a place in
`src/hulls.json`, drawn by `drawVectorShip`, with `order` below zero putting it under the hull and
`alpha` below 1 fading it. The hull designer (`npm run dev`, then `?dev` in the URL) moves, turns,
sizes, fades and layers a mount and saves straight to that file.

## Cool over perfect (*decided*)

Flair beats efficiency. A strafe thruster turned off its axis still strafes, just worse; smaller
and offset thrusters look cooler and work fine; the floater flies one wide cockpit because it
gives it flair. Take the look — and say out loud what it costs.

What it costs, from `mountThrust` in `src/fitting.ts` and `STANDARD_TURN_LEVER` 0.7:

| what you turn | what it costs | what it buys |
|---|---|---|
| a turn thruster by 9° | 1% of its sideways push, which a turn thruster throws away anyway | **+21% turn one way, +18% the other** (what the floater's draft measured) |
| a strafe thruster by 8° | 1% of the sideways push | a 12–14% push astern, so the hull drifts as it strafes |
| a turn thruster's `x` | nothing else | turn *is* `x / 0.7`: -0.73 turns 4% harder than -0.7 |

So tilting a turn thruster makes the hull more agile and costs nothing else, while tilting a
strafe makes it drift. Both are allowed. Neither is free, and the difference is worth knowing
before the eye decides.

## The surprise ladder (*decided*)

Detail is paced by what the player knows, not by the hull's size. A starting ship shows its
internals only to someone looking closely — the racer's bay at `alpha` 0.2, its gun at 0.45, the
floater's bay at 0.3 — because a bay drawn solid on the first ship spends a mechanic the player has
not met yet. Later hulls, and later modules, can say it plainly: by then the player knows a cargo
bay when they see one.

The ghosting was a test of how subtle that can go, and it stays (*decided*). So `alpha` is pacing,
not decoration. Before fading a mount, ask where this hull sits in the game and what the player
already knows at that point; this is pillar 4 — looks simple, turns deep — drawn rather than
written.

## Flair by character, not by symmetry (*decided*)

An off-centre part, one cockpit shape, a swept nozzle is what makes a hull feel drawn instead of
extruded. Don't mirror everything out of tidiness.

## Tests guard ability, not tuning (*decided* 2026-11-23)

A fitting test fails when a mount can't do its job, and not otherwise. A thruster turned off its
axis still pushes and still turns, so the test asks exactly that: some force, more of it along the
control's own axis than across it, and a turn that turns. How well it does it is the designer's and
the plan's to say. Efficiency drift worth knowing about belongs in something a person reads — the
designer showing a mount's turn and strafe price — and at most as a warning, never as a failing
test.

## When a test disagrees with a draft

A test is then the price tag on a look, not a verdict on it. Read the failure, name the trade in
one line, then choose:

- **Keep the look and revisit the test**, saying so in the plan. If a hull is meant to fly
  differently, the test follows the hull.
- **Take the tuning back** if the look was only a by-product of a drag.
- **Fix the test** when it turns out to lean on looks. One read `globalAlpha` after the whole
  draw, assuming the faded mount drew last; the assumption was the bug, not the cockpit layered
  above it.

Never make a test green by quietly moving a draft back. A working tree holding someone's
hand-made draft is a question to ask them, not a work order.

## Designing new hulls at scale

Today a hull is one polygon in `HULL` plus eleven or so mounts, so 200+ hulls is first a question
about silhouettes and only then about mounts. Per hull:

- Silhouette first, mounts second: place the mounts for the shape you drew.
- Keep each family's grammar — racer skin-integrated, floater rim-mounted and swept — and vary
  inside it. Two hundred hulls sharing a grammar read as one game; two hundred inventions don't.
- Decide the hull's place on the surprise ladder before its alphas, and write it down.
- Tilt and fade hull by hull, for character. A family that all tilts the same way has re-tuned
  the game's handling by accident: the point of the flair is that one hull differs from another.
- Leave roles and tuning alone unless the hull is meant to handle differently, and if it is, that
  is a plan rather than a nudge.

## The short version

Silhouette leads, parts are skin, flair beats efficiency but never silently, early hulls keep their
secrets, tests ask whether a mount can do its job, and a red test is a price tag to discuss.
