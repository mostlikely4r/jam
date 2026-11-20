# No-player runs: what the first ones found

*2026-11-20, written the day the bot (`docs/no-player-runs-plan.md`) first played. These are
observations from runs, not decisions: each finding is a question, and the end of each one says
what would settle it. Everything marked *proposal* is mine; nothing here is marked *decided*
because nothing has been.*

## What was run

`npm run bot -- floater <hours> <seed>`, mostly an hour of game time on seed 1, with shorter runs
and other seeds in between. The bot plays a new game of the shipped world in the floater: it works
the first step of its journey it hasn't got, mines in between, docks, sells, buys, and logs every
input and every refusal. A run is reproducible: same seed and same build, same log, line for line.

Read the log line by line first, then the report's per-hour numbers at the end of it.

**Where the bot is dumb, so that a finding isn't one.** It fires only from a near standstill and
never leads a shot far out; it never flees or fights; it flies by click orders, with the turn keys
only for pointing the nose (it does not fly by the thrusters); it gives up on ore that drifts away
from it; it clicks no more than once a second. Nothing it does is more than a player's hands can
do: `BOT_CALLS` lists the whole surface and a test pins it.

## 1. Coming home is the hard part, and the autopilot is the last step

**Seen.** The bot's own hour, the build as committed:

```
0:03  heading home: the hold is full, 10 ore aboard
0:12  docked at Station, sold 10 ore for 100 cr, 96 in hand
0:18  heading home: the hold is full, 10 ore aboard
0:25  docked at Station, sold 10 ore for 100 cr, 172 in hand
0:28  heading home: the hold is full, 10 ore aboard
0:40  stuck on step 1, bay: nothing bought and nothing earned for 15 game minutes
      at -10793, -9969, 946 past the edge of Field
      credits 172, 10 ore aboard
```

Two good trips and then the run ends a few thousand units short of the dock with a full hold.
Earlier builds of the same loop, differing only in how they flew, got four trips in and bought the
bay (250) at 0:20, 16 ore a trip after that, then stalled on the way home as well. The mining half
is never the problem: a big rock, broken and stripped, is 10 ore in a minute or two.

**Why (proposal).** A dock is a `Poi` going round its orbit, its berth travelling on the order of
50 units a second (52 measured in one run). A click order aims at a point and stops there; the
carry moves the destination along with the station, but the ship's own arrival is still a chase,
and the last leg is slow because the click pilot sets its speed from the length of the trip. The
dock box is 300 units square, so a ship 200 behind the berth has missed it. The order is given
again from where it is, and sometimes the distance stops closing.

**Why it decides the journey.** The vision's line for idle floating is that the trip home is
effortless; the thing that makes it effortless is the autopilot, which chases a place as it moves.
It is step six, at 800 credits, and the credits come from docking. A floater that cannot dock
reliably cannot buy its way out of the problem.

**What would settle it.** A person, twenty minutes, a floater with no autopilot: come home from
the field with a full hold five times. If a hand on the mouse meets the same stall, it is the
game's; if the person docks every time without thinking, the bot is the slow one. If it is the
game's, the shape of the fix is a designer's call: a dock that is easier to hit, a click order that
leads a moving destination, a course that is not the last step, or a berth that stands still.

## 2. A click order that has arrived never quite finishes

**Seen.** With a click order within tens of units of its spot, `clickPilot.task` stays "settling"
for 20 to 40 seconds, the ship tumbling at up to ±1.4 radians a second, the nose swinging through
100° between samples. The order stands for its full while, and nothing else can be said to the
ship meanwhile.

**Why (proposal, not confirmed in the pilot).** `ClickPilot.settle` trims the difference between
the easing velocity it wants and the velocity it has; near the spot the two are comparable and the
direction of the burn flips. `trim` turns the nose to the burn direction on each flip, and with no
spin stabilizer nothing damps the spin, so each flip adds to the last. It trims, and trims, and
never lands.

**What the bot does about it.** Clicks the ship to stop (`orderStop`) as soon as it is in gunnery
range and slow, then turns by hand. That is a workaround around something a player is doing by
hand without knowing why.

