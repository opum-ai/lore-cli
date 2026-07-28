---
id: LORE-270
title: >-
  backlog-cli-contract.md §2.4 says the label flags are single-value last-wins,
  but v1.48.0 made all four repeatable accumulators
status: Done
assignee:
  - '@lore-e2e'
created_date: '2026-07-26 12:46'
updated_date: '2026-07-26 16:22'
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
- [x] #1 The document states one consistent Backlog.md version as its pinned floor, and that version is reconciled with the 'at or past PR #790' statement elsewhere in the same file
- [x] #2 §2.4's multiplicity claims for --labels/-l, --label, --add-label and --remove-label match the pinned version, verified against real upstream source at that tag (not the patched binary on PATH and not the local fork checkout) with a citation a later reader can reproduce
- [x] #3 Every other version-conditional claim in backlog-cli-contract.md is checked against the chosen pin and corrected or explicitly confirmed accurate
- [x] #4 It is stated explicitly whether lore's current writes are affected (link/unlink pass a single value per flag; orphans passes no filters), so a reader does not infer a behaviour bug that does not exist
- [x] #5 architecture.md's adapter sketch is either corrected or explicitly marked illustrative; full suite and lore check stay green and the diff contains no src/ changes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read docs/reference/backlog-cli-contract.md fully; confirm §2.4's label-flag
   multiplicity claim and the two conflicting version statements (line ~15
   'v1.47.1 tested floor' vs lines ~20-22 'at or past PR #790').
2. Verify PR #790's real merge state via GitHub API (real upstream
   MrLesk/Backlog.md, not the local patched fork/checkout): merge commit sha,
   merge date, and its ancestry relative to the latest tag (v1.48.0). Confirm
   v1.48.0 is an ancestor of the PR #790 commit (git compare), so the pinned
   build is a superset of v1.48.0.
3. Fetch real upstream src/cli.ts at tag v1.47.1 and v1.48.0 and diff them;
   locate the exact `-l/--labels` (task list), `-l/--label`, `--add-label`,
   `--remove-label` option definitions and confirm createMultiValueAccumulator()
   was added in v1.48.0 (absent in v1.47.1). Cite exact upstream lines at the
   v1.48.0 tag. Confirm --assignee/-a and --doc/--ref/--dep/--modified-file are
   unaffected.
