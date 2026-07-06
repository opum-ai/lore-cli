---
id: LORE-24
title: lore link / unlink
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:26'
updated_date: '2026-07-06 14:25'
labels:
  - cmd
milestone: m-3
dependencies:
  - LORE-21
documentation:
  - docs/adr/0009-story-task-coupling-reconciliation.md
priority: high
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tasks to a Story frontmatter and tag the task with a queryable label doc:<conceptId> (plus --doc for display).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 orphans can find tasks owning a doc via the label
- [x] #2 unlink removes both sides cleanly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/commands/link.ts (new): runLink + runUnlink, thin over loadBundle + BacklogAdapter.
   - Shared arg parser (<id> <taskId...> + --no-back-ref, mirrors supersede.ts/rename.ts).
   - idFromPath(id) -> loadBundle -> concept lookup (conceptNotInBundle on miss, exit 3);
     flush WarningCollector advisories immediately after loadBundle.
   - docPath = `${DOCS_DIR}/${concept.path}`; back-ref label = `doc:${concept.id.toLowerCase()}`.
   - link: validate every taskId exists via adapter.viewTask BEFORE any write (fail loud,
     no partial state) -> not_found (exit 3) on a missing task id. Append new ids
     (lowercased) to `tasks:` frontmatter, case-insensitive dedup; write only if changed.
     Unless --no-back-ref: --add-label doc:<id> (Backlog-idempotent) AND re-pass the
     task's full `documentation` array + docPath (read via viewTask first) since --doc is
     SET/REPLACE (backlog-cli-contract 2.4) -- never clobber an existing unrelated doc ref.
   - unlink: symmetric removal from `tasks:`. No task-not-found failure (cli-surface's
     unlink exit table has none) -- a task already deleted from Backlog is tolerated,
     doc-side cleaned, back-ref skipped. Unless --no-back-ref: --remove-label, and
     re-pass documentation minus docPath -- except when that would leave it empty
     (Backlog cannot clear --doc via an empty value; ADR-0009's accepted cosmetic-drift
     tradeoff, not worked around).
   - LinkOptions/UnlinkOptions take an injectable `adapter?: BacklogAdapter` (default
     createBacklogAdapter(bunBacklogSpawn())), same shape as check.ts's injectable fetch.
2. src/cli.ts: add "link"/"unlink" dispatch cases + USAGE text.
3. test/link.test.ts: scriptedSpawn fake (backlog-adapter.test.ts pattern) + temp-bundle
   setup (supersede.test.ts pattern). Cover both ACs, idempotency, --no-back-ref, the
   link-vs-unlink missing-task divergence, and the --doc SET/REPLACE preserve/shrink/
   cannot-empty cases.
4. Gates (bun test, biome check, tsc --noEmit, coverage) -> /code-review max -> fold ->
   CHANGELOG + backlog notes/ACs -> PR into dev.
