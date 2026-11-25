# Chatter faces sway plan

Written 2026-11-25, from a talk right after the user first played with music. The faces are on
every radio line (`docs/chatter-faces-plan.md`, built) and tracks play under the work
(`docs/music-plan.md`, built). Nothing here is built yet.

## Why

The user's own words, 2026-11-25, after first playing with music: "one thing we definitely need
soonish" is that the little faces in front of the radio log sway or bob along with the track
(*decided*). A face that sat perfectly still next to funk reads as a screenshot; the faces are
the only thing in the corner that can show the ship's world enjoying itself.

Pillar 3 is "alive without you", and the radio log is the cheapest place a world looks alive for
nothing. It serves the downtime feel of "optional tinkering during downtime"
(`docs/vision.md`), where the ship is busy and you are watching.

Premise, and it is a **guess**: that faces moving with the track make the corner feel lived-in
rather than busier. It has not been played. So step 1 is the smallest version that can be looked
at, in the gallery where there is no song to wait for, and it stops there.

## The picture

Calls marked *decided* are the user's, in this talk. The rest is my proposal.

- **The beat comes from the audio, not a timer** (*mine*). The motion's phase is the `<audio>`
  element's own `currentTime` divided by the track's tempo, so a fade, a pause, the pause menu,
  Skip, Off and the gap between tracks all start and stop it correctly with no extra state, and
  the dip lands on the real beat instead of drifting away from it. The music already plays through
  one reused element (`MusicPlayer`, `src/music.ts`); it needs a `position` getter.
- **Tempo is data, hand-set** (*decided*: "happy to handset bpm"). Each track in
  `src/music.json` gets `bpm`, and optionally `beat`, a small offset in seconds for when the first
  downbeat isn't at 0:00. Four tracks, tuned by ear once. A track with no usable `bpm` keeps its
  100 default and simply sways at 100, so the file can never break the log.
- **Every face in the log moves** (*decided*: "all faces"). Up to six lines
  (`MAX_LINES`), all in phase, so the corner breathes as one.
- **The nod belongs to the character, not the mood** (*decided*: a different nod per character,
  and scared faces sway too — "even when scared"). So the motion is a `sway` block next to each
  voice's `face` in `src/voices.json`: how many beats per nod, how far it tips, how far it dips.
  The face already says how someone feels; the nod says who they are. Which way each voice turns
  was settled after the first look: see *The shape of the nod* below.
- **Volume and mute govern it** (*decided*: "let volume/mute govern"): there is no new switch.
  A track that isn't playing has no beat, and mute counts as not playing, so `M` stops the sway
  and turning the music volume down to nothing leaves the faces still.
- **Reduced motion is not consulted** (*decided* 2026-11-25). The first build held the faces still
  under `prefers-reduced-motion: reduce`, and the user's own machine reports exactly that: "sway
  on, gus near, music on, no sway". They wanted the motion, and nothing else in the game — ships
  flying, ore drifting, the now-playing line — asks the OS first, so this one doesn't either. A
  smaller motion under that setting is the obvious thing to add if someone ever needs it, and is
  left in **Not in this build**.
- **A gallery preview** (*decided*: "gallery preview in"). `src/designer/faces.ts` gets a sway
  toggle and a tempo slider and drives the faces it already shows, including the fake radio line
  at 26px, which is the size the motion really has to read at.
- **Not live audio analysis** (*mine*): an `AnalyserNode` on the music gain would follow any track
  with no data, but a reactive bob always trails the beat by a few frames plus the envelope, and a
  lagging dip on a 26px face reads as loose, not musical. A hand-set tempo with the phase pinned
  to the audio position is exact, testable, and costs one number per track. Under "Not doing".

### The shape of the nod (*decided* 2026-11-25, after the first look)

Revised from the first build. The user's words: "would it be possible to sway all but the boxes?",
and "it's all plain rotation... could it be more 3d in a sense, like turning head left right (for
some), up down (others), tilt (like now, others still)". So the motion moves the **face, not its
glass** — the little screen stays put and the features turn inside it — and each voice turns a
different way.

- **The glass never moves.** `renderFace` wraps every layer but the screen in one
  `<g class="features">`, and a pose sets that group's SVG `transform`. The screen, its rim and its
  gradient stay where they are, which is also what makes a "turn" read on a flat drawing.
