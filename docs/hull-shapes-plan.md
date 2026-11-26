# Hull shapes plan

Written 2026-11-26, from Q-24 / S-57. Nothing here is built yet.

## Why

The user tried hull buying (2026-11-25) and found the shape editor can't make what the game's own
art draws. A shape today is a polygon, a circle or a rect (`ArtShape` in `src/fitting.ts`). The
dome cockpit's glass is a turned ellipse, and the tractor has an arc. Both exist only as code in
`src/shipArt.ts` (`drawDecal`, `drawPart`), so the designer can neither make them nor edit them.
New hulls also start with no shading unless someone draws it by hand.

The bigger reason is the user's picture of the game (2026-11-26): **detail is the reveal**. JAM
opens as plain Asteroids, a cursor ship shooting polygon rocks. The first ships' parts are already
there, faded, if you look. Later ships get more elaborate as the surprise wears off, until "it
was all there, you just didn't notice". So the editor needs shapes that can stay quiet on an early
hull and turn rich on a later one, from the same data. This plan adds those shapes. Things that
move or react (lights, glows, spin) are a separate, later plan (S-71).

## The picture

The user's calls are marked *decided*. The rest is my proposal.

**New shape kinds** (*decided*: the list)

Every shape keeps what shapes have now: a colour role (body, shade, rim, glass), `order`, `alpha`
and `clip`. A rim shape is stroked along its outline, as today. Any other role is filled. Units
are as today: hull radii on a hull, the same units on a part (a twelfth of the code's art units,
`R = 12`). Angles are in degrees, clockwise on screen, like the rect's `angle`.

- **Ellipse**: `x, y` middle, `rx, ry` radii, `angle` turn.
- **Arc**: `x, y` middle, `r` radius, `from` and `to` angles, `width` line width. An arc is always
  a line, stroked in its role's colour whatever the role, and never filled. With no `width` it
  uses the hull edge's width.
- **Ring**: `x, y` middle, `r` outer radius, `inner` hole radius (more than 0 and less than `r`).
  It's filled with the hole left empty (even-odd fill). A rim ring strokes both circles.
- **Wedge**: `x, y` middle, `r` radius, `from` and `to` angles. A slice of a circle. A rim wedge
  strokes the slice's outline, both straight sides included.
- **Rounded rect**: the rect gains `corner`, a corner radius from 0 up to half its shorter side.
  Leaving it out means square corners, as now.
- **Open line**: a polygon gains `open: true`. It's stroked through its points and not closed back
  to the first one, with `width` as its line width, in any role. It needs at least 2 points. The
  rule we have stays: a rim polygon of 2 points is an open line even without `open`.

**Gradient fill** (*decided*: option C)

Any shape can carry `fade`. Without it, a shape is one flat colour, as now.

- `fade.type`: `line` (straight across) or `round` (from a middle outward).
- `fade.to`: another colour role, or leave it out to fade to clear. The gradient runs from the
  shape's own role to `to`, and the shape's `alpha` still applies on top.
- A `line` fade has `fade.from` and `fade.end`, two points in the shape's own units: the shape's
  full colour at `from`, `to` (or clear) at `end`. The two points are also its direction.