Out of scope: no reconcile.ts/managed-block.ts wiring (that's LORE-26, confirmed with the
user this session -- LORE-24's own ACs never touch either).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/commands/link.ts: runLink + runUnlink, thin over loadBundle + the LORE-21
BacklogAdapter. Both share one arg parser (<id> <taskId...> + --no-back-ref) and a `prepare()`
helper (idFromPath -> loadBundle -> concept lookup, advisories flushed immediately after load
per the proven pattern).

link: validates every task id exists via adapter.viewTask BEFORE any write (not_found, exit 3,
no partial edit). Appends new ids (lowercased) to `tasks:`, case-insensitive dedup; writes the
doc only if the list actually changed. Unless --no-back-ref: --add-label doc:<conceptId> plus
--doc re-passing the task's FULL documentation array (read via the same viewTask call) with the
concept's repo-relative path added -- since --doc is SET/REPLACE (backlog-cli-contract 2.4),
never clobbers an existing unrelated doc reference.

unlink: symmetric removal from `tasks:`. Per cli-surface's exit table, unlink has NO
task-not-found case -- a task already deleted from Backlog is tolerated (doc-side still cleaned,
back-ref edit skipped for that id, reported as backRef:"skipped"). Unless --no-back-ref:
--remove-label plus --doc shrunk to the remaining desired array -- except when that would leave
it empty, since Backlog's CLI cannot clear --doc via an empty value; --doc is omitted entirely
in that case, leaving the cosmetically stale entry ADR-0009 already documents as an accepted
tradeoff (not worked around).

Both commands are self-healing per-task: the back-reference edit always runs for every given
task id regardless of whether the doc-side tasks: list already matched, so a stray label/doc
entry left by a prior hand-edit or partial run is reconciled on the next link/unlink.

Scope-corrected this session (confirmed with the user): the handover framed "LORE-24" as
bundling link/unlink + sync/check wiring, but the actual Backlog tasks split reconcile.ts/
managed-block.ts wiring into LORE-26 (sync) and LORE-27 (check) -- both depend on LORE-22/23,
and LORE-26 additionally depends on this task. LORE-24 itself never touches reconcile.ts or
managed-block.ts. The reconcile.overrides + ADR-0009 amendment design question (src/config.ts's
[reconcile.overrides] has no consumer and no ADR-0009 semantics) is carried forward to LORE-26,
where reconcileStatus is actually invoked -- same decision (implement + amend ADR-0009), just
attributed to the right task.

Gates: 23/23 new tests pass (test/link.test.ts); full suite 1112/1112; typecheck clean; biome
clean; coverage 96.77%/99.47% func/line on link.ts (on par with sibling commands; the one
uncovered function is defaultAdapter(), the real-subprocess path, same as check.ts's
defaultFetch). Manually verified end-to-end against the real --json fork (not just the unit
tests' fake adapter): link/re-link/unlink round-trip on a scratch Backlog project confirmed
tasks:/doc:/--doc/label wiring, idempotency, and the --doc-can't-clear-when-empty tradeoff, all
byte-for-byte as designed.

/code-review max on PR #35: 6 findings confirmed after independent verification (0 refuted),
posted in full as a PR comment. Fixed in 20bf2f1:
- (most severe, correctness) runLink/runUnlink's per-task Backlog editTask loop had no
  resilience -- one task's subprocess failure threw, aborting the command mid-loop with the
  rest silently unprocessed and no report. Fixed: every back-ref edit now runs concurrently
  and independently (Promise.allSettled); a failure is caught and reported on that task's row
  (backRef:"failed" + a one-line error) instead of corrupting/blocking the others, and the
  command exits 6 (drift) rather than silently swallowing the failure. The doc-side tasks:
  write never depended on back-ref success, so it's unaffected either way -- this makes
  ADR-0009's already-accepted "two references can disagree" tradeoff visible/reported instead
  of an opaque uncaught exception.
- (correctness) WarningCollector.flush() was called twice per invocation, double-printing every
  load advisory to stderr -- removed the redundant trailing flush.
- (correctness) the local frontmatterList silently dropped any non-string tasks: entry (reachable
  on a type with no schema-declared tasks field, e.g. Reference). Replaced with bundle.ts's
  existing toRefList (now exported for reuse), which coerces a stray scalar to a visible ref
  string instead of dropping it -- matching supersedes/superseded_by's existing behavior.
- (cleanup) renderLinkReport/renderUnlinkReport were byte-identical; consolidated into
  renderTaskReport.
- (perf, minor) runLink's existence-validation reads now batch via Promise.all instead of one
  viewTask subprocess at a time; still reports the first invalid id in argument order.

4 new tests added (concurrent-failure/exit-6 for both commands, the double-flush fix, the
non-string tasks: coercion). Gates after fixes: 27/27 link tests, full suite 1116/1116,
typecheck clean, biome clean, coverage 97.37%/99.50% func/line on link.ts. Re-verified
end-to-end against the real --json fork after the redesign (concurrent multi-task link).

/code-review max, 2nd pass on PR #35 (post-fix): 6 finder angles, 12 pooled candidates,
10 distinct root causes independently verified (0 refuted). NOT yet fixed -- pending
decision on whether to fold a follow-up commit into #35 or ship as-is and track
separately. Posted in full as a PR comment (issuecomment-4887108051).

Correctness (most severe):
- runUnlink (link.ts:252) applies per-task Backlog mutations BEFORE writing the
  concept's tasks: frontmatter (runLink is the opposite order) -- a doc-write failure
  after Backlog mutations strands them with zero report.
- backRefLabel() (link.ts:314) lowercases the concept id -- two concepts differing
  only by case collide on one Backlog label; unlinking one can strip the other's
  real back-reference.
- defaultAdapter() (link.ts:263) never forwards root/options.root to the backlog
  subprocess spawn -- a non-default root silently routes Backlog writes to the wrong
  project while the doc-side edit still reports success.
- runLink's reported backRef status (link.ts:176) reflects only label presence, not
  whether --doc actually needed rewriting -- a silent repair reports as
  already-present.
- runLink's existence pre-check (link.ts:144) uses Promise.all not allSettled -- a
  viewTask rejection can report the wrong task id as invalid instead of the
  documented first-in-argument-order one.
- runLink/runUnlink (link.ts:178) call adapter.editTask unconditionally even when
  nothing needs to change -- no no-op short-circuit, churns Backlog edit history on
  repeated idempotent calls.
- (PLAUSIBLE) runLink's --doc payload (link.ts:175) is computed from the up-front
  validation snapshot, not a fresh read right before the edit, unlike runUnlink --
  narrow race if the task changes out-of-band mid-command.

Cleanup: duplicated case-insensitive membership loop (link.ts:162); parseLinkArgs is
a third near-verbatim copy of the rename.ts/supersede.ts arg parser (link.ts:371);
writeTasksIfChanged re-inlines repoRelativePath()'s template instead of calling it
(link.ts:353).

/code-review max, 3rd pass on PR #35 (workflow-backed, post-round-2-fix commit
a7f7be3): 6 finder angles, 8 pooled candidates, 8 independently verified (0
refuted; 7 CONFIRMED, 1 PLAUSIBLE). NOT yet fixed -- pending a decision.
Posted in full as a PR comment (issuecomment-4887577695).

Correctness (most severe -- two mean the round-2 fixes did not fully close
what they targeted):
- backRefLabel()'s case-preserving fix (link.ts:336) doesn't actually prevent
  the label collision it targeted: Backlog's own --add-label/--remove-label
  de-dup case-insensitively (backlog-cli-contract Sec2.4), so two concepts
  differing only by case still collide on ONE stored Backlog label regardless
  of the exact casing lore sends. link on the 2nd concept silently no-ops
  against the 1st's already-stored label while reporting backRef:"added"
  (false success); unlink on either concept can still strip the other's real
  back-reference. The fix changed what lore sends, not what Backlog stores.
- A concept path/id containing a literal comma (link.ts:187) silently
  corrupts its doc:<conceptId> label: --add-label/--remove-label treat their
  value as comma-joined, splitting one label into two unrelated ones with no
  error surfaced.
- prepare() (link.ts:304, shared by runLink/runUnlink) has no RESERVED_STEMS
  guard, unlike sibling rename.ts/supersede.ts (both touched by this same PR
  to share commands/args.ts) -- `lore link index <task>` silently mutates the
  machine-generated root index.md hub's frontmatter instead of failing loud.
- (PLAUSIBLE) runLink/runUnlink (link.ts:173) fan out one `backlog task edit`
  subprocess per task id concurrently, which the finder reads as in tension
  with ADR-0012 Sec5's "lore does not run concurrent mutating Backlog
  commands" decision -- worth reconciling explicitly even if not an active
  bug today.
- The module doc (link.ts:17) still claims --doc is "read via the same
  viewTask call used for existence" -- stale since this session's fix added a
  fresh 2nd viewTask read right before editing. Risks a future contributor
  "optimizing away" the 2nd read and reintroducing the stale-snapshot race
  the fix just closed.

Cleanup:
- runUnlink (link.ts:225) still does the two-scan case-insensitive membership
  pattern this same commit's fix already eliminated from sibling runLink.
- test/link.test.ts (line 184) hand-rolls reset()/cleanup() + try/finally in
  all 35 tests instead of beforeEach/afterEach, unlike every sibling command
  test file.
- test/backlog-probe.test.ts's new cwd test (line 210) leaks its mkdtempSync
  temp dir -- every other mkdtempSync call site in the suite pairs it with an
  rmSync cleanup.

3rd-pass findings fixed in 0926242 (all 8): case-preserving label fix
replaced with assertNoLabelCaseCollision() (the real fix -- rejects
conflict, exit 5, on a case-insensitive id collision, since Backlog's
own label store de-dups case-insensitively regardless of casing lore
sends); commaJoin() rejects embedded commas (validation error) instead
of silently splitting one label into two; RESERVED_STEMS guard added to
link/unlink (extracted to core/scaffold.ts, shared with rename/
supersede); per-task Backlog edits now run sequentially via
runSequentially() per ADR-0012 Sec5 (was concurrent via
Promise.allSettled); runUnlink's duplicate scan removed (derives
nextTasks from already-computed status, matching runLink); stale module
doc comment updated. ADR-0009 Sec2 amended to document case-preserving +
the collision guard together. 9 new/updated tests, full suite
1129/1129, typecheck clean, biome clean.

