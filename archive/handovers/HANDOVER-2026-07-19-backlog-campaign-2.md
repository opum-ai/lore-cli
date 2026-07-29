# Handover — Backlog campaign session 2: LCLI-61 (docker/e2e step_fail helper + failure-output contract)

**Date**: 2026-07-19 | **Grounded against**: `dev @ b0702d8`, clean (only pre-existing untracked `docs/.obsidian/`), 1 commit ahead of `origin/dev` (the archive commit — push this before/during restore's R5) | **Tracker**: doc-1 (`backlog doc view doc-1 --plain`)

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1
(`backlog doc view doc-1 --plain`). Cursor: LCLI-61 — docker/e2e never asserts
failure output: 0/82 recorded assertions in docker/e2e/run-e2e.sh inspect the
stderr ErrorEnvelope shape or the stdout-silence-on-failure contract. Queue
order (61, 62, 63, 64, 65, 66) confirmed by the user on 2026-07-19; do not
re-ask. Merge gate: self-merge (gh pr merge --rebase --delete-branch into dev)
confirmed by the user on 2026-07-19 — the PR is an audit trail, not an
approval gate.

LCLI-61 depends on LCLI-56 (Done — Docker E2E harness itself, verified this
session). This is an E2E task: verification REQUIRES the real Docker harness
(`docker compose -f docker/e2e/docker-compose.yml up --build`, ~2-3 min,
ALWAYS `docker compose -f docker/e2e/docker-compose.yml down -v` after) — a
green `bun test` alone is NOT sufficient evidence (campaign convention). Push
the pending archive commit (dev is 1 ahead of origin/dev going into this
session) as part of restore's own sync step.

Re-derive the exact current shape of docker/e2e/run-e2e.sh's `step` helper
(L43-63 per the filing task, but re-verify line numbers first) before adding
`step_fail`; follow backlog instructions task-execution → task-finalization
for the task lifecycle.
```

## State

| Item | Status |
| --- | --- |
| LCLI-67 | Done and merged into `dev` (PR #57, rebase-merged, `fcabe6b`). Adversarial review caught and fixed one leftover false claim (ADR-0013 Consequences section) before merge — see task notes. |
| Tracker | doc-1 updated on `dev`: LCLI-67 moved to Resolved, cursor advanced to LCLI-61, session-log appended. |
| Handover | This session's own consumed handover already archived to `archive/handovers/HANDOVER-2026-07-19-backlog-campaign.md`, committed at `b0702d8` — not yet pushed. |
| Branches / PRs | No `feature/*` branches local or remote; no open PRs (`feature/LCLI-67` deleted both sides post-merge). |
| LCLI-61 dependency | LCLI-56 (Docker E2E harness) confirmed **Done** this session — LCLI-61 is unblocked. |
| LCLI-42/43/44/45 | Still parked in tracker "Not queued" — deferred by recorded product decisions. Do not pick up. |

## Next steps

1. `git push origin dev` first (this session leaves `dev` 1 commit ahead of `origin/dev` — the archive-handover commit).
2. Per-issue lifecycle on LCLI-61 (`backlog task view LCLI-61 --plain` for the five ACs): branch `feature/LCLI-61` off `dev`, plan on the task, re-verify `docker/e2e/run-e2e.sh`'s current `step` helper shape and line numbers (the filing task's L43-63/L346-356/L209/L214 references are from the 2026-07-19 audit at `dev @ b8a4667` — re-check against current HEAD before editing).
3. Build the `step_fail` helper (AC1), wire it into the five exit-class spot checks (AC2) and the two missing-binary probe steps (AC4), and add an induced real back-ref write failure to exercise the LCLI-58 path (AC3) — see the task description's `chmod 555 backlog/tasks` suggestion (verify it's still a valid induction technique against current `lore link`/`unlink`).
4. Run the full real-binary harness (`docker compose -f docker/e2e/docker-compose.yml up --build`, then always `down -v`) green (AC5) — this is the verification evidence; `bun test` alone does not satisfy any AC here.
5. Review the branch diff adversarially (an independent subagent review caught a real defect in LCLI-67's branch last session — repeat that pattern), push, open PR into `dev`, self-merge (rebase), prune.
6. Advance the tracker cursor to LCLI-62 on the branch (atomic with the fix), append the session-log entry via `backlog doc update doc-1`.
7. Archive this handover, write the next one pointed at LCLI-62, push dev.

## Critical context / traps

- **Backlog data only via the `backlog` CLI** — never edit `backlog/**` markdown directly.
- **This is the first of the five remaining E2E tasks (61-66) — all require the real Docker harness**, not just `bun test`. Budget the ~2-3 min build+run cycle, and never skip `down -v` teardown even on failure.
- LCLI-62 and LCLI-66 (later in the queue) depend on LCLI-61's `step_fail` helper landing first — the queue order already accounts for this.
- `docs/.obsidian/` is untracked, pre-existing, unrelated — leave it alone (confirmed still present and harmless this session).
- Re-verify every line-number reference in LCLI-61's description against the current `docker/e2e/run-e2e.sh` before editing — the task itself says to "re-derive the exact shape against the current script at execution time," and LCLI-67 this session found stale claims are common even in fresh-seeming audit output.

## Do not repeat

- Nothing failed in the LCLI-67 session. One process note worth repeating deliberately: an independent adversarial-review subagent (not self-review) on the branch diff caught a real leftover false claim that self-review had missed — keep using that pattern for LCLI-61's diff before opening the PR, especially since E2E script changes are easier to get subtly wrong than docs prose.
- Historical trap that keeps recurring: do not trust script comments or docs as ground truth for behavior — verify against the actual `docker/e2e/run-e2e.sh` and `src/` at execution time (LCLI-60/67 both existed because docs/scripts drifted from code; LCLI-61 itself was filed by the same class of audit).
