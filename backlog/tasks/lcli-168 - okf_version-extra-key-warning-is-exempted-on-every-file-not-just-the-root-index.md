---
id: LCLI-168
title: >-
  okf_version extra-key warning is exempted on every file, not just the root
  index
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - core-scaffold-consumer
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
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`OKF_RESERVED_KEYS` (src/core/schema.ts:58) includes `okf_version`, and `isReservedKey` (schema.ts:67-72) only makes `resource` conditional on `isIndex`; `okf_version` is unconditionally exempt from the extra-key warning via `OKF_RESERVED_KEYS.has(key)` regardless of which file it appears on. There is no code anywhere in schema.ts, check.ts, validate.ts, or indexes.ts that positively flags a hand-authored `okf_version` on a non-root concept file as a warning. This contradicts docs/reference/okf-conformance.md:114-117, which explicitly documents that "putting `okf_version` on a concept file is itself a conformance warning lore emits" — that documented conformance check does not exist in the current code, so a user who copies `okf_version` onto an arbitrary concept or sub-index file gets no warning at all.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running `lore check` or `lore validate` on a bundle where a non-root-index concept (or sub-index like docs/adr/index.md) carries a hand-authored `okf_version` field produces a conformance warning identifying the offending file.
- [x] #2 The root bundle index (docs/index.md) carrying `okf_version` continues to produce no such warning.
- [x] #3 A test (e.g. in test/schema.test.ts or the relevant check/validate test file) covers both the warned non-root case and the not-warned root-index case.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In schema.ts, add ROOT_INDEX_PATHS (local literals 'index.md' + 'docs/index.md' — the two path conventions callers of validateFrontmatter use for the same physical root file; cannot import scaffold.ts's ROOT_INDEX_PATH without a circular import since scaffold.ts already imports from schema.ts) and isRootIndexPath() helper.
2. Extend isReservedKey(key, isIndex, isRootIndex) to make okf_version conditional on isRootIndex (mirroring how resource is already conditional on isIndex), removing the old unconditional OKF_RESERVED_KEYS set.
3. Thread isRootIndex through warnExtraKeys and validateFrontmatter's existing isIndex computation.
4. Add test/schema.test.ts cases: root-exempt under both path spellings (AC#2), warned on an ordinary non-root concept and on a non-root sub-index e.g. docs/adr/index.md (AC#1), and warned when no path is given (AC#3).
5. Verify with bun test (full suite), bun run typecheck, bun run lint scoped to changed files (repo-wide lint has pre-existing unrelated failures outside scope).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: schema.ts's isReservedKey now takes isRootIndex (mirroring the existing isIndex-conditional resource logic) and okf_version is reserved ONLY on the bundle-root index. Root detection (isRootIndexPath) recognizes BOTH path conventions actually used across callers of validateFrontmatter: bundle-root-relative 'index.md' (loadBundle-backed commands: sync/query/graph/link/... reach schema.ts via concept.ts with no docs/ prefix) and repo-relative 'docs/index.md' (core/validate.ts's own convention, LCLI-144). Verified BOTH are required: without the bundle-root-relative form, 'lore sync' would have regressed and started flagging the legitimate root index's own okf_version. Could not import scaffold.ts's ROOT_INDEX_PATH (circular import: scaffold.ts already imports from schema.ts), so the two literal spellings are pinned locally with a docstring explaining why.

Verification: (1) bun test — full suite 1891 pass / 0 fail, 5327 expect() calls, 47 files. (2) bun run typecheck (tsc --noEmit) — clean, 0 errors. (3) bun run lint (biome check .) — src/core/schema.ts and test/schema.test.ts are clean in isolation (bunx biome check src/core/schema.ts test/schema.test.ts -> 'Checked 2 files, no fixes applied'); the repo-wide lint run has 3 pre-existing errors in unrelated files outside this task's pinned scope (test/rename.test.ts, test/validate.test.ts, test/replace.test.ts import-order + src/core/managed-block.ts template-literal style), all pre-dating this change on dev and not touched by this diff. (4) Live CLI repro in scratchpad (lore init + lore new + hand-edited frontmatter): 'lore validate' warns 'unknown key "okf_version"' on both a non-root concept (docs/reference/widget-notes.md) and a hand-authored sub-index (docs/adr/index.md), while docs/index.md (root) stays 'ok' with no warning. 'lore sync' (loadBundle path convention, no docs/ prefix) also surfaced the same warning for the non-root file, confirming both path conventions are covered.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
src/core/schema.ts: okf_version is now conditional on being the bundle-root index (via new isRootIndexPath, recognizing both the bundle-root-relative 'index.md' and repo-relative 'docs/index.md' path conventions used by different callers), mirroring how 'resource' is already conditional on isIndex — replacing the old unconditional OKF_RESERVED_KEYS exemption. A hand-authored okf_version on an ordinary concept or a sub-index (e.g. docs/adr/index.md) now surfaces 'unknown key "okf_version"'; docs/index.md stays silent. test/schema.test.ts gained 5 new cases covering both root path spellings (AC#2), a non-root concept and a non-root sub-index (AC#1), and the no-path case. Verified: bun test 1891/1891 pass, bun run typecheck clean, biome check clean on both changed files (repo-wide lint has pre-existing unrelated failures, out of scope), and a live scratch-bundle repro via 'lore validate'/'lore sync' confirming the exact warning text and root exemption end-to-end.
<!-- SECTION:FINAL_SUMMARY:END -->
