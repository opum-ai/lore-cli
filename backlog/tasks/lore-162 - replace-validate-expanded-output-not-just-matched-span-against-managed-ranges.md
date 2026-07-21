---
id: LORE-162
title: >-
  replace: validate expanded output, not just matched span, against managed
  ranges
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In applyReplacement (src/core/replace.ts:174-203), overlapsManaged(start, matched.length) at line 194 only checks the byte span of the ORIGINAL matched input before splicing `expand(match, text)` into the result at line 197. The expansion can itself contain arbitrary surrounding document text via the \`$\`\` and $' template tokens (see expandTemplate, lines 252-283), which copy the document prefix/suffix verbatim. If that copied text happens to contain a managed-block marker string (e.g. INDEX_BLOCK_BEGIN/END from src/core/indexes.ts, or the tasks-block markers), replace splices a duplicate marker into the document with no post-expansion check, corrupting the managed-block invariant that locateManagedBlock/managedRanges relies on elsewhere in this file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Add a regression test in test/replace.test.ts where a find/replace with `--regex` and a template using $` or $' produces expansion text that would contain an INDEX_BLOCK_BEGIN/END (or tasks-block) marker string, and assert the replace is rejected or the offending match is skipped rather than silently duplicating the marker into the output.
- [ ] #2 After the fix, running replace with such a pattern either throws a usage-level LoreError explaining the marker collision, or excludes that match from substitution (leaving it and the marker pair untouched) — it must never leave two copies of a managed-block marker in the resulting document.
<!-- AC:END -->
