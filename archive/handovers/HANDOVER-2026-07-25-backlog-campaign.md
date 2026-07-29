# Handover — v1 release-readiness & e2e follow-ups (waves: 2, issues: LCLI-258/262/263/254 merged; 259/256/255/264 merge-pending)

**Date**: 2026-07-25 | **Grounded against**: `dev` @ `9c83052` + a pending tracker commit, clean apart from pre-existing untracked dev-tools (`lore-setup.sh`, `lore-e2e-test.sh`, `.repro-scratch/`, `docs/.obsidian/`) | **Tracker**: doc-5

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-5.
Wave 1 COMPLETE (LCLI-258, 262, 263, 254 merged + a docs-drift follow-up).
Wave 2 is IMPLEMENTED, OPUS-APPROVED, REBASED, PUSHED — and BLOCKED AT THE MERGE
GATE. Do NOT re-implement or re-review it; go straight to the merge queue once
the blockers below clear. Queue order confirmed by the user 2026-07-24; do not
re-ask. The ready set is recomputed live at restore — do NOT hardcode a next
wave here.

⛔ TWO EXTERNAL BLOCKERS, BOTH NEED A HUMAN — CHECK BOTH BEFORE DISPATCHING:
1. GITHUB ACTIONS CANNOT RUN. `dev` requires the docker-e2e check (ruleset
   19698059), so nothing merges. PR #248's run 30157878759: attempt 1 had all
   short jobs succeed while the two longest were CANCELLED mid-flight at the
   same second; attempts 2 and 3 started ZERO jobs with GitHub's generic
   "workflow file issue" message — though ci.yml parses fine at that SHA and the
   diff touches no .github/ file. July Actions usage is $31.17 net billed with
   the included allowance consumed. Signature of an ACTIONS SPENDING LIMIT.
   The cap is not readable via API — the user must check GitHub billing.
   VERIFY IT IS FIXED before anything else: `gh run list --limit 3` should show
   a recent successful run, or push a trivial branch and watch one complete.
2. FABLE 5 IS OVER ITS MONTHLY SPEND LIMIT. All four wave-2 Fable reviewers
   failed. The user chose to substitute OPUS reviewers for wave 2. Ask again
   before spending Opus on wave 3 — it is materially pricier than the design
   assumes. Test cheaply: dispatch one small fable agent and see if it errors.

