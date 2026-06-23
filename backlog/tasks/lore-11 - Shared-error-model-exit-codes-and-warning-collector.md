---
id: LORE-11
title: 'Shared error model, exit codes, and warning collector'
status: Done
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-06-23 13:06'
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

Round-2 review (real multi-agent adversarially-verified review of PR #9 HEAD, replacing the prior single-context /review): found 2 MAJOR bugs in the round-1 safeStringify hardening, now fixed pre-merge. (B1) reportError uncaught path derived message via String(err) BEFORE any guard -> a non-Error throw with a hostile toString/Symbol.toPrimitive crashed reportError itself (second throw on the report seam). Fixed: message derivation wrapped in try/catch with '[unstringifiable error]' fallback + string coercion (contract requires message:string). (B2) safeStringify's 3rd-tier fallback did JSON.stringify(String(envelope)) -> bare string '[object Object]', losing error_type/message/hint when input had a throwing toJSON/getter. Fixed: replaced the WeakSet-replacer approach with a recursive toJsonSafe walker (ancestor-chain cycle detection so shared/diamond acyclic refs survive instead of false '[Circular]'; BigInt->string; throwing toJSON/getter isolated to '[Unserializable]' per field; envelope string fields always survive). Also: froze EXIT_CODES; typed the uncaught envelope (UncaughtEnvelope). Tests 27->38 (+11: toJSON-throw, throwing getter, diamond preserved, true-cycle-only, circular+BigInt, newline single-line, hostile toString/toPrimitive, non-string Error.message coercion, non-draining double-flush, stdout-silence spy). Gates: 38 pass/0 fail, tsc strict clean, Biome clean. Round-1 review was /review max PR#9 (built-in single-context PR reviewer, not /code-review's max tier; no subagents; never posted to GitHub).

Round-3: ran the workflow-backed /code-review max on PR #9 HEAD (40 agents, 27 candidates -> 16 kept). It confirmed the round-2 crash fixes held (no blockers reappeared) and correctly refuted a false 'hand-edited backlog file' flag (it is the backlog CLI's own output). Applied the recommended subset pre-merge: (1) toJsonSafe now honors a custom toJSON exactly as JSON.stringify (Date->ISO, class->toJSON shape) so the fast and safe-serialization paths agree and a toJSON that hides fields is respected (was: raw Object.keys walk, divergent/leaky). (2) uncaught-path message: a thrown non-Error object now surfaces its .message (else a JSON projection) instead of String()=>'[object Object]'; empty-message Errors fall back to toString. (3) toErrorEnvelope only echoes a non-null object input (drops null/primitive per cli-contract §5.2 'input: object') and omits an empty-string hint. (4) Hardening/cleanup: cycle detection now uses a Set ancestor-path (O(1) vs O(depth)); safeStringify has an absolute last-resort guard; the uncaught text branch routes through a shared errorHead() with formatErrorText. (5) Doc: cli-contract §5.1 exit-6 row 'validation_or_drift' -> 'validation / drift' (the underscore label matched no real error_type). Deferred (user decision): enforce single-line message (§5.2) — currently passed verbatim. Tests 38->45. Gates: 45 pass/0 fail, tsc strict clean, Biome clean.

Round-4: workflow-backed /code-review max on PR #9 HEAD be81f5e (34 agents, 21 candidates -> 12 kept -> 9 distinct; 9 refuted incl. instanceof-across-realms, node:util.styleText reuse, isEmpty-derivable). Fixed all 9 + tests (45->52 pass, tsc strict + Biome clean): (1)[HIGH] deriveMessage no longer JSON-dumps a thrown object whole when its own message is '' (info-leak: a token/cwd field could surface) -- honors the empty string. (2)[HIGH] propagated the exit-6 error_type rename to docs/runbooks/agent-onboarding.md (validation_or_drift -> validation/drift); the dead id broke the documented agent self-correction branch. (3) toErrorEnvelope excludes arrays from input (§5.2 types it object); flipped the test that froze the array echo. (4) coerce message/hint to string via a shared asText() seam (the LoreError branch could emit a non-string hint/reassigned message; the uncaught branch already guarded). (5) toJsonSafe builds the projected object via Object.create(null) so a data field named __proto__ survives the degraded path (was swallowed by the prototype setter, diverging from the fast JSON.stringify path). (6) toJsonSafe passes the property key to a custom toJSON (JSON.stringify semantics) so a key-sensitive toJSON agrees on fast and safe paths. (7) collapse newlines in message/hint to single-line (§5.2/§5.4) -- RESOLVES the deferred single-line decision via the 'enforce single-line' option; text mode no longer spills one error across multiple stderr lines (covers the refuted-but-real formatErrorText path too). (8) reportError returns exitCodeFor(err) instead of re-deriving the code inline (single source of truth). (9) WarningCollector.flush hoists the loop-invariant painted prefix. Commit lands on feat/lore-11-error-model; user reviews/merges PR #9 (not self-merged).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added src/errors.ts: lore's shared diagnostic model — the LoreError taxonomy, centralized semantic exit-code mapping (0/2/3/4/5/6; 1=uncaught), the --json {error_type,message,hint,input} error envelope on stderr, and a warnings-not-errors WarningCollector. A pure, mode-agnostic library (no TTY/NO_COLOR resolution, never writes stdout); M1 wires it into the CLI. Covered by test/errors.test.ts. Verified: bun test 25/0, lint clean, typecheck clean.
<!-- SECTION:FINAL_SUMMARY:END -->
