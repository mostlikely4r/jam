# Chatter faces plan

Written 2026-11-22, from a design talk that went from emotes to alien languages. The long
dream is different species in different systems, a social and story layer, and aliens whose
expressions you can't read until neighbours sell you the means to understand them. This plan is
only the first slice of it: faces on the radio lines that already exist, and two named regulars
at your home base who come to know you. Nothing here is built yet.

Inspiration the user pointed to: Solar Winds (simple conversations, a hidden power keeping
species apart), Inter-Stellar Wars (trade ties with some species, a dangerous unknown beyond),
and pi-emote (a small face that reacts to what is going on: hi, idle, talk, success, failure).
The look comes from the *Friendly Robot* emote sheet: the face on its screen, not the robot.

## Why

Pillar 3 says purposeful traffic is company. Today that company talks (see `src/chatter.ts`), but
every voice sounds the same and nobody remembers you. A face gives a line its tone: "Welcome
back." means something different with `^_^` or `-_-` or a half-lidded smirk. A few regulars who
recognise you turn traffic into people you look forward to meeting.

Premises and where they come from:

- The user wants faces that look like the glowing screen of a small robot, and personalities
  they can build a small relationship with by meeting them often (the user's own taste, this
  talk).
- That it can feel "90s DOS comfy" while being procedural is a **guess**: hand-written voice
  packs combined by the game, a small cast and repeated catchphrases are meant to get there.
  Step 0 is the smallest version the user can look at.

## The look

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

- **Faces are small vector pictures, not text** (*decided*). A dark rounded "screen" with glowing
  line-art eyes, brows and mouth. Only the face on the screen, never the robot head.
- **The eyes carry the expression**, and small mood marks add to it: blush, sweat drop, anger
  mark, sparkle (*decided*).
- **Three layers** (*decided*)
  1. **Identity**: fixed per regular. Glow colour, screen shape, permanent marks (Gus: a scar;
     Pip: mismatched round glasses). You learn to recognise a regular by these.
  2. **Mood**: swaps the eyes, brows and mouth.
  3. **Mood marks**: small extras a mood adds (blush, sweat drop, sparkle). Drawn separately and
     never replacing identity marks.
- **Playfulness is the point** (*decided*): the two eyes differ in shape and size from each
  other, brows are tilted and unequal, mouths sit off-centre. Each voice owns its own eye, brow
  and mouth shapes, so there is no shared eye set that every voice picks from. Generic traffic is
  deliberately plain: cyan, centred mouth, rounded-square eyes, no marks. **A face with marks
  means that ship is someone.**
- **Drawn in a 100 × 66 box** (*decided*), layers bottom to top: screen, under (identity), eyes,
  brows, mouth, over (identity marks), mood marks.
- **Glow without filters** (*decided*): draw every shape twice, a wide copy at about 35 % opacity
  under the crisp one.
- **Station**: the same screen with a squarer shape, white or teal, no marks, no mood marks
  (*decided*).
- **The mood still comes from what really happened**, never at random (*decided*).
- **Fallbacks** (*decided*): angry → annoyed → neutral, tired → neutral. A missing layer falls
  back to the generic face's layer in the voice's colour. Identity layers always stay.
- **Gus and Pip get neutral, happy and scared, and annoyed** (*decided*); everything else falls back.
- **The look starts at filled** (*decided*, from looking at the gallery): the line-only grade reads
  worse than the filled one, so `^_^` grade stays a comparison, never a target.
- **Plain traffic gets craft, not personality** (*decided*): a glint in each eye, a mouth with mass,
  and the station its own display — a squarer screen with a bezel and a wide flat mouth. What it
  still never gets is mood marks, so a face with blush or a sweat drop still means *someone*.

### A step up from `^_^`

The user's call: the sheet is the reference, and the faces should sit **a step above it** — not
above it in polish, but in being a *system*. The sheet is a locked set of 24 drawings at 1000px;
ours is combined from parts at 30px, so the step up is variation and one notch of anatomy, never
finer detail.

