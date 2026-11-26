# Face cast plan

Written 2026-11-26, from a spec talk on Q-8 (S-39). It follows `docs/chatter-faces-plan.md`,
which built the face renderer, the part vocabulary, two hand-written regulars (Gus and Pip) and
faces on the radio log. This plan adds three things: a **pool** that rolls whole faces from named
parts, an **interview** that turns a kept face into a person, and a **cast** of those people
dealt out across the system. Nothing here is built yet.

## Why

Pillar 3 says purposeful traffic is company. Today the only people on the radio are Gus and Pip
at your home base. Everyone else is a bird name with the plain face, every defender is
"Defender", and pirates are a silent "Unknown". Writing a face by hand means typing numbers into
`src/voices.json`, so a cast never grows past two.

The user's hope (2026-11-23, on seeing the first four faces): name the parts, generate hundreds
of variants and keep the good ones. Aliens can then be more parts in the pool instead of new
art. And from this talk: a kept face should become *someone*, through an interview about who
they are and how they act. Those answers then drive how they talk, how they sway to music, and
how they react to what happens.

Premises and where they come from:

- That parts which know their own moods can roll whole faces worth keeping is a **guess**. Gus
  and Pip were each tuned by hand, and nothing has rolled a face yet. Step 1 is the smallest
  version the user can look at.
- That the interview has to be the user's own reading, not the agent's, is the user's call. The
  user put it as "a mirror of my mind and how I see people". An agent can invent a plausible
  person, but it would be an average one.
- That a cast member is worth meeting only when they fly past and sound like the interview said
  is the reason the cast goes into play in this plan, not later (the user picked this).

## The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

### The pool and the roll

- **The pool is an authoring tool, not a runtime generator** (*decided*). Faces are rolled on
  the dev faces page, the user keeps the good ones, and play only ever shows kept faces. Nothing
  rolled reaches a player unseen.
- **A roll makes a whole person** (*decided*). Each part *style* knows how it looks in each mood.
  A lid eye drops its lid for annoyed and squeezes into an arc for happy, and a ring eye shrinks
  for scared. A roll picks the identity, and the moods follow from the parts. Each mood also
  rolls **one small quirk**, such as a wink, a lopsided mouth or an extra tilt, so moods don't
  feel stamped (*decided*).
- **What a roll picks** (mine): glow colour, screen (shape, rim, bezel), eye style, mouth style,
  brows (a style or none), identity marks (scar, glasses, stud, none), and the crookedness dials
  from the chatter plan (eye size and height difference, mouth offset, whole-face tilt), each
  inside the ranges the chatter plan measured. It also picks one quirk per mood.