4. Sweep every other version-conditional claim in the file against v1.48.0 (and
   the PR #790 commit / current main where relevant): create/edit output format,
   task view/archive exit codes, board/milestone --plain behavior, status icon
   mapping, status defaults, and edit-idempotency/updated_date/frontmatter-key
   behavior in src/core/backlog.ts + src/file-system/operations.ts +
   src/markdown/serializer.ts. Found a second real drift: pre-v1.48.0 updateTask
   unconditionally bumped updated_date on every edit (no idempotency guard) —
   this only became true in v1.48.0.
5. Verify lore's own writes are unaffected (AC#4): read src/adapters/backlog.ts
   (listTasks/createTask/editTask all comma-join into a single flag occurrence,
   never repeat a flag) and src/commands/link.ts/unlink.ts/orphans.ts (single
   label per editTask call; orphans passes no listTasks filters at all).
6. Rewrite backlog-cli-contract.md: reconcile the intro version-pin statement,
   rewrite §2.4 with dated citations and the lore-is-unaffected consequence,
   correct §2.5 for the idempotency finding, and re-date the Appendix's
   "confirmed in v1.47.1" list to v1.48.0.
7. Sweep peer docs (backlog-json-schema.md, ADRs) for restated multiplicity
   claims — found none beyond generic --add-label mechanism mentions, which
   remain accurate and untouched.
8. Handle architecture.md's stale adapter sketch (~line 138, secondary AC#5):
   found it more stale than flagged (also describes the pre-LORE-54
   fork-consumption model and the old 'exits 0 on missing' behavior). Marked
   the TS interface sketch explicitly illustrative/non-authoritative with a
   citation-backed caveat, and directly corrected the two clearly-wrong prose
   bullets (fork/git-dependency framing, exit-code-0 claim) since those fixes
   were cheap and unambiguous.
9. Check CHANGELOG precedent via `git show` on LORE-265's fix-pass commits
   (docs-only, zero CHANGELOG.md touches) and decide accordingly.
10. Verify: bun test, bun run typecheck, bun run lint, bun run lore check, and
    confirm zero src/ diff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified against real upstream MrLesk/Backlog.md (GitHub API + raw.githubusercontent.com), NOT
the local patched --json fork/checkout, per the task's explicit constraint.

Version facts (GitHub API, checked 2026-07-26):
- Tags up to v1.48.0 (newest, released 2026-07-12). No v1.49+ tag exists.
- PR #790 ("Add stable JSON output to read commands") merged 2026-07-16, merge
  commit 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0 (matches the sha already cited
  in the doc). `compare/v1.48.0...22a091b5` -> ahead_by 10, behind_by 0: v1.48.0
  is an ancestor of the PR #790 commit, so lore's actual pinned build (at or past
  PR #790) is necessarily a superset of v1.48.0. Diffed src/cli.ts at v1.48.0 vs
  the PR #790 commit vs current main (babd1d2, 2026-07-19): zero differences in
  label/assignee handling across all three - the accumulator behavior is stable
  from v1.48.0 through current main.

AC#2 central finding (src/cli.ts, tag v1.48.0, fetched via
raw.githubusercontent.com/MrLesk/Backlog.md/v1.48.0/src/cli.ts): `task edit`'s
`-l, --label` (line 2657), `--add-label` (line 2668), and `--remove-label`
(line 2673) all pass createMultiValueAccumulator() (defined line 223) - newly
converted in v1.48.0. At v1.47.1 (same file, same tag-fetch method) these same
three `task edit` flags had no processor argument at all (lines 2370, 2376,
2377 respectively) - confirmed by diffing the two tags' cli.ts directly.
`task list`'s `-l, --labels` (line 2269, v1.48.0) is a fourth flag carrying the
same accumulator, but it did NOT change between tags: at v1.47.1 it was
already declared with the identical createMultiValueAccumulator() processor
(command declared line 2010, help schema line 2022, option itself lines
2041-2045) - confirmed unchanged. `task create`'s -l/--labels (line 1691,
v1.48.0) and --assignee/-a (all commands, both tags) were NOT converted -
confirmed unaffected via the same diff (zero lines touch "label"/"assignee"
outside the three edit flags plus the already-accumulator list flag).
--doc/--ref/--dep/--modified-file already had the accumulator at v1.47.1 -
unchanged.

AC#3 sweep - every other version-conditional claim checked against v1.48.0/the
PR#790 build:
- §2.1 create output ("Created task <ID>" / "File:" lines): unchanged
  v1.47.1->v1.48.0->PR790->main (grep confirms identical strings all four
  places).
- §2.2 task view/archive exit-1-on-missing: confirmed live in the PR#790
  commit's cli.ts (taskCmd view action sets process.exitCode=1 unconditionally
  in every output branch; task archive does the same) - this is the behavior
  lore's build actually runs.
- §3.1 status defaults: DEFAULT_STATUSES/FALLBACK_STATUS constants byte-identical
  in src/constants/index.ts at v1.47.1 and v1.48.0 - confirmed accurate,
  untouched.
- §3.3 / Appendix status icons: src/ui/status-icon.ts at v1.48.0 matches the
  doc's icon table exactly (Done Y/green, In Progress u+25D2/yellow,
  Blocked ●/red, To Do ○/default, Review ◆/blue, Testing
  ▣/cyan, unknown->○) - confirmed accurate, untouched (just re-dated).
- Appendix board/--plain, milestone list --plain no-op: confirmed via
  addBoardOptions (only --layout/--vertical/--milestones, no --plain/--json
  declared at v1.48.0) and milestoneCmd "list" action (options.plain read but
  never branched on - always prints the same format) - both unchanged since
  v1.47.1 (zero diff lines).
- §2.5 edit idempotency - REAL SECOND DRIFT FOUND: diffed src/core/backlog.ts
  v1.47.1 vs v1.48.0. At v1.47.1, updateTask() unconditionally set
  task.updatedDate = new Date()... on every call (line ~1099), no comparison -
  so a no-op edit DID bump updated_date at v1.47.1, contradicting what the doc
  claimed. At v1.48.0, updateTask() (line 1406) added
  hasUpdatedDateRelevantChanges() (line 162, JSON.stringify comparison over a
  fixed field allowlist) and only stamps updatedDate when that differs -
  matching the doc's claim for the first time. Corrected §2.5 to date this
  precisely and added a precision note: saveTask() (file-system/operations.ts)
  still calls Bun.write unconditionally at both versions - "idempotent" means
  byte-identical written content (no git diff), not a skipped write syscall.
