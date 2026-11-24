# Designer comforts plan

Written 2026-11-24, from the user's own use of the hull designer (`src/designer/hulls.ts`: the
Hulls, Parts and Mount types pages) and the world designer (`src/designer/designer.ts`). It is the
first of five plans from one talk about reworking the hull designer; the others are
`docs/hull-drawing-plan.md`, `docs/hull-buying-plan.md`, `docs/ai-hulls-plan.md` and
`docs/damage-levels-plan.md`. This one stands alone and changes only the editors, never the game.
Nothing here is built yet.

## Why

Every later plan happens inside this editor, and it has small frictions the user hits each time:
a mount can't be deselected, the view can't zoom, nothing can be undone, and long checkbox lists
(default programs, loadouts, station blueprints) won't scale. The user's own words on the lists:
"if we ever have 100 programs checkbox lists like this become untenable".

## The picture

Items marked *decided* are the user's calls; the rest is my proposal, open to veto.

- **Deselect a mount** (*decided*). Today something is always selected (`selected` starts on
  `thrusterMain` and falls back to the first mount). Proposal: Esc, or a click on empty canvas,
  selects nothing; the mount sections then show nothing selected.
- **Scroll-wheel zoom** (*decided*). Today the wheel turns the selected mount and Ctrl + wheel
  sizes it (the hint near line 742 of `hulls.ts`). Proposal: with no mount selected, the wheel
  zooms, toward the pointer; with one selected, the wheel keeps turning and sizing it as now. So
  deselect and zoom come as a pair. A "fit" button (or key 0) resets the zoom. Zoom is view state:
  never saved.
- **Undo with Ctrl-Z** (*decided*). Proposal: every change to the draft ship file pushes a
  snapshot of it (the same JSON the page saves); Ctrl-Z steps back, Ctrl-Shift-Z or Ctrl-Y steps
  forward. One stack shared by the three pages, capped at 100 steps. A drag or a held wheel counts
  as one step (snapshot on press, not on every move). Typing in a text or number field leaves
  Ctrl-Z to the field itself. View state (selection, zoom, preview picks, open sections) is not
  undone.
- **Show and hide layers** (*decided*: "quick hide/show components"). Proposal: a short layer
  list beside the canvas, one eye toggle each: hull shape, mounts (markers and knobs), fitted
  parts, decals, cargo bay, the thrust arrows and gun lines. View state, kept across rebuilds of
  the panel like the open sections are.
- **A multi-select drop-down replaces checkbox lists** (*decided*). Proposal for its shape: a box
  showing the picked entries as removable chips, plus a type-to-filter field that opens a list of
  the rest; pick with click or Enter. One component, used everywhere a list of ids is picked:
  - the hull's default programs and each loadout's core and comfort (`loadoutsEditor`),
  - a station's unlocked and wanted modules (`moduleList` in `designer.ts`),
  - a mount's types and any other `checks` list in `hulls.ts`,
  - a place's starting ships (`spawns`).

  Each list keeps its order rules (the default programs keep their order, since they load into
  the computer in that order).
- **Part designer: a global x/y scale, an alpha scale and base colours** (*decided*). Per part,
  kept in the ship file next to `partStats` (proposal: a `partArt` block, only the values that
  differ from the default): a width scale and a height scale that stretch the part's drawing, a
  transparency multiplier, and a colour picker for each of the part's base colours (today the
  shared `METAL` and `RIM` in `src/shipArt.ts`). Applied wherever the part is drawn, in game and
  in the designer, on top of the mount's own scale and alpha. "Back to coded stats" also resets
  these.
