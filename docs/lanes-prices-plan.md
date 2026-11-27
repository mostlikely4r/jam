# Lanes and prices plan (spec C)

Written 2026-11-27, from a product talk with the user (roadmap steps 6–8, `docs/roadmap.md`).
Nothing here is built yet. Items marked *decided* are the user's calls; the rest is proposal, open
to veto. The words (frame, mount, part, capability, owner, account) are in `docs/framework.md`.
This plan sits on spec A (`docs/station-frames-plan.md`, Q-51), spec B1
(`docs/recipes-factories-plan.md`, Q-52 and Q-53) and the pricing plan (`docs/pricing-plan.md`,
Q-23). It replaces B1's stand-in hauler route, which was written as temporary for this spec.

## Why

After B1, goods are really made and really short, but they move along a stand-in: each base has
one hauler that arrives every `haulerInterval` from its nearest supplier, carrying whatever the
base asks for, at today's fixed prices. Nothing decides where goods *should* go, and a shortage
says nothing to anyone. The ammo plan (`docs/ammo-plan.md`) and fuel step 3
(`docs/fuel-plan.md`) make shortages cost a station its miners. That only means something if
supply answers shortages, and can fail to.

Spec C gives the flow a market. Lanes are drawn by hand, haulers run them on their own account,
prices rise where stock is short, and traders chase the gaps. Then it makes the flow watchable:
lines on the dev map and a long run that logs it.

Premises: the shape is the user's own design (the roadmap talk and this one). The numbers are
guesses: how far prices swing, the spread, a hauler's starting credits, and the default lanes.
That's why slice 1 stops for the user to watch the network run before traders and the records
are built on it.

## The picture

**Who owns a hauler** (*decided*: on its own account)

- **A hauler is a privateer.** It has its own account (spec A's accounts), buys where goods are
  cheap and sells where they're dear. Prices steer it (*decided*).
- **A hauler that can't make a trade pay waits** (*decided*, for now). It sits docked at its end
  and never trades at a loss, checking again every so often (proposal: 30 s). Nothing vanishes,
  no money comes from nowhere, and an idle hauler at a dock is the sign of a dead lane.

**Lanes** (*decided*: authored in the system designer; lanes plus traders)

- **A lane is two stations and a number of haulers** (*decided*: "C", lanes keep their own
  haulers). The user draws it in the system designer and sets the count. Proposal: a new world
  node kind `lane` in `src/designer/world.json` with `from`, `to` (station node ids) and `haulers`,
  drawn on the designer's map as a line between the two, edited on its own page like other nodes.
- **A lane's haulers shuttle between its two ends and never leave it** (*decided*). At each end
  they choose *what* to carry by margin (below).
- **Default lanes** (proposal, designer configuration; the user changes them in the designer):
  - home Station ↔ Planet base, 1 hauler: ore out, parts and ammo back;
  - home Station ↔ moon port, 1 hauler: fuel and blueprints;
  - Planet base ↔ moon port, 1 hauler;
  - Ringside ↔ Planet base, 1 hauler.
- **A lane hauler that's lost** (wrecked by pirates) is replaced after a while (proposal:
  `laneRespawn`, 600 s) with fresh starting credits (proposal: 2,000), money from outside the world,
  booked like other outside money. Who pays for a new hauler belongs to the privateer direction
  below.

**How a lane hauler trades** (proposal for the rule; *decided*: it knows its two ends live)

- **It knows both its ends' prices live** (*decided*): it's the backbone, so it never runs on
  stale news.
- **At an end:** it sells what it carries to this end where the price beats what it paid. Then
  it buys, from this end, the goods that sell for more at the other end, best margin per bay cell
  first, until the bay is full or its credits run down to a reserve (proposal: enough for a tank
  of fuel and one restock of ammo). Then it flies.
- **No margin either way:** it waits (*decided*).
- **Its own fuel and ammo:** lane haulers fly with tanks and refuel at their ends like any ship.
  This is where the fuel plan's "the hauler's own tank" lands.