What the jump from `^_^` to the sheet actually is, ranked by how much it buys (mine):

1. **Filled mass, thick strokes.** Every face on the sheet has a solid blob somewhere: half-disc
   lids, blob mouths, wedge slits, star fills. Strokes run about 7 % of the screen's width with
   round caps. There are almost no thin lines.
2. **Two-part eyes, no eyebrows.** Smug is a lid over a half-moon. Shocked is a ring with a hole.
   Sleepy is a thin filled crescent. Confused has a squiggle on one side and a dot on the other.
   The sheet uses **no brows at all**; expression comes from lid, core and mouth.
3. **Mouths are shapes, not curves**: open blob, ring, rectangle with a tooth line, cat line,
   squiggle. At small sizes the mouth mass reads before the eyes do.
4. **Deliberate crookedness.** No two eyes match, one sits a little higher, the mouth is
   off-centre, several faces are rotated a few degrees.
5. **Marks on the glass**: pink blush, cyan tears, a sweat drop, sparkles — flat shapes, a second
   colour on an otherwise monochrome screen.
6. **Screen treatment**: near-black navy, slightly lighter in the middle, a faint rim.

The rule that keeps it from sliding back to `^_^` (mine): **no face is drawn in thin lines only.**
Every face carries a mass — a filled shape, or a stroke at least 3 units wide in the 100 box. That is
what survives at 30px, where the face really lives, and `faces.test.ts` holds every face to it.

**One fork** (mine): the sheet has no brows, and ours start with Gus's heavy ones. If brows are
*identity* (always present, one allowed per-mood tweak, such as raising them for scared) and
moods work through lids, eye cores, mouths and marks, we get the sheet's legibility and still get
Gus. If brows also carry mood, faces start reading like comic humans. In this build Gus's brows
are simply written into every mood, which gets the same result without deciding the fork.

**One thing dropped from the earlier picture**: Pip's glasses don't slip down when scared. The
identity layer is fixed and a test says so. Scared reads from shrunken eyes inside the frames, a
squiggle mouth, a sweat drop and the face tilting.

### The dials (mine, measured off the sheet)

Starting points to tune in the gallery, not rules:

- feature stroke 7 of the 100 box, marks 5, always round caps
- at least one filled mass per face
- the eye pair differs in size by 1–3, one eye 1–3 higher
- the whole face tilts −5° to +5°
- the mouth sits −4 to +6 off centre in x
- eyes at y ≈ 40 %, mouth at y ≈ 70 %, the pair spans 55–65 % of the width
- screen `#0A1520` with a lighter middle and a faint rim; features at full strength plus the
  35 % wide copy for glow

### The grammar (mine)

Parts, not drawings. Each voice's moods are written as combinations of a small vocabulary, which
is what lets a third eye or a mandible mouth be a new data entry later instead of new art.

The user's hope, on seeing four faces: **a pool that combines into 200+ variants**, and aliens
being "more of that". The vocabulary below is already the pool; the missing layer is naming the
parts so a voice — and later a species — picks from the pool instead of spelling out every mood.
Nothing in this build does the combining yet, but nothing in the data blocks it either:

- eyes: half-disc lid, dome, ring, oval with a glint, star, caret, squiggle, dot, rounded square
- brows: a tilted stroke, angled or raised
- mouths: arc, filled blob, ring, squiggle, cat, tooth notch
- marks: blush, sweat drop, anger cross, sparkle

Data lives in `src/voices.json`, hand-authored, one pack per voice. A part is a named shape with
numbers (`{ "kind": "disc", "at": [35, 27], "half": 6.5, "depth": 4 }`) or, as the escape hatch,
a raw path (`{ "kind": "path", "d": "M 44 48 …" }`). Named parts are what can be tuned by hand
and by slider; raw paths are for the one-off shape nothing else shares.

## Where it shows

