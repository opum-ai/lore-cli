---
id: LORE-138
title: >-
  bodyText's catch-all swallows any gray-matter exception, not just YAML parse
  errors
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 22:57'
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
- [x] #1 bodyText's catch block only falls back to returning the normalized input for errors gray-matter is documented/known to raise on unparseable YAML, and re-throws (or otherwise surfaces) any other unexpected exception type.
- [x] #2 A regression test in test/check.test.ts exercises bodyText (or a code path that calls it) with a non-YAML-parse-error thrown from the matter() call and asserts the error propagates rather than being silently swallowed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fix src/core/check.ts bodyText(): catch block now checks error instanceof Error && error.name === 'YAMLException' (gray-matter's own unparseable-YAML signal, duck-typed since gray-matter vendors its own js-yaml major version) before falling back to normalized; any other exception is re-thrown. 2. Add regression tests in test/check.test.ts driving a genuine non-YAML Error out of matter() via an unregistered fence-language annotation (---toml), asserting it propagates through checkBundle and collectExternalLinks rather than being swallowed. 3. Verify existing 'unclosed frontmatter fence' test (which does hit YAMLException) still passes unchanged. 4. Run bun test + bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: bodyText's catch now checks error instanceof Error && error.name === 'YAMLException' (gray-matter's own unparseable-YAML signal from its vendored js-yaml — checked structurally since gray-matter's js-yaml is a separate module instance from this repo's pinned js-yaml, so instanceof against an imported class would never match) before returning normalized; every other exception is re-thrown. Verified empirically via a standalone probe script that gray-matter throws name==='YAMLException' for malformed YAML but a plain Error ('gray-matter engine "toml" is not registered') for a fence declaring an unregistered language — confirming the two error shapes actually differ at runtime, not just in theory. Added 2 regression tests in test/check.test.ts driving that real (unmocked) non-YAML Error through checkBundle and collectExternalLinks, asserting it propagates. Mutation-checked: temporarily reverted check.ts to the old bare catch and reran the 2 new tests — both failed as expected (proving they discriminate), then restored the fix. Full suite: bun test = 1820 pass/0 fail (up from 1818, the 2 new tests). bun run typecheck clean. bunx biome check on both changed files clean. Existing 'unclosed frontmatter fence' test (which does hit a real YAMLException) still passes unchanged, confirming the fix preserves the documented malformed-YAML fallback behavior.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
src/core/check.ts's bodyText() catch block now filters to gray-matter's own YAMLException (duck-typed via error.name, since gray-matter vendors a separate js-yaml module instance) before falling back to the raw normalized text; any other exception is re-thrown, fixing the previously unconditional swallow. Added 2 regression tests in test/check.test.ts (checkBundle + collectExternalLinks) that drive a real, unmocked non-YAML Error out of matter() via an unregistered fence-language annotation (---toml) and assert it propagates. Verified with: bun test (1820 pass/0 fail), bun run typecheck (clean), bunx biome check (clean), and a mutation check confirming the 2 new tests fail against the pre-fix bare catch.
<!-- SECTION:FINAL_SUMMARY:END -->
