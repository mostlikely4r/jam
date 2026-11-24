# Clouds plan

Written 2026-11-24, after a talk about a new kind of place. Nothing here is built yet.

Clouds are soft, see-through places you fly into. They aren't solid. Later, each one can do
something to whatever is inside it. The premise that a cloud makes normal mining feel different
is a **guess**: nobody has flown through one. So step 1 is only the look, and it stops for the
user to try.

## The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

**The shape**

- **An ellipse with a width and a height** (*decided*), **turned like the other places**
  (*decided*). The turn is the node's existing `spinPhase`, and `spinPeriod` can slowly spin it,
  as it does for stations.
- **An optional ring** (*decided*): an inner edge that leaves a hole in the middle.
- **A falloff** (*decided*): the edge fades out instead of stopping hard.
- **One strength from 0 to 1 at every point** (mine). The look and every later effect read this
  same number, so the shape is built once. The rule, in the cloud's own turned frame, with
  semi-axes `a = width / 2` and `b = height / 2`:
  - `d = sqrt((x/a)² + (y/b)²)`, so `d = 1` is the edge.
  - `ringInner` and `falloff` are fractions of the edge distance, from 0 to 1. Fractions keep a
    ring and fade the same shape when the ellipse is stretched.
  - Strength is 0 outside (`d ≥ 1`) and 0 inside the hole (`d ≤ ringInner`).
  - It rises from 0 at `ringInner` to 1 at `ringInner + falloff`, holds at 1, then falls from 1
    at `1 − falloff` to 0 at the edge. The middle section always applies (strength 1 there).
    Where the two fades overlap, take the smaller.
  - With `falloff = 0`, the edges are hard. With `ringInner = 0`, there's no hole, and the
    inner fade does nothing.
- **Transparency** (*decided*): `opacity`, 0 to 1, how much the cloud covers at strength 1.
- **Draw order** (*decided*): `drawOrder`, a whole number. Lower draws first, and ties go in
  tree order. It only changes the look (mine).
- **A back and a front layer, for depth** (*decided*). A back cloud is drawn over the planets
  and under the stations, rocks, ore and ships. A front cloud is drawn over the ships. That is
  what hides things.
- **Targets, relative lines and screen pointers stay on top of both layers** (mine). Step 1
  tests whether a harder-to-see world changes mining. Hiding the markers too would be a later,
  separate test.

**Looks and effects are separate** (*decided*)

- A cloud has a look and, from step 2, a list of effects. They aren't tied together: the system
  designer makes them fit.
- **Effects stack** (*decided*): one nebula can give fuel *and* dampen.
- **Density** (*decided* as a word, its meaning mine) is the strength of a cloud's effects, so
  it arrives in step 2. In step 1 only `opacity` shows.

**Two looks to start** (*decided*: two types; which ones is mine)

- **Gas**: a smooth glow in its own colour, with a few soft, seeded puffs inside so it doesn't
  read as a plain disc.
- **Dust**: dimmer and grainy. Many small specks, each as bright as the strength at its spot.
- Each cloud has a `color`. Each look has a default colour, so a new cloud looks right before
  it is touched.

**Not solid, and nobody notices it yet** (*decided* for step 1: no AI)

- Clouds don't collide, carry, count as a start, or count as a POI for anything in the sim.
- Pirates, traffic and drones ignore them. So does the player's ship, apart from what the
  player can see.

## What to build

### Step 1: clouds you can see

**The world file** (`src/designer/world.ts`)

- Add `"cloud"` to `PLACE_KINDS`.
- New `WorldNode` fields, all used by clouds only: `look` (`"gas" | "dust"`), `color` (a
  `#rrggbb` string), `width`, `height`, `ringInner`, `falloff`, `opacity`, `layer`
  (`"back" | "front"`) and `drawOrder`.
- Set `radius` to `max(width, height) / 2` whenever a cloud's size changes. `reachOf`, the
  designer's picking and the culling all keep working unchanged.
- Add the cloud's defaults to `placeDefaults`: gas, the gas colour, 6000 × 3000, ring 0,
  falloff 0.4, opacity 0.5, back, order 0. `makeChild` gives a new cloud those values.
- In `parseWorld`, read the new fields with those defaults. Clamp `ringInner`, `falloff` and
  `opacity` to 0..1, and keep `width` and `height` above 0.
- In `NODE_KEYS`, add the new keys before `count`. In `stringifyWorld`, leave them out of
  every node that isn't a cloud. **Edge case:** today's `world.json` must save byte for byte
  the same, so no other node may gain a key.
- A cloud has no children. The designer doesn't offer "add child" on one.

**From the world to the game** (`src/designer/link.ts`, `src/sim.ts`)

- In `sim.ts`, add a `CloudSpec` modelled on `AnchorSpec`: `id`, `name`, the shape and look
  fields above, `spinPeriod`, `spinPhase` (in radians) and `orbits`.
- Add a `cloudsFor(world)` modelled on `anchorsFor`, copies included (`count` works). Add it to
  `Layout` and `layoutFor`. `applyTo` sets `sim.clouds`.
- In `linkSummary`, count clouds as real, not "map only".
- Clouds aren't saved with a game: the layout comes from the world on every load, as bodies and
  anchors do. **Note:** `src/start.json` is keyed to the layout. After adding clouds to
  `world.json`, run `npm run world` to re-warm it.

**The strength rule** (new `src/clouds.ts`, pure)

