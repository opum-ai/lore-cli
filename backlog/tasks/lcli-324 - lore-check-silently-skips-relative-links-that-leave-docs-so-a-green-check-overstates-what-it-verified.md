---
id: LCLI-324
title: >-
  lore check silently skips relative links that leave docs/, so a green check
  overstates what it verified
status: To Do
assignee: []
created_date: '2026-08-13 03:47'
labels:
  - bug
  - check
  - links
  - docs
dependencies: []
documentation:
  - docs/reference/lore-competitive-feature-matrix.md
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
- [ ] #1 A decision is recorded on whether out-of-bundle relative link targets are resolved or explicitly out of scope
- [ ] #2 If resolved: a link to a missing repository path outside docs/ produces a finding whose severity and exit-code effect are specified, and a regression test proves it fails and names the offending source file and target
- [ ] #3 If out of scope: the check report exposes a count of skipped out-of-bundle links so silence is never mistaken for verification
- [ ] #4 cli-surface.md and cli-contract.md state the boundary in wording that cannot be read as covering every relative link in the repository, and stop relying on the word "internal" to carry it
- [ ] #5 The in-bundle broken-link negative control is retained as a test so the working half of the gate stays proven
<!-- AC:END -->
