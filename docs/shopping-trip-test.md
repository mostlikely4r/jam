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

### 3. News on a board

Each base keeps a board of reports: which base sells what, at what price, and when that was
seen. A ship that docks hands over the reports it carries that are newer than the board's, and
takes the board's newer ones. Reports older than a set age drop off. With trip records this is
one more thing done at the dock stop, so it costs nothing out of view.

The player sees the board in the dock shop: *"All-round tractor at Planet base, 1,200, seen 40 min
ago."* A traffic ship arriving with fresh news can also say it on the radio.

For the test, traffic carries news but doesn't act on it. AI shoppers are step 4 or later.

**Play it here.** The user starts a new game, hears about the tractor, and decides whether to go.

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
