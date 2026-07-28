---
id: LCLI-35.2
title: lore rename (graph-aware inbound link/ref rewrite)
status: Done
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:14'
labels:
  - cmd
milestone: m-4
dependencies: []
documentation:
  - docs/reference/cli-surface.md
parent_task_id: LCLI-35
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Graph-aware concept rename: move a concept to a new id/path and rewrite every inbound cross-link + frontmatter ref via a surgical mdast-position string splice (no markdown serializer dep; no prose reflow), then regenerate sub-indexes. Introduces the shared core/rewrite.ts inbound-rewrite engine (rewriteInbound). Delivers LCLI-35 AC#2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 rename updates every inbound link and reference
- [x] #2 moved file's own outbound links are recomputed against its new location
- [x] #3 authored prose outside changed link destinations is byte-unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on feat/lore-35.2-rename (commit 54b1d94). New pure core/rewrite.ts (rewriteInbound, 100% func): graph-derived affected-file set; surgical mdast-position string splice of link destinations (destRangeForLink/destRangeForDefinition — node.url is NOT byte-equal to source, so the dest byte range is located structurally: angle-bracket <> wrapper, \(escapes\), and "title" handled). Used reference definitions repointed, orphan defs left alone; #fragment/?query preserved; right-to-left splice. Frontmatter specs/supersedes/superseded_by refs resolving to fromId -> bare-id toId. Moved file: all outbound links recomputed against new dir (self-link retargets, dangling links corrected by pure path arithmetic). Resolution mirrors bundle.ts (case-sensitive, leading-slash absorbed), NOT check.ts. New commands/rename.ts (thin): loadBundle -> rewriteInbound(move:true) -> regenerate index.md hubs over post-rename graph (skips unrelated canonical hubs, no churn) -> write (new path before delete via new fswrite.removeFile). Exit 0 / 2 usage|same-id / 3 not_found / 5 conflict. Documented limitations (rewrite.ts header): only concept files rewritten (non-concept inbound links are lore check's job); moved file's frontmatter path-refs to OTHER concepts not recomputed (lore writes bare-id refs). Gates green: 742 tests pass, biome clean, tsc clean, core 100% func. /code-review max pending fold.

Folded /code-review max (15 findings, all addressed): DATA-LOSS fixes — case-only rename now renames the inode (fswrite.moveFile) instead of write-new+delete-old; FS-aware conflict guard (assertTargetFree) blocks case-differing/non-concept clobbers; reserved index/log target rejected; mkdir -p for new target dirs; emptied source dir's stale index.md listing cleared. ENGINE — moved file's path-form frontmatter refs to OTHER concepts + orphan reference definitions now recomputed; #fragment/?query preserved from SOURCE bytes (not decoded node.url) for AC#3 byte-fidelity; reuses bundle.ts resolveRef/internalTarget/resolvePath/REF_FIELDS (now exported) so trimming/classification can't drift. Deferred: full cross-file transactional rollback (shared with replace). Gates: 751 tests pass, biome+tsc clean, core/rewrite.ts & commands/rename.ts 100% func.

Delivered via #23 (squash-merge d85fd2c). CI green on macos/ubuntu/windows.
<!-- SECTION:NOTES:END -->
