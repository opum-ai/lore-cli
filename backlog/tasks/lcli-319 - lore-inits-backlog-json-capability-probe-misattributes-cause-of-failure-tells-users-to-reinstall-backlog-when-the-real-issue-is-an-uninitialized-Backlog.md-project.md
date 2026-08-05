---
id: LCLI-319
title: >-
  lore init's backlog --json-capability probe misattributes cause of failure --
  tells users to reinstall backlog when the real issue is an uninitialized
  Backlog.md project
status: To Do
assignee: []
created_date: '2026-08-05 11:57'
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
- [ ] #1 `lore init`'s backlog-capability warning distinguishes "backlog binary does not support --json" from "no Backlog.md project exists yet in this directory" (e.g. by checking stderr/exit-code shape, or by checking for a Backlog.md project marker before concluding --json incapability) and recommends the correct one-line fix for each case
- [ ] #2 A binary that is genuinely --json-incapable still produces the existing warning/hint unchanged
<!-- AC:END -->
