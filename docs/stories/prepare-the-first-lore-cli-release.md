---
type: Story
title: Prepare the first Lore CLI release
tags:
  - release
  - packaging
  - governance
summary: Record the first immutable public package release while retaining the unresolved control gate for future automated publication.
timestamp: 2026-08-04T02:50:00Z
status: in-progress
tasks:
  - lcli-253
  - lcli-269
  - lcli-276
  - lcli-278
  - lcli-279
  - lcli-280
  - lcli-282
  - lcli-251
  - lcli-252
  - lcli-254
  - lcli-255
  - lcli-260
  - lcli-268
  - lcli-270
  - lcli-271
  - lcli-272
  - lcli-273
  - lcli-274
  - lcli-277
  - lcli-281
  - lcli-256
  - lcli-257
  - lcli-258
  - lcli-259
  - lcli-261
  - lcli-262
  - lcli-263
  - lcli-264
  - lcli-265
  - lcli-266
  - lcli-267
  - lcli-275
  - lcli-295
  - lcli-296
  - lcli-297
  - lcli-298
  - lcli-299
  - lcli-300
  - lcli-312
---

# Prepare the first Lore CLI release

## Goal

Prepare and record Lore's first public package release while keeping mechanics,
readiness, publication, and future automation as distinct states. A release
exists only after a non-placeholder version, immutable tag and artifact, clean
registry install, and the owner gate for that publication path agrees.

## Acceptance criteria

- Packaging and CI qualify all declared platform artifacts from one commit.
- The published Backlog.md dependency gate remains satisfied through LCLI-253.
- The explicitly authorized interactive `0.1.0` bootstrap uses only qualified
  artifacts, and every resulting npm package has the intended Trusted Publisher.
- Automated `publish: true` dispatches remain blocked until LCLI-278 has an
  accepted owner disposition for an effective out-of-file approval control.
- No install or availability statement is written before immutable public
  evidence exists.

## Release outcome

LCLI-296 published `0.1.0` from the six tarballs produced by qualified Release
run `30870431925`, platform packages first and root last. All six npm packages
are public, a clean registry install reports `0.1.0`, all six Trusted Publisher
contracts are verified, and the private repository has a GitHub Release for
`v0.1.0`. The exact commit, artifact hashes, and control boundary are recorded
in [Lore CLI release truth](../reference/lore-cli-release-truth.md).

