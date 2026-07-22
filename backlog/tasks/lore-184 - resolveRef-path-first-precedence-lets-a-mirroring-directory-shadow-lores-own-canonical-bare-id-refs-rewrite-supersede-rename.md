---
id: LORE-184
title: >-
  resolveRef path-first precedence lets a mirroring directory shadow lore's own
  canonical bare-id refs (rewrite/supersede/rename)
status: To Do
assignee: []
created_date: '2026-07-22 20:02'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
priority: medium
type: bug
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up from the wave-8 integration review of LORE-134 (which flipped resolveRef in src/core/bundle.ts to try the dir-relative path form BEFORE the bundle-root id form). That flip correctly fixed the mirror-image bug (a relative/.md-suffixed frontmatter ref that dir-joins to a real concept should win over a same-string coincidental root id), but it regresses the OTHER direction for lore's OWN canonical ref form.

resolvePath dir-joins ANY non-`/`-prefixed ref and idFromPath tolerates a suffix-less ref, so a bare bundle-root id — exactly the form `lore supersede` writes and the form rewrite.ts remapRefItem canonicalizes every moved ref to ('canonicalize to bare id') — is itself dir-joinable. After the flip the dir-joined interpretation wins whenever a shadow concept exists (e.g. an archive/ directory mirroring the live tree at the same relative id).

Live repro confirmed during review: resolveRef('adr/old', 'notes', {adr/old, notes/adr/old, notes/x}) -> 'notes/adr/old' (shadowed); with no shadow -> 'adr/old' (correct). Traced real consequences at untouched call sites when a shadow exists: (a) graph edge silently points at the shadow, no dangling finding; (b) 'lore rename' of the true target no longer repoints the inbound ref (resolved === ctx.from misses); (c) 'lore rename' of the REFERRING file physically rewrites the ref text to the shadow's id (return resolved branch) — silent corruption of a previously-correct ref; (d) supersede.ts:265 dedup check misses, appending a duplicate supersedes entry.

The flip's own docstring rests on the (now-false) assumption that lore-written bare ids 'are not dir-joinable to anything real'.

Suggested direction (needs a design decision, hence a task not a hotfix): disambiguate on ref SHAPE rather than a blanket precedence — treat a ref with a '.md' suffix or a './'-prefix as the path form, and a suffix-less ref as the id form — so both LORE-134's case and the canonical bare-id case resolve unambiguously. Consider whether resolveRef should return a signal when both interpretations exist.

Files: src/core/bundle.ts (resolveRef/resolvePath ~438-490, idFromPath), src/core/rewrite.ts (remapRefItem ~724-746), src/commands/supersede.ts (~265). Conflicts (for wave scheduling) with any other task touching bundle.ts (core-bundle-check) or rewrite.ts (core-rewrite-engine: LORE-164/165/180).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 resolveRef resolves a suffix-less bare bundle-root id to that root id even when a shadow concept at <dir>/<id> exists (no silent dir-join shadowing of lore's own written refs)
- [ ] #2 LORE-134's original fix still holds: a '.md'-suffixed or './'-prefixed relative ref that dir-joins to a real concept still resolves to the dir-relative target, not a coincidental root id
- [ ] #3 lore rename of a referring file no longer rewrites a canonical bare-id ref to a shadow concept's id (consequence (c) above cannot reproduce); regression test added
- [ ] #4 supersede dedup and rename inbound-repointing behave correctly in the presence of a mirroring/shadow directory; regression tests cover the shadow scenario
<!-- AC:END -->
