---
id: LORE-203
title: >-
  Clarify `lore context` --max-tokens docs: omitting it applies no token cap
  (bounded only by --depth)
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - core-index-context
  - codex-review-followup
  - docs
dependencies: []
priority: low
type: docs
ordinal: 305000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** The `lore context` CLI reference no longer implies a default token bound. `docs/reference/cli-surface.md:364` currently annotates the flag as `` `--max-tokens <n>` (budget; default bounded) ``, which a reader can parse as 'by default the output is token-bounded.' It is not: when `--max-tokens` is omitted, `buildContext` (`src/core/context.ts:155-190`) applies no size trim and returns the target plus the full depth-1 neighborhood — bounded only by `--depth` (default 1), never by tokens.

**Why:** The code behavior is intentional and matches `lore graph`'s depth-only precedent (its flag docs at `docs/reference/cli-surface.md:327` make no token-budget claim), and it is documented as intentional at `BuildContextOptions.maxTokens` (`src/core/context.ts:128-132`) and the `context.ts` module header. This is purely a doc-phrasing inaccuracy in a doc-first tool — nothing in the code needs to change.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity finding `src/core/context.ts:150`, cluster `core-index-context`. Round-3 re-audit confirmed the code is intentional but the misleading doc phrase is still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The `--max-tokens` entry in the `context` section of `docs/reference/cli-surface.md` (currently line ~364) no longer contains the substring `default bounded`; it instead states that omitting `--max-tokens` applies no token cap and the output is bounded only by `--depth`.
- [ ] #2 No source code under `src/` is modified (this is doc-only; `buildContext`'s behavior is intentional and stays as-is).
- [ ] #3 Any parallel description of `context`'s `--max-tokens` default in `docs/reference/mcp-tools.md` and `docs/reference/cli-contract.md` is checked and, if it carries the same 'default bounded' implication, made consistent with the corrected wording.
- [ ] #4 `bun run src/cli.ts check` (or the repo's docs check) still passes on the edited docs.
<!-- AC:END -->
