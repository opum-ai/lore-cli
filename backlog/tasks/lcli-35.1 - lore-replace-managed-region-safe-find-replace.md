---
id: LCLI-35.1
title: lore replace (managed-region-safe find/replace)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:10'
labels:
  - cmd
  - 'doc:stories/build-the-lore-cli-foundation'
milestone: m-4
dependencies: []
documentation:
  - docs/reference/cli-surface.md
  - docs/stories/build-the-lore-cli-foundation.md
parent_task_id: LCLI-35
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Literal/regex find-replace across one doc or the whole bundle, skipping lore-managed regions (today: the <!-- lore:index:begin/end --> listing block). Pure core engine (core/replace.ts) + thin command (commands/replace.ts). Delivers LCLI-35 AC#1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 replace never touches managed regions
- [x] #2 literal and regex modes both work; --dry-run writes nothing; --in scopes by glob
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as pure core engine core/replace.ts (replaceInText + managedRanges + mergeRanges, 100% line/func) + thin commands/replace.ts. AC#1 (never touch managed regions): the engine partitions each file at managed-region boundaries (MANAGED_MARKERS registry; today only the lore:index:begin/end block, markers imported from indexes.ts) and rewrites ONLY author-owned gaps, restitching managed regions byte-for-byte; matches inside a region are neither replaced nor counted. Verified end-to-end via the real CLI: replacing 'widget' left [widget](widget.md) inside an index block byte-identical while all prose occurrences changed. Literal mode escapes regex metachars + literal $ in replacement; --regex supports $1; empty find / invalid regex are usage errors (exit 2). commands/replace.ts: .md-only Bun.Glob discovery confined to repo, --in repeatable, --dry-run writes nothing, overwrite via new fswrite.writeFileOverwriting; emits replace.result. Gates green: 686 tests, biome, tsc, core 100%. Delivered via feat/lore-35.1-replace -> PR into dev.

Folded a /code-review max pass (11 verified correctness defects). Engine redesigned to a single whole-document pass: regex anchors/\b/lookaround bind to the real document (not gap boundaries); matches overlapping a managed region are skipped; $1/$&/$`/$'/$<name> expanded explicitly and verified byte-for-byte vs String.replace. Empty-MATCHING patterns (x*, a?, \b, ^) rejected up front via a probe. Managed bounds now via the shared indexes.locateManagedBlock (first-begin→last-end), so replace protects exactly what sync/check regenerate, incl. prose between two blocks. Command discovery: skips symlinks (no write-escape), canonical-realpath dedup (no double-apply), absolute --in globs via resolve(), excludes generated log.md; pattern compiled/validated ONCE before discovery (fails even with zero files); two-phase read-all-then-write (atomic abort on read error / bad pattern); no-op (find===replace) writes/reports nothing; fswrite maps EISDIR->conflict. Extracted shared commands/discover.ts (readSource/canonicalIdentity/toRepoRelative/withinRepo) and migrated check.ts+validate.ts onto it. Deferred: shared flag-tokenizer across the 4 command parsers. Gates: 708 tests, biome, tsc; core/replace 100% func/~99% line. Re-dogfooded end-to-end (two-block protection, log.md exclusion, symlink skip, no-op, absolute glob).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered via PR #22 (squash 89330e4). lore replace: managed-region-safe literal/regex find-replace (AC#1). Pure core/replace.ts (single whole-document pass, shared indexes.locateManagedBlock bounds, explicit $1 expansion) + thin commands/replace.ts (symlink-skip, canonical dedup, absolute globs, log.md excluded, two-phase atomic write, no-op no-churn) + shared commands/discover.ts (check/validate migrated onto it). Folded a /code-review max pass (11 verified defects). 708 tests, biome, tsc green; core 100% func. Deferred: shared flag-tokenizer across the 4 command parsers.
<!-- SECTION:FINAL_SUMMARY:END -->
