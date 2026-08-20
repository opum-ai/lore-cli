---
id: doc-25
title: Backlog campaign — Wave A post-0.3.2 correctness and interoperability
type: other
created_date: '2026-08-19 03:26'
updated_date: '2026-08-19 03:27'
---
# Backlog campaign — Wave A post-0.3.2 correctness and interoperability

## Contract
- Mode: autonomous-docs
- Session role: worker
- FMC identity: lore-cli
- FMC controller: opum-doc
- Scope and queue rule: Work only in /Volumes/external/repos/lore-cli for accepted FMC correlation b74093bbc36f4a87ba07161d3991e9e4. Burn down ready LCLI-339, LCLI-340, LCLI-343, and LCLI-344; settle LCLI-315 only if its subtasks prove Done. Prepare LCLI-333 package qualification evidence only; do not publish.
- Delivery: configured origin/dev only. No main promotion, new remote, force-push, credentials, repository administration, or unproved destructive cleanup.

## Repositories and routing
| Repository | Task ids | Mutation owner/FMC identity | AGENTS authority | Integration branch and pinned base | Required gates |
| lore-cli | LCLI-339, LCLI-340, LCLI-343, LCLI-344, LCLI-315, LCLI-333 | lore-cli | AGENTS.md FMC Worker contract | dev @ 86ed3734e06def5d3b04471e864f610c52f6def2 | focused tests, full gates, lore validate/check strict, review |

## Frontier
- Ready implementation tasks: 4; parent settlement candidate: 1; deferred qualification task: 1.
- Excluded: LCLI-278 (external billing/repository-admin); LCLI-42 through LCLI-45 (deferred/on hold).

## Queue
| Order | Task | Repository/owner | Dependencies | State | Wave | Likely paths |
| 1 | LCLI-339 | lore-cli / lore-cli | none | ready | A | src/output.ts, src/errors.ts, tests |
| 2 | LCLI-340 | lore-cli / lore-cli | none | ready | A | src/core/manifest.ts, commands, tests |
| 3 | LCLI-343 | lore-cli / lore-cli | LCLI-315 foundation evidence | ready pending inspection | A | tracker selection, init, config, tests |
| 4 | LCLI-344 | lore-cli / lore-cli | none | ready | A | agent bridge, init, tests |
| 5 | LCLI-315 | lore-cli / lore-cli | all subtasks Done | conditional settlement | post-A | Backlog only |
| 6 | LCLI-333 | lore-cli / lore-cli | LCLI-315.4, LCLI-332, public Quest | qualification only | post-A | release evidence |

## FMC coordination
| Message/approval id | Sender | Recipient | Status | Next action |
| b74093bbc36f4a87ba07161d3991e9e4 | opum-doc | lore-cli | accepted | execute Wave A and reply with evidence |

## Worktrees and retained artifacts
| Repository/path/ref | Owner | Lease/status | Disposition | Cleanup condition |
| lore-cli/.treehouse/.treehouse/lore-cli-f70589/1/lore-cli @ 0af87e32f18ee54e44790de60ea2e7dea582a5de | prior owner | unleased/retained | preserve, unrelated detached tree | only owner with disposition proof |
| Wave A allocations | lore-cli | pending | allocate from dev pinned base | returned only after integration/patch-equivalence proof |

## Resolved
| Task | Wave | Disposition | Evidence pointer |
| none | none | none | campaign initialized |

## Human decisions and blockers
- LCLI-278 remains excluded pending external billing/repository-admin decision.
- LCLI-333 publication is deferred: requires verified public Quest version and a later exact Controller release gate.

## Wave log
- Initialized from clean dev at 86ed3734e06def5d3b04471e864f610c52f6def2 after Backlog, Git, and Treehouse audit.