- A `round` fade has `fade.x, fade.y` (the middle, which can sit off the shape's centre, so a
  dome's highlight can lean to one side) and `fade.reach` (the radius where `to` is reached).
- It works for strokes as well as fills: a rim shape or an arc with a fade strokes in the gradient.
- Wear acts on both ends. On a part, the same worn-colour rule (`partColor`) that darkens a role
  darkens `to`.

**The default shade** (*decided*)

There's a button, **Add default shade**, next to the add buttons. It adds the shading the
defender, drone and pirate have: the hull's outline scaled to 60% about the origin, moved back by
1/6 of a radius (x − 1/6) and to one side by 5/24 (y + 5/24), with the shade role and clipped to
the outline. Those numbers were measured from the three hulls in `src/hulls.json`, which match
the rule to six decimals. On the Parts page there's no outline, so the button is hidden there.

**The code art moves into the file** (*decided*: option A)

The four cockpit decals (`cockpitKite`, `cockpitBar`, `cockpitDome`, `cockpitVisor`) and the
tractor art become shapes in `partArt` in `src/hulls.json`. They have to **look the same** as the
code draws them today. The tractor art covers every part of kind `tractor`: `tractor`,
`tractorAll` and `clamp`, which share one drawing today. After that, `drawDecal` loses its four
cockpit branches and `drawPart` loses its tractor branch. Thrusters, guns, the turret and the
inside parts keep their code art in this slice.

Matching them exactly needs two small additions (mine):

- **Part colours for all four roles.** `PartArt` has `metal` (body) and `rim` today. It gains
  `shade` and `glass` overrides (`#rrggbb`), and `partPalette` uses them when they're set,
  falling back to today's mixes. The part page gets two more colour pickers. That way the cockpit
  glass `#2b4a74` is the body colour, the glint `rgba(160,215,255,0.7)` is the glass colour
  `#a0d7ff` at alpha 0.7, the tractor's metal `[70,120,112]` and rim `[150,230,210]` are its own,
  and its glow `rgba(170,255,230,0.9)` is glass `#aaffe6` at alpha 0.9.
- **A shape that shows only while the part works.** A shape gains `working: true`. It's drawn only
  while the part's wear is under `DAMAGED_AT`. That's the tractor's glow dot, which goes out when
  the tractor is damaged. Hull shapes have no wear, so it does nothing there. It also lets later
  parts show damage without code.

Converting the numbers: the code's units divide by 12 to become the file's, and radians become
degrees. For example, the tractor's arc `arc(-0.4, 0, 1.9, -1.1, 1.1)` with line width 0.6 becomes
`{ kind: "arc", role: "rim", x: -0.033333, y: 0, r: 0.158333, from: -63.0254, to: 63.0254,
width: 0.6 }`. Positions and radii are ×12 when drawn, but `width` isn't: `drawShape` sets
`lineWidth` straight from it, in the same frame the code art draws in. So line widths copy over as
they are, and the tractor arc keeps 0.6.

**Reset still works** (mine). "Back to coded stats" on the Parts page calls `resetPartArt`, which
today drops a part's art so the code's drawing returns. Once the code drawing is gone, that would
leave the cockpits and tractors blank. So `resetPartArt` puts back the **shipped file's** art for
that part (`SHIPPED_SHIPS.partArt[id]`) when there is one, and only drops it otherwise. That's the
same fallback `readEdge` uses for a hull's outline.

**Decals draw from shapes.** `drawDecal` today has its own branches for the four cockpits and
calls `drawPartArt` for anything else. Once the branches are gone, every decal goes through
`drawPartArt(ctx, id, 0)`, so a decal with shapes draws them, at no wear.

## What to build

1. **The shape kinds and the fade, drawn and read.** In `src/fitting.ts`, `ArtShape.kind` gains
   `ellipse`, `arc`, `ring` and `wedge`. It also gains the fields above (`rx`, `ry`, `from`, `to`,
   `inner`, `corner`, `open`, `fade`, `working`), each with a doc comment in the file's style.
   `readShape` reads them with the same care it takes now, dropping a shape that can't draw:
   - an ellipse needs both radii;
   - an arc or wedge needs `r`, and `from` and `to` that differ;
   - a ring needs `0 < inner < r`;
   - `corner` is clamped to half the shorter side;
   - an open line needs 2 points;
   - a fade with a bad type, missing points, or a `to` that isn't a role is dropped, keeping the
     shape flat.

   `shipFileNow` writes them back. In `src/shipArt.ts`, `drawShape` draws each kind, filled and
   rim, and builds the fade with `createLinearGradient` / `createRadialGradient`, scaled by `R`
   like everything else. A rounded rect uses `ctx.roundRect` in the rect's turned frame.
   `drawShapes` and `drawPartArt` pass the wear through, so `working` shapes can be skipped and
   the fade's `to` worn.
2. **The editor.** In `src/designer/hulls.ts`:
   - Add buttons for the four new kinds, and **Add default shade** on the Hulls page only.
     New shapes appear at the view's middle and are picked, as `addShape` does now (sizes: radius
     0.25, ellipse 0.3 × 0.2, ring hole half the radius, arc and wedge from −45° to 45°).
   - Handles on the canvas, dragged like the points are now, with Shift snapping as elsewhere and
     every drag going through undo:
     - every middle-based shape gets a middle handle to move it;
     - an ellipse gets one handle at the end of each radius, and the turn knob the rect has;
     - an arc and a wedge get a radius handle and one handle at each end angle;
     - a ring gets one handle each for the outer and inner radius;
     - a rect's corner radius is a number field;
     - an open line is a polygon with an "Open" checkbox and a width field.
   - The picked shape's panel gets a **Gradient** block: none / line / round, a "to" dropdown
     (clear or one of the four roles), and the fade's own handles drawn on the canvas. A line
     fade shows two handles joined by a dashed line; a round fade shows a middle handle and a
     reach handle on a dashed circle. Picking line or round starts it across the shape's bounding
     box: line from left edge to right edge through the middle, round at the middle with a reach
     of half the box's diagonal.
   - A "Only while working" checkbox, on the Parts page only.
   - `SHAPE_KIND_NAMES` names the new kinds, so the shape list reads "3. Ellipse, glass".
