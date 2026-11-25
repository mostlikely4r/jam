# Music plan: funk under the work

Written 2026-11-25, after a talk about music. The game has only placeholder synthesized sounds
(`src/audio.ts`). This plan adds music tracks, starting with the one place the user picked:
funk playing while the ship works. Nothing here is built yet.

## Why

- **The feel** (*decided*, the user's own words): disco, soul and funk, sometimes spacey or
  floaty. JAM is partly a nod to music and is meant to be funny and whimsical.
- **The reference** (the user's): the start of Daft Punk's *Digital Love* video, an astronaut
  cleaning his ship and swinging along, in the flow of looking after it. That is the floating
  idle mining dream (`docs/vision.md`). Daft Punk is a mood reference only. None of their
  music goes in the game.
- **Funk under the work comes first** (*decided*). Hunt music and the rest come later (see
  **Not in this build**).
- **The premise is a guess**: that funk playing under mining puts the player in that flow. It
  hasn't been played. So step 1 is the smallest version that can be tried, and stops there.

## The picture

- **Music plays while the ship is at work** (*decided*: "funk under the work"). Mining,
  hauling and trips are work. Docked, it fades out and no new track starts. The rule
  for "at work" below is my proposal.
- **Gaps between tracks** (my proposal). Funk wants to be on more than ambient music does, but
  a short quiet gap between tracks keeps it from becoming a wall of sound.
- **A now-playing line** (my proposal) shows briefly when a track starts: title, artist and
  licence. It also serves as the attribution.
- **A Credits page** in the pause menu, and `CREDITS.md` in the repo (my proposal).
- **Menu controls** (my proposal, from the user's "a little music selector in the menu"):
  Off / Occasional / Always, a music volume separate from the main one, and Skip.
- **Tracks are data**: each one has a mood (`funk` or `floaty`). Place-bound tracks and the
  other later ideas then add a field instead of reworking the player.

### Licence rule (*decided* in effect: the repo is public)

The repo is public and the build is meant for GitHub Pages, so every track file is shared
with anyone who opens it. Only **CC0** and **CC BY** (3.0 or 4.0) tracks go in. Anything
non-commercial (NC), no-derivatives (ND) or "free for videos only" stays out. Checked
2026-11-25: freetouse.com's free licence bans video games (even free ones) and bans sharing the
files, so the user's two tracks from there can't be used. A test enforces the allowlist (step 2).

## What to build

### 1. One track under the work, and the now-playing line (*built* 2026-11-25)

The smallest version that can be tried.

Built as below, with these differences:
- The scheduler also takes `docked`. A track fades only on docking (or Off); merely going
  idle in space lets it play out, and the gap counts only while at work.
- "Moving" means faster than 20 units a second (`MUSIC_TIMING.crawl`).
- Shots carry no owner, so a `shot` event within 4 ship radii of the ship counts as its own
  (that is what catches auto-mining). Ore taken shows as `sim.oreIn` going up.
- The wait counts frame seconds while unpaused (capped at 0.1 s a frame, like the game). A
  throttled background tab runs it slow, along with the game.
- A track whose licence isn't on the list is dropped at load with a console warning
  (`usableTracks`). The guard test itself is in step 2.
- Checked in the browser with a synthesized test tone (removed): it fades in, the line
  shows, it pauses with the menu, and Skip fades it out and starts the gap.
- The user's first four tracks are in (Kevin MacLeod, CC BY 4.0, all marked `funk`):
  "Aerosol of my Love", "Disco con Tutti", "Funkorama", "Your Call". About 27 MB.
- `CREDITS.md` was pulled forward from step 2, since the files ship in the public repo now.
  Step 2 still has the README line, the in-game Credits page and the guard test.
- A refused `play()` (not a broken file) counts as the track ending, so a gap and another
  try follow instead of the player waiting forever (from review).

- **Track list:** `src/music.json`, an array of
  `{ id, file, title, artist, licence, source, mood, attribution? }`.
  - `file` is a path under `public/music/` (Vite serves `public/` at the root, and
    `base: "./"` keeps it relative for Pages).
  - `licence` is one of `"CC0"`, `"CC BY 3.0"`, `"CC BY 4.0"`.
  - `source` is the URL the track came from.
  - `mood` is `"funk"` or `"floaty"`.
  - `attribution` is optional: the exact credit text, when the source asks for a specific one.
- **The player:** a new module `src/music.ts`, split in two.
  - **A pure scheduler**, testable without a browser. Each frame it takes
    `{ atWork, paused, mode, playing, now }` and returns what to do: start a track (which one),
    fade out, or nothing.
  - **A thin browser part.** It plays the file through an `HTMLAudioElement` and a
    `MediaElementSource` into a music gain node, which connects to the existing master gain in
    `Audio` (`src/audio.ts`). That way Mute (M) and the main volume cover music too.
- **"At work"** (my proposal, to tune after trying). The player's ship is out of the dock, the
  game isn't paused, no start menu or designer is open, and in the last 20 seconds of game time
  at least one of these was true:
  - it moved faster than a crawl;
  - it thrusted;
  - it shot or pulled with the tractor;
  - it picked up ore;
  - it flew on a course (click move or autopilot).

  Auto-mining counts, because it's the ship that's busy, not the hands. Use the ship's own
  state (`sim.baseAt(sim.ship)` for docking, `sim.ship.firing`, velocity, the click pilot's
  course). The sim events (`shot`, `pickup`) don't say whose they are, so they aren't enough
  on their own.
- **Timing** (my proposal):
  - The first track starts 10–20 s after work begins.
  - Fade in over 3 s.
  - On docking, fade out over 5 s and start nothing new.
  - On the pause menu, the track pauses, and resumes where it was.
  - Fast-forward (`timeScale`) doesn't touch music.
  - The gap after a track is a random 30–90 s of work.
  - Never play the same track twice in a row while there is more than one.
  - Pick a `funk` track 3 times in 4 and a `floaty` one 1 in 4, falling back to whatever moods
    exist.
- **Now-playing line:** a small line, bottom left, for 6 s when a track starts:
  `♪ Title · Artist · CC BY 4.0`. It fades out and never covers the radio log. It goes in
  `index.html` and its CSS, and `main.ts` shows it.
- **Browsers block audio before a click or key.** Nothing plays until `audio.start()` has run,
  as for the sound effects today.
- **No tracks** (an empty `music.json`, or a file that fails to load): the game runs silent
  with no error shown. A failed file is skipped for the rest of the session and logged to the
  console once.
- **For trying before tracks are committed:** nothing special. The user drops a licensed file
  in `public/music/` and adds its entry.

Stop here for the user to try.

### 2. Menu, credits and the licence guard

- **Settings** in the pause menu, under the existing Volume and Mute:
  - **Music:** Off / Occasional / Always.
    - Always is the default: the gaps above.
    - Occasional: gaps of a random 3–8 minutes of work.
    - Off: never starts, and fades out one that's playing.
  - **Music volume**, 0–100, default 60.
  - **Skip**, shown only while a track plays. It fades the track out and starts the gap.
  - Kept in the existing `jam-settings` localStorage object (`loadSettings` and `saveSettings`
    in `main.ts`), with defaults for old saves that lack the new keys.
  - No new key binding in this build.
- **Credits:** a "Credits" button in the pause menu opens a page listing each track's title,
  artist, licence, source link and `attribution` text if given, built from `music.json`.
  Same look as the existing help page.
- **`CREDITS.md`** at the repo root, with the same list.
- **README:** one line pointing to `CREDITS.md`. Name no later music feature there.
- **Guard test** (`src/music.test.ts`). Every entry in `music.json`:
  - has a licence from the allowlist;
  - has a non-empty title, artist and source;
  - has a file that exists in `public/music/`;
  - appears in `CREDITS.md` by title and artist.

## How we'll know

- **Unit tests** (`src/music.test.ts`, in the fast suite), for the scheduler:
  - no start before the first delay;
  - starts once at work;
  - fades out on docking and starts nothing while docked;
  - holds while paused;
  - never repeats a track twice in a row when there are two;
  - Off never starts;
  - Occasional gaps are longer than Always gaps;
  - Skip leads to a gap, then a new track;
  - an empty list never starts.

  Also the guard test above, and the settings loader with old saves.
- `npm test` and `npm run build` pass.
- **Try it:** put one CC BY funk track in `public/music/` with its entry, `npm run dev`, and
  start a game. Undock and mine a rock. Within about 20 s the track fades in and the
  now-playing line shows its name. Dock: it fades out. Undock and keep mining: after the gap,
  another track starts (or the same one, if it's the only one). Open the menu: it pauses;
  close it: it carries on. In step 2, switch to Off and the music fades out, and Credits lists
  the track.

## Needs first

- **At least one CC0 or CC BY funk track**, chosen by the user (taste is theirs). The build
  works and passes without one. The game is simply silent, and the guard test passes on an
  empty list. But the Try it line needs a track. Places to look: Free Music Archive and
  OpenGameArt with the licence filter set to CC BY or CC0, and Kevin MacLeod (incompetech,
  CC BY).
- Already there: `Audio` with a master gain (`src/audio.ts`), the pause menu settings and
  `jam-settings` (`src/main.ts`), `sim.baseAt` for docking, and `base: "./"` in
  `vite.config.ts`. There is no `public/` folder yet; this build makes it.

## Not doing

- **Music as a danger warning.** No score that starts because a pirate is near. It would tell
  the pilot more than they know, and turn "Hiding from the pirate" into a sound cue. A warning
  must come from something real in the world (see the pirate radio below).
- **Freetouse.com tracks**, or any NC, ND or video-only licence (see the licence rule).

## Not in this build

Parked as S-67 in `BACKLOG.md`:

- **Hunt music:** rockier, starts when the player commits to a hunt (locks a target). It
  follows the player's choice, never a warning. Mood reference: Daft Punk's *Aerodynamic*.
- **Place tracks:** a track that plays only at one place (a cloud, the far base), heard there
  first, so music is part of discovery. The selector could later grey out tracks not yet found.
- **Station radio and pirate radio:** music comes from a source in the world and fades with
  distance. Pirates broadcast their own station, and hearing it fade in under your funk is a
  real early warning from a real ship in range (pillar 1). A surprise, so it stays out of the
  README.
