---
id: LCLI-228
title: >-
  replace.ts / validate.ts: reject an inline =value on boolean flags (--regex,
  --dry-run, --strict)
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - cmd-crud-a
  - codex-review-followup
  - cli-args
dependencies: []
priority: low
type: bug
ordinal: 330000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** A boolean CLI flag given an inline value (`--regex=false`, `--dry-run=false`, `--strict=false`) must be a `usage` error, not silently treated as the flag set true.

**Live state:** In `parseReplaceArgs` (src/commands/replace.ts) the flag name is split on `=` (replace.ts:182-183) and the switch sets `regex = true` (replace.ts:196-197) / `dryRun = true` (replace.ts:199-200) on a name match without inspecting the inline value. So `--regex=false` enables regex mode and `--dry-run=false` still enables dry-run. The `--regex=false` case is the sharp edge: a user typing it to *disable* regex actually enables it, and because the run is not a dry-run, potentially-wrong bulk replacements are written to disk. The identical defect exists in `parseValidateArgs` for `--strict` (src/commands/validate.ts:122-123).

**Why it's a defect (and the established fix):** The correct rejection pattern is already in the codebase and should be mirrored: orphans.ts rejects an inline value on its boolean flags with `if (inline !== undefined) throw usage("--tasks-only takes no value", …)` (src/commands/orphans.ts:282-284, 290-292), and graph.ts does the same for `--dot` (src/commands/graph.ts:127-129). The shared `parseCommandArgs` tokenizer (src/commands/args.ts:40-46) likewise never binds a value to a boolean flag. replace.ts and validate.ts are the two bespoke parsers the campaign left with this gap.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity findings, cluster cmd-crud-a. Round-3 re-audit confirmed the defect is still live on dev; note the `--regex=false` variant carries a data-write risk that a reviewer may choose to bump above Low.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In replace.ts, passing an inline value to `--regex` or `--dry-run` (e.g. `--regex=false`, `--dry-run=anything`) throws a `usage` LoreError (exit 2) such as "--regex takes no value" / "--dry-run takes no value", mirroring orphans.ts/graph.ts; the bare `--regex` and `--dry-run` forms still set their flags.
- [x] #2 In validate.ts, passing an inline value to `--strict` throws the analogous `usage` error; bare `--strict` is unchanged.
- [x] #3 Tests assert `lore replace --regex=false <find> <replace>`, `lore replace --dry-run=false <find> <replace>`, and `lore validate --strict=false` each exit 2 with a usage error, and that the bare boolean forms still work.
- [x] #4 orphans.ts and graph.ts (already correct) and the shared args.ts tokenizer are left unchanged; the full test suite passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In parseReplaceArgs (replace.ts), add an inline-value guard to the 'regex' and 'dry-run' switch cases: if eq >= 0 (an '=' was present), throw usage('--regex takes no value'/'--dry-run takes no value', ...) before setting the flag true; bare forms unchanged. 2. Apply the identical guard to the 'strict' case in parseValidateArgs (validate.ts). 3. Add tests in test/replace.test.ts and test/validate.test.ts asserting --regex=false / --dry-run=false / --strict=false each exit 2 with a usage error, and that bare --regex/--dry-run/--strict still work. 4. Run bun test + bun run typecheck; manually invoke the CLI to confirm exit codes. 5. Leave orphans.ts, graph.ts, args.ts untouched.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Guarded the regex/dry-run (replace.ts) and strict (validate.ts) switch cases with 'if (eq >= 0) throw usage(...)' before setting the flag, mirroring orphans.ts/graph.ts. Added 4 new tests (2 in replace.test.ts, 1 in validate.test.ts for the usage-error cases, plus 1 positive bare --regex test in replace.test.ts; bare --dry-run and bare --strict were already covered by existing tests). Verified: bun test = 1940 pass/0 fail (full suite); bun run typecheck clean; bunx biome check on the 4 changed files = clean, no fixes. Manual CLI runs: 'replace --regex=false a b' -> exit 2 '--regex takes no value'; 'replace --dry-run=false a b' -> exit 2 '--dry-run takes no value'; 'validate --strict=false' -> exit 2 '--strict takes no value'. Bare forms confirmed still functional: 'replace ".at" X --regex' on 'cat bat rat' -> 'X X X' (regex mode active); 'replace keep drop --dry-run' reports 1 match but leaves file untouched; 'validate r.md --strict' turns a warnings-only exit 0 into exit 6. git diff confined to src/commands/replace.ts, src/commands/validate.ts, test/replace.test.ts, test/validate.test.ts, and the backlog task file — orphans.ts, graph.ts, and args.ts untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed parseReplaceArgs (src/commands/replace.ts) and parseValidateArgs (src/commands/validate.ts) to reject an inline =value on the --regex/--dry-run and --strict boolean flags respectively, mirroring the existing orphans.ts/graph.ts pattern: throw a usage LoreError (exit 2) when eq >= 0 for these flag names, before setting the flag. Bare --regex/--dry-run/--strict are unaffected. Added regression tests in test/replace.test.ts and test/validate.test.ts covering the rejection and the still-working bare forms. Verified via bun test (1940 pass, 0 fail), bun run typecheck (clean), bunx biome check (clean on changed files), and manual CLI runs confirming exit codes and behavior.
<!-- SECTION:FINAL_SUMMARY:END -->
