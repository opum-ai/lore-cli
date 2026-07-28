---
id: LCLI-113
title: >-
  docPath uses raw bundle.label while isDocsRoot normalizes it, so the two
  disagree on non-canonical labels
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:25'
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
- [x] #1 docPath is derived from the same normalized form of bundle.label that isDocsRoot uses (or the divergence is deliberately eliminated some other documented way), so a non-canonical label no longer produces a docPath inconsistent with the fixable/isDocsRoot verdict.
- [x] #2 A test passes a non-canonical bundle.label (e.g. trailing slash or different case that is docs-equivalent) through driftFindingsForBundle and asserts the resulting docPath and the fixable determination are consistent with each other.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract isDocsRoot's label normalization (backslash->/, trailing slash strip, lowercase) into a shared normalizeBundleLabel helper.
2. In driftFindingsForBundle, build docPath from normalizeBundleLabel(bundle.label) instead of the raw label, so it always agrees with the fixable verdict from isDocsRoot(bundle.label).
3. Export driftFindingsForBundle for direct testing; add a regression test in test/check.test.ts that feeds a non-canonical docs-equivalent label (case-mismatch, backslash) through it and asserts the managed-block-drift finding that only appears pre-fix is gone, while the fixable-hinted status-drift finding still appears.
4. Run test/check.test.ts, full bun test, and tsc --noEmit; report pass/fail counts.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extracted isDocsRoot's label canonicalization (backslash->/, trailing-slash strip, lowercase) into a shared normalizeBundleLabel() helper in src/commands/check.ts, and changed driftFindingsForBundle to build docPath from normalizeBundleLabel(bundle.label) instead of the raw bundle.label -- the same normalized form isDocsRoot compares against DOCS_DIR, so fixable and docPath can never diverge on a non-canonical label again. Exported driftFindingsForBundle for direct testing. Added a parameterized regression test in test/check.test.ts (label='Docs' case-mismatch, label='docs\\' backslash idiom) that constructs a Story concept with a Done-task managed block pre-rendered against the canonical docPath, feeds a non-canonical docs-equivalent bundle.label through driftFindingsForBundle, and asserts exactly one fixable-hinted status-drift finding with no spurious managed-block-drift finding alongside it. Verified the test is a real regression guard: reverted the docPath fix locally, confirmed both new cases failed (2 findings instead of 1, extra managed-block-drift), then restored the fix and confirmed green. Verification: bun test test/check.test.ts = 198 pass/0 fail; full bun test = 1731 pass/0 fail across 45 files; bun run typecheck (tsc --noEmit) = clean; bun run lint = 0 errors in touched files (only pre-existing, out-of-scope infos remain in managed-block.ts/test files).
<!-- SECTION:FINAL_SUMMARY:END -->
