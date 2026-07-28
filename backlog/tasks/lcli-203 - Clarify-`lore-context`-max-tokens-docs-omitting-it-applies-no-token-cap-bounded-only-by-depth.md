---
id: LCLI-203
title: >-
  Clarify `lore context` --max-tokens docs: omitting it applies no token cap
  (bounded only by --depth)
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
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
- [x] #1 The `--max-tokens` entry in the `context` section of `docs/reference/cli-surface.md` (currently line ~364) no longer contains the substring `default bounded`; it instead states that omitting `--max-tokens` applies no token cap and the output is bounded only by `--depth`.
- [x] #2 No source code under `src/` is modified (this is doc-only; `buildContext`'s behavior is intentional and stays as-is).
- [x] #3 Any parallel description of `context`'s `--max-tokens` default in `docs/reference/mcp-tools.md` and `docs/reference/cli-contract.md` is checked and, if it carries the same 'default bounded' implication, made consistent with the corrected wording.
- [x] #4 `bun run src/cli.ts check` (or the repo's docs check) still passes on the edited docs.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite the --max-tokens entry in the context section of docs/reference/cli-surface.md (line ~364) to drop 'default bounded' and state that omitting --max-tokens applies no token cap, bounded only by --depth. 2. Grep docs/reference/mcp-tools.md and docs/reference/cli-contract.md for parallel 'default bounded'/default-budget phrasing on context's --max-tokens; fix mcp-tools.md's 'lore://context/{id}' resource row (said 'at default budget', same misleading implication) and leave cli-contract.md (its Sec 3.3 token-estimate text makes no default-bound claim). 3. Apply edits via 'bun run src/cli.ts replace' (dry-run first) to keep managed regions intact. 4. Verify: grep confirms no 'default bounded' remains on the context --max-tokens entry; git diff confirms no src/ files touched; bun run src/cli.ts check stays 38 files/0/0; bun test and bun run typecheck stay clean.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: (1) docs/reference/cli-surface.md:364 no longer contains 'default bounded' for context's --max-tokens; now reads '(token budget; if omitted, no cap is applied — output is bounded only by --depth)'. (2) git diff --name-only -- src/ is empty — no source under src/ touched. (3) Checked docs/reference/mcp-tools.md and docs/reference/cli-contract.md: mcp-tools.md's lore://context/{id} resource row said 'at default budget' (same misleading implication) — corrected to 'at the default depth with no token cap (resources take no parameters, so --max-tokens is never applied)'. cli-contract.md Sec 3.3 only describes the chars/4 estimate heuristic used when --max-tokens IS given; it makes no default-bound claim, so left unchanged. (4) bun run src/cli.ts check: 38 files, 0 errors, 0 warnings. bun test: 1913 pass, 0 fail (47 files). bun run typecheck (tsc --noEmit): clean, no output. Edits applied via 'bun run src/cli.ts replace ... --in <file>' (dry-run first each time) to route through the lore CLI rather than a raw editor.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the misleading 'default bounded' phrasing on lore context's --max-tokens flag doc. docs/reference/cli-surface.md:364 now states omitting --max-tokens applies no cap and output is bounded only by --depth, matching buildContext's actual behavior (src/core/context.ts, unchanged). docs/reference/mcp-tools.md's lore://context/{id} resource row carried the same implication ('at default budget') and was corrected too; docs/reference/cli-contract.md's token-estimate section makes no default-bound claim and was left as-is. No src/ files touched. Verified via bun run src/cli.ts check (38 files, 0 errors, 0 warnings), bun test (1913 pass, 0 fail), and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
