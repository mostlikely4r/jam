# Chatter faces plan

Written 2026-11-22, from a design talk that went from emotes to alien languages. The long
dream is different species in different systems, a social and story layer, and aliens whose
expressions you can't read until neighbours sell you the means to understand them. This plan is
only the first slice of it: faces on the radio lines that already exist, and two named regulars
at your home base who come to know you. Nothing here is built yet.

Inspiration the user pointed to: Solar Winds (simple conversations, a hidden power keeping
species apart), Inter-Stellar Wars (trade ties with some species, a dangerous unknown beyond),
and pi-emote (a small face that reacts to what is going on: hi, idle, talk, success, failure).

## Why

Pillar 3 says purposeful traffic is company. Today that company talks (see `src/chatter.ts`), but
every voice sounds the same and nobody remembers you. A face gives a line its tone: "Welcome
back." means something different with `^_^`, `-_-` or `>_>`. A few regulars who recognise you
turn traffic into people you look forward to meeting.

Premises and where they come from:

- The user wants faces that look like kaomoji and personalities they can build a small
  relationship with by meeting them often (the user's own taste, this talk).
- That it can feel "90s DOS comfy" while being procedural is a **guess**: hand-written voice
  packs combined by the game, a small cast and repeated catchphrases are meant to get there.
  Step 1 is the smallest version the user can try.

## The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

**Faces**

- **Kaomoji-like faces** (*decided*): somewhere between a plain kaomoji and a full human or
  alien face, built from parts.
- **Identity plus mood** (*decided*). A regular has fixed parts you learn to recognise (frame,
  brows, an accessory). The mood swaps the eyes and mouth.

      Gus (gruff)          Pip (youngster)
      neutral  [ò_ó]╮      (•ᴗ•)✧
      happy    [ò‿ó]╮      (★ᴗ★)✧
      annoyed  [ò_ò]╮      (•︵•)✧
      scared   [Ò□Ó]╮      (◎□◎)✧

- **The parts** (mine): a face is `left frame + left eye + mouth + right eye + right frame +
  accessory`. A mood table gives default eyes and mouth. A voice can override eyes or mouth per
  mood (Gus keeps his heavy brows `ò ó` in every mood but scared). Anonymous traffic uses the
  plain frame `( )` with no accessory; the station uses `[ ]` (mine).
- **Moods** (mine): neutral, happy, annoyed, tired, scared, angry. Each existing line kind
  gets one: greeting, approach, outbound, news, see-off are neutral; thanks, bought, all clear
  are happy; slim pickings is tired; pirate warning is annoyed; fleeing and mayday are scared;
  a pirate's "You'll regret that." is angry. The mood always comes from what really happened
  (pillar 1), never at random.

**Where it shows**

- **The corner radio log** (*decided*): the face at the start of the line, before the name.
  The speaking ship already gets a ping ring in the world (`Renderer.addPing`), so nothing new
  is needed there.

      [■_■] Station: Welcome back.
      (•_•) Wren: On approach, requesting dock.
      [ò_ó]╮ Gus: You again, kid.
      (★ᴗ★)✧ Pip: Full hold!! Heading in!

- The face is set in a monospace font so the parts line up (mine).

**Who has a personality**

- **About 8 in 10 ships are quiet or generic, 2 in 10 have a personality** (*decided*). In
  this slice that means: all traffic keeps today's bird names and shared lines, with generic
  faces; **two regulars** live at your home base.
- **Two regulars to start, one gruff and one bright** (*decided*): a resigned old hand and a
  bright-eyed youngster. Names Gus and Pip are mine.
- **A voice pack per regular, written by hand** (mine): face parts, mood overrides, a
  catchphrase, and lines per line kind and familiarity level. Where a pack has no line for a
  kind, the generic list is used, with the regular's face. The game combines; it never writes.
  Packs live in `src/voices.json`.

**Familiarity**

- **Regulars remember how often you met** (*decided*). Lines warm up as you get to know them:
  a stranger says "Docking.", a regular says "You again, kid.", a friend says "Saved you a spot."
- **What counts as meeting** (mine): the player is within radio range (`chatterRange`) of the
  regular's ship, counted at most once per 5 minutes of game time. A thanks for ore the player
  broke loose counts as one more meeting.
- **Levels** (mine): stranger below 3 meetings, regular from 3, friend from 10. Both numbers
  are tweaks, so the user can set them to 1 and 2 to see the whole arc in minutes.

**Losing a ship**

- **Pod home** (*decided*): a regular whose ship is destroyed usually gets home in a pod and
  comes back in a new ship, grumbling about it. Rarely they are gone for good, and that is
  left for a later build (see below).
- **How, in this build** (mine): traffic lost today goes on the nearest shipyard base's
  `lostTraffic` list and is replaced in time (`spendBaseParts`). A regular whose ship is
  lost keeps their identity and familiarity, shipless. The next traffic ship any base rebuilds
  goes to the shipless regular first, with its `home` set back to the regular's home base. The
  station's usual "cleared for departure" line is replaced by the regular's own grumble
  ("Lost the ship. Pod's fine. Don't say it.").

## What to build

1. **Faces on every line, and two regulars with their own voice.** No memory yet.
   - New `src/faces.ts`: the parts, the mood table, and a pure function that builds a face
     from a voice (or generic, or station) and a mood. Unit tested.
   - `ChatterLine` and the `chatter` sim event get a `face: string` field. Every place in
     `src/chatter.ts` that says a line passes the line kind's mood.
   - `src/voices.json` with the two packs. Write 20 to 40 lines each across the line kinds
     today's chatter has (approach, heading back, outbound, field, slim, fleeing, mayday,
     thanks, bought, all clear, news), in the two voices. Stranger level only in this step.
   - At a new game, the first two traffic ships whose home is the player's home base
     (`sim.homeBaseOf(sim.ship)`) become Gus and Pip. If that base has fewer, as many as it
     has. They use their person names instead of bird names.
   - `src/radio.ts` shows the face before the name, in a monospace span. Station lines get the
     station face.
   - Choosing regulars and their lines must not touch the sim's random generator: chatter has
     its own. No-player runs and parity must not change.

   **Stop here for the user to try.** Does a face give the line a tone? Do Gus and Pip already
   feel like two different people?

