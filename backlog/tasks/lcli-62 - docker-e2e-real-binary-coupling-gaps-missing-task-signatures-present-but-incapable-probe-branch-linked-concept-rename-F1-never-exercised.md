---
id: LCLI-62
title: >-
  docker/e2e real-binary coupling gaps: missing-task signatures,
  present-but-incapable probe branch, linked-concept rename (F1) never exercised
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:23'
labels:
  - e2e
  - testing
  - backlog-fork
  - adapter
dependencies:
  - LCLI-56
  - LCLI-61
references:
  - docker/e2e/run-e2e.sh
  - src/adapters/backlog.ts
  - src/commands/rename.ts
priority: high
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A multi-agent coverage audit of docker/e2e (2026-07-19, dev @ b8a4667; adversarially verified) found three high-risk real-binary coupling paths with zero E2E coverage — all in the exact LCLI-57/58/59/60 bug class the harness exists to catch (upstream Backlog.md output-shape drift that mocked unit tests cannot see):

**1. Missing-task signatures never observed.** lore's classification of "task missing" rests on two raw output contracts with the pinned binary, neither ever exercised: viewTask's exit-1-plus-EMPTY-stdout signature (src/adapters/backlog.ts:696-715) and editTask's `/not found/i` stderr regex (backlog.ts:799). Every dependent path is untested: link's fail-before-write not_found/exit-3 on a nonexistent id; sync/check exit 3 when a linked task id vanishes; `lore tasks` soft-dropping a dangling id (stderr warning, exit 0). The harness never references a task id Backlog does not know (run-e2e.sh L165-190 links only valid TASK1/TASK2; the drift injection at L255 changes doc status, not task existence). If upstream changes its missing-task output shape, lore silently reclassifies not_found-3 as drift-6 or drops tasks — only a real-binary test can see it.

**2. Capability-probe exit-6 branch runs against nothing.** Only the missing-binary half of the LCLI-60 split is tested (exit 3, twice: L209/L214). The present-but-incapable half — version below the 1.47.1 floor, or version-capable but the dry `task list --json` probe fails (probeBacklog, backlog.ts:154-221) → validation/exit 6 refusing coupling commands — never runs, because the image ships only the capable pinned build (Dockerfile L27-53). A 3-line stub shell script on a shadowed PATH (one printing an old semver, one printing non-JSON) covers both variants cheaply. This is the branch that fires the day upstream's --json output drifts.

