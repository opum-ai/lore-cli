---
id: LORE-113
title: >-
  docPath uses raw bundle.label while isDocsRoot normalizes it, so the two
  disagree on non-canonical labels
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In driftFindingsForBundle (src/commands/check.ts:482-525), `docPath` at line 503 is built as `${bundle.label}/${concept.path}` using the raw, unnormalized `bundle.label`, while `isDocsRoot` (check.ts:544-546, used to compute `fixable` at line 499) normalizes that same label — backslashes to forward slashes, trailing slashes stripped, lowercased — before comparing to DOCS_DIR. For a non-canonical but equivalent label (e.g. a trailing slash, backslashes, or different case such as `Docs`), `isDocsRoot`/`fixable` correctly recognizes it as the docs root, but `docPath` embeds the raw, non-canonical label, so the two treatments of the identical `bundle.label` diverge within the same function.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docPath is derived from the same normalized form of bundle.label that isDocsRoot uses (or the divergence is deliberately eliminated some other documented way), so a non-canonical label no longer produces a docPath inconsistent with the fixable/isDocsRoot verdict.
- [ ] #2 A test passes a non-canonical bundle.label (e.g. trailing slash or different case that is docs-equivalent) through driftFindingsForBundle and asserts the resulting docPath and the fixable determination are consistent with each other.
<!-- AC:END -->
