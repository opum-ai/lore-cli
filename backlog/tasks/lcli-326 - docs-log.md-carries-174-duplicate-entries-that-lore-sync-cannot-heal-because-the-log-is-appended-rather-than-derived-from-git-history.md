---
id: LCLI-326
title: >-
  docs/log.md carries 174 duplicate entries that lore sync cannot heal, because
  the log is appended rather than derived from git history
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-13 04:17'
updated_date: '2026-08-18 13:14'
labels:
  - bug
  - sync
  - log
  - generated-output
  - 'doc:stories/build-the-lore-cli-foundation'
dependencies: []
documentation:
  - docs/stories/build-the-lore-cli-foundation.md
modified_files:
  - src/core/log.ts
  - test/log.test.ts
  - test/sync.test.ts
  - docs/specs/lore-design.md
  - docs/reference/cli-contract.md
  - docs/log.md
priority: medium
type: bug
ordinal: 449000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The generated `docs/log.md` is not a faithful projection of git history. It holds **381 entries but only 207 unique lines** — 174 duplicates — and the duplicated entries are byte-identical (same timestamp, SHA, and subject) yet scattered rather than adjacent, e.g. the same commit at line 157 and again at line 291.

The source history is not the cause. For a sampled duplicated commit:

```
occurrences in docs/log.md                   : 2
occurrences in git history for docs/         : 1
occurrences in full git history (--all)      : 1
```

Git contains it once; the generated log contains it twice.

**`lore sync` is idempotent and is not creating new duplicates.** Measured directly: from a clean checkout the first sync took log.md from 403 to 406 lines (three genuinely new commits), and a second consecutive sync with no intervening commit left it at 406. So this is not runaway growth and not a per-run regression.

The defect is that the log is **append-only rather than derived**. Sync extends the file from the last recorded entry instead of regenerating it from history, so duplicates introduced by earlier runs — most plausibly overlapping append ranges written at different times, which matches the scattered non-adjacent pairing — are permanent. Nothing removes them, and because `lore check` does not validate log.md, nothing reports them either. A regenerate-from-history implementation would be self-healing by construction and would have made this state impossible to reach.

Why it matters beyond tidiness: log.md is generated output that a reader, a downstream docs consumer, or an agent may treat as an accurate record of what changed and when. Roughly 45% of its entries are phantom repeats. It also undercuts the determinism claim — the file content depends on the sequence of past sync invocations, not solely on the current bundle and history.

Repository state at the time of writing: `docs/log.md` on branch `docs/lcli-323-competitive-research` at 403 lines / 381 entries / 207 unique. The same condition is present at the merge-base on `dev` (379 entries, 206 unique), so it predates the branch and is not introduced by it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 log.md is regenerated from git history on each sync rather than appended to, so the output is a pure function of history and the bundle
- [ ] #2 Running sync against the current repository reduces log.md to one entry per commit; the 174 existing duplicates are removed without hand-editing the file
- [ ] #3 A regression test asserts that a log.md seeded with duplicate entries is repaired by a single sync
- [ ] #4 A regression test asserts idempotency is preserved: two consecutive syncs with no intervening commit produce byte-identical output
- [ ] #5 Either lore check reports a log.md that disagrees with git history, or the CLI contract states plainly that log.md is unchecked generated output
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Change the pure log projection so each docs-scoped commit renders exactly once, grouped under the deepest common bundle folder touched by that commit; preserve deterministic timestamp/hash ordering and the existing section layout.
2. Extend core log tests with multi-folder commits and sync regression tests with seeded duplicate output, proving one-entry-per-commit repair and consecutive-sync byte idempotency.
3. Align source/design wording with the single common-folder projection and state publicly that git-history log.md is intentionally unchecked generated output.
4. Integrate only after independent review, then run coordinator-owned authorized lore sync to regenerate the live docs/log.md without hand-editing it and verify duplicate-free output against docs-scoped git history.
5. Run focused/full tests, strict Lore gates, diff hygiene, one dev PR, and settle LCLI-326/doc-24.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-18 independent source/history analysis found the filed append-only implementation diagnosis is stale: current sync resolves HEAD, builds log.md from the complete docs-scoped git history, and replaces the file byte-for-byte. The live generated artifact still contains 208 duplicate entry lines (448 entries, 240 unique), so the campaign narrows to direct repair/idempotency regression coverage, an explicit unchecked-output contract, and coordinator-owned regeneration through lore sync.

2026-08-18 first independent review rejected the test/docs-only candidate at 11cc32d. Direct replay proved current generateLog emits each multi-folder commit under every touched folder: candidate output had 467 entry lines, 250 unique lines, and 217 duplicate extras. The production fix will bucket each commit once under its deepest common touched bundle folder; lexicographic assignment was rejected as semantically arbitrary.
<!-- SECTION:NOTES:END -->