**3. rename's Backlog coupling never fires.** rename only ever targets the Reference doc (L293), which has no linked tasks — the Story, the only linked concept, is never renamed. So moveBackRefs (real `task edit` label/--doc moves against the real binary), the per-write backlog commit, and rename's unique F1 failure asymmetry (success-shaped rename.result envelope STILL on stdout WITH exit 6 by return on a back-ref/commit failure — src/commands/rename.ts:203, deliberately different from link/unlink's throw) all have zero coverage. Same shells-real-backlog class that produced LCLI-57.

The audit produced concrete proposed steps for each (raw-signature checks against `backlog task view/edit` of a nonexistent id; a hide-the-task-file mv around check/sync/tasks; PATH-shadowed stub binaries; a linked-concept rename plus a chmod-induced F1 case) — re-derive against the current script at execution time. F1 and the install-hint assertions need the step_fail helper from LCLI-61.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Raw-signature checks pin the pinned binary itself: task view of a nonexistent id exits 1 with empty stdout; task edit of a nonexistent id reports not-found on stderr
- [x] #2 lore-level consequences pinned: linking a nonexistent task id fails before writing (not_found/exit 3, frontmatter untouched); a vanished linked task makes check and sync exit 3; lore tasks soft-drops the dangling id (exit 0, warning on stderr)
- [x] #3 Stub binaries on a shadowed PATH exercise the probe exit-6 branch both ways: version below the floor, and version-capable but not --json-capable
- [x] #4 A LINKED concept rename exercises moveBackRefs and the per-write backlog commit against the real binary (envelope fields, the real task record, and a clean backlog/ tree asserted), and the F1 asymmetry — exit 6 by return with rename.result still on stdout — is pinned under an induced back-ref failure
- [x] #5 The full harness runs green against the real pinned upstream binary, and teardown is clean
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AC1/AC2 (new Phase 3c + Phase 5b in docker/e2e/run-e2e.sh):
   - AC1: raw `backlog task view <bogus-id> --json` (exit 1, empty stdout) and
     `backlog task edit <bogus-id> --status "In Progress"` (nonzero exit, stderr matches
     /not found/i) against the pinned binary directly, no lore involved.
   - AC2a: `lore link "$SPEC_ID" <bogus-id> --json` fails before any write (not_found/exit 3);
     assert the Spec's frontmatter never got the bogus id.
   - AC2b/c: seed a throwaway TASK5, link it to the (otherwise-idle) Spec concept, `mv` its
     backlog/tasks/*.md file aside to simulate Backlog forgetting it, then:
     - `lore sync "$SPEC_ID" --json` -> exit 3, EMPTY stdout (gatherReconciliation is awaited
       before sync's emit() ever runs - verified in src/commands/sync.ts).
     - `lore check docs/spec --json` -> ALSO exit 3, but stdout is NOT empty: check.ts emits
       its check.report BEFORE rethrowing the reconciliation error (src/commands/check.ts
       ~L157-164; confirmed by test/check.test.ts:887's own regression test). This is a real
       asymmetry step_fail's "empty stdout" assumption does not cover - use a bespoke check.
   - AC2d: `lore tasks "$SPEC_ID" --json` soft-drops the dangling id: exit 0, id absent from
     `.data.tasks`, a stderr warning naming it (src/commands/tasks.ts resolveRollup/warnDangling).
   - Restore: mv TASK5's file back, `lore unlink` it from the Spec to leave state clean for
     later phases.

2. AC3 (new Phase 3c in run-e2e.sh, right after the existing missing-binary probe tests):
   Two PATH-shadowed stub `backlog` scripts (mirrors the existing /tmp/no-backlog-path
   symlink-farm, but this time supplying a fake `backlog` instead of omitting it):
   - stub A: `--version` always prints "1.40.0" (below the 1.47.1 floor) -> probeBacklog's
     step 2 fails -> validation/exit 6.
   - stub B: `--version` prints "1.47.1" (>= floor), any other args print non-JSON plain text
     exit 0 -> probeBacklog's step 3 (`task list --json`) fails to parse -> validation/exit 6.
   No cross-process probe cache exists today (confirmed: capability is memoized only inside
   one in-process BacklogAdapter instance, and each `lore` CLI invocation is a fresh process),
   so `env PATH=<stub-dir> lore tasks "$STORY_ID" --json` reliably re-runs the probe each time.
   Assert both via step_fail: exit 6, `.error_type == "validation"`, hint contains
   "backlog-json-patch.md".

3. AC4 (new Phase 15b in run-e2e.sh, right after the existing Phase 15 Reference-doc rename):
   Phase 15's existing rename only ever targets the unlinked Reference doc. Add two more
   renames of the STORY (the linked concept, TASK1+TASK2 so far):
   - Rename 1 (success path): `lore rename "$STORY_ID" stories/e2e-renamed-story --json`.
     Assert `.data.backRefs` are all moved/already-current, `.data.backlogCommit.committed
     == true`, the real TASK1 backlog record's documentation array now has the new path
     (`backlog task view "$TASK1" --json`), and `git status --porcelain -- backlog/` is
     clean afterward. Update $STORY_ID/$STORY_PATH to the new id/path.
   - Rename 2 (F1 induced failure): chmod 444 both TASK1's and TASK2's backlog/tasks/*.md
     files + chmod 555 backlog/tasks (mirrors LCLI-58/61's induction pattern), then
     `lore rename "$STORY_ID" stories/e2e-renamed-story-f1 --json`. Assert exit 6 BY RETURN
     (src/commands/rename.ts:203 - a `return`, never a `throw`, confirmed in source) with
     `rename.result` STILL on stdout and `backRefs[].backRef == "failed"`, AND that the file
     itself still moved (rename commits the file move before attempting the Backlog side).
     Restore permissions, update $STORY_ID/$STORY_PATH to the final id/path so every later
     phase that references the Story keeps working.

4. AC5: run `docker compose -f docker/e2e/docker-compose.yml up --build`, iterating fixes
   against the real harness (2-3 min/cycle) rather than writing the whole diff blind; always
   `down -v` after, including on failure.

5. Adversarial review of the branch diff, then the standard finalization/PR/merge/tracker-
   advance/handover sequence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Extended docker/e2e/run-e2e.sh with three new phases (all against the real pinned Backlog.md
binary, no mocks):

- Phase 3c (AC3): two PATH-shadowed stub `backlog` scripts exercise probeBacklog's
  present-but-incapable branch (exit 6, validation) that the harness never reached before —
  one reporting a version below the 1.47.1 floor, one version-capable but returning non-JSON
  for `task list --json`. Confirmed no cross-process probe cache exists today (memoized only
  inside one in-process BacklogAdapter; each `lore` invocation is a fresh process), so a plain
  `env PATH=<stub-dir>` per call is sufficient.

- Phase 5b (AC1/AC2): raw `backlog task view/edit` signatures against a nonexistent id (derived
  from a real captured id's own prefix, not a hardcoded guess, to avoid a bogus-format false
  failure); `lore link` fail-before-write on a bad id; a linked task vanishing (its backlog file
  mv'd aside) driving `lore sync` fail-loud (empty stdout, exit 3) and `lore check` ALSO exit 3
  but with its check.report still emitted to stdout first — a genuine, previously undocumented
  asymmetry confirmed against src/commands/check.ts and test/check.test.ts's own regression test
  (check emits before rethrowing; sync's throw happens before its own emit ever runs). `lore
  tasks` soft-drops the dangling id (exit 0 + stderr warning) as the contrasting case.

- Phase 15b (AC4): renamed the STORY (the harness's one linked concept) instead of only the
  unlinked Reference doc Phase 15 already covered — exercising moveBackRefs's real `task edit`
  label/--doc move and rename's per-write backlog commit for the first time, then a second
  rename with TASK1+TASK2's backlog files chmod'd read-only to induce a back-ref failure,
  confirming the F1 asymmetry at src/commands/rename.ts:203 (exit 6 by RETURN, not throw --
  rename.result stays on stdout, unlike link/unlink's throw).

Iterated against the real Docker harness (not written blind): first run surfaced 4 failures, all
in the new assertions, not the underlying lore behavior --
  1. a step_json filter that spanned multiple physical lines via backslash-continuation inside a
     single-quoted string embedded literal `\<newline>` bytes into the jq program (jq's lexer,
     unlike bash's `eval`, does not treat that as whitespace) -- collapsed to one line;
  2. an F1 assertion wrongly required empty stderr -- every bundle-loading command (rename
     included) unconditionally flushes routine "skipping non-concept index.md" advisories to
     stderr, so nonempty stderr proves nothing; the real signature (rename.result still on
     stdout despite a nonzero exit) doesn't need it;
  3. used "docs/spec" instead of the project's actual "docs/specs" directory;
  4. compared a message string against the CLI-displayed uppercase task id ("TASK-4") when
     Backlog's own error messages/frontmatter use the lowercase form ("task-4").
Second run: 108 passed, 0 failed, exit 0.

Verification: `docker compose -f docker/e2e/docker-compose.yml up --build` green (108
passed/0 failed, exit 0; `down -v` clean both runs). `bun test`: 1500 pass/0 fail (no src/
changes in this task -- docker/e2e/run-e2e.sh only).

Independent adversarial review (subagent) found one real, fixable finding: the F1 assertion's
jq filter used \`A and (.data.backRefs[]? | .backRef == "failed")\` -- a generator inside \`and\`,
where jq -e only inspects the LAST emitted value, not "any" element. It passed only because both
linked tasks happened to fail identically in this harness's data shape (coincidental, not
constructional, correctness) -- a future harness edit (e.g. a third linked task not
permission-blocked) could silently flip the outcome without any real regression. Fixed to
\`(.data.backRefs | any(.backRef == "failed"))\`, verified the distinction with a standalone jq
repro, then reran the full docker/e2e harness: 108 passed/0 failed, exit 0, teardown clean.
No other findings survived review (probe stubs, missing-task signatures, sync/check asymmetry,
Story rename variable lifetime across later phases, and the F1 exit-code mechanism itself were
all independently verified against source).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extended docker/e2e/run-e2e.sh with three real-binary E2E phases closing the LCLI-62 audit's coverage gaps: (1) Phase 3c exercises probeBacklog's present-but-incapable exit-6 branch via two PATH-shadowed stub backlog binaries (below-floor version; version-capable but non-JSON); (2) Phase 5b pins the raw task view/edit missing-task signatures against the pinned binary directly, then the lore-level consequences -- link fail-before-write, sync fail-loud/empty-stdout vs check's exit-3-with-report-still-emitted asymmetry (a genuine, previously undocumented divergence confirmed against src/commands/check.ts and test/check.test.ts), and tasks' soft-drop; (3) Phase 15b renames the Story (the harness's one linked concept) instead of only the unlinked Reference doc, exercising moveBackRefs, the per-write backlog commit, and the F1 exit-6-by-return asymmetry (src/commands/rename.ts:203) under an induced back-ref failure. Verified with two full docker/e2e harness runs (108 passed/0 failed, exit 0, clean teardown each time) plus bun test (1500/1500, no src/ changes). An independent adversarial subagent review found one real issue (a jq generator/and construction in the F1 assertion that passed only by coincidence, not by correctly testing 'any backRef failed') -- fixed to use any(...), reverified with a third full harness run (108/108 again).
<!-- SECTION:FINAL_SUMMARY:END -->
