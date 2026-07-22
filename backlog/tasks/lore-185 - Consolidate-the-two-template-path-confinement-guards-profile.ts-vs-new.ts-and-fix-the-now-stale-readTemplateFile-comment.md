---
id: LORE-185
title: >-
  Consolidate the two template-path confinement guards (profile.ts vs new.ts)
  and fix the now-stale readTemplateFile comment
status: To Do
assignee: []
created_date: '2026-07-22 20:02'
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
Follow-up from the wave-8 integration review (after LORE-139 hardened profile-declared [[types]].template paths). LORE-139 added assertTemplateConfined in src/core/profile.ts, but there is ALREADY a sibling guard for the same logical invariant — assertTemplateNameConfined in src/commands/new.ts (pre-existing, from LORE-69) for the --template flag path. Two edge-case-divergent implementations of one containment invariant is the exact drift pattern that has bitten prior waves.

Behavioral drift between the two:
- profile.ts assertTemplateConfined: pure posix path arithmetic with backslash normalization (rejects '..\..\x' even where inert on posix).
- new.ts assertTemplateNameConfined: host resolve()/relative(), no backslash normalization, appends '.md'.

Also:
- src/commands/new.ts readTemplateFile's docstring still says the profile-declared template trust boundary was 'left untouched' — LORE-139 made that stale; fix the comment.
- Residual asymmetry (can ride along): the --template flag path gets a symlink refusal (checkSymlink), the profile-declared path still does not — a symlinked in-tree template file declared via profile is still read silently. Traversal is now blocked; symlink-following is not.

Suggested: extract ONE shared confinement helper used by both paths (posix-normalized, backslash-aware), apply the symlink refusal to the profile-declared path too, and delete the stale prose. Keep behavior at least as strict as today on both paths.

Files: src/core/profile.ts (assertTemplateConfined), src/commands/new.ts (assertTemplateNameConfined, readTemplateFile). Conflicts (wave scheduling) with any task touching profile.ts or new.ts (core-bundle-check: LORE-139[done]/140).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A single shared template-path confinement helper is used by both the --template flag path (new.ts) and the profile-declared [[types]].template path (profile.ts); no duplicated guard remains
- [ ] #2 The profile-declared template path refuses symlinks consistently with the --template flag path (or the intentional difference is documented with rationale)
- [ ] #3 readTemplateFile's docstring no longer claims the profile-declared template boundary is 'left untouched'; comment reflects LORE-139
- [ ] #4 Existing traversal-rejection behavior on both paths is preserved (no regression); tests cover the shared helper on both call paths
<!-- AC:END -->
