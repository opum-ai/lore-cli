---
id: LCLI-7
title: 'Set up lint, format, and Bun test harness with coverage'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:09'
labels:
  - tooling
  - test
  - 'doc:stories/build-the-lore-cli-foundation'
milestone: m-1
dependencies:
  - LCLI-6
documentation:
  - docs/stories/build-the-lore-cli-foundation.md
priority: high
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ESLint + Prettier + editorconfig; bun test with coverage thresholds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bun run lint and bun test run clean on an empty project
- [x] #2 Coverage reporting configured
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
APPROACH CHANGE (flagged for PR review): task text says ESLint+Prettier, but project constraints (thin; 'match Backlog.md' #3) and docs (backlog-json-patch runbook references Biome; tech-stack §10 rejects redundant tooling) decisively favor Biome — one tool for lint+format, as Backlog.md uses. Using Biome instead of ESLint+Prettier.
1. Add @biomejs/biome 2.4.12 (devDep, matches Backlog.md pin).
2. biome.json: recommended lint + Backlog-style rules + organizeImports; formatter honors existing .editorconfig (spaces/2, LF) with lineWidth 120 + double quotes.
3. package.json scripts: format (biome format --write), lint (biome check, non-writing CI gate), test (bun test), test:coverage (bun test --coverage).
4. bunfig.toml [test]: coverage reporting (text+lcov) + threshold placeholder (0 now; raise as core/ lands) — AC#2.
5. Add test/smoke.test.ts so 'bun test' runs clean deterministically — AC#1.
6. biome check --write to normalize existing files; verify 'bun run lint' + 'bun test' clean.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented with Biome (not ESLint+Prettier — matches Backlog.md + the thin constraint; flagged in plan/PR). Added biome.json (recommended + style rules, organizeImports, formatter honoring .editorconfig: spaces/2, lineWidth 120, double quotes), bunfig.toml [test] coverage (text+lcov, coverageDir, threshold 0 floor), test/smoke.test.ts, and package.json scripts. Extracted src/meta.ts (version single-source) so the CLI's logic is importable/coverable (cli.ts top-level process.exit makes cli.ts itself non-importable). Verified: bun run lint PASS, bun run typecheck PASS, bun test 2 pass/0 fail, bun test --coverage shows src/meta.ts 100% and writes coverage/lcov.info; cli still runs (bun . --version -> 0.0.0). coverage/ is gitignored.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Set up dev tooling: Biome (lint+format, honoring .editorconfig) and the bun test harness with coverage (bunfig.toml text+lcov reporters, threshold floor). Added format/lint/test/test:coverage scripts and a smoke test; extracted src/meta.ts so the CLI version logic is testable/coverable. Verified lint/typecheck/test clean and lcov emitted. Deviated from the task's ESLint+Prettier to Biome to satisfy the thin + match-Backlog.md constraints.
<!-- SECTION:FINAL_SUMMARY:END -->
