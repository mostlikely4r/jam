# Hull drawing plan: hulls as data, and a shape editor

Written 2026-11-24. Second of five plans from one talk about reworking the hull designer (see
`docs/designer-comforts-plan.md` for the list). It is the groundwork for
`docs/hull-buying-plan.md` and `docs/ai-hulls-plan.md`: both need hulls that can be added and
copied without code. Built 2026-11-24 (Q-17): see **What the build settled** for where the code
went past this picture.

## Why

The user wants to draw hulls in the designer, from their own use of it. Today they can't, and a
new hull can't exist without code:

- Hull shapes are hard-coded in `src/shipArt.ts`: `HULL` (the outline of each of the five hulls)
  and `BELLY` (the darker shading panel, only for racer and floater; the others get a shrunk
  copy of the outline). `drawHull` draws body fill, the belly clipped to the outline, then the
  lit edge, plus a floater-only front edge.
- `ShipModel` is a fixed list in `src/parts.ts` (`SHIP_MODELS = ["racer", "floater", "defender",
  "drone", "pirate"]`), and `HULL_INFO`, `HULL_MOUNTS` and more are keyed by it.
- `src/hulls.json` holds only each hull's mounts and its `hullInfo` (programs, loadouts, usedBy,
  price, weight, hull points).

## The picture

Items marked *decided* are the user's calls; the rest is my proposal, open to veto.

- **A hull is data** (*decided*, as the groundwork the user agreed to). Its shape lives in
  `src/hulls.json` with its mounts, and a model is just a name: `ShipModel` becomes `string`,
  and the list of hulls is the file's.
- **One edge polygon per hull** (*decided*). It is the hull's outline, the shape collisions are
  meant to use, and the line the "drawn under the hull" trick clips against (mounts with
  `order` below 0). Parts get no edge and no collision shape (*decided*).
- **Visual shapes on top of the edge** (*decided*): polygons, circles and rects, for shading,
  panels and decals. Each has an order and a transparency like mounts do. The same shape editor
  draws parts (*decided*: one editor for both).
- **Colour roles, not colours** (*decided*). A shape says which role it takes: body, shade, rim
  (the lit edge), or glass/glow (proposal for the fourth). The ship's colour picks the palette:
  today `drawHull` already takes the hull colour from its caller and derives the belly from it
  (`mix(hull, [40, 50, 70], 0.22)`), so roles are the same derivation made explicit. One drawing
  then serves every faction, and the player can paint their ship later.
- **Mirror drawing, on by default** (*decided*). Hulls face +x, so the mirror line is y = 0. With
  mirror on, adding or dragging a point moves its twin across the line; a point on the line stays
  single. It can be turned off for odd shapes.
- **Snap with Shift** (*decided*). Holding Shift snaps the dragged point to a grid. Proposal: a
  grid of 0.05 hull units (the units mounts already use: `x`, `y` in hull radii).
- **Copy a hull** (*decided*). A button makes a new hull from the selected one: shape, mounts,
  hull info, under a new id and name ("Racer copy"). The AI plan needs it for AI-only hulls.
- **Drawn part art is optional** (*decided*). Today parts are drawn in code (`drawPart` and
  friends in `src/shipArt.ts`). A part with drawn shapes in the file uses them; one without keeps
  its code art. Nothing has to be redrawn for this to ship.
- **Today's hulls look exactly as they do now** (proposal, so the change can be checked). The
  five outlines and two bellies move into the file with the same points; the floater's front
  edge becomes a rim-role line shape on the floater.

**Editing, proposed:**

- Select a shape in a shapes list (the layer list from the comforts plan) or by clicking it.
- Drag a point to move it. Click on a segment of the selected polygon to insert a point there.
  Delete or right-click removes a point (a polygon keeps at least three).
- Add a polygon (starts as a small mirrored diamond), a circle or a rect at the view centre.
- Circles and rects have a centre, size and angle, dragged like a mount (handles and wheel).
- The edge is always there and can't be deleted; it is drawn on top of the other shapes as the
  rim, like the lit edge today.
