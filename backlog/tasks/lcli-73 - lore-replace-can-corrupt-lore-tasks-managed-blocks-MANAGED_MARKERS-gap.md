---
id: LCLI-73
title: 'lore replace can corrupt lore:tasks managed blocks (MANAGED_MARKERS gap)'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:24'
labels:
  - codex-review
  - correctness
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
core/replace.ts MANAGED_MARKERS only lists the lore:index begin/end markers. The lore:tasks managed-block markers that managed-block.ts (LCLI-22) added after replace.ts shipped were never wired into this registry, so `lore replace` edits and counts matches inside a live task table, directly contradicting the documented "skips lore-managed regions" guarantee. Reproduced directly: replacing text inside a well-formed lore:tasks block edits the machine-owned row instead of skipping it. A subsequent `lore sync` will clobber the corrupted table. Found independently from two review angles (reading core/replace.ts directly, and reading commands/replace.ts which calls it) — same registry, same fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MANAGED_MARKERS in core/replace.ts includes the lore:tasks begin/end marker pair alongside lore:index
- [x] #2 lore replace leaves matches inside a lore:tasks managed block untouched and uncounted, matching its documented behavior for lore:index blocks
- [x] #3 A regression test covers a match located inside a lore:tasks block and asserts it is skipped
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: added TASK_BLOCK_BEGIN/TASK_BLOCK_END (managed-block.ts) as a second
MANAGED_MARKERS entry in core/replace.ts, alongside the existing
INDEX_BLOCK_BEGIN/END pair.

Round-1 review (general-purpose subagent) verdict: FAIL. The initial fix
reused core/indexes.ts's locateManagedBlock (a literal indexOf scan) for
the lore:tasks marker pair. Several of THIS repo's own docs (ADRs,
runbooks, reference docs) cite the `lore:tasks:begin`/`:end` syntax in
prose/fenced code examples to document the format; the literal scan can't
tell a citation from a real block, producing false "duplicated"/
"unmatched" validation errors on some files and silently misprotecting
ordinary prose on another. Confirmed live: `lore replace "Backlog.md"
"the-Backlog-fork" --dry-run` aborted with exit 6 against this repo's own
dev docs/ tree — `lore replace`'s default (no --in) invocation was
completely broken by the round-1 fix.

Round 2 fix: added managed-block.ts's `locateTaskBlock`, built on the
module's existing structural (mdast, top-level-html-node-only) marker
location that lore sync/check already trust, instead of the literal
scan. core/replace.ts's MANAGED_MARKERS registry became
MANAGED_REGION_LOCATORS (an array of locator functions) so lore:index
(literal scan, verified safe there — that marker text never occurs as a
citation anywhere in docs/) and lore:tasks (structural) each use the
strategy that's actually correct for them. 7 new tests cover the
review-found failure modes (fenced-code citation, inline-prose citation,
real-block-plus-citation, the exact 3-citation shape that broke round 1),
all proven as genuine regression guards via `git stash` isolated-revert.

Round-2 review (second general-purpose subagent) verdict: FAIL on one
point, PASS on everything else. It independently traced locateTaskBlock's
null/throw/span semantics, re-verified the live repo repro now succeeds
(286 matches in 29 of 37 files, exit 0), ran additional dry-runs against
all 8 real docs files citing the marker syntax (all succeeded), and built
a real end-to-end lore:tasks block in a scratch bundle (`lore init` +
`lore new story`) to confirm genuine protection still works (a distinctive
string inside the block survived a repo-wide replace; only the prose
occurrence was replaced) — all PASS. The one blocking finding: a new test
line in test/managed-block.test.ts exceeded biome's configured 120-col
line width, which would fail CI's lint gate (`bun run lint` exited 1);
the task's own round-2 notes had incorrectly claimed lint was clean.

Round 3 fix: replaced the offending `as {...}` type casts in the new
tests with a null-check-and-throw pattern (narrower and under the line
limit). `bun run lint` now exits 0 (4 pre-existing infos only, none new).

Final verification: `bun test` 1623 pass / 0 fail. `bun run typecheck`
clean. `bun run lint` exits 0. Live CLI repro against this repo's own
dev docs/ succeeds (see round-2 evidence above).

Campaign-convention lessons:
- A reviewer's own live-repo repro (not just synthetic test fixtures)
  caught a real regression synthetic tests alone missed — this repo's
  own docs bundle is itself adversarial test data worth running any
  bundle-wide command against before trusting "tests are green."
- Don't trust your own "lint is clean" claim in task notes without the
  actual exit code in hand — the round-2 notes asserted this incorrectly
  and a follow-up review caught it in under a minute.
<!-- SECTION:NOTES:END -->
