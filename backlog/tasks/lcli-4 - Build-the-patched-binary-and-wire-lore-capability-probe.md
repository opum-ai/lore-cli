---
id: LCLI-4
title: Build the patched binary and wire lore capability probe
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:21'
labels:
  - backlog-fork
  - build
milestone: m-0
dependencies:
  - LCLI-2
documentation:
  - docs/reference/backlog-cli-contract.md
priority: medium
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
bun build --compile the fork for local use as lore git dependency; verify backlog --version + dry task list --json shape probe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Local compiled binary runs task list --json successfully
- [x] #2 Capability probe fails loud on a non --json-capable Backlog
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AC#1 — Build fork binary on REAL INTERNAL disk (compile trap): git clone the fork branch tasks/back-510-json-output from /Volumes/external/repos/Backlog.md into an internal-disk path (realpath must NOT contain /Volumes/external), bun install + bun run build there, then smoke-test ./dist/backlog --version, task list --json (one envelope), task view <id> --json (icon-free status). Record evidence in notes.
2. AC#2 — Minimal STANDALONE capability probe (per user decision): new src/adapters/backlog-probe.ts implementing contract §5 four steps over an injectable spawn seam — backlog --version (bare-semver parse + >= floor), dry task list --json (assert {schemaVersion, kind:'task-list', data}). Fail loud via LoreError: ENOENT/absent -> not_found (exit 3); below-floor or parse/kind mismatch -> validation (exit 6). Do NOT wire into cli.ts dispatch (coupling commands are LCLI-22+; that is LCLI-21 adapter territory). Unit tests in test/backlog-probe.test.ts: absent->not_found, stock non-json output->validation, good fork envelope->pass.
3. Git-dep plumbing: adapter shells out to 'backlog' on PATH (contract §5), and lore lives on /Volumes/external where a compiling github git-dep hits the EXDEV/silent-compile trap. Neither AC requires the package.json pin, so BUILD+VERIFY+DOCUMENT the binary rather than forcing a risky git-dep install into lore. Flag this scope call to the user in the final summary.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#1 VERIFIED. Built the fork branch tasks/back-510-json-output (HEAD a80b7a1) on REAL INTERNAL disk (scratchpad on /dev/disk3s5, realpath free of /Volumes/external): git clone + bun install (587 pkgs) + bun run build. Compile produced a 66,735,312-byte Mach-O arm64 executable (NOT a 0-byte silent-fail — the external-volume trap is confirmed avoided on internal disk). Smoke tests on the binary's backlog project:
- backlog --version -> bare '1.47.1'
- task list --json -> {schemaVersion:'1', kind:'taskList', data:[180 summaries]} (94945 bytes, one complete envelope; an earlier jq error was a shell head/pipe artifact, not a truncation — parsing from file is clean)
- task view BACK-240 --json -> {schemaVersion:'1', kind:'task', status:'To Do'}; rawContent AND lastModified both OMITTED; status is icon-free
- search 'json' --json -> {schemaVersion:'1', kind:'searchResult', data:[23], item.type:'task'}
DOC BUG found: docs/reference/backlog-cli-contract.md §1 and §5 step 4 say kind 'task-list'/'search', but the schema-of-record (backlog-json-schema.md §2,§4) and the actual binary emit 'taskList'/'searchResult' (camelCase) and schemaVersion is the STRING '1'. The probe (AC#2) will assert the ACTUAL values.

AC#2 VERIFIED. Shipped a minimal STANDALONE capability probe at src/adapters/backlog.ts (the design-spec §2.3/§8 'only backlog subprocess seam'; seeded with just the probe slice so LCLI-21 extends the same file rather than a second spawning module). Implements contract §5 fail-loud over an injectable BacklogSpawn seam:
- backlog --version: ENOENT -> LoreError 'not_found' (exit 3) + install hint; non-zero/non-semver -> 'validation' (exit 6); version < MIN_BACKLOG_VERSION (1.47.1 floor) -> validation.
- dry backlog task list --json: non-zero exit (stock rejects --json), unparseable stdout, non-object envelope, kind != 'taskList', non-array data, or schemaVersion != '1' -> all 'validation' (exit 6, refuse coupling / allow pure-OKF). This step, not the version, discriminates fork from stock.
- Exports bunBacklogSpawn(binary='backlog') as the real Bun.spawn impl (impure command-layer wiring).
Tests: test/backlog-probe.test.ts, 16 tests / 33 asserts, all green — every fail-loud branch (incl. a regression test pinning the camelCase 'taskList' vs the doc's wrong 'task-list'), the pass path (tolerates pre-release version + extra additive envelope keys), plus real-Bun.spawn stdout-capture and ENOENT.
Gates: bun run typecheck 0 errors; biome clean; full suite 990 pass / 0 fail; lore validate + lore check both 0 errors/0 drift.
NOT wired into cli.ts dispatch: the coupling commands it gates (link/unlink/tasks/orphans/sync/check-coupling) are LCLI-22+, so wiring is deferred to LCLI-21 per the user's 'minimal standalone probe' decision.
DOC FIX: corrected docs/reference/backlog-cli-contract.md §1 envelope + §5 step 4 to the schema-of-record values (schemaVersion string '1', kind camelCase task/taskList/searchResult) so LCLI-21 does not implement against the wrong contract.
SCOPE CALL (git-dep): neither AC requires the package.json github git-dep pin from runbook §6. The adapter shells out to 'backlog' on PATH (contract §5, design §2.3), and lore lives on /Volumes/external where a compiling github git-dep hits the EXDEV/silent-compile trap — so I built+verified the binary (AC#1) and documented, rather than forcing a hazardous git-dep install into lore. Flagging for user review.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered milestone m-0. AC#1: compiled the --json fork (tasks/back-510-json-output @ a80b7a1) to a 66MB internal-disk binary (dodging the /Volumes/external silent-compile trap) and verified it emits the expected {schemaVersion:'1', kind} envelopes for task list/view/search. AC#2: shipped src/adapters/backlog.ts (the only backlog subprocess seam), a minimal standalone fail-loud capability probe over an injectable BacklogSpawn — absent binary -> not_found/exit 3, non-fork binary -> validation/exit 6; +16 tests. Also fixed the backlog-cli-contract.md envelope prose to the schema-of-record values. Full adapter read/write surface deferred to LCLI-21 (extends this file). typecheck+biome+990 tests green; lore validate/check clean. Shipped as PR #30 into dev (awaiting user review/merge); git-dep pin intentionally NOT added (adapter shells to PATH; external-volume trap) — flagged for review.
<!-- SECTION:FINAL_SUMMARY:END -->