- **Blueprints on order** (B1's funding flow, unchanged up to the order): a funded blueprint
  becomes a want at the station, at the hole's price plus a delivery fee (proposal: 20%). A lane
  hauler with an end at a hole buys it there and delivers it, paid by the station. If no lane
  reaches a hole, a trader can bring it by news.

**Traders** (*decided*: "C", traffic now, dedicated traders later)

- **Today's traffic miners trade when it pays better** (*decided*). Today's trade run
  (`chooseTrade` and `trade` in `src/pilot.ts`, rolled by `tradeChance`, buying ore at a deposit
  or the pirate base) becomes a choice by earnings (proposal): at a dock, a miner compares what
  mining earns it (its own average credits per minute over its last few loads) with the best trade
  it knows of (margin × bay room ÷ trip time, from news). It trades when that's better by a margin
  (proposal: 20%), and decides again at its next dock. A trading boom means fewer miners on the
  rocks, and that shows.
- **Any station, deposit or the pirate base can be a source or a buyer** for a trade, by price.
- **Dedicated trader ships** arrive later with Q-19's AI hulls and spawn points (*decided*), not
  in this build.

**What traders know** (*decided*: by news)

- **Traders steer by news** (*decided*), today's `Report`s that ships and station boards swap at
  every dock and drop after `newsLife`. A trader may race to a shortage and find it already filled.
- **Boards post goods prices** (proposal): at every dock swap a station's board adds a report for
  each good it trades, its sell price and its buy price (a `buys` field next to `price` on
  `Report`), seen now. Today a board only posts the modules nobody else sells.
- **The player reads the same news** in the dock, as they do today (proposal). Nothing new to
  learn: a fresh report is simply worth more.

**Prices from stock** (*decided*: goods now, modules later from their inputs)

- **On Q-23's one price function** (`price(seller, buyer, item, amount)` and `worth(item)`,
  `docs/pricing-plan.md`). Spec C adds stock to it for goods and changes nothing else in it.
- **Goods float** (*decided*): ore, parts, fuel, ammo and blocks (items of type `ore`, `part`,
  `ammo`, and the block). Modules, hulls and programs keep Q-23's flat rule.
- **Modules follow later** (*decided*): once factories make them from goods, a module's price comes
  from what its inputs cost. Not in this build.
- **The swing** (proposal, tuning): a station's quote for a good is its worth × a factor of its
  stock against its target (B1's targets, the station's wants):
  - at target, 1×; empty, 2×; at twice the target or more, 0.5×;
  - straight lines between those points.
- **The spread** (proposal): a station sells a good at its quote and buys at its quote ×
  `goodsBuyShare` (proposal: 0.9). Haulers earn between stations whose stocks differ, not at one
  station. Q-23's 60% buy-back stays for used modules, hulls and programs.
- **A station buys only what it wants:** a good it has no target for, it doesn't buy.
- **Holes stay fixed** (B1, *decided*): a hole trades anything at its worth, never floating.
- **Ore from miners** (proposal): Q-23's standing ore contract becomes "the station's ore quote",
  paid in full (no spread), so mining income follows the station's need.
- **Miners pick where to sell ore** (proposal): leaving a field with a full bay, a miner sells
  where its news says ore pays best, minus the trip, within a safe fuel range, with its home
  counted a little higher (proposal: 10%). Today it sells at the nearest station.
- **The pirate base and deposits** keep their prices (`depositPays`, `depositSells`,
  `blackMarketShare`) as Q-23's contracts.

**Out of view** (proposal, from the simulation levels design)

- **A lane hauler's trip is a trip record** (`TripRecord` in `src/sim.ts`, a new goal `lane`):
  it departs, arrives by route time, and trades at arrival against the end's real storage and
  prices. A trader's trade is the existing `trade` record, now with prices.

**Watching it** (roadmap step 8)

