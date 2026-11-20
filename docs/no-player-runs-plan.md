# No-player runs plan

Written 2026-11-20. Nothing here is built yet.

## Why

Pillar 3 in `docs/vision.md` is the current focus: *alive without you*. Set things in motion,
look away, come back to what changed. The experience-target scale leans on the same tool: level
2 ("closes once") is checked by code and **no-player runs**, level 4 ("repeats") by play plus
no-player runs, and the floating idle mining target wants its two numbers (minutes between
decisions, credits per hour idle against active) measured that way. These are *decided* in the
vision; this plan is how to get the tool.

Today there are three one-off scripts that each run the world with the player parked far away:
`npm run news` (`src/profile/news.ts`, who docks where and how news spreads), `npm run census`
(`src/profile/census.ts`, fights and money for the parity check) and `npm run profile`
(`src/profile/run.ts`, step timing). Each copies the same set-up: build a `Sim`, lay a world in,
reset, park the player's ship each tick, step, count. A new question means a new copy.

The first implementation turns `news.ts` into one runner with named **scenarios** and reusable
**watchers**, and adds the first scenario for pillar 3 itself: leave the world alone for hours and
print what changed.

## The picture

Everything below is my proposal unless marked *decided*. The user asked for this plan starting
from `npm run news` (*decided*), and for "at least a first implementation" (*decided*: this plan
is that, not the whole tool).

- **A scenario** is a name, one line of what it asks, a default length in game minutes, a set-up
  (which world, which tuning, anything placed or ordered before the clock starts) and a list of
  watchers. It doesn't step the sim itself.
- **A watcher** looks at the sim after each step (or every N game seconds) and writes its part of
  the report at the end. Watchers are small and shared: `news` and `away` both use the docks
  watcher. They read the sim; they never change it.
- **One runner** does the rest: build the sim, set it up, park the player, step for the length,
  call the watchers, print. Same seed and same scenario give the same report, line for line.
- **No player** means the player's ship sits far out in empty space, out of view of everything,
  every tick, as `news.ts` does today. Whatever is out of view runs as records (the default),
  or flown with `flown`, so the same scenario doubles as a records-versus-flown spot check.
- **Reports are plain text** for reading, plus `--json` (one line, as `census --json` does) so a
  slow script can collect and compare runs later. They print; they don't gate anything. Long
  runs follow the slow-checks rule in `CLAUDE.md`: run in the background, never part of done.

## What to build

### 1. The runner: `src/profile/scenario.ts`

`npm run scenario -- <name> [game minutes] [seed] [flown] [--json]`

- No name, or an unknown one: list the scenarios with their one-line question and exit.
- Defaults: the scenario's own length, seed 1, records.
- Builds `new Sim(seed, { ...DEFAULTS, trafficRecords, fighterRecords, chatter: false, ...scenario.tuning })`,
  lays the world in with `useLayout(world, linkTo(sim))` from `src/profile/world.ts`, then
  `sim.reset(seed)`, then the scenario's set-up.
- The world is the shipped one (`shippedWorld()`), or a layout by name from
  `src/designer/layouts/<name>.json` when the scenario or a `--layout <name>` flag says so (that
  folder is made by `npm run layout`; a missing one is a clear error, as in `news.ts` today).
- Parks the player each tick before `sim.step()`. Use one shared `park(sim)` in
  `src/profile/world.ts`; `news.ts`'s fixed (400000, 400000) and `census.ts`'s "40,000 beyond the
  field" are two copies of the same idea. Pick the 400000 spot (clear of the full system) and
  check it is still outside every body and field in the shipped world; if not, compute "beyond
  the outermost orbit" instead.
- Report header: scenario, game minutes, seed, world, records or flown, and wall time taken.

### 2. Scenarios and watchers: `src/profile/scenarios.ts`

Types, roughly:

```ts
interface Watcher {
  name: string;
  /** Called after every step. Keep it cheap, or check `sim.now` and act every N seconds. */
  step(sim: Sim): void;
  /** Lines for the text report. */
  report(sim: Sim, minutes: number): string[];
  /** Numbers for --json, flat keys. */
  totals(sim: Sim): Record<string, number>;
}
interface Scenario {
  name: string;
  question: string;
  minutes: number;
  layout?: string;
  tuning?: Partial<Tuning>;
  setup?(sim: Sim): void;
  watchers(): Watcher[];   // fresh watchers per run
}
```

Watchers to start with, split out of `news.ts` as it stands:

