---
id: LCLI-55
title: 'Fix LORE-41 / PR #50 code-review findings'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:15'
labels:
  - cmd
  - core
milestone: m-6
dependencies:
  - LCLI-41
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A max-effort /code-review workflow run against PR #50 (feat/lore-41-scaffold-obsidian) surfaced 11 verified findings (6 correctness bugs, 2 test-coverage gaps, 3 cleanup items) in the just-shipped `lore scaffold obsidian` feature. This is the umbrella task; each finding is tracked as its own subtask so it can be fixed, reviewed, and verified independently.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All 11 subtasks completed, each with its own plan, notes, checked ACs, and final summary. Two findings (LCLI-55.1, LCLI-55.3) shared one root-cause fix: adding DOCS_DIR to buildObsidianScaffold's dirs array in src/core/consumer-scaffold.ts. Work done on feat/lore-55-pr50-review-followups, branched off dev after PR #50 (LCLI-41) merged as 8b37c57. Full suite: 1497 tests pass; typecheck, lint, and lore check all clean.

Also updated test/consumer-scaffold.test.ts's module docstring (lines 11-15) to note the LCLI-55 exception: obsidian now gets its own narrow rollback/pre-flight regression tests despite sharing writeAllOrRollback with docusaurus, since its bug was in buildObsidianScaffold's own dirs list (a per-target plan defect), not the shared primitive -- the original docstring's blanket 'not re-tested per target' claim would otherwise have been directly falsified by LCLI-55.1/.3's new tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed all 11 code-review findings against LCLI-41's obsidian scaffold (PR #50): 3 correctness bugs (rollback leaking docs/ on a never-initialized repo; a shared mutable OBSIDIAN_GUIDANCE_NOTES array; a clobber-preflight blind spot on docs/ itself -- the latter two resolved as one fix), 1 stale-docs finding across the published CLI reference (cli-surface.md/cli-contract.md), 4 stale docstring/comment findings in src/core/consumer-scaffold.ts and src/commands/scaffold.ts, 2 test-coverage gaps, and 1 dead-code cleanup (collapsed KNOWN_TARGETS/IMPLEMENTED_TARGETS to one set). Verified throughout: full test suite (1497 pass), typecheck, lint, and lore check all clean.
<!-- SECTION:FINAL_SUMMARY:END -->
