---
id: LORE-138
title: >-
  bodyText's catch-all swallows any gray-matter exception, not just YAML parse
  errors
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
bodyText (src/core/check.ts:848-855) wraps `matter(normalized).content` in a bare `try { ... } catch { return normalized; }`. The docstring above it (lines 843-844) justifies this fallback on the assumption that 'gray-matter throws only on unparseable YAML,' but the catch block is unfiltered and will just as silently swallow any other exception gray-matter (or a future gray-matter version) throws — e.g. a programming error, an unexpected input type, or a resource error — masking it as if it were a normal malformed-YAML fallback and returning the whole raw file as the body instead of surfacing the real failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bodyText's catch block only falls back to returning the normalized input for errors gray-matter is documented/known to raise on unparseable YAML, and re-throws (or otherwise surfaces) any other unexpected exception type.
- [ ] #2 A regression test in test/check.test.ts exercises bodyText (or a code path that calls it) with a non-YAML-parse-error thrown from the matter() call and asserts the error propagates rather than being silently swallowed.
<!-- AC:END -->
