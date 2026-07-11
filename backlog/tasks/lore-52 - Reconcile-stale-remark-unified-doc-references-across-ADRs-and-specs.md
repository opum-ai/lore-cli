---
id: LORE-52
title: Reconcile stale remark/unified doc references across ADRs and specs
status: To Do
assignee: []
created_date: '2026-07-11 14:13'
labels:
  - docs
  - cleanup
dependencies: []
priority: low
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tech-stack.md and ADR-0001 described dependencies that were never actually
adopted (Commander, unified/remark, remark-validate-links -- confirmed via
package.json: only mdast-util-from-markdown, gray-matter, js-yaml, zod).
LORE-14 corrected tech-stack.md and ADR-0001's one factual dependency list,
but 8 other docs still reference the stale remark/unified framing as if it
were current architecture: docs/index.md, docs/adr/0007-validation-and-coherence.md,
docs/adr/0008-managed-block-remark-ast.md, docs/adr/0010-multi-consumer-docs-layer.md,
docs/adr/0011-frontmatter-serialization-stability.md, docs/reference/architecture.md,
docs/specs/lore-design.md, docs/reference/okf-conformance.md.

ADR-0008's own BODY already correctly documents the LORE-22 amendment away from
remark/unified toward mdast-util-from-markdown-only ("not unified().use(remarkParse)")
-- it is specifically the surrounding narrative/title/description framing (and
the other 7 docs) that still speak as if the full remark/unified pipeline ships.

Note: ADRs are point-in-time decision records, not living docs -- this task is
about clarifying/annotating where prose has drifted from the decision actually
implemented (e.g. a corrective note or amendment marker), not rewriting ADR
history. Reconcile each file's claims against actual shipped code (grep imports
in src/) before editing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every doc reference to remark/unified/remark-validate-links/Commander accurately reflects what is actually shipped (grep-verified against src/ imports and package.json), or is clearly marked as an amended/superseded historical decision
- [ ] #2 docs/index.md and architecture.md (the most-read entry points) are corrected first
<!-- AC:END -->