- **Turret mounts drawn as a circle with the gun turning on it** (*decided*: "our turret mount can
  just be circle and turn the gun mounted"). Today the turret and its gun are left to the caller
  (`fittedParts` skips them). Proposal: one drawing in `src/shipArt.ts` used by the game and the
  designer, a circle at the mount with the fitted gun drawn on it at its aim angle. In the
  designer the gun follows the mouse pointer, so you see it turn.

## The build

Independent pieces; each can be its own commit. The order is just the one that pays off soonest.

### 1. Deselect, zoom and undo

*Built.* Esc and a click on empty canvas deselect; the wheel zooms with nothing selected; Ctrl-Z /
Ctrl-Y over a snapshot stack. Keep the snapshot and stack logic out of the DOM code (a small pure
module, say `src/designer/undo.ts`), so it has its own unit test.

### 2. Layer toggles

*Built.* The eye list, read by the blueprint draw in `hulls.ts`.

### 3. The multi-select

*Built.* One component (say `src/designer/multiselect.ts`), then swap it in for each list above. The
pure part (filtering, adding, removing, keeping order) gets a unit test.

### 4. Part art: scales, alpha, colours

*Built.* The `partArt` block read and written with the ship file (`useShipFile` and its writer in
`src/fitting.ts`), applied in `src/shipArt.ts`, edited on the Parts page.

### 5. The turret drawing

*Built.* Circle plus turning gun, in game and in the designer.

## How we'll know

- Unit tests: the undo stack (push, undo, redo, cap, a new change clears the redo side); the
  multi-select's pure logic; `partArt` round trip through a ship file, and defaults leaving the
  file unchanged; the turret drawing placing the gun at the aim angle (a test on the transform,
  the way `fitting.test.ts` checks draw order).
- `npm test` and `npm run build` pass.
- **Try it:** `npm run dev`, open the hull designer. Click empty canvas: no mount is selected. Wheel
  zooms in on the pointer. Drag a mount, press Ctrl-Z: it jumps back; Ctrl-Y: forward again. Hide
  the parts layer: only hull and mounts show. Open a hull's default programs: a chip box with a
  filter field instead of checkboxes. On the Parts page, stretch the gun to 1.5 wide and make it
  red: it shows so on the hull and in game. Fit a turret on the floater: a circle whose gun
  follows the mouse.

## Needs first

Nothing. Everything named exists: `src/designer/hulls.ts`, `src/designer/designer.ts`,
`src/shipArt.ts`, `src/fitting.ts` (`useShipFile`, `partStats`).

## How it went

Where the build settled differently, all small:

- **Esc does two jobs.** It closed the panel already, and the plan gave it deselecting. It now
  selects nothing first, and closes on the second press; the key line says so.
- **A snapshot is all three files.** The plan said the ship file; the three pages share one stack,
  so a step covers the ships, the items and the programs together. `Throw away changes` also counts
  as a step, so Ctrl-Z brings the work back.
- **One gesture is one step.** Any change that redraws without rebuilding (a drag, a held wheel, a
  slider) is held back for 400 ms and recorded once, so undo walks back in gestures, not ticks.
- **The multi-select keeps what was typed.** Each list's filter lives in the component, keyed by
  which list it is, so a page rebuilt by a pick gives the filter and the cursor back. Every list of
  ticks in `hulls.ts` uses it, plus the station module lists and the place's starting ships.
- **Colours sit over each kind's own art.** A part's two colours replace the body and edge colours
  that kind draws with (the gun's plate, the tractor's rim, not only the shared metal), so with no
  art set every ship looks exactly as it did.
- **The bay has its own eye; the tanks go with the fitted parts.** The list in the plan had no line
  for tanks, and they're drawn as fitted boxes.
- **The turret is the same size it was.** The circle is 0.35 of the ship's radius as before, and
  the gun on it is the fitted gun's own drawing at 1.8×, so it turns and still points the way it
  fires. The game and the designer both use `drawTurret` in `src/shipArt.ts`.

## Not in this build

- Undo in the world designer (`designer.ts`); only its lists of ticks change here.
- Drawing shapes: `docs/hull-drawing-plan.md`.
- Colour roles and faction palettes: also the drawing plan. The colours here are fixed per part.
- Reordering a picked list by dragging it: the order is still the order things were picked in.
- Hiding anything in the game's own view: the eyes are the designer's blueprint only.
