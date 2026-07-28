---
id: LCLI-77
title: >-
  lore init follows pre-existing symlinks at scaffold paths, escaping the repo
  root
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
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
Root cause: identical vulnerability class to LCLI-76, different call site --
src/commands/init.ts's runInit calls ensureDir/createIfAbsent DIRECTLY in its own
two loops (plan.dirs, plan.files), NOT through fswrite.ts's writeAllOrRollback
(confirmed by LCLI-76's own independent review, which grepped every ensureDir call
site). ensureDir's mkdirSync(recursive:true) transparently follows a pre-existing
symlinked scaffold directory (docs, .lore, or any nested plan dir like
.lore/schemas); createIfAbsent's own lstatSync check already caught a symlink
occupying a FINAL file path (pre-existing test coverage, test/init.test.ts:218-228)
but nothing caught a symlinked ANCESTOR directory before this fix.

Fix: reused LCLI-76's assertNoSymlinkInPath rather than writing a near-duplicate --
exported it from fswrite.ts (was private to that file, scoped under the
"All-or-nothing scaffold writes" section even though the function itself is
fully generic: takes root/relPath, no scaffold-specific state). Relocated it to
the top of fswrite.ts near ensureDir/createIfAbsent (the other now-multi-caller
helpers) and updated its doc comment plus the module's own top-level docstring to
describe it as shared by BOTH write disciplines (init's never-clobber loop, LCLI-76's
own all-or-nothing writeAllOrRollback) rather than scaffold-specific. Called it in
init.ts's own two loops -- once per plan.dirs entry before ensureDir, once per
plan.files entry before createIfAbsent -- mirroring exactly how writeAllOrRollback
already calls it.

Confirmed this doesn't break init's own idempotency contract (AC#2 of the ORIGINAL
LCLI-18 init task): a normal re-run where docs/.lore/etc. already exist as REAL
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

INDEPENDENT REVIEW: no bypass found. Tested against the real CLI: symlinked docs (task's own
repro), symlinked .lore at the top level, and -- specifically checking the reuse-integration
angle, not just re-litigating assertNoSymlinkInPath's own internals (already reviewed in LCLI-76)
-- .lore REAL but .lore/schemas (a separately-planned NESTED dir in buildScaffold's dirs list)
symlinked; all three refused correctly regardless of dirs-list order, since the guard walks every
segment of whichever relPath is passed, not just the top-level name. Confirmed every dirs/files
path reaching runInit is a fixed literal constant; the one profile-influenced piece (schema
filenames, via slugForTypeName) strips everything to [a-z0-9-], so a malicious profile.toml can't
inject a path segment -- same property LCLI-76's own review already established for
consumer-scaffold.ts.

IDEMPOTENCY (the one property specific to init's reuse that LCLI-76's own review never had to
check, since lore scaffold isn't idempotent the same way) -- GENUINELY PRESERVED, verified live
against the real CLI: fresh init creates 11 files exit 0; an immediate re-run with everything real
(no symlinks) reports all 11 as "exists", creates 0, exits 0 (lstatSync/isSymbolicLink() is false
on a real dir/file, so the guard is a silent pass-through, not a false positive); deleting one
file then re-running recreates ONLY that file, leaves everything else untouched.

Partial-scaffold-on-abort (init has no rollback, unlike scaffold's writeAllOrRollback) confirmed
as PRE-EXISTING behavior, not a regression this fix introduces -- reviewer swapped in dev's
pre-fix init.ts/fswrite.ts and blocked a later planned dir with a conflicting file: earlier dirs
were already created for real before the abort, identical to today's dev behavior, unrelated to
symlinks. The synchronous single-process TOCTOU inside assertNoSymlinkInPath itself is inherited
from LCLI-76 (already reviewed/accepted there), not introduced or worsened by this reuse.

RELOCATION CORRECTNESS re-verified independently: diffed assertNoSymlinkInPath's body before/after
the move -- byte-identical except doc comments, only location + export keyword changed;
writeAllOrRollback's two existing call sites unchanged in order/args; confirmed via grep exactly 4
total call sites (2 pre-existing, 2 new); reran LCLI-76's own test/scaffold.test.ts +
test/consumer-scaffold.test.ts (17/17 pass) to confirm the relocation didn't disturb the existing
caller's behavior at all.

Test/doc quality: confirmed the new win32 skip guard matches this file's existing convention
exactly (not a new exception); independently reproduced BOTH implementation claims (new tests fail
pre-fix; all 16 pre-existing tests unaffected) via its own git-stash-equivalent isolation.

One minor, non-blocking doc nit applied (no logic change): the relocated docstring's justification
sentence could be misread as implying init's never-clobber discipline was ever unsafe at the FINAL
component -- it wasn't; createIfAbsent's own wx+lstat check already closed that exact case before
this fix existed (per the task's own problem statement and the pre-existing test at
test/init.test.ts:218). Reworded to state plainly which gap (ancestor directories) was universally
open across every write discipline, and which gap (final component) each discipline's own
PRE-EXISTING protection already covered partially/differently before this shared guard unified
both under one check.

ALSO NOTED (not a defect in this diff, already explicitly flagged in LCLI-76's own implementation
notes as intentionally out of scope, not silently missed): src/commands/new.ts, agents.ts,
sync.ts, schema.ts, rename.ts all call ensureDir directly and remain unguarded by
assertNoSymlinkInPath. Worth a FUTURE backlog item, especially new.ts (a user-facing write path
creating files at nested nested paths under docs/) -- recorded in the tracker's Not-queued section
as a follow-up candidate, not expanded into this task.

Full bun test after the review (doc-comment fix only, no logic change): 1608 pass/0 fail
(unchanged). bun run typecheck clean. bunx biome check clean.
<!-- SECTION:NOTES:END -->
