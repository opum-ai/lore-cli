---
id: LORE-74
title: >-
  lore orphans report has no output cap, contradicting the documented truncation
  contract
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 13:59'
labels:
  - codex-review
  - api-design
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/reference/cli-contract.md explicitly names orphans as one of the read-heavy commands subject to a bounded-output-with-truncation-hint contract, alongside query/graph/context. computeOrphans/renderReport currently emit every orphaned task and dangling link with no cap and no total/shown/truncated metadata — a regression test (LORE-51) even enshrines rendering all 700,000 rows unbounded. A large Backlog snapshot or bundle can exhaust CI logs or blow an agent context window, exactly what the bounded-output contract exists to prevent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore orphans caps emitted rows and reports total/shown/truncated counts, consistent with query/graph/context
- [x] #2 The existing LORE-51 unbounded-output test is updated to reflect the new capped, truncation-hinted behavior
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation: added --limit <n> (default DEFAULT_ORPHANS_LIMIT=20, mirrors query's cap) to `lore orphans`, applied INDEPENDENTLY to each section (orphanTasks/danglingLinks are unrelated counts, so one combined cap would make one section's truncation state say nothing about the other — the design question flagged in the prior handover). OrphansReport gained orphanTasksTotal/Shown/Truncated + danglingLinksTotal/Shown/Truncated (flat fields, mirroring query.ts's QueryResult convention rather than nesting a Truncation object); each pair is present iff its array is (omission still means "not requested"). Header now reports the TOTAL (not the capped shown count), matching query's header convention; each non-empty section gets its own §3 truncation footer ("showing N of M — raise --limit to see more").

Docs: updated docs/reference/cli-surface.md's orphans row (Key flags/Output) to document --limit and the new fields; cli-contract.md's §3 list already named orphans (that was the pre-existing contract vs. behavior gap this task closes) so it needed no change.

Verification:
- `bun test` (full suite): 1642 pass, 0 fail.
- `bun run typecheck`: clean.
- `bun run lint`: clean on all touched files (4 pre-existing infos remain in unrelated test/supersede.test.ts and test/managed-block.test.ts, untouched by this change).
- `git stash` discipline: stashed orphans.ts + manifest.ts, confirmed the new/updated orphans.test.ts assertions fail against the pre-fix code (SyntaxError: DEFAULT_ORPHANS_LIMIT not exported, and pre-stash the LORE-51 test's old assertions would fail against capped output), then popped and re-ran green.
- Real-bundle smoke test: `bun run src/cli.ts orphans` and `lore check` against this repo's own real docs/ tree — bundle loads cleanly (only pre-existing ADR summary-length warnings, unrelated), `lore check` reports 0 errors/0 warnings. The Backlog-snapshot leg itself couldn't be exercised against the real `backlog` binary on PATH (it's the stock v1.48.0, not the --json-capable fork this repo requires — a known, pre-existing environment gap, not caused by this change); that leg is covered instead by the fakeAdapter-based unit/integration tests (49/49 pass in orphans.test.ts), including a 700,000-row synthetic snapshot exercising both the default-cap and raised-past-total-limit paths.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added --limit <n> to `lore orphans` (default 20, mirrors `query`), applied independently to each of orphanTasks/danglingLinks since they're unrelated counts; each section carries its own total/shown/truncated (cli-contract §3), omitted together with its array when excluded by --tasks-only/--docs-only. Header now reports totals, each non-empty section gets its own truncation footer. Updated the LORE-51 700k-row regression test to assert the new capped default (with a footer, highest id dropped) while adding a second test that raises --limit past the total to preserve the original crash-safety guard. Updated cli-surface.md's orphans flag/output row. Verified with the full test suite (1642 pass), typecheck, lint (clean on touched files), git-stash pre/post-fix discipline, and a real-CLI smoke test against this repo's own docs/ bundle (`lore orphans`, `lore check` — 0 errors/0 warnings).
<!-- SECTION:FINAL_SUMMARY:END -->
