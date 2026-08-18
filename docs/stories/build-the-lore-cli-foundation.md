---
type: Story
title: Build the Lore CLI foundation
tags:
  - foundation
  - cli
  - history
summary: Deliver the deterministic CLI, documentation model, Backlog coupling, retrieval, and consumer foundations.
timestamp: 2026-08-03T16:05:06.468Z
status: done
tasks:
  - lcli-1
  - lcli-2
  - lcli-6
  - lcli-7
  - lcli-8
  - lcli-10
  - lcli-11
  - lcli-12
  - lcli-15
  - lcli-16
  - lcli-17
  - lcli-18
  - lcli-19
  - lcli-21
  - lcli-22
  - lcli-23
  - lcli-24
  - lcli-26
  - lcli-27
  - lcli-28
  - lcli-30
  - lcli-36
  - lcli-46
  - lcli-3
  - lcli-4
  - lcli-5
  - lcli-9
  - lcli-13
  - lcli-20
  - lcli-25
  - lcli-29
  - lcli-31
  - lcli-32
  - lcli-33
  - lcli-34
  - lcli-35
  - lcli-37
  - lcli-38
  - lcli-39
  - lcli-40
  - lcli-47
  - lcli-49
  - lcli-53
  - lcli-54
  - lcli-55.1
  - lcli-55.2
  - lcli-55.5
  - lcli-14
  - lcli-41
  - lcli-50
  - lcli-51
  - lcli-52
  - lcli-55.3
  - lcli-55.4
  - lcli-55.6
  - lcli-55.7
  - lcli-55.8
  - lcli-55.9
  - lcli-55.10
  - lcli-55.11
  - lcli-60
  - lcli-35.1
  - lcli-35.2
  - lcli-35.3
  - lcli-48
  - lcli-55
  - lcli-56
  - lcli-57
  - lcli-58
  - lcli-59
  - lcli-304
  - lcli-305
  - lcli-306
  - lcli-307
  - lcli-314
  - lcli-316
  - lcli-319
  - lcli-326
---

# Build the Lore CLI foundation

## Goal

Provide the deterministic, CLI-first foundation for an OKF documentation
bundle: typed concepts, portable links, Backlog coupling, reconciliation,
retrieval, agent bridges, and consumer scaffolds. This Story owns the original
M0–M6 delivery record and its immediate completion fixes; it does not claim
that the package has been published.

## Acceptance criteria

- The command and output contracts remain deterministic, non-interactive, and
  machine-readable.
- Typed documentation, portable links, Backlog coupling, sync, validation,
  checking, retrieval, and consumer scaffolds remain connected as one CLI.
- Historical foundation tasks retain their completed lifecycle evidence.
- Release availability is derived from the separate release Story and truth
  record, never from implemented mechanics alone.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-1](../../backlog/tasks/lcli-1%20-%20Fork-Backlog.md-and-create-the-json-tracking-task.md) | Fork Backlog.md and create the --json tracking task | Done |
