---
id: LORE-180
title: >-
  rewrite.ts newDestPathFor ignores leading-slash link targets, diverging from
  resolvePath (lore rename mis-derives /-absolute links)
status: To Do
assignee: []
created_date: '2026-07-22 17:14'
labels:
  - core-rewrite-engine
dependencies: []
priority: medium
ordinal: 190000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After LORE-133 aligned core/bundle.ts's resolvePath with check.ts's leading-'/' handling, src/core/rewrite.ts's newDestPathFor (~line 475) still inlines idFromPath(posix.join(dir, decoded)) with NO leading-slash special case — even though its doc comment claims it 'reuses resolvePath' (resolvePath is imported at rewrite.ts:76 but never called). Consequence after LORE-133: for a '/'-absolute frontmatter ref or link the graph (via resolvePath) counts it as an inbound edge to the ROOT concept, but lore rename's per-link rewriter mis-derives that link's target id — renaming the true target selects the inbound file yet SKIPS the '/'-absolute link (it rots), and renaming a decoy concept at the dir-joined path can HIJACK a '/'-absolute link when the file is inbound via another edge. Both behaviors pre-existed LORE-133 (unchanged by that diff) but are now inconsistent with the aligned graph/check resolution. Flagged by the wave-6 LORE-133 review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 newDestPathFor resolves a '/'-absolute link target against the bundle root the same way resolvePath/check.ts's linkFindings do (strip leading '/', resolve remainder root-relative), rather than posix.join(dir, target)
- [ ] #2 Renaming the true target of a '/'-absolute inbound link rewrites that link (it no longer rots/skips), and a decoy concept at the dir-joined path cannot hijack it
- [ ] #3 A regression test (test/rename.test.ts or test/rewrite.test.ts) covers a '/'-absolute inbound link across a rename asserting it is rewritten to the new id, plus a decoy case that must NOT be hijacked
- [ ] #4 The stale resolvePath import at rewrite.ts:76 is either actually used (preferred) or the misleading doc comment is corrected
<!-- AC:END -->
