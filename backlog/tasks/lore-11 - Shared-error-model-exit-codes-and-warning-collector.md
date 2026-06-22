---
id: LORE-11
title: 'Shared error model, exit codes, and warning collector'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-06-22 12:56'
labels:
  - core
  - agent-api
milestone: m-1
dependencies: []
documentation:
  - docs/reference/cli-contract.md
  - docs/adr/0005-cli-contract.md
priority: high
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Semantic exit codes 0/2/3/4/5/6 + --json error envelope error_type/message/hint/input; warnings-not-errors collector.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every error path returns a documented exit code
- [x] #2 Errors render as JSON envelope under --json on stderr
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/errors.ts — LoreError taxonomy (ErrorType: usage|not_found|denied|conflict|validation|drift per cli-contract §5.3), centralized EXIT_CODES map (2/3/4/5/6; EXIT_OK=0, EXIT_UNCAUGHT=1 reserved for uncaught bugs), exitCodeFor(unknown).
2. --json error envelope: ErrorEnvelope {error_type,message,hint?,input?} + toErrorEnvelope(); omit undefined hint/input.
3. Text renderer formatErrorText(err,{color}) -> 'error: <msg>' + optional 'hint:' line (NO_COLOR/color decided by caller, not here).
4. reportError(err,{json,color,stderr}) -> writes envelope JSON (json) or diagnostic text to stderr, returns exit code; non-LoreError -> EXIT_UNCAUGHT(1). Never touches stdout, never resolves mode/TTY (that is output.ts/LORE-12).
5. WarningCollector (warnings-not-errors): add/count/list/isEmpty/flush('warning: <msg>' to stderr); does NOT change exit code (cli-contract §4.1); gates inspect count.
6. test/errors.test.ts — exit-code mapping all types + uncaught; envelope shape/omission; color vs plain text; reportError json/text/uncaught with injected stderr capture; WarningCollector behavior.
7. Gates: bun test, bun run lint, bun run typecheck. CHANGELOG Unreleased. PR into dev (no self-merge).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/errors.ts as a pure library module (M1 wires it into cli.ts). Surface: ErrorType (usage|not_found|denied|conflict|validation|drift), EXIT_OK/EXIT_UNCAUGHT, EXIT_CODES map (2/3/4/5/6; validation+drift both 6 per cli-contract §5.3), exitCodeFor(unknown), LoreError class, ErrorEnvelope+toErrorEnvelope (omits absent hint/input), formatErrorText (color optional), reportError({json,color,stderr})->exit code, WarningCollector (add/count/isEmpty/list/flush). Decisions: (a) module resolves NO mode/TTY/NO_COLOR — caller passes {json,color} (that is output.ts/LORE-12), keeping a clean downward dependency; (b) added 'drift' as a distinct error_type sharing exit 6 to honor the normative cli-contract §5.3 (design §4.1 snippet listed 5; contract is authoritative); (c) reportError never writes stdout, preserving 'stdout parses or stays silent'; non-LoreError -> error_type:'uncaught', exit 1. AC#1: exitCodeFor + EXIT_CODES + reportError return documented codes for every type incl uncaught (tested). AC#2: reportError --json writes the envelope to injected stderr as one parseable line (tested). Validation: bun test = 25 pass / 0 fail (12 new in errors.test.ts); bun run lint clean (Biome); bun run typecheck clean (tsc strict).

Post-review hardening (PR #9 max-effort review, applied pre-merge per user decision): (1) reportError's --json path now serializes via a safeStringify fallback — a circular or non-serializable LoreError.input (e.g. BigInt) emits one parseable envelope (cycle->'[Circular]', BigInt->decimal string) instead of throwing on the very path meant to report a failure; error_type/message/hint always survive. +2 tests (circular, BigInt). (2) WarningCollector.flush documented as non-draining (idempotent reads; the color test double-flushes). (3) Doc sync: cli-contract §5.1 now documents the uncaught exit-1 envelope {error_type:'uncaught',message} and notes 'uncaught' is the only error_type outside the §5.3 table; lore-design §4.1 ErrorType snippet now lists all 6 types (added 'drift'). Gates: 27 tests pass / 0 fail, tsc strict clean, Biome clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added src/errors.ts: lore's shared diagnostic model — the LoreError taxonomy, centralized semantic exit-code mapping (0/2/3/4/5/6; 1=uncaught), the --json {error_type,message,hint,input} error envelope on stderr, and a warnings-not-errors WarningCollector. A pure, mode-agnostic library (no TTY/NO_COLOR resolution, never writes stdout); M1 wires it into the CLI. Covered by test/errors.test.ts. Verified: bun test 25/0, lint clean, typecheck clean.
<!-- SECTION:FINAL_SUMMARY:END -->
