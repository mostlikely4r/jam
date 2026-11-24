# Damage levels plan: damaged, broken, destroyed

Written 2026-11-24. Fifth of five plans from one talk about reworking the hull designer (see
`docs/designer-comforts-plan.md` for the list). It stands alone. Nothing here is built yet.

## Why

The user wants three damage levels on parts, set in the part designer. Part damage already
exists (read in `src/fitting.ts`, 2026-11-24): every fitted `Module` has `wear` from 0 (new) to 1.
At one global `DAMAGED_AT = 0.5` it stops working (`works()`), at 1 it is `destroyed()`. A damaged
tank still holds fuel and leaks. Hits and blasts add wear (`moduleToughness` in `src/sim.ts`);
`src/shipArt.ts` tints a stopped part hot and a destroyed one dark (`partColor`); the dock repairs
hull, then worn modules, then destroyed ones. So today there are two levels, the same for every
part. Whether a middle level ("works, but worse") makes damage read better is a guess, so step 1
is the smallest version to try.

## The picture

Items marked *decided* are the user's calls; the rest is my proposal, open to veto.

- **Three levels** (*decided*):
  - **damaged**: still works, but worse. Repairable in flight later (see Not in this build).
  - **broken**: stops working; repaired at a station. This is today's "damaged".
  - **destroyed**: a stub that has to be replaced, as today.
- **Thresholds per part** (*decided*: "added to stats"). Two new part stats on the Parts page,
  with the other editable stats (`partStats` in the ship file, kept only where they differ from
  the code): **damaged at** and **broken at**, both as wear from 0 to 1. Destroyed stays at 1.
  Proposal for defaults: broken at 0.5 (today's `DAMAGED_AT`, so nothing changes there) and
  damaged at 0.25. The designer refuses damaged at above broken at.
- **A look per level** (proposal). Damaged: occasional sparks and a slight darkening. Broken:
  today's hot tint. Destroyed: today's dark stub. The part designer gets a wear slider that draws
  the part at that wear, so the looks can be judged there.
- **"Worse" is per part kind, added kind by kind** (proposal, agreed in the talk). The first slice
  gives the level its thresholds and its look, plus one effect to feel it: a damaged thruster
  gives a share of its thrust (proposal: 60%, a tuning value). Guns, tractors, computers and the
  rest get their own "worse" later, each as its own small change.
- **Repairs stay at the dock for every level** (proposal, agreed). The repair order and pricing
  don't change.
- **Names in code** (proposal): `works()` keeps meaning "below broken at", read per part instead of
  the global constant; a new `damaged()` for the middle level. Anything the player reads that
  says a part "broke" or is "damaged" (HUD, radio, news, the bot log's breaks in `src/bot/log.ts`)
  says broken for the stop level.

## The build

### 1. Thresholds, looks and a weaker thruster (stop here for the user to try)

The two stats on parts, read and written with the ship file and edited on the Parts page; the
global `DAMAGED_AT` replaced by the part's own; `damaged()`; the look per level in
`src/shipArt.ts` and the part designer's wear slider; a damaged thruster at reduced thrust.

*Stop here for the user to try:* take hits until a thruster is damaged and feel the ship get
lazier before it stops.

### 2. "Worse" for the other kinds

One kind at a time, each its own commit, each a tuning value: guns fire slower, a tractor pulls
weaker, a computer drops its last program slot, and so on, as the user picks them after step 1.

## How we'll know

- Unit tests (`src/fitting.test.ts`): per-part thresholds round trip in the ship file and fall
  back to the defaults; `works()` and `damaged()` at the edges (just below and at each threshold);
  a part with broken at 0.5 behaves exactly as today; a damaged thruster gives the reduced share
  and a broken one nothing; the designer rejects damaged at above broken at.
- Existing damage, repair and bot-log tests still pass with the defaults.
- `npm test` and `npm run build` pass.
- **Try it:** `npm run dev`, fly the racer into rocks a few times until the main thruster sparks:
  it still pushes, more weakly. A few more hits: it glows hot and stops. Dock: it's repaired.
  In the part designer, drag the wear slider on the main thruster and see the three looks.

## Needs first

Nothing. Wear, `DAMAGED_AT`, `partStats` and the Parts page all exist.

## Not in this build

- In-flight repair of damaged parts (backlog: what does the repairing, and what it costs).
- "Worse" effects beyond the thruster, until step 2.