/code-review max, 4th pass on PR #35 (workflow-backed, post-3rd-pass-fix
commit 940569d): 6 finder angles, 3 pooled candidates, all 3 independently
verified (0 refuted). Fixed in 088c433:
- (correctness) the round-3 commaJoin() comma-rejection meant a concept
  whose path contains a comma could never get its Backlog back-reference
  written/removed -- every editTask call would throw, permanently
  reporting drift on every future invocation. Added assertNoCommaInId(),
  checked unconditionally before any write (same pattern as the
  reserved-stem/case-collision guards): fails loud once with a clear
  reason instead of silent, permanent per-task drift.
- (cleanup) link.test.ts's fake BacklogAdapter treated doc: [] as "clear
  documentation", diverging from the real adapter's --doc accumulator
  (empty array = no-op, same as undefined). Fixed the fake to match.

One finding left as an ACCEPTED TRADEOFF, not fixed: runLink reads each
task via viewTask twice (existence check, then a fresh read right before
editing). This is deliberate -- the round-2 fix -- to close a narrow
out-of-band-change race; the review's own writeup agrees removing it is
a correctness/perf tradeoff, not a free win. Not changing it.

2 new/updated tests. Full suite 1130/1130, typecheck clean, biome clean.

/code-review max, 5th pass on PR #35 (workflow-backed, post-4th-pass-fix
commit 088c433): 6 finder angles, 2 pooled candidates, both independently
verified (0 refuted). Fixed in 29ee7aa:
- (correctness) assertNoCommaInId() and assertNoLabelCaseCollision()
  (added in the 3rd/4th passes) ran unconditionally in prepare(), even
  though both exist solely to protect the Backlog doc:<id> label
  encoding -- which --no-back-ref never touches. This blocked a
  legitimate pure-frontmatter `--no-back-ref` link/unlink on a
  comma-bearing or case-colliding concept id -- a regression for the
  comma case versus the branch's own pre-088c433 behavior. Both checks
  now gate on `!parsed.noBackRef`; the reserved-stem guard stays
  unconditional (the doc-side tasks: write always happens regardless
  of --no-back-ref).

