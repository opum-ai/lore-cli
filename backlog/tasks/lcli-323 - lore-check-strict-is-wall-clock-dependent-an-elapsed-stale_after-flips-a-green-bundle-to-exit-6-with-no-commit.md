---
id: LCLI-323
title: >-
  lore check --strict is wall-clock dependent: an elapsed stale_after flips a
  green bundle to exit 6 with no commit
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-13 03:46'
updated_date: '2026-08-13 17:28'
labels:
  - bug
  - check
  - determinism
  - okf
  - 'doc:stories/harden-post-0-2-lore-correctness'
dependencies: []
documentation:
  - docs/reference/lore-competitive-feature-matrix.md
  - docs/specs/lore-competitive-adoption-roadmap.md
  - docs/reference/cli-surface.md
  - docs/reference/cli-contract.md
  - docs/reference/okf-conformance.md
  - docs/stories/harden-post-0-2-lore-correctness.md
modified_files:
  - src/adapters/git.ts
  - src/commands/check.ts
  - src/core/check.ts
  - src/core/manifest.ts
  - src/cli.ts
  - test/git-adapter.test.ts
  - test/check.test.ts
  - test/help.test.ts
  - docs/reference/cli-surface.md
  - docs/reference/cli-contract.md
  - docs/reference/okf-conformance.md
  - docs/reference/lore-competitive-feature-matrix.md
  - docs/specs/lore-competitive-adoption-roadmap.md
  - docs/log.md
  - CHANGELOG.md
  - src/core/instructions.ts
  - docs/runbooks/agent-onboarding.md
  - docs/index.md
priority: high
type: bug
ordinal: 446000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `check` gate — the command whose purpose is to make bundle state reproducible — reads the system clock, so its exit code is not a function of the bundle contents alone.

`staleAfterFindings` in `src/core/check.ts` compares an OKF 0.2 concept's `stale_after` frontmatter date against today and emits a warning-tier `stale-after` finding once the date has elapsed. `--strict` promotes warnings to a failing exit code. The result is that an unchanged commit passes today and fails tomorrow.

This contradicts the guarantee stated in `lore instructions` and the CLI contract — that the same inputs against an unchanged bundle always produce the same output and exit code — and it does so inside the gate that guarantee is meant to protect. A consumer pinning a commit in CI can have a previously green build start failing with no change to the repository.

Reproduced empirically on 2026-08-13 with a negative control, running from source against a scratch OKF 0.2 bundle whose only unusual content was `stale_after: 2020-01-01`:

```
warning reference/stale-probe.md [stale-after]: content is stale:
  stale_after 2020-01-01 has elapsed as of 2026-08-13
2 files, 0 errors, 1 warning

lore check          -> exit 0
lore check --strict -> exit 6
```

Exposure timing matters and buys room to fix this properly: the published 0.1.1 binary does NOT reproduce it, because it does not implement OKF 0.2 staleness semantics and `lore init` there still writes an 0.1 bundle. The defect therefore reaches users with the next release rather than being live in the field today.

The rule itself is correct and worth keeping — OKF 0.2 defines `stale_after` as absolute-date lifecycle state and surfacing elapsed freshness is useful. What is wrong is the implicit input. The fix is to make the evaluation date an explicit, pinnable input rather than an ambient read of the clock. Prior art: claude-obsidian gates the same class of finding behind `lint --as-of YYYY-MM-DD` so a freshness-aware linter stays reproducible in CI.

Note this affects any future date-relative rule too, not just `stale_after` — OKF 0.2 `usage_window` and `verified` are the obvious next ones. Fixing the mechanism once is cheaper than fixing each rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every date-relative rule in check/validate resolves its evaluation date from one explicit input, never from an ambient system-clock read at the point of use
- [x] #2 An --as-of YYYY-MM-DD flag pins that date; an invalid or non-calendar value is a usage error (exit 2), not a silent fallback to today
- [x] #3 The default behaviour when --as-of is omitted is decided and documented explicitly (commit date, or refuse to evaluate staleness) rather than left as an implicit clock read
- [x] #4 A regression test proves the negative control: a fixture whose stale_after has elapsed fails under --strict without a pin, and passes with an --as-of date preceding it
- [x] #5 A second regression test proves the same bundle and the same --as-of value yield an identical exit code and identical finding output across runs
- [x] #6 cli-surface.md and cli-contract.md record --as-of and state plainly which rules are date-sensitive
- [x] #7 okf-conformance.md stale_after row is updated to describe the pinned-date evaluation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one validated evaluation-date input for `lore check`: accept `--as-of YYYY-MM-DD`, otherwise resolve the HEAD committer calendar date through the read-only Git adapter; invalid calendar dates are usage errors and an unavailable HEAD fails clearly without falling back to the wall clock.
2. Thread the resolved date through the command/core check boundary as `asOf`, remove the ambient clock seam, and keep validation date-shape-only because it has no elapsed-date rules.
3. Update the command manifest/router injection and add focused Git-adapter, command, CLI/help, negative-control, and repeatability tests proving explicit pins and the HEAD default.
4. Update the CLI surface/contract, OKF conformance, competitive feature matrix/roadmap, and changelog to describe the pinned date, the date-sensitive rule set, and the no-HEAD remedy.
5. Run formatting, focused tests, typecheck/lint/full tests, Lore dry-run/synchronization gates as authorization permits, strict Lore validation/check, diff hygiene, and adversarial self-review.

