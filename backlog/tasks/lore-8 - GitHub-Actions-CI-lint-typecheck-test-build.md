---
id: LORE-8
title: 'GitHub Actions CI: lint, typecheck, test, build'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-06-21 07:11'
labels:
  - ci
milestone: m-1
dependencies:
  - LORE-6
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI matrix uses bun test --isolate, --linker=isolated, and Windows --max-concurrency=4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CI runs on PRs to dev and pushes
- [ ] #2 Windows job is stable
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. .github/workflows/ci.yml. Triggers: push [dev, main] + pull_request (unfiltered, so stacked PRs also get CI) — satisfies AC#1 'PRs to dev and pushes'.
2. setup-bun via bun-version-file: .bun-version (single source of truth for the pin = lore's 1.2.23, NOT Backlog's 1.3.11; ADR-0001 'asserted in CI').
3. check job, matrix [ubuntu, macos, windows]: bun install --frozen-lockfile --linker=isolated; bun run lint; bun run typecheck; bun test --isolate (Windows: --max-concurrency=4 --timeout=30000 for stability — AC#2; unix --timeout=10000).
4. build job (ubuntu): compile smoke — bun build --compile src/cli.ts -> dist/lore, run --version. (Release-grade -baseline per-platform matrix + npm dual-artifact = LORE-9.)
5. Pre-validate by running the exact CI command sequence locally before push; verify CI actually runs on the PR via gh pr checks.
<!-- SECTION:PLAN:END -->