1 new test. Full suite 1131/1131, typecheck clean, biome clean.

/code-review max, 6th pass on PR #35 (workflow-backed, post-5th-pass-fix
commit 1d7cd85): 6 finder angles, 5 pooled candidates, all 5 independently
verified (0 refuted). 3 of 5 fixed in e242d59:
- (correctness) added a pretty-mode test for link/unlink (none existed,
  unlike every sibling command suite).
- (cleanup) extracted assertNotReservedStem(id, action) into
  commands/args.ts, replacing 3 independently-maintained copies of the
  index/log reserved-stem guard across rename.ts/supersede.ts/link.ts.
- (cleanup) factored link.ts's 3 hand-rolled case-insensitive membership
  checks into one containsCaseInsensitive helper.

2 findings NOT fixed, one deferred to the user, one recorded as an
accepted tradeoff:
- [0, correctness, most severe] `lore rename` never updates a renamed
  concept's Backlog doc:<id> label or --doc path -- ADR-0009 Sec2's prose
  claims "a renamed concept updates the label" but no code path does
  this (rename.ts predates link.ts/ADR-0009 entirely and has zero
  Backlog awareness). Renaming a linked concept permanently orphans its
  Backlog back-reference: lore unlink on the new id computes the NEW
  id's label/doc path, which never matches what's actually stored
  (still the OLD id), so it reports "already-absent" and skips the
  edit -- no lore command can ever clean up the stale doc:<oldId> label.
  This is a real gap but a materially larger, cross-command design
  question (make rename Backlog-aware and async? detect via
  check/orphans instead, per ADR-0009's own "reconciles both ways"
  philosophy?) -- raised to the user for a decision rather than
  unilaterally implemented.
- [2, cleanup] runLink's per-task loop reads each task fresh right
  before its edit instead of batching all fresh reads concurrently up
  front. Deliberately left as-is: batching would widen the staleness
  window for later-processed tasks in a multi-task invocation, which is
  exactly what the round-2 fresh-read fix (from the 2nd pass) exists to
  close. Accepted tradeoff, not a bug.

1 new test. Full suite 1132/1132, typecheck clean, biome clean.

