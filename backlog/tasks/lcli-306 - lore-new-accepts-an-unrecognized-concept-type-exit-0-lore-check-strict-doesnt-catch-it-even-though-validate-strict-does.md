---
id: LCLI-306
title: >-
  lore new accepts an unrecognized concept type (exit 0); lore check --strict
  doesn't catch it even though validate --strict does
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 07:27'
updated_date: '2026-08-14 11:00'
labels:
  - validation
  - check
  - dx
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
  - src/core/check.ts
  - src/commands/check.ts
  - src/core/manifest.ts
  - src/core/instructions.ts
  - test/check.test.ts
priority: low
type: bug
ordinal: 419000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
`lore new <type> <title>` should either reject an unrecognized `type` outright, or at minimum `lore check --strict` -- documented as the CI gate -- should also flag it, matching `lore validate --strict`'s behavior.

## Observed
`lore new badtype "some title"` exits 0 and creates the file (now with a stderr warning at creation time: unknown type "badtype", validated on `type` only -- an improvement over the fully-silent pre-0.1.0 behavior). `lore validate --strict` correctly reports 1 warning and fails with exit 6. `lore check --strict`, however, reports 0 errors/0 warnings on the same bundle including that file -- a CI pipeline gating only on `check --strict` (a very plausible setup, since `check` bills itself as the CI gate in its own --help) would never catch an unrecognized-type typo.

## Repro
    lore new badtype "some title"
    lore check --strict      # 0 errors, 0 warnings -- doesn't catch it
    lore validate --strict   # 1 warning, exit 6 -- does catch it
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Either lore new rejects an unrecognized type value outright, or lore check --strict also flags a concept file with an unrecognized type, matching lore validate --strict
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve Lore's intentional OKF producer-extension behavior in `lore new`, and extend the read-only check scan to classify unknown active-profile types as warning-tier `unknown-type` findings from the already-discovered bytes. 2. Keep non-concepts, reserved hubs, known/custom-profile types, malformed files, and task-coupling reconciliation behavior unchanged; ensure multi-root file attribution remains deterministic. 3. Add focused core/command regressions proving ordinary check reports the advisory while `check --strict` exits 6 in parity with `validate --strict`, without duplicate stderr warnings or extra Backlog IO. 4. Run focused check tests, the full suite, typecheck, lint, diff hygiene, and adversarial self-review before finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restore research at clean dev cf20e21b6c28e4f5a67938e269a58d8ade9086a3 confirmed no dependencies, dirty paths, extra worktrees, campaign branches, or in-flight conflicts. Unknown types are deliberately tolerated as OKF producer extensions by validateFrontmatter, buildNewConcept, and existing template/schema tests, so rejecting lore new would break an explicit compatibility contract. The implemented parity path reuses runCheck's already-read concept scan to emit a warning-tier unknown-type finding against the effective active profile; ordinary check remains exit 0 while check --strict returns exit 6, matching validate --strict. Known custom-profile types remain clean, and the structural root index continues to use the built-in profile that wrote it.

Adversarial self-review found and corrected stale user-facing contracts that described check --strict as portability-only. The command manifest and embedded agent instructions now state that all deterministic warnings gate under strict mode. Review also confirmed non-concepts still skip, no additional directory walk or Backlog IO occurs, task-coupling errors remain independent, warning counts flow through the existing deterministic report path, and multi-root prefixing remains shared.

Objective evidence on the final diff: bun test --dots test/check.test.ts test/instructions.test.ts passed 288/288 with 558 expectations; the full bun test --dots suite passed; npm run typecheck passed; npm run lint checked 186 files with no fixes; git diff --check passed. No docs/ bundle or configuration migration is required. AC #1 is proven and checked, but LCLI-306 remains In Progress because no local commit or remote delivery was authorized.

User-authorized local delivery completed in source commit 31c9403b (fix(check): flag unknown concept types), containing exactly the five verified source/test/contract files. Post-commit focused verification passed 288/288 with 558 expectations, typecheck passed, and the committed diff passed hygiene. No push or other remote mutation occurred.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Preserved lore new's intentional unknown-type producer-extension support while making lore check report unknown active-profile types as deterministic warnings and check --strict fail with exit 6, matching validate --strict. Updated the command manifest and embedded instructions for the expanded strict contract. Verified with 288 focused tests, the full suite, typecheck, lint, diff hygiene, and adversarial self-review; delivered locally as 31c9403.
<!-- SECTION:FINAL_SUMMARY:END -->
