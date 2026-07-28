---
id: LCLI-61
title: >-
  docker/e2e never asserts failure output: add a step_fail helper and pin the
  stderr ErrorEnvelope + stdout-silence contract (incl. LORE-58 induced partial
  failure)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:15'
labels:
  - e2e
  - testing
  - cli-contract
dependencies:
  - LCLI-56
references:
  - docker/e2e/run-e2e.sh
  - docs/reference/cli-contract.md
  - src/commands/link.ts
priority: high
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A multi-agent coverage audit of docker/e2e (2026-07-19, dev @ b8a4667; every finding adversarially verified against the script and source) found that **zero of the harness's 82 recorded assertions inspect failure output**. The `step` helper (run-e2e.sh L43-63) asserts exit codes only; no step anywhere asserts the stderr ErrorEnvelope shape, the `error_type`↔exit-code alignment, or that stdout stays EMPTY on a nonzero exit — the cli-contract.md "stdout parses or stays silent" invariant (cli-contract.md:299-343).

Concretely uncovered today:

- The five exit-class spot checks (L346-356) are bare exit codes. The exit-5 step even runs with `--json`, so its conflict envelope sits visible-but-unasserted in report.jsonl. The exit-6 step's NAME claims to distinguish validation from drift (L355) but the assertion is exit-only — validation and drift share exit 6, so the distinction is only observable via `error_type` on stderr.
- The LCLI-58 fix (link/unlink partial back-ref failure → stdout silent, ErrorEnvelope on stderr with the per-task report in `.input`, exit 6) has ZERO E2E coverage: no step induces a back-ref or backlog-commit failure. A regression back to the exact LCLI-58 bug (success-shaped envelope on stdout at exit 6) would pass the entire harness. Unit mocks already proved insufficient for this class once.
- The two missing-binary probe steps (L209, L214) never assert the documented install-hint stderr text (visible in report.jsonl, unasserted).

Why this is the highest-leverage E2E gap: the machine-readable error surface is the contract agents consume, and it is the one axis with literally no coverage. The audit proposed a `step_fail` helper (asserts exit + empty stdout + a jq filter over stderr, recording to report.jsonl in the existing record/log idiom) as the prerequisite for all failure-output assertions — re-derive the exact shape against the current script at execution time.

An induced real write failure (e.g. `chmod 555 backlog/tasks` around a `lore link --json` call, restored after) is sufficient to exercise the LCLI-58 path against the real pinned binary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A step_fail helper exists in run-e2e.sh asserting all three of: expected exit code, EMPTY stdout, and a jq filter over stderr — recording to report.jsonl in the existing record/log idiom
- [x] #2 The five exit-class spot checks assert the failure-output contract via step_fail, including error_type literals; the exit-6 step actually distinguishes validation from drift as its step name claims
- [x] #3 An induced real back-ref write failure exercises the LORE-58 path E2E: link/unlink --json exits 6 with stdout EMPTY and an ErrorEnvelope on stderr carrying the per-task report in .input
- [x] #4 The two missing-binary probe steps assert the documented install-hint text on stderr
- [x] #5 The full harness runs green against the real pinned upstream binary with all new assertions, and teardown is clean
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Re-verified all file:line references in the filing task against current dev
HEAD (docker/e2e/run-e2e.sh, 366 lines total) -- all still accurate: step()
helper L43-63, exit-class spot checks L346-357, missing-binary probes L209/L214.

1. AC1: Add a `step_fail <name> <expected_exit> <jq-filter> -- <cmd...>` helper
   next to `step`/`step_json`, following the identical idiom (mktemp out/err,
   run, classify, `record` to report.jsonl, `log`, cleanup). Asserts all three:
   exit code == expected, stdout is EMPTY (`[ ! -s "$out" ]`), and `jq -e
   "$filter" "$err"` true against the stderr ErrorEnvelope JSON (cli-contract.md
   S5.2: error_type/message/hint/input).

2. AC2: Rewire the five Phase 24 exit-class spot checks (L346-357) to pass
   --json and use step_fail with an `.error_type == "..."` filter matching
   cli-contract.md S5.3's table (usage/not_found/denied/conflict/validation).
   The exit-6 case is split into two step_fail assertions under the same
   phase: one for error_type=validation (existing missing-type fixture) and
   one for error_type=drift, reusing AC3's induced LCLI-58 write-failure
   (below) so the step actually demonstrates the two share exit 6 but are
   told apart by error_type, per the step's own name.

