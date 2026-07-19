---
id: LORE-55.9
title: >-
  scaffold.ts: KNOWN_TARGETS/IMPLEMENTED_TARGETS are now identical sets, leaving
  a dead, untested branch
status: Done
assignee: []
created_date: '2026-07-18 22:55'
updated_date: '2026-07-19 00:08'
labels:
  - cmd
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
modified_files:
  - src/commands/scaffold.ts
parent_task_id: LORE-55
priority: low
type: chore
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BUILDERS now maps mkdocs, docusaurus, AND obsidian, so IMPLEMENTED_TARGETS = new Set(Object.keys(BUILDERS)) is exactly {mkdocs, docusaurus, obsidian} -- identical to the hardcoded KNOWN_TARGETS. Any target string that passes KNOWN_TARGETS.has(target) therefore always passes IMPLEMENTED_TARGETS.has(target) too, so the "scaffold target ... is not implemented yet" branch can never execute for any input today. This diff also deletes the one test that proved that branch reachable ("a documented-but-unimplemented target (obsidian) is a usage error, not a crash") without adding a replacement, so a future contributor editing this validation logic gets zero test signal on that branch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Either collapse KNOWN_TARGETS/IMPLEMENTED_TARGETS to a single set (removing the now-dead not-implemented-yet branch) until a real documented-but-unbuilt target exists again, or add a synthetic/documented target that keeps the branch genuinely reachable and covered by a test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Chose option (a) from the AC: collapse KNOWN_TARGETS/IMPLEMENTED_TARGETS to a single TARGETS set derived from BUILDERS' own keys, removing the now-unreachable 'not implemented yet' usage-error branch entirely -- matches this repo's stated engineering values (no speculative/dead code for a hypothetical future target) over keeping a synthetic unreachable-in-practice target alive just to exercise a branch.
1. src/commands/scaffold.ts: replace KNOWN_TARGETS + IMPLEMENTED_TARGETS with one TARGETS = new Set(Object.keys(BUILDERS)); update BUILDERS' own docstring and the internal-error message to match.
2. Remove parseScaffoldArgs' second (now-dead) if-block and its 'is not implemented yet' usage error.
3. Update runScaffold's docstring ('An unknown or not-yet-implemented target...' -> 'An unknown target...').
4. Fix docs/reference/cli-surface.md's Exit row ('unknown/unimplemented target' -> 'unknown target'), via lore replace, since it documented the now-removed exit path.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
No test referenced the removed branch (the PR that introduced this bug already deleted the one test that exercised it, per the finding's own description, without a replacement) -- nothing to update there. Also fixed docs/reference/cli-surface.md's now-stale 'unknown/unimplemented target' exit-code doc via lore replace, since LORE-55.9's own code change removed that path; verified with 'lore check' (37 files, 0 errors, 0 warnings). Full suite: 1497 pass, typecheck clean, lint clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Collapsed KNOWN_TARGETS/IMPLEMENTED_TARGETS (src/commands/scaffold.ts) into a single TARGETS set derived from BUILDERS' keys, removing the unreachable 'not implemented yet' branch and its now-dead usage-error message; also fixed cli-surface.md's Exit-code doc row that documented the removed path. Verified: typecheck, lint, full test suite (1497 pass), and lore check (0 errors/warnings) all clean.
<!-- SECTION:FINAL_SUMMARY:END -->
