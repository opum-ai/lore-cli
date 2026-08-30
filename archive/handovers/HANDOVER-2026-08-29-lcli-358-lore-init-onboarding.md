> **ARCHIVED 2026-08-30 — consumed, and stale in two ways. Do not act on it as written.**
> Its Git claim expired: it says `dev` is 6 commits ahead of `main`; as of 2026-08-30
> `git rev-list --left-right --count origin/main...origin/dev` is `5  0` — `dev` is fully
> promoted. Its worktree table cites `.treehouse/...` paths that no longer exist; Treehouse is
> retired in this repository (PR #479) and leases now go through the user-level `opum-worktrees`
> skill. Two open items it names are still real and were NOT closed by archiving it: LCLI-356 AC#5
> awaits the `opum-cli-e2e` paired-E2E receipt, and LCLI-358.6 stays blocked on quest-cli QCLI-136
> until an installed Quest binary — not a merged PR — accepts `quest init --name --task-id-prefix`.
> Re-derive both from live state.

# Handover — LCLI-358 lore init onboarding rebuild

**Lifecycle**: executable-current
**Grounded against**: repository `/Volumes/external/repos/lore-cli`; branch `dev`; SHA `9c43f079f717017b7fb81838b0da855f67dcf308`; worktree `/Volumes/external/repos/lore-cli`; level with `origin/dev`; `git rev-list --left-right --count origin/main...origin/dev` = `1  10` — `main` @ `98b9a903cea20bca32b61e17ead94128fbb0b89e` holds 1 commit `dev` lacks (its own promotion merge), and `dev` holds 10 `main` lacks (LCLI-358.5, LCLI-362, and their settlement merges, all unpromoted); one untracked file preserved (`backlog/tasks/lcli-357 …`, another session's)
**Tracker**: doc-26 Backlog campaign tracker — LCLI-358 lore init onboarding rebuild
**Mode**: autonomous-docs
**Stop class**: human-decision
**FMC role**: standalone
**FMC identity**: `none`
**FMC controller**: `none`

## Paste-ready prompt
Launch a fresh session in `/Volumes/external/repos/lore-cli`, then use `$backlog-handover restore`.
Recompute readiness from live repository state. The campaign queue is empty of startable work —
do NOT invent a next task; re-verify the two external blockers below and report, or take a new
instruction from the operator.

## State
- Resolved: 5 (LCLI-358.1, .2, .3, .4, .5) + LCLI-362 AC#1/AC#3
- In flight: 1 (LCLI-356)
- Blocked: 1 (LCLI-358.6)
- Ready: 0

## Delivered this session
LCLI-358.4 (`2cef5bb`) → PR #445 → merged to `dev`; PR #446 promoted `dev` to `main` (`98b9a90`).
LCLI-358.5 (`5580207`) → PR #447 → merged to `dev`. Tracker settlement → PR #449 (#448 was the same
content, closed by my own premature branch deletion while its checks were still registering).
LCLI-360 premise correction → PR #450. LCLI-362 AC#1/AC#3 (`aa839b4`) → PR #451, settlement → PR
#452. All feature branches deleted locally and on `origin`.
Every PR passed all 8 required checks. No publish: `release.yml` is `workflow_dispatch` only with
`publish` defaulting to false. **`dev` is 6 commits ahead of `main`: LCLI-358.5 and the three
settlement merges are NOT promoted.**

## In flight
| Task | Worktree/branch | Last verified tree and stage | Blocker or next action |
| LCLI-356 | `/Volumes/external/repos/lore-cli` / `dev` | `98b9a903cea20bca32b61e17ead94128fbb0b89e` — implemented, reviewed, gates green, merged to `dev` and promoted to `main`, awaiting external verification | AC#1–4 Done and verified live against installed quest 0.2.9. AC#5 (paired installed E2E vs published quest 0.2.9) is delegated to the `opum-cli-e2e` session. Do NOT close LCLI-356 without that receipt. |

Blocked: LCLI-358.6 on opum-ai/quest-cli QCLI-136. Re-verified live 2026-08-29: quest-cli PR #167
IS merged, but it is a backlog-tracking commit, not the flag implementation. Installed and published
Quest is 0.2.9, and `quest init --name --task-id-prefix` still exits `usage` with "init accepts only
--agent-instructions, --json, and --plain". A merged PR is not a shipped contract — check the
installed binary, not the PR state.

Parent LCLI-358 stays open until .6 settles.

## FMC coordination
| Message/approval id | Kind | Sender | Recipient | Status | Next poll/reply action |
| none (herdr paste, no correlation id) | LCLI-356 AC#5 handoff | prior session | `opum-cli-e2e` pane `wK:pR` | delivered | herdr is fire-and-forget with no reply channel. Read the result from the `opum-cli-e2e` repository; there is no receipt to poll. |

## Worktrees and retained artifacts
| Repository/path/ref | Owner | Lease/status | Reason | Cleanup condition |
| `/Volumes/external/.opum-worktrees/lore-cli-5dc2164bdcc4/1/lore-cli` @ `feat/lcli-333-1-tracker-seam-backend-owned` 914a56d | lore-cli | locked lease 5f6da0f0 | preserved as found | leased — do not touch |
| `/Volumes/external/.opum-worktrees/lore-cli-5dc2164bdcc4/2/lore-cli` @ 9795cf2 detached | lore-cli | slot free | preserved as found | owner's decision |
| `.treehouse/.treehouse/lore-cli-68bc63/1` @ `feat/lcli-333.1-tracker-mutation-seam`; `…f70589/1` @ 7171eb1 detached; `…f70589/2` @ `feat/lcli-340-manifest-kinds`; `…f70589/3` @ `feat/lcli-343-344-trackerless-hermes` | lore-cli | fenced | preserved as found | owner's decision |
| `/Volumes/external/repos/lore-odoc-63.1-agent-profiles` @ `feat/odoc-63.1-agent-profiles` | external | in use | not this campaign's | out of scope |
| ~19 other local branches already merged into `origin/main` | mixed | untouched | several are checked out in leased or fenced worktrees; pruning them was never asked for and is not this campaign's | owner's decision |
| `backlog/tasks/lcli-357 …` (untracked) | another session | preserved | never staged by this campaign | its author settles it |

Note: the `opum` CLI is not on PATH on this host, so lease state above is grounded from
`git worktree list` and the prior cursor's record, not a live three-layer Opum audit.

## Decision required
- Decision: two owner choices are open — (a) whether to promote `dev` to `main` again (10 commits,
  LCLI-358.5 and LCLI-362 included; standing campaign authority stops at `dev`, and the last
  promotion was on explicit operator instruction), and (b) how to settle LCLI-362 AC#2, which asks
  AGENTS.md and CLAUDE.md to cite the SAME lore skill root when they must not —
  `src/core/agent-bridge.ts` and `src/core/codex-bridge.ts` generate one copy per runtime, so
  collapsing them would break `lore agents` and `lore init --codex`. AC#1 and AC#3 are done; the
  task stays In Progress until AC#2 is amended or dropped by its owner.
- External action, LCLI-358.6: quest-cli must ship `quest init --name --task-id-prefix` in a
  RELEASED Quest. Nothing in this repository unblocks it.
- External action, LCLI-356 AC#5: the `opum-cli-e2e` session owns the paired installed-vs-published
  E2E receipt. Do not close LCLI-356 without it.

## Next action
- Action: none automatic. The campaign has no startable task. A restored session should re-verify
  the two external blockers from live state and report, not start work.

## Exceptions
- LCLI-360's "never executed" premise was corrected in the task itself (PR #450): the docker e2e harness passed on PRs #445, #446, #447, #449, and #450. Its local-execution gap stands — `docker info` exits 1 on this host — so a failure there is only ever discovered in CI.
- `gh pr checks --watch` reports "no checks reported on the '<branch>' branch" and EXITS while checks are still registering, rather than waiting. Acting on that as "no checks required" is how I closed PR #448: I deleted its branch, which closed the PR. Poll `gh pr view --json mergeStateStatus` until it reads CLEAN, and never delete a branch before the merge is confirmed MERGED.
- An empty directory tree is invisible to git, so it survives every diff-based review. Two forbidden skill shadows lived under `.codex/skills/` that way until an `ls` found them (LCLI-362). Audit skill roots with a filesystem listing.
- LCLI-359 (remove the deprecated `InitResult.backlog` field) and LCLI-361 (docs/index.md cites 0.3.0 while 0.3.4 ships) are filed and out of this campaign's wave.
- `origin/main` sits 1 commit ahead of `origin/dev` and the usual fast-forward of `dev` onto `main` could not be applied: `git push origin dev` is refused with "push declined due to repository rule violations". Whoever owns that rule must fast-forward `dev` through an allowed path.