| Watcher | What it reports |
|---|---|
| docks | Traffic stays per base (a ship arriving at a base it wasn't docked at counts once). |
| news | Per "base hears item at other base": first heard, how many fresh deliveries after, share of time on the board. Exactly today's lines. |
| working | Every 30 game minutes, how many traffic ships work fields nearest each base. Today's progress lines. |
| changed | New, for pillar 3; below. |

### 3. The `news` scenario: today's script, moved

`news` = docks + news + working, 120 minutes. Its text output matches today's `npm run news` for
the same arguments (same seed, same numbers), so nothing measured in
`docs/shopping-trip-test.md` step 3 is lost. `npm run news` stays as a script and becomes
`vite-node src/profile/scenario.ts news`, so old notes keep working. Delete the old body of
`news.ts` (or the file, if the package script points at the runner).

### 4. The `away` scenario: come back to what changed

The pillar 3 question in its plainest form: *you leave for a few hours; what's different when you
come back?* Default 240 game minutes. Watchers: docks + changed.

The **changed** watcher takes a picture of the world at the start (after set-up) and at the end,
and prints the differences a returning player could notice, biggest first, skipping zeros:

- Per base (`sim.bases`): credits (`account.credits`), ore held (`ore`, by item), stock (`stock`, by
  item), blueprints gained (`blueprints`), blueprints ordered or still being paid, traffic lost
  and not yet replaced (`lostTraffic`), board size.
- Ships: traffic, pirates and defenders alive at start and end, and wrecks along the way (from
  `ship.wrecks` per ship, as `census.ts` counts them, without its monkey-patching).
- Haulers: trips made (count a hauler setting out).
- Fields: for each field, rocks at start and end where the sim knows it (asleep fields included
  where `sim.sleeping` holds a count); if a field's count isn't cheaply known, leave fields out of
  the first version and say so in the report rather than guessing.

Plus one closing line that reads like news, not a table, e.g. *"4 h away: Hub +1,240 cr and a new
blueprint, 3 traffic lost (2 replaced), pirates 6 → 4."* That line is the small, real form of the
"come back to what changed" candidate in the vision: it shows whether there is anything worth
coming back to yet.

`--json` totals: flat keys such as `base Hub credits`, `traffic alive`, `pirates wrecked`,
`hauler trips`, so two runs (or two commits) can be compared by a later script.

### 5. Tests

- `src/profile/scenarios.test.ts` (in `test:fast` only if it runs under about a second; otherwise
  add it to the slow exclusion list in `package.json`'s `test:fast`):
  - every scenario has a unique name, a question and a positive length;
  - the runner, given a tiny scenario (a few game seconds on the shipped world, seed 1), runs and
    returns the same report twice;
  - the changed watcher, given a sim where one base's credits are bumped between start and end,
    reports that base and that amount, and reports nothing for a world where nothing changed;
  - watchers don't change the sim: a run with all watchers and one with none end in the same
    `sim.snapshot()` for a short run.
- By hand: `npm run news -- 240 1` before and after the change prints the same numbers;
  `npm run scenario -- away` prints a readable summary; `npm run scenario` lists both.

## Edge cases

- A scenario longer than a few hours is slow on the flown side; the header prints wall time so
  that's visible, and the text in `CLAUDE.md` about slow checks applies.
- A base with no change at all prints nothing, not a row of zeros; a world where nothing changed
  says so in one line.
- Seeds must keep giving the same run: watchers use no randomness and never call into the sim's
  random source.
- The player's own ship and its credits are left out of "what changed": the player is away.

## Later, not in this first step

In the order they'd likely come, each its own `/spec` when it comes up:

1. **Idle mining measurement** (`docs/idle-mining-road.md`, step "Keeps mining"): a scenario
   where the player's ship is *not* parked but set up as an idle miner, with a watcher for
   minutes between decisions and credits per hour, and a reference active pilot to compare
   against. Needs auto-fire first; this runner is where it lands.
2. **Many seeds**: a slow wrapper, like `npm run parity`, that runs a scenario over several seeds
   in the background and logs to `docs/`.
3. **Start from a save**: run `away` from a player's own saved world (saves live in browser
   storage today, so this needs an export first). That is the "more and more yours" half of
   pillar 3.
4. Moving `census` onto the runner, once the watcher shape has held for two or three scenarios.

## Not doing

- No in-game "time passes" or fast-forward button: this is a developer tool, not a feature.
- No new simulation rules: runs only read what the sim already does.
- No pass/fail thresholds yet: the reports are read, not asserted, until we know what good looks
  like.
