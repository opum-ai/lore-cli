---
id: LCLI-307
title: >-
  lore scaffold obsidian still hard-errors on re-run (exit 5, conflict) instead
  of being idempotent like scaffold mkdocs
status: To Do
assignee: []
created_date: '2026-08-04 07:27'
labels:
  - scaffold
  - dx
dependencies: []
references:
  - >-
    Found during the lore-test repo's v0.1.0 comprehensive E2E pass (branch
    e2e/v0.1.0-comprehensive-pass
  - >-
    not merged/pushed): see e2e_findings_v2.md and
    docs/runbooks/e2e-verification-v0.1.0.md in that repo.
priority: low
type: bug
ordinal: 420000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Re-running `lore scaffold obsidian` against a bundle that's already been scaffolded should be safe/idempotent (or at least softer than a hard conflict), matching `lore scaffold mkdocs`'s clean "already up to date -- nothing to do" re-run behavior.

## Observed
`lore scaffold obsidian` re-run against a bundle with an existing `docs/.obsidian/` hard-errors: exit 5, `error_type: conflict`, "obsidian config already exists: docs/.obsidian/app.json" with a hint to pass `--force` or remove the existing files first. This nit was first documented in an earlier pre-release E2E pass and is confirmed still present, unfixed, in the v0.1.0 release.

## Repro
    lore scaffold obsidian   # first run: succeeds
    lore scaffold obsidian   # second run: exit 5, conflict
    # compare:
    lore scaffold mkdocs     # first run: succeeds
    lore scaffold mkdocs     # second run: exit 0, "already up to date -- nothing to do"
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore scaffold obsidian re-run against an already-scaffolded bundle is idempotent (safe no-op) like lore scaffold mkdocs, or at minimum offers a softer confirm-and-continue path than a hard conflict error
<!-- AC:END -->
