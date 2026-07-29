---
id: LCLI-186
title: >-
  linkText in indexes.ts must double pre-existing backslashes before inserting
  bracket escapes (parity with LCLI-154's cell())
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:28'
labels:
  - codex-review-followup
  - core-index-context
dependencies: []
priority: medium
type: bug
ordinal: 196000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up from the wave-9 integration review (LCLI-154 hardened src/core/managed-block.ts cell()/escapeLinkText to double literal backslashes BEFORE inserting its own escapes, so an inserted escape can't combine with a source backslash). The sibling escaper linkText in src/core/indexes.ts (~lines 194-199) — which cell()'s own docstring cites as a 'matches' reference — was NOT updated and now has the exact hazard LCLI-154 fixed:

linkText inserts CommonMark bracket escapes \[ / \] WITHOUT first doubling pre-existing backslashes. A concept title like 'a\[b' yields 'a\\[b' = an escaped backslash followed by a LIVE '[', which can unbalance / break the generated '- [text](link)' index entry (or spill following text out of the link).

This is a pre-existing latent bug that the wave turned into documented drift (the two escapers now cross-reference each other but differ in defensive posture). Not a wave-9 regression.

Fix: apply the same backslash-first doubling to linkText that cell()/escapeLinkText use (double '\' before inserting '\['/'\]'), and add a regression test for a title containing a backslash-bracket sequence (e.g. 'a\[b') asserting the generated index entry stays well-formed. Consider extracting ONE shared bracket/backslash escaper so the two can't drift again (mirrors the consolidation theme of LCLI-185).

Files: src/core/indexes.ts (linkText ~194-199), cross-ref src/core/managed-block.ts (cell/escapeLinkText ~322-333). Conflicts (wave scheduling) with core-index-context tasks (LCLI-149/150/162-area indexes.ts) and core-managed-template (LCLI-154 done / 155/156).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 linkText doubles pre-existing backslashes before inserting bracket escapes, so a title containing a backslash-bracket sequence produces a well-formed markdown link in generated indexes (no live/unbalanced bracket)
- [x] #2 Regression test covers a title like 'a\[b' (and a trailing-backslash title) through the real index generation path, asserting the '- [text](link)' entry stays balanced
- [x] #3 Behavior matches LCLI-154's cell()/escapeLinkText discipline (backslash-doubling first); ideally via one shared escaper so they can't diverge again
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify current state: src/core/indexes.ts's linkText() ALREADY has the backslash-doubling fix (.replace(/\\/g, "\\\\") before the bracket-escape), landed via an unrelated sibling task (LCLI-149, commit e973267) discovered independently during the same review wave that filed this task. So AC#1 (the code fix) is already satisfied - no source change needed in indexes.ts's escaping logic itself.
2. Close the evidence gap on AC#2: the existing LCLI-149 regression test covers a backslash-before-bracket mid-title case ('Plan \]B\[ (draft)') but not the two scenarios this AC names explicitly: (a) a minimal 'a\[b'-style title, (b) a title ENDING in a lone trailing backslash that abuts the template's own auto-inserted closing ']' (a genuinely different, currently-untested collision point specific to indexes.ts's `[${linkText(title)}](...)` wrapping). Add both as new tests in test/indexes.test.ts, asserting exact byte-for-byte expected output (mirroring the LCLI-149 test's style) through the real generateIndexes() path.
3. Mutation-check: temporarily revert the .replace(/\\/g, \"\\\\\") line in linkText (file-copy/patch revert, no git stash), run the two new tests to confirm they FAIL against pre-fix behavior, restore the line, confirm they PASS.
4. Run full bun test and bun run typecheck; both must be green.
5. AC#3 has an explicit 'ideally' hedge for extracting one shared escaper between indexes.ts's linkText and managed-block.ts's cell()/escapeLinkText. Given: (a) the required clause - behavior parity - is already true and now test-verified; (b) the task's own conflict note flags managed-block.ts as contested with in-flight core-managed-template tasks (LCLI-155/156); (c) campaign rules forbid drive-by refactors outside the stated edit target; I will NOT perform the extraction. I'll check AC#3 on the satisfied required clause and record the extraction explicitly as a noted, undone follow-up rather than silently dropping it.
6. Check off ACs with objective evidence, finalize task Done, commit (Refs: LCLI-186), push feature/LCLI-186.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The exact hazard described (linkText inserting bracket escapes without first doubling pre-existing backslashes) was already fixed by sibling task LCLI-149 (commit e973267), filed independently against the same wave-9 review and landed before this task was worked. src/core/indexes.ts's linkText() already does .replace(/\\/g, "\\\\") before .replace(/[[\]]/g, ...), matching managed-block.ts's cell()/escapeLinkText() backslash-doubling-first discipline (LCLI-154).

Added two new regression tests in test/indexes.test.ts matching this task's own named AC#2 examples: a minimal 'a\[b' backslash-before-bracket title, and a title ending in a lone trailing backslash that abuts the template's own auto-inserted closing ']' (a distinct, previously-uncovered collision point). Mutation-checked: reverted the doubling line via the Edit tool, confirmed all 3 backslash-doubling tests fail, restored (git diff empty), confirmed all pass.

AC#3's shared-escaper extraction is explicitly hedged ('ideally'); its required clause (behavior parity) is met and test-verified. Deliberately left the extraction undone given managed-block.ts is contested by in-flight sibling tasks (LCLI-155/156) and campaign rules forbid drive-by refactors -- recorded as an explicit follow-up, not silently dropped.

Verification: bun test test/indexes.test.ts -> 29 pass/0 fail (was 27). Full bun test -> 1861 pass/0 fail. bun run typecheck -> clean.
<!-- SECTION:NOTES:END -->
