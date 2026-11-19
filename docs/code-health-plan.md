# Code health: what's strong, what will hurt, and the order to fix it

**Status: the audit is a record; the work is specced in `docs/home-pair-plan.md`.** Findings below
are proposal unless marked *decided*. The five decisions that were open here are now decided and
moved into that plan; this file keeps the measurements and the council memo, and stays as the
record of why.

Written against `7bdf86b` plus an in-flight edit to `src/designer/world.json` and `src/sim.ts`
(the working tree, not HEAD — see "Caveat"). Passed through a three-model council; their
corrections are folded in and listed in "Corrections", and the memo is at the end.

**Roadmap note.** The owner's direction is recorded here only as *the home base/field pair is to be
removed*. The fuller design stays in private memory, not in this public repo.

## What was measured

| | |
|---|---|
| Tracked TypeScript | 71 files, 31,661 lines — 22,609 non-test, 9,052 test (40%) |
| Largest file | `src/sim.ts` 6,551 lines; `class Sim` lines 845–6551 (5,707) |
| `Sim` surface | 309 methods, 167 private, ~142 public |
| Largest function | `chart.ts:224 draw` 227 lines; `main.ts:945 buildPanel` 134 |
| `main.ts` | 1,427 lines, 11 `getElementById` casts, 17 `.hidden = …` toggles, one 1,051-char line (770) |
| `npm test` | 589 tests / 23 files, 146.55 s wall |
| **Fast lane (measured)** | 11 files / 163 tests / **1.55 s** |
| Slowest suites | pilot 145 s, items 116 s, records 82 s, sim 40 s, chart 19 s |
| `npm run build` | passes; one chunk, 1,366.34 kB / **435.43 kB gzip**; Vite warns >500 kB |
| Designer code | 5,199 non-test lines, but only 3,158 are separable (see F4) |
| Line width | 628 lines >120 chars, 113 >160, 21 >200 |
| Type hygiene | 2 non-null assertions, 2 `as any` (both serialisation boundaries), no TODO/FIXME |
| Dependencies | zero runtime deps; strict + noUnusedLocals + noUnusedParameters |
| Activity | 148 commits in 45 days |
| Lint/format | no eslint/prettier/biome/editorconfig |

**Caveat.** `tsc --noEmit` clean, `npm run build` clean, `npm test` reports **3 failed / 586
passed**, all from the uncommitted `world.json` edits (F5). Not a suite regression.

## What is strong (keep doing this)

1. **Fixed timestep, correctly done** — `TICK = 1/120`, accumulator, `MAX_FRAME_SECONDS` clamp,
   interpolated draw (`main.ts:1322`).
2. **Determinism designed in** — seeded RNG, and tests assert it.
3. **Scale work already exists** — fields sleep/wake by distance, off-screen ships become trip
   records, and `npm run parity` cross-checks records against flown behaviour.
4. **Content is data**, with defensive JSON readers (`items.ts`: `finite`, `cells`, `colour`).
5. **Tests describe behaviour, not implementation**, and the sim is exercised through play.
6. **Save format** is versioned, refuses old saves, and handles shared object identity.

## Findings

### F1 — `Sim` is a god object (structural, largest)
5,707 lines, 309 methods, covering ship, world, mining, cargo, lockers, shops, blueprints, haulers,
pirates, defenders, chart, damage, saves. `this.tuning` 156×, `this.ship` 69×.

Mitigating: methods are **short** (16 exceed 60 lines) and cluster by feature in near-contiguous
blocks — buying ≈1177–1743, cargo/lockers ≈1856–2271, station economy ≈2806–3433, chart/sight
≈3989–4790. It is a *shallow* god object: it decomposes along visible seams, one block at a time,
with `Sim` kept as a façade. It also owns the state, so the seam to cut on is **which state a
block owns**, not which feature it serves.

### F2 — `main.ts` does five jobs
Panel DOM, input, persistence, frame loop, designer wiring, in one 1,427-line module at module
scope (`const sim = new Sim(...)`), so none of it is testable. Screen state is inferred from 17
`.hidden` assignments plus string-keyed memoisation (`main.ts:770`). Miss a field in the state
string and the panel silently goes stale. There is no explicit screen/mode state.

### F3 — there is no fast test lane (cheapest improvement, now measured)
146 s to answer "did I break a pure function". `npm run` has no fast lane. **Measured:** the 11
pure-logic files run in **1.55 s** (163 tests) — a 94× faster loop.

### F4 — the designer boundary is already nearly clean; code-splitting is the wrong fix
`main.ts` is the **only** player-bundle importer of `designer/*` (everything else importing it is
node-only under `src/profile/`). But of the five imports, only two are actually dev-only:

