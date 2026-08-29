---
id: doc-26
title: Backlog campaign tracker — LCLI-358 lore init onboarding rebuild
type: other
created_date: '2026-08-28 23:59'
updated_date: '2026-08-29 00:02'
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
- Resolved: 3 (LCLI-358.1, .2, .3). In flight: 1 (LCLI-356, AC#1–4 done, AC#5 delegated). Blocked: 1 (LCLI-358.6). Ready: 2 (LCLI-358.4, .5).
- Parent LCLI-358 stays To Do until every subtask settles.
- Excluded: LCLI-357 (another session's untracked task file, preserved, never staged).

## Queue
| Order | Task | Dependencies | State | Likely paths |
| 1 | LCLI-358.4 | none | ready | src/commands/init.ts, src/adapters/jira.ts, src/config.ts, tests |
| 2 | LCLI-358.5 | none | ready | src/tracker-selection.ts, src/commands/init.ts, tests |
| 3 | LCLI-358.6 | quest-cli QCLI-136 (unreleased) | blocked | src/commands/init.ts, src/adapters/quest.ts |
| 4 | LCLI-358 | .1–.6 | settlement candidate | backlog only |
| 5 | LCLI-356 | opum-cli-e2e AC#5 receipt | in flight | none in this repository |
| — | LCLI-359, LCLI-361 | release/decision boundaries | deferred | see each task |
| — | LCLI-360 | a host with docker | deferred | docker/e2e |
| — | LCLI-362 | none | ready, out of campaign scope | .claude/skills, AGENTS.md, CLAUDE.md |

## Delivered
- LCLI-358.1 (1c47677, then review fixes 92fc107): git preflight before the first write; `--allow-no-git`; scaffold moved after every prompt.
- LCLI-358.2 (0b3e1ae): the capability probe follows the selected tracker; `trackerCheck` added, `backlog` deprecated; `--check-tracker`/`--no-tracker`.
- LCLI-356 (2e5a002): Quest version gate is a minimum floor, evaluated at tracker-selection time; ADR-0020.
- LCLI-358.3 (d080b93): tracker binary and repository detection before the choice; bounded install offer; `--install-tracker`/`--no-install-tracker`.

## Evidence and gates
- Every commit on this branch was verified with `bun test` (2718 pass / 0 fail / 1 skip at d080b93), `bun run lint`, `bun run typecheck`, and `lore check` — all exit 0, taken without a pipe.
- Wizard behavior confirmed live under a pty with `expect(1)`, not only through injected seams.
- NOT verified: docker/e2e. `docker info` exits 1 on this host, so the seven cases added across LCLI-358.1/.2/.3 and LCLI-356 have never executed in the harness. Tracked as LCLI-360.

## Durable findings
- `Bun.spawnSync` snapshots the environment at process start: a `process.env` mutation is invisible to the child, so git's `GIT_TEST_ASSUME_DIFFERENT_OWNER` hook cannot be reached from inside a test process.
- `git rev-parse --is-inside-work-tree` exits 128 both for "no repository" and for a valid worktree git refuses (dubious ownership). Only stderr distinguishes them.
- `quest init` requires a git worktree and, at 0.2.9, accepts only `--agent-instructions`, `--json`, `--plain`.
- `jira-cli` emits JSON by default; `jira config list-profiles` returns `data.profiles[]` with `name`, `jiraUrl`, `isDefault`.
- `backlog init` is an interactive TUI that offers its own git init; `jira init` is interactive and credential-bearing. Lore drives only non-interactive initializers.
- A newly created bundle pins `quest` even over an existing `backlog/` directory (init.ts's "a newly created bundle is unambiguous" rule). Whether that is right is LCLI-358.5's question.

## Decisions taken
- Quest version gating moved from a bounded allowlist to a minimum floor (product owner, 2026-08-28), reversing LCLI-353. Recorded in ADR-0020.
- CLAUDE.md's "Quest is not installable" rule retired against a live unauthenticated registry read (200, public, 0.2.9).
- `--allow-no-git` is the single documented exception to ADR-0017's any-flag rule, because it waives a preflight gate rather than answering a wizard question.
- Only a below-the-floor version rejection is fatal at selection time; every other probe failure stays advisory, preserving LORE-319.
