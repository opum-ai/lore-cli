---
id: LORE-65
title: >-
  docker/e2e coupling mediums: field-isolated write read-backs, multi-doc SET
  semantics, backlog-side renames/archive, ADR-0012 commit scoping, nested
  checkout
status: To Do
assignee: []
created_date: '2026-07-19 22:59'
labels:
  - e2e
  - testing
  - backlog-fork
  - adapter
dependencies:
  - LORE-56
references:
  - docker/e2e/run-e2e.sh
  - src/adapters/backlog.ts
  - src/core/state.ts
priority: medium
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A multi-agent coverage audit of docker/e2e (2026-07-19, dev @ b8a4667; adversarially verified) confirmed four medium-tier gaps in the real-binary Backlog coupling — each dependent on real git or real backlog semantics that unit fakes cannot exercise:

**1. Writes never read back at field granularity; multi-doc SET/REPLACE never runs.** link/unlink assertions cannot isolate the label from the doc ref ("removed" fires on hadLabel OR hadDoc; a residual doc entry after unlink means re-link's "added" is satisfiable by the label alone) — a partial-write bug (mangled --add-label comma-join while --doc lands, or vice versa; src/adapters/backlog.ts:784-794) passes every current assertion. The multi-concept --doc case (a task linked from two docs: link must preserve the other doc's ref, unlink must remove only its own) never runs. LORE-57 was precisely a write-side flag mismatch against the real binary.

**2. Backlog-side file moves.** (a) The pinned binary's --title edit renames the task FILE — never flowed end-to-end through sync's sweep commit; (b) the renamed path never verified to flow into the managed-block link href; (c) an archived linked task (backlog task archive) — whether it reads as missing via the exit-1-null signature and what sync/check exit with is an undetermined real semantic: run exploratory once, then pin the observed behavior. Title edits and archiving are everyday operations. (porcelainPaths rename-branch parsing itself is already unit-pinned against real git in test/state.test.ts — the gap is the end-to-end residue.)

**3. ADR-0012 commit scoping never inspected.** No step inspects a lore-authored commit's file list (backlog/ only), no step pre-stages a non-backlog change and asserts it survives unswept, and no task title with ()[]* metacharacters ever exercises the :(literal) pathspec quoting (src/core/state.ts:89-91) through real git. A scoping regression silently commits a developer's in-flight work under lore's authorship — data-loss-adjacent.

**4. Nested checkout dead code path.** porcelainPaths' --show-prefix translation (state.ts:257-262) is dead in every run — the harness always git-inits /workspace itself, so the prefix is always empty. A regression breaks every per-write and sweep commit for any project nested in a monorepo (the code comment documents the exact double-prefix failure mode). Needs a small fixture: a git root ABOVE the lore project dir.

The audit produced concrete proposed steps for each — re-derive against the current script at execution time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Write read-backs are field-isolated against the real task record (label and doc ref asserted separately), and the multi-doc SET/REPLACE case (one task linked from two docs) pins preserve-the-other-doc semantics on both link and unlink
- [ ] #2 A backlog-side --title edit file rename is swept by sync and the managed-block href follows the renamed file; the archived-linked-task behavior is pinned (exploratory run first, then a fixed expectation)
- [ ] #3 A lore-authored commit file list is inspected (backlog/ paths only), a pre-staged unrelated file survives unswept, and a metachar-titled task exercises the :(literal) pathspec path through real git
- [ ] #4 A nested checkout (git root above the lore project) exercises the --show-prefix translation: link back-ref commits succeed and scope correctly
- [ ] #5 The full harness runs green against the real pinned upstream binary, and teardown is clean
<!-- AC:END -->
