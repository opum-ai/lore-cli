---
id: doc-11
title: Backlog campaign tracker — post-0.1.0 E2E defect remediation (round 9)
type: other
created_date: '2026-08-04 12:54'
updated_date: '2026-08-04 15:58'
---
# Backlog campaign tracker — post-0.1.0 E2E defect remediation (round 9)

## Scope and order confirmation
- Scope: Remediate the six post-0.1.0 defects filed from comprehensive real-binary E2E findings: LCLI-302 through LCLI-307.
- Confirmed by the user: "approved, proceed" on 2026-08-04.
- Confirmed order: LCLI-302 → LCLI-303 → LCLI-305 → LCLI-304 → LCLI-306 → LCLI-307.
- Order is a tie-break; readiness is recomputed live.
- Execution model: sequential single-task waves. The user confirmed scope and order but did not authorize subagents or parallel work, and the queue contains conservative file and behavior conflicts.

## Frontier
Informational snapshot only; never a promised next wave.

- Ready now: LCLI-303, LCLI-305, LCLI-304, LCLI-306, and LCLI-307 are To Do with no formal dependencies; repository cleanliness and final branch cleanup must be confirmed before any later dispatch.
- In flight: none.
- Resolved in this campaign: LCLI-302.
- Safest next candidate after a fresh restore: LCLI-303 by confirmed order, subject to live git, task, tool, and conflict checks. No later wave is promised.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-302 | Ladybug native packaging / release | none | Done | 1 + delivery repair | Release/retrieval files plus `.github/workflows/ci.yml`, `test/ci-workflow.test.ts`, `test/ladybug-concurrency.test.ts`, and `test/workspace-retrieval.test.ts` | Source commits `973075a9a3544458c2d24d91ea1d15aa5f5bd935` and `1c75c8fec8ab1536d135509a9fea4430eb2bc500` passed local and protected CI evidence. PR #303 merged to `dev` as `463305e05382057977103f6918e960c3df4423ef`. |
| 2 | LCLI-303 | Workspace validation / graph runtime | none | Ready | — | `src/core/workspace-projection.ts`; graph command/runtime seams; `test/workspace-retrieval.test.ts`; `test/cli.test.ts` | Must return validation exit 6 whether native Ladybug is active or falling back. Revalidate overlap against the delivered retrieval changes before dispatch. |
| 3 | LCLI-305 | Sync / managed task block drift | none | Ready | — | `src/commands/sync.ts`; `src/core/check.ts`; `src/core/managed-block.ts`; `test/sync.test.ts`; `test/check.test.ts` | Focused 1+ → 0 Story task transition. Establish the narrow managed-block invariant before the broader link repair. |
| 4 | LCLI-304 | Link / unlink / schema capability | none | Ready | — | `src/commands/link.ts`; `src/commands/sync.ts`; `src/core/check.ts`; schema and managed-block seams; `test/link.test.ts`; `test/sync.test.ts`; `test/check.test.ts` | Broader task-coupling validation and reversibility. Conflicts with LCLI-305 and LCLI-306 around sync/check behavior. |
| 5 | LCLI-306 | New / strict validation parity | none | Ready | — | `src/core/check.ts`; `src/core/schema.ts`; `src/core/template.ts`; new/check command seams; `test/check.test.ts`; `test/template.test.ts` | Low-priority CI-gate parity defect; serialize with the shared check cluster. |
| 6 | LCLI-307 | Consumer scaffolding / Obsidian | none | Ready | — | `src/commands/scaffold.ts`; `src/core/consumer-scaffold.ts`; `test/scaffold.test.ts`; `test/consumer-scaffold.test.ts` | Mostly isolated, but retained in the confirmed sequential campaign model. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-302 | 2026-08-04 / wave 1 + delivery repair | Real macOS ARM64 package qualification passed compile, pack, install, forced-indexed launcher/standalone execution, generation creation, and cleanup. Local verification passed 2,436 tests, typecheck, lint, actionlint, and diff hygiene. PR #303 head `1c75c8fec8ab1536d135509a9fea4430eb2bc500` passed all eight GitHub jobs in run 30926258495, including Ubuntu, Windows, and Docker E2E, then merged to `dev` as `463305e05382057977103f6918e960c3df4423ef`. Task criteria remain checked and status is Done. |