- **One cycle is `every` beats**: Gus 2, Pip 1, generic 1, station 4.
- **The accent** is one lobe of a skewed sine and then its mirror: `k(p) = ±sin(π u^0.7)`, with
  `u = 2p` in the first half and `u = 2p - 1` in the second. Quick off the beat, slow back, zero
  twice a cycle. The mirror gives a yaw a turn to each side and a tilt a lean each way.
- **Three ways to turn, and one still**:
  - `yaw` (Pip): the features slide across by `amount` box units and squash `turn` across, so the
    head turns to one side and back.
  - `pitch` (Gus): they rise and drop by `amount` and squash `turn` downwards, so the head bobs.
  - `tilt` (generic): they roll by `amount` degrees, about the middle of the box.
  - `still` (station): nothing. The station is a screen on a wall.
- Starting numbers: Gus `{ every: 2, kind: "pitch", amount: 4.5, turn: 0.1 }`, Pip
  `{ every: 1, kind: "yaw", amount: 5, turn: 0.12 }`, generic `{ every: 1, kind: "tilt", amount: 2.2 }`,
  station `{ every: 4, kind: "still", amount: 0 }`. The first build's amounts were too small to
  read at 26px; these are a box unit or two more.
- A missing `sway` falls back to the generic voice's, like every other layer, so a new alien voice
  sways before anyone draws anything for it.
- Everything is in the face's own 100 × 66 box, so the same numbers hold at 26px and at 110px.

## What to build

### 1. The tempo, the nod, and the gallery preview (*built* 2026-11-25, revised same day)

Nothing in the corner changes in this step.

- `src/music.json`: `bpm` on all four tracks (and `beat` only where the first downbeat is late).
  Tuned by ear against `public/music/`, once, and left. `Track` in `src/music.ts` carries
  `bpm: number` and `beat?: number`; `usableTracks` reads them and gives a missing or silly `bpm`
  (outside 50 to 200) a 100 default rather than dropping the track.
- `src/voices.json`: a `sway` block next to `face` per voice, as in the numbers above.
  `src/faces.ts` types it (`Nod`), exports `swayFor(voice)` with the generic fallback, and reads
  it out of the same file with the same `DATA` type, which grows a `sway?: Nod` field.
- `src/sway.ts`, pure and clock-free: `swayAt(nod, bpm, position)` returns
  `{ tilt: number; lift: number }` in box units, and `cycleSeconds(nod, bpm)`. No DOM, no
  `performance.now`, so the same numbers give the same pose.
- `src/designer/faces.ts`: a "sway" checkbox and a `bpm` slider in the header. When it is on, a
  `requestAnimationFrame` loop poses every face on the page with `swayAt` and the same clock, and
  a small square blinks on the beat so the phase can be seen. Off leaves the page exactly as it
  is today.

**Stop here for the user to try.** Judging motion needs no song: open the gallery (see below),
turn the tempo up and down, and read the faces at 26px in the fake radio line.

Built as below, with these differences:
- `poseTransform` (the pose as CSS) lives in `src/sway.ts` too, as pure code with no DOM. It takes
  a `scale` (`size / FACE_BOX.h`) instead of importing `FACE_BOX`, so `sway.ts` imports nothing
  and the same pose means the same shape at 26px and at 110px. It rounds to a twentieth of a
  pixel, so a still face writes nothing.
- The **bpm numbers are measured, not heard**: a throwaway onset-envelope script read the four
  files (`aerosol-of-my-love` 100, `disco-con-tutti` 115, `funkorama` 102, `your-call` 119). They
  are close but nobody has checked them by ear, and no `beat` offset is set. Step 1 is where they
  get confirmed or corrected.
- The gallery preview gives every face **its own voice's nod**, not one nod for the page, so Gus
  and Pip can be compared side by side. A beat square sits between the sliders, and each heading
  says how that voice moves ("Gus — nods up and down").
- The options boxes **don't** sway: they are still figures to compare shapes against.
- The bpm numbers are no longer measurements: **incompetech publishes them** in its catalogue
  (`pieces.json`, fetched 2026-11-25), so all seven tracks carry the source's own tempo. The `beat`
  offsets are still unset, nobody having lined a downbeat up by ear.
- Three more tracks arrived from the user while this was being built, all Kevin MacLeod, all
  CC BY 4.0 per the catalogue: "Funky Chunk" (115), "ZigZag" (80) and "Who Likes to Party" (117),
  in `src/music.json` and `CREDITS.md`.

### 2. The log moves with the track (*built* 2026-11-25)

