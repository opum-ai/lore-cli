---
id: LCLI-284
title: Migrate CLI argument parsing and routing to Commander
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 14:25'
updated_date: '2026-08-03 16:10'
labels:
  - cli
  - argument-parsing
  - commander
  - developer-experience
  - 'doc:stories/build-the-persistent-local-graph-platform'
milestone: m-13
dependencies:
  - LCLI-283.1.1
references:
  - src/cli.ts
  - src/commands/args.ts
documentation:
  - docs/reference/tech-stack.md
  - docs/reference/cli-contract.md
  - docs/reference/cli-surface.md
  - docs/stories/build-the-persistent-local-graph-platform.md
priority: medium
type: chore
ordinal: 387500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace Lore’s hand-rolled global router and duplicated command-level option parsing with Commander as the declarative CLI entrypoint. The migration must reduce parser/help duplication without changing Lore’s established command behavior, deterministic machine contracts, thin-command/core boundary, or compiled-binary distribution. This is an M6 preparation lane: start it after the LadybugDB schema and lifecycle contract is frozen, and finish it before graph, query, and context are routed through indexed retrieval. It does not move the M7 graph explorer ahead of the stable LadybugDB projection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single declarative command and option definition drives subcommand dispatch, global and command flags, positional arguments, end-of-options handling, and generated help without duplicated hand-written tokenizers
- [x] #2 All documented CLI behavior remains compatible, including global flags in supported positions, --flag=value forms, repeatable options, the literal -- terminator, unknown-option handling, help, and version output
- [x] #3 Commander never terminates the process or bypasses Lore’s injected writers; stdout/stderr separation, JSON error envelopes, output-mode precedence, semantic exit codes, TTY behavior, and NO_COLOR behavior remain unchanged
- [x] #4 Existing CLI, command, golden, and end-to-end tests pass, with parity tests covering parser edge cases and any Commander-specific failure paths
- [x] #5 Bun source execution, compiled binaries, supported platform packaging, startup behavior, and dependency/license checks pass without regressing the published package contract
- [x] #6 Architecture, tech-stack, CLI-surface, and contributor documentation no longer describe the router as hand-rolled and accurately record Commander’s role and constraints
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin the official Commander 15.0.0 package with Bun 1.2.23 and extend the existing capability manifest into the single declarative parser source for positional shapes, option arity, repeatability, aliases, command catalog, and generated Lore help.
2. Replace cli.ts hand-written token scanning and switch dispatch with a fresh local Commander program per run, ordinary global help/version/output flags, injected output writers, exitOverride, and a data-driven handler registry. Translate Commander failures into Lore usage errors so Commander never exits, writes around Lore, or changes JSON envelopes, output precedence, TTY/NO_COLOR behavior, or semantic exit codes.
3. Replace command-local token loops with shared Commander-parsed invocation data while retaining command-specific value and business validation; keep direct command tests compatible through the shared parser seam and preserve global flags in supported positions, equals forms, repeats, and literal end-of-options behavior.
4. Add parser parity and Commander failure-path tests, update architecture, tech-stack, CLI surface, design/contributor prose, dependency metadata, and package/license expectations to record the exact role and constraints.
5. Verify focused parser/help/command tests, the full Bun 1.2.23 suite, lint, typecheck, compiled build/version and package/distribution checks, then run Lore sync and strict validation/check plus git diff hygiene before task finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented exact commander@15.0.0 behind the capability manifest with fresh local programs, exitOverride, injected no-op Commander writers, LoreError translation, manifest-derived positional/option declarations, and a data-driven handler registry. Replaced command-local token loops with the shared Commander parser while retaining command-specific arity/value/business diagnostics. Verification: Bun 1.2.23 full suite 2252 pass/0 fail/6500 assertions; focused CLI/help/agent 123 pass; lint and typecheck clean; source and compiled 0.0.0 startup; compiled JSON usage-error seam; package dry-run; launcher/release/smoke 18 pass; Commander MIT/zero dependencies; bun audit clean; Lore strict validate/check 46 files, 0 errors/warnings; git diff --check clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Migrated Lore CLI parsing and routing to exact Commander 15.0.0 using the capability manifest and shared parser/handler registry, while preserving Lore-owned help, writers, JSON/error envelopes, exit codes, TTY/NO_COLOR behavior, and package shape. Verified with 2,252 tests, lint, typecheck, source/compiled startup, compiled error-envelope, dry-run packaging, distribution tests, audit/license checks, and strict Lore validation/check.
<!-- SECTION:FINAL_SUMMARY:END -->