- **A role at the roll** (*decided*). The user rolls a batch *for* a role, one of `traffic`,
  `defender`, `pirate` or `station`. The pool leans each role its own way (the leanings are
  mine, to tune by looking):
  - `station`: the squarer screen with a bezel and a wide flat mouth (today's station display),
    teal and white, and no mood marks, ever.
  - `defender`: a steady, even look: less crooked, cooler colours, neat marks.
  - `pirate`: harsher marks (scars, cuts), hot colours, sharper eyes.
  - `traffic`: the full range.
  The role stays with the kept face and can be changed in the interview.
- **Kept faces are stored resolved** (mine). A kept face saves its finished layers, in the same
  shape as a hand-written face in `voices.json`, plus the seed and picks it came from. A later
  change to the pool never changes a face already kept.
- **Gus and Pip stay hand-written, and the pool learns from them** (*decided*). Gus's lid eye,
  heavy brows and scar, and Pip's glasses and star eyes, become styles and marks in the pool, so
  rolled faces can reuse them. One pack format holds both rolled and hand-made faces, so a
  special character can still be hand-crafted.
- **The rules every face keeps** (from the chatter plan, kept): every face carries a mass (a
  filled shape or a stroke at least 3 units wide), identity layers are identical across moods,
  station faces never get mood marks, and a face with mood marks means *someone*.
- Plain traffic, plain defenders and stations without a cast member keep the `generic` and
  `station` faces. Plain pirates stay silent.

### The interview

- **In chat with an agent, not a form** (*decided*). The page does the rolling, the keeping and
  the knobs you set by watching (sway). Then the user brings a kept face into a chat. The agent
  asks who this is, follows up where an answer is thin, and writes the pack in the same sitting.
- **The answers are the user's** (*decided*). The agent asks and never suggests who someone is.
  It writes the lines from the answers, and it points out when a new cast member is drifting
  into the same person as an existing one (similar knobs and similar notes).
- **Two kinds of answer** (*decided*): **knobs**, which the game reads, and **notes**, free text
  that only line writers read.

**The knobs** (*decided*, the five below). Each scale runs 1 to 5, with 3 as the default. Knobs
change **only what someone says and how they look, never what they do** (*decided*).

| Knob | Set where | Drives |
|---|---|---|
| Sway: kind, size, beats per nod | the page, by watching | how they move to music (`sway` in the pack, as today) |
| Chatty: quiet ↔ talkative | interview | how often they make idle talk |
| Warmth: guarded ↔ open | interview | how many meetings before they warm up to you |
| Nerve: steady ↔ jumpy | interview | how early scared talk starts when a threat is near |
| Loves / hates: one or two each, from the role's list | interview | the mood of lines about that thing |

How each knob works (mine):

- **Chatty** scales only idle talk: field and slim lines, news, station greetings. The
  multipliers on the chance or rate are 0.4, 0.7, 1, 1.5 and 2 for knob values 1 to 5. A line
  that answers an event (approach, mayday, thanks, docking clearance) is always said.
- **Warmth** scales the meeting thresholds from Q-10 (the `regularMeetings` and `friendMeetings`
  tweaks) per person: ×2, ×1.5, ×1, ×0.75 and ×0.5 for values 1 to 5, rounded and never below 1.
  For a station, warmth is how soon it stops calling you "pilot" and starts using your name,
  which happens at its regular level.
- **Nerve** adds one situation, `uneasy`: a threat (a pirate, or for a pirate a defender) inside
  radio range before anything has happened. Values 4 and 5 say it at full radio range, value 3
  at half range, and values 1 and 2 never say it. Steady speakers (1 and 2) also say their
  fleeing lines in `annoyed` instead of `scared`. A mayday stays scared for everyone. For a
  station, nerve sets how far out it warns about a pirate near the base.
- **Loves and hates** change a line's mood only when it would otherwise be `neutral`: a love
  makes it `happy` and a hate makes it `annoyed`. A mood that comes from what really happened,
  such as scared in a mayday, is never overridden. Each topic maps to the situations it covers:

  | Role | Topic | Situations |
  |---|---|---|
  | traffic | pirates | all_clear, uneasy |
  | traffic | buying parts | bought |
  | traffic | ore | heading_back, field |
  | traffic | quiet days | field, slim |
  | traffic | the player's help | thanks |
  | traffic | the pirate base | outbound to the pirate base |
  | defender | a clean kill | `kill` (new) |
  | defender | quiet patrols | `patrol` (new, idle) |
  | defender | pirates | responding, engaged |
  | defender | traffic that runs | `covering` (new: a fleeing ship near them) |
  | defender | the player joining a fight | `assist` (new: the player hits the pirate they are fighting) |
  | pirate | easy prey | attacking an unarmed ship |
  | pirate | defenders | breaking_off, uneasy |
  | pirate | full holds | attacking a ship with ore in its hold |
  | pirate | the player | attacking the player, marked |
  | station | busy docks | cleared to dock |
  | station | an empty store | store full and turned-away lines, news about its stock |
  | station | pirate trade | the pirate-base warning |
  | station | regulars coming home | its replies to cast members who live at it |

  A situation in this table that chatter doesn't have yet is added as a new line kind, and the
  new ones are marked (new). Each one only fires on something the sim already does.

**The notes** (mine, the questions the agent asks, one at a time): their name; who they are in
one line; how they talk (short or long, formal or rough, a catchphrase); a habit; what they
would never say; and how they feel about the player at first. The agent then asks the knobs one
at a time, saying what each one drives, and offers the role's loves and hates list.

**The lines** (mine): the agent writes 20 to 40 lines across the role's situations in that
person's voice, at the stranger, regular and friend levels (Q-10's levels). The user edits them,
and the entry is marked `cast`. A situation with no line falls back a level, then to the shared
list, as in the chatter plan.

### Situations, not factions

- **Line kinds are named by situation, not by faction** (*decided*, from the user's note:
  pirates are just a faction, and one day a pirate may be a friendly ship that chats like
  traffic). Any speaker who has lines for a kind can say them when they're in that situation.
  Today only pirates are ever *attacking*, but nothing in the data ties `attacking` to pirates.
- **Pirates get three situations** (*decided*): `attacking` (a threat, heard next to the
  victim's mayday), `marked` (they've learned that you shot one of theirs; this hooks the
  existing `Chatter.marked`) and `breaking_off` (running from a defender or from damage).
