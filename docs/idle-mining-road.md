# Road: floating idle mining

The broad features between today and the floating idle mining target in `docs/vision.md`, how
they bundle and in what order. Not a plan: each step gets its own `docs/<thing>-plan.md` via
`/spec` when it comes up. Agreed with the user 2026-11-20 (*decided*: the list, the bundles and
the order); details are open until specced.

## What it aims at

From `docs/vision.md`: a life about an hour in, livable for days. A major decision every 10+
minutes once reached; small optional moments between, cheap to miss. Idle earns 10 to 30% of the
active potential per hour early and 50 to 75% once reached, always far more per input.

The decision gap is roughly hold size divided by extraction rate, capped by how long the ship
finds work in reach. The road stretches all three.

## Features

| # | Feature | Why | Hover | Drift |
|---|---|---|---|---|
| 1 | Auto-fire | Something keeps extracting without you | needs | needs |
| 2 | Measurement | No-player runs report minutes between decisions and credits per hour, idle against active | needs | needs |
| 3 | Auto-targeting | Picks the next rock or ore by your priorities | some | needs |
| 4 | Bigger hold (new hull) | The largest bay is already stretched; gap length needs room | needs | needs |
| 5 | Drift order | A slow course through the belt, avoiding rocks, mining on the way | — | needs |
| 6 | Big rocks | One rock holds 10+ minutes of ore, cut rather than shattered; a field change | needs | — |
| 7 | Small moments | Incoming-rock warning, a rare ore to put first, a "hold full" signal | needs | needs |

Measurement needs an active baseline: a reference pilot (for example a scripted rare-ore hunter)
on equal investment, or the percentages have nothing to compare against.

## Bundles

- **Keeps mining:** 1 and 2 together. Small, shows the early state, puts numbers on the gap.
- **Picks its own work:** 3 alone, on top of the built targeting.
- **Room to wait:** 4 alone. A hull is its own design job; its size comes from the measurement.
- **Drift** (5) and **big rocks** (6) apart: each is a posture, and big rocks touches everything
  that mines.
- **Small moments** (7) last: they fill a gap, so the gap must exist first. A miss costs a
  chance (ore drifts off, a nudge off position), never hull.

## Order

1. **Keeps mining.** Cheapest real test; shows whether the early state lands near 10 to 30%.
2. **Picks its own work.** On today's small rocks auto-fire alone empties a rock in seconds;
   auto-targeting is what stretches the gap. This is why drift comes before hover.
3. **Room to wait** or the **drift order**: whichever the measurement shows runs out first, hold
   space or rocks in reach.
4. **Small moments.**
5. **Big rocks.** Hover arrives as the second posture.

## Progress

Update as steps are specced and built.

| Step | Plan | Status |
|---|---|---|
| Keeps mining | — | next to spec |
