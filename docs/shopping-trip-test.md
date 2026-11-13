# Shopping trip test

Written 2026-11-12 after a brainstorm on how goods flow through the world. This is the
smallest build that tells us whether the picture below is worth building out. Nothing here is
built yet.

## The picture we're testing

What came out of the brainstorm. Items marked *decided* are the user's calls; the rest is
direction, open to change.

- **Three steps.** Ore (some rare, some everywhere) → materials (ingots, chips, crystals) →
  products (plates, gun 1, tractor 3, cloak).
- **Rarity has two sources.** Rare inputs come from geography: some ore only exists in a few
  places. Rare knowledge comes from blueprints: every station can make plates, some can make
  gun 1, only one can make the cloak. Materials are the common bulk trade; rare products are the
  long journeys.
- **Prices are set by place.** Things are cheap where they're made and dearer the further they
  are hauled, because every hauler takes a margin. The gap between two shops is a hauling job.
- **News travels with ships and expires** (*decided*). There's no live global search. Reports
  of prices arrive with traffic and get older with distance.
- **Bargains last hours** (*decided*). News from a star 25 min away is already 25 min old, and
  the trip takes another 25 min, so a deal must outlast a few trip times. How fast prices fall
  follows from trip times; it isn't a separate setting.
- **Buyers only buy what pays back for them.** Rich ships pay for time, poor ships pay with
  time. Goods only move toward demand, so an item nobody will pay for far away is simply missing
  there, not lost.
- **Shops lower prices by days of stock** (stock ÷ recent sales), in small steps, with floors
  at cost and at what a hauler would pay to take the item elsewhere. A shop sells below cost only
  to clear an item it has stopped ordering. The interesting part is a shop learning what to order.
- **Blueprints are counted things with a holder** (station, ship, or loose wreckage). They can
  be looted, sold on by pirates, and lost. Losing one is an event, never a silent cleanup. The
  start is hand-placed; rules move blueprints from there. A government sells them, so blueprint
  money goes somewhere instead of leaving the game.

## The question

The user's best memories from EVE, X4 and Star Wars Galaxies: you know one far shop sells the
thing you want, cheaper than next door, so a simple shopping run becomes a journey.

**Does that work here?** Specifically: does hearing that a far base sells something make the
player want to go, and does the trip feel like an adventure rather than a chore?

**It fails if** the user hears about the item and doesn't care, or goes once and finds the trip
empty and long. If it fails, the price-by-place economy is not worth its cost, and bases should
differ some other way.

## The build

Four steps. Each is played before the next starts. Step 4 only happens if steps 1 to 3 pass.

### 1. Blueprints belong to a base

Today blueprints are one set for the whole game, held by the first base. Move them onto
`Base`, so each base knows its own. In the designer, a station gets a list of blueprints it
starts with.

One blueprint is held, not sold: no government sells it, so the only way to get the item is
from the base that knows it. That's the first counted blueprint. Loot, loss and the government
come later.

**Pick the item for its effect on play.** The user's choice (2026-11-12): split the tractor beam
in two.

- **Tractor beam (home, sold as today):** half today's range, and it only catches loose ore in
  a 30° cone ahead of the ship. Once caught, an ore stays caught and is pulled in wherever it
  drifts. That's new: today the beam pulls every loose ore in range, all round, every tick. Now
  you aim to catch.
- **The far base's item:** today's beam, catching all round, at the same halved range. It's an upgrade you can feel
  straight away: you stop aiming.

So the home tractor gets weaker for everyone. That fits on its own: the range needed halving
anyway, as it was nearly overpowered. Traffic floaters buy the tractor first, so their mining
changes too. The cone beam is built (b92d424). The user flew it: still strong for their
stop-and-shoot style, but no longer a magic hover. Good for now, tune later.

**Who it's for (user, 2026-11-12): the racer.** The all-round beam is the rare item a racer
wants early. Today the tractor fits only the floater, so the all-round one must fit the racer.
It's half of a set, **spray and swoop**: a spray gun breaks rocks into a cloud, and the racer
sweeps through with the all-round beam. One piece of the set is close and found by luck; the
other is the big trip that completes it.

For the test, only the far piece is built: the all-round beam for the racer at the far base.
The spray gun is a new weapon with its own design, and "found by luck" needs a way for luck to
put an item somewhere nearby (loot, or stock that came by hauler). Both come after the trip has
been tried.

### 2. A second base, far away

Add a base to the shipped layout at a different body, about 5 to 10 minutes' flight from the
first. Today everything orbits the moon, so the planet is the natural spot. It holds the
all-round tractor's blueprint; the home base doesn't.