- **Only cast pirates speak** (*decided*). Plain pirates stay silent and "Unknown". A cast
  pirate's lines show as "Unknown" until the player has heard them once, meaning the line was
  in radio range or was a broadcast. From then on their name shows (*decided*). Having heard
  them is saved with the game.

### The cast in play

- **Dealt to every base** (*decided*): about 2 in 10 of each base's traffic (rounded, and at
  least 1 if the base has traffic and the cast has a free member of that role), one station
  member per base, 2 in 10 of each base's defenders, and 2 in 10 of the pirates at the pirate
  base.
- **Gus and Pip stay at your home base** (*decided*) and count toward its share.
- **One place per member** (mine): a cast member lives at only one base. When the cast runs out
  for a role, the rest stay plain. Who goes where is picked by chatter's own random generator,
  never the sim's, so no-player runs and parity don't change.
- **Familiarity is per member** (mine): Q-10's regulars record, meaning meetings and when you
  last met, widens from Gus and Pip to every cast member, and so does its save.
- **A lost ship** (mine; this also builds step 3 of the chatter plan, "pod home", for the whole
  cast): the member keeps their base, meetings and heard flag, and is shipless and silent. The
  next ship of their role at their base takes them first: rebuilt traffic (`spendBaseParts`), a
  new defender, or a hull the pirates buy (`Chatter`'s "pirates bought a new hull" hook). Their
  first line in the new ship is a `new_ship` grumble, which replaces the station's usual
  departure line for traffic.
- **Old saves and new games** (mine): the deal happens at a new game. A save from before the
  bump doesn't load, as with every `SAVE_VERSION` bump.

## What to build

### 1. The pool and the roll page

**Stop here for the user to try.** Nothing in chatter, the radio or play changes in this step.

- `src/face-pool.json`, hand-authored: part styles grouped by slot (eyes, mouth, brows, marks,
  screen). Each style is written once per mood (neutral, happy, annoyed, scared) in parameters
  the roll can vary (size, spacing, offsets), plus colour lists, quirks and the per-role
  weights. Gus's and Pip's own pieces go in as styles. `tired` and `angry` fall back through
  the existing chain.
- `src/face-pool.ts`, pure: `rollFace(seed, role)` returns a resolved `VoiceFace`, which is the
  type `src/faces.ts` already draws, plus the picks. The same seed and role always give the same
  face. It uses its own seeded random, not the sim's.
- `src/cast.json`: the kept faces, one entry each (`id`, `role`, `status: "kept"`, `face`,
  `sway`, `from: { seed, picks }`). The page writes it through a new `/__cast` POST endpoint in
  `vite.config.ts`, in the same shape as `/__hulls` (dev server only). Add it to the watch
  ignore list next to the other designer files.
- `src/faces.ts`: a speaker's face can come from `voices.json` or `cast.json`. `Voice` widens
  from the four-name union to `generic | station | <id>`, and `faceFor` and `renderFaceSvg`
  resolve a cast id the same way they resolve a voice. The fallback chain and grades are
  unchanged.
- The dev faces page (`src/designer/faces.ts`, key F under `?dev`) gets a **Roll** section: a
  role picker and **Roll 24**. Each card shows the face at 26px inside a fake radio line and at
  the slider size. Hovering or clicking a card shows all four moods side by side. Each card has
  **Keep** and **Skip**.
- Below it is the **Shelf**: every kept face, with a sway picker (kind, size, beats per nod)
  previewed against the page's existing music preview, a role picker, and **Remove**. Changes
  save to `src/cast.json` through `/__cast`.
- **Try it:** `npm run dev`, open `?dev`, press F, pick a role and roll a few batches. Do most
  rolls read as a person in all four moods at 26px? Does each role look like a kind at a glance?
  Would you keep one in five, or fewer? The leanings and dials are tuned from what the user
  says here.

### 2. The pack format and the knobs

- `src/cast.json` entries gain the interview: `name`, `knobs` (`chatty`, `warmth`, `nerve`,
  `loves`, `hates`), `notes` (free text, never read by the game) and `lines` (per situation and
  per level). The status becomes `cast` once interviewed. `voices.json` packs take the same
  fields, and Gus and Pip get a `role` of `traffic` and their knobs (from their interview; until
  then all 3, no loves or hates).
- A pure `src/knobs.ts` covers chatty's multiplier, warmth's thresholds, nerve's range and
  fleeing mood, and the love/hate mood rule, all from the tables above. The role topic lists
  live in it as data.
- `src/chatter.ts` reads the knobs for every speaker who has a pack. It adds the situations
  `uneasy`, `attacking`, `marked`, `breaking_off`, `kill`, `patrol`, `covering`, `assist` and
  `new_ship` as line kinds. Each fires only on something the sim already does (pirate attack is
  `Chatter.hit`, marking is `Chatter.marked`, a pirate leaving combat, a defender's kill, and so
  on). A speaker with no lines for a kind says nothing new, so plain ships behave as today.
- **The interview** is a procedure the agent follows in chat, in "The interview" above. It
  writes the entry in `src/cast.json` directly. It isn't code.

### 3. Dealing the cast

Waits for Q-10 (familiarity), which builds the regulars record this step widens.

- At a new game, chatter deals `cast` members as described in "The cast in play", using its own
  random generator. Gus and Pip are dealt first, as today.
- Q-10's `regulars` record widens to every dealt member: member id, base id, the ship or null,
  meetings, last met, and heard (for pirates). Saved with the game: bump `SAVE_VERSION`.
- Names: a cast member's own name replaces the bird name, "Defender" or "Unknown" (for a pirate,
  only once heard). The station's lines at a base with a station member use that member's face
  and name.
