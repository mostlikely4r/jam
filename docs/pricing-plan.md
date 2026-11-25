# Pricing plan

Written 2026-11-25, right after hull buying (`docs/hull-buying-plan.md`) was built. Nothing here is
built yet.

## Why

The user asked, looking at the new hull shop, whether a hull's price covers its parts, what a
rebuild costs, and whether selling to a station should pay less than buying. The answers showed
there is no single idea of price in the game:

- A hull costs one number (`hullInfo.price`, else the tuning's `rebuildCost`, 300), which never
  adds up the parts it comes with. A floater's own parts sell for over 1,000 credits.
- A station pays back the full price of whatever it's sold: a working part at 100%, damaged 50%,
  destroyed 0 (`Sim.moduleValue`), a program at 100%, a hull trade-in at 100%.
- Prices are worked out in about 60 places in `src/sim.ts` and about 18 more in `src/main.ts`,
  `src/inventory.ts`, `src/pilot.ts` and `src/bot/bot.ts`, each with its own formula.

The result is a money loop, measured in this thread with a throwaway test (1,000 credits became
3,250 in three rounds): buy a floater for your racer (an even swap), move its gun and computer to
the locker, trade the floater back for a racer (the trade-in doesn't notice they're gone), sell the
gun and computer. Dying does the same more slowly: a 300 rebuild hands you parts worth more.

## The picture

Items marked *decided* are the user's calls; the rest is my proposal, open to veto. The premises
are the user's own look at the shop and the measured loop above. The 60% share is a starting
guess (*decided* as a start), which is why it is a slider.

**Worth and price**

- **One price function** (*decided*): `price(seller, buyer, item, amount)`, where every trade in
  the game gets its number. Screens call it to show a number; the code doing the trade moves the
  credits, as today.
- **Worth is separate from price** (proposal): `worth(item)` is an item's own number. `price`
  starts from worth, applies a contract between the two sides if one covers the item, and
  otherwise the default rule.
- **The item is the thing, not just its id** (proposal): a module carries its wear, so the damage
  rule (working full, damaged half, destroyed nothing) lives in `price`, not in each caller.
- **A hull's worth is its frame plus its parts** (*decided*): the price set in the hull designer
  is the bare frame, and a hull's worth adds the worth of every part it comes with
  (`hullDefaults`). A hull with no price set uses `rebuildCost` as its frame.

**The default rule** (*decided*: generic, for ore, parts, modules, hulls and programs alike)

- A station sells at 100% of worth.
- A station buys at a share of worth: **60%** to start (*decided*), a tuning slider. A damaged
  module gets half of that, a destroyed one nothing.
- Moving things between your ship, bay and locker is free; only a sale to the station takes the
  cut.

**Contracts** (*decided*: named exceptions where a trade deviates from the default)

A contract names a seller side, a buyer side, the items it covers, and terms: a share of worth or
a flat price per item. Sides are the parties that trade today: a ship (the player or an AI, paying
from `accountOf`), a station, a station's hauler, a deposit, the pirate base. Contracts live in
code for now, built from the tuning so today's sliders keep working.

| Contract | Seller → buyer | Items | Terms | Comes from |
|---|---|---|---|---|
| Standing ore contract (*decided*) | any ship → station | ore (`isOreItem`), sold at the dock or cut at the refinery pad | 100% of worth | keeps mining income where it is |
| Hauler buys ore | station → hauler | ore | worth × `haulerMarkup` | today's hauler sale |
| Station buys from its hauler | hauler → station | what the hauler brings (parts A) | 100% of worth | today's hauler unload |
| Deposit buys ore | any ship → deposit | ore | flat `depositPays` | today's deposit |
| Deposit sells ore | deposit → any ship | ore | flat `depositSells` | today's deposit |
| Black market | any ship → pirate base | ore | worth × `blackMarketShare` | today's pirate base |

**What follows from the rules** (proposals, open to veto)

- **Hull trade-in**: 60% of the old hull's frame plus its own parts still on their own mounts,
  each at its wear. The old hull's own gear still goes with it (*decided* in the hull buying plan);
  a part of its own that was moved off simply isn't counted. This replaces the hull buying plan's
  "trade-in at the full price", by the user's call for a generic rule.
- **Buying a hull** costs its full worth, frame plus its own parts.
- **Rebuilds** cost a hull's full worth: a plain rebuild the frame plus its own parts; the lost ship
  rebuilt adds the worth of every extra part it had, as today. The same for AI traffic, pirates
  (from the pirate base's credits) and the hulls a station replaces from lost traffic. Dying costs
  more than the flat 300 it costs now.
- **Programs** sell back at 60%, like everything else.
- **AI ships** trade under the same rules: an AI swapping a part gets 60% for the old one.
- **Services** keep their own numbers: repairs, a drone, a locker row, fuel (until the fuel plan's
  step 3), block jobs. A blueprint stays 75% of the part's worth (`BLUEPRINT_SHARE`).

## The build

### 1. One price function, no change in play

- Add `worth(item)` and `price(seller, buyer, item, amount)` to `src/sim.ts`, with the sides and
  contracts above. An item is a module (`{ part, wear }`), a part, item or program id, or a hull
  name. `amount` multiplies, rounded once at the end. A part sold as a set (`part.set`, the turn
  thrusters' pair) is priced per module as today: worth of the set divided by its size.
- A new tuning slider for the station's buy share, **set to 1 in this step**, and a hull's worth
  still just its frame (today's `hullPrice`). Every contract in the table goes in now.
- Route every price site through it: `partPrice`, `moduleValue`, `hullPrice` and the blueprint
  price become thin wrappers or go; the shop sale (`supply`), the take-back (`takeBack`),
  `sellPart`, `sellItem`, the dock's ore sale (`oreSale`), the refinery pad, the hauler's buying
  and unloading, the deposit's buy and sell, the black market, the rebuild offers and charges,
  the lost-traffic rebuild, the news reports' prices, the dock repair's replacement cost, and the
  callers in `src/main.ts`, `src/inventory.ts`, `src/pilot.ts` and `src/bot/bot.ts`.
- Write the check first: a test that records today's numbers (every part's and program's price,
  `moduleValue` at wear 0, 0.6 and 1, every hull's price, the hauler's ore price, the deposit's
  two, the black market's, every blueprint price) and asserts `price` gives the same.

Stop here for a check: the whole suite passes with no test's numbers edited. Nothing changes in
play, so there is nothing to try.

### 2. The new rules

- The buy share goes to 0.6.
- A hull's worth becomes frame plus its own parts. The hull shop, the trade-in (`planHull`,
  `HullPlan.tradeIn`), the rebuilds and the pod panel's texts follow.
- Programs, hulls and parts sold back pay the share. The shop's and inventory's "Sell N" labels
  and tooltips read from `price`, so they follow.
- Update the tests whose numbers change, each to the new rule.

Then stop for the user to try.

## How we'll know

- Step 1: the recorded-numbers test passes, and so does the whole suite, unedited.
- Step 2 tests: a working part sells for 60% of its worth, damaged 30%, destroyed nothing; a
  program sells back at 60%; ore sells at full worth at the dock and the refinery pad; the
  hauler's, deposit's and black market's numbers are unchanged; a hull's worth is its frame plus
  its own parts; a trade-in is 60% of the frame plus its own parts still on it; a rebuild costs the
  hull's worth (plus extras when the lost ship is rebuilt); an AI selling a part gets 60%.
- The loop from this thread, as a test: buy a floater, move its gun and computer to the locker,
  trade back for a racer, sell both. Credits end lower than they started.
- The free bay, as a test (found by the user trying hull buying): with a large bay fitted, buy
  hulls back and forth and sell each small bay a new hull pushes off. Credits end lower than they
  started, because each new hull's price included its small bay.
- `npm test` and `npm run build` pass. Run `npm run parity` in the background: the economy shifts
  (dearer rebuilds, stations keeping 40% on what they buy back), and its log says how much.
- **Try it:** start a racer, dock, open the shop. Hover a part you own: its sell value is 60% of
  what the shop asks. Open Ship and locker, sell a Gun 2 from the locker: 150 credits for a 250
  part. Sell ore: the same as before. Put a hull on a station's list (world designer, Sells group,
  then `npm run world`) and look at its price in the Hulls category: frame plus parts. Crash: the
  rebuild offer costs the racer's frame plus its parts.

## Needs first

- Hull buying, `docs/hull-buying-plan.md`: built (commit fb1a838). `Sim.planHull` and
  `Sim.buyHull` exist and step 2 changes their trade-in.

## Not in this build

- Frame prices. No hull has one set, so every hull's frame falls back to `rebuildCost` (300),
  which was meant to be the whole ship; a bare racer will cost about 1,400 (a 300 frame and 1,070
  of parts). Setting frame prices (and maybe lowering `rebuildCost`) is a tuning pass in the hull
  designer.
- Contracts as data: editable per station, or made by players or AI.
- A station paying more for an ore it's short of.
- Fuel as a contract: with the fuel plan's supply chain (`docs/fuel-plan.md`, step 3, Q-7).
- Block jobs, repairs, drones and locker rows as contracts: they pay for a service, not an item.
- Trading between ships.

## Not doing

- A flat fee instead of a share: it would take most of a cheap part's worth and nothing of a dear
  one's.
- Raising ore worth so 60% lands on today's price: the standing ore contract (*decided*) keeps ore
  prices as they are.
