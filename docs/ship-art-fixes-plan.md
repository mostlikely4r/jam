# Ship art fixes plan

Written 2026-11-25, from three inbox notes (I-4, I-5, I-6) the user wrote while trying hulls and
tanks. Three small, independent fixes to how a ship is drawn; one commit each. Nothing here is
built yet.

## 1. Tanks empty front to back (I-4)

*Built.*

*Decided* (the note): "Fuel tanks should empty front to back (now they left to right)."

Today `drawTanks` (`src/shipArt.ts`, after `tankBoxes`) fills a tank's box from its local
"bottom", the box's y axis. On a mount facing the nose that axis runs across the ship, so with
the ship pointing up the level drops sideways.

**Fix:** the level runs along the box's length, the mount's facing: full, the whole box; as it
empties, the front part goes dark first, so what's left sits at the back (proposal: "back" is
against the mount's facing, which is the ship's tail for a tank facing the nose). The low-fuel
red stays. The station's standing tank in `render.ts` (`drawTank`) is a separate drawing and stays
as it is.

**Check:** a test on `tankBoxes`/`drawTanks` is awkward (canvas), so check by eye in the designer
and in play; at 50% fuel the back half of each tank is lit.

## 2. Part art width and height reach every part (I-5)

*Built.*

The note: "Art width and height do not seem to affect anything (like for the large fuel tank)."

The part page in the designer saves `scaleX`, `scaleY`, `alpha` and the colours into
`PART_ART` (`src/designer/hulls.ts:1161`). They are applied only in `drawPartArt`
(`shipArt.ts:255`), which draws the parts on the outside. Tanks (`tankBoxes`, `drawTanks`), cargo
bays (`bayBox`, `shipArt.ts:401`) and the turret body (`drawTurret`, `shipArt.ts:355`) have their
own code and never read `PART_ART`, so their settings do nothing.

**Fix:** `tankBoxes` and `bayBox` multiply their width by the part's `scaleX` and height by its
`scaleY`, and take its `alpha` and colours; `drawTurret` scales its base the same way. Everything
the part page offers then shows on the ship, in the designer's preview and in game.

**Also settles S-45's longer tank** (proposal): with this in, the "fuel tanks draw twice as long"
fix in S-45 (Q-13) is a width of 2 set on each tank's part page, no code. Q-13 can drop that item.

**Check:** a test that `tankBoxes` returns a box twice as long for a tank with `scaleX: 2`, and
the same for `bayBox`. In the designer, set the large tank's width to 2 and see it on the hull.

## 3. Hull colour by share of the hull (I-6)

*Decided* (the note): "Hull color (more red when damaged) should be based on the % of the hull
not the flat. A 300 hull now starts blue instead of gray."

Today `render.ts:1543` works out damage as `1 - hull / 100`. A hull of 300 points reads as
"-200% damaged", which pushes the tint the other way, to blue.

**Fix:** `1 - hull / hullMax(ship.model)` (`fitting.ts:505`), clamped to 0..1. Check every other
place that tints or reads a ship's health against a flat 100: the debug lines in `main.ts`
already use `hullMax`; nothing else found on 2026-11-25.

**Check:** a test of the tint as a small pure function (move it out of `render.ts` into one
`hullTint(hull, max)`): full is the base grey for any max, half is halfway to the damaged colour.

## How we'll know

- The checks above, `npm test` and `npm run build`.
- **Try it:** start in a hull with 300 hull points (or set one in the designer): it starts grey,
  not blue. Take some hits: it reddens by share. Turn fuel on in the tab menu, fly until half
  empty: each tank shows its back half lit. Set the large tank's art width to 2: the tank on the
  ship is twice as long.

## Needs first

Nothing.

## Not in this build

- Per-level damage looks (damaged, broken): S-50, Q-20.
- Separate fill levels per tank: they share one level today (`TankBox.fill`), which the art keeps.
