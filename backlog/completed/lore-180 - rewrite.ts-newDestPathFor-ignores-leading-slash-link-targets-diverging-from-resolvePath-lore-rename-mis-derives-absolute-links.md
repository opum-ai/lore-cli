---
id: LORE-180
title: >-
  rewrite.ts newDestPathFor ignores leading-slash link targets, diverging from
  resolvePath (lore rename mis-derives /-absolute links)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-22 17:14'
updated_date: '2026-07-23 03:41'
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
- [x] #1 newDestPathFor resolves a '/'-absolute link target against the bundle root the same way resolvePath/check.ts's linkFindings do (strip leading '/', resolve remainder root-relative), rather than posix.join(dir, target)
- [x] #2 Renaming the true target of a '/'-absolute inbound link rewrites that link (it no longer rots/skips), and a decoy concept at the dir-joined path cannot hijack it
- [x] #3 A regression test (test/rename.test.ts or test/rewrite.test.ts) covers a '/'-absolute inbound link across a rename asserting it is rewritten to the new id, plus a decoy case that must NOT be hijacked
- [x] #4 The stale resolvePath import at rewrite.ts:76 is either actually used (preferred) or the misleading doc comment is corrected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/core/rewrite.ts's newDestPathFor, thread graph.concepts (byId) through computeBodyEdits -> newDestPathFor and replace the inline 'idFromPath(posix.join(dir, decoded))' targetId derivation with a call to the already-imported resolvePath(decoded, dir, byId) -- the same leading-'/'-stripping join resolvePath/check.ts's linkFindings use -- so an inbound file's per-link classification (targetId === / !== ctx.from) agrees with the graph's own edge resolution.
2. Fix the isMoved branch's non-self targetPath path-arithmetic (posix.normalize(posix.join(repoDir, decoded))) to apply the same leading-'/'-absolute-resolves-to-bundle-root rule (DOCS_DIR + decoded.slice(1) instead of joining onto repoDir) so a '/'-absolute link inside the MOVED file's own body is not mis-resolved into its old directory either -- same bug class, same function.
3. Correct the module header's stale 'no /-absolute special case' doc line and newDestPathFor's own doc comment now that resolvePath is genuinely reused (retires the dead import flagged in AC#4).
4. Add regression tests in test/rename.test.ts: (a) renaming the TRUE target of a '/'-absolute inbound link rewrites that link to the new id (no more rot/skip); (b) renaming a decoy concept that lives at the naive dir-joined path does NOT hijack the '/'-absolute link (which keeps resolving to the true root target), while a genuine relative link to the decoy in the same file IS rewritten.
5. Mutation-check: verify both new tests FAIL against the pre-fix rewrite.ts (via a saved diff/apply revert, never git stash), then PASS after restoring the fix.
6. Run full bun test and bun run typecheck, both green. Check off ACs. Mark Done. Commit with Refs: LORE-180 trailer and push feature/LORE-180.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed: newDestPathFor's targetId now calls resolvePath(decoded, dir, byId) (threaded through computeBodyEdits) instead of inlining idFromPath(posix.join(dir, decoded)) -- so a leading-'/' link strips and resolves against the bundle root, matching resolvePath/check.ts's linkFindings exactly. Also fixed the analogous same-function bug in the isMoved branch's non-self targetPath arithmetic (posix.join silently concatenates rather than treating an absolute 2nd segment specially), which had the identical leading-slash blindness for a '/'-absolute link authored inside the FILE BEING MOVED. Corrected the module-header and newDestPathFor doc comments, which claimed 'reuses resolvePath' while never calling it (AC#4) -- resolvePath is now genuinely called, no doc drift. Regression coverage (test/rename.test.ts, 3 new tests): (1) renaming the true target of a '/'-absolute inbound link now rewrites it instead of rotting; (2) a decoy concept at the naive dir-joined path can no longer hijack that link when renamed, while a genuine relative link to the decoy in the same file is still correctly repointed; (3) the moved file's own outbound '/'-absolute link now resolves against the bundle root, not its old directory. Mutation-check performed via git diff/apply -R on src/core/rewrite.ts only (no git stash): all 3 new tests FAIL against pre-fix code with exactly the predicted rot/hijack/mis-join symptoms, then PASS after re-applying the fix. Verification: 'bun test' -> 1862 pass, 0 fail (up from 1859 baseline + 3 new); 'bun run typecheck' -> clean; 'bunx biome check src/core/rewrite.ts test/rename.test.ts' -> clean (ran biome --write to fix one formatting nit introduced by my own test edit; did not touch pre-existing unrelated lint findings in other files, out of this task's edit scope).
<!-- SECTION:NOTES:END -->
