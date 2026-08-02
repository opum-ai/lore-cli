---
id: LCLI-283.2.3
title: Harden explorer accessibility performance and offline packaging
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 13:33'
updated_date: '2026-08-02 00:52'
labels:
  - graph-explorer
  - accessibility
  - performance
  - packaging
milestone: m-14
dependencies:
  - LCLI-283.2.2
documentation:
  - docs/specs/local-graph-platform-roadmap.md
modified_files:
  - package.json
  - bun.lock
  - playwright.config.ts
  - .github/workflows/ci.yml
  - src/core/explorer.ts
  - src/core/explorer-qualification.ts
  - test/browser/explorer.spec.ts
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
- [ ] #1 Keyboard-only and screen-reader flows cover search, filters, graph focus, detail inspection, and returning to prior context
- [ ] #2 Color is not the sole status signal and reduced-motion, zoom, narrow viewport, and high-contrast behaviors are usable
- [ ] #3 Static artifacts are reproducible, contain no credentials or absolute private paths by default, and make no network requests
- [ ] #4 Versioned large fixtures meet explicit load, interaction, memory, and bundle-size budgets in supported browsers
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin Playwright 1.62.1 as development-only browser tooling and add a repository-contained three-engine qualification command/config for Chromium, Firefox, and WebKit; keep downloaded browsers and reports under ignored .lore/cache state. (AC #1-#4)
2. Harden the self-contained runtime to implement skip navigation, labeled composites, arrow/Enter/Escape keyboard flows, explicit focus and detail-close return, live selection/health announcements, non-color relationship cues, forced-colors and reduced-motion CSS, responsive 320px/200% zoom layout, and safe empty/corrupt navigation states. (AC #1-#2)
3. Freeze lore-explorer-qualification/1 and a versioned large fixture with explicit artifact-size, load, interaction, mounted-element, and heap budgets; generate deterministic 6,000-record/10,000-edge evidence without committing derived artifacts. (AC #3-#4)
4. Add real-browser tests across all three engines for keyboard/screen-reader semantics, search/filter/focus/detail return, narrow/zoom, reduced motion, forced colors, zero network requests, private-data absence, byte reproducibility, bounded mounting, and large-fixture budgets. Extend Bun unit and CI-workflow coverage. (AC #1-#4)
5. Add a required browser qualification job to CI, document the supported-browser/budget/evidence contract in the explorer Spec and roadmap, regenerate Lore-owned state with the branch-built CLI, then run exact pinned Bun focused/full gates, all three browsers, typecheck, Biome, build/smokes, strict Lore gates, diff hygiene, and adversarial self-review before terminal delivery. (AC #1-#4)
<!-- SECTION:PLAN:END -->
