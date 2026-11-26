# Live shapes plan

Written 2026-11-26, from S-71 (live elements on hulls and parts), first slice. Built 2026-11-26
(Q-38).

## Why

The hull and part designers draw still shapes: polygons, circles, rects, and since Q-36 ellipses,
arcs, rings, wedges, rounded rects, open lines and gradients (`docs/hull-shapes-plan.md`). Nothing
on a ship moves or lights up except the tractor's glow dot going out when the part is damaged
(`working: true`).

The user wants ships that look alive, and the first thing they pictured was **blinking lights**
(the user, 2026-11-26). It serves two pillars from `docs/vision.md`: alive without you (every ship
in a field twinkling as if a crew is at work) and the reveal (a faint light on your first ship
that you only notice on your tenth flight).

The user's framing (*decided*): this isn't a new "light" thing. It's **options on the shapes we
already have**: a shape can change colour periodically, and a shape can glow. A nav light is just
a small circle with those options set.

Nothing here rests on a guess about play: it's designer tooling, and the user draws the lights
themselves. The one guess is the cost of glow, which step 3 measures.

## The picture

The user's calls are marked *decided*. The rest is my proposal.

**Colour change** (*decided*: an option on any shape)

Any shape can carry `blink`. Without it the shape is drawn as today.

- `blink.colour`: the **flash colour**, `#rrggbb`. (*decided*: the names "rest colour" and "flash
  colour")
- `blink.rest`: the **rest colour**, `#rrggbb`. Left out, the rest colour is the shape's own role
  colour, as today. (mine: a nav light needs a dark red lens at rest, which no role gives)
- `blink.on`: seconds the flash lasts, more than 0.
- `blink.off`: seconds at rest between flashes, 0 or more.
- `blink.offset`: seconds the shape's cycle is shifted by, so two lights on one ship can take turns.
  Left out, 0.
- `blink.fade`: snap or fade, chosen per shape (*decided*). Left out, it snaps.

How lit the shape is, from 0 (rest colour) to 1 (flash colour), at time `t` into its cycle of
length `on + off` (mine):

- **Snap** (a blink): 1 for the first `on` seconds, 0 for the next `off`.
- **Fade** (a pulse): `sin(π · t / on)` for the first `on` seconds (up to full and back down),
  then 0 for `off`. With `off` 0 it breathes without a pause.

The colour drawn is the rest colour mixed toward the flash colour by that amount, per channel.

How it sits with what shapes already have (mine):

- The shape's `alpha` still applies on top.
- With a `fade` gradient, the mixed colour takes the place of the role colour at the gradient's
  start; `fade.to` is unchanged.
- On a part, the rest and flash colours are worn by the same `partColor(wear, …)` rule as the
  roles, so a worn light dims with its part. A `working` shape still vanishes when the part is
  damaged, blinking or not.
- A rim shape, an arc or an open line changes its stroke colour the same way.

**Each ship its own timing** (*decided*)

Ships sharing a hull don't blink in step. Each ship has its own **phase**, a number of seconds added
to the clock for every shape on it, so shapes on one ship keep the order their offsets give, and
lights twinkle across a field.

Ships have no id (`Ship` in `src/sim.ts`), so (mine) `src/render.ts` gives each ship a random phase
from 0 to 60 seconds the first time it draws it, kept in a `WeakMap` keyed by the ship object. It
isn't saved: a loaded game gets new phases, which nobody can tell.

**Glow** (*decided*: an option on any shape, tied to the flash when there is one)

Any shape can carry `glow`: a halo's size, in the shape's own units (hull radii on a hull, the
same on a part), more than 0.

- On a shape **without** `blink`, the glow is steady, in the shape's own colour.
- On a shape **with** `blink`, the glow goes with the flash: none at rest, full at the flash, and
  with fade it swells and shrinks with the colour. Its colour is the flash colour.

Drawn (mine) with the canvas's `shadowBlur` and `shadowColor` on the shape's own fill or stroke:
blur `glow × R` times the current scale, colour at alpha equal to how lit it is. That's the
expensive kind of canvas drawing, so step 3 measures it with many ships on screen, and if needed
skips glow on ships drawn small (see step 3).

**The clock** (mine)

`src/shipArt.ts` gets one module-level clock: `setArtTime(seconds | null)`. The game's renderer sets
it to its frame time plus the ship's phase before drawing each ship, and back to `null` after. With
`null`, the art is **still**: every blinking shape at its rest colour and no glow on it; steady glow
still draws. That's what static pictures get without any change to them: the shop icons, the start
menu cards (`src/main.ts`) and the ship screen's blueprint (`src/inventory.ts`, drawn once). The
smoke from broken parts in `drawVectorShip` keeps reading `performance.now()` as it does now.

A module clock rather than a new parameter because the time has to reach `drawShape` through
`drawVectorShip`, `drawHull`, `drawDecals`, `drawDecal`, `drawPartArt`, `drawTurret` and
`drawShapes`, and the designer calls several of those directly.

**The designer** (mine)

In the picked shape's panel, on both the Hulls and the Parts pages, beside the Gradient block:

- A **Colour change** block: none / snap / fade; a flash colour picker; a rest colour picker with a
  "Role colour" checkbox (ticked means no `rest`); and number fields for on, off and offset, in
  seconds, step 0.1.
- A **Glow** number field, empty or 0 for none.
- The preview animates: the designer's canvas already redraws in its `frame()` loop, so it sets
  the art clock to the page's time while drawing the hull and parts.
- A **Still** toggle with the layer toggles, which draws everything at rest, for placing a light
  without it flashing under the cursor.
- The shape list marks a shape that blinks or glows, so "4. Circle, glass ✦" reads at a glance.

**Tools only** (*decided*)

This build adds the options and the editor. It puts no lights on any hull or part: the user draws
them in the designer. `src/hulls.json` changes only in that the build must read and write the new
fields.

## What to build

All four steps are built; see **Built, with what changed** below.

1. **The data.** In `src/fitting.ts`, `ArtShape` gains `blink` (an object: `colour`, `rest`, `on`,
   `off`, `offset`, `fade`) and `glow`, each with a doc comment in the file's style. `readShape`
   reads them with its usual care:
   - a `blink` with a `colour` that isn't `#rrggbb`, an `on` that isn't more than 0, or an `off`
     that's negative or not a number is dropped, and the shape stays still;
   - a bad `rest` is dropped and the role colour is used; a bad `offset` reads as 0; `fade` is only
     `true` or left out;
   - a `glow` that isn't a number more than 0 is dropped.

   `shipFileNow` writes them back, and the round trip through `useShipFile` keeps them.
2. **The drawing.** In `src/shipArt.ts`:
   - `setArtTime(seconds | null)` and a pure `litAmount(blink, seconds)` (the snap and fade rules
     above, with the offset), exported for tests;
   - `paint` uses the mixed colour where a shape blinks, for flat colours and gradients alike;
   - `drawShape` sets the glow's `shadowBlur` and `shadowColor` when a shape has `glow` and is lit
     (steady, or lit above 0), and clears them in its own `save`/`restore`;
   - `drawPartArt` wears the rest and flash colours as it wears the roles.

   In `src/render.ts`, `drawShip` keeps the `WeakMap` of phases and sets the art clock before
   `drawVectorShip` and the turrets, and `null` after.
3. **The glow's cost.** Measure before deciding anything. In a dev build, give a hull that traffic
   flies (a draft, not saved) four glowing, blinking shapes, fill the view with traffic, and compare
   frame times with and without the glow (a short `requestAnimationFrame` timing script in the
   page, or the browser's performance panel). Write the numbers in this plan's "Built" section.
   - If a frame with glow stays within a few milliseconds of one without, leave it.
   - If not, skip glow on any ship drawn with a radius under 12 screen pixels (the renderer knows
     the zoom), and measure again. The flash colour still blinks there; only the halo goes.
4. **The editor.** In `src/designer/hulls.ts`, the Colour change and Glow blocks, the animated
   preview, the Still toggle and the mark in the shape list, as above. Edits go through undo like
   every other field. Any pure rule the panel needs (reading the fields back into a `blink`) goes
   in `src/designer/shapes.ts`, beside the shape handles.

These are one build with no stop.

## How we'll know

- **Unit tests**, in `src/hullShapes.test.ts` with its `recorder()` canvas:
  - `litAmount`: snap is 1 through `on` and 0 through `off`; fade is 0 at the cycle's start, 1 at
    `on / 2`, back to 0 at `on`, and 0 through `off`; the offset shifts the cycle; with `off` 0,
    fade repeats with no flat part;
  - `readShape` drops each bad case in step 1, keeps the good ones, and they survive a
    `shipFileNow` / `useShipFile` round trip;
  - with the clock at `null`, a blinking shape draws in its rest colour (the role colour when there
    is no `rest`) with no `shadowBlur`, and a steady glowing shape still sets `shadowBlur`;
  - with the clock set into the flash, it draws in the flash colour with `shadowColor` in that
    colour; with a gradient, the gradient's first stop is the mixed colour;
  - on a part, the flash colour is worn by `partColor`, and a `working` blinking shape is skipped at
    `DAMAGED_AT`;
  - two ships with different phases draw the same blinking shape in different colours at the same
    moment, and two shapes on one ship with offsets keep their order.
- **No change for today's art**: every hull and part in `src/hulls.json` draws the same calls with
  the clock at `null` and with it set, since none has `blink` or `glow`.
- `npm test` and `npm run build` pass.
- **Try it:** `npm run dev`, open the designer (`?dev`), Hulls page, pick your racer. Add a small
  circle near a wingtip, set Colour change to snap, flash colour bright red, rest colour dark red,
  on 0.15, off 1.2, glow 0.08: it blinks in the preview. Add a second on the other wingtip in
  green with offset 0.6: they take turns. Set one to fade: it breathes. Save, fly, and look at
  traffic on the same hull: their lights blink out of step with yours. Then drop the lights again
  if you don't want them yet (tools only).

## Needs first

Nothing unbuilt. It builds on the shape kinds and gradients of Q-36 (built 2026-11-26, `9330bd2`):
`ArtShape`, `readShape` and `shipFileNow` in `src/fitting.ts`, `paint`, `drawShape` and
`drawShapes` in `src/shipArt.ts`, and the shape panel and `src/designer/shapes.ts` in the designer.

## Built, with what changed from the plan

The four steps are in. The data and the drawing are as the plan has them: `ShapeBlink`, `glow` and
their reading in `src/fitting.ts`; `setArtTime`, `litAmount`, the mixed colours and the halo in
`src/shipArt.ts`; the per-ship phase and the clock in `src/render.ts`'s `drawShip`; and the editor's
blocks, Still toggle and list mark in `src/designer/hulls.ts`. These differ:

- **The halo's size includes how lit the shape is.** The plan gives a blinking shape's halo "none at
  rest, full at the flash, and with fade it swells and shrinks with the colour": its blur is
  `glow × R × scale × lit`, so a pulse's halo breathes with it. A steady glow's is the full size.
  The colour's alpha is the lit amount, as the plan says.
- **The blur takes the scale the ship is drawn at**, read from the canvas's own transform (its `a`
  and `b`, the scale and any turn), since `shadowBlur` is in pixels and not in the ship's units. A
  context that can't say — a test's own canvas — counts as 1.
- **A part wears a light's colours through the same `partColor`.** `ShapePalette` gained an optional
  `worn`, which `drawPartArt` fills in with `partColor(wear, …)`: the rest and flash colours take the
  wear a scorched part takes, and the role colours are still worked out before it, so nothing wears
  twice.
- **The colour change and the glow are read apart.** The plan drops a whole `blink` when its `off`
  "is negative or not a number", which a file without `off` is too; a shape keeps its `glow` when its
  `blink` is dropped, since the two are options of their own. Colours are kept lower-cased, and an
  offset of 0 is left out like the file's other differences.
- **The editor's rules are `blinkStart`, `blinkOf` and `restFor` in `src/designer/shapes.ts`**, beside
  the handles and the shading's start. `blinkOf` is the one that says what a usable colour change is
  (a flash longer than nothing, a rest of 0 or more); the panel never lets a typed number make one.
- **Still is its own toggle in the view bar**, not one of the layer eyes: the layers say what to hide,
  and Still says how to draw. Hidden layers and Still are both view state, never saved.

**Step 3, the glow's cost.** Measured in the dev page with the drawing code itself: 60 racers at the
screen size traffic is drawn at (12 px a hull radius, spread over 1280×720), four lights each, 300
frames a pass, the shapes patched into `HULL_SHAPES.racer` in memory and put back afterwards.

| 240 lights a frame | ms a frame |
| --- | --- |
| no glow | 2.39 – 2.61 |
| glow 0.08, steady | 2.76 |
| glow 0.25, steady | 2.69 |

A whole view of glowing ships costs under half a millisecond, inside the same noise as two runs of
the same drawing, so nothing was skipped: glow draws on every ship, however small. Blinking (the
clock moving) measured 2.69 – 3.11 ms with and without the glow, which is the same picture.

**How we'll know** is tested in `src/hullShapes.test.ts` (the timing rules, the reading, the round
trip, the halo, the gradient's first stop, a part's wear, the offsets, and every hull and part in the
file drawing the same with the clock set as still) and in `src/designer/shapes.test.ts` (the
panel's rules). One thing is covered by construction rather than by a test: the renderer's `WeakMap`
of phases needs the game's own canvas, so its effect is tested as two clocks half a cycle apart —
the same light in two colours at one moment — not by drawing two ships.

The review raised one finding, fixed: a damaged part's light was worn in its fill but its halo
wasn't, so a dimmed shape still glowed bright. The halo now takes the same `partColor` wear, with a
test for it.

## Not doing

- **A separate "light" kind.** Blink and glow are options on any shape (*decided*).
- **Ships blinking in step.** Each ship has its own phase (*decided*).

## Not in this build

The rest of S-71, each for later:

- **Lights that follow the ship's state** (S-72): throttle, turning, firing, fuel, damage. The user chose
  looks first (*decided*); a state rule would later drive the same lit amount.
- **Spin** (S-73): a dish or a gyro ring turning on its own.
- **A glint lit by the star** as the ship turns (S-74).
- **Particles** from shapes (S-74).
- **Lights on today's ships**: tools only (*decided*); the user adds them.
