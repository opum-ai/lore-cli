---
id: LCLI-60
title: >-
  ADR-0002 overstates the capability-probe exit code: says
  missing/too-old/incapable backlog all map to exit 6, but a missing binary is
  really exit 3
status: Done
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:15'
labels:
  - bug
  - docs
  - cli-contract
dependencies:
  - LCLI-56
references:
  - src/adapters/backlog.ts
  - docs/adr/0002-backlog-integration-json-only.md
priority: low
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR-0002 (docs/adr/0002-backlog-integration-json-only.md), Decision point 5: "If backlog is missing, too old, or does not understand --json, lore exits with a clear, actionable error (validation/drift exit code 6) pointing at the patch runbook." The real, deliberate code in src/adapters/backlog.ts (probeBacklog, around line 144-162) intentionally splits this into two distinct cases, with its own inline comment explaining why: "a missing binary (ENOENT) is not_found (exit 3) with an install hint, distinct from a present-but-incapable binary (exit 6)." Confirmed against a real pinned-upstream-binary run (LCLI-56): removing backlog from PATH entirely and running any lore command that needs it (e.g. lore tasks <id> on a concept with real linked tasks) produces error_type: "not_found", exit 3 -- not exit 6.

The code's distinction is reasonable (an agent should be able to tell "go install backlog" apart from "your backlog is too old/wrong build" via exit code alone), so the fix should be to the documentation, not the behavior: ADR-0002 and any downstream doc repeating its "exit 6 for missing/too-old/incapable" framing (check docs/reference/backlog-cli-contract.md and docs/runbooks/agent-onboarding.md for the same overclaim) should be corrected to say a fully-missing binary is not_found/exit 3, and only a present-but-too-old-or-incapable binary is validation/exit 6.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ADR-0002 Decision point 5 is corrected to distinguish exit 3 (backlog missing entirely) from exit 6 (backlog present but too old or not --json-capable)
- [x] #2 docs/reference/backlog-cli-contract.md and docs/runbooks/agent-onboarding.md are checked for the same overclaim and corrected if present
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Doc-accuracy fix only, no code change. 1) docs/adr/0002-backlog-integration-json-only.md Decision point 5: split the single 'validation/drift exit code 6' claim into two distinct outcomes -- missing binary (ENOENT) -> not_found, exit 3, install hint; present-but-too-old/non---json-capable -> validation, exit 6 -- matching src/adapters/backlog.ts probeBacklog and the EXIT_CODES table in src/errors.ts. 2) Check docs/reference/backlog-cli-contract.md and docs/runbooks/agent-onboarding.md for the same overclaim (research already found backlog-cli-contract.md:334-338 already correctly splits 3 vs 6, and agent-onboarding.md states no numeric exit code so needs no fix) and correct any real hits. 3) Run grep -rn 'exit code 6\|exit 6' docs/ as a final sweep for any other doc repeating the collapsed claim and fix real hits. 4) Append implementation notes. No commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Doc-only fix, no code changes (code behavior was already correct and verified via src/adapters/backlog.ts probeBacklog + src/errors.ts EXIT_CODES).

1) docs/adr/0002-backlog-integration-json-only.md, Decision point 5 (lines 140-149): split the single collapsed claim ('If backlog is missing, too old, or does not understand --json, lore exits with a clear, actionable error (validation/drift exit code 6)') into two distinct, correctly-labeled outcomes: missing from PATH entirely -> not_found, exit code 3, install hint; present but too old or non---json-capable -> validation, exit code 6, pointing at the patch runbook. Added a sentence noting the split is deliberate (install vs upgrade) so the change reads as intentional design, not a typo fix.

2) docs/reference/backlog-cli-contract.md: checked lines 58 and 334-338. Line 58 is about a runtime JSON parse/kind-mismatch failure during a read (post-probe), unrelated to the missing/too-old scenario -- correct as-is. Lines 334-338 already correctly split missing (exit 3) from too-old/incapable (exit 6) -- no change needed.

3) docs/runbooks/agent-onboarding.md: checked lines 243-248 (the only probe-related passage) -- it describes the probe failing loud below the minimum --json version but states no numeric exit code, so there was no overclaim to correct. No change needed.