- `designer/hulls` (1,663) and `designer/designer` (1,495) — the editors. Gated on `?dev`.
- `designer/link`, `designer/shipped`, `designer/world` — **runtime game code** (the shipped world
  is parsed and applied at startup), parked in `designer/`.

So the separable payload is 3,158 lines, not 5,199, and the boundary can be enforced for ~nothing
with a lint rule banning `designer/hulls` and `designer/designer` outside `main.ts`. 435 kB gzip
is not a demonstrated player-facing problem for a README-audience desktop game. Code-splitting is
optional polish; the *rule* is the win.

### F5 — generated world files churn because of key order, not float noise
The current 602-line `world.json` diff is **67 objects with reordered keys** plus 19 value changes,
of which only **1** is float representation (`atmosphere 13799.999999999998 → 13800`). The other 18
are real authoring edits (radius, orbitRadius, surface, pullAccel, names, drops, items). So the fix
is a **fixed key order in `stringifyWorld`** (`designer/world.ts:438`), not rounding floats.

`start.json` (950 kB, pre-warmed world) must be regenerated by hand via `npm run warm`, and any
`world.json` edit makes it stale (`save.ts:153,162`). A test guards it, which is how it goes red.
No command does both steps.

### F6 — module-level mutable singletons
`PARTS`, `ITEMS`, `ITEM_RECIPES`, `DEFAULTS` are exported `const`s mutated in place.
`sim.test.ts:10` does `Object.assign(GAME_DEFAULTS, { criticalSeconds: 0, askHull: false })`,
mutating an imported module for the whole file. Survives only because Vitest isolates *files*.

### F7 — the home pair is a second, hard-coded representation — and it is growing
Not a naming convention, and **not** absent from `world.json`. Both halves live there:

| | home pair | every other one |
|---|---|---|
| Field | `this.field!: Poi` + `tuning.field*` | `ExtraField { spec: FieldSpec, poi }` |
| Base | `this.station: Poi` + `bases[0]` + `tuning.station*` | `Base { spec: StationSpec, poi }` |
| Pirate base | `this.pirateBase` + `tuning.pirateBaseDistance`, `pirateCap`, `pirateOre`, `blackMarket` | `StationSpec` (not modelled as a base at all) |
| Id | `"first"` / `"station"` | `spec.id` |
| Origin | built in `reset()`, then **overwritten from the designer** | handed over by `applyLayout()` |

The designer authors all three (`designer/link.ts`, `writeGame`), but routes them through a
*channel of its own*:

```ts
tuning.fieldRadius = field.radius;
tuning.rockCount = field.rocks;
[tuning.fieldCarryFull, tuning.fieldCarryNone] = carrying(field);
tuning.stationDistance = station.orbitRadius - field.radius;
tuning.stationSpinPhase = toRadians(station.spinPhase);
tuning.stationEccentricity = station.eccentricity;
tuning.stationPeriapsis = toRadians(station.periapsisAngle);
[tuning.stationCarryFull, tuning.stationCarryNone] = carrying(station);
tuning.pirateBaseDistance = pirates.orbitRadius - field.radius;
```

So the designer can move, resize and re-orbit them (it writes tuning), but it cannot delete them,
and the game holds the same design twice — once authored, once hard-coded — with no single source
of truth. `fieldsFor`/`stationsFor` then step around the pair on purpose
(`designer/link.ts:115`: "every field beyond the first").

**It is growing.** The uncommitted work adds a new home-only field and branch:

```ts
/** What the rocks of the starter field drop, which has no field spec of its own. */
firstFieldDrops: FieldDrop[] = [];
```

That comment is the argument for doing this soon: every feature that touches drops, orbit or
carry has to be written twice while the pair exists.

Sites (working tree): **48 × `bases[0]` in `sim.ts`**, of which 15 are getter/setter passthroughs to
`bases[0]`, **5** are `===`/`!==` comparisons (1760, 2422, 2458, 3931, 6004), 5 are
`base: Base = this.bases[0]` default parameters, and the rest are `?? this.bases[0]` fallbacks for
an unknown base id. Plus 18 × `this.field`, 18 × `this.station`, 18 × `FIRST_FIELD` outside tests,
and 15 test lines across 6 files.

**The fallbacks are behaviour, not plumbing.** `?? this.bases[0]` at 4579, 4602, 4607, 4627, 4683,
5469, 5499, 5543, 5570, 5591, 5645, 5666, 5724, 6004 decides *which base pays for and owns a
wreck, a rebuild or a trip record*. Removing the pair means answering "what happens on an unknown
base id" — nearest base, or drop the record.

