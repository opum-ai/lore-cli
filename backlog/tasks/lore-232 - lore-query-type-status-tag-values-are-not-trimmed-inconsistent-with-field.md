---
id: LORE-232
title: >-
  lore query --type/--status/--tag values are not trimmed, inconsistent with
  --field
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 `--type " Story "` (leading/trailing whitespace) selects the same concepts as `--type "Story"`.
- [ ] #2 `--status "  "` and `--tag "  "` (whitespace-only) are a `usage` error ('needs a value'), matching `--field x=`'s empty-after-trim rejection.
- [ ] #3 `--tag "  archive  "` matches the same concepts as `--tag archive`.
- [ ] #4 `--limit`'s existing rejection of a space-padded value (e.g. `--limit " 2 "`) is unchanged.
- [ ] #5 Tests cover: a padded --type/--status/--tag matching, a whitespace-only --status/--tag rejected as usage, and the unchanged --limit space-padded rejection.
<!-- AC:END -->
