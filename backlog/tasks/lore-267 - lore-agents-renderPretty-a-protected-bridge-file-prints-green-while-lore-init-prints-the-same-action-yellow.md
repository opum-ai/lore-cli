---
id: LORE-267
title: >-
  lore agents renderPretty: a 'protected' bridge file prints green while lore
  init prints the same action yellow
status: To Do
assignee: []
created_date: '2026-07-25 19:09'
labels:
  - cli-ux
  - cmd-crud-a
  - docs-drift
dependencies: []
priority: low
type: bug
ordinal: 369000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
The same `AgentsResult.action` value should render in one colour regardless of which command printed it.

## Observed
Found during the LORE-260 review (pass 2), verified live under a pty:
- `lore init --agents` paints a `protected` bridge file **yellow** (`\x1b[33mprotected\x1b[0m`).
- `lore agents` paints the same action **green** — `src/commands/agents.ts:214` uses a two-way mapping, `file.action === \"unchanged\" ? ANSI.dim : ANSI.green`, so everything that is not `unchanged` (including `protected`) comes out green.

## Why it matters
`protected` means a file looked hand-edited and was deliberately **left untouched** — the user's bridge is stale and needs `lore agents --force`. Rendering that in green reads as success. Yellow is the correct choice and matches this repo's warning-is-yellow convention (LORE-250 established the colour/TTY discipline), so the divergence is a defect in `agents.ts`, not in the newer `init` renderer.

LORE-129 established that the `protected` trailer is load-bearing — a user who misses it is silently left with a stale bridge.

## Scope note
Out of scope for LORE-260, whose reviewer flagged it: that task only reused `agents.ts`'s `renderTrailer` and correctly chose yellow for its own renderer. Fixing the divergence means changing `agents.ts`'s own output, which needs its own review.

## Refs
src/commands/agents.ts (`renderPretty`, approx. line 214), src/commands/init.ts (approx. line 534 — the correct three-way mapping to copy), test/agents.test.ts, LORE-129 (protected trailer), LORE-250 (colour/TTY discipline).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 'lore agents' renders a 'protected' file in the same colour 'lore init' does (yellow/warning), via a three-way dim/warning/success mapping rather than the current two-way unchanged-or-green split.
- [ ] #2 Every other action ('written', 'unchanged', etc.) keeps its current colour — no unintended recolouring.
- [ ] #3 A test pins the colour mapping so the two commands cannot diverge again; colour is still suppressed on a non-TTY per LORE-250.
- [ ] #4 Full suite + lore check stay green; no behaviour change beyond the ANSI colour.
<!-- AC:END -->
