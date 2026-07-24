---
id: LORE-259
title: >-
  lore: harmonize error/usage/success message phrasing across commands
  (missing-arg templates, misdirecting bad-id hint, unexplained '(doc)' label)
status: To Do
assignee: []
created_date: '2026-07-24 22:01'
labels:
  - cli-ux
  - errors-output
dependencies: []
references:
  - src/commands/link.ts
  - src/commands/tasks.ts
priority: low
type: bug
ordinal: 361000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
One consistent voice for lore's usage/error/success messages across commands, and hints that point at the command that actually does the job.

## Observed (real run) — three inconsistencies in the same error/UX class
1. **Misdirecting hint.** A bad/unknown concept id on 'lore link' hints to run 'lore check' to list concept ids — but 'lore check' prints only a summary count (e.g. '5 files, 0 errors, 0 warnings'), NOT an id list. Listing ids is 'lore query' / 'lore graph's job. The hint should point there. (Locate the exact hint in link's concept-resolution error path.)
2. **Inconsistent missing-arg templates.** For the SAME 'missing concept id' error class, 'lore link' (no args) says "`lore link` needs a concept id" (names the command) at src/commands/link.ts:823, while 'lore tasks' (no args) says "missing concept <id>" (no command name, different placeholder style) at src/commands/tasks.ts:257. Two templates for one error class.
3. **Unexplained success label.** 'lore link'/'lore unlink' success output ('TASK-1: added (doc), back-ref added') leaves '(doc)' unexplained unless the reader already knows it refers to the 'doc:' back-ref label.

## Why it matters
These are the first messages a new user meets. A hint that points at the wrong command, two phrasings for one error, and an unexplained token each add friction and erode trust in the CLI's polish — cheap to fix, high signal pre-v1.

## Direction
Pick one usage-error template (command-named + placeholder + actionable hint) and apply it everywhere; repoint the id-listing hint to 'lore query'/'lore graph'; make the link/unlink success line self-explanatory (e.g. 'back-ref (doc: label) added') or drop the bare '(doc)'.

## Refs
src/commands/link.ts:823, src/commands/tasks.ts:257 (the two missing-arg templates); link.ts concept-resolution error path (the misdirecting hint); link.ts success renderable (the '(doc)' label).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 'missing required arg' usage errors across commands use a single consistent template (command name + placeholder + actionable hint); link and tasks no longer diverge.
- [ ] #2 The bad/unknown-concept-id hint points at a command that actually lists ids (lore query or lore graph), not lore check; verified by triggering the error.
- [ ] #3 The link/unlink success output no longer shows a bare, unexplained '(doc)' — the doc: back-ref is named clearly.
- [ ] #4 Existing output/error tests updated to the harmonized phrasing; full suite green.
<!-- AC:END -->
