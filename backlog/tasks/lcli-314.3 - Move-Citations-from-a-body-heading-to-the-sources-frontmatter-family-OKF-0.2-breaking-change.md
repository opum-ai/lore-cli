---
id: LCLI-314.3
title: >-
  Move Citations from a body heading to the sources frontmatter family (OKF 0.2
  breaking change)
status: To Do
assignee: []
created_date: '2026-08-04 21:47'
labels: []
dependencies:
  - LCLI-314.1
references:
  - >-
    https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
documentation:
  - docs/reference/okf-conformance.md
parent_task_id: LCLI-314
priority: medium
type: feature
ordinal: 430000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
OKF 0.2 §13.1 replaces the body-level `# Citations` list with a `sources` frontmatter key (§5.1). `sources` also carries optional credibility signals — `author`, `usage_count`, `last_modified` — that 0.1 had nowhere to put.

Scope for lore: teach the schema, template, and check layers about `sources`; stop treating a `# Citations` heading as the citation carrier under 0.2; and decide what a 0.1 bundle keeps doing.

Grounding to establish first, because it changes the size of this task: search the profile section vocabulary in `src/core/template.ts` and the built-in profile in `src/core/profile.ts` for whether any lore type currently declares a `Citations` section at all. If no built-in type does, the body-side work is limited to tolerating and optionally migrating hand-authored `# Citations` sections rather than removing a shipped heading. Record what was found in the implementation notes — do not assume either way.

Interaction to check: `sources` entries that point at other concepts in the bundle may look like links. Decide explicitly whether they participate in the link graph that `lore check` walks (`src/core/bundle.ts`, `src/commands/check.ts`). If they do, a dangling `sources` entry needs a defined finding tier; if they do not, say so in the conformance doc so the exclusion is deliberate rather than an oversight.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 sources is a recognized frontmatter key under okf_version 0.2, including the author, usage_count, and last_modified credibility signals
- [ ] #2 A malformed sources value fails as a validation error (exit 6) with a diagnostic naming the offending file and key
- [ ] #3 Whether sources entries participate in the link graph is decided, implemented, and documented in docs/reference/okf-conformance.md
- [ ] #4 An existing body-level # Citations section is tolerated and never silently deleted
- [ ] #5 Under okf_version 0.1, behavior is unchanged
- [ ] #6 Tests cover a well-formed sources block, a malformed one, and the 0.1 no-change path
<!-- AC:END -->