6. Update canonical agent instructions/onboarding and root navigation so their determinism claim names the same explicit `--as-of`/HEAD input contract.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the deterministic evaluation-date seam in the working tree:
- `lore check --as-of YYYY-MM-DD` validates a real calendar date and supplies that one value to every date-sensitive check rule.
- Without a pin, a bundle that actually contains a valid OKF 0.2 `stale_after` rule resolves the recorded committer date from one exact HEAD SHA; bundles with no date-sensitive rule do not require Git.
- `validate` remains date-shape-only because it has no elapsed-date rule. No ambient clock read remains in check/validate evaluation; the remaining Date construction only validates a supplied YYYY-MM-DD string.
- CLI manifest/help/router, canonical instructions, CLI/OKF contracts, competitive findings, onboarding, root navigation, and changelog now state the same explicit-input contract.

Verification:
- Focused tests: `bun test test/check.test.ts test/git-adapter.test.ts test/help.test.ts` — 346 passed, 0 failed.
- Full suite: `bun test` — 2,570 passed, 1 intentional skip, 0 failed across 79 files.
- `bun run typecheck`, `bun run lint`, `bun run build`, and `git diff --check` passed.
- `lore validate --strict --plain` — 69 files, 0 errors, 0 warnings, 6 skipped.
- Source `check --strict --as-of 2026-08-13 --plain` — 69 files, 0 errors, 0 warnings.
- `lore sync --dry-run --plain` passed and predicts exactly one generated update: `docs/log.md`.
- Adversarial self-review found and fixed a potential moving-HEAD race by resolving HEAD once and reading the date from that exact SHA. No independent reviewer was used because subagents were not authorized.

All seven acceptance criteria are proven in the current working tree. LCLI-323 remains In Progress: actual `lore sync` would auto-commit the dirty Backlog task/tracker files and no commit authority exists. Story ownership is also unresolved; existing candidate Stories are explicitly historical or narrower in scope, while creating a new active post-0.2 correctness Story is a material documentation-scope decision.

User authorized the recommended active Story and delivery workflow on 2026-08-13. Created docs/stories/harden-post-0-2-lore-correctness.md; Lore link created scoped Backlog commit 5de7c99, and Lore sync created tracker commit b65e49f, set the Story to in-progress, populated its managed task table, and regenerated Story index/log state. Post-sync verification on the exact delivery branch passed: bun test — 2,570 pass, 1 intentional skip, 0 fail; typecheck; lint — 196 files; build; strict Lore validation — 70 files, 0 errors, 0 warnings, 6 skipped; installed strict check, source default strict check, and explicit-pin source strict check at 2026-08-13 — each 70 files, 0 errors, 0 warnings; git diff check passed.

User authorized the recommended active Story and delivery workflow on 2026-08-13. Created ; LCLI-323: tasks: already-linked, back-ref: already-present
docs/stories/harden-post-0-2-lore-correctness.md: unchanged created scoped Backlog commit , and  created tracker commit , set the Story to , populated its managed task table, and regenerated Story index/log state. Post-sync verification on the exact delivery branch passed: bun test v1.3.14 (0d9b296a) — 2,570 pass, 1 intentional skip, 0 fail; ; Checked 196 files in 175ms. No fixes applied. — 196 files;   [30ms]  bundle  265 modules
 [225ms] compile  dist/lore; ok docs/adr/0001-runtime-build-distribution.md