| [LCLI-2](../../backlog/tasks/lcli-2%20-%20Implement-shared-task-json-serializer-and-json-on-read-commands.md) | Implement shared task-json serializer and --json on read commands | Done |
| [LCLI-6](../../backlog/tasks/lcli-6%20-%20Scaffold-package.json-tsconfig-and-pinned-Bun-toolchain.md) | Scaffold package.json, tsconfig, and pinned Bun toolchain | Done |
| [LCLI-7](../../backlog/tasks/lcli-7%20-%20Set-up-lint-format-and-Bun-test-harness-with-coverage.md) | Set up lint, format, and Bun test harness with coverage | Done |
| [LCLI-8](../../backlog/tasks/lcli-8%20-%20GitHub-Actions-CI-lint-typecheck-test-build.md) | GitHub Actions CI: lint, typecheck, test, build | Done |
| [LCLI-10](../../backlog/tasks/lcli-10%20-%20Implement-.lore-config-loader-native-TOML-env-overlay.md) | Implement .lore config loader (native TOML + env overlay) | Done |
| [LCLI-11](../../backlog/tasks/lcli-11%20-%20Shared-error-model-exit-codes-and-warning-collector.md) | Shared error model, exit codes, and warning collector | Done |
| [LCLI-12](../../backlog/tasks/lcli-12%20-%20Output-layer-plain-json-and-pretty-modes.md) | Output layer: --plain, --json, and pretty modes | Done |
| [LCLI-15](../../backlog/tasks/lcli-15%20-%20concept.ts-frontmatter-parse-serialize-Zod-per-type-schemas.md) | concept.ts: frontmatter parse/serialize + Zod per-type schemas | Done |
| [LCLI-16](../../backlog/tasks/lcli-16%20-%20bundle.ts-walk-docs-and-build-the-model-cross-link-graph.md) | bundle.ts: walk docs/ and build the model + cross-link graph | Done |
| [LCLI-17](../../backlog/tasks/lcli-17%20-%20lore-init.md) | lore init | Done |
| [LCLI-18](../../backlog/tasks/lcli-18%20-%20lore-new-with-templates.md) | lore new with templates | Done |
| [LCLI-19](../../backlog/tasks/lcli-19%20-%20lore-validate-tiered-per-type-validation.md) | lore validate: tiered per-type validation | Done |
| [LCLI-21](../../backlog/tasks/lcli-21%20-%20backlog.ts-adapter-JSON-only-read-CLI-writes.md) | backlog.ts adapter: JSON-only read + CLI writes | Done |
| [LCLI-22](../../backlog/tasks/lcli-22%20-%20managed-block.ts-remark-mdast-task-block.md) | managed-block.ts: remark/mdast task block | Done |
| [LCLI-23](../../backlog/tasks/lcli-23%20-%20reconcile.ts-status-rollup.md) | reconcile.ts: status rollup | Done |
| [LCLI-24](../../backlog/tasks/lcli-24%20-%20lore-link-unlink.md) | lore link / unlink | Done |
| [LCLI-26](../../backlog/tasks/lcli-26%20-%20lore-sync.md) | lore sync | Done |
| [LCLI-27](../../backlog/tasks/lcli-27%20-%20lore-check-drift-gate.md) | lore check (drift gate) | Done |
| [LCLI-28](../../backlog/tasks/lcli-28%20-%20links.ts-portable-cross-link-resolution-and-rewriting.md) | links.ts: portable cross-link resolution and rewriting | Done |
| [LCLI-30](../../backlog/tasks/lcli-30%20-%20lore-check-link-anchor-portability-lint.md) | lore check: link/anchor + portability lint | Done |
| [LCLI-36](../../backlog/tasks/lcli-36%20-%20lore-agents-SKILL.md-CLAUDE.md-nudge.md) | lore agents: SKILL.md + CLAUDE.md nudge | Done |
| [LCLI-46](../../backlog/tasks/lcli-46%20-%20Declarative-.lore-profile-per-project-type-vocabulary-schemas-templates.md) | Declarative .lore profile: per-project type vocabulary, schemas & templates | Done |
| [LCLI-3](../../backlog/tasks/lcli-3%20-%20Add-json-tests-and-help-schema-docs-to-the-fork.md) | Add --json tests and help-schema docs to the fork | Done |
| [LCLI-4](../../backlog/tasks/lcli-4%20-%20Build-the-patched-binary-and-wire-lore-capability-probe.md) | Build the patched binary and wire lore capability probe | Done |
| [LCLI-5](../../backlog/tasks/lcli-5%20-%20Open-the-upstream-json-PR-and-migrate-lore-on-release.md) | Open the upstream --json PR and migrate lore on release | Done |
| [LCLI-9](../../backlog/tasks/lcli-9%20-%20Release-pipeline-compiled-binaries-dual-artifact-npm-publish.md) | Release pipeline: compiled binaries + dual-artifact npm publish | Done |
| [LCLI-13](../../backlog/tasks/lcli-13%20-%20Test-fixtures-and-golden-outputs.md) | Test fixtures and golden outputs | Done |
| [LCLI-20](../../backlog/tasks/lcli-20%20-%20lore-schema-export-Zod-to-JSON-Schema-modeline.md) | lore schema export (Zod to JSON Schema + modeline) | Done |
| [LCLI-25](../../backlog/tasks/lcli-25%20-%20lore-tasks.md) | lore tasks | Done |
| [LCLI-29](../../backlog/tasks/lcli-29%20-%20index.md-and-log.md-generation.md) | index.md and log.md generation | Done |
| [LCLI-31](../../backlog/tasks/lcli-31%20-%20lore-graph.md) | lore graph | Done |
| [LCLI-32](../../backlog/tasks/lcli-32%20-%20lore-orphans.md) | lore orphans | Done |
| [LCLI-33](../../backlog/tasks/lcli-33%20-%20lore-query-full-text-frontmatter-filters.md) | lore query (full-text + frontmatter filters) | Done |
| [LCLI-34](../../backlog/tasks/lcli-34%20-%20lore-context-token-budgeted-graph-expansion.md) | lore context (token-budgeted graph expansion) | Done |
| [LCLI-35](../../backlog/tasks/lcli-35%20-%20lore-replace-rename-supersede.md) | lore replace / rename / supersede | Done |
| [LCLI-37](../../backlog/tasks/lcli-37%20-%20lore-instructions-layered-agent-guides.md) | lore instructions (layered agent guides) | Done |
| [LCLI-38](../../backlog/tasks/lcli-38%20-%20lore-help-json-capability-manifest.md) | lore help --json capability manifest | Done |
| [LCLI-39](../../backlog/tasks/lcli-39%20-%20lore-scaffold-mkdocs.md) | lore scaffold mkdocs | Done |
| [LCLI-40](../../backlog/tasks/lcli-40%20-%20lore-scaffold-docusaurus-build-smoke-test.md) | lore scaffold docusaurus + build smoke test | Done |
| [LCLI-47](../../backlog/tasks/lcli-47%20-%20GitAdapter-seam-git-history-log.md-resource_base-stamping.md) | GitAdapter seam: git-history log.md + resource_base stamping | Done |
| [LCLI-49](../../backlog/tasks/lcli-49%20-%20retrofit-link-unlink-rename-to-commit-backlog-via-state.ts.md) | retrofit link/unlink/rename to commit backlog/ via state.ts | Done |
| [LCLI-53](../../backlog/tasks/lcli-53%20-%20Pin-lores-Backlog.md-dependency-to-upstreams-json-commit-interim.md) | Pin lore's Backlog.md dependency to upstream's --json commit (interim) | Done |
| [LCLI-54](../../backlog/tasks/lcli-54%20-%20Rewrite-src-adapters-backlog.ts-against-upstreams-real-json-contract.md) | Rewrite src/adapters/backlog.ts against upstream's real --json contract | Done |
| [LCLI-55.1](../../backlog/tasks/lcli-55.1%20-%20obsidian-scaffold-rollback-leaves-docs-behind-on-a-never-initialized-repo.md) | obsidian scaffold: rollback leaves docs/ behind on a never-initialized repo | Done |
| [LCLI-55.2](../../backlog/tasks/lcli-55.2%20-%20obsidian-scaffold-published-CLI-docs-cli-surface.md-cli-contract.md-still-say-it-is-pending.md) | obsidian scaffold: published CLI docs (cli-surface.md / cli-contract.md) still say it is pending | Done |
| [LCLI-55.5](../../backlog/tasks/lcli-55.5%20-%20obsidian-scaffold-OBSIDIAN_GUIDANCE_NOTES-is-a-shared-mutable-array-not-copied-per-plan.md) | obsidian scaffold: OBSIDIAN_GUIDANCE_NOTES is a shared mutable array, not copied per plan | Done |
| [LCLI-14](../../backlog/tasks/lcli-14%20-%20Bun-compile-compatibility-spike.md) | Bun compile compatibility spike | Done |
| [LCLI-41](../../backlog/tasks/lcli-41%20-%20lore-scaffold-obsidian.md) | lore scaffold obsidian | Done |
| [LCLI-50](../../backlog/tasks/lcli-50%20-%20dedupe-multi-root-check-reconciliation-shared-task-ids-config-validation-across-bundle-roots.md) | dedupe multi-root check reconciliation: shared task ids + config validation across bundle roots | Done |
| [LCLI-51](../../backlog/tasks/lcli-51%20-%20Dedup-task-summary-row-type-aligned-row-renderer-across-tasks-orphans.md) | Dedup task-summary row type + aligned-row renderer across tasks/orphans | Done |
| [LCLI-52](../../backlog/tasks/lcli-52%20-%20Reconcile-stale-remark-unified-doc-references-across-ADRs-and-specs.md) | Reconcile stale remark/unified doc references across ADRs and specs | Done |
| [LCLI-55.3](../../backlog/tasks/lcli-55.3%20-%20obsidian-scaffold-never-silent-clobber-preflight-cannot-detect-a-conflict-on-docs-itself.md) | obsidian scaffold: never-silent-clobber preflight cannot detect a conflict on docs/ itself | Done |
| [LCLI-55.4](../../backlog/tasks/lcli-55.4%20-%20consumer-scaffold.ts-module-docstring-docs-is-never-mutated-invariant-is-now-false.md) | consumer-scaffold.ts module docstring: "docs/ is never mutated" invariant is now false | Done |
| [LCLI-55.6](../../backlog/tasks/lcli-55.6%20-%20obsidian-scaffold-stale-JSDoc-still-names-the-old-enumerated-.gitignore-patterns.md) | obsidian scaffold: stale JSDoc still names the old enumerated .gitignore patterns | Done |
| [LCLI-55.7](../../backlog/tasks/lcli-55.7%20-%20consumer-scaffold.test.ts-mkdocs-docusaurus-notes-test-never-actually-exercises-docusaurus.md) | consumer-scaffold.test.ts: "mkdocs/docusaurus" notes test never actually exercises docusaurus | Done |
| [LCLI-55.8](../../backlog/tasks/lcli-55.8%20-%20consumer-scaffold.test.ts-obsidian-rendering-tests-ordering-claim-is-not-actually-verified.md) | consumer-scaffold.test.ts: obsidian rendering test's ordering claim is not actually verified | Done |
| [LCLI-55.9](../../backlog/tasks/lcli-55.9%20-%20scaffold.ts-KNOWN_TARGETS-IMPLEMENTED_TARGETS-are-now-identical-sets-leaving-a-dead-untested-branch.md) | scaffold.ts: KNOWN_TARGETS/IMPLEMENTED_TARGETS are now identical sets, leaving a dead, untested branch | Done |
| [LCLI-55.10](../../backlog/tasks/lcli-55.10%20-%20consumer-scaffold.ts-ConsumerScaffoldOptions-doc-comment-omits-obsidian-as-a-consumer.md) | consumer-scaffold.ts: ConsumerScaffoldOptions doc comment omits obsidian as a consumer | Done |
| [LCLI-55.11](../../backlog/tasks/lcli-55.11%20-%20scaffold.ts-module-docstrings-opening-line-still-names-only-two-of-the-three-builders.md) | scaffold.ts: module docstring's opening line still names only two of the three builders | Done |
| [LCLI-60](../../backlog/tasks/lcli-60%20-%20ADR-0002-overstates-the-capability-probe-exit-code-says-missing-too-old-incapable-backlog-all-map-to-exit-6-but-a-missing-binary-is-really-exit-3.md) | ADR-0002 overstates the capability-probe exit code: says missing/too-old/incapable backlog all map to exit 6, but a missing binary is really exit 3 | Done |
| [LCLI-35.1](../../backlog/tasks/lcli-35.1%20-%20lore-replace-managed-region-safe-find-replace.md) | lore replace (managed-region-safe find/replace) | Done |
| [LCLI-35.2](../../backlog/tasks/lcli-35.2%20-%20lore-rename-graph-aware-inbound-link-ref-rewrite.md) | lore rename (graph-aware inbound link/ref rewrite) | Done |
| [LCLI-35.3](../../backlog/tasks/lcli-35.3%20-%20lore-supersede-frontmatter-wiring-inbound-rewrite.md) | lore supersede (frontmatter wiring + inbound rewrite) | Done |
| [LCLI-48](../../backlog/tasks/lcli-48%20-%20lore-check-follow-ups-external-liveness-MDX-filename-portability-rules.md) | lore check follow-ups: --external liveness, MDX/filename portability rules | Done |
| [LCLI-55](../../backlog/tasks/lcli-55%20-%20Fix-LORE-41-PR-50-code-review-findings.md) | Fix LCLI-41 / PR #50 code-review findings | Done |
| [LCLI-56](../../backlog/tasks/lcli-56%20-%20Docker-E2E-test-harness-lore-dev-build-pinned-upstream-Backlog.md.md) | Docker E2E test harness: lore dev build + pinned upstream Backlog.md | Done |
| [LCLI-57](../../backlog/tasks/lcli-57%20-%20editTask-sends-json-to-backlog-task-edit-which-doesnt-support-it-%E2%80%94-breaks-link-unlink-rename-back-ref-writes.md) | editTask sends --json to backlog task edit, which doesn't support it — breaks link/unlink/rename back-ref writes | Done |
| [LCLI-58](../../backlog/tasks/lcli-58%20-%20%60lore-link%60-%60unlink%60-json-emits-a-full-success-shaped-envelope-on-stdout-even-when-exiting-nonzero-violating-the-stdout-stderr-contract.md) | `lore link`/`unlink` --json emits a full success-shaped envelope on stdout even when exiting nonzero, violating the stdout/stderr contract | Done |
| [LCLI-59](../../backlog/tasks/lcli-59%20-%20lore-new-Story-doesnt-scaffold-the-lore-tasks-managed-block-so-a-fresh-Story-cant-be-lore-synced.md) | lore new Story doesn't scaffold the lore:tasks managed block, so a fresh Story can't be lore synced | Done |
| [LCLI-304](../../backlog/tasks/lcli-304%20-%20lore-link-accepts-task-coupling-on-concept-types-without-a-tasks-schema-field-e.g.-Runbook-sync-then-hard-fails-and-unlink-cannot-fully-clean-up.md) | lore link accepts task-coupling on concept types without a tasks schema field (e.g. Runbook); sync then hard-fails and unlink cannot fully clean up | Done |
| [LCLI-305](../../backlog/tasks/lcli-305%20-%20lore-sync-doesnt-regenerate-a-Storys-managed-tasks-block-when-its-linked-task-count-transitions-from-1-to-0-unlink-to-empty.md) | lore sync doesn't regenerate a Story's managed tasks block when its linked-task count transitions from 1+ to 0 (unlink to empty) | Done |
| [LCLI-306](../../backlog/tasks/lcli-306%20-%20lore-new-accepts-an-unrecognized-concept-type-exit-0-lore-check-strict-doesnt-catch-it-even-though-validate-strict-does.md) | lore new accepts an unrecognized concept type (exit 0); lore check --strict doesn't catch it even though validate --strict does | Done |
| [LCLI-307](../../backlog/tasks/lcli-307%20-%20lore-scaffold-obsidian-still-hard-errors-on-re-run-exit-5-conflict-instead-of-being-idempotent-like-scaffold-mkdocs.md) | lore scaffold obsidian still hard-errors on re-run (exit 5, conflict) instead of being idempotent like scaffold mkdocs | Done |
| [LCLI-314](../../backlog/tasks/lcli-314%20-%20Support-OKF-0.2.md) | Support OKF 0.2 | Done |
| [LCLI-316](../../backlog/tasks/lcli-316%20-%20lore-sync-embeds-raw-commit-subjects-into-log.md-which-lore-check-strict-then-rejects.md) | lore sync embeds raw commit subjects into log.md, which lore check --strict then rejects | Done |
| [LCLI-319](../../backlog/tasks/lcli-319%20-%20lore-inits-backlog-json-capability-probe-misattributes-cause-of-failure-tells-users-to-reinstall-backlog-when-the-real-issue-is-an-uninitialized-Backlog.md-project.md) | lore init's backlog --json-capability probe misattributes cause of failure -- tells users to reinstall backlog when the real issue is an uninitialized Backlog.md project | Done |
| [LCLI-326](../../backlog/tasks/lcli-326%20-%20docs-log.md-carries-174-duplicate-entries-that-lore-sync-cannot-heal-because-the-log-is-appended-rather-than-derived-from-git-history.md) | docs/log.md carries 174 duplicate entries that lore sync cannot heal, because the log is appended rather than derived from git history | Done |
<!-- lore:tasks:end -->

## Notes

Start with the [lore design](../specs/lore-design.md),
[Architecture](../reference/architecture.md), and the controlling
[runtime and distribution ADR](../adr/0001-runtime-build-distribution.md).
The live publication boundary is recorded in
[Lore CLI release truth](../reference/lore-cli-release-truth.md).
