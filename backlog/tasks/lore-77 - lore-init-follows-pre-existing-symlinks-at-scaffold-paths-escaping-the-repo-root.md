---
id: LORE-77
title: >-
  lore init follows pre-existing symlinks at scaffold paths, escaping the repo
  root
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 12:53'
labels:
  - codex-review
  - security
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
If docs/ or .lore/ already exists as a symlink to an external location when `lore init` runs, ensureDir recursive mkdirSync and createIfAbsent wx writes both traverse the symlink and create scaffold files at that external target instead of inside the repo. Reproduced directly against a pre-existing docs -> /outside symlink.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore init detects a pre-existing symlink at docs, .lore, or .lore/schemas and refuses to scaffold through it with a clear error
- [x] #2 A test covers a symlinked scaffold path and asserts init refuses rather than writing through it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: identical vulnerability class to LORE-76, different call site --
src/commands/init.ts's runInit calls ensureDir/createIfAbsent DIRECTLY in its own
two loops (plan.dirs, plan.files), NOT through fswrite.ts's writeAllOrRollback
(confirmed by LORE-76's own independent review, which grepped every ensureDir call
site). ensureDir's mkdirSync(recursive:true) transparently follows a pre-existing
symlinked scaffold directory (docs, .lore, or any nested plan dir like
.lore/schemas); createIfAbsent's own lstatSync check already caught a symlink
occupying a FINAL file path (pre-existing test coverage, test/init.test.ts:218-228)
but nothing caught a symlinked ANCESTOR directory before this fix.

Fix: reused LORE-76's assertNoSymlinkInPath rather than writing a near-duplicate --
exported it from fswrite.ts (was private to that file, scoped under the
"All-or-nothing scaffold writes" section even though the function itself is
fully generic: takes root/relPath, no scaffold-specific state). Relocated it to
the top of fswrite.ts near ensureDir/createIfAbsent (the other now-multi-caller
helpers) and updated its doc comment plus the module's own top-level docstring to
describe it as shared by BOTH write disciplines (init's never-clobber loop, LORE-76's
own all-or-nothing writeAllOrRollback) rather than scaffold-specific. Called it in
init.ts's own two loops -- once per plan.dirs entry before ensureDir, once per
plan.files entry before createIfAbsent -- mirroring exactly how writeAllOrRollback
already calls it.

Confirmed this doesn't break init's own idempotency contract (AC#2 of the ORIGINAL
LORE-18 init task): a normal re-run where docs/.lore/etc. already exist as REAL
directories (not symlinks) passes assertNoSymlinkInPath cleanly (lstatSync on a real
dir returns isSymbolicLink()===false, no throw) -- verified via the full existing
init.test.ts suite passing unchanged (16 pre-existing tests, including the
idempotent-rerun and partial-delete-refill cases, all still pass).

Live end-to-end verification against the real CLI (scratch repos, real symlinks):
- Pre-fix repro reproduced the task's own claim exactly: a pre-existing `docs ->
  outside-dir` symlink + `lore init` wrote docs/index.md straight into the outside
  directory (confirmed via git stash: watched outside-target/index.md appear where
  it had never existed).
- Post-fix: the same scenario exits 5 (conflict) naming the symlinked segment;
  nothing lands in the outside directory.

3 new tests added to test/init.test.ts (a symlinked docs/ directory, a symlinked
.lore/ directory, and a symlinked .lore/schemas/ -- a NESTED plan directory, proving
the guard walks every ancestor segment rather than special-casing the task's own
three named top-level examples), each asserting BOTH the conflict error (naming the
path and "symlink") AND that nothing was written into the outside directory.
Confirmed via git stash (isolating init.ts + fswrite.ts, keeping the new tests) that
all 3 genuinely fail pre-fix (no exception thrown -- init silently succeeded) and
all 16 pre-existing tests in the file are unaffected either way.

Full bun test: 1608 pass/0 fail (up from 1605). bun run typecheck clean. bunx biome
check clean (no formatter changes needed this time).
<!-- SECTION:NOTES:END -->