ok docs/adr/0002-backlog-integration-json-only.md
ok docs/adr/0003-okf-substrate.md
ok docs/adr/0004-cli-first-skill-bridge-mcp-deferred.md
ok docs/adr/0005-cli-contract.md
ok docs/adr/0006-schema-types-templates.md
ok docs/adr/0007-validation-and-coherence.md
ok docs/adr/0008-managed-block-remark-ast.md
ok docs/adr/0009-story-task-coupling-reconciliation.md
ok docs/adr/0010-multi-consumer-docs-layer.md
ok docs/adr/0011-frontmatter-serialization-stability.md
ok docs/adr/0012-backlog-coexistence-git-ownership.md
ok docs/adr/0013-lore-state-directory.md
ok docs/adr/0014-core-has-no-llm-dependency.md
ok docs/adr/0015-lightweight-retrieval-no-vectors.md
ok docs/adr/0016-confluence-one-way-publish-deferred.md
ok docs/adr/0017-interactive-init-wizard-tty-gated.md
ok docs/adr/0018-persistent-local-graph-projection-with-ladybugdb.md
ok docs/adr/0019-separate-okf-lifecycle-from-lore-task-progress.md
skip docs/adr/index.md (not a concept)
ok docs/index.md
skip docs/log.md (not a concept)
ok docs/reference/architecture.md
ok docs/reference/backlog-cli-contract.md
ok docs/reference/backlog-json-schema.md
ok docs/reference/claude-obsidian-teardown.md
ok docs/reference/cli-contract.md
ok docs/reference/cli-surface.md
ok docs/reference/competitive-landscape-agent-native-knowledge-tooling.md
ok docs/reference/consumer-compatibility.md
ok docs/reference/dependency-boundary-audit.md
ok docs/reference/historical-dependency-boundary-campaign.md
ok docs/reference/historical-lore-cli-development-kickoff.md
ok docs/reference/historical-upstream-backlog-json-tag-watch.md
skip docs/reference/index.md (not a concept)
ok docs/reference/ladybugdb-benchmark-and-scale-acceptance-strategy.md
ok docs/reference/lore-cli-documentation-ownership.md
ok docs/reference/lore-cli-release-truth.md
ok docs/reference/lore-competitive-feature-matrix.md
ok docs/reference/mcp-tools.md
ok docs/reference/okf-conformance.md
ok docs/reference/okf-projection-contract.md
ok docs/reference/portable-markdown.md
ok docs/reference/tech-stack.md
ok docs/runbooks/agent-onboarding.md
ok docs/runbooks/agent-profile-operation.md
ok docs/runbooks/backlog-json-patch.md
ok docs/runbooks/docker-e2e-testing-environment.md
skip docs/runbooks/index.md (not a concept)
ok docs/runbooks/lore-cli-handover.md
ok docs/runbooks/release-publishing.md
ok docs/specs/agent-profile-context-retrieval.md
ok docs/specs/bounded-path-and-impact.md
ok docs/specs/graph-explorer-data-and-interaction-contract.md
skip docs/specs/index.md (not a concept)
ok docs/specs/local-graph-platform-roadmap.md
ok docs/specs/local-workspace-identity-contract.md
ok docs/specs/lore-competitive-adoption-roadmap.md
ok docs/specs/lore-design.md
ok docs/specs/snapshot-change-and-provenance-workflows.md
ok docs/specs/workspace-indexing-and-retrieval.md
ok docs/stories/build-the-lore-cli-foundation.md
ok docs/stories/build-the-persistent-local-graph-platform.md
ok docs/stories/harden-lore-cli-correctness-and-safety.md
ok docs/stories/harden-post-0-2-lore-correctness.md
ok docs/stories/hold-deferred-lore-capabilities.md
skip docs/stories/index.md (not a concept)
ok docs/stories/maintain-lore-cli-documentation-authority.md
ok docs/stories/prepare-the-first-lore-cli-release.md
ok docs/stories/retrieve-task-scoped-context-with-agent-profiles.md
70 files, 0 errors, 0 warnings, 6 skipped — 70 files, 0 errors, 0 warnings, 6 skipped; installed 70 files, 0 errors, 0 warnings, source default 70 files, 0 errors, 0 warnings, and explicit-pin source check with  — each 70 files, 0 errors, 0 warnings;  passed.

Delivery PR #364 is open against dev from fix/lcli-323-deterministic-check at source head 419cbfe. All eight required CI jobs passed: Ubuntu and Windows lint/typecheck/test, compile smoke, MkDocs and Docusaurus scaffolds, browser qualification, Ladybug benchmark smoke, and the real-binary Docker E2E harness. The task remains In Progress because merge authority was not granted and the PR is not yet integrated.
<!-- SECTION:NOTES:END -->
