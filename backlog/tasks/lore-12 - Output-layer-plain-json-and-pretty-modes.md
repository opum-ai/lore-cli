---
id: LORE-12
title: 'Output layer: --plain, --json, and pretty modes'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-06-24 15:23'
labels:
  - core
  - agent-api
milestone: m-1
dependencies: []
documentation:
  - docs/reference/cli-contract.md
priority: high
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three output tiers with precedence --json > --plain > pretty; auto-plain on non-TTY; stdout=data, stderr=diagnostics; honor NO_COLOR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 JSON output uses the schemaVersion/kind/data envelope
- [ ] #2 Non-TTY auto-selects plain; --json overrides
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/output.ts — the single rendering seam (cli-contract §1-§6, lore-design §5). DEFINE OutputMode='json'|'plain'|'pretty' HERE (errors.ts is mode-agnostic).
2. resolveMode({json?,plain?,isTTY?}): precedence --json > --plain > pretty; non-TTY (isTTY falsy, incl. undefined) auto-selects plain; --json always overrides (§1.1, AC#2).
3. resolveOutput(inputs) -> OutputContext {mode,json,color}: color = pretty && NO_COLOR unset (§6: presence incl. empty suppresses). Context is directly consumable by errors.ts reportError/flush (extra mode field tolerated).
4. Success envelope: SCHEMA_VERSION=1, successEnvelope(kind,data)->{schemaVersion,kind,data} (§2, AC#1).
5. emit(renderable{kind,data,pretty,plain}, ctx, out?=stdout): json wins -> compact JSON.stringify FIRST then write (stdout parses-or-silent; serialize throw writes nothing). plain/pretty -> renderer text, exactly one trailing newline; empty body -> silent. Pretty gets {color}. Reuse errors.ts Writer.
6. Truncation (§3): truncation(total,shown,hint?)->{total,shown,truncated,hint}; renderTruncationLine -> 'showing X of Y — hint' (only when truncated) for pretty/plain.
7. test/output.test.ts: resolveMode precedence matrix; NO_COLOR/color policy; envelope shape; emit json round-trip + no-stdout-on-serialize-throw; emit plain/pretty newline+color; truncation; OutputContext consumed by reportError.
8. Gates: bun test + lint + typecheck. Branch feat/lore-12-output-layer -> PR into dev. /code-review max >=2 passes (foundational). CHANGELOG Unreleased. Done on merge.
SCOPE: standalone module + tests (not wired into cli.ts; command wiring lands with M1 commands), matching errors.ts/config.ts precedent.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation (branch feat/lore-12-output-layer, off dev @4bb5cb7): src/output.ts — the single rendering seam. Public surface: OutputMode (json|plain|pretty, defined here; errors.ts stays mode-agnostic); resolveMode/resolveOutput (precedence --json>--plain>pretty, non-TTY auto-plain, color only in pretty with NO_COLOR unset per §6); OutputContext {mode,json,color} (the {json,color} pair errors.ts reportError/flush consume directly); SCHEMA_VERSION=1 + successEnvelope {schemaVersion,kind,data} (§2); emit() exhaustive switch over mode (never default), json validates kind+data then serializes BEFORE write (stdout parses-or-silent §4); truncation()/renderTruncationLine() bounded-output hints (§3). errors.ts: singleLine() promoted to an export (shared by the truncation hint). Scope: module + tests only; command wiring lands with M1 (errors.ts/config.ts precedent).

Review: /code-review max (NOT /review). Round 1 fixed 4 confirmed (silent dropped-data envelope; CRLF/whitespace-only/leading-newline writeBody) + plausibles. Round 2 fixed 3 confirmed (shallow assertEnvelopeData vs Date/toJSON-collapse + kind unvalidated; renderTruncationLine raw hint on hand-built Truncation; deleted union test) + a round-1 regression (/\s+$/ ate significant trailing whitespace). Commits: 9d71d7e impl, 687e977 round-1, f954f92 round-2. Gates: 134 tests pass, lint + typecheck clean.

Declined findings (deliberate, with rationale): (1) truncation() RangeError on bad counts is intentional fail-loud — counts are list lengths; crashing on an upstream arithmetic bug beats silently mislabeling a partial result complete. (2) NO_COLOR present-but-undefined treated as unset — value-based ===undefined is correct for process.env (values are always strings) and 'undefined = no preference'; also appeared in the verifier's refuted set. (3) zero-width-only (U+200B) bodies not silenced — exotic, no realistic renderer; BOM/U+FEFF is covered by trim(). (4) OutputContext.json 'redundant' — intentional ergonomic seam for errors.ts; readonly + single resolveOutput constructor prevents drift. (5) Folding truncation into emit (auto-append/auto-merge) — deferred to M1 when real command renderers exist to validate the API shape. (6) stdout backpressure — matches errors.ts pattern; output is §3-bounded. (7) shared capture() test fixture — left to test locality.
<!-- SECTION:NOTES:END -->
