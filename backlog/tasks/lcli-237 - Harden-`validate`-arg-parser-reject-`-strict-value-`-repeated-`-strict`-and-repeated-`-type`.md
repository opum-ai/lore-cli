---
id: LCLI-237
title: >-
  Harden `validate` arg parser: reject `--strict=<value>`, repeated `--strict`,
  and repeated `--type`
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - cmd-meta-b
  - codex-review-followup
  - validate
  - cli-arg-parsing
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: bug
ordinal: 339000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `lore validate`'s option parser should reject the same malformed flag shapes its sibling read commands already reject, instead of silently swallowing them.

**Why:** In `parseValidateArgs` (src/commands/validate.ts:118-127) the `switch (name)` handles `case "strict"` (lines 122-123, `strict = true`) with no inline-value guard and no duplicate guard, and `case "type"` (lines 119-121, `type = takeValue()`) with no duplicate guard. Live behavior on `dev` (confirmed by running the CLI):
- `validate --strict=false docs/index.md` exits 0 — the `=false` is discarded and strict is still enabled, so `--strict=false` perversely turns strict mode ON (a genuine footgun, not just cosmetic).
- `validate --strict --strict` exits 0 (repeat silently ignored).
- `validate --type ADR --type Story` exits 0 with last-value-wins (silently filters on the last `--type`).

The sibling parsers already guard these: `graph.ts:126-133` throws "--dot takes no value" (inline value on a boolean flag) and "--dot given more than once" (repeat); `context.ts:115-116`/`123-124` throw "--max-tokens/--depth given more than once". Aligning `validate` closes the cross-command inconsistency and removes the `--strict=false` footgun. All three raise a `usage` LoreError (exit 2), the parser's existing error class.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity section, cluster cmd-meta-b. Original citation `validate.ts:104`; live defect at `validate.ts:118-127`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `lore validate --strict=<anything>` (e.g. `--strict=false`, `--strict=x`) raises a `usage` LoreError (exit 2) — a boolean flag takes no value — matching graph's `--dot takes no value` guard.
- [x] #2 `lore validate --strict --strict` (repeated boolean flag) raises a `usage` LoreError (exit 2), matching graph's "--dot given more than once".
- [x] #3 `lore validate --type ADR --type Story` (repeated value flag) raises a `usage` LoreError (exit 2) rather than silently applying last-value-wins, matching context's "--max-tokens given more than once".
- [x] #4 Existing accepted behavior is preserved: a single `--strict`; a single `--type ADR` and the inline `--type=ADR`; `--type` / `--type=` with no value still a usage error; and `--` still ends option parsing so a following `--strict`/`--type` token is treated as a positional path.
- [x] #5 test/validate.test.ts gains a case for each of the three new rejections (asserting `LoreError` of type `usage`), and the existing arg-parsing tests still pass; `bun test test/validate.test.ts` is green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm AC#1 (--strict=<value> rejection) is already implemented on dev via LCLI-228 (validate.ts case 'strict' checks eq>=0). 2. Add duplicate guard to case 'strict': throw usage('--strict given more than once') if strict already true, mirroring graph.ts '--dot given more than once'. 3. Add duplicate guard to case 'type': throw usage('--type given more than once') if type !== undefined before takeValue(), mirroring context.ts '--max-tokens given more than once'. 4. Add 3 new tests to test/validate.test.ts: repeated --strict, repeated --type, and a preservation test for single --strict / single --type ADR (AC#1's --strict=false test already exists from LCLI-228). 5. Verify: bun test test/validate.test.ts, full bun test, bun run typecheck, bunx biome check on changed files, plus manual CLI smoke tests for all AC#1-4 scenarios.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed AC#1 already shipped by LCLI-228 (validate.ts case "strict": eq>=0 guard, existing test at test/validate.test.ts). Added duplicate guards: case "strict" throws usage("--strict given more than once") when strict already true; case "type" throws usage("--type given more than once") when type !== undefined, before takeValue(). Both mirror sibling parsers (graph.ts "--dot given more than once", context.ts "--max-tokens given more than once"). Added 3 tests: repeated --strict, repeated --type (ADR then Story, proving no last-value-wins), and a preservation test for single --strict + single --type ADR. Verification: bun test test/validate.test.ts -> 66 pass/0 fail; full bun test -> 1975 pass/0 fail; bun run typecheck clean; bunx biome check src/commands/validate.ts test/validate.test.ts clean. Manual CLI smoke (bun run src/cli.ts validate ...) confirmed exit codes: --strict=false -> usage/exit2 ("--strict takes no value"), --strict --strict -> usage/exit2 ("--strict given more than once"), --type ADR --type Story -> usage/exit2 ("--type given more than once"), single --strict -> exit0, --type= -> usage/exit2 ("needs a value"), -- --strict -> not_found/exit3 (positional, not flag, proving -- still ends option parsing), --type ADR and --type=ADR both filter cleanly to exit0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hardened parseValidateArgs in src/commands/validate.ts: added a duplicate guard to case "strict" (throws usage "--strict given more than once" if already set) and to case "type" (throws usage "--type given more than once" if already set), mirroring graph.ts/context.ts's existing repeat guards. AC#1 (--strict=<value> rejection) was already shipped by LCLI-228 and confirmed still in place with its existing test. Added 3 tests to test/validate.test.ts covering repeated --strict, repeated --type, and preserved single-flag behavior. Verified: bun test test/validate.test.ts (66 pass/0 fail), full bun test (1975 pass/0 fail across 47 files), bun run typecheck (clean), bunx biome check on both changed files (clean), plus manual CLI smoke tests confirming exit codes for all five ACs including --strict=false, --strict --strict, --type ADR --type Story, --type=, and -- --strict (still treated as a positional, proving -- still ends option parsing).
<!-- SECTION:FINAL_SUMMARY:END -->