- Lost ships: as in "The cast in play", for every role.
- **Stop here for the user to play.**

## How we'll know

- `src/face-pool.test.ts`: the same seed and role give the same face; every rolled face passes
  the mass rule; identity layers are identical across moods; a station roll never has mood
  marks; each role's leanings show over a few hundred rolls (for example, the station screen
  always, and pirate colours from the pirate list); no roll touches the sim's random generator.
- `src/faces.test.ts`: a cast id resolves and renders like a voice; a missing cast id falls back
  to the generic face.
- `src/knobs.test.ts`: each knob value gives the table's number; a love turns a neutral line
  happy and leaves a scared one scared; nerve 1 and 2 never say `uneasy`.
- Chatter tests: a cast speaker's lines carry their face and name; a chatty-1 speaker makes less
  idle talk than a chatty-5 one over the same run, but both always answer events; a cast pirate
  shows as "Unknown" until heard, then by name; a plain pirate never speaks.
- Deal tests: about 2 in 10 per base and role, one station member per base; no member is dealt
  twice; Gus and Pip at home; an empty cast deals nothing and changes nothing.
- Save test: dealt members, meetings and heard flags survive a save and load and still point at
  the right ships.
- Lost-ship test: destroy a cast member's ship, let the base rebuild, and the new ship is the
  same member with the same meetings, at the same base, with a `new_ship` line.
- A no-player run with chatter on gives the same world as before this plan.
- **Try it:** after step 1, roll and keep faces on the dev page (F under `?dev`). After the first
  interviews and step 3, start a new game and fly to a station other than your home. The radio
  shows a few named people among the bird names, the station greets you in its own face, and
  each person sounds like their interview. Linger near a pirate fight to hear a cast pirate as
  "Unknown", then by name the next time.

## Needs first

- The face renderer, part vocabulary and fallbacks: built (`src/faces.ts`, `src/voices.json`).
- The dev faces page with sway preview: built (`src/designer/faces.ts`, key F, `src/sway.ts`).
- A dev-server endpoint that writes a designer file: built (`/__hulls` and the others in
  `vite.config.ts`).
- Chatter with Gus and Pip, `Chatter.hit`, `Chatter.marked` and the bought-hull hook: built
  (`src/chatter.ts`).
- Traffic and defenders per base, the pirate base, and rebuilding lost traffic: built
  (`addTraffic`, `addDefenders`, `pirateBase`, `spendBaseParts` in `src/sim.ts`).
- **Familiarity (Q-10, step 2 of `docs/chatter-faces-plan.md`): not built.** Step 3 waits for it.
- Kept and interviewed faces in `src/cast.json`: step 3 deals only what the interviews have
  produced, so a few interviews should happen between the two builds.

## Not doing

- Building faces while the game runs: every face in play is one the user kept.
- Rolling or picking moods face by face: a roll is a whole person.
- An interview form on the page: the interview is a chat.
- Remaking Gus and Pip from the pool.

## Not in this build

- Knobs that change what someone *does*, such as a jumpy pilot fleeing early or a steady one
  mining on under fire. That would be the liveliest knob, but it changes the world and parity.
- A pirate (or any faction) friendly enough to chat like traffic. The situation-named line
  kinds leave room for it.
- Aliens: a species as extra styles in the pool, with expressions you learn to read.
- Call-sign pictures beside the emote (S-54), more kinds of sway (S-70), and station music and
  personality beyond the knobs (S-69).
- A cast member gone for good, and newcomers replacing them over time.
- Tips and news from friends, from what they really saw (the chatter plan's next payoff).