Implemented the 6th-pass finding [0] this session (user chose "make
rename Backlog-aware now" over deferring/documenting-only): lore rename
never updated a renamed concept's doc:<id> Backlog label, permanently
orphaning it (no lore command could ever clean up the stale label
afterward). Fixed in e1c4f50:
- Added moveBackRefs() to commands/link.ts (single owner of the
  doc:<conceptId> label contract) -- moves every linked task's label +
  --doc path from old to new id/path, mirroring link/unlink's per-task
  resilience (sequential edits per ADR-0012 Sec5, fresh reads, isolated
  per-task failure, no-op short-circuit when already current).
- runRename is now async with an injectable BacklogAdapter, constructed
  ONLY when the renamed concept has tasks: -- renaming an unlinked doc
  keeps zero Backlog dependency. File move commits first; back-ref move
  runs after (Backlog failure can never strand an already-renamed
  file). --dry-run skips the Backlog move entirely.
- RenameReport gains backRefs; a failed move exits drift (6).
- Amended ADR-0009 Sec2 to describe actual (not aspirational) behavior.

9 new tests. Full suite 1138/1138, typecheck clean, biome clean.

/code-review max, 7th pass on PR #35 (workflow-backed, post-rename-
Backlog-awareness commit 209c43a): 6 finder angles, 7 pooled
candidates, all 7 independently verified (0 refuted; reported as 5
distinct root causes). All fixed in be47f28:
- (correctness, most severe) moveBackRefs's case-insensitive hasLabel()
  used to independently test hasOldLabel/hasNewLabel broke down for a
  case-only concept rename -- both came back true against the single
  stored label, so the label was removed and never re-added,
  permanently and silently destroying the task's back-reference with
  exit 0 and backRef:"moved" reported (a false success). Fixed with an
  exact-match "new label already correct" check plus a case-insensitive
  "stale label to remove" scan.
- (correctness, same fix) a task already carrying BOTH the old and new
  label/doc (a stale dual-labeled task) was wrongly classified
  already-current by the old OR-based short-circuit, permanently
  leaving the stale old label un-cleaned. Same fix closes this too.
- (correctness) rename.ts never checked newId against
  assertNoLabelCaseCollision before moving back-refs onto it, letting a
  case-sensitive-filesystem rename entangle two unrelated tasks' back-
  references. Generalized the guard (candidateId/excludeId/action) for
  reuse.
- (correctness) rename.ts never rejected a comma-bearing newId up
  front, so the file move committed before the back-ref edit failed on
  it -- permanent partial state on every retry. Exported/generalized
  assertNoCommaInId for reuse; both guards now run before any write,
  scoped to when the concept has linked tasks.
- (correctness) the shared usage() helper dropped the LoreError input
  diagnostic (cli-contract Sec5.2) rename/supersede's original reserved-
  stem errors used to attach. Restored via an optional 3rd param.

9 new/updated tests. Full suite 1142/1142, typecheck clean, biome
clean.

/code-review max, 8th pass on PR #35 (workflow-backed, post-7th-pass-fix
commit 7148aad): 6 finder angles, 6 pooled candidates, all 6 independently
verified (0 refuted). 5 fixed in 56aab45, 1 (finding 0) resolved as a
documentation correction + deferred design question:
- (correctness) moveBackRefs's already-current short-circuit missed the
  "never had any back-ref at all" case (a task linked with --no-back-ref,
  or hand-stripped) -- such a task silently got the new label/doc added
  during a later rename, contradicting the user's original opt-out. Added
  the missing branch.
- (correctness) rename.ts passed the raw, un-deduped tasks: list to
  moveBackRefs; a case-duplicate id caused a redundant Backlog call +
  duplicate report row. Exported/applied dedupeTaskIds.
- (test coverage) added a unit test for assertNoLabelCaseCollision with
  candidateId!==excludeId (rename's exact call pattern) -- the 7th-pass
  fix shipped with zero test proving this exact shape, since it's
  unreachable end-to-end on case-insensitive filesystems.
- (cleanup) extracted makeTask/fakeAdapter/EditCall (copy-pasted,
  already drifted between link.test.ts/rename.test.ts) into
  test/helpers.ts.
- (cleanup) fixed a stale cli.ts comment omitting rename from the
  async-commands list.
- (finding 0, correctness, most severe) a concept relocated BY HAND
  (git mv, IDE refactor -- not lore rename) leaves a permanently
  un-cleanable stale doc:<oldId> label: lore link on the new id only
  ADDS its own label (no notion of a previous id to remove), and lore
  unlink on the old id 404s once that id no longer resolves. My own
  ADR-0009 amendment text overclaimed this resolves "at the next lore
  link/unlink" -- corrected to accurately describe it as a known
  limitation. The real fix (teaching some command to clean up a stale
  label for an id that no longer resolves) is a genuine, separate
  capability question adjacent to LORE-26/27's orphan-detection scope,
  raised to the user as a decision point rather than implemented
  unilaterally in this already-large PR.

4 new/updated tests. Full suite 1145/1145, typecheck clean, biome clean.
<!-- SECTION:NOTES:END -->
