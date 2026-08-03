---
id: LCLI-162
title: >-
  replace: validate expanded output, not just matched span, against managed
  ranges
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - core-replace
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: medium
type: bug
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In applyReplacement (src/core/replace.ts:174-203), overlapsManaged(start, matched.length) at line 194 only checks the byte span of the ORIGINAL matched input before splicing `expand(match, text)` into the result at line 197. The expansion can itself contain arbitrary surrounding document text via the \`$\`\` and $' template tokens (see expandTemplate, lines 252-283), which copy the document prefix/suffix verbatim. If that copied text happens to contain a managed-block marker string (e.g. INDEX_BLOCK_BEGIN/END from src/core/indexes.ts, or the tasks-block markers), replace splices a duplicate marker into the document with no post-expansion check, corrupting the managed-block invariant that locateManagedBlock/managedRanges relies on elsewhere in this file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Add a regression test in test/replace.test.ts where a find/replace with `--regex` and a template using $` or $' produces expansion text that would contain an INDEX_BLOCK_BEGIN/END (or tasks-block) marker string, and assert the replace is rejected or the offending match is skipped rather than silently duplicating the marker into the output.
- [x] #2 After the fix, running replace with such a pattern either throws a usage-level LoreError explaining the marker collision, or excludes that match from substitution (leaving it and the marker pair untouched) — it must never leave two copies of a managed-block marker in the resulting document.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read applyReplacement/expandTemplate in src/core/replace.ts to confirm the exact hazard: overlapsManaged() checks only the ORIGINAL matched span before expand() (regex $`/$' tokens) splices in verbatim document prefix/suffix that can carry an existing managed-block marker.
2. Fix: after the whole-document result is assembled in applyReplacement, re-validate it with the existing managedRanges() (same locators: locateManagedBlock for lore:index, locateTaskBlock for lore:tasks) via a new assertNoInjectedMarker() helper. A malformed/duplicated marker caught there is re-thrown as a usage LoreError (naming this replacement as the cause) rather than propagating managedRanges' own validation error (which reads as 'the input file was already broken').
3. Add regression tests in test/replace.test.ts: (a) $` copying a preceding index block duplicates INDEX_BLOCK_BEGIN/END -> usage LoreError; (b) $' copying a following tasks block duplicates TASK_BLOCK_BEGIN/END -> usage LoreError; (c) a $` expansion that stays clear of any marker still replaces normally (no false positive).
4. Mutation-check: stash the replace.ts fix, confirm the two new tests fail (77 pass/2 fail); restore, confirm 79/79 pass.
5. bun test (full suite) and bun run typecheck must be clean.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: applyReplacement now re-validates the fully assembled result via a new assertNoInjectedMarker() helper that calls the existing managedRanges() (same locateManagedBlock/locateTaskBlock locators) after the replace loop, before returning. A $`/$' expansion that spliced an existing managed-block marker into the result now throws a usage LoreError (wrapping managedRanges' validation error) instead of silently corrupting the document.
Tests added in test/replace.test.ts (new describe block, LCLI-162): $` copying a preceding index block -> usage LoreError containing 'lore:index'/marker text; $' copying a following tasks block -> usage LoreError containing 'lore:tasks'/'duplicated'; a $` expansion that stays clear of any marker still replaces normally (no false positive on legitimate $`/$' usage).
Verification: bun test test/replace.test.ts -> 79 pass/0 fail. Mutation check: git stash push -- src/core/replace.ts (reverting only the fix) -> 77 pass/2 fail (exactly the two new marker-injection tests); git stash pop restored the fix -> 79/79 again. Full suite: bun test -> 1848 pass/0 fail across 47 files. bun run typecheck -> clean (tsc --noEmit, no output). bun run lint: 2 pre-existing errors/4 infos, confirmed identical with the fix stashed out (i.e. present on the base branch, unrelated to src/core/replace.ts or test/replace.test.ts).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the LCLI-162 gap in src/core/replace.ts's applyReplacement: overlapsManaged() only ever screened the ORIGINAL matched span before expand() ran, so a regex $`/$' template token (which copies the document's own prefix/suffix verbatim) could splice an existing managed-block marker (lore:index or lore:tasks) into the result with no post-expansion check, duplicating it. Fix: once the full replacement result is assembled, a new assertNoInjectedMarker() helper re-validates it through the existing managedRanges() (the same locateManagedBlock/locateTaskBlock locators every managed region already trusts); a violation is re-thrown as a usage LoreError naming the replacement as the cause, so the corrupted document is never returned/written. Verified: 2 new regression tests in test/replace.test.ts ($` duplicating an index block, $' duplicating a tasks block) plus a no-false-positive case; bun test test/replace.test.ts = 79/79 pass; mutation check (fix reverted via git stash) = 77/79 with exactly the 2 new tests failing, confirming they pin the bug; full bun test = 1848/1848 pass across 47 files; bun run typecheck clean. bun run lint's 2 pre-existing errors are unrelated (verified identical on the base branch with the fix stashed out).
<!-- SECTION:FINAL_SUMMARY:END -->
