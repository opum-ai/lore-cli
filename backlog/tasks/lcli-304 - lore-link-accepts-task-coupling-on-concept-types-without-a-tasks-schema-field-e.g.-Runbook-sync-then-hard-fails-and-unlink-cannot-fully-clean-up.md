---
id: LCLI-304
title: >-
  lore link accepts task-coupling on concept types without a tasks schema field
  (e.g. Runbook); sync then hard-fails and unlink cannot fully clean up
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 07:27'
updated_date: '2026-08-14 11:00'
labels:
  - linking
  - sync
  - schema
  - validation
  - 'doc:stories/build-the-lore-cli-foundation'
dependencies: []
references:
  - >-
    Found during the lore-test repo's v0.1.0 comprehensive E2E pass (branch
    e2e/v0.1.0-comprehensive-pass
  - >-
    not merged/pushed): see e2e_findings_v2.md and
    docs/runbooks/e2e-verification-v0.1.0.md in that repo.
documentation:
  - docs/stories/build-the-lore-cli-foundation.md
modified_files:
  - src/core/profile.ts
  - src/core/check.ts
  - src/commands/link.ts
  - src/commands/check.ts
  - test/link.test.ts
  - test/check.test.ts
priority: medium
type: bug
ordinal: 417000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
`lore link <concept> <taskId>` should either refuse up front for a concept type whose schema doesn't define a `tasks:` field or managed task block (only Story does, per every `.lore/schemas/*.schema.json` and the template scaffolding), or the resulting inconsistency should be clearly surfaced and fully reversible.

## Observed
`lore link runbooks/<id> <taskId> --json` exits 0 silently and writes an unsupported `tasks:` frontmatter field onto a Runbook. The next `lore sync` hard-fails: exit 6, "cannot regenerate the lore:tasks block: the managed task region is missing". `lore check --strict` (billed as the CI gate) does not surface the interim inconsistency at all -- 0 errors/0 warnings; only an undocumented `complete:false` flag differs, easy to miss. `lore unlink` to back out leaves a stray empty `tasks: []` key behind that keeps `lore validate --strict` red even after the round trip -- full recovery required deleting and re-scaffolding the file via `lore new`.

## Repro
    lore link runbooks/<any-runbook-id> <any-task-id> --json   # exit 0 -- should this succeed?
    lore sync --json                                            # exit 6, "managed task region is missing"
    lore check --strict --json                                  # 0 errors, 0 warnings -- doesn't catch it
    lore unlink runbooks/<any-runbook-id> <any-task-id> --json  # task removed but stray tasks: [] key remains
    lore validate --strict                                      # still red after unlink
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore link refuses up front (clean usage/validation error) when targeting a concept type whose schema doesn't support tasks/a managed task block, OR sync/check are made to handle it gracefully end-to-end
- [x] #2 lore check --strict (the documented CI gate) surfaces this class of inconsistency, not just lore sync/lore validate
- [x] #3 lore unlink fully reverses a lore link, leaving no stray frontmatter key behind, for every concept type it's ever allowed to target
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a shared active-profile capability check for whether a concept type declares the tasks field, and make lore link reject unsupported targets before task lookup, document writes, or Backlog back-reference edits.
2. Preserve legacy recovery in lore unlink: when removing the final task from a concept type that does not declare tasks, remove the frontmatter key entirely; retain the supported-type empty-list behavior needed by managed-block reconciliation.
3. Make lore check emit an explicit error finding for unsupported task coupling and exclude those concepts from status/managed-block reconciliation, while preserving the existing fail-loud marker validation for supported types.
4. Add focused link/unlink/check regression coverage for built-in and custom-profile capability boundaries, no-side-effect refusal, full legacy cleanup, and strict-gate reporting; then run focused tests, the full suite, typecheck, lint, and diff hygiene.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wave 4 restore research at clean dev 4146c42e2473445383ae20fc85f880d132ac2140 confirmed no dependencies, dirty paths, worktree conflicts, or in-flight campaign work. The active profile already exposes each compiled type’s declaredFields; the built-in Story alone declares tasks. Current check reconciliation is deliberately type-agnostic, so an unsupported Runbook task link reaches managed-block regeneration and yields a partial report with complete:false instead of an explicit finding. The implementation will gate new links on schema capability, retain unlink as a legacy repair path, and classify unsupported coupling directly in check before Backlog resolution.

Implementation complete and verified, but intentionally undelivered. New links now consult the active profile and reject any concept type that does not declare `tasks` before task lookup, document writes, or Backlog edits; custom-profile types that explicitly declare the field remain supported. `check --strict` emits an error-tier `unsupported-task-coupling` finding with `complete:true` and no Backlog IO. `unlink` removes the unsupported key when the final legacy link is removed and also heals an already-empty `tasks: []` residue from older binaries, while supported Story empty-list behavior remains unchanged.

Objective verification: `bun test --dots test/link.test.ts test/check.test.ts` passed 347/347 with 797 expectations; full `bun test --dots` passed; `npm run typecheck` passed; `npm run lint` checked 186 files with no fixes; `git diff --check` passed. Adversarial self-review covered refusal ordering and no-side-effect behavior, active custom-profile allowance, reserved-stem compatibility, explicit check reporting without reconciliation, final-link cleanup, repeated empty-residue recovery, and existing supported-type behavior. No documentation or configuration update is required. All three acceptance criteria are checked, but LCLI-304 remains In Progress because this invocation did not authorize a local commit or remote delivery.

User-authorized local delivery completed in source commit 5069dc28c2f205f5382836fb5b3d4945abe26a3a, containing only the six verified source/test files. Post-commit focused verification passed 347/347 with 797 expectations, typecheck passed, and the committed diff passed hygiene. No push or other remote mutation occurred.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Enforced active-profile task-coupling capability: `lore link` now rejects unsupported concept types before any task or write IO, `lore check --strict` reports explicit `unsupported-task-coupling` errors, and `lore unlink` fully removes legacy unsupported `tasks:` residue. Verified with 347 focused tests, the full suite, typecheck, lint, diff hygiene, and adversarial self-review; delivered locally as 5069dc28c2f205f5382836fb5b3d4945abe26a3a.
<!-- SECTION:FINAL_SUMMARY:END -->