- Every edit is one undo step (needs the comforts plan's undo).

**What the game does with it:**

- `drawHull(ctx, model, colour)` draws the hull's shapes in order, clipped to the edge where the
  shape says so (shading is clipped, as the belly is now), then the edge as the rim.
- Collisions keep using `SHIP_RADIUS` in this build. The edge is stored as the collision shape for
  when collisions move to it (see Not in this build).
- A save or world that names a hull the file doesn't have gets the racer, with a warning in the
  console, rather than crashing.

## The build

Built 2026-11-24, all four steps. What changed from the plan is under **What the build settled**
below.

### 1. Shapes move into the file · built

Add `edge` and `shapes` to each hull in `src/hulls.json`, read and written by `useShipFile` and
the ship file writer in `src/fitting.ts`. Fill them from today's `HULL`, `BELLY` and the floater
edge. `drawHull` reads the file. Delete `HULL` and `BELLY`. Nothing should look different.

### 2. A model is a name · built

`ShipModel` becomes `string`; `SHIP_MODELS` comes from the file. Every `Record<ShipModel, …>` and
every switch over models (`drawHull`'s floater branch, `SHIP_CHOICES`, tuning that names a model)
is checked. Unknown model falls back to the racer. `src/designer/world.ts`'s `SHIP_CHOICES` stays
the new-game list, now any hull with the `newGame` use.

### 3. The shape editor and copy hull · built

On the Hulls page: the shapes list, point editing, mirror (on by default) and Shift snap, add
polygon, circle and rect, colour role and order and transparency per shape, copy hull.

### 4. Parts can be drawn · built

The same editor on the Parts page, writing a part's shapes into the file. A part with shapes draws
them; one without keeps its code art.

## How we'll know

- Unit tests: today's five hulls read from the file give the same points as the old `HULL` and
  `BELLY` (a test that keeps the old arrays as fixtures); the mirror rule (a point's twin moves,
  an on-line point stays single); snap; copy hull makes an independent copy (changing it leaves
  the source alone); an unknown model falls back to the racer; a part with shapes draws them and
  one without keeps code art; ship file round trip for edge and shapes. They are in
  `src/hullShapes.test.ts`, with the old arrays kept there as the fixtures.
- `npm test` and `npm run build` pass; the editor-boundary check in the build still holds.
- **Try it:** `npm run dev`, play a moment: every ship looks as before. Open the hull designer,
  copy the racer, drag a nose point of the copy forward: its twin follows and the nose grows; hold
  Shift: it snaps. Add a circle with the glass role on top. Undo twice. Start a new game where the
  copy is allowed (give it the `newGame` use): you fly it.

## What the build settled

Where the code went further than the picture above, or read it one way rather than another:

- **The file nests.** Each hull in `src/hulls.json` is now one object, `{ edge, shapes, mounts }`,
  rather than a mounts array with two keys beside it.
- **A rim shape is stroked, not filled.** That is what makes the floater's pale front edge a shape:
  a rim polygon of two points is an open line of its own `width` (1.4 for that one), and anything
  with three or more points is a closed outline. Lit edges draw after the hull's own edge; every
  other shape draws before it, in draw order.
- **The palette.** Body is the ship's colour; shade is `mix(hull, [40, 50, 70], 0.22)`, the belly's
  old derivation; rim is `rgb(240, 246, 255)`; glass is `mix(hull, [110, 200, 255], 0.6)`. The
  hull's own edge is painted at 85% and a rim shape at full strength, so the floater's front edge
  comes out a hair darker than its old `#f4f8ff` and nothing else moves.
- **A copy keeps its hull info but none of its uses.** `copyHull` gives the copy the outline,
  shapes, mounts, programs, loadouts and stats, and an empty `usedBy`, so a copy of the racer does
  not appear in the new game by itself: give it the `newGame` use and it does. Ids are
  `<hull>Copy`, then `<hull>Copy2`; the name people see is the id in words.
- **A part's shapes live in its art.** They are kept in `partArt[id].shapes` and are in the same
  units as a hull's, a twelfth of a radius, so one editor and one grid serve both. A part with
  shapes is drawn from them; one without keeps its code art, exactly as before.
- **Every hull name is the file's.** `ShipModel` is a string, `SHIP_MODELS` is the file's list, and
  a name the file hasn't got falls back to the racer with one warning in the console. `shipFileNow`
  and `useShipFile` round trip the edges and shapes like everything else.
- **The new game's ships come from the file too.** `newGameHulls()` is every hull with the
  `newGame` use; the start menu and `SHIP_CHOICES` (`shipChoices()`) both read it, and a new
  `tuning.startHull` is what the menu sets, so a hull of your own is the one you fly.
- **Snap is 0.05 of a radius with Shift held**, as proposed, and mirroring is on until turned off.
  Adding a point adds its twin on the segment that mirrors the one it was added to; removing one
  takes its twin, and a polygon keeps at least three.
- **The parts page draws a lone part bigger.** With no hull under it, the canvas fits about half a
  radius across and the grid is a twentieth of a radius, so a nozzle is big enough to draw points
  on.

## Needs first

- `docs/designer-comforts-plan.md`: undo, deselect and layer toggles. Build that first; the shape
  editor leans on all three.

## Not in this build

- Collisions on the edge polygon instead of `SHIP_RADIUS`. The edge is ready for it; switching
  changes feel and is its own change.
- Redrawing today's parts. Drawn art is optional; the user redraws parts when they want to. The
  editor can draw them, but none of the game's parts has shapes yet.
- Naming a shape. The panel lists them by number, kind and role, which is enough for a hull of a
  few shapes.
- Player paint jobs (the colour roles make them possible).
- Deleting a hull. Proposal for later: only when nothing uses it (new game, stations, templates).
