---
id: LCLI-287
title: Delegate GitHub heading-anchor slugging to github-slugger
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 15:27'
updated_date: '2026-07-30 16:54'
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
modified_files:
  - package.json
  - bun.lock
  - src/core/check.ts
  - test/check.test.ts
  - docs/reference/dependency-boundary-audit.md
  - docs/reference/tech-stack.md
  - docs/reference/architecture.md
  - docs/log.md
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
- [x] #1 Heading anchors match GitHub-compatible behavior for punctuation, leading and trailing whitespace, inline code, excluded image text, composed and decomposed Unicode, non-Latin text, empty headings, and repeated headings
- [x] #2 Duplicate suffix state is isolated per document and deterministic across repeated checks and bundle ordering
- [x] #3 Internal anchor validation and every other consumer of heading slugs share the same canonical slugging primitive without changing Lore’s mdast heading-text extraction policy
- [x] #4 Existing portable-link findings and machine output remain stable except for fixtures that pin previously incorrect GitHub-anchor behavior
- [x] #5 The selected github-slugger release is exact-pinned and passes the pinned Bun runtime, unit suite, typecheck, lint, and bun build --compile smoke test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve a pinned-Bun 1.2.23 before-change oracle: extend the heading conformance matrix across punctuation, leading/trailing whitespace, inline code, excluded image and image-reference alt text, composed/decomposed Unicode, non-Latin text, empty/punctuation-only headings, repeats, natural suffix collisions, per-document state, repeated calls, bundle ordering, internal anchor findings, portability findings, and machine output; record the intentional leading-space and Unicode-mark corrections separately from byte-stable behavior. Baseline evidence: test/check.test.ts 255 passed; host compile/version passed at 61,335,888 bytes. 2. Exact-pin github-slugger@2.0.0. Registry/upstream research on 2026-07-30: ISC, ESM-only with built-in TypeScript declarations, 15,900-byte unpacked package, zero runtime/transitive dependencies, no engines declaration, latest release 2022-10-27, stable but dormant upstream since that release, broad current adoption, registry integrity sha512-IaOQ9puYtjrkq7Y0Ygl9KDZnrf/aiUJYUpVf89y8kyaxbRG7Y1SrX/jaumrv81vc61+kiMempujsM3Yw7w5qcw==, and no published upstream advisories. Verify installed integrity and bun audit. 3. Replace check.ts manual Unicode regex, trim/lowercase pipeline, and Map-based duplicate loop with the package stateless slug function plus a fresh GithubSlugger instance per document. Keep bundle.ts nodeText as the sole mdast text extraction policy so text/inlineCode remain included and image/imageReference alt remains excluded; keep every anchor consumer on extractHeadingSlugs. 4. Prove state isolation by reusing identical headings across documents and repeated checkBundle calls in reversed bundle order; prove internal anchor validation changes only for intentionally corrected GitHub-compatible slugs while portable-link findings, report ordering, JSON/plain contracts, exits, streams, and the integrated LCLI-286 SSRF boundary remain unchanged. 5. Run focused conformance, audit, full test/lint/typecheck/build/version gates, npm dry-run packaging, host before/after size comparison, and all five release-target compile/non-empty checks under Bun 1.2.23; then run Lore sync/strict validation/strict check and diff hygiene, record exact acceptance evidence, finalize, commit, and integrate only LCLI-287.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final evidence (2026-07-30, Bun 1.2.23):

- Package research: github-slugger 2.0.0 is the registry latest, published 2022-10-27 under ISC. It is ESM-only, has built-in TypeScript declarations, no engines declaration, zero runtime/transitive dependencies, 15,900 unpacked bytes, and exact integrity sha512-IaOQ9puYtjrkq7Y0Ygl9KDZnrf/aiUJYUpVf89y8kyaxbRG7Y1SrX/jaumrv81vc61+kiMempujsM3Yw7w5qcw==. Upstream is stable but dormant since the 2.0.0 release; npm shows broad current adoption. The upstream published-advisory API returned []; bun audit reported no vulnerabilities.
- AC1 before/after oracle: HEADING_SLUG_CONFORMANCE_V1 records old and package results for ASCII, punctuation, raw leading/trailing whitespace, repeated spaces, dash/underscore, composed/decomposed Unicode, non-Latin text, and punctuation-only empties. The two intentional primitive corrections are preserved whitespace and decomposed combining marks. mdast fixtures cover inline code, leading/trailing spaces adjacent to excluded images, image/image-reference alt exclusion, empty/repeated headings, and natural suffix collisions. Focused test/check.test.ts: 267 passed, 0 failed (baseline before delegation: 255 passed, 0 failed).
- AC2: a fresh GithubSlugger is constructed inside extractHeadingSlugs for every document. Tests prove repeat/repeat-1 restarts across documents, repeated extraction/checkBundle calls, and reversed bundle order. Empty and punctuation-only headings share the same per-document package state as other headings.
- AC3: github-slugger owns lowercase/filter/space conversion and duplicate collision state; the manual Unicode regex, trim pipeline, and Map duplicate loop were removed. Internal anchors consume extractHeadingSlugs, while bundle.ts nodeText remains the single mdast text policy: text and inlineCode included; image/imageReference alt excluded. The corrected #-key-features internal link passes end-to-end. LCLI-286 IP policy tests remain in the same focused suite and pass.
- AC4: the package changes only previously incorrect whitespace/combining-mark anchor behavior. Existing exact check reports, portable warnings, JSON/plain envelopes, deterministic findings, exits, streams, color, redaction, and ordering pass in the full suite.
- AC5/security/packaging: package.json and bun.lock exact-pin 2.0.0; bun install --frozen-lockfile made no changes. bun test: 2,239 passed, 0 failed across 51 files; bun run lint: pass; bun run typecheck: pass; bun run src/cli.ts --version and compiled ./dist/lore --version: 0.0.0; bun run build: pass. Host darwin-arm64 binary remained 61,335,888 bytes before/after despite 213 to 215 bundled modules. All release targets compiled non-empty under Bun 1.2.23: darwin-arm64 61,335,888; darwin-x64-baseline 67,416,752; linux-arm64 98,391,104; linux-x64-baseline 105,254,454; windows-x64-baseline 119,878,144 bytes. Relative to the integrated LCLI-286 baseline: Darwin unchanged; Linux +8,672 each; Windows +8,704. npm pack --dry-run --json --cache /private/tmp/lore-cli-npm-cache passed with 65 entries and no bundled dependencies.
- Documentation and final gates: dependency boundary audit, tech stack, architecture, and Lore-generated log reflect the shipping boundary. lore sync updated docs/log.md; lore validate --strict passed 45 files with 0 errors/0 warnings; lore check --strict passed 45 files with 0 errors/0 warnings; git diff --check passed. Focused implementation commit: 60c953c.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Exact-pinned github-slugger 2.0.0 now owns GitHub-compatible heading slug generation and per-document duplicate suffix state. Lore retains mdast heading-text extraction, image-alt exclusion, internal link policy, findings, and machine output. A versioned pre/post oracle and state-isolation/internal-anchor fixtures prove every acceptance behavior; 2,239 tests, lint, typecheck, audit, source/host execution, five-target compiled packaging, npm dry-run packaging, strict Lore gates, and diff hygiene pass under Bun 1.2.23.
<!-- SECTION:FINAL_SUMMARY:END -->