4) Final sweep: grep -rn 'exit code 6\|exit 6' docs/ across the whole tree. All other hits (ADR-0007/0008/0009/0010/0011, lore-design.md, agent-onboarding.md:69, backlog-cli-contract.md:58/337) are about lore's own validate/check/link/unlink exit-6 semantics, unrelated to the backlog-binary missing/too-old distinction -- no further fixes needed.

5) Bonus consistency fix (not one of the two AC-named files, found via my own grep for 'missing.*backlog'): docs/runbooks/docker-e2e-testing-environment.md had a 'Known, already-filed regressions' entry (previously lines 87-89) that explicitly said 'ADR-0002 currently states' the wrong exit-6-for-everything claim, flagging LCLI-60 as an open doc-accuracy gap. Since that gap is now closed, updated the entry to '**LCLI-60 (fixed)**' (matching the existing LCLI-57-fixed pattern in the same file) so the runbook doesn't go stale the moment this fix lands.

Verified fix matches real code: src/adapters/backlog.ts:154-221 probeBacklog -- ENOENT on --version spawn throws LoreError('not_found', ...) (exit 3 per EXIT_CODES.not_found=3 in src/errors.ts:49); version-floor failure and task-list --json probe failure both route through notJsonCapable() which throws LoreError('validation', ...) (exit 6 per EXIT_CODES.validation=6 in src/errors.ts:52). Ran 'bun run src/cli.ts check docs/adr docs/runbooks' after edits: 23 files, 0 errors, 0 warnings.

Files changed: docs/adr/0002-backlog-integration-json-only.md, docs/runbooks/docker-e2e-testing-environment.md. No commit made yet.

Applied 3 CONFIRMED code-review fixes on top of the ADR-0002/runbook doc-accuracy fix (branch fix/lore-60-adr0002-exit-code-doc-accuracy): (1) docs/runbooks/docker-e2e-testing-environment.md:80 — 'Two more findings ... are tracked' intro sentence was stale after the LCLI-60 bullet moved into its own '(fixed)' paragraph, leaving only LCLI-58 under it; reworded to 'One more finding ... is tracked' (singular) matching the single remaining bullet. (2) docker/e2e/run-e2e.sh:202 — inline comment above the capability-probe negative tests still said 'LCLI-60 (doc-accuracy, filed): ADR-0002 says ...' as if the bug were still open; updated to 'LCLI-60 (doc-accuracy, fixed): ADR-0002 used to say ...' and closing line now reads 'ADR-0002 and this runbook now match it' instead of 'the ADR's summary is just imprecise', so the script no longer contradicts the corrected docs. Re-verified exit-code mapping against src/adapters/backlog.ts probeBacklog and src/errors.ts EXIT_CODES during the fix: not_found=3 (missing binary, ENOENT), validation=6 (present but too old / rejects --json) — matches the corrected ADR-0002/runbook text.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed ADR-0002 Decision point 5 (docs/adr/0002-backlog-integration-json-only.md) to split the collapsed 'missing/too-old/incapable backlog all exit 6' claim into two correctly-labeled cases: missing from PATH entirely -> not_found, exit 3, install hint; present but too old or non-`--json`-capable -> validation, exit 6, patch-runbook pointer. Verified against real code: src/adapters/backlog.ts:154-221 probeBacklog (ENOENT throws not_found; version-floor/probe failure routes through notJsonCapable() -> validation) and src/errors.ts:47-54 EXIT_CODES (not_found=3, validation=6). AC2: checked docs/reference/backlog-cli-contract.md (lines 334-338 already correctly split 3 vs 6) and docs/runbooks/agent-onboarding.md (lines 243-248 state no numeric exit code) -- neither had the overclaim, no change needed. Also fixed a downstream consistency gap in docs/runbooks/docker-e2e-testing-environment.md (moved LCLI-60 from the 'tracked, unfixed' list into a '(fixed)' paragraph matching the LCLI-57 pattern) plus docker/e2e/run-e2e.sh inline comments, found via my own grep. Final sweep: grep -rn 'exit code 6|exit 6' docs/ shows only unrelated lore validate/check/link/unlink exit-6 mentions. Ran 'bun run src/cli.ts check docs/adr docs/runbooks': 23 files, 0 errors, 0 warnings.
<!-- SECTION:FINAL_SUMMARY:END -->
