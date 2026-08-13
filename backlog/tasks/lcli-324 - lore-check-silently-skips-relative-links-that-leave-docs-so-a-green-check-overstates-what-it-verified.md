---
id: LCLI-324
title: >-
  lore check silently skips relative links that leave docs/, so a green check
  overstates what it verified
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-13 03:47'
updated_date: '2026-08-13 21:34'
labels:
  - bug
  - check
  - links
  - docs
  - 'doc:stories/harden-post-0-2-lore-correctness'
dependencies: []
documentation:
  - docs/reference/lore-competitive-feature-matrix.md
  - docs/reference/cli-surface.md
  - docs/reference/cli-contract.md
  - docs/stories/harden-post-0-2-lore-correctness.md
modified_files:
  - src/core/check.ts
  - src/core/instructions.ts
  - src/commands/check.ts
  - test/check.test.ts
  - docs/reference/cli-surface.md
  - docs/reference/cli-contract.md
priority: medium
type: bug
ordinal: 447000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A relative markdown link from a concept to a repository path outside the bundle is neither resolved nor reported. It is not flagged broken when the target is missing, and it is not counted as checked when the target exists — it is simply skipped, with no finding of any severity.

Established by negative control on 2026-08-13. Pointing an existing citation at a nonexistent `../../research/<dir>/NOPE.md` left the run at `69 files, 0 errors, 0 warnings`, exit 0. The same negative control against an in-bundle target behaves correctly and is good evidence the gate works within its scope:

```
error reference/lore-competitive-feature-matrix.md [broken-link]: link
  "claude-obsidian-teardown-NOPE.md" points at
  "reference/claude-obsidian-teardown-NOPE.md", which is not in the bundle
69 files, 1 error, 0 warnings   -> exit 6
```

This is arguably the intended scope — `check` gates the bundle, and cli-surface.md describes its exit in terms of "broken internal links/anchors". The problem is that "internal" is doing load-bearing work it cannot carry: a reader parses it as "not an external URL", which a relative path to a sibling repository directory plainly satisfies. So the wording promises repository-relative coverage while the implementation stops at the bundle edge.

That gap matters more than the raw number of affected links, because a passing gate reads as proof. This repository's own authoring rules call a gate that certifies more than it verified the most confident possible false clear, and this is an instance of that shape: docs/ is a directory-scoped scan being read as a whole-repository guarantee.

It is already live in this repository. The competitive landscape reference cites two files under `research/2026-08-12-agent-knowledge-tooling/`; both targets exist, but `lore check` did not verify either, and they had to be checked by hand.

Either direction closes it — the decision is which, and it should be made deliberately rather than inherited:

1. Extend resolution to repository-relative targets outside docs/, reporting a missing target as a broken link (possibly warning-tier, since files outside the bundle are outside lore's write scope).
2. Keep the scope and make it unmistakable — report skipped out-of-bundle links in the check report as an explicit count, and state the bundle-edge boundary in cli-surface.md and cli-contract.md in words that cannot be read as repository-wide.

Option 2 is cheaper and may be the right answer; what is not acceptable is leaving the ambiguity, because the current wording invites the misreading.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A decision is recorded on whether out-of-bundle relative link targets are resolved or explicitly out of scope
- [x] #2 If resolved: a link to a missing repository path outside docs/ produces a finding whose severity and exit-code effect are specified, and a regression test proves it fails and names the offending source file and target
- [x] #3 If out of scope: the check report exposes a count of skipped out-of-bundle links so silence is never mistaken for verification
- [x] #4 cli-surface.md and cli-contract.md state the boundary in wording that cannot be read as covering every relative link in the repository, and stop relying on the word "internal" to carry it
- [x] #5 The in-bundle broken-link negative control is retained as a test so the working half of the gate stays proven
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Retain bundle-scoped link validation and add skippedOutOfBundleLinkCount to CheckReport for authored relative .md links that normalize above the selected bundle root.
2. Aggregate the count across bundle roots and expose it in JSON plus the plain/pretty summary without changing findings, severity counts, or exit codes.
3. Add core and command regression coverage for skipped out-of-bundle links, zero counts, multi-root aggregation, and the existing in-bundle broken-link negative control.
4. Update cli-surface.md and cli-contract.md to state the exact bundle boundary and report field; reconcile the active Story and managed docs through Lore when commit authority permits its self-committing coupling step.
5. Run focused tests, full project gates, strict Lore validation/check, diff hygiene, and an adversarial self-review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed campaign decision: out-of-bundle relative link targets remain explicitly outside lore check scope. The report will count skipped links so a green result cannot imply repository-wide verification. The count is informational and never affects errorCount, warningCount, --strict, or the exit code. Lore linking/sync may create commits and therefore remains deferred pending explicit commit authority.

Implemented the focused slice in src/core/check.ts and src/commands/check.ts: check.report now carries skippedOutOfBundleLinkCount, counts only authored relative .md targets that normalize above the bundle root, aggregates across roots, and prints the informational count without changing findings or exit semantics. Updated cli-surface.md and cli-contract.md with the explicit bundle boundary. Added unit/command/multi-root controls and strengthened the in-bundle missing-link negative control. Verification so far: bun test test/check.test.ts — 294 pass, 0 fail; npm run typecheck — passed.

Adversarial self-review found one stale user-facing surface: lore instructions check still said broken internal links without naming the bundle boundary. Updated src/core/instructions.ts and aligned code comments; no further correctness defects found. Final-tree evidence: bun test --reporter=dot — 2,573 pass, 1 intentional skip, 0 fail across 79 files; post-review bun test test/check.test.ts — 294 pass, 0 fail; npm run typecheck, npm run lint, npm run build, and git diff --check — passed; ./dist/lore validate --strict — 70 files, 0 errors, 0 warnings; ./dist/lore check --strict — 70 files, 0 errors, 0 warnings, 343 out-of-bundle links skipped. ./dist/lore sync --dry-run --plain predicts only docs/log.md. AC#2 is not applicable under the recorded out-of-scope decision; the in-bundle branch remains proven by the strengthened exit-6 negative control. Remaining workflow blocker: lore link and actual lore sync can create commits, and source delivery also requires explicit commit authority. Task remains In Progress with no final summary.

User authorized Story coupling, actual Lore sync, local commits, and PR delivery on 2026-08-13; merge remains separately unauthorized. Created delivery branch fix/lcli-324-link-boundary-report. lore link coupled the task to stories/harden-post-0-2-lore-correctness and created scoped Backlog commit 0e4e4ab. lore sync reconciled the Story to in-progress, regenerated its managed task row and docs/log.md, and created scoped tracker commit 709fd68. A subsequent lore sync --dry-run was clean.
<!-- SECTION:NOTES:END -->
