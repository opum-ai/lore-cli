---
id: LCLI-360
title: >-
  The docker e2e cases added for the lore init onboarding rebuild have never
  been executed
status: To Do
assignee: []
created_date: '2026-08-28 23:59'
labels:
  - e2e
  - init
  - tracker
  - verification
dependencies: []
ordinal: 487000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LCLI-358.1, LCLI-358.2, LCLI-358.3, and LCLI-356 each added assertions to docker/e2e/run-e2e.sh — seven cases in total covering the git preflight refusal and its wrote-nothing guarantee, --allow-no-git, the tracker-aware probe, --tracker none, selection-time verification, the detection shape, and the no-install invariant.

None of them has run in the container. `docker info` exits 1 on the authoring host, so each case was verified only by (a) `bash -n` on the script and (b) running its exact jq filter against the real CLI in a temp directory. That is evidence the assertions are well-formed and true locally; it is not evidence the harness executes them.

This matters more than usual because CLAUDE.md's own gate rules say a gate never observed failing is not known to work. These cases have never been observed either passing or failing inside the harness they were written for.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docker/e2e/run-e2e.sh runs to completion in the container with every case added by LCLI-358.1/.2/.3 and LCLI-356 reported in results/report.jsonl
- [ ] #2 Each of those cases is proven by a negative control: a deliberate violation makes it fail and names the offending condition
<!-- AC:END -->
