---
id: LCLI-287
title: Delegate GitHub heading-anchor slugging to github-slugger
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 15:27'
updated_date: '2026-07-30 16:49'
labels:
  - dependencies
  - markdown
  - anchors
  - github-compatibility
  - maintenance
dependencies: []
references:
  - src/core/check.ts
  - src/core/bundle.ts
  - test/check.test.ts
documentation:
  - docs/reference/dependency-boundary-audit.md
priority: medium
type: bug
ordinal: 402000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace Lore’s custom GitHub-style slug and duplicate-suffix implementation with an exact-pinned github-slugger boundary. Preserve Lore’s mdast-based heading-text extraction, including the empirically verified rule that image alt text does not contribute to GitHub heading text. This closes the leading-space mismatch recorded by LCLI-136 and reduces Unicode and duplicate-anchor drift without adopting a full remark/unified pipeline. This independent maintenance task does not gate or reorder M6.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Heading anchors match GitHub-compatible behavior for punctuation, leading and trailing whitespace, inline code, excluded image text, composed and decomposed Unicode, non-Latin text, empty headings, and repeated headings
- [ ] #2 Duplicate suffix state is isolated per document and deterministic across repeated checks and bundle ordering
- [ ] #3 Internal anchor validation and every other consumer of heading slugs share the same canonical slugging primitive without changing Lore’s mdast heading-text extraction policy
- [ ] #4 Existing portable-link findings and machine output remain stable except for fixtures that pin previously incorrect GitHub-anchor behavior
- [ ] #5 The selected github-slugger release is exact-pinned and passes the pinned Bun runtime, unit suite, typecheck, lint, and bun build --compile smoke test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve a pinned-Bun 1.2.23 before-change oracle: extend the heading conformance matrix across punctuation, leading/trailing whitespace, inline code, excluded image and image-reference alt text, composed/decomposed Unicode, non-Latin text, empty/punctuation-only headings, repeats, natural suffix collisions, per-document state, repeated calls, bundle ordering, internal anchor findings, portability findings, and machine output; record the intentional leading-space and Unicode-mark corrections separately from byte-stable behavior. Baseline evidence: test/check.test.ts 255 passed; host compile/version passed at 61,335,888 bytes. 2. Exact-pin github-slugger@2.0.0. Registry/upstream research on 2026-07-30: ISC, ESM-only with built-in TypeScript declarations, 15,900-byte unpacked package, zero runtime/transitive dependencies, no engines declaration, latest release 2022-10-27, stable but dormant upstream since that release, broad current adoption, registry integrity sha512-IaOQ9puYtjrkq7Y0Ygl9KDZnrf/aiUJYUpVf89y8kyaxbRG7Y1SrX/jaumrv81vc61+kiMempujsM3Yw7w5qcw==, and no published upstream advisories. Verify installed integrity and bun audit. 3. Replace check.ts manual Unicode regex, trim/lowercase pipeline, and Map-based duplicate loop with the package stateless slug function plus a fresh GithubSlugger instance per document. Keep bundle.ts nodeText as the sole mdast text extraction policy so text/inlineCode remain included and image/imageReference alt remains excluded; keep every anchor consumer on extractHeadingSlugs. 4. Prove state isolation by reusing identical headings across documents and repeated checkBundle calls in reversed bundle order; prove internal anchor validation changes only for intentionally corrected GitHub-compatible slugs while portable-link findings, report ordering, JSON/plain contracts, exits, streams, and the integrated LCLI-286 SSRF boundary remain unchanged. 5. Run focused conformance, audit, full test/lint/typecheck/build/version gates, npm dry-run packaging, host before/after size comparison, and all five release-target compile/non-empty checks under Bun 1.2.23; then run Lore sync/strict validation/strict check and diff hygiene, record exact acceptance evidence, finalize, commit, and integrate only LCLI-287.
<!-- SECTION:PLAN:END -->
