# Handover — round 5 init: round-4 review residue & release hardening (waves: 0, issues: LORE-265/267/268/266 queued, none started)

**Date**: 2026-07-25 | **Grounded against**: `dev` @ `34cad8c`, clean (apart from pre-existing untracked dev-tools: `lore-setup.sh`, `lore-e2e-test.sh`, `.repro-scratch/`, `docs/.obsidian/`), in sync with `origin/dev` | **Tracker**: doc-6

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-6
(round 5). NOTHING has been dispatched yet — this is a fresh queue, 0 waves run.
4 queued items, 6 not queued. Queue order confirmed by the user 2026-07-25:
265 -> 267 -> 268 -> 266; do not re-ask. The ready set is recomputed live at
restore — do NOT hardcode a next-wave membership list.

⛔ ASK BEFORE DISPATCHING: Fable 5 is over its monthly spend limit (re-probed
2026-07-25 — a trivial fable agent fails immediately). Round 4 ran waves 2-3 on
OPUS reviewers by the user's explicit choice, which worked but is materially
pricier than the campaign design assumes. Re-probe fable cheaply first; if it
still fails, ASK the user which reviewer model to use. Do not silently spend
Opus again.

KNOWN CONFLICT: LORE-266 and LORE-267 both touch src/commands/agents.ts AND
test/agents.test.ts — they cannot share a wave. LORE-265 (docs-only) and
LORE-268 (release.yml + its test + runbook) are disjoint from everything.
Likely shape: wave 1 = {265, 267, 268}, wave 2 = {266}. RECOMPUTE, don't trust.

LORE-268 has a repo-admin half the agent must NOT self-authorize (creating the
GitHub Environment + its required reviewers). The agent ships the workflow-side
change and documents exactly what the user must do; it must not claim the risk
is closed.

Baseline verified at init: bun test 2176/0, lore check 40 files 0/0, docker e2e
302/0. Repo is clean: no worktrees, no feature/* branches, no open PRs.

Locked facts: LORE-253 stays blocked on the upstream Backlog.md --json tag
(latest is still v1.48.0; LORE-254's daily watcher opens a GitHub issue when it
lands — check `gh issue list` each restore). LORE-257 is needs-human (repo-admin
ruleset). LORE-42/43/44/45 are deferred-v2. The `backlog` on PATH is a locally
BUILT patched --json binary. Keep worktrees on the SAME filesystem as the
checkout (cross-device 0-byte compile trap).
```

## State
| Item | Status |
| --- | --- |
| Tracker | **doc-6** (round 5). doc-5 is round 4 — complete, archived state, do not write to it |
| Waves run this session | 0 — init only |
| Queued | 4: LORE-265, LORE-267, LORE-268, LORE-266 |
| Not queued | 6: LORE-253 (blocked-upstream), LORE-257 (needs-human), LORE-42/43/44/45 (deferred-v2) |
| Default branch | `dev` @ `34cad8c`, clean, pushed |
| Worktrees / branches / PRs | none / none / none |
| Baseline | `bun test` 2176/0 · `lore check` 40 files 0/0 · docker e2e 302/0 |
| New task filed at init | **LORE-268** (publish-job hardening), from round 4's unfixed LORE-255 exposure |

## Next steps
1. **Re-probe Fable** with one trivial agent. Still capped → **ask the user** which reviewer model to use before dispatching anything.
2. Recompute the ready/conflict graph live. Expect wave 1 = {LORE-265, LORE-267, LORE-268}; verify the 266↔267 edge still holds.
3. Dispatch wave 1. **Put the `[Unreleased]` CHANGELOG requirement in every worker prompt** — see traps.
4. Designate exactly **one** worker per wave to run the docker e2e harness. For wave 1 that is most likely LORE-268 (it is the only one touching a CI/release contract); LORE-265 is docs-only and LORE-267 is a colour change, so neither needs it.
5. Wave 2 = LORE-266 alone. Its AC#3 may widen into `src/commands/rename.ts` / `src/commands/sync.ts` — both call `assertNoSymlinkInAnyPath` (verified at init).

## Critical context / traps
- **Three of the four queued items were filed by round 4's own review gate** — each is a real defect a reviewer found in code it was reviewing but which was deliberately out of the reviewed diff's scope. They are not speculative.
- **`CHANGELOG.md` is a known, accepted shared-file edge between wave-mates.** Round 4's process fix requires every worker with a user-visible change to add an `[Unreleased]` entry, so wave-mates collide there by construction. It resolved cleanly in round 4 (entries in different sections) and the **serial merge queue is the backstop**. Do NOT "fix" it by dropping the CHANGELOG requirement — that gap recurred in both round-4 waves and cost a follow-up branch each time. Note `docs/reference/cli-contract.md` §1.3/§7.2 make substantial `--plain` reformatting a contract-level change, so even phrasing-only tasks need an entry.
- **Re-review the fixes, not just the implementation.** Round 4's most valuable catches were all in *fix* passes: a CHANGELOG entry with four claims false against source, and two blocking runtime defects found only by a second review pass.
- **A confidently-worded but wrong doc is worse than a missing one.** Every quoted literal output string must be re-verified against the real binary, never reconstructed from a diff.
- **docker e2e** (`docker/e2e/run-e2e.sh`) is a separate contract-test suite `bun test` does not cover, and it is a **required CI check**. It serializes on one `e2e-e2e` container — exactly one worker per wave may run it. Baseline **302/0**.
- **`git stash` is repo-wide, not per-worktree** — it has swapped diffs between sibling worktrees in this campaign. Use `git diff > patch` + `git apply -R`/`git apply` for mutation checks.
- **Run `gh pr merge` from the primary checkout, not a worktree** — post-merge cleanup fails on the shared `dev`. And `--delete-branch` fails while a worktree still holds the branch: remove the worktree first, then delete the branch.
- **A billing cutoff masquerades as a CI failure**: long jobs cancelled mid-flight, later attempts starting *zero* jobs with a generic "workflow file issue". `gh run rerun --failed` is a **no-op on cancelled jobs** — use a full `gh run rerun`. This is exactly what blocked round 4's merge gate for a whole session.
- **LORE-268's scope split is load-bearing**: the workflow-side change is agent-doable; creating the GitHub Environment and its required reviewers is repo-admin and must not be self-authorized (same boundary as LORE-196/LORE-257). An in-workflow `if: github.ref == …` guard is **not** a mitigation — it lives in the same file an attacker replaces.

## Do not repeat
- **Don't diagnose a red PR from the check name alone.** Round 4 saw `docker e2e … fail` that was a mid-flight billing cancellation with every prior assertion passing. Read the job log tail and the per-attempt job list (`gh api …/attempts/N/jobs`) before blaming the diff.
- **Don't trust `merge-base --is-ancestor` to tell you whether a branch was merged** when the repo uses `--rebase` merges — it rewrites SHAs, so the original tip is never an ancestor. Check the PR state instead (`gh pr list --head <branch> --state all`).
- **Don't estimate a post-merge test count by adding both branches' deltas.** Round 4's orchestrator predicted ~2186 and was wrong: the second branch had rebased onto the first, so its reported total already included the first's tests. The real number was 2176.
- **Don't rely on a task's cluster label as proof two tasks are safe to parallelize.** Different cluster is not sufficient — do the file-citation read. (LORE-266/267 are a live example: different-sounding concerns, same two files.)
