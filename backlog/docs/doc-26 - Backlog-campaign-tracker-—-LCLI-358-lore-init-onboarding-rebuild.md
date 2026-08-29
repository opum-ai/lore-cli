---
id: doc-26
title: Backlog campaign tracker — LCLI-358 lore init onboarding rebuild
type: other
created_date: '2026-08-28 23:59'
updated_date: '2026-08-29 22:48'
---
# Backlog campaign tracker — LCLI-358 lore init onboarding rebuild

## Contract
- Mode: autonomous-docs
- Session role: standalone
- FMC identity: none
- FMC controller: none
- Scope and queue rule: Work only in /Volumes/external/repos/lore-cli. Burn down LCLI-358's subtasks in order, plus LCLI-356 which two of them depend on. Direct user direction, not an addressed FMC order — do not infer a fleet relationship from the prior settled cursor's worker metadata.
- Delivery: branch `chore/lcli-358-init-onboarding` -> PR #445 -> origin/dev only. No main promotion, no publish, no force-push, no repository administration.

## Repositories and routing
| Repository | Task ids | Mutation owner | AGENTS authority | Integration branch and pinned base | Required gates |
| lore-cli | LCLI-358 (+ .1–.6), LCLI-356, LCLI-359–362 | this session | AGENTS.md + CLAUDE.md | dev @ 9795cf2def94e8ac6a91a3f6587e344254b508a9 | bun test, lint, typecheck, lore check |
| quest-cli | QCLI-136 | quest-cli session | its own AGENTS.md | dev, PR #167 | not this repository's to run |
| opum-cli-e2e | LCLI-356 AC#5 | opum-cli-e2e session | its own AGENTS.md | n/a | paired installed E2E vs quest 0.2.9 |

