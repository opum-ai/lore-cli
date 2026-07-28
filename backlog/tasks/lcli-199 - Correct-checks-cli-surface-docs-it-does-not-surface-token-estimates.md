---
id: LCLI-199
title: 'Correct check''s cli-surface docs: it does not surface token estimates'
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:28'
labels:
  - cmd-check
  - codex-review-followup
dependencies: []
priority: low
type: docs
ordinal: 301000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `check` reference documents a `check.report` feature the code does not implement.

**Live context.** `docs/reference/cli-surface.md:171` claims check 'Also surfaces per-doc and bundle **token estimates** (labeled chars/4 heuristic)', and the Output row at `docs/reference/cli-surface.md:177` lists 'token estimates' among `kind: check.report`'s fields. The actual `CheckReport` (`src/core/check.ts:96-130`) carries only `findings`, `errorCount`, `warningCount`, `fileCount`, `complete`, and optional `externalFindings`; `checkBundles` (`src/commands/check.ts:674-690`) computes no token estimate. Token estimates are a `graph.export`/`context.export` concern (`cli-surface.md:320,367`), fitting their agent-budgeting purpose — not the coherence drift gate.

**Resolution scope.** Correct the doc to match `CheckReport`'s real contract. Actually adding token estimates to a drift gate is a separate product decision and is NOT part of this task.

**Provenance.** doc-2 Codex second-opinion review, Low-severity cluster `cmd-check`, finding [3]. Verified still-open against `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The `check` section of docs/reference/cli-surface.md no longer states that check surfaces per-doc or bundle token estimates.
- [x] #2 The `check.report` Output row lists only fields CheckReport actually carries (findings, error/warning counts, fileCount, complete, and the optional externalFindings).
- [x] #3 The docs are updated through the lore CLI (not a hand edit), keeping managed blocks/links coherent.
- [x] #4 No other command's token-estimate documentation (graph, context) is altered.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm real CheckReport shape (src/core/check.ts:96-130): findings, errorCount, warningCount, fileCount, complete, optional externalFindings.
2. Use `bun run src/cli.ts replace` (lore replace), scoped --in docs/reference/cli-surface.md, to (a) delete the false 'Also surfaces per-doc and bundle token estimates' sentence and (b) rewrite the check.report Output row to list only the real fields.
3. Verify with --dry-run first (1 match each, single file), then apply for real.
4. Leave graph/context token-estimate docs (cli-surface.md ~318/326/context section) untouched.
5. Verify: bun test, bun run typecheck, bun run src/cli.ts check (38 files/0/0).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented via lore CLI, not a hand edit: ran `bun run src/cli.ts replace <find> <replace> --in docs/reference/cli-surface.md` twice (each first --dry-run'd, confirming exactly 1 match in exactly 1 file before applying for real). Edit 1: deleted the sentence 'Also surfaces per-doc and bundle **token estimates** (labeled chars/4 heuristic).' plus its trailing blank line. Edit 2: rewrote the check.report Output row from '... drift, broken links/anchors, portability findings, token estimates; plus advisory externalFindings ...' to list only CheckReport's real fields: findings, errorCount, warningCount, fileCount, complete; plus optional externalFindings when --external ran (cross-checked against src/core/check.ts:96-130). Confirmed graph section (cli-surface.md ~318,326) and the context section's tokenEstimate/truncated row were untouched (git diff --stat shows only the check section changed; grep for 'token estimate' after the edit shows only the two graph-section hits remaining).

Verification: bun test -> 1913 pass, 0 fail (5385 expect() calls, 47 files). bun run typecheck (tsc --noEmit) -> clean, no output. bun run src/cli.ts check -> '38 files, 0 errors, 0 warnings' (bundle stays coherent after the doc edit).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected docs/reference/cli-surface.md's check section to match CheckReport's real contract: removed the false claim that check surfaces per-doc/bundle token estimates, and rewrote the check.report Output row to list only findings/errorCount/warningCount/fileCount/complete (plus optional externalFindings), per src/core/check.ts:96-130. Both edits were applied through `bun run src/cli.ts replace --in docs/reference/cli-surface.md` (dry-run verified 1 match each before applying), not a hand edit. graph/context token-estimate docs were left untouched. Verified: bun test 1913 pass/0 fail; bun run typecheck clean; bun run src/cli.ts check -> 38 files, 0 errors, 0 warnings.
<!-- SECTION:FINAL_SUMMARY:END -->
