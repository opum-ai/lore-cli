---
id: LCLI-159
title: >-
  h2Headings() counts nested headings (inside blockquotes/list items) as
  top-level sections
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - core-query-validate
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
ordinal: 173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`h2Headings()` in src/core/validate.ts:325-333 walks the full mdast tree via `walkMdast` (src/core/bundle.ts:603-620) and collects every `heading` node with `depth === 2`, with no check on the node's parent/ancestor type or its nesting depth in the tree. `walkMdast` is a plain stack-based DFS that visits descendants of any node uniformly, so a `## Status`-looking heading nested inside a blockquote (`> ## Status`) or a list item is collected exactly like a genuine top-level document section. This feeds `requiredSectionFindings()` (validate.ts:253-270), so a required section can be satisfied by a heading that is not actually a real top-level section of the document, or (depending on interpretation) a nested heading could mask a missing top-level one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 h2Headings() (or its caller requiredSectionFindings()) only counts a `## ` heading that is a direct/top-level child of the document root, not one nested inside a blockquote or list item.
- [x] #2 A regression test in test/validate.test.ts constructs a body where the only occurrence of a required section heading (e.g. `## Consequences`) is inside a blockquote (`> ## Consequences`) or a list item, and asserts that `required-section` still reports it as missing.
- [x] #3 Existing tests for genuine top-level `## ` headings (including the fenced-code-block exclusion at test/validate.test.ts:213) continue to pass unchanged.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In h2Headings() (validate.ts), stop using the generic walkMdast() full-tree DFS. Instead iterate only fromMarkdown(body).children (the mdast root's direct children) to find depth-2 heading nodes, matching AC#1's 'direct/top-level child of the document root' requirement.
2. Keep nodeText(node) for extracting a matched heading's own text (it still walks the heading's own inline children — that traversal is fine, only the top-level heading-node search must not recurse into blockquotes/list items).
3. Drop the now-unused walkMdast import from validate.ts (nodeText stays imported).
4. Add a regression test in test/validate.test.ts: an ADR body whose only '## Consequences' occurrence is inside a blockquote (and/or a list item), asserting required-section still reports it missing.
5. Confirm the existing fenced-code-block test (test/validate.test.ts:213) and all other h2Headings-dependent tests still pass unchanged.
6. Mutation-check: revert the fix locally, confirm the new regression test fails; reapply, confirm it passes.
7. bun test (full suite) + bun run typecheck must be green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: h2Headings() (validate.ts) now iterates only fromMarkdown(body).children (the mdast root's direct children) instead of the full-tree walkMdast() DFS, so only a genuine top-level '## ' heading counts; a heading nested inside a blockquote or list item is no longer collected. Dropped the now-unused walkMdast import; nodeText() is still used (unchanged) to extract a matched heading's own text. Added two regression tests (test/validate.test.ts): '## Consequences' as the only occurrence, once inside a blockquote and once inside a list item — both assert required-section still reports it missing. Verification: bun test (full suite) 1847 pass / 0 fail; bun run typecheck clean (tsc --noEmit, no output). Mutation-check: reverse-applied the validate.ts diff via git apply -R (a patch file, not git stash — see caution note below) -> the 2 new regression tests failed as expected (56 pass/2 fail), re-applied the patch -> full suite green again (1847/0).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
h2Headings() in src/core/validate.ts now only counts a '## ' heading that is a direct/top-level child of the mdast document root (iterating fromMarkdown(body).children directly instead of the generic full-tree walkMdast() DFS), so a heading nested inside a blockquote (> ## Status) or a list item no longer satisfies requiredSectionFindings(). Fenced-code-block exclusion (test/validate.test.ts:213) is unaffected since code fences never produce heading nodes regardless of traversal depth. Verified with: bun test (1847 pass/0 fail, full suite), bun run typecheck (clean), and a mutation-check (git apply -R the fix patch -> new blockquote/list-item regression tests correctly fail 2/58; re-applied -> full suite green again).
<!-- SECTION:FINAL_SUMMARY:END -->
