---
id: LORE-67
title: >-
  cli-surface.md documents behavior that does not exist: init
  --force/probe/exit-5, new type shorthands, check --fix, replace exit-6 gate;
  plus two dead validate config knobs
status: Done
assignee:
  - '@jeremy-newhouse'
created_date: '2026-07-19 23:00'
updated_date: '2026-07-19 23:29'
labels:
  - docs
  - bug
  - cli-contract
dependencies: []
references:
  - docs/reference/cli-surface.md
  - src/commands/init.ts
  - src/core/config.ts
priority: low
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The docker/e2e coverage audit (2026-07-19, dev @ b8a4667) cross-checked docs/reference/cli-surface.md against the actual source and found four documented behaviors that DO NOT EXIST in the code (each verified directly against src/, not inferred), plus two dead-but-documented config knobs. These are docs bugs — the harness correctly tests reality and should not be changed to match the docs:

1. **init**: cli-surface.md:70-86 documents a --force flag, an exit-5 "already initialized" path, and a startup Backlog capability probe. src/commands/init.ts has none of these (verified: no flag parsing, no probe, only EXIT_OK; a re-run is documented in-code as idempotent exit 0 with a skipped list).
2. **new**: documented --epic/--story/--resource type shorthands do not exist.
3. **check**: a documented --fix flag does not exist.
4. **replace**: a documented exit-6 gate does not exist (replace has no validation gate path).

Also found (src/core/config.ts:65-70): two documented validate knobs are parsed by the config loader but have ZERO consumers anywhere in the code — dead-but-documented. Resolve per AC #5: either wire them up or remove them from the docs (doc-side fix expected per the audit; treat as an implementation choice and document it).

Fix doc-side via the lore CLI conventions (this repo dogfoods lore for docs/ — see the lore skill / lore instructions). Re-verify each claim against current source at execution time before editing: any of these could have been implemented between task creation and pickup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The init section matches src/commands/init.ts: no --force, no exit-5 already-initialized, no probe claims; the documented idempotent re-run behavior matches the code
- [x] #2 The new section drops the --epic/--story/--resource shorthand claims
- [x] #3 The check section drops --fix and the replace section drops the exit-6 gate claim
- [x] #4 Every removed claim is re-verified against current source at execution time before editing (none were implemented in the interim)
- [x] #5 The two documented-but-unconsumed validate config knobs are resolved: wired up or removed from the docs, with the choice documented
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Re-verify each of the 6 flagged claims (init --force/probe/exit-5; new --epic/--story/--resource; check --fix; replace exit-6; two dead validate config knobs) directly against src/commands/{init,new,check,replace}.ts and src/config.ts:65-70 (task cited src/core/config.ts, file has since moved).
2. Fix docs/reference/cli-surface.md: correct the init/new/check/replace sections to match verified source behavior, including any additional false claims found in the same sections during re-verification (not just the originally enumerated ones), and fix any example command lines that used a removed flag.
3. Resolve AC5 doc-side: correct docs/adr/0013-lore-state-directory.md's false claim that the [validate] config table feeds the tiered validator/drift gate; document it as parsed-but-unconsumed, with lore check's own --external/--strict as the real controls.
4. Verify with 'lore check --plain' (bundle coherence/links) and 'bun test' (no regressions), since this is a docs-only change.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Re-verified all six claims against current source before editing (init.ts, new.ts, check.ts, replace.ts, src/config.ts:65-70 — file moved from the task's stated src/core/config.ts path). All were confirmed still false/dead; none had been implemented in the interim (AC4). Fixed cli-surface.md: init section (dropped --force/exit-5/probe; also found and dropped two more false claims in the same section not in the original audit list — 'seed sub-index files' and 'wire Backlog coexistence' auto_commit/check_active_branches/remote_operations/backlog/.locks gitignore — neither is done by init.ts/scaffold.ts; corrected exit codes to the real 4/5 paths via fswrite.ts's ioError/conflictError). new section: dropped --epic/--story/--resource (also fixed the --story usage example that referenced the removed flag). check section: dropped --fix. replace section: dropped the fabricated exit-6 gate (runReplace always returns EXIT_OK). AC5: resolved as doc-side (per the audit's expectation) — corrected ADR-0013's false claim that the [validate] table (external_links/promote_portability) feeds the tiered validator/drift gate; documented as parsed-and-validated but not consumed by any command, with check's own --external/--strict as the real current controls; annotated the config.toml example and the ADR-0007 cross-reference to match. Verified with 'lore check --plain': 38 files, 0 errors, 0 warnings.

Adversarial branch review (independent subagent) confirmed all six re-verified claims correct via source reading + empirical CLI runs (bun test 1500/1500, lore check 38/0/0) and found one real defect: ADR-0013's Consequences section (line ~181) still credited committed 'validate options' with making lore check deterministic, contradicting the Decision section's own corrected claim two subsections earlier. Fixed in a follow-up commit (ed8c954) — reworded to reconcile-rules-only. Re-verified: lore check --plain still 38 files/0 errors/0 warnings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed docs/reference/cli-surface.md's init/new/check/replace sections to match verified source behavior: init drops --force/exit-5-already-initialized/Backlog-probe claims (init.ts has none; also dropped two more false claims found during re-verification in the same section — sub-index seeding and Backlog-coexistence wiring, neither done by init.ts/scaffold.ts — and corrected exit codes to the real denied(4)/conflict(5) paths from fswrite.ts); new drops --epic/--story/--resource (new.ts has no such flags) and fixes an example line that used the removed --story flag; check drops --fix (check.ts recognizes only --strict/--external); replace drops the fabricated exit-6 gate (runReplace always returns EXIT_OK). AC5 resolved doc-side: docs/adr/0013-lore-state-directory.md's [validate] table (external_links/promote_portability, src/config.ts:65-70) is parsed/validated but has zero consumers anywhere in src/ — corrected the ADR's false 'inputs to the tiered validator and drift gate' claim to state it is not yet wired to any command, with lore check's own --external/--strict flags as the real current controls (annotated the config.toml example and the ADR-0007 cross-reference to match). Verified: 'lore check --plain' -> 38 files, 0 errors, 0 warnings; 'bun test' -> 1500 pass, 0 fail.
<!-- SECTION:FINAL_SUMMARY:END -->
