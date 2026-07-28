---
id: LCLI-175
title: >-
  readConfigText denied error omits errno code field, diverging from the shared
  denied contract
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - cli-entry-state
dependencies: []
priority: low
type: bug
ordinal: 121500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-2 integration-review follow-up of LCLI-108. LCLI-108 correctly made readConfigText (src/config.ts) throw a `denied`-typed LoreError on EACCES/EPERM, but its structured `input` carries only { path: CONFIG_REL_PATH } and omits the errno `code` field. The codebase-wide denied contract it cites — errors.ts readFileIfPresent (~line 281) and ioError (~line 330) — always attaches `code` to the --json error envelope's `input`. So a machine consumer reading `envelope.input.code` on a denied error gets it from every other site but not from config reads. Separately, loadConfig's docstring (src/config.ts:~105-110) still promises only `validation` errors and is now stale. Low severity: LCLI-108's ACs (type=denied, exit code) are already met; this is contract-consistency polish, not a functional bug. Found by the wave-2 integration review (2026-07-22); see doc-3 wave log.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 readConfigText's denied LoreError includes the errno `code` (e.g. 'EACCES'/'EPERM') in its structured `input`, matching the shape emitted by errors.ts's ioError/readFileIfPresent for denied errors
- [x] #2 loadConfig's docstring is updated to reflect that a denied error type is now possible (no longer only 'validation')
- [x] #3 A test asserts the denied error's input.code is populated for an EACCES/EPERM config read; existing LORE-108 denied-type/exit-code assertions still pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In readConfigText's denied throw (src/config.ts), add the errno code to the structured input: { path: CONFIG_REL_PATH, code: errnoCode(cause) }, matching errors.ts's ioError/readFileIfPresent shape.
2. Update loadConfig's docstring (~line 105-110) to note that an unreadable file (EACCES/EPERM) throws a denied LoreError, not only validation.
3. Extend the existing LCLI-108 permission-denied test in test/config.test.ts to also assert (thrown as LoreError).input has code EACCES/EPERM (whichever the OS reports), keeping the existing denied-type/exit-code assertions.
4. Mutation-check: temporarily revert the code field, confirm new assertion fails, restore.
5. Run bun test + bun run typecheck; verify green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed: readConfigText's denied LoreError now attaches { path, code: errnoCode(cause) } to input (src/config.ts), matching errors.ts's ioError/readFileIfPresent shape. loadConfig's docstring updated to document the denied path. Extended the existing LCLI-108 permission-denied test (test/config.test.ts) to assert input.path and input.code (EACCES/EPERM). Mutation-checked: reverted the code:errnoCode(cause) hunk, reran bun test test/config.test.ts -> new assertion failed as expected (input.code was undefined), then restored and reran -> 37/37 pass. Full suite: bun test -> 1748 pass / 0 fail across 46 files. bun run typecheck -> clean (tsc --noEmit, no errors). Manual CLI-path repro (temp script exercising loadConfig -> LoreError -> toErrorEnvelope, the same seam cli.ts's reportError uses) confirmed the real --json envelope: {"error_type":"denied",...,"input":{"path":".lore/config.toml","code":"EACCES"}}. Scope stayed to src/config.ts + test/config.test.ts as directed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
readConfigText's denied LoreError now carries the errno code in input (matching errors.ts's ioError/readFileIfPresent), and loadConfig's docstring documents the denied path. Verified: bun test 1748 pass/0 fail (incl. new LCLI-175 assertion, mutation-checked to fail without the fix); bun run typecheck clean; manual repro of the real loadConfig->toErrorEnvelope seam shows input.code:"EACCES" in the --json envelope.
<!-- SECTION:FINAL_SUMMARY:END -->
