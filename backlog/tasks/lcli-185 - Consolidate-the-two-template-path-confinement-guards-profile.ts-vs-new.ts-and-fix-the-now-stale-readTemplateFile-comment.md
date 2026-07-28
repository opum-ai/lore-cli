---
id: LCLI-185
title: >-
  Consolidate the two template-path confinement guards (profile.ts vs new.ts)
  and fix the now-stale readTemplateFile comment
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
priority: low
type: bug
ordinal: 195000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up from the wave-8 integration review (after LCLI-139 hardened profile-declared [[types]].template paths). LCLI-139 added assertTemplateConfined in src/core/profile.ts, but there is ALREADY a sibling guard for the same logical invariant — assertTemplateNameConfined in src/commands/new.ts (pre-existing, from LCLI-69) for the --template flag path. Two edge-case-divergent implementations of one containment invariant is the exact drift pattern that has bitten prior waves.

Behavioral drift between the two:
- profile.ts assertTemplateConfined: pure posix path arithmetic with backslash normalization (rejects '..\..\x' even where inert on posix).
- new.ts assertTemplateNameConfined: host resolve()/relative(), no backslash normalization, appends '.md'.

Also:
- src/commands/new.ts readTemplateFile's docstring still says the profile-declared template trust boundary was 'left untouched' — LCLI-139 made that stale; fix the comment.
- Residual asymmetry (can ride along): the --template flag path gets a symlink refusal (checkSymlink), the profile-declared path still does not — a symlinked in-tree template file declared via profile is still read silently. Traversal is now blocked; symlink-following is not.

Suggested: extract ONE shared confinement helper used by both paths (posix-normalized, backslash-aware), apply the symlink refusal to the profile-declared path too, and delete the stale prose. Keep behavior at least as strict as today on both paths.

Files: src/core/profile.ts (assertTemplateConfined), src/commands/new.ts (assertTemplateNameConfined, readTemplateFile). Conflicts (wave scheduling) with any task touching profile.ts or new.ts (core-bundle-check: LCLI-139[done]/140).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single shared template-path confinement helper is used by both the --template flag path (new.ts) and the profile-declared [[types]].template path (profile.ts); no duplicated guard remains
- [x] #2 The profile-declared template path refuses symlinks consistently with the --template flag path (or the intentional difference is documented with rationale)
- [x] #3 readTemplateFile's docstring no longer claims the profile-declared template boundary is 'left untouched'; comment reflects LORE-139
- [x] #4 Existing traversal-rejection behavior on both paths is preserved (no regression); tests cover the shared helper on both call paths
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a single pure predicate templateConfinementViolation(value) to src/core/profile.ts (posix-normalized, backslash-aware, no real root needed) that returns 'absolute' | 'escape' | undefined.
2. Refactor profile.ts's private assertTemplateConfined to delegate to it (unchanged validation LoreError + message/hint).
3. In src/commands/new.ts, import templateConfinementViolation and rewrite assertTemplateNameConfined to delegate to it (dropping its own host resolve()/relative() arithmetic and the pre-check '.md' append), keeping its usage LoreError type/message.
4. AC#2: widen resolveTemplate's checkSymlink to cover the profile-declared template source too (checkSymlink = explicitTemplate || declared !== undefined), not just the --template flag; leave the bare type-name convention lookup unchecked (matches LCLI-91's original scope reasoning).
5. AC#3: rewrite readTemplateFile's stale 'left untouched' docstring to describe the new AC#2 scope.
6. Update/add tests in test/new.test.ts (flip the now-stale 'symlinked declared template still followed' test to expect refusal; add a backslash-traversal regression proving the --template path is now host-independent) and test/profile.test.ts (new describe block unit-testing templateConfinementViolation directly, imported by name, to show both call paths share the literal same function).
7. Verify: bun test (full suite) + bun run typecheck + bun run lint scoped to changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test (full suite) = 1907 pass / 0 fail / 5363 expect() calls across 47 files. bun run typecheck (tsc --noEmit) = clean, no errors. bun run lint scoped to changed files (src/commands/new.ts, src/core/profile.ts, test/new.test.ts, test/profile.test.ts) = 0 findings (one pre-existing unrelated finding in test/context.test.ts, not touched by this task, left alone per instructions).

Implementation: added exported pure predicate templateConfinementViolation(value) to src/core/profile.ts (posix.resolve/relative against a fixed anchor, backslash-normalized, no real root needed) returning 'absolute' | 'escape' | undefined. profile.ts's private assertTemplateConfined now delegates to it (unchanged validation LoreError). new.ts's assertTemplateNameConfined now delegates to the same shared predicate (unchanged usage LoreError), dropping its own host resolve()/relative() arithmetic that lacked backslash normalization -- this closes a real cross-host drift: a Windows-style '--template ..\..\secret' escape previously only registered on an actual win32 run, now caught on every host (added a regression test proving it). AC#2: widened resolveTemplate's checkSymlink to cover the profile-declared 'declared' template source (not just --template), leaving only the bare type-name convention lookup unchecked; flipped the now-stale 'symlinked declared template still followed' test in test/new.test.ts to assert refusal (conflict, 'symlink' in message). AC#3: rewrote readTemplateFile's stale 'left untouched' docstring. Added a direct unit-test describe block for templateConfinementViolation in test/profile.test.ts (imported by name) proving both --template and profile-declared call paths share the literal same function, plus absolute/escape/backslash/no-false-positive cases.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Consolidated the two edge-case-divergent template-path confinement guards into one shared pure predicate, templateConfinementViolation(value), exported from src/core/profile.ts. It uses profile.ts's stricter posix.resolve/relative arithmetic (backslash-normalized, no real root needed). src/core/profile.ts's assertTemplateConfined and src/commands/new.ts's assertTemplateNameConfined both now delegate to it, each still raising its own domain-appropriate LoreError type (validation for the profile-declared path, usage for the --template flag) -- no duplicated guard logic remains (AC#1). This also fixed a real cross-host drift: new.ts's old host-resolve()-based check only caught a Windows-style '..\..\secret' traversal on an actual win32 run; it is now caught on every host (regression test added). Widened the LCLI-91 symlink refusal (checkSymlink) to also cover the profile-declared template source, not just --template, closing the asymmetry (AC#2); the bare type-name convention lookup intentionally remains unchecked (documented rationale). Fixed readTemplateFile's stale 'left untouched' docstring to describe the new scope (AC#3). Added direct unit tests for the shared predicate plus updated/added e2e regression tests on both call paths (AC#4). Verified with the full bun test suite (1907 pass / 0 fail / 5363 expect() calls) and bun run typecheck (tsc --noEmit, clean); bun run lint reports zero findings in the four changed files.
<!-- SECTION:FINAL_SUMMARY:END -->