## Frontier
- Resolved: 5 (LCLI-358.1, .2, .3, .4, .5). In flight: 1 (LCLI-356, AC#1–4 done, AC#5 delegated). Blocked: 1 (LCLI-358.6). Ready: 0 — the campaign queue is empty of startable work.
- Parent LCLI-358 stays To Do until every subtask settles.
- Excluded: LCLI-357 (another session's untracked task file, preserved, never staged).

## Queue
| Order | Task | Dependencies | State | Likely paths |
| 1 | LCLI-358.4 | none | done (2cef5bb) | src/adapters/jira-onboarding.ts, src/commands/init.ts, src/core/manifest.ts, docs, tests |
| 2 | LCLI-358.5 | none | done (5580207, PR #447) | src/tracker-selection.ts, src/commands/init.ts, src/core/manifest.ts, docs, tests |
| 3 | LCLI-358.6 | quest-cli QCLI-136 (unreleased) | blocked — re-verified live 2026-08-29 | src/commands/init.ts, src/adapters/quest.ts |
| 4 | LCLI-358 | .1–.6 | settlement candidate | backlog only |
| 5 | LCLI-356 | opum-cli-e2e AC#5 receipt | in flight | none in this repository |
| — | LCLI-359, LCLI-361 | release/decision boundaries | deferred | see each task |
| — | LCLI-360 | a host with docker | deferred | docker/e2e |
| — | LCLI-362 | none | AC#1/AC#3 done (aa839b4, PR #451); AC#2 open on a false premise | .claude/skills, .codex/skills, AGENTS.md, CLAUDE.md |

## Delivered
- LCLI-358.1 (1c47677, then review fixes 92fc107): git preflight before the first write; `--allow-no-git`; scaffold moved after every prompt.
- LCLI-358.2 (0b3e1ae): the capability probe follows the selected tracker; `trackerCheck` added, `backlog` deprecated; `--check-tracker`/`--no-tracker`.
- LCLI-356 (2e5a002): Quest version gate is a minimum floor, evaluated at tracker-selection time; ADR-0020.
- LCLI-358.3 (d080b93): tracker binary and repository detection before the choice; bounded install offer; `--install-tracker`/`--no-install-tracker`.
- LCLI-358.4 (2cef5bb): jira is configured and validated before the selection is persisted; new `src/adapters/jira-onboarding.ts`; `InitPrompter.ask`; `--jira-profile`/`--jira-project`.
- LCLI-358.5 (5580207): the tracker question is always asked; migration is gated on a real `backlog/config.yml` project, not on config provenance; three-answer migration question; `--keep-backlog-tasks`; one refusal message per unmet condition.
- LCLI-362 AC#1/AC#3 (aa839b4): both `backlog-handover` skill shadows deleted; AGENTS.md and CLAUDE.md record which project-level skills are deliberate. AC#2 left open — see Decisions.

## Evidence and gates
- Every commit on this branch was verified with `bun test` (2739 pass / 0 fail / 1 skip at 2cef5bb), `bun run lint`, `bun run typecheck`, and `lore check` — all exit 0, taken without a pipe.
- LCLI-358.4 additionally ran the compiled binary against real jira-cli 1.0.2 and a real Jira project: a configured bundle probes `capable: true`; bad key / bad profile / missing flags exit 3 / 6 / 2 writing no configuration.
- LCLI-358.5 was driven live under a pty against a real legacy fixture: jira reachable with no migration question; `keep` writes quest and leaves `backlog/tasks/` intact; `backlog` pins Backlog; every refusal read back from a real run.
- PRs #445, #446, and #447 each passed all 8 required checks, **including the docker e2e harness**. LCLI-360's local-execution gap stands; its "never executed anywhere" premise does not.
- Wizard behavior confirmed live under a pty with `expect(1)`, not only through injected seams.
- NOT verified: docker/e2e. `docker info` exits 1 on this host, so the seven cases added across LCLI-358.1/.2/.3 and LCLI-356 have never executed in the harness. Tracked as LCLI-360.

## Durable findings
- `Bun.spawnSync` snapshots the environment at process start: a `process.env` mutation is invisible to the child, so git's `GIT_TEST_ASSUME_DIFFERENT_OWNER` hook cannot be reached from inside a test process.
- `git rev-parse --is-inside-work-tree` exits 128 both for "no repository" and for a valid worktree git refuses (dubious ownership). Only stderr distinguishes them.
- `quest init` requires a git worktree and, at 0.2.9, accepts only `--agent-instructions`, `--json`, `--plain`.
- `jira-cli` emits JSON by default; `jira config list-profiles` returns `data.profiles[]` with `name`, `jiraUrl`, `isDefault`. `jira project get <KEY>` returns `data.project.issue_types[]`; a failure exits 1 with `{success:false,error,status_code}` on **stderr**, not stdout.
- `jira metadata statuses` is instance-wide (43 entries on the observed site, names duplicated across schemes), so it cannot yield one project's workflow order. `status_flow` is seeded from Jira's default scheme instead and left for the operator to edit.
- `InitPrompter.choose` lower-cases its answer, so it can only ever select from a fixed lowercase vocabulary. Anything named by a third party (a jira-cli profile, a project key) needs `ask`.
- The scaffolded `.lore/config.toml` ships a commented-out `# [tracker.jira]` example, so a raw substring assertion for "nothing was written" is vacuous. Strip comments before asserting.
- `backlog init` is an interactive TUI that offers its own git init; `jira init` is interactive and credential-bearing. Lore drives only non-interactive initializers.
- A bare `backlog/` directory is not a Backlog project; `backlog/config.yml` is the marker, and `resolveTrackerSelection` now requires it — which changes resolution for `tracker-persistence.ts` and `adapters/tracker.ts` too, not only `lore init`.
- 2026-08-29, live: installed and published Quest is 0.2.9, and `quest init --name --task-id-prefix` still exits `usage` with "init accepts only --agent-instructions, --json, and --plain". quest-cli PR #167 IS merged, but it is a backlog-tracking commit, not the flag implementation — a merged PR is not a shipped contract.
- An empty directory tree is invisible to git and therefore to every diff-based review. `.codex/skills/backlog-handover/` and `.codex/skills/treehouse-worktrees/` held zero files and survived every review that way; only `ls` found them. Audit skill roots with a filesystem listing, never with `git status`.
- The two lore skill roots are GENERATED per runtime by `src/core/agent-bridge.ts` and `src/core/codex-bridge.ts`. CLAUDE.md citing `.claude/...` while AGENTS.md cites `.codex/...` is the product working, not drift.
- `gh pr checks --watch` prints "no checks reported on the '<branch>' branch" and EXITS while checks are still registering. Poll `gh pr view --json mergeStateStatus` until CLEAN, and never delete a branch before the merge reports MERGED — doing so closed PR #448.

## Decisions taken
- Quest version gating moved from a bounded allowlist to a minimum floor (product owner, 2026-08-28), reversing LCLI-353. Recorded in ADR-0020.
- CLAUDE.md's "Quest is not installable" rule retired against a live unauthenticated registry read (200, public, 0.2.9).
- `--allow-no-git` is the single documented exception to ADR-0017's any-flag rule, because it waives a preflight gate rather than answering a wizard question.
- Only a below-the-floor version rejection is fatal at selection time; every other probe failure stays advisory, preserving LORE-319.
- OPEN: LCLI-362 AC#2 asks AGENTS.md and CLAUDE.md to cite the same lore skill root. They must not — this repository generates one per runtime. The criterion needs amending or dropping by its owner; it was not reinterpreted.
