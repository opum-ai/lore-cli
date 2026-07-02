---
id: LORE-22
title: 'managed-block.ts: remark/mdast task block'
status: Done
assignee:
  - '@jeremy'
created_date: '2026-06-21 06:26'
updated_date: '2026-07-02 12:21'
labels:
  - core
milestone: m-3
dependencies:
  - LORE-21
documentation:
  - docs/adr/0008-managed-block-remark-ast.md
priority: high
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Regenerate the lore:tasks region via mdast; byte-identical on no change; build links from JSON filePathRelative.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No upstream change yields a byte-identical block
- [x] #2 Links resolve to the correct backlog task files
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create pure engine src/core/managed-block.ts (no md serializer; parse-to-locate + string-splice like rewrite.ts/indexes.ts).
   - Export TASK_BLOCK_BEGIN/END sentinels; ManagedTaskRow{id,title,status,file:string|null}; RegenerateTaskBlockOptions{docPath}.
   - regenerateTaskBlock(content, rows, opts): parse full raw file via fromMarkdown; locate the TWO top-level html marker nodes STRUCTURALLY (ADR-0008 s1: markers inside code fences/blockquotes are not top-level html nodes -> never matched); validate ADR-0008 s2 (exactly one balanced begin<end pair at top level, else LoreError validation/exit6); build frozen table STRING; splice [beginEnd,endStart) with newline+table+newline, preserving frontmatter/modeline/prose byte-for-byte.
   - Frozen format: header '| Task | Title | Status |', delim '|---|---|---|', row '| [id](link) | title | status |'; empty rows -> '_No linked tasks._'.
   - Links via normalizeLink(docPath, row.file) from filePathRelative (repo-relative both sides -> cross-subtree ../../backlog/tasks/..%20..md); null file -> plain-text id (tolerate/mark, never error). Cell hardening: singleLine + escape | + neutralize <!--/-->; link text also escapes [ ].
2. test/managed-block.test.ts: AC#1 fixpoint (regenerate over generated block === same bytes); AC#2 links resolve to correct task files from filePathRelative; marker validation errors (missing/dup/crossed/unbalanced); empty-tasks paragraph; null-file tolerance; code-fence marker immunity; frontmatter+prose preserved verbatim. Aim 100% func+line on new file.
3. Gates: bun run typecheck; bun run lint; bun test green (was ~1052 pass).
4. Do NOT wire link/unlink/sync into cli.ts (LORE-24+). Feature branch feat/lore-22-managed-block -> PR into dev; user merges.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered src/core/managed-block.ts (pure engine) + test/managed-block.test.ts (19 tests). Parse-to-locate + string-splice (rewrite.ts/indexes.ts pattern), NOT remark-stringify — lore ships no md serializer. regenerateTaskBlock(content, rows, {docPath}) parses full raw bytes via fromMarkdown, locates the TWO top-level html marker nodes structurally (ADR-0008 s1: a sentinel inside a code fence/blockquote is not a top-level html node -> never matched), validates one balanced begin<end pair (else LoreError validation/exit6), builds a frozen table string, and splices [beginEnd,endStart) with newline+table+newline — frontmatter/modeline/prose preserved byte-for-byte.
AC#1 (byte-identical): frozen format (header '| Task | Title | Status |', delim '|---|---|---|', row '| [id](link) | title | status |'; empty -> '_No linked tasks._'); regenerate-over-generated is a proven fixpoint (===).
AC#2 (correct links): each link via normalizeLink(docPath, row.file) from repo-relative filePathRelative -> cross-subtree '../../backlog/tasks/lore-42%20-%20Bulk%20archive.md' (upper-cased display id, lower-cased on-disk file; never reconstructed from id). Null file (task absent on branch) tolerated: row renders id as plain text, never errors. Cell hardening: singleLine + escape | + neutralize <!--/-->; link text also escapes [ ].
Gates: typecheck clean; biome lint clean (3 pre-existing infos); bun test 1071 pass/0 fail; managed-block coverage 100% funcs / 97.78% lines (only uncovered line is a TS-noUncheckedIndexedAccess-forced unreachable guard, idiomatic per rewrite.ts). lore validate 0 errors / lore check 0 errors,0 warnings.
Scope: engine only — NOT wired into cli.ts (link/unlink/sync are LORE-24+). ADR-0008 records a remark-stringify mechanism that lore cannot ship; the module docstring records the splice supersession — whether to amend the ADR file itself is pending a user decision.

ADR-0008 amended in this PR (user decision): Status now carries an 'Amended — 2026-07-02 (LORE-22)' note, §Decision item 3 records the frozen-string-splice mechanism (no serializer), and the 'Serializer coupling' tradeoff became 'Format coupling'. lore validate/check stay clean (0 errors/0 warnings).

Applied /code-review (max) findings. FIXED in-PR:
- (correctness) Marker regexes were whitespace-intolerant: mdast keeps a marker line's leading indent / trailing spaces in the html node value, so a stray trailing space made findMarkers throw a false 'region missing' (fails lore check/CI on a visibly-correct doc). Fix: trim node.value before matching (test added; still a byte-fixpoint, marker bytes preserved).
- (correctness) renderRow guarded on 'file === null' only, so an empty-string filePathRelative rendered a broken '../..md' link. Fix: treat null OR '' as no-file -> plain-text id (test added).
- (docs) Completed the ADR-0008 amendment the review flagged as incomplete: §Decision item 1 (was 'unified().use(remarkParse)' + GFM) now names mdast-util-from-markdown / no-GFM + the whitespace-trim; item 6 ('serialization uses a frozen config') now credits the frozen-string format; the 'Robust against pathological markdown' Positive bullet no longer claims CRLF/serializer handling and states the LF precondition. validate/check clean.
DEFERRED (rationale):
- normalizeLink throws a bare Error (not LoreError) on an absolute path -> belongs at the LORE-24 command boundary (docPath is a caller-supplied repo-relative precondition), not the pure engine.
- offsetsOf/Marker duplicate rewrite.ts positionOf/ByteRange, and cell/escapeLinkText duplicate indexes.ts linkText -> real DRY, but consolidation touches files outside LORE-22; fold into a shared mdast-utils / md-cell-safety helper later (cf. indexes.ts encodePathSegments TODO(LORE-28) pattern).
- findMarkers is tasks-only (not parameterized for lore:index structural location) -> forward scope beyond LORE-22 ACs.
Gates after fixes: typecheck, lint, 1073 tests, validate/check all green; managed-block coverage 100% funcs / 97.80% lines.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
src/core/managed-block.ts + test/managed-block.test.ts land the pure lore:tasks managed-block engine: structural mdast marker location + frozen-string splice (no md serializer), byte-identical fixpoint (AC#1), and filePathRelative-sourced portable links with null-file tolerance (AC#2). ADR-0008 amended to match the shipped mechanism. Both ACs checked; gates green (typecheck, lint, 1071 tests, validate/check). Engine only — CLI wiring is LORE-24+.
<!-- SECTION:FINAL_SUMMARY:END -->
