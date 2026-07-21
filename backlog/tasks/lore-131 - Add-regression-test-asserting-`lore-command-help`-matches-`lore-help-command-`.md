---
id: LORE-131
title: >-
  Add regression test asserting `lore <command> --help` matches `lore help
  <command>`
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-meta-c
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
test/help.test.ts:263-268 only tests that `lore help` (no command) and `lore --help` (no command) render byte-identical text; no test in test/help.test.ts or test/cli.test.ts exercises `lore <command> --help` against `lore help <command>` for any actual command. This is exactly the combination broken by the cli.ts:168 short-circuit (see the paired finding), and cli.test.ts:87-90 only checks that a stray flag isn't swallowed by `--help`, not per-command help routing — so the gap went undetected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A new test in test/help.test.ts asserts `lore <command> --help` output is byte-identical to `lore help <command>` output for at least one representative command (e.g. `query`).
- [ ] #2 The new test fails against the current (unfixed) cli.ts:168 short-circuit behavior and passes once that behavior is corrected, confirming it actually exercises the routing gap.
<!-- AC:END -->
