---
id: LCLI-163
title: >-
  replace: $<name> should stay literal when the regex has no named groups, not
  expand to ""
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:27'
labels:
  - codex-review-followup
  - core-replace
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In expandTemplate (src/core/replace.ts:252-283), the $<name> branch at lines 268-270 always evaluates `match.groups?.[selector.slice(1, -1)] ?? ""`, so when the compiled regex declares zero named capture groups, match.groups is undefined and the token silently resolves to an empty string. Native String.prototype.replace instead leaves an unresolvable `$<name>` token as a literal substring when the regex has no named groups. This divergence means a replace template containing `$<name>` against a plain (non-named-group) pattern silently deletes that text from the output instead of preserving it, with no error or warning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Add a regression test in test/replace.test.ts running replace with a --regex pattern that has no named capture groups and a replacement template containing `$<name>`, asserting the output contains the literal string `$<name>` (matching native String.prototype.replace behavior) instead of an empty string.
- [x] #2 A template referencing an actual named group that IS present in the regex (e.g. `(?<name>...)`) continues to substitute the captured value as before, unaffected by this fix.
- [x] #3 A template referencing a named group name that is not among the regex's declared named groups (regex has some named groups, but not this one) also falls back to the literal `$<name>` token rather than throwing or substituting an empty string.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In expandTemplate (src/core/replace.ts), fix the `$<name>` branch: only substitute when the compiled regex actually declares a named group of that name (checked via `name in match.groups`, which is true whenever the pattern declares the group, even if it didn't participate in this match and its value is undefined). When the regex has no named groups at all (match.groups is undefined) OR has named groups but not this name, leave the token as the literal `$<name>` substring (`return whole`) instead of substituting "".
2. Verified native String.prototype.replace semantics via bun -e and node -e: (a) zero named groups -> literal (matches our AC#1 fix), (b) named groups present but this name absent -> native substitutes "" but the task's AC#3 explicitly wants literal here too (deliberate divergence documented in the fix's JSDoc) to avoid ever silently deleting document text, (c) named group present and matched -> substitutes value (unaffected, AC#2).
3. Add regression tests in test/replace.test.ts under replaceInText — regex mode matches String.replace semantics: AC#1 (no named groups -> literal), AC#2 (named group present -> substitutes, pins existing behavior), AC#3 (named groups present but not this one -> literal, diverging from native by design), plus one extra case (declared-but-non-participating optional named group -> substitutes empty, not literal) to pin the `in` check's boundary.
4. Mutation-check: git diff the fix into a patch, git apply -R to revert to pre-fix code, run bun test test/replace.test.ts to confirm the AC#1 and AC#3 tests fail against the bug (2 fail / 81 pass), then git apply to restore the fix and confirm all pass.
5. Run full bun test and bun run typecheck; both green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed expandTemplate's $<name> branch in src/core/replace.ts: now checks 'name in match.groups' (declared, even if non-participating) instead of blindly indexing with ?? "". Undeclared names (no named groups at all, or named groups that don't include this one) leave the token literal instead of silently deleting text. Verified native String.replace semantics via bun -e/node -e first; AC#3's literal-fallback for 'named groups present but not this one' is a deliberate documented divergence from native (native gives "" there) since an unresolvable token silently deleting document bytes is worse than leaving it visibly unresolved. Added 4 regression tests (AC#1 no named groups, AC#2 present group still substitutes, AC#3 wrong name falls back to literal, plus a boundary case: declared-but-non-participating optional group still substitutes empty). Mutation-check: git diff -> patch -> git apply -R reverted src/core/replace.ts to pre-fix; bun test test/replace.test.ts showed the AC#1 and AC#3 tests fail (2 fail / 81 pass) confirming they catch the bug; git apply restored the fix, all 83 tests in that file pass. Full suite: bun test = 1863 pass / 0 fail across 47 files. bun run typecheck clean (tsc --noEmit, no output). bun run lint (biome check .) has 2 pre-existing errors in test/validate.test.ts (import ordering), unrelated and untouched by this diff; biome check on the two files I touched (src/core/replace.ts, test/replace.test.ts) is clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
expandTemplate's $<name> substitution in src/core/replace.ts silently deleted unresolvable named-group tokens (match.groups?.[name] ?? ""). Fixed by checking whether the regex actually declares that named group (name in match.groups) before substituting; an undeclared name (no named groups at all, or named groups that don't include this one) now leaves $<name> as a literal token in the output, matching native String.replace for the no-named-groups case and deliberately diverging from it (documented in the fix's JSDoc) for the wrong-name case, so an unresolvable reference is never silently deleted. Verified with 4 new regression tests in test/replace.test.ts covering all three ACs plus a declared-but-non-participating boundary case; mutation-checked via git apply -R (pre-fix: 2/83 tests fail; post-fix: 83/83 pass). Full suite: bun test = 1863 pass/0 fail (47 files). bun run typecheck clean.
<!-- SECTION:FINAL_SUMMARY:END -->
