---
id: LCLI-283.2.3
title: Harden explorer accessibility performance and offline packaging
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 13:33'
updated_date: '2026-08-03 16:10'
labels:
  - graph-explorer
  - accessibility
  - performance
  - packaging
  - 'doc:stories/build-the-persistent-local-graph-platform'
milestone: m-14
dependencies:
  - LCLI-283.2.2
documentation:
  - docs/specs/local-graph-platform-roadmap.md
  - docs/stories/build-the-persistent-local-graph-platform.md
modified_files:
  - package.json
  - bun.lock
  - playwright.config.ts
  - .github/workflows/ci.yml
  - src/core/explorer.ts
  - src/core/explorer-qualification.ts
  - test/browser/explorer.pw.ts
  - test/fixtures/explorer/v1/large.json
  - test/support/explorer-browser-fixture.ts
  - test/explorer.test.ts
  - test/explorer-qualification.test.ts
  - test/ci-workflow.test.ts
  - docs/specs/graph-explorer-data-and-interaction-contract.md
  - docs/specs/local-graph-platform-roadmap.md
  - docs/log.md
parent_task_id: LCLI-283.2
priority: high
type: task
ordinal: 394000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Complete explorer acceptance with automated and manual accessibility, responsiveness, offline, deterministic-build, browser-compatibility, and large-graph performance evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Keyboard-only and screen-reader flows cover search, filters, graph focus, detail inspection, and returning to prior context
- [x] #2 Color is not the sole status signal and reduced-motion, zoom, narrow viewport, and high-contrast behaviors are usable
- [x] #3 Static artifacts are reproducible, contain no credentials or absolute private paths by default, and make no network requests
- [x] #4 Versioned large fixtures meet explicit load, interaction, memory, and bundle-size budgets in supported browsers
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin Playwright 1.62.1 as development-only browser tooling and add a repository-contained three-engine qualification command/config for Chromium, Firefox, and WebKit; keep downloaded browsers and reports under ignored .lore/cache state. (AC #1-#4)
2. Harden the self-contained runtime to implement skip navigation, labeled composites, arrow/Enter/Escape keyboard flows, explicit focus and detail-close return, live selection/health announcements, non-color relationship cues, forced-colors and reduced-motion CSS, responsive 320px/200% zoom layout, and safe empty/corrupt navigation states. (AC #1-#2)
3. Freeze lore-explorer-qualification/1 and a versioned large fixture with explicit artifact-size, load, interaction, mounted-element, and heap budgets; generate deterministic 6,000-record/10,000-edge evidence without committing derived artifacts. (AC #3-#4)
4. Add real-browser tests across all three engines for keyboard/screen-reader semantics, search/filter/focus/detail return, narrow/zoom, reduced motion, forced colors, zero network requests, private-data absence, byte reproducibility, bounded mounting, and large-fixture budgets. Extend Bun unit and CI-workflow coverage. (AC #1-#4)
5. Add a required browser qualification job to CI, document the supported-browser/budget/evidence contract in the explorer Spec and roadmap, regenerate Lore-owned state with the branch-built CLI, then run exact pinned Bun focused/full gates, all three browsers, typecheck, Biome, build/smokes, strict Lore gates, diff hygiene, and adversarial self-review before terminal delivery. (AC #1-#4)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented lore-explorer-qualification/1 with exact Playwright 1.62.1 Chromium, Firefox, and WebKit coverage. Hardened the self-contained runtime with semantic listbox navigation, Arrow/Enter/Escape flows, skip navigation, focus return, live announcements, text and line-style graph cues, forced-colors/reduced-motion/responsive behavior, and safe empty/corrupt/stale handling. Frozen a deterministic 6,000-record/10,000-edge fixture and explicit 32 MiB artifact, 15 s load, 2.5 s interaction, 7,500 mounted-element, and 512 MiB memory/proxy budgets. CI installs the three pinned engines into ignored .lore/cache state and runs the qualification suite.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed explorer hardening and qualification. Evidence: 2,381 Bun tests passed repository-wide; 15 Playwright cases passed across Chromium, Firefox, and WebKit; Biome and TypeScript passed; the compiled binary built; Lore sync was idempotent; strict check and validation reported 0 errors and 0 warnings; git diff hygiene passed. Adversarial review additionally caught and fixed WebKit checkbox collapse, Bun/Playwright test discovery overlap, complete corrupt-filter disabling and message-code exposure, filtered-selection cleanup, and stronger initial-mount plus real-selection performance measurement.
<!-- SECTION:FINAL_SUMMARY:END -->