**What would settle it.** Fly a floater by clicks to a spot inside a field and watch the last few
units. If it tumbles, the finding is real and the fix is in the pilot (`ClickPilot`/`trim`), not in
the bot.

## 3. A hull with no spin stabilizer cannot hold a facing with a click-turn order

**Seen.** `orderFace(angle)` on the floater: the ship rotates past the angle and keeps going at
36° to 60° a second, and the order is given again each time the target moves a little. A hand on
the turn keys settles it pointing where it was told in about a second.

Not a bug as such — nothing in space damps a spin, and the spin stabilizer is what damps one. The
finding is that the click-turn order is the floater's *designed* way to turn ("flown with the
mouse", says the start screen), and it cannot hold a nose on a rock drifting a few units a second.
Firing on the move is the floater's whole idea.

**What would settle it.** Point a floater at a drifting rock with a right-drag from the ship (hold
a facing) and fire for ten seconds. Options, all a designer's: the click-turn could damp the spin
it creates, the spin stabilizer could come with the hull, or the help could say to drag.

## 4. The computer has no room for the journey's last step

The journey's four programs need four slots. The floater's flight computer runs four, and
click-to-move and click-to-turn take two of them, so targeting and the route planner fill the
computer and the system chart and autopilot have nowhere to run: the bot buys them, they do not
load, and the snag is logged in the game's own numbers, "no free program slot (4 of 4 in use)".

The plan predicted the refusal. This is its shape: **the journey as listed cannot be finished on
the floater's own computer.** The navigation computer that would hold all six is 1,200 credits at
tier 2, and no one specced it as a step.

The targeting plan's loadout table says the same thing from the other side ("core only on its own
4 slots"). It is a real trade-off, and it wants one of two decisions: does the floater's journey
include the navigation computer as a seventh step, or is four slots meant to hold click-to-move,
click-to-turn, targeting and autopilot, with the chart and the route planner as the things a
bigger computer buys?

## 5. Ore drifts faster than a floater without a tractor can fetch it

**Seen.** An early build chased a single piece of ore for about 28 minutes and ended nearly 7,000
units past the field's edge with 2 ore aboard. The bot now fetches only within 250 units, and
gives up on a piece it is not closing on.

For a floater's first ten minutes, ore is something you must fly through, and a piece that drifts
off is lost. That is cheap and probably fine. It does make the tractor (300 credits, step 3) worth
more than its price suggests: it is the difference between fetching and chasing.

## 6. Every new game starts from the same dice

`src/start.json` is put back by `restore()`, which carries `randomState` and `seed` with it. A
warmed start therefore hands every new game — and every bot seed — the same world and the same
rolls: in the first build, seed 1 and seed 2 played the same session, line for line, and ended at
the same coordinate. The bot now starts from a plain `sim.reset(seed)`.

That is worth a decision on its own, apart from the bot: is a new game *meant* to be the same
warmed world every time? If it is, the seed and the "New game" button say more than they do. If it
is not, `loadStart` should let the player's seed through.

## What was not reached

