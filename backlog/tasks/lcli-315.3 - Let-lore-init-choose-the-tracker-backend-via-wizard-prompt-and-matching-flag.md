---
id: LCLI-315.3
title: 'Let lore init choose the tracker backend, via wizard prompt and matching flag'
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 21:49'
updated_date: '2026-08-08 14:43'
labels: []
dependencies:
  - LCLI-315.1
documentation:
  - docs/adr/0017-interactive-init-wizard-tty-gated.md
modified_files:
  - src/config.ts
  - src/adapters/tracker.ts
  - src/commands/init.ts
  - src/commands/link.ts
  - src/commands/export.ts
  - src/core/ladybug-source.ts
  - src/core/manifest.ts
  - test/config.test.ts
  - test/init.test.ts
  - test/tracker-adapter.test.ts
  - docs/adr/0017-interactive-init-wizard-tty-gated.md
  - docs/reference/cli-surface.md
  - docs/reference/cli-contract.md
  - docs/reference/backlog-cli-contract.md
parent_task_id: LCLI-315
priority: medium
type: feature
ordinal: 437000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Surface the tracker choice at setup time and persist it to `.lore/config.toml`.

`lore init` already has the machinery. A bare invocation on an interactive terminal runs a guided wizard with a `choose(question, choices, defaultValue)` primitive (`src/commands/init.ts:113`), already used for the downstream-site question at line 298. The prompter is injectable, so the new question is unit-testable without a terminal.

The wizard's contract must be honored exactly as ADR-0017 states it, because it is easy to break by adding one question:
- Every wizard question maps 1:1 to a flag, so the new question needs its own flag (for example `--tracker`) that produces the identical outcome with zero prompts.
- Passing any of the command's own flags makes the whole run non-interactive; the new flag must participate in that veto.
- Both stdin and stderr must be real TTYs for any prompt to run, and `--json` is an independent veto.
- The non-interactive default must not change: a flagless, non-TTY `lore init` must still produce today's result, which means the default tracker stays Backlog.md.

Write the chosen backend into a `[tracker]` table in `.lore/config.toml` and extend the config loader in `src/config.ts` to read it. That loader is zero-config by design — a missing file yields documented defaults — so an absent `[tracker]` table must mean Backlog.md, not an error. Keep the loose-object tolerance the other tables use so an unknown future key does not break an older lore.

The choice list ships exactly the backends that work: Backlog.md and JIRA. Quest CLI is deliberately not offered — see LCLI-315.4 for why, and do not add it as a disabled, greyed, or coming-soon entry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The init wizard asks which tracker backend to use and writes it to a [tracker] table in .lore/config.toml
- [x] #2 A --tracker flag produces the identical result with no prompts, and participates in the existing flag-implies-non-interactive veto
- [x] #3 A flagless non-TTY lore init produces byte-identical output to today, defaulting to Backlog.md
- [x] #4 --json never prompts, and a non-TTY stdin or stderr never prompts
- [x] #5 The config loader reads [tracker] with Backlog.md as the zero-config default and tolerates unknown keys
- [x] #6 An unrecognized tracker value fails as a validation error (exit 6) naming the accepted values
- [x] #7 The choice list contains only backends that are actually reachable
- [x] #8 Tests drive the new question through the injected prompter and cover the flag, the vetoes, and the default path
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend .lore/config.toml projection with a resolved backlog|jira tracker backend, Backlog zero-config default, loose unknown-key tolerance, and fail-loud validation. 2. Add a --tracker value flag and matching injected wizard choice, persisting explicit choices safely without changing the bare non-TTY scaffold bytes. 3. Route production tracker construction through the loaded backend configuration while preserving injected adapter seams. 4. Add focused config, init, manifest, factory, and production-routing tests for valid choices, invalid values, prompt vetoes, and byte-identical defaults. 5. Update ADR-0017 and CLI/tracker reference documentation through Lore, then run focused/full tests, typecheck, lint, build, strict Lore gates, and diff hygiene.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented resolved backlog|jira configuration, a TTY-gated wizard choice and prompt-free --tracker flag, byte-preserving TOML persistence, configured production adapter routing, manifest/help exposure, and reference/ADR updates. Adversarial review hardened the updater against future array tables and nested dotted keys; the wizard's legacy advisory check remains explicitly Backlog-specific so selecting Jira does not require its mapping during init.

Verification: focused tracker/init/config/Jira suite 128 passed; TypeScript and Biome passed; compiled build passed; lore validate --strict and lore check --strict each reported 65 files with 0 errors/0 warnings; lore sync --dry-run would update only docs/log.md and was not applied because it commits; git diff --check passed. The default-timeout full suite exposed and then passed after fixing the manifest summary lockstep; its pre-existing 5-second 700,000-row orphan stress test timed out locally, while the isolated stress block passed 2/2 with a 15-second timeout and the complete suite passed with --timeout 15000: 2553 passed, 1 platform qualification skipped, 0 failed.

The user authorized Lore sync and local commits on 2026-08-08. Remote delivery remains unauthorized.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and locally verified tracker selection for lore init: only Backlog.md/Jira are offered, --tracker is prompt-free and equivalent, zero-config remains byte-stable Backlog, invalid values fail validation, config drives production tracker construction, and docs/tests cover the contract. Local changes are ready for authorized Lore sync and commit.
<!-- SECTION:FINAL_SUMMARY:END -->