Tuning keys are **not** all home-pair keys: of 15 `field*` keys, 6 are traffic behaviour
(`fieldWanderChance`, `fieldLuckSeconds`, `fieldHabitSeconds`, `fieldEmptyShare`, `fieldFearChance`,
`fieldFearSeconds`, used in `pilot.ts` and `sim.ts`), 6 are the home field's orbit geometry, and 3
are its radius and carry. The rule that came out of the council: **what a place *is* goes per-spec;
how traffic *behaves* stays global.**

Blast radius: `snapshot`/`restore` carry `station:` and `field:` at top level (`1053-1054`) and
re-point `bases[0].poi = this.station` (`1120`), so this is a `SAVE_VERSION` bump (currently 7) plus
a `start.json` re-warm, in the same commit as the snapshot change.

### F8 — small, cheap
`CLAUDE.md` and `AGENTS.md` are byte-identical. `TAU` declared 3×, `lerp` 2×, `R` 2×. Flight is
keyboard-only — `KeyW/ArrowUp`, `KeyQ/ArrowLeft`, `KeyE/ArrowRight`, `Space` read from a keydown
`Set` (`main.ts:1091-1120`), with no `touchstart`/`gamepad`/`pointerType` anywhere in `src/` or
`index.html` — so the published link is desktop-only *for flying*, though click-orders work by
pointer. CI publishing on a red suite is **decided** and the reason is written in
`.github/workflows/pages.yml`; not an open item.

## Corrections

My first draft got these wrong; the council caught them, and I verified each against the tree.

| Was | Actually |
|---|---|
| "the home pair's numbers are not in `world.json` at all" | They are, routed through `tuning` by `writeGame`. The designer **can** move/resize/re-orbit them; it cannot delete them, and the game keeps a duplicate. |
| "much of the diff is float noise" | 1 of 19 value changes. The churn is 67 objects with reordered keys. Fix key order, not rounding. |
| `firstFieldDrops` cited as existing architecture | It is uncommitted, and it **adds** a home-only special case. |
| "15 `field*` keys describe the home pair" | 6 of them are traffic behaviour, not home-field. |
| "name the home base" | Wrong direction; the item is removal. |
| "decide whether CI should gate on tests" | Already decided, in writing, in the workflow. |
| 47 `bases[0]`, 6 default params, 5 test files | 48, 5, and 6. |
| the pirate base was not mentioned | It is a third hard-coded node on the same tuning channel. |
| 5,199 designer lines ship | 3,158 are separable; `link`/`shipped`/`world` are runtime game code. |

## Recommended order

**Step 0 — guardrails (hours)**

| # | Item | Effort | Why now |
|---|---|---|---|
| 0.1 | `npm run test:fast`: 11 pure-logic files, measured 1.55 s | ~15 min | 146 s → 1.55 s; measured, not estimated |
| 0.2 | `docs/architecture.md`: module map, tick order, content flow, "where do I add a part / ship / station" | ~1 h | nothing explains where things live |
| 0.3 | Fixed key order in `stringifyWorld` (`designer/world.ts:438`) + one `npm run world` writing `world.json` **and** re-warming `start.json` | ~1 h | kills the 602-line churn; removes a manual step known to go red |
| 0.4 | eslint with a **boundary rule**: `designer/hulls`/`designer/designer` only from `main.ts` | ~1 h | gets F4's real goal free; skip the code-split |
| 0.5 | Dedupe `CLAUDE.md`/`AGENTS.md`; prettier | ~15 min | trivia |

**Step 1 — remove the home pair, fields first.** Fields are the cheaper half (no capabilities hang
off `this.field`): stop filtering in `fieldsFor`, hand the linked field to `applyLayout`, make
`this.field` a lookup into `extraFields`, collapse `layRocks`, `firstFieldDrops`, the radius branch
(`4227`), the sleep set (`4122`) and `pilot.working`'s default (`pilot.ts:557`) onto the generic
path. Then `stationsFor`, then the 5 default parameters become required, which deletes the 15
getter/setter passthroughs at `871-931` by itself. Then decide the unknown-base-id rule and make
the 14 `?? this.bases[0]` fallbacks follow it. Then move projects/chatter/shipyard/hauler-source
onto `StationSpec`. The pirate base follows as its own step — it is the same channel and the same
duplication, but it is not a `Base` yet, so it must not block the first two.

*Tripwire, from two advisors independently:* if more than two `Sim` blocks cannot be pulled out
without first settling the home-pair rules, stop and split `Sim` first instead.

**Step 2 — `main.ts` panels** into `src/ui/` (shop, inventory, start, hud, help). Mechanical: they
are already functions.

**Step 3 — `Sim` blocks**, one per session, façade preserved, ordered by which state they own.

**Step 4 — optional:** move `link`/`shipped`/`world` out of `designer/`, then dynamically import the
two editors. Only if the import rule proves insufficient.

## Decisions

