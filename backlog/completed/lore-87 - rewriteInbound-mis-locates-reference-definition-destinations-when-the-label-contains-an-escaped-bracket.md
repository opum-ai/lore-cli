---
id: LORE-87
title: >-
  rewriteInbound mis-locates reference-definition destinations when the label
  contains an escaped bracket
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 09:33'
labels:
  - codex-review
  - correctness
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
destRangeForDefinition locates a reference-definition closing label bracket via a plain, non-escape-aware indexOf("]", ...) search. A label containing an escaped bracket (e.g. `[a\]x:y]: ../reference/orders.md`) matches the escaped bracket instead of the real closing one, mis-locating the destination range. Reproduced directly: rewriting an inbound link on such a document corrupts the label and leaves the old destination dangling in the body instead of updating it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 destRangeForDefinition correctly locates the closing label bracket in the presence of an escaped bracket inside the label
- [x] #2 A test reproduces the escaped-bracket repro above and asserts the rewrite produces a correct, non-corrupted result
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirmed root cause in src/core/rewrite.ts:429 destRangeForDefinition: body.indexOf("]", span.start) is a plain, non-escape-aware scan for the label's closing bracket. A label containing an escaped bracket (e.g. [a\]x:y]) matches the escaped \] first, and the subsequent body.indexOf(":", rb) then also matches the wrong colon (one inside the label text, e.g. "x:y"'s colon) instead of the real ]: separator -- a double mis-location that corrupts the destination scan entirely.
2. Unlike destRangeForLink (which derives its label-content end from the parsed node's own children offsets via maxChildEnd -- structurally immune to this bug since mdast already parsed escapes out of the label's inline children), a definition node carries NO children in mdast -- only decoded identifier/label/url/title strings whose lengths are not byte-equal to the raw source once escapes are involved (same reason node.url can't drive a text search, per the module's own header). So destRangeForDefinition needs its own escape-aware raw scan for the closing bracket.
3. Add a findLabelClose helper mirroring scanDestination's existing backslash-escape convention (j += 2 on an escaped char) to locate the real closing ] from just after the opening [, and use it in destRangeForDefinition in place of the plain indexOf.
4. Add a test reproducing the exact repro from the task description (a used reference definition with an escaped-bracket label) via rewriteInbound, confirming (via git stash) it fails against the pre-fix code with exactly the described corruption and passes with the fix.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed empirically (via a real mdast parse) before implementing: a definition node has no children (only decoded identifier/label/url/title strings), so destRangeForDefinition could not reuse destRangeForLink's structural maxChildEnd technique -- that's WHY it used a plain body.indexOf(']', span.start) in the first place, unlike destRangeForLink. Traced the exact corruption on the task's own repro [a\]x:y]: ../reference/orders.md: indexOf(']', 0) matches the escaped bracket at index 3 (not the real one at index 7), then indexOf(':', 3) matches the colon INSIDE the label text 'x:y' at index 5 (not the real separator at index 8) -- a compounding double mis-location, not just one.

Fix: added findLabelClose(body, from, end), an escape-aware forward scan (j += 2 on a backslash-escaped char, same convention scanDestination already uses for the destination itself) that correctly skips \] and lands on the real closing bracket. destRangeForDefinition now calls this instead of the naive indexOf.

Added a test in test/rename.test.ts using the same rewriteInbound harness as the file's other reference-definition tests, reproducing the task's exact repro (a USED definition, i.e. referenced via [it][a\]x:y] so it's a real graph edge, not an orphan). Confirmed via git stash: pre-fix, the output is exactly the corruption the task describes -- '[a\]x:../reference/sales-orders.md ../reference/orders.md' (label truncated mid-scan, new destination spliced into the wrong place, old destination left dangling in the body); post-fix, output is correct: '[a\]x:y]: ../reference/sales-orders.md' with the label fully intact.

End-to-end verified with the real CLI (not just unit tests): built a scratch bundle with this exact scenario and ran 'lore rename reference/orders reference/sales-orders --json' -> exit 0, and the file's escaped-bracket label survived completely intact with only the destination updated.

Full bun test: 1507 pass/0 fail (up from 1506). bun run typecheck clean. bun run lint clean on changed files (one formatter-only fix applied to the new test, no logic change).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed destRangeForDefinition (src/core/rewrite.ts) to locate a reference definition's closing label bracket via an escape-aware scan (new findLabelClose helper, mirroring scanDestination's existing backslash-escape convention) instead of a plain indexOf, which matched an escaped \] inside the label and then the wrong colon too, corrupting the located destination range. Verified with a real mdast parse that definition nodes carry no children (unlike link nodes), explaining why destRangeForLink was already immune but destRangeForDefinition was not. Added a regression test reproducing the task's exact repro via rewriteInbound; confirmed via git stash it fails against pre-fix code with the exact described corruption (truncated label, misplaced destination, dangling old destination) and passes with the fix. End-to-end verified through the real lore rename CLI on a scratch bundle: the escaped-bracket label survives fully intact, only the destination updates. bun test 1507/1507 pass, typecheck clean, lint clean.
<!-- SECTION:FINAL_SUMMARY:END -->
