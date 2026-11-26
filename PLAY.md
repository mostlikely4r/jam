# Play

<!-- vibeview play v1. Things to try when you next play or use the project: one item per build
that wants a human look. Format: see vibeview/FORMAT.md -->

## P-3 · Lights in the designer: blink, glow, and out of step
- from: Q-38
- plan: docs/live-shapes-plan.md
- added: 2026-11-26

`npm run dev`, open the designer (`?dev`), Hulls page, pick your racer. Add a small circle near a
wingtip, set Colour change to snap, flash colour bright red, rest colour dark red, on 0.15, off 1.2,
glow 0.08: it blinks in the preview. Add a second on the other wingtip in green with offset 0.6: they
take turns. Set one to fade: it breathes. Save, fly, and look at traffic on the same hull: their
lights blink out of step with yours. Then drop the lights again if you don't want them yet (tools
only).

## P-4 · Auto targeting: pick and mine without clicking
- from: Q-31
- plan: docs/auto-targeting-plan.md
- added: 2026-11-26

Buy Targeting, Auto-mine and Auto targeting (or give them from the tab menu's Parts group). Stop in
a field, right click Auto targeting in the ship screen (I) and set Max range to 300: a turret
reaches about 400, so 300 is the mining setting (600 or more is for the hull's own gun). Don't click
anything: the nearest rock gets a box and the guns start; when it's mined out, the next one does.
Then right click Targeting and try Next main target: pick three rocks, mine the main one out, and
see which takes its place under Nearest, Most in front and Collision.

## Passed

## P-2 · Hull shapes: the new kinds, the default shade, the cockpits as shapes
- from: Q-36
- plan: docs/hull-shapes-plan.md
- added: 2026-11-26
- passed: 2026-11-26

`npm run dev`, play a moment: the cockpits and the tractor look as before, and a damaged tractor's
glow still goes out. Then open the designer (`?dev`), Hulls page: copy the racer and press **Add
default shade**: a shading like the defender's appears; add an ellipse, drag its radius handles and
turn it; give it a round gradient to clear and drag the gradient's middle to one side: it looks
like a lit dome. On the Parts page, pick the dome cockpit: its glass and glint are now shapes you
can drag.

## P-1 · Click move: thrust while turning, top speed
- from: Q-29
- plan: docs/click-move-thrust-plan.md
- added: 2026-11-26
- passed: 2026-11-26

Buy reverse and strafe for the floater, set Click to move's top speed to 200 (right click the
program in the ship screen, I), then right click a spot behind and to the side. The ship should
start moving at once, sliding while it turns, and not pass 200. Also: does the slower cap make
click moves feel calmer?