3. AC3: Seed a dedicated TASK4 (never linked elsewhere, so it doesn't disturb
   Phase 10 orphans' TASK3 assumption). Locate its on-disk backlog/tasks/*.md
   file via `find -iname`. Remove write permission on both the file (chmod
   444) and its containing directory (chmod 555) -- covers Bun.write's
   in-place overwrite (governed by the file's own bit) and any
   temp-file+rename pattern (governed by the directory's bit) without having
   to know Backlog.md's exact internal write strategy. Run `lore link
   $STORY_ID $TASK4 --json` under these restricted perms and assert via
   step_fail: exit 6, error_type=drift, `.input.tasks[].backRef == "failed"`
   for TASK4 (the per-task report threaded into .input per link.ts's
   backRefFailure()). Restore perms, then repeat symmetrically for `lore
   unlink` (give TASK4 a real backref first under normal perms, then
   re-induce the same write failure for unlink) since LCLI-58's fix and the
   AC's wording cover both commands.

4. AC4: Add --json to the two missing-binary probe steps (L209, L214) and
   switch to step_fail asserting error_type=not_found and `.hint | contains
   ("backlog-json-patch.md")` (RUNBOOK_HINT's stable distinguishing
   substring, src/adapters/backlog.ts:103).

5. AC5: Run `docker compose -f docker/e2e/docker-compose.yml up --build`
   (~2-3 min) to green, always follow with `down -v` even on failure. A green
   `bun test` alone is not acceptable evidence for this task (campaign
   convention, confirmed in the tracker).

6. Adversarial review of the branch diff before opening the PR (independent
   subagent, not self-review -- caught a real defect in LCLI-67 last session).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation: added step_fail(name, expected_exit, jq_filter, -- cmd) to run-e2e.sh
next to step/step_json, asserting exit code + EMPTY stdout + a jq filter over the LAST
LINE of stderr (see below for why last-line, not whole-file). Wired it into: the two
missing-binary probes (AC4, .hint contains RUNBOOK_HINT's stable substring
"backlog-json-patch.md"); the exit 2/3/4/5 spot checks (AC2, added --json to each,
asserting .error_type literals per cli-contract.md S5.3); a NEW error_type=validation
ErrorEnvelope check (AC2's validation half, see finding below); and a NEW LCLI-58
induced write-failure block covering both `lore link` and `lore unlink` (AC3, AC2's
drift half).

Two real findings surfaced only by running against the real binary (not assumed from
docs), both now reflected in the harness itself:

1. Several commands (lore tasks, lore link/unlink, lore sync -- anything that
   loadBundle-scans the whole bundle) print `warning: skipping X: no frontmatter
   mapping` advisory lines to stderr AHEAD of the --json ErrorEnvelope on a failure.
   step_fail parses only the LAST line of stderr as the envelope, not the whole file.

2. `lore validate` and `lore check` are GATES (ADR-0007), like their doc comments say:
   a per-file finding (e.g. missing `type:`) reports as ordinary `validate.report`/
   `check.report` DATA on stdout with a nonzero exit -- they never throw, so there is
   no stderr ErrorEnvelope for this case. The filing task's exit-6 spot check assumed
   `lore validate`'s exit 6 WAS the error_type=validation ErrorEnvelope case; it is
   not. Fixed by: (a) keeping a stdout-based gate assertion for lore validate's real
   behavior (now checks kind+errorCount, not just the exit code), and (b) adding a
   genuinely thrown error_type=validation case via a malformed .lore/config.toml,
   which `lore sync` reads/validates up front and fails loud on (src/config.ts
   loadConfig) -- unlike check, which folds a config error into its own report
   instead of throwing.

Evidence: `docker compose -f docker/e2e/docker-compose.yml up --build` green twice
(first run caught the 6 real issues above via genuine failures, not test bugs; second
run after the fixes: 88 passed, 0 failed, exit 0, report at
docker/e2e/results/report.jsonl). `down -v` teardown clean both times. `bun test`:
1500 pass / 0 fail (not sufficient evidence alone per campaign convention, but no
regression). `bash -n docker/e2e/run-e2e.sh` syntax-clean.

Adversarial review (independent subagent): no blocking findings; called the diff solid after tracing every jq filter's precedence and every source call site (errors.ts, backlog.ts, link.ts, sync.ts, validate.ts, config.ts). Applied its one worthwhile nice-to-have: tightened the TASK4 find pattern from a bare prefix glob to an exact "${TASK4} - *.md" match (Backlog's own naming separator) so a future TASK-4/TASK-40 collision can't silently resolve to the wrong file. Re-verified green after the change: docker compose up --build -> 88 passed, 0 failed, exit 0; down -v clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a step_fail helper to docker/e2e/run-e2e.sh asserting the full --json failure-output contract (exit code, empty stdout, stderr ErrorEnvelope via jq), wired into the five exit-class spot checks (with error_type literals) and two new LCLI-58 induced write-failure cases (link + unlink) that exercise the drift error_type end-to-end against the real pinned binary. Verified with two full docker compose e2e runs: the first (pre-fix) genuinely failed 6/87 assertions, surfacing two real findings (stderr can carry advisory warning lines ahead of the JSON envelope; lore validate/check are gates that report findings as stdout data, never a thrown ErrorEnvelope) which are now reflected correctly in the harness; the second run was green at 88 passed/0 failed, exit 0, teardown clean. bun test: 1500 pass/0 fail (no regression).
<!-- SECTION:FINAL_SUMMARY:END -->
