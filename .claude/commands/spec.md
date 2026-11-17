---
description: Write what we agreed in this thread into a plan in docs/, ready to build in a fresh thread
argument-hint: "[short name, e.g. turret]"
---

Write the design we agreed in this thread to `docs/$ARGUMENTS-plan.md` (pick a short name if none
is given; if a plan for it already exists, update that one). Don't write code.

- Follow the style of `docs/fitting-plan.md`: date, why, the picture, then what to build.
- Only what was decided. Leave out options we rejected, and don't mention them except under a
  short "Not doing" list if a fresh reader might reintroduce them.
- Mark the user's own calls *decided*; mark my proposals as such.
- Make it self-contained: someone with no access to this chat must be able to build from it.
  Name the files and systems it touches, the rules, edge cases, and how we'll know it works
  (tests, or what to try in the game).
- Keep anything that would spoil a surprise for players out of this public file, or ask first.

Commit the plan, then reply with its path and the line to start the build:
`/build docs/<name>-plan.md`, to paste into a new thread.
