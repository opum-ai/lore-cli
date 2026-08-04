---
id: LORE-103
title: >-
  Surface report-write failures and fixed-UID bind-mount permission risk in e2e
  run
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 13:04'
labels:
  - codex-review-followup
  - build-runtime
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docker-compose.yml:13 bind-mounts the host directory `./results` into the container at `/results`, while Dockerfile:81 runs the container as a fixed non-root `bun` user at uid 1000 with no configurable UID/PUID mapping; on hosts where uid 1000 doesn't own (or isn't writable by) `./results`, writes to the report will fail with a permission error. Compounding this, run-e2e.sh's `record()` and `check()` functions append to `$REPORT` via `jq -n ... >>"$REPORT"` without checking the write's exit status, and the script runs under `set -uo pipefail` (no `-e`), so a failed write to the report file is silently swallowed rather than causing the run to fail loudly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 If the append to `$REPORT` inside `record()` or `check()` fails (e.g. permission denied or disk full), run-e2e.sh detects the failure and causes the overall script exit code to reflect it, instead of continuing silently.
- [x] #2 The e2e harness documents or implements a way to avoid uid-1000-vs-host-uid permission mismatches on the `./results` bind mount (e.g. a configurable UID/PUID build arg, or an explicit permission fix step), so a report-directory write failure caused purely by ownership mismatch does not occur under normal use.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. run-e2e.sh: give record() and check() explicit failure detection on their
   `jq ... >>"$REPORT"` append. Add a REPORT_WRITE_FAILURES counter (init
   alongside PASS/FAIL); on a failed append, increment it and log an ERROR
   line to stderr (not silently swallowed). tally() surfaces the counter;
   the final exit logic exits 1 if FAIL>0 OR REPORT_WRITE_FAILURES>0, so a
   report-write failure always flips the overall script exit code even
   though the script runs under `set -uo pipefail` (no -e) and individual
   step()/check() calls don't propagate record()'s own exit status today.
2. Dockerfile: add ARG PUID=1000 / ARG PGID=1000 and, in the existing
   non-root-user RUN step, usermod/groupmod the baked-in `bun` user to the
   given ids (when they differ from the image default), keeping ownership
   of /workspace, /results, /opt/lore, and /home/bun consistent. Default
   stays 1000 so existing behavior is unchanged.
3. docker-compose.yml: pass PUID/PGID through as build args, defaulted from
   the invoking shell's ${UID:-1000}/${GID:-1000} via compose variable
   interpolation, so a plain `docker compose up --build` on a host whose
   uid differs from 1000 builds an image whose `bun` user matches the host
   owner of ./results -- avoiding the permission-denied write in the
   first place. Document the override in a comment.
4. Verify: bash -n + shellcheck on run-e2e.sh; a standalone repro of
   record()/check() against an unwritable $REPORT proving the exit code
   now reflects the failure; `docker compose -f docker/e2e/docker-compose.yml config` 
   for compose validity; a real `docker build` of the Dockerfile (base
   stage only, via a trimmed repro) to prove the PUID/PGID build args
   actually reassign the bun user's uid/gid and file ownership.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
See implementation notes and final summary for full evidence.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
run-e2e.sh: record() and check() now detect a failed append to $REPORT (permission
denied, disk full) via a new REPORT_WRITE_FAILURES counter + report_write_failed()
helper, and Phase 25's final exit logic exits 1 whenever REPORT_WRITE_FAILURES>0 (in
addition to FAIL>0) -- previously such a failure vanished silently under `set -uo
pipefail` (no -e) and the script always exited 0 if every test itself passed.

Dockerfile/docker-compose.yml: added configurable ARG PUID=1000/PGID=1000 to the
Dockerfile's non-root-user step (groupmod/usermod the baked-in `bun` user, chown also
covers /home/bun now); docker-compose.yml passes them through as build args defaulted
from the host shell's ${PUID:-1000}/${PGID:-1000}, documented with the
`PUID=$(id -u) PGID=$(id -g) docker compose ... up --build` invocation. Default
behavior (no env vars set) is byte-for-byte unchanged (uid/gid stay 1000:1000).

Verified: bash -n + shellcheck (no new warnings) on run-e2e.sh; two standalone
before/after repro harnesses proving the baseline exits 0 despite 2 silent report-write
failures and the fix exits 1 with explicit "REPORT WRITE FAILED" diagnostics;
`docker compose config` valid both with/without PUID/PGID; a real full `docker compose
build` of the Dockerfile succeeds; a real docker-volume-backed repro (bypassing macOS
Docker Desktop's bind-mount layer, which doesn't enforce real uid permission checks)
showing the default 1000:1000 build genuinely fails with Permission denied writing into
a 501:20-owned 750 directory, and the identical build with --build-arg PUID=501
PGID=20 succeeds against the same directory; a real ~20s run of the compose-built
image against the actual bind mount produced 219 well-formed report.jsonl records with
0 FAIL, confirming no regression in normal-condition report writing.
<!-- SECTION:FINAL_SUMMARY:END -->