- **The corner radio log** (*decided*): the face at the start of the line, before the name. The
  speaking ship already gets a ping ring in the world (`Renderer.addPing`), so nothing new is
  needed there.

      ▣ Station: Welcome back.
      ▣ Gus: You again, kid.
      ▣ Pip: Full hold!! Heading in!

- `ChatterLine` and the `chatter` event carry `face: { voice, mood }` — a key, not a picture.
  `src/radio.ts` turns the key into an inline SVG about 30px tall, cached per voice and mood. No
  monospace font.

## Who has a personality

- **About 8 in 10 ships are quiet or generic, 2 in 10 have a personality** (*decided*). In this
  slice that means: all traffic keeps today's bird names and shared lines, with generic faces;
  **two regulars** live at your home base.
- **Two regulars to start, one gruff and one bright** (*decided*): a resigned old hand and a
  bright-eyed youngster. Names Gus and Pip are mine.
- **A voice pack per regular, written by hand** (mine): face parts, mood overrides, a catchphrase,
  and lines per line kind and familiarity level. Where a pack has no line for a kind, the generic
  list is used, with the regular's face. The game combines; it never writes.

## Familiarity

- **Regulars remember how often you met** (*decided*). Lines warm up as you get to know them: a
  stranger says "Docking.", a regular says "You again, kid.", a friend says "Saved you a spot."
- **What counts as meeting** (mine): the player is within radio range (`chatterRange`) of the
  regular's ship, counted at most once per 5 minutes of game time. A thanks for ore the player
  broke loose counts as one more meeting.
- **Levels** (mine): stranger below 3 meetings, regular from 3, friend from 10. Both numbers are
  tweaks, so the user can set them to 1 and 2 to see the whole arc in minutes.

## Losing a ship

- **Pod home** (*decided*): a regular whose ship is destroyed usually gets home in a pod and comes
  back in a new ship, grumbling about it. Rarely they are gone for good, and that is left for a
  later build (see below).
- **How, in this build** (mine): traffic lost today goes on the nearest shipyard base's
  `lostTraffic` list and is replaced in time (`spendBaseParts`). A regular whose ship is lost
  keeps their identity and familiarity, shipless. The next traffic ship any base rebuilds goes to
  the shipless regular first, with its `home` set back to the regular's home base. The station's
  usual "cleared for departure" line is replaced by the regular's own grumble ("Lost the ship.
  Pod's fine. Don't say it.").

## What to build

### 0. The face gallery, before anything else

**Stop here and show the user.** Nothing in chatter or the radio changes in this step.

- `src/faces.ts`: the part vocabulary, the mood table and the fallbacks, and two pure functions:
  `faceFor(voice, mood)` returning the resolved layers, and `renderFaceSvg(voice, mood, options)`
  returning markup. Unit tested.
- `src/voices.json`: Gus, Pip, generic and station, with Gus and Pip written for neutral, happy,
  annoyed and scared. Station is neutral only.
- An **Options** section at the top of the page puts the open calls side by side, because they are
  easier to point at than to describe: Gus's brows (fixed, none, per mood), Gus's scar (none,
  slash, cross, stitch, hash), Pip's lean, how much craft plain traffic gets, and whether the
  station gets its own display. The page saves nothing; the pick goes into `voices.json` by hand.
  The options block is scaffolding and should go once these calls are made.
- A dev page in `src/designer/faces.ts`, reached from `main.ts` under `?dev` (key F), showing every
  voice at every mood in a grid: the same face at **three grades** side by side — line only
  (`^_^` grade), filled and straight, and filled, crooked and marked (the target) — at a size the
  slider sets (110px to start) and at 26px inside a fake radio line, which is the size it really
  lives at. A mood a voice didn't write is marked *borrowed*, so the fallbacks are visible.

  The three grades are the decision the user can't make in words: point at a column, say "that
  one, a notch less crooked", and the look is settled.

- **Try it:** `npm run dev`, press F. Does a face read as a mood at 26px, next to its name? Is Gus
  recognisable before you read the name? Do the two regulars look like different people?

### 1. Faces on every line, and two regulars with their own voice

No memory yet.

