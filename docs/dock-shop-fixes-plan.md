# Dock shop fixes plan

Written 2026-11-25, from three inbox notes (I-8, I-10, I-11) the user wrote while trading in the
dock. Three small fixes to the dock shop and ship screen; one commit each. Built 2026-11-25; each
step is marked below as it landed.

## 1. Quick sell from the bay (I-8) *built*

The note: "There should be a quick way to sell items in your bay. Maybe shift or right click?"

Today, in a dock, selling an item takes a click on it and then its "Sell N" button, or a drag
onto the shop (`src/inventory.ts`, `actionsFor` and the drop rules near `inventory.ts:610`).

**Shift + click sells** (proposal; the user offered shift or right click). Right click already
opens a program's tweaks in the same screen (`programHandle`), so shift keeps one meaning per
button. Shift + click on an item in the bay or the locker, docked, sells it at once with
`sim.sellItem`, the same sale the button makes, refusals and all (the message line says why when
it can't). Fitted parts on mounts are left out, so a stray shift-click can't strip the ship
(proposal). The hint line at the top of the screen (`inventory.ts:190`) and the item's tooltip
get "Shift click sells it".

**Check:** a test through the inventory's handler, or the sim call it makes, that a shift-click
on a bay item while docked sells it and pays; undocked, nothing happens.

**Built:** shift click sells, mounts are left out, and the hint line and the item's tooltip say so.
The Sell button and the shift click now make the same call (`Inventory.sellAt`), so both say the
station's own reason when a sale is turned down. The test is at the sim call: docked it sells and
pays, out in space it is refused and the item stays (`items.test.ts`).

## 2. Programs don't wait on the station's parts (I-10) *built*

The note: "Programs should not cost the station parts. Selling modules should return the
station parts?"

Buying a program doesn't spend the station's parts: `Sim.buyPart` charges it with
`chargeCredits` (`sim.ts:4444`). But the shop line does check them: `saleLine` in `src/main.ts`
(`main.ts:613`) asks `sim.hasPartsFor(price)` for a program, so a station low on parts A shows
programs as "[out of parts]" and greys them out.

**Fix:** `saleLine` treats a program as always supplied (the station's parts don't come into it).
The drone line, which really does spend parts (`chargeForService`), keeps the check.

**Built:** `canSupplyLine` in `src/shop.ts` says what a line needs, and `saleLine` asks it: a
program is always supplied, a part comes from the store, a service (the drone) from the station's
parts. Buying a program never spent parts (`Sim.buyPart`), so this was the shop line's side only.
Tests: the pure rule (`shop.test.ts`) and a station with no parts A that sells a program and turns
down a drone (`fitting.test.ts`).

**Selling modules back already returns parts** (answer to the note's question, no change): a
working module goes into the station's store whole, ready to sell again; a damaged one is broken
down and its worth goes back into the station's parts A (`Sim.takeBack`, `sim.ts:3970`). The
pricing plan (`docs/pricing-plan.md`, Q-23) changes what the station pays, not this.

**Check:** a test that with a station's parts A at 0 the program's shop line is enabled for a
buyer with the credits, and the drone's isn't.

## 3. Your credits at the top of the shop (I-11) *built*

The note: "Player credits should be shown at the top of the station shop screen. Session credits
can be removed there."

Read as (proposal, check with the user): "Sesion" is "Station". The shop's heading today is
`Dock shop - station N credits - <hauler>` (`main.ts:837`): the station's money, not yours.

**Fix:** the heading becomes `Dock shop - your credits N - <hauler>`. The station's credits leave
the heading (check whether a debug line still shows them; if none does, add one to the tab
menu's debug lines in `main.ts`, so the number isn't lost for testing). The deposit and pirate shops' headings
(`main.ts:742`, `758`) get the same "your credits" so the three read alike.

**Check:** by eye; the heading's text changes when you buy something.

**Built:** all three headings read `your credits`, and so do the deposit's and the pirate base's.
The station's balance stays in the tab menu's debug lines (`<base> balance <credits>`), so no line
was added.

## How we'll know

- The checks above, `npm test` and `npm run build`.
- **Try it:** dock with a part in your bay. Shift-click it: it's sold and the heading's credits go
  up. At a station with no parts A in store (the drone line reads
"[out of parts]"), programs are still for sale.

## Needs first

Nothing.

## Built 2026-11-25

All three fixes, one commit each, from the plan above. Nothing came up in the review. The suite
passes (884 tests) and the build is clean; the only `npm test` complaint was vitest's own
`onTaskUpdate` worker timeout, with every test green.

## Not in this build

- Selling several at once (a whole stack of ore, every item of a kind): later, if one at a time
  is still slow.
- Prices themselves: `docs/pricing-plan.md`.
