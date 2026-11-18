# Icons plan

Written 2026-11-18. The inventory plan (`docs/inventory-plan.md`) put parts on mounts, in program
slots, in the bay and in lockers, but each one still shows as a short text label (`gun2`, `comp4`,
`tractor 360`). The dock shop is one long list of text buttons like `[buy] Gun 2: 120 credits,
+0.40 weight. …`. That's about as far as text can go, and the planned ×10 upgrades would bury it.
This plan swaps the text for **icons with tooltips** everywhere a part is shown, and turns the
shop into a compact grid under category headers. Not built yet.

## The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

**Icons**

- **Icons are built from glyphs, not drawn per part** (*decided*). A glyph is a small vector
  drawing in the same style as the ship art (`src/shipArt.ts`). Many parts can share a glyph and
  tell themselves apart by colour and mark.
- **Each part's icon is chosen in the part designer** (*decided*):
  - one **glyph** from a **broad selection**;
  - **3 colours**: **primary**, **secondary** and **border**;
  - a **mark**: free text drawn in a corner, such as `*`, `+`, `!`, `2` or `360`.
- **Start with about 30 glyphs** (*decided*), more added when a part needs one. Each has to read
  clearly at about 24 px, so they're added by hand in code, not generated.
- The designer accepts any mark text. The icon shows at most its first 3 characters (mine).
- Every part gets a default icon in code (`parts.ts`), so nothing is ever blank, and the
  designer's choices override it (mine). This works the same way as `partStats` today.

**Tooltips**

- **The tooltip carries the details** (*decided*): the icon carries no text besides its mark.
- One custom tooltip shared by every screen. It replaces the browser's own `title` popup, which is
  slow, unstyled and plain text (mine).
- It shows the part's name on top, then whatever applies where you are pointing (mine):
  - **Shop:** price, weight change, the description, stock in the store, where a buy would land
    (mount, bay, locker, no room), and **why** it can't be bought if it can't: doesn't fit,
    not enough credits, out of parts, blueprint price left, paid and on its way. For a part you
    already have: its sell value, or for a program, whether it's loaded.
  - **Ship screen port:** the mount's name, the part, and its condition (worn %, damaged,
    destroyed). An empty port shows the mount's name and the mount types it takes.
  - **Program slot or spare program:** name, running or loaded with the computer down, and what a
    click does.
  - **Bay or locker tile:** name, condition, sell value when docked.
- The tooltip follows the mouse and stays inside the window. It hides while dragging (mine).

**Where icons replace text**

- Blueprint ports, computer slots, spare programs, bay tiles, locker tiles, and the drag ghost
  (mine for the ghost: the icon, plus "R turns it" while the item can turn).
- A bay or locker tile draws the icon centred in the item's shape. Large items get a larger icon,
  up to the size of the shape's shorter side (mine).
- Wear still shows the way it does now (`damaged` / `destroyed` classes), on top of the icon.
- **Not changed:** the status bar's words and buttons for a selected item, headings, notes, the
  field deposit and pirate base shops, the pod's choice panel, and the news board. Those are
  sentences, not parts (mine).

**The shop**

- **A compact grid with no text** (*decided*): icons in rows under **category headers**. You scan
  by category and glyph, and hover for details.
- Categories, in this order (mine, from `PartKind`): Engines and thrusters, Weapons (guns and
  turret), Tractors, Computers, Cargo bays, Cockpits, Programs, Station. A category with nothing
  to show is left out. Cockpits mostly stay hidden, as built-in parts do today.
- **Station** holds the items that aren't parts: new drone, field deposit, station turrets and
  deposit turrets. Their icons are set in code from the same glyph set, with no designer (mine).
- **State shows on the icon** (mine). The tooltip always says why in words.
  - Can buy: full colour.
  - Already yours (sell, or a program to load or unload): a small corner badge (`$` sell,
    `▸` load, `■` running), full colour.
  - Can't buy (doesn't fit, not enough credits, out of parts, no free slot): dimmed.
  - Blueprint to fund: a lock badge. If you can only pay part of it, the badge is half-lit.
  - Paid, on its way: a clock badge, dimmed.
  - Built (station items): a tick badge, dimmed.
- Click and drag work as now: a click buys, sells, loads or funds; a buyable part can be dragged
  onto a mount, the bay or the locker; dropping an item onto the shop sells it.
- The heading line (station credits, hauler), the refusal message, the "Ship and locker" button
  and the news board stay as they are.

## The question

Can a player who has never seen the shop find a part and decide to buy it from glyph, colour and
tooltip alone, without missing the text list? The user answers this by playing.

## The build

Four steps. Each leaves the game playable and passing `npm test` and `npm run build`.

