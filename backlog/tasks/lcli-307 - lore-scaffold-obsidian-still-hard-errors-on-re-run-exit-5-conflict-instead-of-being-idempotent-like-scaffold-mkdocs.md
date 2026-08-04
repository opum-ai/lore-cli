---
id: LCLI-307
title: >-
  lore scaffold obsidian still hard-errors on re-run (exit 5, conflict) instead
  of being idempotent like scaffold mkdocs
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 07:27'
updated_date: '2026-08-04 19:54'
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
modified_files:
  - src/commands/scaffold.ts
  - src/commands/fswrite.ts
  - test/consumer-scaffold.test.ts
  - test/fswrite.test.ts
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
- [x] #1 lore scaffold obsidian re-run against an already-scaffolded bundle is idempotent (safe no-op) like lore scaffold mkdocs, or at minimum offers a softer confirm-and-continue path than a hard conflict error
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm the existing shared scaffold classifier treats byte-identical Obsidian files as unchanged while preserving conflicts for user-modified files. 2. Run the focused consumer-scaffold suite and inspect the implementing commit/ancestry as objective evidence. 3. Adversarially review the acceptance criterion, record the pre-existing resolution, and settle the task and campaign without source changes if verification passes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restore reconciliation found the requested behavior was already delivered before this task was filed: source commit 88800a44e157dbfb750a83283a52992404a7e1d4 classifies planned files as missing/unchanged/different, leaves byte-identical Obsidian config untouched, emits the no-op summary, and preserves conflicts for changed files; regression commit 2f05f412fae7e4d81991a6f237ea60f75aefbbdd proves the Obsidian path. Both commits are ancestors of current dev and locally known origin/dev. Objective verification on dev ebdd6253dbda492a5bd7bccb8b57bff9ce7a0c95: bun test --dots test/consumer-scaffold.test.ts passed 63/63 with 301 expectations; npm run typecheck passed. Adversarial self-review confirmed unchanged Obsidian app.json/.gitignore files produce exit 0, files: [], unchanged bytes, and the already-up-to-date message, while hand-modified config still raises conflict/exit 5 and remains untouched. No source change or documentation update was required; this task reconciles a v0.1.0 release observation against already-fixed dev behavior.

The user authorized local delivery of the completed task/tracker settlement on 2026-08-04. This authority covers the dedicated local Backlog commit only; no push or other remote mutation is authorized.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reconciled the v0.1.0 Obsidian re-run defect against the existing dev fix: byte-identical generated config is an exit-0 no-op while hand-modified config retains conflict protection. Verified implementation/test ancestry plus 63/63 focused tests (301 expectations) and typecheck; no new source change was required.
<!-- SECTION:FINAL_SUMMARY:END -->
