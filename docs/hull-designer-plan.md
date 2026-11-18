# Hull designer: sections, previews, layering and stats

Written 2026-11-18, as it was built. Everything here is the user's own list, so it is all
*decided*; the notes under each say where the numbers ended up living.

- **All sections of the three pages collapsible, collapsed by default** (*decided*). Every
  heading of the Hulls, Parts and Mount types pages became a `<details>` that starts closed.
  What the user opens stays open across the panel's rebuilds, held in a set of section keys,
  the same way the game's own side panel does it.
- **A preview drop down below "Bare hull comes with"** (*decided*). Per mount, it overlays one
  specific part on the blueprint as it shows in game. Before, the first part that fit was drawn
  on every mount forced; now nothing is drawn unless the preview says so. It *starts on the
  part the bare hull comes with* (*decided*, second pass), and none or any part that fits can be
  picked instead — a decal mount's preview lists its decals, in place of the old "Show another
  decal" stepper, which is gone (*decided*, second pass). The choice is view state, keyed
  `model:mount`, so it never goes into src/hulls.json. The green thrust arrows, gun lines and
  tractor cones stay: they show what a mount *does*.
- **The mount's own section keeps its place** (*decided*, second pass): one section key for
  whatever mount is selected, so a section opened for one stays open for the next.
- **A transparency slider and a display order field per mount** (*decided*), kept on the mount
  and used in game: `alpha` (0 invisible to 1 solid, drawn with `globalAlpha`) and `order`
  (0 the hull level, below 0 drawn under the hull shape, so only what sticks out past the
  hull's edge shows). Cargo bays take their mount's transparency too (*decided*, second pass).
  Decals layer the same way, and the designer's blueprint draws the same stack, each layer
  in draw order as the game does (*decided*, second pass), so the preview is truthful.
- **"Show on hull" gains a none option on the Parts page** (*decided*): none shows just the
  part on the canvas, drawn as in game, with no hull or mounts round it.
- **Part stats editable** (*decided*): price, weight, bay room, cargo added, program slots,
  set size, explosive blast and the sale tier, plus "Back to coded stats". They are written
  onto the part at once, and the ship file keeps only the stats that differ from the code's
  own in `parts.ts`, as `partStats`. Putting a ship file into play resets each part to the
  code's values and then sits the file's on top, so "Throw away changes" really throws them
  away.
- **Hull stats editable** (*decided*): price of a bare hull, bare hull weight and hull points,
  per hull in `hullInfo`. Left empty, the game's own values are used (`rebuildCost`, base
  weight, 100 hull points), so the shipped hulls change nothing until a stat is set.
- **The small cargo bay** (*decided*, third pass): every bare hull now comes with a "Small
  cargo bay" part (10 ore) on its cargo mount, and a ship's cargo room comes only from fitted
  bays: with none, it carries nothing at all. The old free hold (the tuning's
  `playerCargo`/`droneCargo`, and the hull's "cargo without a bay" stat from the second pass)
  is gone — both said a hull could carry ore with no bay, which none now can. The bay box also
  shows on the blueprint, as in game: the bay the preview shows, or the empty well where one
  would go, and the bay's transparency covers the ore riding in it.

## Where the hull stats land in the game

The price is what a bare hull costs wherever one is bought: the yard's bare-hull offer after
the pod, the pirate base's and every base's replacement of lost traffic (in place of the
tuning's flat `rebuildCost`; the black market's pirate hull price stays tuned). Weight is the
base of `shipWeight`, and hull points cap the hull everywhere the global 100 did, through
`hullMax(model)` in `fitting.ts` — the HUD bars, repairs and all.

## What the tests say

`src/fitting.test.ts` covers the round trip of `alpha` and `order` through a ship file, the
under-the-hull draw order and transparency, the bay taking its mount's transparency, a hull
falling back on the game's own stats, a bay-less ship carrying nothing, and part stats
carrying in the file and resetting to code. Several tests still disagree with the designer
draft saved in `src/hulls.json` — the one being worked in, not the tuned one the game shipped
with: the extra mirrored gun mount (`mount1`, with a default gun of its own) makes a bare
racer fire twice and moves what a hit on the nose lands on, one mount is still off its tuned
angle ("as shipped, the thrusters push and turn as they were tuned"), and the floater's gun
no longer behaves as the first gun. Those pass again once the draft is tuned back — or the
tests are revisited to the new reality, whichever the tuning settles on.