- `MusicPlayer` (`src/music.ts`) gets `get position(): number | null` — the element's
  `currentTime` while a track is playing, else null.
- `src/main.ts` builds the beat state once a frame from `music.playing`, `music.position` and
  `audio.muted`, and hands it to `radio.update(...)`. Muted or no track means null.
- `src/radio.ts` keeps the face element on each `Shown` line and poses it each frame. The strength
  is eased in and out over about a third of a second, so a track starting or a fade to silence
  settles the faces instead of snapping them. A pose is written only when it changed by more than
  a tenth of a unit, so a still corner does no work.
- No CSS is needed for the motion: the pose is an SVG `transform` on the features group, so it
  turns about the middle of the face box by construction and no `transform-box` or pixel scale has
  to be got right.
- ~~`prefers-reduced-motion: reduce` turns the sway off~~: dropped 2026-11-25 after the user's
  machine reported it and silenced a motion they wanted. Under **Not in this build**.

**Stop here for the user to try.**

Built as below, with these differences:
- The pose is rounded (0.02 box units, 0.02 degrees, 0.005 of a squash), not written per frame
  once it changes at all: a still corner writes nothing. Since the pose is in the box's own units,
  there is no pixel scale to convert any more.
- The dev HUD (`?dev`) shows a `Sway` line: the tempo and position the faces are following, or the
  one reason they are still (no track, no audio position, muted, volume at zero). It answers "why
  isn't it moving" without guessing — which is how the reduced-motion gate was found.
- `music.level` at zero stills the faces along with mute, since the plan's picture says a music
  volume at nothing leaves them still.
- `Beat` (`{ bpm, position }`: the track's tempo and its own seconds) is defined in `src/radio.ts`,
  where it is used, and the beat is read before `updateMusic` runs, so a new track shows on the
  faces a frame later.

## How we'll know

- `src/sway.test.ts`: `swayAt` is periodic in `position` by exactly `cycleSeconds`; it is zero
  either side of the accent and negative (a drop) at it; a bigger `bounce` drops further and the
  tilt never exceeds `tilt`; `position` beyond the track length and negative offsets don't throw;
  the same input twice gives the same pose.
- `src/faces.test.ts`: every voice resolves a `sway` (own or generic); `every` is 1 to 8, `tilt`
  and `bounce` sit inside the box's numbers; a voice with no `sway` in the file gets generic's.
- `src/music.test.ts`: every usable track has a `bpm`; a missing or out-of-range one falls to 100
  and the track is still usable.
- `npm test`, `npm run build`. No sim change at all, so no-player runs and parity are untouched,
  and nothing new is saved (`SAVE_VERSION` stays).
- **Try it:** `npm run dev`, press `F`. Turn on "sway", drag the tempo, and watch a face and its
  26px copy in the fake radio line — does it nod, or does it wobble? Then `npm run dev`, start a
  new game and fly out to the field so a track starts: the faces in the top right dip with the
  beat, Gus heavier and slower than Pip, and they settle when the track fades. Press `M` and they
  hold still; press it again and they pick the beat back up where the song is.

## Needs first

- Faces with a voice and a mood per line: built (`src/faces.ts`, `src/voices.json`, `src/radio.ts`).
- Music with a current track and a real audio position: built (`src/music.ts`); the `position`
  getter and the `bpm` field are this build's first small change.
- Mute and volume: built (`src/audio.ts`, `muted`, the Settings menu).

## Not doing

- Live `AnalyserNode` loudness driving the motion (under the picture: it lags the beat).
- CSS keyframe animation at a fixed tempo (it can't follow the track's real position, and would
  drift or restart on every track).
- A settings switch for the motion: volume and mute govern it (*decided*).

## Not in this build

- Faces anywhere but the radio log (world pings, the shop, the news board).
- Motion that reacts to the mood as well as the character (a scared shiver, a happy bounce).
- The world moving with the beat (engine hum, station lights, the now-playing line).
- Station radio and per-place tracks (`docs/music-plan.md`, step 3 onward).
- More ways to sway, for new faces (S-70): this build has `yaw`, `pitch`, `tilt` and `still`, and
  the user's call is that new faces should pick from more than three.
- A gentler sway under `prefers-reduced-motion: reduce` instead of none, if someone asks for it.
- Downbeat offsets (`beat`) per track: the tempos come from incompetech's catalogue, but nobody has
  lined the first beat up by ear, so the dip may sit a fraction off on a track that starts on an
  anacrusis.