- `ChatterLine` and the `chatter` sim event get `face: { voice, mood }` (a key, not a picture).
  Every place in `src/chatter.ts` that says a line passes the line kind's mood.
- `src/radio.ts` shows the face before the name, from a cache per voice and mood. Station lines
  get the station face.
- `src/voices.json` gets the two packs' lines: 20 to 40 each across the line kinds today's chatter
  has (approach, heading back, outbound, field, slim, fleeing, mayday, thanks, bought, all clear,
  news), in the two voices. Stranger level only in this step.
- At a new game, the first two traffic ships whose home is the player's home base
  (`sim.homeBaseOf(sim.ship)`) become Gus and Pip. If that base has fewer, as many as it has. They
  use their person names instead of bird names.
- Choosing regulars and their lines must not touch the sim's random generator: chatter has its
  own. No-player runs and parity must not change.

**Stop here for the user to try.** Does a face give the line a tone? Do Gus and Pip already feel
like two different people?

### 2. Familiarity, and lines that warm up

- A `regulars` record on the sim: id (voice), home base id, the ship or null, meetings, and when
  they last met. Saved with the game; bump `SAVE_VERSION`.
- Count meetings and the thanks bonus as in the picture, from `Chatter.update` and `Chatter.pickedUp`.
- Packs get regular and friend lines; the line picked is from the highest level reached that has
  one for that kind, falling back down a level, then to the generic list.
- Tweaks: `regularMeetings` (default 3) and `friendMeetings` (default 10), in the radio group next
  to "Radio range".

### 3. Pod home

- As in the picture: the lost regular keeps identity and meetings, takes the next rebuilt traffic
  ship, goes home, and grumbles instead of the station's departure line.
- While shipless, they say nothing.

## How we'll know

- `src/faces.test.ts`: every voice and mood resolves to a face; identity layers are identical
  across moods; a voice's own layer beats the generic one; the fallback chain works;
  `renderFaceSvg` is deterministic and renders at a fixed size.
- Chatter tests: a regular's line carries their `face.voice` and name; a generic ship's the
  generic face; the mood follows the line kind (a mayday is scared).
- Familiarity tests: meetings count once per window, not per tick; thanks adds one; the line
  level follows the tweaks; a missing level falls back.
- Save test: regulars and meetings survive a save and load, and still point at the right ship.
- Pod-home test: destroy a regular's ship, let the base rebuild, and the new ship is the same
  regular with the same meetings, home at the regular's base, with the grumble line.
- A no-player run with chatter on gives the same world as before step 1 (the random generator is
  untouched).
- **Try it:** start a new game and stay near your home base and its field for a few minutes. The
  radio log in the top right shows a face on every line, and Gus and Pip show their own faces and
  voice. After step 2, set the two meeting tweaks to 1 and 2, fly near them a few times, and hear
  their lines warm up.

## Needs first

- The radio log and ping rings: built (`src/radio.ts`, `Chatter`, `Renderer.addPing`).
- Traffic with a home base, and traffic replaced after loss: built (`addTraffic`, `removeShip`,
  `spendBaseParts`).
- The player's home base: `ship.home` or the nearest base, through `homeBaseOf`. Built.
- Tweaks with a radio group: built (`src/tuning.ts`).

## Not now

Blinking or glow flicker, per-mood colour shifts, alien faces, emoji, fully generated lines, a
personality on every ship, faces floating over ships in the world, and a live tuner that drags the
shapes and writes `src/voices.json` (the gallery shows; editing stays in the file until the shapes
stop moving).

## Not in this build

- Tips and news from friends, from what they really saw on their errands (*decided* as the payoff
  of familiarity; next build after this one).
- A regular gone for good, the base mentioning it, and a newcomer replacing them over time.
- Regulars at other bases, and the 2-in-10 share across all traffic.
- Pirates and defenders with personalities.
- Station moods that follow its state (busy, quiet, low on stock).
- Aliens with faces and language you can't read, and buying pieces of translation from
  neighbouring species.
