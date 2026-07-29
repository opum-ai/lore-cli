# Handover — Backlog campaign session 3: LCLI-62 (docker/e2e real-binary coupling gaps: missing-task signatures, probe exit-6 branch, linked-concept rename F1)

**Date**: 2026-07-19 | **Grounded against**: `dev @ b1f0784`, clean (only pre-existing untracked `docs/.obsidian/`), pushed and in sync with `origin/dev` | **Tracker**: doc-1 (`backlog doc view doc-1 --plain`)

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1
(`backlog doc view doc-1 --plain`). Cursor: LCLI-62 — docker/e2e real-binary
coupling gaps: (1) missing-task signatures (viewTask exit-1-plus-empty-stdout,
editTask's /not found/i stderr regex) never observed against the real pinned
binary; (2) the capability-probe's present-but-incapable exit-6 branch
(version below floor, or version-capable but not --json-capable) never runs
because the image only ships the capable build; (3) rename's Backlog coupling
(moveBackRefs, per-write backlog commit, the F1 success-envelope-still-on-
stdout-at-exit-6 asymmetry) never fires because the harness only ever renames
the unlinked Reference doc. Queue order (62, 63, 64, 65, 66 remaining)
confirmed by the user on 2026-07-19; do not re-ask. Merge gate: self-merge
(gh pr merge --rebase --delete-branch into dev) confirmed by the user on
2026-07-19 — the PR is an audit trail, not an approval gate.

LCLI-62 depends on LCLI-56 (Done) and LCLI-61 (Done, merged this session —
its step_fail helper is required for AC3's install-hint assertions and AC4's
F1 induced-failure case). This is an E2E task: verification REQUIRES the real
Docker harness (`docker compose -f docker/e2e/docker-compose.yml up --build`,
~2-3 min, ALWAYS `docker compose -f docker/e2e/docker-compose.yml down -v`
after, even on failure) — a green `bun test` alone is NOT sufficient evidence
(campaign convention, in the tracker's "Campaign conventions" section).

Re-derive the exact current shape of docker/e2e/run-e2e.sh (the filing task's
L165-190/L209/L214/L255/L293 references are from the 2026-07-19 audit at
dev @ b8a4667 — LCLI-61 confirmed its OWN filing task's line-number references
stayed accurate against later HEAD, but also found one of its semantic
assumptions was wrong — validate's exit 6 was assumed to be the
error_type=validation ErrorEnvelope case, but validate/check are gates that
report findings as stdout data and never throw. Apply the same skepticism to
LCLI-62's AC3 (probe exit-6 stub-binary approach) and AC4 (rename's F1
asymmety) proposed techniques — verify against src/adapters/backlog.ts's
probeBacklog and src/commands/rename.ts before implementing, don't assume the
filing task's proposed mechanism is exactly right). Follow backlog
instructions task-execution → task-finalization for the task lifecycle, and
use the step_fail helper LCLI-61 added (docker/e2e/run-e2e.sh, next to
step/step_json) rather than reinventing failure-output assertions.
```

## State

| Item | Status |
| --- | --- |
| LCLI-61 | Done and merged into `dev` (PR #58, rebase-merged). Two real findings surfaced by running the real binary (stderr can carry warning lines ahead of the JSON envelope; validate/check are gates, not throwers) are now reflected in the harness and recorded in the task notes. Independent adversarial review: no blocking findings, one nice-to-have applied. |
| Tracker | doc-1 updated on `dev`: LCLI-61 moved to Resolved, cursor advanced to LCLI-62, session-log appended, and a new "don't trust the filing task's technique/assumption at face value" convention recorded. |
| Handover | This session's own consumed handover archived to `archive/handovers/HANDOVER-2026-07-19-backlog-campaign-2.md` (note the `-2` suffix — the date collided with a prior session's archived handover of the same name), committed and pushed. |
| Branches / PRs | No `feature/*` branches local or remote; no open PRs (`feature/LCLI-61` deleted both sides post-merge). |
| LCLI-62 dependencies | LCLI-56 (Done) and LCLI-61 (Done, this session) — LCLI-62 is unblocked. |
| LCLI-42/43/44/45 | Still parked in tracker "Not queued" — deferred by recorded product decisions. Do not pick up. |

## Next steps

1. Per-issue lifecycle on LCLI-62 (`backlog task view LCLI-62 --plain` for the five ACs): branch `feature/LCLI-62` off `dev`, plan on the task.
2. AC1/AC2: raw-signature checks against the real pinned binary — `backlog task view <nonexistent-id>` (expect exit 1, empty stdout) and `backlog task edit <nonexistent-id> ...` (expect a "not found" stderr match) — then the lore-level consequences: `lore link` to a nonexistent task fails before any write (not_found/exit 3, frontmatter untouched — use step_fail); a linked task's file going missing (e.g. `mv`'d aside) makes `lore check`/`lore sync` exit 3; `lore tasks` on a concept with one dangling linked id soft-drops it (exit 0, warning on stderr, not a hard failure).
3. AC3: stub binaries on a PATH that shadows the real `backlog` (mirrors the existing `/tmp/no-backlog-path` symlink-farm pattern in run-e2e.sh, but this time the stub for `backlog` itself prints something, not absent) — one printing an old semver (below MIN_BACKLOG_VERSION="1.47.1"), one printing a valid-looking version but failing `task list --json` (non-JSON or wrong shape) — both should drive `probeBacklog` (src/adapters/backlog.ts:154-221) into `notJsonCapable` (validation/exit 6). Assert with step_fail + the RUNBOOK_HINT substring, same idiom LCLI-61 used for the exit-3 missing-binary case.
4. AC4: rename the Story (the one linked concept — reuse `$STORY_ID`/`$STORY_PATH`, NOT the Reference doc the harness currently renames) so `moveBackRefs`'s real `task edit` label/--doc moves and the per-write backlog commit actually run; assert the real task record changed and `git status --porcelain -- backlog/` is clean after. Then induce an F1 back-ref-write failure (reuse LCLI-61's chmod pattern against the target task's backlog file) during a rename and confirm the asymmetry: `rename.result` STILL appears on stdout (unlike link/unlink's throw-on-failure) WITH exit 6 returned — verify this against src/commands/rename.ts:203 before assuming the filing task's description is exactly right (LCLI-61 found a similar assumption in its own filing task was wrong).
5. AC5: run the full real-binary harness (`docker compose -f docker/e2e/docker-compose.yml up --build`, then always `down -v`) green — this is the verification evidence; `bun test` alone does not satisfy any AC here.
6. Review the branch diff adversarially (independent subagent, not self-review — this caught nothing blocking in LCLI-61 but did catch a real defect in LCLI-67 two sessions ago; keep using it).
7. Advance the tracker cursor to LCLI-63 on the branch (atomic with the fix), append the session-log entry via `backlog doc update doc-1`.
8. Archive this handover (check `archive/handovers/` for a name collision first — today's date has now been used twice already), write the next one pointed at LCLI-63, push dev.

## Critical context / traps

- **Backlog data only via the `backlog` CLI** — never edit `backlog/**` markdown directly.
- **Every E2E task (61-66) requires the real Docker harness**, not just `bun test`. Budget the ~2-3 min build+run cycle, and never skip `down -v` teardown even on failure.
- LCLI-63/64/65/66 still ahead in the queue after LCLI-62; LCLI-66 depends on LCLI-61 (now Done, so unblocked).
- `docs/.obsidian/` is untracked, pre-existing, unrelated — leave it alone (confirmed still present and harmless this session).
- **Do not trust a filing task's proposed induction technique or exit-code assumption at face value** — LCLI-61 found the filing task's own assumption about `lore validate`'s exit 6 being an `error_type=validation` ErrorEnvelope case was wrong (validate/check are gates that report findings as stdout data and never throw for a content finding). Verify every proposed mechanism against the actual current source before implementing, same discipline for LCLI-62's stub-binary and F1-induction proposals.
- `step_fail(name, expected_exit, jq_filter, -- cmd...)` now exists in run-e2e.sh (next to `step`/`step_json`) — it parses only the LAST line of stderr as the JSON envelope (some commands print `warning: ...` advisory lines to stderr ahead of a failure envelope). Reuse it; don't reinvent.

## Do not repeat

- Nothing failed outright in the LCLI-61 session, but two of my own initial test-authoring assumptions were wrong and caught by actually running the real binary (not by code review): (1) assuming `.error_type` filters against raw stderr would work without accounting for advisory warning lines — fixed by parsing only the last stderr line; (2) assuming `lore validate`'s exit 6 was the `error_type=validation` ErrorEnvelope case — it's a gate that reports on stdout instead. Lesson for LCLI-62: run the real docker harness EARLY and iteratively while building each AC's assertions, don't write the whole diff first and validate once at the end — the two rounds this session (fail → diagnose → fix → green) were cheap because each round was ~2-3 min, not expensive to repeat.
- Historical trap that keeps recurring: do not trust script comments, docs, or a filing task's own description as ground truth for behavior — verify against the actual `docker/e2e/run-e2e.sh` and `src/` at execution time.
