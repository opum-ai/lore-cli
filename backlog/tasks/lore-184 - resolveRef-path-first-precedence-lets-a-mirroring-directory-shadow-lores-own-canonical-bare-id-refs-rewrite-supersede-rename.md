---
id: LORE-184
title: >-
  resolveRef path-first precedence lets a mirroring directory shadow lore's own
  canonical bare-id refs (rewrite/supersede/rename)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-22 20:02'
updated_date: '2026-07-23 04:07'
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
- [x] #1 resolveRef resolves a suffix-less bare bundle-root id to that root id even when a shadow concept at <dir>/<id> exists (no silent dir-join shadowing of lore's own written refs)
- [x] #2 LORE-134's original fix still holds: a '.md'-suffixed or './'-prefixed relative ref that dir-joins to a real concept still resolves to the dir-relative target, not a coincidental root id
- [x] #3 lore rename of a referring file no longer rewrites a canonical bare-id ref to a shadow concept's id (consequence (c) above cannot reproduce); regression test added
- [x] #4 supersede dedup and rename inbound-repointing behave correctly in the presence of a mirroring/shadow directory; regression tests cover the shadow scenario
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/core/bundle.ts, replace resolveRef's blanket path-first precedence with a shape-based classifier: add isPathShapedRef(ref) = ref ends with .md (case-insensitive) OR starts with './' or '../'. 2. If path-shaped: try resolvePath (dir-join) first, fall back to bundle-root id (preserves LORE-134). 3. If bare (id-shaped): try bundle-root id first via idFromPath, fall back to resolvePath dir-join (fixes LORE-184 — a bare canonical id like lore supersede/rename writes is no longer shadowed by a same-relative-path concept). 4. rewrite.ts's remapRefItem and supersede.ts's appendSupersedes both call resolveRef directly, so no code changes needed there — only add regression tests to their test files. 5. Add regression tests: test/bundle.test.ts (resolveRef unit-level shadow case + dir-relative-bare-id fallback case), test/rename.test.ts (rename of a referring file no longer rewrites a canonical bare-id ref to a shadow's id), test/supersede.test.ts (dedup check not fooled by a shadow). 6. Mutation-check via git diff/apply -R (not stash) on bundle.ts alone: confirm all 3 new tests fail pre-fix, pass post-fix. 7. bun test + bun run typecheck full green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed: resolveRef's blanket path-first precedence (LORE-134) let resolvePath's dir-join steal a suffix-less bare bundle-root id (the exact form lore supersede writes and rewrite.ts's remapRefItem canonicalizes to) whenever a same-relative-path concept existed. Fix: classify the ref by shape (isPathShapedRef — .md suffix or ./../ prefix = path form, tried dir-join-first; else = bare id form, tried root-id-first), each falling back to the other interpretation on miss. Verified via mutation-check: reverted bundle.ts only (git diff -- src/core/bundle.ts > patch; git apply -R patch), reran the 3 new regression tests — all 3 FAILED reproducing consequences (a)/(b) graph-edge-shadowed, (c) rename-corrupts-referring-ref, (d) supersede-dedup-miss exactly as described in the task repro; re-applied the patch (git apply patch), all 3 PASS. Full suite: bun test = 1876 pass / 0 fail (5283 expect calls, 47 files); bun run typecheck clean. Edits confined to src/core/bundle.ts (resolveRef + new isPathShapedRef helper), test/bundle.test.ts, test/rename.test.ts, test/supersede.test.ts — no changes needed in rewrite.ts or supersede.ts source since both already funnel through bundle.ts's resolveRef. Task marked Done.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed resolveRef (src/core/bundle.ts) to disambiguate frontmatter-ref precedence by ref SHAPE instead of a blanket path-first order: a .md-suffixed or ./../-prefixed ref is path-shaped (dir-join tried first, LORE-134 preserved); a suffix-less bare ref (the canonical form lore supersede writes and rewrite.ts canonicalizes moved refs to) is id-shaped (bundle-root id tried first), each falling back to the other form on a miss. This stops a mirroring/shadow directory from silently stealing lore's own canonical bare-id refs in the graph, lore rename's inbound repointing, and lore supersede's dedup check. rewrite.ts and supersede.ts needed no source changes (both already call resolveRef directly) — only new regression tests. Verified: 3 new regression tests (test/bundle.test.ts, test/rename.test.ts, test/supersede.test.ts) reproduce the exact shadow scenario from the task repro; mutation-checked by reverting only src/core/bundle.ts via git diff/apply -R (no stash) — all 3 failed pre-fix, all 3 passed post-fix. Full suite green: bun test = 1876 pass/0 fail; bun run typecheck clean.
<!-- SECTION:FINAL_SUMMARY:END -->
