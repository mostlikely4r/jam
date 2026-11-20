# No-player runs plan: a bot that plays

*2026-11-20. Built the same day: the floater track, the report, the watch switch and the tests.
Several things landed differently from the proposal, and the first runs found the snag the
plan was for. Both are at the end, under "Built". The plan itself is left as it was written.*


## Why

Pillar 3 in `docs/vision.md` is the current focus: *alive without you*. The experience-target
scale checks level 2 ("closes once") with code and **no-player runs**, and level 4 ("repeats")
with play plus no-player runs. The floating idle mining target wants two numbers measured that
way: minutes between decisions, and credits per hour idle against active.

What the user wants from a no-player run (*decided*): not a unit test and not background
simulation, but the game **played**. It sits between an AI playing the game and the user playing
it to test a new feature: a scripted player, like a player bot in an MMO server, that does what a
player does and shows how the session **goes**. It shows what it runs into, how far it gets and
where it stalls. It may one day feed new traffic behaviour, but that is not the purpose.

`npm run news` (`src/profile/news.ts`) is where this starts: today's script that runs the world
with the player parked far away. The bot replaces the parked player with one who plays.

## The picture

*Decided* marks the user's calls; the rest is my proposal.

- **Two tracks, one per starting ship** (*decided*): idle floating (the floater) and active ore
  hunting (the racer). Both start from a new game. They also give the comparison the vision asks
  for. **The floater track comes first** (*decided*); the racer is the next step, specced on its
  own after the floater bot runs (*decided*).
- **New-game journey first** (*decided*). The bot starts a new game and grows its ship. Runs
  that start already kitted out at equal investment are shorter scenarios that come later.
- **The bot only uses what a player has** (my proposal, agreed in talk). It plays the player's own ship
  through the same calls the game's input code makes: the controls, the click orders, the shop,
  buying and fitting, docking. No traffic shortcuts, no records, no reaching into sim internals
  to move ore or credits. It may be dumb, never cheating: its value is the snags it finds.
- **A written plan, not judgement** (*decided*). Each track is a readable list of steps (the
  journey the designer intends), with simple rules for the in-between. When the bot stalls,
  the game doesn't support the path we meant. Later, bots may get goals and judgement, with
  clear logging of why each choice was made, so a stall can be pinned on the game or the bot
  (*decided*, later).
- **Every input is logged** (my proposal). Each order, each burst of fire, each buy counts as a
  player input. The gaps between inputs are the vision's "minutes between decisions". Today the
  floater has no auto-fire, so its bot aims and fires by hand like a player must, and the log
  will show it isn't idle yet. When auto-fire lands the bot stops firing and the gaps open: the
  before and after for `docs/idle-mining-road.md`.
- **The world runs as it is** (*decided*): pirates, defenders, traffic all on. Running into them
  is part of how a session goes.
- **Trouble is a setback, not an end** (*decided*). A wreck goes through whatever the game does to
  a player, gets logged with what it cost in time and credits, and the bot plays on. The first bot
  doesn't flee or fight (my proposal, agreed): the log shows what happens to a passive player.
- **A run ends** (*decided*) when the goal is reached, the time runs out, or it is stuck: no plan
  step advanced and no credits earned for a while.
- **Both a report and a watch mode** (*decided*). Headless in node, faster than real time, for the
  session log; and a dev-only switch in the running game that hands the player's ship to the bot
  so you can watch it play, to see what a "stuck" line actually looked like. The bot is the same
  code in both.

## The floater journey (*decided*)

The run ends when every upgrade relevant to idle floating is bought. "Earn 1000 credits in that
life" is a separate, shorter scenario that starts with the full kit (later, equal-footing kind).

| Step | Buy | Price today | Why |
|---|---|---|---|
| 1 | Bay (`bay`) | 250 | The small bay holds 10 ore; trips too short to look away |
| 2 | Turret (`turret`) | 300 | Shoot without turning the slow hull |
| 3 | Tractor, cone (`tractor`) | 300 | Ore comes to you |
| 4 | Targeting (program `targeting`) | 250 | Pick the rock, systems aim |
| 5 | Large bay (`largeBay`) | 600 | Longer gaps between trips home |
| 6 | Route planner, system chart, autopilot (programs `clickRoute`, `starmap`, `autopilot`) | 200, 350, 800 | Click the map to go home |

