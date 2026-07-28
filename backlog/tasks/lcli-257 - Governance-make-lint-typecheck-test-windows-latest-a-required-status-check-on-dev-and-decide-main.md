---
id: LCLI-257
title: >-
  Governance: make lint-typecheck-test (windows-latest) a required status check
  on dev (and decide main)
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:31'
labels:
  - needs-human
  - repo-admin
  - build-ci-config
dependencies: []
references:
  - .github/workflows/ci.yml
priority: low
type: chore
ordinal: 359000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Now that the windows-latest CI leg is green for the first time (LCLI-252), add its exact check-run context as a REQUIRED status check on dev (and record a decision for main), mirroring LCLI-196's docker-e2e enforcement — so the write-family Windows regressions LCLI-252 just fixed cannot silently return. Or record a deliberate keep-advisory decision with rationale.

## Why it matters
LCLI-196 made docker-e2e required via repository ruleset require-docker-e2e-on-dev (id 19698059) with an owner bypass. The windows-latest leg is now eligible (green + runs on every pull_request; unlike macos-latest which is push/dispatch-only and PR-ineligible). Enforcing it protects the cross-platform fswrite fix.

## Human-only boundary
Toggling branch-protection / rulesets is a repo-admin action an autonomous agent must not self-authorize (same as LCLI-196). The agent's role is prep/verify only: confirm a few consecutive green windows-latest runs, surface the exact context string, draft the ruleset edit. A human performs the toggle or gives explicit sign-off.

## Context
Exact context string: 'lint - typecheck - test (windows-latest)' (byte-exact in .github/workflows/ci.yml line 57 uses middot separators). Add to ruleset 19698059 required_status_checks, or decide advisory. See LCLI-196 (Done) for the precedent and verification commands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A recent run of windows-latest on dev is confirmed green (ideally a few consecutive) before enforcement, so a red gate is not flipped to required.
- [x] #2 Either the exact windows-latest context is added to ruleset 19698059 (dev) required_status_checks and enforcement is confirmed via the GitHub rules API, OR a deliberate keep-advisory decision with rationale is recorded.
- [x] #3 The same explicit decision (required vs advisory) is made and recorded for main.
- [x] #4 Task notes record that a human repo-admin performed the ruleset change (or gave explicit sign-off) and that no autonomous agent toggled repo settings; the agent contribution was prep/verify only.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied live to ruleset 19698059 on 2026-07-27. The dev-only ruleset now requires both 'docker e2e harness (real lore + backlog binaries)' and 'lint · typecheck · test (windows-latest)', preserves strict=false and the existing RepositoryRole 5 admin bypass, and does not target main.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made the exact Windows matrix context required on dev while leaving main advisory, per the release-readiness decision.
<!-- SECTION:FINAL_SUMMARY:END -->
