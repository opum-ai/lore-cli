---
id: LORE-85
title: >-
  Frontmatter YAML anchors can be crafted to exhaust memory on serialize (anchor
  bomb)
status: To Do
assignee: []
created_date: '2026-07-21 08:38'
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
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
yaml.load has no alias/anchor expansion limit, and YAML_DUMP_OPTIONS sets noRefs:true, so a small frontmatter payload using nested YAML anchors parses instantly but expands exponentially on serialize. Reproduced directly: an 18-level doubling-anchor chain (~417 bytes of YAML) expands to a 64MB string in ~600ms on yaml.dump; a few more levels reaches OOM or an uncaught V8 RangeError. serializeConcept is reached broadly (bundle.ts, sync.ts, rewrite.ts, indexes.ts, template.ts, scaffold.ts, commands/link.ts, commands/supersede.ts), so a single crafted concept file anywhere in a bundle can crash most lore commands the next time they touch it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Frontmatter parsing or serialization enforces a bound on anchor/alias expansion (e.g. a maximum expanded size or depth) and fails with a clean LoreError instead of an uncaught RangeError or unbounded memory growth
- [ ] #2 A test covers a crafted anchor-chain payload and asserts a clean, bounded error rather than a crash or multi-second/multi-megabyte expansion
<!-- AC:END -->