- `cloudStrength(cloud, at, x, y)` follows the rule in the picture. `at` is the cloud's centre
  and turn at that moment. Step 1 doesn't call it in game, but step 2 does, and its tests pin
  down the shape the drawing must match.
- `cloudAt(cloud, time)` gives the centre (from `orbitsAt`) and the turn.

**Drawing** (`src/render.ts`)

- `drawClouds(sim, alpha, layer, visible)`, called twice in `draw()`:
  - back: right after `drawBodies`.
  - front: after the player's ship and pod, before `drawRelative` and `drawTargets`.
- Each cloud is sorted by `drawOrder`. Skip it when its `radius` isn't within view.
- Draw it as one ellipse: translate, rotate, scale by the semi-axes, then fill a unit circle
  with a radial gradient. The gradient's stops sit at `ringInner`, `ringInner + falloff`,
  `1 − falloff` and 1, so the picture matches `cloudStrength`.
- Gas adds its puffs and dust its specks. Both are seeded from the cloud's id, so they are
  the same every frame. Each puff or speck takes the strength at its own spot, so they fade
  with the cloud.
- **Cost:** a front cloud covering the whole screen must not drop the frame rate visibly. Keep
  the specks to a few hundred per cloud on screen, and draw puffs as gradient fills, not
  per-pixel work.

**The designer** (`src/designer/designer.ts`)

- Add "cloud" to the kind lists. A cloud's panel shows look, colour, width, height, ring,
  falloff, opacity, layer and order, plus the usual orbit and spin fields. Spawns and the
  station settings are hidden.
- On the designer map, a cloud is its turned ellipse, outlined in its colour and lightly filled
  at its opacity. A ring shows its inner edge dashed.

**Two clouds to try** (`src/designer/world.json`)

- One gas cloud on the back layer and one dust cloud on the front layer. Put them in a field a
  short trip from the start, not the home field. A new player's first screen stays as it is
  (pillar 4), and they're found by flying.
- Both orbit with that field and overlap part of its rocks, so mining in one is possible.
  Then run `npm run world`.

**Stop here for the user to try.**

### Step 2: two effects

Picked by the user after trying step 1 (*decided*: two effects in the second test; which two
is open).

- A cloud gains `density` (0 to 1) and `effects`, a list of `{ kind, strength }`. The effect
  at a point is `strength × density × cloudStrength`.
- Effects from overlapping clouds add up, capped per effect. Each effect also stacks with the
  others in the same cloud.
- Moving `cloudStrength` from tests into the tick should cost little: only clouds whose
  `radius` reaches a ship are checked.
- **Rule for choosing** (mine): an effect that harms a ship needs AI avoidance and handling in
  the off-screen sim (trip records). That is the real cost, more than the cloud itself. So
  prefer two effects that don't hurt traffic, or accept that traffic flies through them
  unaware, and say which.
- Its own plan update before building: the two effects, their tweaks, their tests.

## How we'll know

- `src/clouds.test.ts` (part of `npm run test:fast`):
  - `cloudStrength` is 1 at the centre with no ring and 0 at and beyond the edge.
  - It's 0 inside the hole.
  - Falloff halfway gives 0.5.
  - A ring with overlapping fades takes the smaller.
  - `falloff` 0 gives a hard edge.
  - A turned cloud (90°) swaps width and height.
  - A long, thin cloud reaches along its width but not across it.
- `src/designer/world.test.ts`:
  - A cloud survives `stringifyWorld` → `parseWorld`.
  - Bad numbers clamp.
  - The shipped `world.json` minus its clouds saves with no cloud keys on any other node.
- `src/designer/link.test.ts`: `cloudsFor` gives one spec per copy, with orbits that follow
  the parent field.
- `npm test` and `npm run build` pass.
- **Try it:**
  1. `npm run dev`, open the game with `?dev`, start a new game and fly to the field with the
     clouds.
  2. The gas cloud glows behind the rocks.
  3. The dust cloud hides rocks, ore and your ship as you fly into it. Your targets and
     pointers stay visible.
  4. Mine a rock inside it and judge whether it feels harder, or just different.
  5. Press O for the designer: change a cloud's size, turn, ring, falloff, opacity and layer,
     and see the game follow.

## Needs first

- Nothing unbuilt. Every piece this plan uses exists: `anchorsFor` and `AnchorSpec`, `orbitsAt`,
  the designer's kind lists, `npm run world` and the `?dev` designer (key O).

## Not doing

- **No AI awareness in step 1** (*decided*). Pirates still see you inside a cloud.
- **Effects aren't tied to looks** (*decided*). There are no fixed "corrosive nebula" types:
  the designer combines a look with effects.

## Not in this build

- **Effect ideas, parked:**
  - Dense (visibility for sensors, so you can hide from pirates).
  - Corrosive (damage over time).
  - Dampening: a speed cap that costs extra fuel above it. It feels different from micro
    asteroids, though both are a speed limit (*decided*).
  - Micro asteroids: a chance of damage that grows with speed, countered by shields, armour
    or auto-repair.
  - Electrical storm: modules briefly offline (EMP) rather than broken.
  - Rich nebula: fuel collected with a scoop. Needs fuel step 3 and a scoop module.
  - Current: pushes ships along the long axis, so the shape's turn is its direction.
  - Magnetic: gathers loose ore over time.
  - Target disruption: randomly drops targets.
- Clouds on the in-game chart.
- Hiding the HUD markers inside a front cloud.
- Recipes that scatter clouds (`npm run layout`).
