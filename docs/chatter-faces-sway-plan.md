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
  The face already says how someone feels; the nod says who they are. Gus is a heavy, slow drop;
  Pip is quick and light off the beat; plain traffic is a small, even dip; the station is bolted
  down and barely tips (*mine* — veto it after watching step 1).
- **Volume and mute govern it** (*decided*: "let volume/mute govern"): there is no new switch.
  A track that isn't playing has no beat, and mute counts as not playing, so `M` stops the sway
  and turning the music volume down to nothing leaves the faces still.
- **Reduced motion is respected** (*mine*): with `prefers-reduced-motion: reduce` the faces hold
  still. The game has no other animation of this kind today, so this is the first one to ask.
- **A gallery preview** (*decided*: "gallery preview in"). `src/designer/faces.ts` gets a sway
  toggle and a tempo slider and drives the faces it already shows, including the fake radio line
  at 26px, which is the size the motion really has to read at.
- **Not live audio analysis** (*mine*): an `AnalyserNode` on the music gain would follow any track
  with no data, but a reactive bob always trails the beat by a few frames plus the envelope, and a
  lagging dip on a 26px face reads as loose, not musical. A hand-set tempo with the phase pinned
  to the audio position is exact, testable, and costs one number per track. Under "Not doing".

### The shape of the nod (*mine*, tune in the gallery)

Small, mostly on the accent. Reading at 26px is what decides it: a wide, gentle swing dies at
that size, so the motion is one clear dip per cycle with a soft return, and a slow tilt.

- One cycle is `every` beats (a "nod"): Gus 2, Pip 1, generic 1, station 4.
- `bpm` gives the cycle length, `cycle = every * 60 / bpm` seconds, and the phase is
  `p = ((position - beat) / cycle) mod 1`.
- The accent is a skewed sine, quick in and slow out, which is what a nod is:
  `k = sin(2πp) * 0.65 + sin(4πp) * 0.35`.
- `lift = -bounce * max(0, k)` — the face drops into the beat and comes back up (SVG y is down).
- `tilt = tiltAmount * k` — it tips with the same accent, so the drop and the lean are one motion,
  never two.
- Starting numbers for the gallery: Gus `{ every: 2, tilt: 2.4, bounce: 1.1 }`, Pip
  `{ every: 1, tilt: 3.2, bounce: 1.6 }`, generic `{ every: 1, tilt: 1.4, bounce: 0.7 }`,
  station `{ every: 4, tilt: 0.8, bounce: 0 }`.
- A missing `sway` falls back to the generic voice's, like every other layer, so a new alien voice
  sways before anyone draws anything for it.
- Values are in the face's own 100 × 66 box (`FACE_BOX`), so `tilt` is degrees and `bounce` is box
  units, and the same numbers hold at 26px and at 110px.

## What to build

### 1. The tempo, the nod, and the gallery preview

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

### 2. The log moves with the track

- `MusicPlayer` (`src/music.ts`) gets `get position(): number | null` — the element's
  `currentTime` while a track is playing, else null.
- `src/main.ts` builds the beat state once a frame from `music.playing`, `music.position` and
  `audio.muted`, and hands it to `radio.update(...)`. Muted or no track means null.
- `src/radio.ts` keeps the face element on each `Shown` line and poses it each frame. The strength
  is eased in and out over about a third of a second, so a track starting or a fade to silence
  settles the faces instead of snapping them. A pose is written only when it changed by more than
  a tenth of a unit, so a still corner does no work.
- `index.html`: `#chatter svg.face { transform-box: fill-box; transform-origin: 50% 62%;
  will-change: transform; }` — the pivot sits low so the face tips from its chin, the way a head
  does.
- `prefers-reduced-motion: reduce` turns the sway off (`window.matchMedia`, read per frame so it
  follows the OS setting).

**Stop here for the user to try.**

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
