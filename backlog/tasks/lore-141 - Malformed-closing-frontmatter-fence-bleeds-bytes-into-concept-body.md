---
id: LORE-141
title: Malformed closing frontmatter fence bleeds bytes into concept body
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-concept-manifest
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
splitFrontmatter (src/core/concept.ts:448-471) delegates fence splitting to gray-matter@4.0.3, whose closing-delimiter search (node_modules/gray-matter/index.js:93-94) is a substring `str.indexOf('\n---')` rather than an exact-line match. lore's MATTER_OPTIONS only customizes the YAML engine's parse function and does not guard gray-matter's own fence-splitting, so a closing fence with extra trailing characters (e.g. `----` instead of `---`) is accepted and a few stray bytes from the fence leak into the parsed body. This was reproduced live: parsing `---\ntype: Reference\n----\nbody text here\n` through tryParseConcept yields `body: "-\nbody text here\n"`, with a leading `-` bled in from the malformed fence, silently corrupting concept content instead of raising a validation error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Parsing a document whose closing frontmatter fence has extra trailing dash characters (e.g. `----`) either raises a `validation` LoreError pointing at the malformed fence, or produces a body with no leaked fence characters (not both a false-success and a corrupted body)
- [ ] #2 A regression test is added to test/concept.test.ts covering a closing fence with trailing extra dashes, asserting the parsed body no longer contains a stray leading `-` (or other fence remnant) and/or that parsing rejects the malformed fence
- [ ] #3 The fix does not alter parsing of well-formed `---`/`---` fenced documents (existing concept.test.ts cases continue to pass)
<!-- AC:END -->
