---
id: LORE-258
title: >-
  lore: harmonize non-concept-file handling — spurious 'no frontmatter mapping'
  warning on link/sync/unlink/tasks but not check; inconsistent skipped-count
status: To Do
assignee: []
created_date: '2026-07-24 22:00'
labels:
  - cli-ux
  - core-bundle
  - output
dependencies: []
references:
  - src/core/bundle.ts
priority: low
type: bug
ordinal: 360000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Consistent, non-noisy handling of known non-concept files (e.g. log.md, stories/index.md) across every command that loads the bundle.

## Observed (real run)
- The warning 'skipping <file>: no frontmatter mapping, treated as a non-concept file' (emitted at src/core/bundle.ts:182 when a warnings collector is passed) fires on 'lore link', 'lore sync', 'lore unlink', and 'lore tasks' for log.md and stories/index.md — but 'lore check' scans the same bundle and stays silent about them.
- 'lore validate' reports a '0 skipped' count in its summary; 'lore check' has no equivalent field despite silently passing over the same non-concept files.

## Why it matters
These files (the regenerated log.md, child-dir index.md) are KNOWN reserved/non-concept files, so warning about them on every coupling command is spurious noise that trains users to ignore warnings. The asymmetry (check silent, coupling loud, validate counts) is confusing and makes the warning look like a problem when it is not.

## Direction (not prescriptive)
Either suppress the reserved/non-concept warning on the coupling commands the way check already does (don't pass a warnings collector for known-reserved stems, or filter them), OR surface a consistent 'skipped: N' summary across check/validate/coupling so the behavior reads the same everywhere. Pick one and apply it uniformly.

## Refs
src/core/bundle.ts:182 (the warning); compare check.ts vs validate.ts vs link.ts/sync.ts/tasks.ts loadBundle call sites (whether each passes a warnings collector).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The 'no frontmatter mapping' warning for known reserved/non-concept files (log.md, child index.md) is handled identically across check, validate, link, unlink, sync, and tasks — either uniformly suppressed for reserved stems, or uniformly surfaced as a skipped count.
- [ ] #2 No command emits the warning for a file that another command (check) silently treats as a non-concept — the asymmetry is gone, verified by running each command on the same bundle.
- [ ] #3 If a skipped-count is chosen, check gains the same summary field validate has; if suppression is chosen, validate's behavior is reconciled too. Existing tests updated; full suite + lore check on the repo's own bundle stay green.
<!-- AC:END -->