3. **Part colours.** `PartArt.shade` and `PartArt.glass`, read in `cleanPartArt`, used by
   `partPalette`, and set from two more colour pickers on the Parts page beside metal and rim.
4. **Move the code art.** Write the shapes and colours for the four cockpits and the three tractor
   parts into `partArt` in `src/hulls.json`, by hand or by a one-off script, converted from the
   code. Then:
   - remove the cockpit branches from `drawDecal` and the tractor branch from `drawPart`;
   - make every decal go through `drawPartArt(ctx, id, 0)`;
   - make `resetPartArt` fall back to the shipped file's art.

   The old drawing code stays in the test file as a fixture (see below), the way
   `src/hullShapes.test.ts` keeps `OLD_HULL`.

These are one build with no stop. Nothing here rests on a guess about play: it's editor tooling,
and the art move is checked against the old code.

## How we'll know

- **Unit tests**, in `src/hullShapes.test.ts` beside the hulls-as-data tests, using its
  `recorder()` canvas:
  - each new kind draws (filled and rim) with the right canvas calls: `ellipse`, `arc` with the
    angles in radians, a ring as two arcs with an even-odd fill, a wedge through its middle,
    `roundRect`;
  - `readShape` drops each bad case listed in step 1, keeps the good ones, and they survive a
    `shipFileNow` / `useShipFile` round trip;
  - a fade makes a linear or radial gradient with the shape's role colour first, and `to` or clear
    second;
  - a `working` shape is drawn at wear 0 and skipped at `DAMAGED_AT`;
  - `partPalette` uses `shade` and `glass` when set;
  - the default shade of the defender's, drone's and pirate's outlines gives back the shade
    polygons they have in the file (to six decimals);
  - `resetPartArt("tractor")` gives back the shipped shapes, not nothing.
- **Looks the same**: for each of the four cockpits and `tractor`, at wear 0 and at `DAMAGED_AT`,
  the old code drawing (kept in the test as a fixture function) and the new file drawing make the
  same sequence of fills and strokes. That means the same paths (to 1e-6 after the ×12) and the
  same colours, where an `rgba(…, a)` in the old equals the colour in the new at `globalAlpha` a.
- **Editor tests**, beside the existing `src/designer/*.test.ts` ones, for the pure parts: the
  default shade from an outline, the fade's starting points from a shape's bounding box, and the
  handle drags for an ellipse radius and an arc end angle (pure functions, like `dragPoint`).
- `npm test` and `npm run build` pass; the editor-boundary check in the build still holds.
- **Try it:** `npm run dev`, play a moment: the cockpits and the tractor look as before, and a
  damaged tractor's glow still goes out. Then open the designer (`?dev`), Hulls page:
  - copy the racer and press **Add default shade**: a shading like the defender's appears;
  - add an ellipse, drag its radius handles and turn it;
  - give it a round gradient to clear and drag the gradient's middle to one side: it looks like a
    lit dome.

  On the Parts page, pick the dome cockpit: its glass and glint are now shapes you can drag.

## Needs first

Nothing unbuilt. It builds on the hull shape editor (Q-17, built 2026-11-24), part art in
`partArt` (Q-26, built 2026-11-25) and the decal mounts. All three are in the code: `ArtShape`
and `readShape` in `src/fitting.ts`, `drawShape` and `drawDecal` in `src/shipArt.ts`, and
`addShape` and `shapesEditor` in `src/designer/hulls.ts`.

## Not in this build

- **Live elements (S-71)**: blink, pulse, state-driven lights (throttle, turn, firing, damage),
  spin, and a glint lit by the star. Their own spec session (*decided*). Particles from shapes are
  parked inside that item. `working: true` above is the one state rule here, because the tractor's
  art needs it.
- **Curves with control handles** (Béziers). The handles are real work, so they're left out.
- **Moving the thruster, gun and turret code art** into the file. They have more wear-dependent
  geometry than `working` covers.
- **The part icons** (`src/glyphs.ts`) stay as they are.
- **Hull pictures sized to the hull** (S-56) is its own item.