The all-round tractor at the far base is left out (*decided*). If the floater's computer has no
slots for all these programs (`computerSize`, `programSlots` in `src/fitting.ts`), the bot does
not work around it: it logs the refusal as a snag and the run reports it. Prices come from the
game, never from this table.

## What to build

### 1. The bot: `src/bot/`

A new folder, kept out of the shipped game except through the dev switch (add it to whatever
`scripts/boundaries.mjs` checks, as the designer is).

- **`src/bot/bot.ts`**: `class Bot` given a `Sim` and a `Plan`. `step(sim)` is called once per sim
  tick before `sim.step()`, like the game's input code. It may only:
  - set `sim.controls` (thrust, strafe, turn, fire), as `main.ts` does from keys;
  - call the player order methods the mouse code calls: `orderMove`, `orderMoveStraight`,
    `orderTranslate`, `orderNudge`, `orderFace`, `orderStop`, `orderTravel`, `orderTravelDeposit`,
    `selectTarget`, `toggleTarget`, `boxTargets`, `clearTargets`, `setDestination`;
  - call the shop and fitting methods the shop UI calls: `buyPart`, `sellPart`, `fitItem`,
    `sellItem`, and whatever `main.ts` calls to dock, undock and sell ore;
  - read anything (the sim's state is the player's screen, roughly).
  Every call that is a player input goes through one `input(kind, detail)` helper that logs it
  with the game time. A set of `controls.fire` that holds for many ticks counts as one input
  (the press), not one per tick.
- **`src/bot/plan.ts`**: the plan is data: an ordered list of steps, each a goal the bot works
  toward with the in-between rules. Floater steps: "own `bay`", "own `turret`", and so on. Between
  steps the rules are the mining loop: pick the nearest rock in reach, move beside it, shoot it
  (aim the turret if fitted), let the tractor (if fitted) or the ship's pickup take ore, go home
  when the hold is full or nothing is in reach, dock, sell, buy the next step's item when it can
  be afforded, fit it, undock, repeat. Use the route planner and autopilot to go home once owned,
  click orders before.
