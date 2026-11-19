# Home pair plan: one representation, in the world file

*2026-11-18.* Line numbers below are from `7bdf86b` plus the in-flight edit to `world.json` and
`sim.ts`; if one has moved, find the site by name. Status markers: **decided** means the owner's
call. This plan is the brief for a fresh `/build` thread; `docs/code-health-plan.md` is the audit
behind it, and stays as the record of why.

## Why

The game holds three of the designer's places twice: once in `src/designer/world.json`, which is
the authoritative design, and once built in code, reached through `tuning.*`.
`designer/link.ts` (`writeGame`) is the bridge that copies one into the other:

```ts
tuning.fieldRadius = field.radius;
tuning.rockCount = field.rocks;
[tuning.fieldCarryFull, tuning.fieldCarryNone] = carrying(field);
tuning.stationDistance = station.orbitRadius - field.radius;
tuning.stationSpinPhase / stationEccentricity / stationPeriapsis  // the station's orbit
[tuning.stationCarryFull, tuning.stationCarryNone] = carrying(station);
tuning.pirateBaseDistance = pirates.orbitRadius - field.radius;
```

So the designer can move, resize and re-orbit those nodes — it just cannot delete them — and
`fieldsFor`/`stationsFor` deliberately step around them (`link.ts:115`: "every field beyond the
first"). The cost is two code paths for every feature that touches radius, rocks, drops, carry,
orbit or identity, and the special case is still growing: the uncommitted work adds
`firstFieldDrops` with the comment *"the starter field, which has no field spec of its own"*.

Sizes, in `sim.ts`: 48 `bases[0]` sites — 15 getter/setter passthroughs, 5 `===`/`!==`
comparisons, 5 `base: Base = this.bases[0]` defaults, 14 `?? this.bases[0]` fallbacks that decide
who pays for a wreck, a rebuild or a trip record. Plus 18 `this.field`, 18 `this.station`, and 18
`FIRST_FIELD` outside tests.

## The picture

After this there is one of each, and no second copy:

- every field is an `ExtraField { spec: FieldSpec, poi }` in `Sim.extraFields` — the home field
  included — and `Sim` finds it by `spec.id`;
- every base is a `Base { spec: StationSpec, poi }` in `Sim.bases` — the home station included;
- `reset()` builds the world from layout data only; nothing is hard-coded except the ids the
  shipped `world.json` happens to use;
- the home field/station keys are gone from `Tuning`, and `writeGame` has nothing left to copy;
- a `home` accessor may remain, **derived** from the layout's spawn data, for UI defaults. It is
  not state, and nothing branches on it.

## Before you start (decided prerequisites)

1. **A clean tree.** The in-flight edit to `world.json` and `sim.ts` must land or be dropped first:
   `firstFieldDrops` adds the very branch step 1 deletes, and the suite is red until that edit is
   resolved. Do not build on top of it.
2. **`npm run test:fast`** — the 11 pure-logic files, measured at 1.55 s. Add it before touching
   anything; steps 1–2 are judged by the slow suites, and you will want the fast lane while
   editing `grid`/`fitting`-adjacent code.
3. **Fixed key order in `stringifyWorld`** (`src/designer/world.ts:438`) and one `npm run world`
   that writes `world.json` **and** re-warms `start.json`. Without this, the migration's own layout
   edits arrive as 600-line diffs and `start.json` goes stale silently.

## What to build

### 1. The field (decided: fields first)

- `designer/link.ts`: `fieldsFor` stops filtering the linked field (`link.ts:115`), so the home
  field arrives as an ordinary `FieldSpec`.
- `Sim.applyLayout`: accept it with the others; `Sim.field` becomes a lookup into `extraFields`.
- Collapse onto the generic path: `layRocks` for the starter field, `firstFieldDrops` (delete the
  field and the `id === FIRST_FIELD` branch), the radius special case at `sim.ts:4227`, the sleep
  set special case at `sim.ts:4122`, the task-name branches at `sim.ts:4631-4632`, and
  `pilot.working`'s default at `pilot.ts:557`, `670`, `896`.
- Delete from `Tuning` whichever of `fieldRadius`, `rockCount`, `rockDrift`, `fieldCarryFull`,
  `fieldCarryNone` and the home field's orbit keys have no remaining reader. `tsc` proves it: only
  delete a key that no longer compiles anywhere.
- Keep `FIRST_FIELD` as a plain id string while anything still names it; do not add a new
  constant to replace the old one.

### 2. The base (decided: after the field; two commits, one version bump in the second)

- `designer/link.ts`: `stationsFor` stops filtering the linked station; `applyLayout` receives it.
- The 5 `base: Base = this.bases[0]` default parameters become required arguments.
- Delete the 15 getter/setter passthroughs at `sim.ts:871-931`. They exist only so callers can say
  "the station's X"; each caller names the base it means.
- The 5 comparison sites: `1760` (hauler source — per-spec id), `2422` (project list — per-spec),
  `2458` (chatter flag — per-spec), `6004` (traffic replacement — follow the unknown-base rule),
  `3931` (migration mechanics — keep, it is the rebuild path).
- The 14 `?? this.bases[0]` fallbacks follow the unknown-base rule below.
- `snapshot`/`restore`: drop the top-level `station:` and `field:` keys and the
  `bases[0].poi = this.station` re-point (`sim.ts:1120`); `SAVE_VERSION` 7 → 8; re-warm
  `start.json` in the same commit.

### 3. The pirate base (decided: separate, after the base)

It is not a `Base` today: `pirateBaseDistance` is derived from the home field, and `pirateCap`,
`pirateOre`, `blackMarket`, `blackMarketTimer` are `Sim` fields. Make the same move — its design in
a spec, its orbit from its own parent rather than the home field's radius. Do not let this step
block steps 1–2.

### 4. Afterwards

- Re-check the counts: `git grep -c` for `bases[0]`, `this.field`, `this.station`, `FIRST_FIELD`
  outside tests. Target: zero `bases[0]`; the rest only where a site genuinely means "the base the
  player is docked at".
- Update `docs/code-health-plan.md`: mark this built, and note what changed from the plan.

## Rules (decided)

1. **Unknown base id** — a record naming a base that is gone resolves to the nearest base that can
   do the job; with none, the record is dropped. (Matches `hasShipyard`'s existing "a wreck goes to
   the nearest station that does".)
2. **Per-spec:** guard count, guard arc, guard distance, project list, chatter flag, hauler source
   field (an explicit spec id, not "nearest field").
3. **Global, stays in `Tuning`:** the six traffic keys (`fieldWanderChance`, `fieldLuckSeconds`,
   `fieldHabitSeconds`, `fieldEmptyShare`, `fieldFearChance`, `fieldFearSeconds`), and
   `stationStart*`, `stationCashBuffer`, `stationPartsTarget`, `stationReserveParts`. These are
   pilot and economy behaviour, not what a place is.
4. **Granularity:** two commits — field, then base — with the `SAVE_VERSION` bump in the second.
5. **Delete is allowed:** the designer may delete the home field and station. "Generic" only means
   anything if the shipped world can have zero home nodes.

## Edge cases

- **A save from before the bump** is refused by the version gate. No silent migration; no shim.
- **A layout with no station** must fail loudly at load with a clear message, not fall back to
  `bases[0]`. Decide the message text when you get there; do not invent a default base.
- **A spec id of `"first"` or `"station"`** colliding with the old constants: ids come from the
  designer and must win. No reserved ids.
- **A record naming a deleted base**: rule 1. A record naming a base that exists but cannot do the
  job (no shipyard): nearest that can, else drop.
- **The black market lane** is currently measured from `this.station` (`sim.ts:5785-5787`) and the
  pirate base's distance from the home field's radius. Both must come from the pirate base's own
  parent.
- **`start.json` embeds the layout key**; changing `world.json` invalidates it. Re-warm in the same
  commit, and let the shipped-start test prove it.
- **A `StationSpec` that omits `shipyard` or `storage`** must fall back to a documented default,
  which is itself in `Tuning`. Write down which.

## How we'll know it works

`npm test` and `npm run build` must pass, and these suites must stay green **without edits** —
they exercise the behaviour through the `Sim` façade, so any change they need is a change in
behaviour that needs calling out: `fields.test.ts`, `sim.test.ts`, `stations.test.ts`,
`records.test.ts`, `pilot.test.ts`, `save.test.ts`.

New tests to add:

- **The designer's numbers win**: a layout whose linked field carries a non-default radius, rock
  count and carry values produces exactly those in game; the same for the linked station.
- **No home nodes**: a layout with the home field and station deleted loads, spawns the player, and
  docks at another base.
- **Unknown base id**: a trip record naming a missing base follows rule 1 (nearest that can, else
  dropped), and a record naming a base without a shipyard goes to the nearest that has one.
- **Save**: a save made after the bump round-trips; a version-7 save is refused.
- **Warm start**: `start.json` regenerated from the new world passes the shipped-start test.

Then run `npm run parity` in the background and check the new log entry against the last one; it
never gates done, but a change here should not move the totals.

By hand: `npm run dev`, open `?dev`, move and resize the home field and station in the designer,
save, reload. The game follows the designer with no `tuning` edit, and `git diff` on `world.json`
shows only what you changed.

## Not doing

- Renaming `bases[0]` to `homeBase` as a first step. Wrong direction: it entrenches the concept.
- Rounding floats in `stringifyWorld`. Wrong target: the churn is key order, not precision.
- Splitting `Sim` in this plan. It comes after, by the state each block owns.
- A vertical (feature-chain) split of `Sim`.
- Code-splitting the designer for bundle size. Use a lint rule to keep `designer/hulls` and
  `designer/designer` out of everything but `main.ts`; `link`/`shipped`/`world` are runtime game
  code.
- Migrating old saves. The version gate exists so they are refused, not translated.

## Built

*(nothing yet — `/build` fills this in)*