The trip there has to be worth looking at. Going round the planet's pull already is. Nothing
else is added for the test.

**Built 2026-11-12** by the first layout recipe (`npm run layout -- far-base --ship`):
"Planet base" orbits the planet at 50,000, with a shipyard, holding the all-round tractor.
From the home station, by the route planner: a racer burning and braking flat out 30 to 50 s,
a floater 1 to 2 min, traffic at cruise speed 4 to 11 min. A player flies somewhere in between.
That's shorter than the 5 to 10 minutes first planned, as the plan's own scale makes moon to
planet a short hop; the long trips come with other planets and stars.

### 3. News on a board

Each base keeps a board of reports: which base sells what, at what price, and when that was
seen. A ship that docks hands over the reports it carries that are newer than the board's, and
takes the board's newer ones. Reports older than a set age drop off. With trip records this is
one more thing done at the dock stop, so it costs nothing out of view.

The player sees the board in the dock shop: *"All-round tractor at Planet base, 1,200, seen 40 min
ago."* A traffic ship arriving with fresh news can also say it on the radio.

For the test, traffic carries news but doesn't act on it. AI shoppers are step 4 or later.

**Built 2026-11-12/13.** Reports are base, item, price and when seen; a ship and a board swap
once per stay, keeping the newest per item, and drop anything older than `newsLife` (2 h). A
base posts its own held items. Pirates and defenders stay out of it.

Carriers: at first no AI ship ever docked at Planet base: all traffic started at home and the
planet field (8 min away against 1 to 2) only got picked by the 2% wander roll. Now the recipe
lays Planet base out like home, round its own "Planet field", and **every base starts with its
own traffic** (the same racer and floater count as home). Measured with `npm run news -- 240
<seed>` (4 game hours, no player): home first hears of the tractor after 24 to 39 min and has
live word of it about 82% of the time. Seen on the way: Planet base's traffic drifts to the
moon fields within half an hour and mostly stays there (from home, the moon fields are
cheapest), so Planet base is quiet most of the time. Fine for the test; where traffic comes
from and how it flows is its own question (see the expansion idea in the memory notes).

**Hearing it, and a base that stays busy (2026-11-13).** A traffic ship that docks with word
the board didn't have says it on the radio (*"Word from Planet base: they sell an all-round
tractor, 600 credits."*) and the station posts it. When the player docks where the board has
word they hadn't heard, the station tells them. Traffic now belongs to the base it started at
and, after selling at another base, goes back to the field by its own (unless the wander roll
sends it elsewhere). Planet base keeps its traffic: 43 to 47 stays in 4 hours instead of 8 to
20, and home still has live word of the tractor 79 to 90% of the time.

**Warm start (2026-11-13).** A fresh world had nothing on its boards for its first half hour,
so a new game now begins in a world that has already run for an hour: traffic on its way,
home's board already carrying word of the tractor (44 min old at the start). Running that hour
takes 5 to 60 s (fights out of view wake a field now and then, and an awake field costs the
normal step), too slow for New Game, so it runs ahead of time: `npm run warm -- 60 1 --ship`,
or "Warm up a start for new games" in the designer. It writes src/start.json (600 KB, 200 KB
zipped); New Game loads it and makes the player's ship anew. It only fits the layout it was
made in, and a test fails when the shipped world has moved on without it. Every new game
starts in the same warmed world for now.

**Play it here.** The user starts a new game, hears about the tractor, and decides whether to go.

**Verdict (user, 2026-11-13): passed, as two separate halves.** The trip itself was flown and
felt as expected for a two-base game. Hearing about it first wasn't part of that play, but the
user trusts the news half without flying it. Step 4 is unblocked, and its per-item stock is the
same foundation as a refined inventory, so the two are planned together.

### 4. The price gap (only if 1 to 3 pass)

The home base sells the all-round tractor too, but only stock that someone hauled from the planet base,
at a higher price. This needs stock per item at each base, not today's single parts count. Then
come shops lowering prices by days of stock, and traffic using the board to shop.

## Not in this test

Ore types, materials, the government and blueprint loss, markdowns, rare ore from geography,
visible production, other races. Each is a later step on the same picture, once the trip is
known to be fun.

## What could grow out of scope

- **The board's interface.** Keep it a plain list in the dock shop. No chart overlay or search.
- **Per-item stock (step 4).** It touches the shop, the hauler and the save format. That's
  why it waits until the trip has proven itself.
