---
id: LORE-168
title: >-
  okf_version extra-key warning is exempted on every file, not just the root
  index
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-scaffold-consumer
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`OKF_RESERVED_KEYS` (src/core/schema.ts:58) includes `okf_version`, and `isReservedKey` (schema.ts:67-72) only makes `resource` conditional on `isIndex`; `okf_version` is unconditionally exempt from the extra-key warning via `OKF_RESERVED_KEYS.has(key)` regardless of which file it appears on. There is no code anywhere in schema.ts, check.ts, validate.ts, or indexes.ts that positively flags a hand-authored `okf_version` on a non-root concept file as a warning. This contradicts docs/reference/okf-conformance.md:114-117, which explicitly documents that "putting `okf_version` on a concept file is itself a conformance warning lore emits" — that documented conformance check does not exist in the current code, so a user who copies `okf_version` onto an arbitrary concept or sub-index file gets no warning at all.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running `lore check` or `lore validate` on a bundle where a non-root-index concept (or sub-index like docs/adr/index.md) carries a hand-authored `okf_version` field produces a conformance warning identifying the offending file.
- [ ] #2 The root bundle index (docs/index.md) carrying `okf_version` continues to produce no such warning.
- [ ] #3 A test (e.g. in test/schema.test.ts or the relevant check/validate test file) covers both the warned non-root case and the not-warned root-index case.
<!-- AC:END -->