Steps two to six were never bought, so the journey past the bay is unmeasured: no turret, no
tractor, no targeting, no large bay, no programs. Findings 1, 2 and 3 all bite hardest *before*
the turret, which is exactly the window the first hour lives in. Two ways to measure the rest: a
kitted floater from equal footing (the plan's shorter scenarios), or a hand-played hour to see how
much of this a person meets.

## What would settle any of it

- Twenty minutes of a person flying a floater by clicks, saying which of 1 to 3 they meet.
- The same measurements again on a run that reaches the turret, from an equal-footing start.

Nothing here is a decision. Finding 1 decides whether the bot's journey is reachable at all;
finding 4 decides what the last step of that journey should be.

## The dock click, and the settle under it

*2026-12-01, after the build in `docs/dock-click-plan.md`. It answers finding 1 and finding 2, and
says what each other finding came to, so none of them is picked up again as if it still stood.*

### How each finding was judged

- **1, coming home stalls: the game's.** A click order goes to a world spot, and the berth has
  moved by the time the ship gets there: the dock goes round at about 50 units a second. A click
  on a dock now follows it (`Sim.orderDock`), and the order ends inside the box.
- **2, an arrived order never finishes: the game's.** `ClickPilot.settle` eased onto the spot and
  turned the nose for every flicker of the correction it wanted; with nothing on the hull to damp
  a spin, a floater tumbled over the last few units and the order stood for its full while. The
  settle now flies the arrival instead: see "the settle" below.
- **3, click-turn can't hold a facing: dropped.** The bot re-issued `orderFace` every tick for a
  drifting rock, which restarts the turn. That shows nothing about one order.
- **4, four slots for four programs: the game's, and decided.** The journey's last step is now the
  system chart and the autopilot together, the route planner has left the journey, and the bot
  unloads click-to-turn once the turret aims for it. The four slots hold click-to-move, targeting,
  the chart and the autopilot.
- **5, ore drifts off: dropped.** "Ore keeps the rock's velocity" is the design working; the
  28-minute chase was the bot.
- **6, every new game has the same dice: the game's, but separate.** Still open, and still its own
  decision.

### The chase check, before and after

`npm run dockchase -- before 20 1` and `npm run dockchase -- after 20 1`: a floater at rest at the
home field's edge nearest the station, hold full, sent home the way a player with no autopilot
would send it — a click to the berth before, a dock order after — from 20 starts spread over one
turn of the station's orbit, five game minutes each at most, with the station's phase moved between
starts by warming a fresh world.

| | docked | median | mean | orders |
| --- | --- | --- | --- | --- |
| before | 17 of 20 | 18.7 s | 18.9 s | 47 |
| after | 20 of 20 | 19.1 s | 19.2 s | 20 |

The three misses before were all the same thing: ten clicks each over five minutes, the distance
to the berth closing and then not closing, and the run over. The after numbers are one order per
start and none missed, which is the click following the berth rather than a spot where it was.

### The settle

A floater ordered 50 units onto a fixed spot now ends in 7 to 8 seconds, with one turn of the nose
(about 200 degrees of it) and a stop 4.6 units off. Before, the same order took 14 to 16 seconds,
swung the nose through 560 to 740 degrees — the same correction made again and again — and stopped
1 unit off. At 300 units it is 12 to 13 seconds against 19 to 21.

The plan asked for a spin under 0.3 radians a second while settling. That isn't reachable for a
hull with no spin stabilizer and no side thrusters: the only way it brakes is to turn the nose
against its motion, and its rotation thrusters make that turn at about 1.5 radians a second. What
the fix does instead is make that one turn count, and accept a stop within 8 units — inside the
ship's own 12-unit radius — rather than turn again for the last few.

### Where a run stalls next

`npm run bot -- floater 2 1`, before and after (the same seed, the shipped world):

- Before: docked twice, then stuck on step 1 at 0:40 with a full hold, 946 units inside the field's
  edge, on the way home. That is finding 1.
- After: docked twice, then stuck on step 1 at 0:25 with no ore and no credits, deep in the field.

The dock half works: of the twenty chase starts, every one docked, and a start needed one order.
What stalls the run is the way home *through the field*. A click on a dock far off is a course, and
a course flies as fast as the trip allows: 257 units a second on a 2,600-unit haul, while the
pilot's route looks 500 units ahead for rocks. That is two seconds of warning, and turning the nose
round takes three. The floater hits rocks at close to 200 a second, and the dock's repairs
take every credit it earned; at 0:25 the hull is at 58 and it is looking for a rock it can't reach.

Before, the bot flew itself home by a *straight* click order and picked a line with no rock on it
by hand. So this is the route's limit, met by asking the pilot to fly the line: **a course needs to
look ahead as far as it takes to stop**, and that is its own finding, not the click's. The plan put
it out of scope (`docs/dock-click-plan.md`, "If the solid box gets hit in the check's runs, that is
a finding for the route").

One more, untouched and pre-existing: a hull with `strafe` and no `reverse` still never finishes a
click order on a fixed spot in open space, because it can only brake to within 9 units and its
landing circle is half a unit. Hulls with side thrusters were to land exactly as they did before,
so it was left as it was.