- serializer.ts fixed-key-set claim: diffed v1.47.1 vs v1.48.0 - only addition
  is a `type` key when present; frontmatter-dropping behavior otherwise
  unchanged - confirmed accurate, noted the one addition.

AC#4: confirmed in src/adapters/backlog.ts that listTasks/createTask/editTask
never repeat a flag - each comma-joins into one flag occurrence (lines ~838,
908, 946, 949), so the v1.48.0 accumulator change is behaviorally inert for
lore's writes either way. Confirmed via grep that link.ts/unlink.ts call
editTask with single-element addLabels/removeLabels arrays, and
orphans.ts's only listTasks() call passes no options at all. Stated explicitly
in the rewritten §2.4.

AC#5 architecture.md (~line 138): found MORE drift than flagged - the adapter
sketch also still describes the pre-LORE-54 fork-consumption model ("lore
consumes a fork... compiled as a local git dependency") and the old
"task view exits 0 on missing" claim, both superseded by the current,
already-corrected backlog-cli-contract.md. Chose: marked the TS interface
sketch explicitly illustrative/non-authoritative (cheap - a caveat block,
avoids redesigning the sketch's signature) with citations to
backlog-json-schema.md §4 and backlog-cli-contract.md §2.2; directly corrected
the two clearly-wrong prose bullets since those were one-line, unambiguous,
already-cited fixes. AC#5's second half (full suite + lore check green, zero
src/ diff) verified below.

Peer-doc sweep (backlog-json-schema.md, docs/adr/*.md): grepped for
"1.47.1"/"last-wins"/"accumulator"/"--add-label"/"--remove-label". Hits are
all about a DIFFERENT claim (the --json flag not existing in stock Backlog,
which remains true at v1.48.0 too - json landed in PR#790, after v1.48.0) or
generic mechanism mentions with no multiplicity claim. None restate the
label-flag last-wins/accumulator claim this task fixes - none needed changes.

CHANGELOG: checked `git show` on LORE-265's fix-pass commits (bbc084b, 7e07262,
24010c6, 9508c63, 135bb3b, 97f5cfe) - `git show --stat | grep CHANGELOG` returns
zero hits on every one; all are docs-only fixes to backlog-cli-contract.md /
ADR-0009 / backlog-json-schema.md, same file class as this task. Deliberately
omitted a CHANGELOG entry, matching this direct precedent (docs-only accuracy
fix, zero src/ changes, zero user-visible behavior change).

Verification: bun test -> 2181 pass, 0 fail (49 files); bun run typecheck
(tsc --noEmit) -> clean; bun run lint (biome check .) -> "Checked 112 files,
No fixes applied"; bun run lore check -> "40 files, 0 errors, 0 warnings";
git status --porcelain shows only the two docs/reference/*.md files plus this
task's own backlog/tasks/*.md - zero src/ changes.

Fix-gate round (request_changes -> fixed): closed all 7 reviewer findings on
docs/reference/backlog-cli-contract.md and 2 peer docs, without touching
src/ or docs/reference/cli-contract.md.

Root cause conceded: this task's own title ("v1.48.0 made all four repeatable
accumulators") was wrong. `task list`'s `-l`/`--labels` was ALREADY an
accumulator at v1.47.1 (real upstream src/cli.ts: taskCmd.command("list")
declared line 2010, help schema "repeat --labels or use label1,label2" line
2022, `.option("-l, --labels <labels>", ..., createMultiValueAccumulator())`
lines 2041-2045) - confirmed unchanged at v1.48.0 (same option, line 2269).
Only the three `task edit` flags (-l/--label, --add-label, --remove-label)
changed family in v1.48.0; at v1.47.1 they were line 2370/2376/2377 with no
processor arg (previous doc text cited fork-checkout line 513/524-525, which
does not reproduce against real upstream at either tag - that was the
blocking finding).

Both v1.47.1 and v1.48.0 source fetched two independent ways (raw.
githubusercontent.com + codeload tarball) with matching sha256, per repo
convention. All new line citations (2370, 2376, 2377, 2010, 2022, 2041-2045,
2928-2934, 2677, 2609-2611, serializer 51-70/51-71/68/83-95) verified against
the fetched files before writing, not copied from the review prompt.

Also fixed: dropped the false "still" on the --label/--add-label/--remove-
label combine guard (it's new in v1.48.0, cli.ts:2928-2934; 0 occurrences of
"Cannot combine" in v1.47.1's cli.ts); corrected the "two behaviors changed"
count to enumerate all of what actually changed (task-edit label-flag
accumulator conversion, the new combine guard, the new --clear-labels flag,
and §2.5's edit idempotency) in all three places it was asserted; scoped the
serializer sweep note precisely to the frontmatter key-set object (lines
51-70 v1.47.1 / 51-71 v1.48.0, gains only `type` at line 68) vs. the AC/DoD
section-emission logic that also changed (lines 83-95) but is out of scope
for that claim; fixed architecture.md's "§§2.2, 2.4" citation (only §2.2 is
topically relevant; §2.4 was a spurious addition, dropped); and reworded
backlog-json-schema.md's provenance note so it no longer singles out v1.47.1
now that the contract's floor is v1.48.0 (both lack --json).

Re-verified: bun test 2181 pass/0 fail (49 files); bun run lore check 40
files/0/0; bun run typecheck clean; bun run lint 112 files clean; git diff
--stat dev...HEAD -- src/ empty; docs/reference/cli-contract.md untouched.

Fix-gate round 2 (request_changes -> fixed): round-1's fix-gate pass had
already conceded the root cause above (task list's -l/--labels was already an
accumulator at v1.47.1) but left this section's own "AC#2 central finding"
paragraph and the mirrored paragraph in Final Summary both still asserting the
pre-round-1 claim - that all four label flags gained
createMultiValueAccumulator() in v1.48.0, citing the dead fork-checkout lines
513/524-525 - making the task record self-contradictory. Both paragraphs are
now corrected in place to scope the v1.48.0 change to the three `task edit`
flags only, citing the real upstream v1.47.1 line numbers (2370, 2376, 2377)
for those three flags; `task list`'s unchanged accumulator status is stated
consistently in both places now. Also re-verified the `src/markdown/
serializer.ts` AC/DoD emission range cited in the doc (was a single "83-95"
range that cut the DoD condition off mid-block; now split into the two real
hunks, 83-89 (AC) and 92-98 (DoD)), the `saveTask`/`Bun.write` precision note
(now cites both tags' actual line numbers: operations.ts 289/342 at v1.47.1,
389/443 at v1.48.0, rather than only the v1.48.0 number), the §2.5 "same tag"
typo (now reads v1.47.1, with `src/core/backlog.ts` lines 1089/1099 cited),
and the truncated "Cannot combine" quote (now quoted in full, `cli.ts:2930`).
The opening summary's and §2.5's "the others are" change-catalogues were both
extended to also name the two `serializer.ts` changes (the `type` key
addition and the AC/DoD emission logic change) that the document itself
already documented elsewhere but the catalogues omitted.

Re-verified again: bun test 2181 pass/0 fail (49 files); bun run lore check 40
files/0/0; bun run typecheck clean; bun run lint 112 files clean; git diff
--stat dev...HEAD -- src/ empty; docs/reference/cli-contract.md untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed docs/reference/backlog-cli-contract.md's §2.4 label-flag multiplicity claim
and reconciled the file's two conflicting version-pin statements, per real
upstream MrLesk/Backlog.md source (never the local patched fork).

Verified live (GitHub API + raw.githubusercontent.com, not the local build):
v1.48.0 is the newest tag (released 2026-07-12) and an ancestor of PR #790's
merge commit 22a091b5 (merged 2026-07-16) - so lore's actual "at or past PR
#790" build is necessarily a superset of v1.48.0. Diffed upstream src/cli.ts
at v1.47.1 vs v1.48.0: only three of the four label flags changed - `task
edit`'s `-l/--label` (line 2657), `--add-label` (2668), and `--remove-label`
(2673) all gained createMultiValueAccumulator() in v1.48.0 (absent at v1.47.1,
lines 2370/2376/2377 respectively) - repeats AND commas now both work there,
where v1.47.1 was last-wins. `task list`'s `-l/--labels` (line 2269, v1.48.0)
did NOT change - it was already an accumulator at v1.47.1 (lines 2041-2045)
and remains so, unchanged. `task create`'s -l/--labels and --assignee/-a were
NOT converted anywhere - confirmed unaffected. Rewrote §2.4 with these
citations, and reconciled the intro's version-pin statement (was "v1.47.1
tested floor", contradicting the "at or past PR #790" text 8 lines later) to
state the pin consistently.

Swept every other version-conditional claim in the file against v1.48.0
(AC#3): found and fixed a SECOND real drift in §2.5 - pre-v1.48.0 `updateTask`
(src/core/backlog.ts) unconditionally bumped `updated_date` on every edit, so
the doc's "idempotent, no updated_date churn" claim was false at v1.47.1 and
only became true at v1.48.0 (hasUpdatedDateRelevantChanges guard added).
Re-verified and confirmed-unchanged (not corrected): create/edit output
format, task view/archive exit codes, status defaults, status-icon mapping,
board/milestone --plain behavior, and the frontmatter fixed-key-set claim.

AC#4: confirmed in src/adapters/backlog.ts and src/commands/link.ts/unlink.ts/
orphans.ts that lore never repeats a flag (comma-joins into one occurrence)
and orphans passes no filters at all - stated explicitly in §2.4 that the
v1.48.0 change is behaviorally inert for lore's own writes.

AC#5: architecture.md's adapter sketch (~line 138) was more stale than
flagged - also described the pre-LORE-54 fork-consumption model and the old
"exits 0 on missing" claim. Marked the TS interface sketch explicitly
illustrative/non-authoritative with citations (backlog-json-schema.md §4,
backlog-cli-contract.md §2.2), and directly corrected the two clearly-wrong
prose bullets since those fixes were cheap and unambiguous.

Swept peer docs (backlog-json-schema.md, docs/adr/*.md) for restated
multiplicity claims - found none needing changes (existing --add-label/
--json-provenance mentions are a different, still-accurate claim).

CHANGELOG: deliberately omitted, per direct precedent checked via `git show`
on LORE-265's fix-pass commits (bbc084b, 7e07262, 24010c6, 9508c63, 135bb3b,
97f5cfe) - all docs-only fixes to the same file class, zero CHANGELOG.md
touches in any of them.

Verification actually run: bun test -> 2181 pass / 0 fail (49 files); bun run
typecheck (tsc --noEmit) -> clean, no output; bun run lint (biome check .) ->
"Checked 112 files in 95ms. No fixes applied."; bun run lore check -> "40
files, 0 errors, 0 warnings"; git status --porcelain confirms zero src/
changes (only the two docs/reference/*.md files plus this task's own
backlog/tasks/ record).

Fix-gate round 2: round-1's fix-gate pass corrected §2.4 and §2.5 in the doc
but left this Final Summary's "Verified live" paragraph above still asserting
the pre-round-1 claim (all four label flags gained the accumulator in
v1.48.0, citing the dead fork-checkout lines 513/524-525) - the same
self-contradiction the round-1 Implementation Notes had separately conceded
without fixing here. That paragraph is now corrected in place: only the three
`task edit` flags changed in v1.48.0 (real upstream v1.47.1 lines 2370/2376/
2377 for those three), and `task list`'s `-l/--labels` is stated as unchanged
since v1.47.1. Also re-verified: the doc's `saveTask`/`Bun.write` precision
note now cites both tags' real line numbers (operations.ts 289/342 at
v1.47.1, 389/443 at v1.48.0); the §2.5 "same tag" reference now correctly
reads v1.47.1 with `src/core/backlog.ts` lines 1089/1099 cited; the
`src/markdown/serializer.ts` AC/DoD emission range is now split into its two
real hunks (83-89 AC, 92-98 DoD) instead of one range that cut the DoD
condition off mid-block; the truncated "Cannot combine" quote is now quoted
in full (`cli.ts:2930`); and both of the document's "the others are"
change-catalogues now also name the two `serializer.ts` changes (the `type`
key addition and the AC/DoD emission logic change) the document itself
already documented elsewhere.

Re-verified again: bun test 2181 pass / 0 fail (49 files); bun run lore check
40 files/0/0; bun run typecheck clean; bun run lint 112 files clean; git diff
--stat dev...HEAD -- src/ empty; docs/reference/cli-contract.md untouched.
<!-- SECTION:FINAL_SUMMARY:END -->
