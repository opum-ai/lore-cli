---
id: LORE-133
title: resolvePath does not special-case a leading-slash link target
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolvePath (src/core/bundle.ts:465-468) always joins its `path` argument onto the linking file's `dir` via `posix.join(dir, path)`, with no special case for a bundle-root-absolute (`/`-prefixed) target. core/check.ts's linkFindings (check.ts:518) explicitly strips a leading `/` and resolves the remainder against the bundle root instead of the linking directory. Because bundle.ts's resolver (used by resolveRef and the graph builder) and check.ts's resolver (used by the link-check gate) disagree on this one input shape, a `/`-absolute frontmatter ref or link can be classified as resolving to a different concept — or as broken — depending on which code path evaluates it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For a `/`-absolute path input (e.g. `/foo/bar.md`), resolvePath resolves it against the bundle root the same way check.ts's linkFindings does, rather than joining it onto the linking file's directory.
- [ ] #2 A regression test in test/bundle.test.ts covers a `/`-absolute ref/path resolving to the same concept id whether resolved via resolvePath or via the check.ts link-check gate, for a bundle where root-relative resolution and dir-relative resolution would otherwise disagree.
<!-- AC:END -->
