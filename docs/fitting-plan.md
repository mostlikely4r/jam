# Fitting plan

Written 2026-11-13, after the shopping trip test passed. It refines the inventory before the
ship's upgrades grow by ten times, because more parts on today's system would only make the
shop list longer: every part is an on/off flag, everything bought is fitted, and weight is the
only limit. Nothing here is built yet.

## The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto. The user's
own words on the shape: "don't stick to this exact shape". It's a direction, not a spec.

**Hulls and mounts**

- **Slots, mounts and modules, not lego** (*decided*). A hull has mounts at points on its
  drawn shape. Bigger ships later may be built piece by piece, but in flight they are one main
  hull with at most a few physical attachments, such as a cargo box at the back.
- **Six thruster mounts on each hull, three filled and three empty at the start** (*decided*).
  Each mount has a type or limit. The racer can fit the floater's weak back thruster, but the
  floater can't fit the racer's.
- **One gun mount each** (*decided*). The racer takes both guns but not the turret. The turret
  sits between the gun and the mount, and the floater can take it.
- **A tractor mount**, for the cone or the all-round beam (*decided*).
- **The rule behind the limits** (mine): a mount has a kind (thruster, gun, tractor, computer,
  section) and a class. A part fits if its class is at or below the mount's. Racer thruster
  mounts are a higher class than the floater's, which gives the asymmetry above.
- **Adapters** (mine): a part that offers a mount of its own. The turret takes the gun mount
  and offers a rotating gun mount. A cargo section is the same idea, and can bring a mount or two.
- **Weight stays** as a second, softer cost.
- **Components are visible on their mounts**, and damaged or destroyed ones show it
  (*decided*: this is the main idea).

**The computer**

- **A computer mount that runs programs** (*decided*): spin stabilizer, retro, meters, the
  click parts, the starmap and the autopilot.
- **Program slots, not memory** (*decided*, "can tweak later"). A big program taking two slots
  is the way to add weight later.
- **Each base hull comes with its own computer** (*decided*). The floater's is more advanced
  (it's the "tell it where to go" ship). The racer's is basic, with a reason to upgrade.
- **Software is yours** (*decided*). It stays in your pod or account, never in a hold or a
  locker, but it needs a computer to run. Later systems may need their own sub-system, which
  can be dropped or lost.

Today's parts already fit this:

| Today's part | Where it goes |
|---|---|
| Reverse, strafe | The empty thruster mounts |
| Gun 2, turret | The gun mount (the turret as an adapter) |
| Cone and all-round tractor | The tractor mount |
| Spin stabilizer, retro, meters, click move, click route, click turn, starmap, autopilot | Programs: 8 of them, so computer slots bind straight away |
| Bay, large bay | A section |

**Damage and death**

- **In flight a module is damaged (stops working) or destroyed** (*decided*). The dock repairs
  what's damaged. What's destroyed has to be replaced.
- **Which module a hit damages** (mine): the one on the mount nearest the point of impact.
- **Critical** (*decided*): you lose control and the escape pod launches. From then on, all
  further damage, plus extra damage from explosive modules (an extra fuel tank, say), hits the
  modules. For now it always ends in an explosion that destroys the hull.
- **Destroyed modules never drop. Whatever survives critical drops as loot** (*decided*), for
  the killer, or for you if you get back. A pirate that keeps firing into a critical ship
  destroys its own loot, so a smart pirate stops shooting.
- **Back at a base, the pod offers a choice** (*decided*): a bare hull with that hull's
  default gear, or a rebuild. The rebuild takes longer, costs more, and depends on the
  station's stock. It's pay-as-you-go insurance. A prepaid policy can come later as the
  cheaper version of the same button.

**Storage**

- **A locker per base** (*decided*). What you leave somewhere stays there. It unlocks one of
  the user's favourite experiences: moving your stuff to a new home.
- **Modules can ride in the cargo bay** (*decided*), sharing space with ore. Each module has a
  size in ore units (mine), so the bay stays one number.
- **Per-item stock at each base.** This is step 4 of the shopping trip test. Lockers, the
  rebuild and loot all need items to be counted things that sit somewhere, so it comes first
  of those.

**Screens**

- **The basic shop menu stays and fits what you buy automatically** (*decided*). Its number
  hotkeys go.
- **Locker and inventory each get a key** (*decided*). The keys work from the start but only
  appear in help after you've used them once. A small button in the shop screen opens both.

## The question

**Do mounts make choosing parts interesting, and does seeing your parts on the ship, and
losing them in a fight, make fights and deaths read better?**

**It fails if** fitting feels like admin (the right fit is obvious, or the screen is a chore),
or module damage just feels like being punished twice. If it fails, keep the auto-fitting shop
and the lockers, and drop per-module damage.

## The build

Each step is played before the next starts.

### 1. Mounts and the computer

The hulls get their mounts, drawn on the ship, with fitted parts visible on them. Today's
parts move onto mounts as in the table. The shop fits on buy, and refuses (or offers a swap)
when nothing fits. Each hull gets its own computer with program slots. The shop's number
hotkeys go.

With 8 programs, computer slots are the first real choice, before any new part exists.
Traffic buys parts today, so its "what next" list has to respect mounts too.

*Played for:* does the ship read better, and is choosing programs a real decision?

### 2. Module damage

A hit damages the nearest mount's module. Damaged stops working, destroyed is gone until
replaced, and the dock repairs or replaces. Damage shows on the ship. Pilots have to cope with
a part that's fitted but not working.

*Played for:* does losing a thruster mid-fight feel like a moment or a punishment?

### 3. Items as counted things

Per-item stock at each base (the core of the shopping trip's step 4, without the price gap or
markdowns). A locker per base. Modules in the bay. The inventory and locker screens, as plain
lists with the hull picture, opened by key or from the shop.

*Played for:* move your stuff to Planet base. Does that feel like moving home?

### 4. Critical, pod and loot

Critical, the pod flying itself to the nearest shipyard base, module damage during critical,
loot that drops and can be picked up into the bay, and the choice between a bare hull and a
rebuild from the station's stock. Software stays with the player.

*Played for:* die to a pirate, then decide whether to go back for what's left.

## Not in this plan

New parts (the "ten times more upgrades" this plan prepares for), explosive modules and fuel,
cargo sections as physical boxes, bigger hulls, derelicts and salvage, insurance policies,
hiring a hauler to move your stuff, the price gap and markdowns, and software sub-systems.

## What could grow out of scope

- **The fitting and inventory screens.** Start with the dock shop plus a picture of the hull.
  No drag and drop.
- **Traffic fitting.** Its buy order only has to respect mounts. It shouldn't need to think
  about builds.
- **Saves.** Fitted, stored and loose items change the save format. With about no outside
  players, old saves may start fresh rather than be migrated.
