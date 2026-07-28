---
id: LCLI-232
title: >-
  lore query --type/--status/--tag values are not trimmed, inconsistent with
  --field
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - cmd-crud-b
  - codex-review-followup
  - query
dependencies: []
priority: low
type: bug
ordinal: 334000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `src/commands/query.ts`, `readValue` (live: src/commands/query.ts:232-244) returns `--type`/`--status`/`--tag` values verbatim and rejects only a literally-empty value, while `parseFieldFilter` (src/commands/query.ts:190-204) trims both sides of `--field key=value` and rejects an empty-after-trim value. The query engine's comparison `equalsFold` (src/core/query.ts:347-348) folds case but does NOT trim, so a padded `--type " Story "` silently matches nothing, whereas the equivalent `--field type=" Story "` trims to 'Story' and matches — the exact 'a padded value must not silently miss' problem parseFieldFilter's own doc (src/commands/query.ts:184-188) calls out, left unguarded on the --type/--status/--tag path.

Provenance: Codex second-opinion review (backlog doc-2, low-severity), cluster cmd-crud-b. Confirmed still live on `dev`.

Constraint: `readValue` is also the value reader for `--limit` (src/commands/query.ts:145), whose `parseCount` deliberately rejects a space-padded run (e.g. ' 2 '). The fix must trim only the string-filter values (--type/--status/--tag) and must NOT loosen `--limit`'s existing strictness.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `--type " Story "` (leading/trailing whitespace) selects the same concepts as `--type "Story"`.
- [x] #2 `--status "  "` and `--tag "  "` (whitespace-only) are a `usage` error ('needs a value'), matching `--field x=`'s empty-after-trim rejection.
- [x] #3 `--tag "  archive  "` matches the same concepts as `--tag archive`.
- [x] #4 `--limit`'s existing rejection of a space-padded value (e.g. `--limit " 2 "`) is unchanged.
- [x] #5 Tests cover: a padded --type/--status/--tag matching, a whitespace-only --status/--tag rejected as usage, and the unchanged --limit space-padded rejection.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a readTrimmedValue(flag, inline, args, i) helper in src/commands/query.ts that delegates to the existing readValue for the raw token, then .trim()s it and rethrows the same 'needs a value' usage error if the trimmed result is empty. 2. Switch the --type/--status/--tag call sites in parseQueryArgs to use readTrimmedValue instead of readValue, leaving --limit's readValue call (feeding parseCount) untouched so its space-padded rejection stays strict. 3. Add test/query.test.ts coverage: a padded --type/--status/--tag matching test (AC#1/#3), whitespace-only --status/--tag usage-error cases added to the existing rejects-with-usage test.each table (AC#2), and a --limit ' 2 ' padded-rejection case in the same table confirming AC#4 is unchanged. 4. Verify with bun test (full suite), bun test test/query.test.ts, bun run typecheck, and bunx biome check on the two changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added readTrimmedValue() in src/commands/query.ts: wraps readValue, trims, and rejects a whitespace-only result with the same 'needs a value' usage error. Switched the --type/--status/--tag call sites in parseQueryArgs to use it; --limit's readValue call (feeding parseCount) is untouched. Verification: full 'bun test' = 1992 pass/0 fail; 'bun test test/query.test.ts' = 56 pass/0 fail; 'bun run typecheck' clean (tsc --noEmit, no output); 'bunx biome check src/commands/query.ts test/query.test.ts' = no issues. Task-specific evidence: 'bun test test/query.test.ts -t LCLI-232' = 1 pass, proving AC#1 (padded --type matches untrimmed) and AC#3 (padded --tag matches untrimmed), plus a padded --status check. 'bun test test/query.test.ts -t rejects' = 24 pass, including the new [--limit, ' 2 '] case still throwing 'invalid --limit " 2 "' (AC#4, unchanged strictness) and the new [--status, '  ']/[--status, '   ']/[--tag, '  '] cases each throwing the usage error 'needs a value' (AC#2) — all asserted via expectError('usage', ...) so the error TYPE is confirmed usage, not just the message (AC#5).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the --type/--status/--tag value reader in src/commands/query.ts so it trims whitespace and rejects a whitespace-only value as a usage error, matching --field's existing trim-and-reject behavior — without loosening --limit's strict (untrimmed) parseCount validation. Added a readTrimmedValue() helper that wraps the existing readValue() (still used unchanged for --limit/--field), used only at the --type/--status/--tag call sites. Added test coverage in test/query.test.ts: a padded --type/--status/--tag now matches the same concepts as the untrimmed value; whitespace-only --status/--tag are rejected as usage errors; --limit ' 2 ' remains rejected unchanged. Verified: bun test (1992 pass/0 fail), bun test test/query.test.ts (56 pass/0 fail), bun run typecheck (clean), bunx biome check on both changed files (no issues). Diff is scoped to src/commands/query.ts + test/query.test.ts only.
<!-- SECTION:FINAL_SUMMARY:END -->
