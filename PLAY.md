# Play

<!-- vibeview play v1. Things to try when you next play or use the project: one item per build
that wants a human look. Format: see vibeview/FORMAT.md -->

## P-2 · Hull shapes: the new kinds, the default shade, the cockpits as shapes
- from: Q-36
- plan: docs/hull-shapes-plan.md
- added: 2026-11-26

`npm run dev`, play a moment: the cockpits and the tractor look as before, and a damaged tractor's
glow still goes out. Then open the designer (`?dev`), Hulls page: copy the racer and press **Add
default shade**: a shading like the defender's appears; add an ellipse, drag its radius handles and
turn it; give it a round gradient to clear and drag the gradient's middle to one side: it looks
like a lit dome. On the Parts page, pick the dome cockpit: its glass and glint are now shapes you
can drag.

## Passed

## P-1 · Click move: thrust while turning, top speed
- from: Q-29
- plan: docs/click-move-thrust-plan.md
- added: 2026-11-26
- passed: 2026-11-26

Buy reverse and strafe for the floater, set Click to move's top speed to 200 (right click the
program in the ship screen, I), then right click a spot behind and to the side. The ship should
start moving at once, sliding while it turns, and not pass 200. Also: does the slower cap make
click moves feel calmer?