- **`src/bot/log.ts`**: the session log: timestamped events (step started, step done, bought,
  fitted, refused with the game's reason, docked, sold for N, wrecked, rescued, stuck, end) plus
  the input log. Prints as text, and as one JSON line with `--json`.

How each player action really happens (docking, selling ore, what a wreck does to a player and
how a player gets back) is read from `main.ts` and `sim.ts`, and the bot does exactly that. Where
the only way is something the UI does inside `main.ts`, move that bit into a function both can
call rather than copy it.

### 2. The headless run: `npm run bot`

`npm run bot -- [track] [game hours] [seed] [--json]`, in `src/bot/run.ts`. Track defaults to
`floater`, hours to 6, seed to 1.

- Builds the sim as `src/profile/news.ts` does (shipped world, `chatter: false`), with the
  floater start (`tuning.floaterStart`), then `sim.reset(seed)` as a new game does. Read
  `main.ts`'s new-game path and match it.
- Each tick: `bot.step(sim)`, then `sim.step()`. No parking: the player's ship is in play, so
  what's near it is flown and the rest runs as records, as in the game.
- **Stuck**: no plan step done and no credits earned for 15 game minutes (a tuning constant in
  `src/bot/`). The run ends, logging the step it was on, where the ship is, and its last inputs.
- Ends at goal, at the time limit, or stuck. Prints the report.

`npm run news` stays as it is.

### 3. The report

Text, for reading:

```
Floater journey, seed 1, 6 h limit, shipped world
0:00  new game, floater, 0 cr
0:03  step 1: own bay
0:07  first rock
0:12  hold full (10), going home
0:16  docked at Hub, sold 10 ore for 84 cr
...
0:41  bought bay (250), fitted
...
1:52  wrecked by pirate near Field 2: lost 40 ore, 6 min to get back
...
3:10  goal reached: all 6 steps
Steps:  1 bay 0:41 | 2 turret 1:05 | 3 tractor 1:30 | ...
Inputs: 1,840 total, median gap 2 s, longest gap 3 min
Per hour: credits earned 410, 520, 600 | inputs 700, 610, 530
Setbacks: 1 wreck (6 min, 40 ore)
```

The numbers above are invented to show the shape. `--json` gives the same as one line of flat
keys (step times, inputs per hour, credits per hour, gap median and longest, wrecks, end reason)
so a later script can compare runs and commits.

### 4. The watch switch

Dev only, behind `?dev` (`main.ts` line ~77): a key or panel toggle "bot plays" that, each frame
before the sim steps, calls `bot.step(sim)` and ignores the player's own input while on. The log
prints to the console, and the current plan step shows in the dev status lines. Turning it off
hands control back. Game speed stays whatever the game offers; no new fast-forward for this.

### 5. Tests

- `src/bot/bot.test.ts`:
  - the bot never calls outside its allowed list: wrap the sim in a proxy for a short run and fail
    on any other method that changes state;
  - same seed, same run: two short runs (a few game minutes) give the same log;
  - a fire held for many ticks logs one input;
  - stuck: in a world with no rocks in reach, the run ends as stuck after the stuck time, naming
    the step;
  - a refusal (buying with too few credits, or a program with no free slot) is logged with the
    game's own reason and doesn't crash or loop.
- These steps run the sim, so put the file in the slow exclusion list of `test:fast` in
  `package.json`.
- By hand: `npm run bot` prints a log that reads like the example; with `?dev`, the switch flies
  the floater visibly through the same loop; a full journey run is slow, so run it in the
  background and treat it like the parity checks: it reports, it never gates done.

## Edge cases

- Prices, shop stock and slots change under the bot: it asks the game each time, never caches the
  table above.
- The shop may be out of an item (stock per base): logged as a refusal, the bot keeps mining and
  retries on its next dock.
- Wreck while carrying ore or mid-trip: the plan step is not reset; the bot resumes the loop from
  wherever the game puts the player.
- The player's ship already docked at the start of a new game: the loop starts with undocking.
- The watch switch on while a menu or shop panel is open: the bot acts on the sim, the panel shows
  the result as it would for a player.

## Next, not in this step

- **The racer track** (*decided* as next): active ore hunting, flying by hand with thrust and
  turn, its own journey and upgrade list, and the first idle-against-active comparison.
  Specced on its own after the floater bot has run.
- **Shorter scenarios from equal footing** (*decided* later): both ships start kitted out at equal
  investment. The first: the floater with its full kit, earn 1000 credits.
- **Goals and judgement** with logged reasons (*decided* later).
- Many seeds in the background, logged to `docs/`, as `npm run parity` does.

## Not doing

- No cheating bot: no records, teleports, or direct edits of credits, ore or fittings.
- No fleeing or fighting in the first bot.
- No new player feature or fast-forward for players: the bot and its switch are dev tools.
- Not new traffic. Turning bots into traffic is a separate decision, weighed on cost later.

## Built

`src/bot/`, and the one thing that reaches the game, the dev switch in `main.ts`.

- **`plan.ts`** — the journey as data: six steps (bay, turret, tractor, targeting, large bay,
  and route planner + system chart + autopilot as one step, as in the table above). `working()`
  is `ship.parts.has`, so a program only counts when it is loaded *and running*.
- **`bot.ts`** — the bot. `step(sim)` once a tick before `sim.step()`, as the plan said. It keeps
  to a documented surface: `BOT_CALLS` lists every method it may call, split into the inputs a
  player's hands can give and the screens a player can read. A test wraps the sim in a proxy that
  throws on anything else.
- **`log.ts`** — the session log and the report: timestamped events, every input, then the
  `Steps: / Snags: / Inputs: / Per hour: / Setbacks:` lines and `--json` as one line of flat keys.
- **`run.ts`** — `npm run bot -- [track] [game hours] [seed] [--json]`. Shipped world, no chatter,
  the floater start, and the loop above.
- **`?dev` key G** — the same bot plays the ship you are watching, printing the log to the console
  and the current step in the status lines. Press again for the ship back. No panel: the log is
  the console, and one key is enough. The bot is loaded on demand as its own chunk, so it never
  reaches the shipped bundle, unlike the two editors.
- **`bot.test.ts`** — the five checks the plan listed, and one more that a step's part is bought
  and called done. In the slow list of `test:fast`.
- **`scripts/boundaries.mjs`** — the bot joins the editors: only `main.ts` may import it.

### What landed differently

- **The seed starts a game from scratch, not from the warmed start a player gets.** The warmed
  start in `src/start.json` carries the world's dice with it (`snapshot` saves `randomState`), so
  restoring it hands every seed the same world and the same rolls: seed 1 and seed 2 played the
  same session, line for line. A run therefore reset the shipped world from its seed instead. It
  is worth settling once runs want to start in a warmed world on purpose: the game's own new games
  have the same thing to think about.

- **The dock sells the ore itself.** There is no click that sells ore at a station: `unloadOre`
  turns it into credits a piece at a time while the ship is docked, at each item's own price. So
  the bot waits in the dock until the hold is empty and then shops; it never calls `sellItem`, and
  one sale is not an input (the dock did it, not the player).
- **The hull is turned by hand, not by `orderFace`.** The click pilot's facing order never settled
  for a hull with no spin stabilizer: nothing damps a spin, the order changes every tick for a rock
  that drifts, and the ship ended up tumbling, unable to fire. `controls.turn` with the spin held
  in its own correction, as the Q/E keys do, comes to rest pointing at the rock. `orderFace` is not
  in the bot's surface at all.
- **It dodges rocks on a long click order** (`clearRun`): a straight click crosses a field at
  several hundred units a second and the first rock it meets is a wreck. The plan didn't say how
  the bot should fly; a player sees the rock coming, so the bot looks along the line and slips past
  the first one on it.
- **It fires only from a near standstill**, aiming where the rock will be, since a shot carries the
  ship's own drift. With a turret it can fire while still settling; with the hull's own gun it turns
  the nose on to the rock first, which costs time (see below).
- **Ore is only fetched close by** (250 units, and 200 before anything else). Drifting ore a floater
  with no tractor chases for ever: the give-up rule was added after the first run spent 28 minutes
  on one piece.
- **The refusal the run exercises is the program slot.** The shop's own line is dead for what the
  ship can't pay for, so an unaffordable buy isn't something a player can do, and the bot doesn't
  either. A program bought with no free slot is the refusal a run can hit, and the test covers it,
  with the game's own numbers in the reason.
- **A sale, a buy and a held turn are one input each**, as a burst of fire is: the report's gaps are
  between decisions, not between ticks. A loop of clicks is capped at one a second so a stuck run
  can't flood the log.

### The first runs, and what they found

The findings are written out on their own, for the designer, in
`docs/no-player-runs-findings.md`: what each run showed, what would settle it, and where the bot
is too dumb to be evidence. The short of it is below.

Seed 1, shipped world, six game hours asked for (`npm run bot -- floater 6 1`):

```
0:00  new game, floater, 0 cr
0:00  step 1: bay
0:03  heading home: the hold is full, 10 ore aboard
0:12  docked at Station, sold 10 ore for 100 cr, 96 in hand
0:18  heading home: the hold is full, 10 ore aboard
0:25  docked at Station, sold 10 ore for 100 cr, 172 in hand
0:28  heading home: the hold is full, 10 ore aboard
0:40  stuck on step 1, bay: nothing bought and nothing earned for 15 game minutes
      at -10793, -9969, -946 past the edge of Field
      credits 172, 10 ore aboard
      last inputs: move home to Station at -10135, -11358 | ... | ...
Inputs: 1,676 total, median gap 0 s, longest gap 45 s
```

Other seeds of the same build filled the hold and sold four times in twenty minutes (100 credits a
trip, the bay bought at 0:20, 16 ore a trip once it was on), then stalled on the way home. Mining
is fine: a big rock, broken and stripped, gives 10 ore in a minute or two.

**Coming home is the snag.** A click order to a dock that is going round its orbit is a chase: the
ship arrives where the dock was, the dock has moved on, and the order is given again. In some runs
it closes and docks in seconds; in others it stalls a few thousand units short and the run ends
stuck with a full hold. The vision says the trip home is effortless for a floater; at step 1 it
isn't, and the thing that fixes it — the autopilot — is the last step of the journey, priced at
800 credits that this loop can only earn by docking. That is the first thing the no-player run
found, and it is a designer's question, not the bot's: it is not worked around here.

Two more, smaller: a floater without a turret spends most of its time turning its hull on to the
next rock (the plan's step 2 is the fix, and the log's input gaps show the cost before it), and a
click order that has arrived settles on its spot for a long while, tumbling as it trims the last
of its speed, so the bot clicks the ship to stop before it turns by hand.
