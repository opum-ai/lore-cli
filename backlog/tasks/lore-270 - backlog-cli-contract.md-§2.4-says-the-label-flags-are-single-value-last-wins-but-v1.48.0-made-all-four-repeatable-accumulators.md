---
id: LORE-270
title: >-
  backlog-cli-contract.md §2.4 says the label flags are single-value last-wins,
  but v1.48.0 made all four repeatable accumulators
status: To Do
assignee: []
created_date: '2026-07-26 12:46'
labels:
  - docs-drift
  - adapter-backlog
  - cmd-meta-a
dependencies: []
priority: medium
type: bug
ordinal: 372000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
`docs/reference/backlog-cli-contract.md` §2.4's flag-multiplicity table should describe the Backlog.md version lore actually runs against, so an agent reading it does not build a wrong argv.

## Observed
Found by the LORE-265 review gate (round 5, wave 1) while auditing an adjacent claim; deliberately left out of LORE-265's scope because it is a different drift class.

§2.4 (approx. lines 181-198) lists `--labels`/`-l`, `--label`, `--add-label`, `--remove-label` under "Single-value, last-wins (NO accumulator)", stating that repeating the flag keeps only the last value (`-l A -l B` -> `Labels: B`).

That was **true at v1.47.1**, which the document explicitly pins as its tested floor (approx. line 15). In **v1.48.0** all four are declared with `createMultiValueAccumulator()` (upstream `src/cli.ts` around lines 2269, 2657, 2668, 2673) and the CLI help now says "repeatable".

The `backlog` binary on PATH in this project is a locally built patched fork whose base is past v1.47.1, and the same contract document states lore consumes a build "at or past the PR #790 merge commit" — so the doc's own pinned floor is behind what lore actually runs. Two statements in the same file disagree about which version governs.

## Why it matters
This file is the canonical reference for how lore drives the third-party `backlog` CLI, and it is written to be read by agents constructing argv. "Repeating the flag keeps only the last value" is precisely the kind of claim an agent acts on — it would coalesce multiple labels into one flag to avoid a clobber that no longer happens, or avoid a legitimate repeated-flag form. This project's standing lesson applies: a confidently-worded but wrong doc is worse than a missing one.

Note this does NOT affect correctness of lore's current writes: `link`/`unlink` use `--add-label`/`--remove-label` with a single value each (`src/adapters/backlog.ts` around line 946), and `orphans` passes no filters at all. The defect is documentation accuracy, not behaviour.

## Direction (decide in plan)
Decide first **which version the document pins** — updating the floor to the version lore actually consumes is probably right, but that has ripple effects across the file's other version-conditional claims, so check them all rather than editing §2.4 alone. Verify the accumulator claim against real upstream source at the chosen tag (not against the patched binary on PATH, and not against the local fork checkout — the LORE-265 review found a citation that pointed at the fork tree and would not reproduce for a later reader). `backlog task list --help` / `backlog task edit --help` on the real binary are useful corroboration.

## Secondary (fold in if cheap, else note as out of scope)
`docs/reference/architecture.md` (approx. line 138) sketches the adapter interface as `listTasks(opts?: { status?: string })` — omitting `labels`, omitting `searchTasks` entirely, and giving `BacklogTask` a `file` field the real task-list summary does not carry (per `backlog-json-schema.md` §4's "No path field"). It is clearly an illustrative sketch rather than a normative contract, but it sits next to material LORE-265 just made precise.

## Refs
`docs/reference/backlog-cli-contract.md` (§2.4 approx. lines 181-198; the version pin approx. line 15), `docs/reference/architecture.md` (approx. line 138), `src/adapters/backlog.ts` (`editTask` argv construction, approx. line 946; `ListTasksOptions` approx. lines 693-700), upstream MrLesk/Backlog.md `src/cli.ts` at the relevant tag, LORE-265 (Done — the review pass that surfaced this).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The document states one consistent Backlog.md version as its pinned floor, and that version is reconciled with the 'at or past PR #790' statement elsewhere in the same file
- [ ] #2 §2.4's multiplicity claims for --labels/-l, --label, --add-label and --remove-label match the pinned version, verified against real upstream source at that tag (not the patched binary on PATH and not the local fork checkout) with a citation a later reader can reproduce
- [ ] #3 Every other version-conditional claim in backlog-cli-contract.md is checked against the chosen pin and corrected or explicitly confirmed accurate
- [ ] #4 It is stated explicitly whether lore's current writes are affected (link/unlink pass a single value per flag; orphans passes no filters), so a reader does not infer a behaviour bug that does not exist
- [ ] #5 architecture.md's adapter sketch is either corrected or explicitly marked illustrative; full suite and lore check stay green and the diff contains no src/ changes
<!-- AC:END -->