2. **Familiarity, and lines that warm up.**
   - A regulars record on the sim: id (voice), home base id, the ship or null, meetings, and
     when they last met. Saved with the game; bump `SAVE_VERSION`.
   - Count meetings and the thanks bonus as in the picture, from `Chatter.update` and
     `Chatter.pickedUp`.
   - Packs get regular and friend lines; the line picked is from the highest level reached
     that has one for that kind, falling back down a level, then to the generic list.
   - Tweaks: `regularMeetings` (default 3) and `friendMeetings` (default 10), in the radio
     group next to "Radio range".

3. **Pod home.**
   - As in the picture: the lost regular keeps identity and meetings, takes the next rebuilt
     traffic ship, goes home, and grumbles instead of the station's departure line.
   - While shipless, they say nothing.

## How we'll know

- `src/faces.test.ts`: each mood gives a face; a voice's fixed parts stay across moods; an
  override wins over the mood table.
- Chatter tests: a regular's line carries their face and name; a generic ship's line the
  generic face; a mood follows the line kind (a mayday is scared).
- Familiarity tests: meetings count once per window, not per tick; thanks adds one; the line
  level follows the tweaks; a missing level falls back.
- Save test: regulars and meetings survive a save and load, and still point at the right ship.
- Pod-home test: destroy a regular's ship, let the base rebuild, and the new ship is the same
  regular with the same meetings, home at the regular's base, with the grumble line.
- A no-player run with chatter on gives the same world as before step 1 (the random
  generator is untouched).
- **Try it:** start a new game and stay near your home base and its field for a few minutes.
  The radio log in the top right shows a face on every line; Gus and Pip show their own faces
  and voice. After step 2, set "meetings to regular" to 1 and "to friend" to 2 in the tweaks,
  fly near them a few times, and hear their lines warm up.

## Needs first

- The radio log and ping rings: built (`src/radio.ts`, `Chatter`, `Renderer.addPing`).
- Traffic with a home base, and traffic replaced after loss: built (`addTraffic`,
  `removeShip`, `spendBaseParts`).
- The player's home base: `ship.home` or the nearest base, through `homeBaseOf`. Built.
- Tweaks with a radio group: built (`src/tuning.ts`).

## Not doing

- Fully generated lines. The game only combines what was written by hand.
- A personality on every ship. Most stay generic.
- Faces floating over ships in the world. The face lives in the radio log.

## Not in this build

- Tips and news from friends, from what they really saw on their errands (*decided* as the
  payoff of familiarity; next build after this one).
- A regular gone for good, the base mentioning it, and a newcomer replacing them over time.
- Regulars at other bases, and the 2-in-10 share across all traffic.
- Pirates and defenders with personalities.
- Emoji: whether they appear at all, perhaps as rare signals such as 🤖 for an automated voice.
- Station moods that follow its state (busy, quiet, low on stock).
- Aliens with faces and language you can't read, and buying pieces of translation from
  neighbouring species.
