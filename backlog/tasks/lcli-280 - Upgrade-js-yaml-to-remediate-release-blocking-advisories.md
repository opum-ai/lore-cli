---
id: LCLI-280
title: Upgrade js-yaml to remediate release-blocking advisories
status: Done
assignee:
  - '@codex'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - security
  - release
  - dependencies
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
references:
  - package.json
  - src/core/concept.ts
  - src/adapters/backlog.ts
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
modified_files:
  - package.json
  - bun.lock
  - src/core/concept.ts
  - src/core/check.ts
  - src/core/rewrite.ts
  - src/adapters/backlog.ts
  - test/release-workflow.test.ts
  - CHANGELOG.md
priority: high
type: bug
ordinal: 382000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The pre-release dependency audit reports two high and three moderate advisories against direct dependency js-yaml 4.1.0, including quadratic CPU-consumption and prototype-pollution findings. lore parses repository-controlled concept frontmatter and backlog/config.yml through js-yaml, so the first release must use a patched version and retain its existing bounded-expansion defenses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bun audit reports zero known vulnerabilities for the resolved production dependency graph
- [x] #2 Concept frontmatter and backlog status-flow parsing regression suites pass against the patched js-yaml release
- [x] #3 The full typecheck, lint, unit test, lore check, compiled build, and Docker E2E gates remain green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm the patched compatible js-yaml version and upgrade the direct dependency/lockfile. 2. Run focused YAML parser and security regression tests. 3. Run the complete repository and Docker E2E gates. 4. Record audit evidence and finalize the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Upgraded direct js-yaml from 4.1.0 to 5.2.2 and removed gray-matter 4.0.3, whose unmaintained js-yaml 3 dependency kept two advisories in the production graph. Replaced its narrow fence-splitting use with the hardened js-yaml 5 boundary, retaining bounded alias expansion and tested handling for null/empty scalars, thematic breaks, trailing-space fences, malformed closers, Unicode, timestamps, leading-zero strings, and dash-leading values. bun audit now reports no vulnerabilities. Verified focused YAML/backlog suites, 2,191 full tests, typecheck, lint, compiled build, lore check/validate, agent drift check, and Docker E2E 304/304.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Remediated the complete production dependency graph: Lore now uses js-yaml 5.2.2 directly and no longer depends on gray-matter/js-yaml 3. The replacement frontmatter fence boundary preserves the established parsing, serialization, and alias-expansion protections. bun audit reports zero vulnerabilities and every local and Docker release gate passes.
<!-- SECTION:FINAL_SUMMARY:END -->