All five were proposed here and accepted by the owner; they are *decided* and now live in
`docs/home-pair-plan.md` under "Rules".

1. **Unknown base id** — nearest base that can do the job; with none, the record is dropped.
2. **Per-spec:** guard count/arc/distance, project list, chatter flag, hauler source field.
   **Global:** the six traffic `field*` keys, `stationStart*`, `cashBuffer`, `partsTarget`,
   `reserveParts`.
3. **The pirate base** joins as its own step, after bases, and does not block them.
4. **Granularity** — two commits (field, then base), one `SAVE_VERSION` bump in the second.
5. **Delete is in scope** — the designer may delete the home field and station.

## Evidence

Read: `package.json`, `tsconfig.json`, `vite.config.ts`, `.github/workflows/pages.yml`, `README.md`,
`AGENTS.md`/`CLAUDE.md`, `src/save.ts`, `src/items.ts`, `src/parts.ts`, `src/grid.ts`,
`src/inventory.ts`, `src/main.ts`, `src/sim.ts`, `src/pilot.ts`, `src/render.ts`, `src/chart.ts`,
`src/tuning.ts`, `src/designer/link.ts`, `src/designer/world.ts`, `src/designer/recipes.ts`,
`src/profile/parity.ts`, `src/economy/cycle.ts`, `docs/*-plan.md`, `src/*.test.ts`.

Ran: `npx tsc --noEmit` (clean); `npm run build` (clean, sizes above); `npm test` (3 failed / 586
passed, all from the uncommitted `world.json` edits); the proposed fast lane (163 tests, 1.55 s);
a JSON tree diff of `world.json` HEAD vs working (1,903 leaves, 19 value changes, 67 reordered
objects); `git show HEAD:` checks for `firstFieldDrops`; line, import, method and key counts.

## Council

**Question.** Is this finding list correct, and is this order right — in particular, should the home
pair be removed before `Sim` is decomposed, does moving it into `world.json` worsen the churn, by
what axis should `Sim` split, what belongs per-spec, and is the bundle worth splitting?

**Roster (3 seats, Pass 1 only, fresh context for all).**

| Seat | Model | Path | Run |
|---|---|---|---|
| `opus-5-5` | Claude Opus 5.5, effort high | `claudeAgent` (re-seat) | `e9f918b5` |
| `gpt-6-luna` | GPT-6 Luna, reasoning high | `codex` (re-seat) | `455803f0` |
| `glm-5-3` | GLM-5.3 | `opencode-go`, pi workflow | `f1d48d26` |

**Fallbacks and deviations.** No `council-*` advisor profiles are installed, so all three seats used
the documented fallback profile (`reviewer`), fresh context, read-only. The first launch routed the
two Anthropic/OpenAI seats through `github-copilot`, which failed with `403 subscription_ended`
(runs `31fd28e9`, `9c76888a`); they were re-seated on `claudeAgent` and `codex` with the same
models and re-run. Two earlier dispatches (`e8e3c9b8`, `78c71e4d`) inherited the parent model by
mistake and were cancelled before producing output. Pass 2 was not run: every remaining dispute was
an owner decision, not something advisor evidence could settle.

**Recommendation.** Remove the home pair before decomposing `Sim`; split `Sim` by the state each
part owns; keep the façade; put what a place *is* on specs and how traffic *behaves* in tuning;
do the cheap guardrails first, and treat the bundle as optional polish.

**Agreed by all three:** remove before decompose; fields first; staged and behaviour-preserving;
façade kept; subsystem/state axis rather than feature verticals; per-spec only for geometry and
capabilities; code-splitting is about the boundary, not bytes.

**Accepted from the council** — F5's float-noise diagnosis (wrong target), F7's absence from
`world.json` (wrong), `firstFieldDrops` (uncommitted and growing), the `field*` key split, the
pirate base, the fallback-versus-gate distinction, the test/site counts, the CI item, and F4's
reframing from payload to import rule.

**Rejected, with evidence** — "only 3 `=== bases[0]` checks" (there are 5); "`FIRST_FIELD` appears
12 times" (18 outside tests: 12 in `sim.ts`, 6 in `pilot.ts`); "the fast lane may not be selectable"
(ran it: 163 tests, 1.55 s); "the uncommitted work adds a ninth `applyLayout` parameter" (it changes
no signature); "pointer click-orders prove touch support" (there is no touch or gamepad input at
all, so keyboard-only flight stands).

**Confidence.** Medium-high on the structural findings and the order; medium on the per-spec
boundary, where the rule is agreed but the four capability keys are design taste.

**What would change it.** If more than two `Sim` blocks cannot come out without first settling the
home-pair rules, the split goes first. If a measurement ever shows players leaving during a 435 kB
load, the bundle becomes a real item rather than optional polish.
