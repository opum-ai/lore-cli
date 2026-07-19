---
id: LORE-61
title: >-
  docker/e2e never asserts failure output: add a step_fail helper and pin the
  stderr ErrorEnvelope + stdout-silence contract (incl. LORE-58 induced partial
  failure)
status: To Do
assignee: []
created_date: '2026-07-19 22:58'
labels:
  - e2e
  - testing
  - cli-contract
dependencies:
  - LORE-56
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
- The LORE-58 fix (link/unlink partial back-ref failure → stdout silent, ErrorEnvelope on stderr with the per-task report in `.input`, exit 6) has ZERO E2E coverage: no step induces a back-ref or backlog-commit failure. A regression back to the exact LORE-58 bug (success-shaped envelope on stdout at exit 6) would pass the entire harness. Unit mocks already proved insufficient for this class once.
- The two missing-binary probe steps (L209, L214) never assert the documented install-hint stderr text (visible in report.jsonl, unasserted).

Why this is the highest-leverage E2E gap: the machine-readable error surface is the contract agents consume, and it is the one axis with literally no coverage. The audit proposed a `step_fail` helper (asserts exit + empty stdout + a jq filter over stderr, recording to report.jsonl in the existing record/log idiom) as the prerequisite for all failure-output assertions — re-derive the exact shape against the current script at execution time.

An induced real write failure (e.g. `chmod 555 backlog/tasks` around a `lore link --json` call, restored after) is sufficient to exercise the LORE-58 path against the real pinned binary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A step_fail helper exists in run-e2e.sh asserting all three of: expected exit code, EMPTY stdout, and a jq filter over stderr — recording to report.jsonl in the existing record/log idiom
- [ ] #2 The five exit-class spot checks assert the failure-output contract via step_fail, including error_type literals; the exit-6 step actually distinguishes validation from drift as its step name claims
- [ ] #3 An induced real back-ref write failure exercises the LORE-58 path E2E: link/unlink --json exits 6 with stdout EMPTY and an ErrorEnvelope on stderr carrying the per-task report in .input
- [ ] #4 The two missing-binary probe steps assert the documented install-hint text on stderr
- [ ] #5 The full harness runs green against the real pinned upstream binary with all new assertions, and teardown is clean
<!-- AC:END -->