## Not queued — blocked, deferred, or human decision required
- LCLI-278: requires a material repository-owner decision about billing, visibility, security controls, and remote Environment configuration.
- LCLI-42: on hold and unscheduled. Its formal dependencies are Done, but explicit reactivation is required.
- LCLI-43: deferred. Its dependency LCLI-28 is Done, but no reactivation decision exists.
- LCLI-44: deferred and formally blocked by non-terminal LCLI-43.
- LCLI-45: deferred despite completed dependency LCLI-9. Its notes require a concrete in-process import need before reactivation.

## Wave log
- 2026-08-04 — init: inventoried every live non-terminal task, verified predecessor states, confirmed the six-task sequential queue with the user, grounded clean `dev` at `405606891a227a9012b87de625d909eba56fec6b` with one worktree and 22 commits ahead of locally known `origin/dev`, and created doc-11. No task was dispatched and no source or remote mutation occurred.
- 2026-08-04 — wave 1 dispatch: restore found the handover, tracker, branch, HEAD, worktree count, live task states, formal dependencies, and exclusion list consistent. The only dirty path was the untracked doc-11 tracker, which did not overlap LCLI-302. Dispatched LCLI-302 sequentially; no later wave was promised.
- 2026-08-04 — wave 1 verification hold: root-caused the qualification/publication byte mismatch, implemented exact qualified-tarball lineage plus sanitized fallback advisories, and passed a real macOS ARM64 compile/pack/global-install/project-install/forced-indexed/standalone/uninstall qualification, 2,434 tests, typecheck, lint, actionlint, and diff hygiene. Adversarial self-review caught and fixed a sha256-prefix mismatch. Concurrent unrelated LCLI-308 work advanced `dev` to `bb33bd38a9fec3b582944209ee240d5853dbce76` without overlapping the eight implementation files. LCLI-302 remained In Progress pending local delivery authority.
- 2026-08-04 — wave 1 settlement: the user authorized local delivery; proportionate final checks passed; source commit `973075a9a3544458c2d24d91ea1d15aa5f5bd935` delivered the exact eight-file implementation. All four acceptance criteria were checked, LCLI-302 moved to Done with its final summary, and the five remaining queue items were revalidated as To Do with no formal dependencies. No push, PR, merge, publication, or other remote mutation occurred.
- 2026-08-04 — wave 1 delivery repair: direct push to protected `dev` was rejected because required checks must run on a PR, so the verified 37-commit set was published to `release/post-0.1.0-campaign-sync` and PR #303 opened. Ubuntu CI exposed a Bun 1.3.14 parallel isolated-runner `epoll_ctl` race plus fallback-advisory parity assertions; Windows exposed an unsupported-platform versus failed-native assertion mismatch. LCLI-302 was reopened without bypassing checks. The focused repair serializes only Ubuntu test files, preserves macOS concurrency, and makes advisory assertions platform-aware while retaining stdout parity and redaction. Focused 18/18 and full serialized 2,436/2,436 tests, typecheck, lint, actionlint, and diff hygiene pass locally; protected rerun remains required.
- 2026-08-04 — wave 1 protected delivery settlement: repair commit `1c75c8fec8ab1536d135509a9fea4430eb2bc500` passed all eight PR #303 checks in run 30926258495: Ubuntu and Windows test matrices, Ladybug benchmark smoke, compile smoke, explorer browser qualification, MkDocs, Docusaurus, and Docker E2E. GitHub merged the exact head to protected `dev` as `463305e05382057977103f6918e960c3df4423ef`. LCLI-302 returned to Done with the CI and merge evidence; no later campaign task was dispatched.