WHEN UNBLOCKED, the immediate work is the merge queue, in this order — 259,
256, 255, 264 — each already rebased onto dev@9c83052 and green locally:
  feature/LCLI-259 @ 0f95481  (PR #248 already OPEN, just needs green checks)
  feature/LCLI-256 @ a778029  (no PR yet)
  feature/LCLI-255 @ 3406a05  (no PR yet)
  feature/LCLI-264 @ 6f12284  (no PR yet)
Worktrees still exist at /Volumes/external/repos/lore.worktrees/<KEY> — do NOT
remove them before merge (the branch is checked out there). Re-rebase + re-verify
each one as dev moves under it; do not merge stale pre-rebase bytes.
LCLI-256's AC#4 (windows-latest CI leg green) is STILL OPEN and can only be
closed by a real CI run.

AFTER those four merge: run the wave-2 integration review over the cumulative
merged diff (none was run — nothing merged), then wave 3 = LCLI-261 + LCLI-260
(mutually disjoint; both were excluded from wave 2 only because they touch
`usage()` call sites LCLI-259 was rewriting).

DO NOT bypass the required check with `gh pr merge --admin`. The owner has
ruleset bypass, so it would work — but merging code whose CI never ran is a
governance call that is the user's, not an agent's.

Other locked facts: LCLI-253 stays blocked on the upstream --json tag (LCLI-254,
now merged, is its live daily watch). LCLI-257 is needs-human (repo-admin
ruleset toggle). LCLI-42/43/44/45 are deferred-v2. The `backlog` on PATH is a
locally-BUILT patched --json binary. Keep worktrees on the SAME filesystem as
the checkout (cross-device 0-byte compile trap).
```

## State
| Item | Status |
| --- | --- |
| Tracker | doc-5, updated through wave 2's blocked settlement |
| Wave 1 | COMPLETE — LCLI-258, 262, 263, 254 merged (PRs #243/#245/#244/#246) + docs-drift follow-up (#247) |
| Wave 2 | Implemented + Opus-approved + rebased + pushed; **0 of 4 merged** |
| Resolved | 4 of 10 queued |
| Queued | LCLI-261, LCLI-260 (wave 3 candidates, mutually disjoint) |
| Not queued | 6 — LCLI-253 (blocked-upstream), LCLI-257 (needs-human), LCLI-42/43/44/45 (deferred-v2) |
| Default branch | `dev` @ `9c83052` (+ tracker commit pending push) |
| Open PRs | #248 (LCLI-259) — OPEN, `BLOCKED` on checks |
| Live worktrees | 4: LCLI-259, LCLI-256, LCLI-255, LCLI-264 — **keep until merged** |
| New task filed | LCLI-264 (CHANGELOG backfill), from wave 1's integration review |

## This session's in-flight wave (stopped at the merge gate)
| Issue | Worktree path | Branch @ SHA | Stage reached | Note |
| --- | --- | --- | --- | --- |
| LCLI-259 | `/Volumes/external/repos/lore.worktrees/LCLI-259` | `feature/LCLI-259` @ `0f95481` | 7 (reviewed, approved, rebased, pushed, PR open) | PR #248 blocked on checks. Reviewer re-ran docker e2e locally: 302/0 |
| LCLI-256 | `…/lore.worktrees/LCLI-256` | `feature/LCLI-256` @ `a778029` | 6 (reviewed, approved, rebased, pushed; no PR) | AC#4 windows-latest CI leg still unverified |
| LCLI-255 | `…/lore.worktrees/LCLI-255` | `feature/LCLI-255` @ `3406a05` | 6 (same) | Implemented the real publish job — dispatch-gated, defaults off. See trap below |
| LCLI-264 | `…/lore.worktrees/LCLI-264` | `feature/LCLI-264` @ `6f12284` | 6 (same) | CHANGELOG-only |

## Next steps
1. **Human**: check GitHub billing for an Actions spending limit on the account; raise or reset it. Nothing else in this campaign can proceed until Actions runs.
2. **Human**: decide on Fable 5 — raise the limit, or confirm Opus reviewers for wave 3.
3. Verify Actions works, then run the merge queue for 259 → 256 → 255 → 264 (re-rebase + re-verify each as `dev` moves).
4. Run the wave-2 integration review over the cumulative merged diff.
5. Wave 3: LCLI-261 + LCLI-260.

## Critical context / traps
- **Do not re-implement or re-review wave 2.** Four Sonnet implementations and a full Opus review gate (4 approvals, 4 fix cycles total) are already spent on it. It only needs merging.
- **`git stash` is repo-wide, not per-worktree.** A wave-2 reviewer deliberately used backup-copy revert instead of stash for its mutation check, citing a prior cross-worktree contamination in this campaign. Keep doing that.
- **The docker e2e harness is a separate contract-test suite `bun test` does not cover**, and it is a required check. Baseline is now **302 passed / 0 failed** (was 299 before LCLI-263 rewrote Phase 18). Any task changing a user-visible CLI contract must run it locally before review — this was wave 1's hard-won lesson (LCLI-263 passed everything else and still failed the gate).
- **Only one `e2e-e2e` container run at a time** — it serializes on a shared compose project name. Designate exactly one agent per wave to run it.
- **LCLI-255 residual security risk, flagged by its reviewer and worth a human decision**: npm Trusted Publishing pins repo + workflow *filename*, not a ref. Because the publish job is reachable by `workflow_dispatch` on any ref, an actor with write access could push a branch carrying a modified `release.yml` (guards stripped) and dispatch it with `publish: true`. Documented in the task, not fixed.
- **`.repro-scratch-255/`** (~24K of npm-pack tgz) is left in the LCLI-255 worktree. Fully gitignored, nothing committable — delete it when pruning that worktree.
- Tracker writes are orchestrator-only, and must go through `backlog doc update`, never a direct file edit (I made that mistake once this session and reverted it).

## Do not repeat
- **`gh run rerun <id> --failed` is a no-op when the jobs were *cancelled* rather than failed.** Cancelled ≠ failed. Use a full `gh run rerun <id>`.
- **Don't diagnose a red PR from the check name alone.** PR #248 showed `docker e2e … fail`, which read like a real regression — it was a mid-flight cancellation with every prior assertion passing. Read the job log tail and the per-attempt job list (`gh api …/attempts/N/jobs`) before concluding anything about the code.
- Opening PRs for the remaining three branches was deliberately skipped — each would fire another doomed CI run and add noise while Actions is capped.
