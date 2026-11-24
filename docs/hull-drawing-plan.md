# Hull drawing plan: hulls as data, and a shape editor

Written 2026-11-24. Second of five plans from one talk about reworking the hull designer (see
`docs/designer-comforts-plan.md` for the list). It is the groundwork for
`docs/hull-buying-plan.md` and `docs/ai-hulls-plan.md`: both need hulls that can be added and
copied without code. Nothing here is built yet.

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

### 1. Shapes move into the file

Add `edge` and `shapes` to each hull in `src/hulls.json`, read and written by `useShipFile` and
the ship file writer in `src/fitting.ts`. Fill them from today's `HULL`, `BELLY` and the floater
edge. `drawHull` reads the file. Delete `HULL` and `BELLY`. Nothing should look different.

### 2. A model is a name

`ShipModel` becomes `string`; `SHIP_MODELS` comes from the file. Every `Record<ShipModel, …>` and
every switch over models (`drawHull`'s floater branch, `SHIP_CHOICES`, tuning that names a model)
is checked. Unknown model falls back to the racer. `src/designer/world.ts`'s `SHIP_CHOICES` stays
the new-game list, now any hull with the `newGame` use.

### 3. The shape editor and copy hull

On the Hulls page: the shapes list, point editing, mirror (on by default) and Shift snap, add
polygon, circle and rect, colour role and order and transparency per shape, copy hull.

### 4. Parts can be drawn

The same editor on the Parts page, writing a part's shapes into the file. A part with shapes draws
them; one without keeps its code art.

## How we'll know

- Unit tests: today's five hulls read from the file give the same points as the old `HULL` and
  `BELLY` (a test that keeps the old arrays as fixtures); the mirror rule (a point's twin moves,
  an on-line point stays single); snap; copy hull makes an independent copy (changing it leaves
  the source alone); an unknown model falls back to the racer; a part with shapes draws them and
  one without keeps code art; ship file round trip for edge and shapes.
- `npm test` and `npm run build` pass; the editor-boundary check in the build still holds.
- **Try it:** `npm run dev`, play a moment: every ship looks as before. Open the hull designer,
  copy the racer, drag a nose point of the copy forward: its twin follows and the nose grows; hold
  Shift: it snaps. Add a circle with the glass role on top. Undo twice. Start a new game where the
  copy is allowed (give it the `newGame` use): you fly it.

## Needs first

- `docs/designer-comforts-plan.md`: undo, deselect and layer toggles. Build that first; the shape
  editor leans on all three.

## Not in this build

- Collisions on the edge polygon instead of `SHIP_RADIUS`. The edge is ready for it; switching
  changes feel and is its own change.
- Redrawing today's parts. Drawn art is optional; the user redraws parts when they want to.
- Player paint jobs (the colour roles make them possible).
- Deleting a hull. Proposal for later: only when nothing uses it (new game, stations, templates).
