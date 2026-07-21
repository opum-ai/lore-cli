---
id: LORE-94
title: >-
  schema export: no regression test for --out near-miss boundaries, and
  isManagedSchemasDir doesn't resolve symlinks
status: To Do
assignee: []
created_date: '2026-07-21 18:52'
labels:
  - backlog-campaign-followup
  - security
  - test-coverage
dependencies: []
references:
  - backlog/docs/doc-1 - Backlog campaign tracker.md
priority: low
type: bug
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LORE-75 confined schema export's orphan-pruning to the managed default directory via `isManagedSchemasDir(absOutDir, root)` in src/commands/schema.ts:151-153 — a purely lexical comparison (`absOutDir === resolve(root, SCHEMAS_DIR)`) with no realpath/symlink resolution. Two gaps in that safety net, both independently reverified live against current dev HEAD:

(1) Test coverage: test/schema-export.test.ts's --out coverage exercises a distinct sibling directory ('schemas-out') and the repo root ('--out .'), but has no case for a directory name that shares a lexical prefix with, or nests inside, '.lore/schemas' — e.g. '.lore/schemas-extra', '.lore/schema', '.lore/schemas/sub'. Live-CLI repro against all three (each pre-seeded with an unrelated *.schema.json) confirmed today's code handles them safely — no pruning occurs — but that guarantee is enforced only by hand-verification of isManagedSchemasDir's string equality, not locked in by an automated test that would catch a future regression (e.g. a switch to startsWith or a path-prefix check).

(2) Symlink bypass: because isManagedSchemasDir does no realpath resolution, a `.lore/schemas` that is itself a symlink to another directory still satisfies the lexical equality (resolve() does not dereference symlinks), so pruneOrphans (schema.ts:163-184) reads and rmSync's through the symlink into the real target. Live repro: symlinked .lore/schemas to an outside directory containing an unrelated file lore never wrote; ran `lore schema export` — that file was deleted. This requires an attacker or careless script to already have write access to the repo to plant the symlink, the same narrow precondition LORE-75's reviewer flagged; someone with that access could already delete files directly without this path, so real-world exploitability beyond defense-in-depth is minimal.

Both are pre-existing characteristics outside LORE-75's own AC scope (which addressed --out pointing elsewhere, not the default managed path itself being tampered with), not regressions introduced by that fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A full export to each of .lore/schemas-extra, .lore/schema, and .lore/schemas/sub (each pre-seeded with an unrelated *.schema.json) leaves that unrelated file untouched, asserted by an automated test.
- [ ] #2 The managed-directory check treats a symlinked .lore/schemas (pointing outside the repo or to an arbitrary directory) as NOT the managed directory, so pruneOrphans does not delete files through it.
- [ ] #3 An automated test covers the symlinked-.lore/schemas case and asserts a pre-existing file in the symlink's target survives a full schema export.
- [ ] #4 Existing pruning behavior for a genuine (non-symlinked) default .lore/schemas directory is unchanged: orphaned schema files there are still removed on a full export.
<!-- AC:END -->
