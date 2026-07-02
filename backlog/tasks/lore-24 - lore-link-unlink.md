---
id: LORE-24
title: lore link / unlink
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:26'
updated_date: '2026-07-02 19:48'
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
<!-- SECTION:NOTES:END -->