### 1. Glyphs and part icons

- New `src/glyphs.ts`: a table of about 30 glyphs, each with an id and a drawing in a 24×24
  box that uses a primary and a secondary colour. Plain SVG elements are the easiest to put in
  the DOM, scale cleanly, and work for the designer's picker too (mine). A rough starting set,
  adjusted as they're drawn:
  - engines and thrusters: large engine, small engine, reverse, strafe, turn;
  - weapons: gun, twin gun, turret;
  - tractors: cone beam, ring beam, magnet;
  - computers: chip, board;
  - bays: crate, open crate;
  - cockpits: kite, bar, dome;
  - programs: gyro (spin), retro, gauge (meters), cursor (click to move), turn cursor, route,
    chart, autopilot;
  - station: drone, deposit, station turret;
  - spare: star, diamond, unknown `?`.
- `Part` gets `icon: { glyph, primary, secondary, border, mark }`. Every part in `parts.ts` gets
  a sensible default.
- `PartStats` in `src/fitting.ts` adds `icon`, so the designer's choice is saved in
  `src/hulls.json` under `partStats`, applied over the code's value, and cleared by
  "Back to coded stats", using the existing path.
- New `partIcon(part, size)` (in `glyphs.ts` or a small `icons.ts`) returns an element: a
  border-coloured frame, the glyph, and the mark in the bottom-right corner, clipped to 3
  characters.
- Tests: glyph ids are unique and there are at least 30; every part's default icon names a known
  glyph; an icon override round-trips through the ship file and is removed by a reset (see the
  `partStats` tests in `src/fitting.test.ts`); a mark longer than 3 characters shows 3.

### 2. The designer's icon picker

- In the part panel of `src/designer/hulls.ts`, a new **Icon** section beside Stats:
  - a grid of every glyph to pick from, drawn in the part's current colours;
  - three colour inputs (primary, secondary, border);
  - a text input for the mark;
  - a live preview at shop size and at a 2×2 bay tile size.
- Changes go through `this.changed()` like the other stats, so they reach the running game at
  once and are saved to `src/hulls.json`.
- Try it: open the designer (H under `?dev`), change a part's glyph, colours and mark, and see it
  update in the ship screen and the shop.

### 3. The tooltip, and icons on the ship screen, bay and locker

- New shared tooltip (for example `src/tooltip.ts`): `setTip(element, () => content)`, with
  content worked out on hover so it's never stale. Remove `title` from the elements that get it.
- In `src/inventory.ts`: ports, program slots, spare program chips, and bay and locker tiles show
  `partIcon` instead of `short`, with tooltips as listed in the picture.
- In `src/drag.ts`: the ghost shows the icon. The label text is kept for the "R turns it" hint.
- `Part.short` is still used by the dev readout in `main.ts` (the owned-parts line). Keep it for
  that.
- Edge case: hovering must still work on parts that can't be acted on (out in space, a hull's
  built-in gear).
- Try it: in a dock, open I and L, hover each kind of thing, drag an item and turn it with R.

### 4. The shop grid

- In `src/main.ts` (`updateShop`, `partLine`, `lockedLine`, `saleLine`, `shopButton`): each
  line becomes a shop **cell**. A `ShopLine` keeps its state and gains the full tooltip text; the
  cell draws the icon, the state's dimming and badge, and the tooltip.
- Group cells under category headers in the order above. The Station items get code-set icons.
- **A disabled `<button>` gets no mouse events in some browsers, so its tooltip would never
  show.** Make cells that can't be bought `aria-disabled` and ignore their clicks instead of
  using `disabled`.
- CSS in `index.html`: a wrapping grid of square cells about 36 px across, headers in the
  existing `h2` style, and dimming and badges that read on the dark background.
- Tests: a pure function that maps a `ShopLine` state to dim and badge, tested for each state;
  the category of every part is known (no part falls outside a header).
- Try it: dock, press B, find each category, hover a dimmed cell for its reason, buy by click and
  by drag, sell by dropping an item on the shop, fund a blueprint part of the way.

## Not doing

- **One hand-drawn icon per part.** Glyphs plus colours plus mark replace that.
- **Emoji or an icon font.** They don't match the vector art.
- **Text in shop cells** (name or price under the icon). The tooltip holds it.
- **The browser's `title` tooltips** for parts.

## What could grow out of scope

- **The glyph set.** About 30 to start. Add one only when a part can't be told apart with
  colour and mark.
- **The designer picker.** Keep it to a glyph grid, three colour inputs and a mark field. No
  glyph editor and no per-part custom drawings.
- **Tooltip richness.** Text lines only. No stat bars or comparisons with what's fitted yet.