- **The dev map** (`src/chart.ts` with `?dev`) draws each lane as a line between its stations,
  thicker by goods moved in the last hour, with a dot for each hauler on it and a mark on an idle
  one. B1's station cards add each good's quote.
- **A no-player flow log** (background only, never gates done): a new `src/profile/flow.ts` runs
  hours of game time and logs per station, per hour, its stocks and quotes, miners moved in and
  out, trades made and hauler waits, to `docs/parity-log.md`. Starving is measured, never a
  failure (*decided*, roadmap).
- **A warm start** (roadmap open end): the warm-up that already makes `src/start.json` (`npm run
  warm`, the designer's "Warm up a start" button, `npm run world`) runs long enough that every lane
  has made a round trip, so a new game starts with stocks and haulers in motion.

**Must not rule out: going broke and getting bought** (*decided* direction, not built)

The user's direction is a privateer system: every actor has its own account, and an actor that
goes broke gets bought. A station buys a broke hauler, a station buys another broke station, a
planet buys a station and later auctions it to a new actor. Parked as S-87. This build must leave
it open: **a hauler's owner and a station's owner are data that can change hands**, never fixed
when the entity is made, and a lane counts haulers without owning them.

## The build

Two slices, every step committed on its own.

### Slice 1: prices, lanes, lane haulers

**1. Prices from stock.** In Q-23's `price`: the goods quote, the spread, holes fixed, a station
not buying what it doesn't want, ore from miners at the quote. The dock and shop show the quotes.
B1's station dev cards add each good's quote. Tuning lines (tab menu): the three swing points and
`goodsBuyShare`. Today's hauler contracts (`haulerMarkup`, "station buys from its hauler") stay
until step 3 removes the stand-in.

**2. Lanes in the designer.** The `lane` node in `src/designer/world.ts` and `world.json` (with
`npm run world` after), its page and its line on the designer's map (`src/designer/designer.ts`),
passed to the game through the layout (`src/designer/link.ts`). Add the default lanes. The dev map
draws lane lines.

**3. Lane haulers.** A lane spawns its count of haulers at its `from` end, each with its own
account and starting credits, flown in view like traffic (proposal: a `LanePilot` in
`src/pilot.ts`, on the hauler's current hull and berth). They trade as under **How a lane hauler
trades**, refuel and restock ammo like anyone, wait when nothing pays, and are replaced after
`laneRespawn` when lost. Blueprint orders become wants that lane haulers fill. Remove B1's stand-in
route (supplier by capability, the per-base hauler every `haulerInterval`) and the hauler
contracts it used. Fuel step 3 and the ammo plan, if built by then, keep working: their "the
hauler brings it" tests now run over a lane. The dev map shows hauler dots and idle marks.

**Stop here for the user to try.** Watch the network for a while on the dev map. Do goods reach
the home Station? Does a hauler idle where it should, and do the quotes read? The swing, the
spread, the starting credits and the default lanes get tuned here, before traders lean on them.

### Slice 2: traders, out of view, the log

**4. Traders and news prices.** Boards post goods prices (`Report.buys`). Traffic chooses mining or
trading by earnings, and trades between any two sources and buyers by news, replacing the
`tradeChance` roll. Miners choose where to sell ore. Radio chatter for a trade run is optional
(proposal: none in this build).

**5. Out of view.** The `lane` trip record. Trade records with prices. `src/farside.ts` gets the
lane hauler and its trade (in view: flown; out: records), and the test that guards that table
passes.

**6. Watching.** The flow log (`src/profile/flow.ts`), the lane line thickness by goods moved, and
the warm start made long enough for a round trip on every lane.

### Saves

One more `SAVE_VERSION` than whatever it is when this is built (B1 13, the ammo plan 14, fuel
step 3 one more), in step 3: lane haulers as ships with their accounts, their lane and their
waiting state. In step 4: reports' `buys`. Lanes live in `world.json`, not the save. An older
save: the stand-in hauler is dropped, and the lanes spawn their haulers fresh.

## How we'll know

- **Unit tests** (new, `src/lanes.test.ts` and `src/prices.test.ts` unless suites fit better):
  - Quotes: at target 1× worth, empty 2×, at twice the target 0.5×, straight between. The station
    buys at the quote × `goodsBuyShare` and doesn't buy what it has no target for. A hole's price
    never moves. Modules keep Q-23's flat rule.
  - A miner selling ore gets the station's ore quote.
  - A lane hauler at an end sells what pays, buys the best margin per cell first, keeps its
    reserve, and waits when nothing pays, without trading at a loss. It refuels at its ends.
  - A wrecked lane hauler is replaced after `laneRespawn` with fresh credits.
  - A funded blueprint is fetched from the hole by a lane hauler and paid for by the station.
  - A trader picks trading over mining only when a known trade pays better by the margin, steers
    by news (a stale report can send it to a filled shortage), and decides again at its next dock.
  - Out of view: a lane record arrives by route time and trades against real storage.
  - Owners: giving a hauler or a station a new owner mid-game leaves it working, trading from the
    new owner's account (the must-not-rule-out, guarded by a test).
- **Existing suites:** `stations.test.ts`, `shop.test.ts`, `sim.test.ts`, `farside.test.ts`,
  `records.test.ts`, `pilot.test.ts`, `save.test.ts`, `designer/world.test.ts` and the B1, fuel
  and ammo suites pass. They change only where they read the stand-in route or a fixed goods price.
- **The flow log** (background): a few hours with no player, logged per hour. A station starving
  is measured, never a failure.
- Full check: `npm test`, then `npm run build`.

**Try it (slice 1):** `npm run dev` with `?dev`, open the chart (C). The four lanes show as lines,
with a hauler dot moving on each. Dock at the home Station: the shop's goods show prices, and part
A costs more when the station's card shows its bar low. In the system designer, turn Planet base's
ore factory off and speed up time: part A's quote climbs at the Station, and the Station–Planet
base hauler ends up idle at Planet base with nothing worth carrying.

**Try it (slice 2):** the same, a while longer. Some miners stop mining and run goods between
stations, chasing the quotes. Read the news in the dock: goods prices from other stations, with
how old they are. Then start `npm run flow` (step 6 adds the script) in the background and read
the hours in `docs/parity-log.md`.

## Needs first

- **Spec A built** (Q-51): owners and accounts, storage, trade points. Queued, not built.
- **Spec B1 built** (Q-52, Q-53): factories, holes, targets, the dev cards, and the stand-in route
  this replaces. Queued, not built.
- **Q-23 built** (`docs/pricing-plan.md`): the one price function, `worth`, contracts. Queued, can
  run now that this spec is written. Step 1 waits for it.
- News (`Report`, boards, `newsLife`), trip records, the warm start and the system designer exist.
- The ammo plan (Q-54, Q-55) and fuel step 3 (Q-7, Q-56) are not needed first. If they're built
  first, step 3 moves their supply onto lanes.

## Not in this build

- **Going broke and getting bought** (S-87): stations buying broke haulers or stations, a planet
  auctioning a station to a new actor. Operations and factions.
- **Dedicated trader ships** on their own hulls and spawn points: Q-19.
- **Module prices from their inputs:** once modules are made from goods in the shop's eyes.
- **A transport AI that draws lanes, and a network that grows:** S-85.
- **Haulers landing on a body** (fuel plan's 2026-11-11 call): if a lane ever ends at a body.
- **The pirate base's real supply** (raids, the black market): S-86.
- **Chatter for trade runs.**

## Not doing

- **No money from nowhere to keep a lane running.** A hauler that can't trade at a profit waits
  (*decided*); only a lost hauler's replacement brings outside money, for now.
- **No live prices for traders.** Traders go by news; only lane haulers know their two ends live
  (*decided*).
- **No floating prices for modules, hulls or programs** in this build (*decided*: goods now).
- **No station-owned haulers.** Haulers trade on their own account (*decided*).
