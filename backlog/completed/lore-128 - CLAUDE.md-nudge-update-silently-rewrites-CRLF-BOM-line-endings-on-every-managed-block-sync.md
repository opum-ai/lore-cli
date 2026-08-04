---
id: LORE-128
title: >-
  CLAUDE.md nudge update silently rewrites CRLF/BOM line endings on every
  managed-block sync
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 17:02'
labels:
  - codex-review-followup
  - cmd-meta-c
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`normalizeOnDisk` (src/commands/agents.ts:117-119) strips a leading BOM and converts CRLF/lone-CR to LF, and this normalized string — not the raw on-disk bytes — is what `planNudge` (src/core/agent-bridge.ts:236-247) passes into `upsertManagedBlock` to build the new CLAUDE.md contents. As a result, any real update to the `lore:agents` managed block in a CLAUDE.md that originally used CRLF line endings or had a BOM silently rewrites the entire file to LF-only with the BOM stripped, beyond just the managed block itself. No code path preserves the original line-ending style or BOM when writing the updated file back to disk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running `lore agents` (no --check) against a CLAUDE.md with CRLF line endings and/or a leading BOM, where only the managed block needs refreshing, preserves the original CRLF endings and BOM in the rest of the file's bytes on disk.
- [x] #2 A regression test in test/agents.test.ts (or agent-bridge equivalent) covers a CRLF+BOM CLAUDE.md input and asserts the written output's non-managed-block content retains CRLF/BOM rather than being normalized to LF.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/commands/agents.ts: read CLAUDE.md's RAW (pre-normalize) string too; detect its BOM presence + dominant EOL (CRLF/CR/LF) from those raw bytes.
2. Keep planBridge/upsertManagedBlock working on the normalized (LF, no-BOM) string as today (detection/splice unaffected).
3. Before writing CLAUDE.md's planned contents to disk, re-apply the detected BOM + EOL convention to the final string (replace \n -> original EOL, prepend BOM) so bytes outside the managed block round-trip exactly; a fresh/LF file is a no-op.
4. Add a regression test in test/agents.test.ts: seed a CRLF+BOM CLAUDE.md needing a block refresh, run agents, assert the written file's surrounding prose keeps CRLF+BOM (not normalized to LF).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed in src/commands/agents.ts only (no core/agent-bridge.ts change needed): read CLAUDE.md's raw pre-normalization bytes alongside the existing normalizeOnDisk() call, detect BOM presence + dominant EOL (CRLF/CR/LF) via new detectDiskStyle(), then re-apply that style (reapplyDiskStyle()) to the CLAUDE.md-specific planned contents right before writeFileAtomic. SKILL.md's wholesale-regenerate path is untouched by design (it fully overwrites, no partial byte-preservation applies there).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed: lore agents now detects the original CLAUDE.md's BOM + dominant EOL (CRLF/CR/LF) from its RAW on-disk bytes (before normalizeOnDisk collapses them) and re-applies that convention to the whole file when writing back an updated managed-block, so a CRLF/BOM CLAUDE.md is no longer silently rewritten to LF/no-BOM. SKILL.md's separate whole-file regenerate path is unchanged (out of scope: it's a full overwrite, not a partial splice). Change is entirely in src/commands/agents.ts (new detectDiskStyle/reapplyDiskStyle helpers); core/agent-bridge.ts and managed-block.ts untouched.

Verification:
- New regression tests in test/agents.test.ts (LORE-128 describe block): CRLF+BOM CLAUDE.md with a stale managed block, run `lore agents`, assert output keeps the BOM and every line CRLF (including the freshly-written block itself), is idempotent on re-run, and a plain LF/no-BOM file is unaffected (no spurious CRLF/BOM introduced).
- `bun test test/agents.test.ts`: 25 pass / 0 fail (was 23 before; +2 new).
- `bun test` (full suite): 1740 pass / 0 fail, 4924 expect() calls, across 46 files.
- `bun x tsc --noEmit -p tsconfig.json`: clean, no errors.
- `bun run lint` (biome): no findings in src/commands/agents.ts or test/agents.test.ts (pre-existing 4 infos in unrelated files: managed-block.ts/test.ts, supersede.test.ts).
<!-- SECTION:FINAL_SUMMARY:END -->
