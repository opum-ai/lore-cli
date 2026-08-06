---
id: LCLI-319
title: >-
  lore init's backlog --json-capability probe misattributes cause of failure --
  tells users to reinstall backlog when the real issue is an uninitialized
  Backlog.md project
status: Done
assignee:
  - '@codex'
created_date: '2026-08-05 11:57'
updated_date: '2026-08-06 00:33'
labels:
  - init
  - backlog
  - dx
dependencies: []
references:
  - >-
    Found during the lore-test repo's v0.1.1 comprehensive E2E re-verification
    pass (branch e2e/v0.1.1-comprehensive-pass
  - 'not merged/pushed): see e2e_findings_v0.1.1.md section 7 defect G'
  - plus docs/runbooks/e2e-verification-v0.1.1.md
  - in that repo.
modified_files:
  - src/adapters/backlog.ts
  - test/backlog-probe.test.ts
  - test/init.test.ts
priority: low
type: bug
ordinal: 442000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
When `lore init`'s backlog-coupling capability probe fails, the emitted warning should describe the actual cause of the failure (or at minimum stay agnostic) rather than assert a specific, disprovable cause and recommend the wrong fix.

## Observed
`lore init`'s backlog probe runs `backlog task list --json` to check whether the installed `backlog` binary supports `--json`. If that subprocess exits non-zero for *any* reason, the probe unconditionally reports `"The \`backlog\` binary is not --json-capable"` and recommends installing `backlog.md>=1.49.0`. But `backlog task list --json` also exits non-zero when the binary is fully `--json`-capable and simply hasn't had `backlog init` run yet in that directory ("No Backlog.md project found. Run \`backlog init\` to initialize.", exit 1) -- a completely different, much more common situation with a one-line fix the warning never surfaces.

Confirmed live against the real installed `backlog` 1.49.3 (well above the 1.49.0 floor) during the lore-test repo's v0.1.1 E2E pass's `init --claude`/`--codex` detection-matrix phase: all 3 isolated temp-dir runs recorded the identical misleading warning even though the binary itself was never the problem.

## Repro
    mkdir /tmp/uninitialized-backlog-dir && cd /tmp/uninitialized-backlog-dir
    backlog task list --json
    # "No Backlog.md project found. Run `backlog init` to initialize." (exit 1)

    lore init --claude
    # stdout JSON: backlog: {"checked":true,"capable":false,
    #   "warning":"The `backlog` binary is not --json-capable: `task list --json` exited non-zero
    #   (binary does not support --json)"}
    # stderr advisory: "lore needs a --json-capable Backlog.md. Install backlog.md>=1.49.0 ...
    #   see docs/runbooks/backlog-json-patch.md."
    # -- both wrong: the binary is 1.49.3 and fully --json-capable; the project was just never
    #    backlog init'd.

## Source-confirmed root cause
`lore-cli/src/adapters/backlog.ts::probeBacklog`, step 3 (~line 275):

    const listResult = await spawnOrThrow(spawn, ["task", "list", "--json"]);
    if (listResult.exitCode !== 0) {
      notJsonCapable("`task list --json` exited non-zero (binary does not support --json)", {
        exitCode: listResult.exitCode,
      });
    }

`notJsonCapable` (~line 236) hardcodes the "does not support --json" framing into the thrown `LoreError` regardless of *why* the subprocess exited non-zero -- the probe never inspects stderr or distinguishes "unrecognized --json flag" from any other non-zero exit (e.g. "no project found").

## Why this matters
This path is advisory-only (`lore init` still succeeds, `capable: false`) so it doesn't block anything, but it actively sends an operator (or agent) chasing a phantom version/reinstall problem when the real, one-line fix is `backlog init`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `lore init`'s backlog-capability warning distinguishes "backlog binary does not support --json" from "no Backlog.md project exists yet in this directory" (e.g. by checking stderr/exit-code shape, or by checking for a Backlog.md project marker before concluding --json incapability) and recommends the correct one-line fix for each case
- [x] #2 A binary that is genuinely --json-incapable still produces the existing warning/hint unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In `probeBacklog`, recognize Backlog.md's official no-project diagnostic after the version floor has passed and raise a validation error that explicitly says the binary supports `--json` and instructs the user to run `backlog init`; route all other non-zero `task list --json` exits through the existing `notJsonCapable` helper unchanged.
2. Add focused probe tests for the uninitialized-project classification, including noisy stderr, and pin the exact pre-existing message and hint for a genuinely `--json`-incapable binary.
3. Add an init-surface regression test proving the advisory remains non-fatal and the JSON warning plus stderr recommend `backlog init`.
4. Run focused tests, then typecheck, lint, and the full Bun test suite; perform adversarial self-review against both acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a narrow stderr classifier for Backlog.md's official uninitialized-project diagnostic. When the version floor passes and `task list --json` reports `No Backlog.md project found`, the probe now states that the binary supports JSON and recommends `backlog init`. Every other non-zero list result still uses the unchanged non-JSON-capable message and install hint.

Verification:
- `bun test test/backlog-probe.test.ts test/init.test.ts` — 86 passed, 0 failed.
- `bun run typecheck` — passed.
- `bun run lint` — passed; 191 files checked, no fixes.
- `bun test` — 2,526 passed, 1 skipped, 0 failed across 76 files.
- Real installed Backlog probe from `/private/tmp` — returned validation with `The backlog binary supports --json... run backlog init`; exit classification remained 6 and no reinstall hint was present.
- `git diff --check` — passed.

Adversarial self-review:
- AC1 is pinned at the probe and init surfaces, including noisy stderr and advisory-only exit 0 behavior for init.
- AC2 pins the previous genuinely-incapable message, hint, and input exactly.
- The classifier does not expose subprocess stderr, change successful envelopes, or alter other probe failures.

Delivery state: implementation and tracker/task metadata are verified but remain uncommitted on `dev` because the restore request did not authorize commit, push, PR, or merge. Task stays In Progress until the user authorizes a delivery disposition.

Delivery authorization update (2026-08-05): the user authorized creation of a local feature branch and a local commit for the five campaign paths. Work moved to fix/lcli-319-backlog-init-diagnostic. Push, PR, merge, branch deletion, and publication remain unauthorized; task remains In Progress until integration.

Remote delivery update (2026-08-05): the user authorized push and PR creation. Branch fix/lcli-319-backlog-init-diagnostic was pushed and PR #329 opened against dev: https://github.com/opum-ai/lore-cli/pull/329. Merge, branch deletion, and publication remain unauthorized; task stays In Progress pending integration.

Integration update (2026-08-06): PR #329 merged into dev with exact PR head fffd90a29e87df86a0b40e1d45921a4bc2d887fd and merge commit d3193d725b2df6dd3c20c01da9e3f35ec26cf5d4. A live GitHub query confirmed all 8 checks succeeded, and local ancestry verification confirmed the exact PR head is contained in origin/dev. The user authorized the tracked settlement and pruning of the merged implementation branch.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Distinguished an uninitialized Backlog.md project from a genuinely JSON-incapable backlog binary and preserved the legacy incapability warning unchanged. Verified with 86 focused tests, typecheck, lint, the full suite (2,526 passed, 1 skipped), a real installed-binary probe, branch-local Lore validation, and 8 successful PR checks. Integrated through PR #329 at merge commit d3193d725b2df6dd3c20c01da9e3f35ec26cf5d4.
<!-- SECTION:FINAL_SUMMARY:END -->
