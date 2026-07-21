---
id: LORE-94
title: >-
  schema export: no regression test for --out near-miss boundaries, and
  isManagedSchemasDir doesn't resolve symlinks
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 18:52'
updated_date: '2026-07-21 19:48'
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
- [x] #1 A full export to each of .lore/schemas-extra, .lore/schema, and .lore/schemas/sub (each pre-seeded with an unrelated *.schema.json) leaves that unrelated file untouched, asserted by an automated test.
- [x] #2 The managed-directory check treats a symlinked .lore/schemas (pointing outside the repo or to an arbitrary directory) as NOT the managed directory, so pruneOrphans does not delete files through it.
- [x] #3 An automated test covers the symlinked-.lore/schemas case and asserts a pre-existing file in the symlink's target survives a full schema export.
- [x] #4 Existing pruning behavior for a genuine (non-symlinked) default .lore/schemas directory is unchanged: orphaned schema files there are still removed on a full export.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. fswrite.ts: extract the segment-walk in assertNoSymlinkInPath into a new
   non-throwing helper `findSymlinkSegment(root, relPath): string | null`
   (returns the offending segment name, or null if none). Refactor
   assertNoSymlinkInPath to call it and throw using the returned segment —
   no behavior change for its existing callers/tests.
2. schema.ts: isManagedSchemasDir(absOutDir, root) additionally returns false
   when findSymlinkSegment(root, SCHEMAS_DIR) is non-null (i.e. `.lore` or
   `.lore/schemas` itself is a symlink) — pruneOrphans is then skipped,
   mirroring how a non-default --out is never pruned.
3. Tests (test/schema-export.test.ts):
   - AC#1: full export to .lore/schemas-extra, .lore/schema, .lore/schemas/sub
     (each pre-seeded with an unrelated *.schema.json) leaves that file
     untouched (lexical near-miss, no code change needed, locks in current
     behavior).
   - AC#2/#3: .lore/schemas symlinked to an outside directory containing an
     unrelated file; a full default export does not prune that file.
   - AC#4: existing pruning test for a genuine (non-symlinked) default
     directory stays green, unchanged.
4. Real-CLI verification: scratch repo + real symlinked .lore/schemas,
   confirm pre-fix deletes the outside file and post-fix does not (git stash
   comparison), per this campaign's standing discipline for
   destructive/security fixes.
5. bun test / typecheck / lint, independent review, tracker update, PR,
   self-merge, prune.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed: isManagedSchemasDir(absOutDir, root) in src/commands/schema.ts
was a purely lexical `absOutDir === resolve(root, SCHEMAS_DIR)` comparison; resolve()
never dereferences symlinks, so a `.lore/schemas` that is itself a symlink to an outside
directory still compared equal, and pruneOrphans then rmSync'd through it into the real
target.

Fix: extracted the existing per-segment lstatSync walk from fswrite.ts's
assertNoSymlinkInPath (LORE-76/77 precedent) into a new non-throwing sibling
findSymlinkSegment(root, relPath): string | null, refactored assertNoSymlinkInPath to
call it (no behavior change, its own tests unaffected). isManagedSchemasDir now also
requires findSymlinkSegment(root, SCHEMAS_DIR) === null, so a symlinked default
directory is treated as unmanaged and pruning is skipped entirely (mirrors how any
other --out is never pruned) — writes still proceed as before, only the destructive
prune is gated.

AC1: added a parameterized test (test.each) covering .lore/schemas-extra, .lore/schema,
.lore/schemas/sub — each pre-seeded with an unrelated *.schema.json — confirming the
existing lexical check already handles these safely (no code change needed there, only
test coverage was missing).

AC2/AC3: added a POSIX-only test (matching this codebase's existing symlink-test skip
guard) that symlinks .lore/schemas to an outside tmp directory containing an unrelated
file, runs a full default export, and asserts the file survives.

AC4: existing "a full export removes an orphaned <slug>.schema.json" test (genuine,
non-symlinked default directory) still passes unchanged.

Live-CLI verification (not just synthetic tests, per this campaign's standing
discipline for destructive/security fixes): wrote .repro-scratch/lore94-symlink-verify.ts,
a real runSchema() call against a real symlinked directory. Pre-fix (git stash on
schema.ts/fswrite.ts): exit 0, unrelated file DELETED. Post-fix (stash pop): exit 0,
unrelated file SURVIVES. Confirms the repro is real and the fix closes it.

Verified: bun test -> 1663 pass/0 fail (up from 1659); bun run typecheck clean;
bun run lint clean on all 3 changed files (fswrite.ts, schema.ts,
test/schema-export.test.ts) — 4 pre-existing infos remain in unrelated files
(indexes.test.ts, supersede.test.ts), untouched by this change.
<!-- SECTION:NOTES:END -->
