---
id: LCLI-8
title: 'GitHub Actions CI: lint, typecheck, test, build'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:22'
labels:
  - ci
milestone: m-1
dependencies:
  - LCLI-6
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI matrix uses bun test --isolate, --linker=isolated, and Windows --max-concurrency=4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CI runs on PRs to dev and pushes
- [x] #2 Windows job is stable
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. .github/workflows/ci.yml. Triggers: push [dev, main] + pull_request (unfiltered, so stacked PRs also get CI) — satisfies AC#1 'PRs to dev and pushes'.
2. setup-bun via bun-version-file: .bun-version (single source of truth for the pin = lore's 1.2.23, NOT Backlog's 1.3.11; ADR-0001 'asserted in CI').
3. check job, matrix [ubuntu, macos, windows]: bun install --frozen-lockfile --linker=isolated; bun run lint; bun run typecheck; bun test --isolate (Windows: --max-concurrency=4 --timeout=30000 for stability — AC#2; unix --timeout=10000).
4. build job (ubuntu): compile smoke — bun build --compile src/cli.ts -> dist/lore, run --version. (Release-grade -baseline per-platform matrix + npm dual-artifact = LCLI-9.)
5. Pre-validate by running the exact CI command sequence locally before push; verify CI actually runs on the PR via gh pr checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CI verified green on a live run (PR #3): ubuntu/macos/windows check jobs + ubuntu compile smoke all pass (AC#1 triggers + AC#2 Windows stable). First run failed only on Windows lint due to CRLF checkout (runner core.autocrlf=true) vs .editorconfig/Biome LF; fixed by adding .gitattributes (* text=auto eol=lf) — re-run green incl. Windows (43s). The --linker=isolated install path was validated locally with a same-device cache (the local external-volume/home-cache split triggers EXDEV clonefile, which does not exist on single-filesystem CI runners).

Hardened the compile smoke (review follow-up): it now asserts the binary's actual output (non-empty + --version matches package.json + --help emits the banner), not just exit code 0. An exit-code-only smoke is blind to a broken/0-byte compile that still exits 0 (observed locally when bun build --compile runs on an external/EXDEV volume; CI's normal filesystem is unaffected).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added .github/workflows/ci.yml: lint + typecheck + bun test --isolate across ubuntu/macos/windows (Windows tuned --max-concurrency=4 --timeout=30000) plus an ubuntu compile smoke; Bun pinned via bun-version-file: .bun-version (1.2.23). Triggers on push to dev/main and on all PRs. Added .gitattributes to force LF so the Windows lint gate is stable. Verified by a live green CI run — all 4 jobs pass.
<!-- SECTION:FINAL_SUMMARY:END -->
