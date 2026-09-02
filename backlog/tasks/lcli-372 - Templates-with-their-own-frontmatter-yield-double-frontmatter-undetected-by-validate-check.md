---
id: LCLI-372
title: >-
  Templates with their own frontmatter yield double frontmatter, undetected by
  validate/check
status: To Do
assignee: []
created_date: '2026-09-02 20:12'
labels: []
dependencies: []
references:
  - >-
    Reported in an issues dump relayed via opum-agent from other agents'
    lore/quest sessions
  - '2026-09-02'
modified_files:
  - src/commands/new.ts
priority: high
type: bug
ordinal: 499000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A .lore/templates/<type>.md custom template that itself begins with a YAML frontmatter fence (rather than body-only content) does not get its frontmatter stripped or merged during lore new scaffold. The generated file ends up with the real generated frontmatter block followed immediately by the template's own frontmatter fence and fields, which the parser then treats as literal body text. Both lore validate and lore check exit 0 -- a silent correctness bug, since nothing in the pipeline flags the malformed structure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore new --template <name> either rejects a template file that begins with its own frontmatter fence at scaffold time, or correctly strips/merges it so only one frontmatter block survives in the generated file
- [ ] #2 lore validate and lore check both flag a double-frontmatter file as an error if one is ever produced (defense in depth, in case a template is hand-edited directly on disk after scaffold)
- [ ] #3 regression test scaffolds from a template containing its own frontmatter block and asserts a single frontmatter fence in the output
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reproduced 2026-09-02 against current dev source: a .lore/templates/reference.md containing its own '---\ntype: Reference\n...\n---' fence, scaffolded via lore new reference "Custom Template Test" --template reference, produces a file with TWO frontmatter blocks -- the real generated one, then the template's literal fence and fields parsed as body text. lore validate and lore check both report 0 errors. Root cause is presumably in src/commands/new.ts's template-loading path (does not special-case or reject a template whose own content begins with '---'); the fix could be scaffold-time (documented as body-only in the template contract, validated/rejected at load) or defense-in-depth (validate/check detect a stray frontmatter fence in body text).
<!-- SECTION:PLAN:END -->