This Story remains open because LCLI-278 still owns the separate safety gate
for future automated OIDC publication.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-253](../../backlog/tasks/lcli-253%20-%20Migrate-backlog-adapter-to-the-released-json-Backlog.md-once-upstream-tags-it-drop-build-from-commit-hint-bump-version-floor.md) | Migrate backlog adapter to the released --json Backlog.md once upstream tags it (drop build-from-commit hint, bump version floor) | Done |
| [LCLI-269](../../backlog/tasks/lcli-269%20-%20docker-e2e-run-e2e.sh-runs-its-destructive-phases-against-the-callers-cwd-when-invoked-outside-the-container-no-set-e-unguarded-cd-workspace.md) | docker/e2e/run-e2e.sh runs its destructive phases against the caller's cwd when invoked outside the container (no set -e, unguarded cd /workspace) | Done |
| [LCLI-276](../../backlog/tasks/lcli-276%20-%20Release-runbook-cannot-configure-npm-Trusted-Publishing-before-first-package-publication.md) | Release runbook cannot configure npm Trusted Publishing before first package publication | Done |
| [LCLI-278](../../backlog/tasks/lcli-278%20-%20GitHub-billing-plan-blocks-required-reviewer-protection-on-the-release-Environment.md) | GitHub billing plan blocks required-reviewer protection on the release Environment | To Do |
| [LCLI-279](../../backlog/tasks/lcli-279%20-%20Add-deterministic-OKF-projection-export.md) | Add deterministic OKF projection export | Done |
| [LCLI-280](../../backlog/tasks/lcli-280%20-%20Upgrade-js-yaml-to-remediate-release-blocking-advisories.md) | Upgrade js-yaml to remediate release-blocking advisories | Done |
| [LCLI-282](../../backlog/tasks/lcli-282%20-%20Provide-a-SHA-pinned-strict-Lore-CI-action.md) | Provide a SHA-pinned strict Lore CI action | Done |
| [LCLI-251](../../backlog/tasks/lcli-251%20-%20Reduce-CI-Actions-minute-cost-event-scoped-OS-matrix-concurrency-cancellation-drop-redundant-push-dev.md) | Reduce CI Actions minute cost: event-scoped OS matrix, concurrency cancellation, drop redundant push:dev | Done |
| [LCLI-252](../../backlog/tasks/lcli-252%20-%20Bun-on-Windows-writeFileAtomic-writeFileNoFollow-openSyncO_CREAT-O_EXCL-throws-ENOENT-breaking-agents-sync-replace-schema-scaffold-force.md) | Bun on Windows: writeFileAtomic/writeFileNoFollow openSync(O_CREAT\|O_EXCL) throws ENOENT, breaking agents/sync/replace/schema/scaffold --force | Done |
| [LCLI-254](../../backlog/tasks/lcli-254%20-%20Watch-for-the-upstream-Backlog.md-json-release-tag-v1.48.0-containing-commit-22a091b.md) | Watch for the upstream Backlog.md --json release tag (>v1.48.0 containing commit 22a091b) | Done |
| [LCLI-255](../../backlog/tasks/lcli-255%20-%20First-release-rehearsal-dry-run-the-dual-artifact-npm-publish-end-to-end-and-write-a-first-release-checklist.md) | First-release rehearsal: dry-run the dual-artifact npm publish end-to-end and write a first-release checklist | Done |
| [LCLI-260](../../backlog/tasks/lcli-260%20-%20lore-onboarding-one-command-to-set-up-every-configurable-consumer-agents-CLAUDE-bridge-Obsidian-scaffolds-instead-of-init-agents-lore-setup.sh-manual-obsidian.md) | lore onboarding: one command to set up every configurable consumer (agents/CLAUDE bridge, Obsidian, scaffolds) instead of init -> agents -> lore-setup.sh -> manual obsidian | Done |
| [LCLI-268](../../backlog/tasks/lcli-268%20-%20Harden-the-release-publish-job-against-the-workflow_dispatch-any-ref-vector-Trusted-Publishing-pins-filename-not-ref.md) | Harden the release publish job against the workflow_dispatch-any-ref vector (Trusted Publishing pins filename, not ref) | Done |
| [LCLI-270](../../backlog/tasks/lcli-270%20-%20backlog-cli-contract.md-%C2%A72.4-says-the-label-flags-are-single-value-last-wins-but-v1.48.0-made-all-four-repeatable-accumulators.md) | backlog-cli-contract.md §2.4 says the label flags are single-value last-wins, but v1.48.0 made all four repeatable accumulators | Done |
| [LCLI-271](../../backlog/tasks/lcli-271%20-%20lore-agents-check-out-of-date-is-printed-for-both-protected-and-updated-so-which-file-needs-force-is-carried-by-ANSI-colour-alone-%E2%80%94-violates-cli-contract.md-%C2%A76.md) | lore agents --check: 'out of date' is printed for both protected and updated, so which file needs --force is carried by ANSI colour alone — violates cli-contract.md §6 | Done |
| [LCLI-272](../../backlog/tasks/lcli-272%20-%20docker-e2e-nothing-pins-run-e2e.shs-container-only-guard-%E2%80%94-deleting-it-passes-bun-test-lint-and-the-docker-e2e-CI-check.md) | docker/e2e: nothing pins run-e2e.sh's container-only guard — deleting it passes bun test, lint, and the docker-e2e CI check | Done |
| [LCLI-273](../../backlog/tasks/lcli-273%20-%20docker-e2e-run-e2e.sh-a-failed-cd-inside-the-nested-checkout-phase-is-reported-as-a-vacuous-PASS-at-one-site-and-not-reported-at-all-at-another.md) | docker/e2e/run-e2e.sh: a failed cd inside the nested-checkout phase is reported as a vacuous PASS at one site and not reported at all at another | Done |
| [LCLI-274](../../backlog/tasks/lcli-274%20-%20README.md-and-tech-stack.md-still-present-the-Backlog.md-fork-as-a-current-git-dependency-which-architecture.md-now-labels-superseded.md) | README.md and tech-stack.md still present the Backlog.md fork as a current git dependency, which architecture.md now labels superseded | Done |
| [LCLI-277](../../backlog/tasks/lcli-277%20-%20CONTRIBUTING-documents-bun-run-build-but-package.json-has-no-build-script.md) | CONTRIBUTING documents bun run build but package.json has no build script | Done |
| [LCLI-281](../../backlog/tasks/lcli-281%20-%20Teach-%60lore-init%60-to-detect-and-configure-Claude-Code-and-Codex.md) | Teach `lore init` to detect and configure Claude Code and Codex | Done |
| [LCLI-256](../../backlog/tasks/lcli-256%20-%20Windows-fswrite-bounded-renameSync-EPERM-transient-lock-retry-in-writeFileAtomic-writeFileNoFollow.md) | Windows fswrite: bounded renameSync EPERM/transient-lock retry in writeFileAtomic/writeFileNoFollow | Done |
| [LCLI-257](../../backlog/tasks/lcli-257%20-%20Governance-make-lint-typecheck-test-windows-latest-a-required-status-check-on-dev-and-decide-main.md) | Governance: make lint-typecheck-test (windows-latest) a required status check on dev (and decide main) | Done |
| [LCLI-258](../../backlog/tasks/lcli-258%20-%20lore-harmonize-non-concept-file-handling-%E2%80%94-spurious-no-frontmatter-mapping-warning-on-link-sync-unlink-tasks-but-not-check-inconsistent-skipped-count.md) | lore: harmonize non-concept-file handling — spurious 'no frontmatter mapping' warning on link/sync/unlink/tasks but not check; inconsistent skipped-count | Done |
| [LCLI-259](../../backlog/tasks/lcli-259%20-%20lore-harmonize-error-usage-success-message-phrasing-across-commands-missing-arg-templates-misdirecting-bad-id-hint-unexplained-doc-label.md) | lore: harmonize error/usage/success message phrasing across commands (missing-arg templates, misdirecting bad-id hint, unexplained '(doc)' label) | Done |
| [LCLI-261](../../backlog/tasks/lcli-261%20-%20lore-orphans-subtasks-of-a-linked-parent-task-are-reported-as-orphans-%E2%80%94-no-Backlog-parent-subtask-hierarchy-awareness.md) | lore orphans: subtasks of a linked parent task are reported as orphans — no Backlog parent/subtask hierarchy awareness | Done |
| [LCLI-262](../../backlog/tasks/lcli-262%20-%20lore-supersede-rename-rewrite-links-silently-retargets-a-link-whose-display-TEXT-names-the-old-id-leaving-text-target-mismatched.md) | lore supersede/rename --rewrite-links silently retargets a link whose display TEXT names the old id, leaving text/target mismatched | Done |
| [LCLI-263](../../backlog/tasks/lcli-263%20-%20lore-scaffold-a-bare-re-run-hard-errors-conflict-on-an-already-scaffolded-config-instead-of-being-idempotent-when-unchanged.md) | lore scaffold: a bare re-run hard-errors (conflict) on an already-scaffolded config instead of being idempotent-when-unchanged | Done |
| [LCLI-264](../../backlog/tasks/lcli-264%20-%20CHANGELOG-backfill-missing-Unreleased-entries-for-the-round-4-wave-1-contract-changes-LORE-258-262-263-254.md) | CHANGELOG: backfill missing [Unreleased] entries for the round-4 wave-1 contract changes (LCLI-258/262/263/254) | Done |
| [LCLI-265](../../backlog/tasks/lcli-265%20-%20ADR-0009-%C2%A72-misdescribes-how-lore-orphans-finds-unowned-tasks-stale-search-json-claim-missing-parent-chain-clause.md) | ADR-0009 §2 misdescribes how lore orphans finds unowned tasks (stale search --json claim + missing parent-chain clause) | Done |
| [LCLI-266](../../backlog/tasks/lcli-266%20-%20lore-agents-the-pre-write-symlink-sweep-LORE-93-AC5-has-zero-test-coverage-%E2%80%94-deleting-assertNoSymlinkInAnyPath-fails-no-test.md) | lore agents: the pre-write symlink sweep (LCLI-93 AC#5) has zero test coverage — deleting assertNoSymlinkInAnyPath fails no test | Done |
| [LCLI-267](../../backlog/tasks/lcli-267%20-%20lore-agents-renderPretty-a-protected-bridge-file-prints-green-while-lore-init-prints-the-same-action-yellow.md) | lore agents renderPretty: a 'protected' bridge file prints green while lore init prints the same action yellow | Done |
| [LCLI-275](../../backlog/tasks/lcli-275%20-%20docs-runbooks-docker-e2e-section-still-says-the-harness-is-not-yet-a-required-check-but-LORE-196-shipped-that-ruleset.md) | docs/runbooks: docker-e2e section still says the harness is 'not yet a required check', but LCLI-196 shipped that ruleset | Done |
| [LCLI-295](../../backlog/tasks/lcli-295%20-%20Rename-unpublished-npm-package-family-to-opum-ai.md) | Rename unpublished npm package family to @opum-ai | Done |
| [LCLI-296](../../backlog/tasks/lcli-296%20-%20Publish-Lore-CLI-0.1.0-and-bootstrap-npm-Trusted-Publishing.md) | Publish Lore CLI 0.1.0 and bootstrap npm Trusted Publishing | Done |
| [LCLI-297](../../backlog/tasks/lcli-297%20-%20Ship-a-Windows-ARM64-Lore-binary.md) | Ship a Windows ARM64 Lore binary | Done |
| [LCLI-298](../../backlog/tasks/lcli-298%20-%20docker-e2e-lore-inits-Codex-Claude-independent-agent-detection-LCLI-281-has-zero-E2E-coverage.md) | docker/e2e: lore init's Codex/Claude independent agent detection (LCLI-281) has zero E2E coverage | Done |
| [LCLI-299](../../backlog/tasks/lcli-299%20-%20docker-e2e-validate-type-and-schema-export-type-out-scoping-flags-have-no-E2E-coverage.md) | docker/e2e: validate --type and schema export --type/--out scoping flags have no E2E coverage | Done |
| [LCLI-300](../../backlog/tasks/lcli-300%20-%20docker-e2e-two-Meridian-stress-test-regressions-LCLI-261-orphans-hierarchy-LCLI-262-rewrite-links-text-mismatch-never-backported-into-the-persisted-harness.md) | docker/e2e: two Meridian-stress-test regressions (LCLI-261 orphans hierarchy, LCLI-262 rewrite-links text mismatch) never backported into the persisted harness | Done |
| [LCLI-312](../../backlog/tasks/lcli-312%20-%20Prepare-and-deliver-npm-0.1.1-release-metadata.md) | Prepare and deliver npm 0.1.1 release metadata | In Progress |
<!-- lore:tasks:end -->

## Notes

Read [Lore CLI release truth](../reference/lore-cli-release-truth.md) before
the [Release publishing](../runbooks/release-publishing.md) procedure. The
procedure describes how to release; it is not evidence that release occurred.
