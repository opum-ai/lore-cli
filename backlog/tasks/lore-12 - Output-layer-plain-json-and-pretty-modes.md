---
id: LORE-12
title: 'Output layer: --plain, --json, and pretty modes'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-06-24 14:35'
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
