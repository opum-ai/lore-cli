---
type: Story
title: Prepare the first Lore CLI release
tags:
  - release
  - packaging
  - governance
summary: Record the first immutable public package release while retaining the unresolved control gate for future automated publication.
timestamp: 2026-08-04T02:50:00Z
status: todo
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
  - lcli-313
  - lcli-320
  - lcli-321
  - lcli-327
  - lcli-332
  - lcli-336
  - lcli-337
  - lcli-338
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

LCLI-313 published `0.1.1` from the seven untouched tarballs produced by
qualified Release run `30966913181`, again with platform packages first and
root last. All seven npm packages are public, Windows ARM64 passed its native
matching-host qualification, a clean registry install reports `0.1.1`, and the
new package's Trusted Publisher matches the existing six-package contract. The
repository has a non-draft, non-prerelease GitHub Release for `v0.1.1`.

LCLI-321 published `0.2.0` from the seven untouched tarballs produced by
qualified Release run `31317296988`, with all six platform packages published
and integrity-verified before the root launcher. Anonymous registry metadata
matches every qualified artifact, a clean install selects the matching native
package and reports `0.2.0`, and the repository has a non-draft,
non-prerelease GitHub Release for `v0.2.0`.

LCLI-332 published `0.3.0` from the seven untouched tarballs produced by
qualified Release run `31950668955`, with all six platform packages published
and integrity-verified before the root launcher. A clean registry install
reports `0.3.0` and exposes the digest-guarded `lore backlog adopt` lifecycle;
the repository has a non-draft, non-prerelease GitHub Release for `v0.3.0`.

This Story remains open because LCLI-278 still owns the separate safety gate
for future automated OIDC publication.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| LCLI-253 | Migrate backlog adapter to the released --json Backlog.md once upstream tags it (drop build-from-commit hint, bump version floor) | Done |
| LCLI-269 | docker/e2e/run-e2e.sh runs its destructive phases against the caller's cwd when invoked outside the container (no set -e, unguarded cd /workspace) | Done |
| LCLI-276 | Release runbook cannot configure npm Trusted Publishing before first package publication | Done |
| LCLI-278 | GitHub billing plan blocks required-reviewer protection on the release Environment | To Do |
| LCLI-279 | Add deterministic OKF projection export | Done |
| LCLI-280 | Upgrade js-yaml to remediate release-blocking advisories | Done |
| LCLI-282 | Provide a SHA-pinned strict Lore CI action | Done |
| LCLI-251 | Reduce CI Actions minute cost: event-scoped OS matrix, concurrency cancellation, drop redundant push:dev | Done |
| LCLI-252 | Bun on Windows: writeFileAtomic/writeFileNoFollow openSync(O_CREAT\|O_EXCL) throws ENOENT, breaking agents/sync/replace/schema/scaffold --force | Done |
| LCLI-254 | Watch for the upstream Backlog.md --json release tag (>v1.48.0 containing commit 22a091b) | Done |
| LCLI-255 | First-release rehearsal: dry-run the dual-artifact npm publish end-to-end and write a first-release checklist | Done |
| LCLI-260 | lore onboarding: one command to set up every configurable consumer (agents/CLAUDE bridge, Obsidian, scaffolds) instead of init -> agents -> lore-setup.sh -> manual obsidian | Done |
| LCLI-268 | Harden the release publish job against the workflow_dispatch-any-ref vector (Trusted Publishing pins filename, not ref) | Done |
| LCLI-270 | backlog-cli-contract.md §2.4 says the label flags are single-value last-wins, but v1.48.0 made all four repeatable accumulators | Done |
| LCLI-271 | lore agents --check: 'out of date' is printed for both protected and updated, so which file needs --force is carried by ANSI colour alone — violates cli-contract.md §6 | Done |
| LCLI-272 | docker/e2e: nothing pins run-e2e.sh's container-only guard — deleting it passes bun test, lint, and the docker-e2e CI check | Done |
| LCLI-273 | docker/e2e/run-e2e.sh: a failed cd inside the nested-checkout phase is reported as a vacuous PASS at one site and not reported at all at another | Done |
| LCLI-274 | README.md and tech-stack.md still present the Backlog.md fork as a current git dependency, which architecture.md now labels superseded | Done |
| LCLI-277 | CONTRIBUTING documents bun run build but package.json has no build script | Done |
| LCLI-281 | Teach `lore init` to detect and configure Claude Code and Codex | Done |
| LCLI-256 | Windows fswrite: bounded renameSync EPERM/transient-lock retry in writeFileAtomic/writeFileNoFollow | Done |
| LCLI-257 | Governance: make lint-typecheck-test (windows-latest) a required status check on dev (and decide main) | Done |
| LCLI-258 | lore: harmonize non-concept-file handling — spurious 'no frontmatter mapping' warning on link/sync/unlink/tasks but not check; inconsistent skipped-count | Done |
| LCLI-259 | lore: harmonize error/usage/success message phrasing across commands (missing-arg templates, misdirecting bad-id hint, unexplained '(doc)' label) | Done |
| LCLI-261 | lore orphans: subtasks of a linked parent task are reported as orphans — no Backlog parent/subtask hierarchy awareness | Done |
| LCLI-262 | lore supersede/rename --rewrite-links silently retargets a link whose display TEXT names the old id, leaving text/target mismatched | Done |
| LCLI-263 | lore scaffold: a bare re-run hard-errors (conflict) on an already-scaffolded config instead of being idempotent-when-unchanged | Done |
| LCLI-264 | CHANGELOG: backfill missing [Unreleased] entries for the round-4 wave-1 contract changes (LCLI-258/262/263/254) | Done |
| LCLI-265 | ADR-0009 §2 misdescribes how lore orphans finds unowned tasks (stale search --json claim + missing parent-chain clause) | Done |
| LCLI-266 | lore agents: the pre-write symlink sweep (LCLI-93 AC#5) has zero test coverage — deleting assertNoSymlinkInAnyPath fails no test | Done |
| LCLI-267 | lore agents renderPretty: a 'protected' bridge file prints green while lore init prints the same action yellow | Done |
| LCLI-275 | docs/runbooks: docker-e2e section still says the harness is 'not yet a required check', but LCLI-196 shipped that ruleset | Done |
| LCLI-295 | Rename unpublished npm package family to @opum-ai | Done |
| LCLI-296 | Publish Lore CLI 0.1.0 and bootstrap npm Trusted Publishing | Done |
| LCLI-297 | Ship a Windows ARM64 Lore binary | Done |
| LCLI-298 | docker/e2e: lore init's Codex/Claude independent agent detection (LCLI-281) has zero E2E coverage | Done |
| LCLI-299 | docker/e2e: validate --type and schema export --type/--out scoping flags have no E2E coverage | Done |
| LCLI-300 | docker/e2e: two Meridian-stress-test regressions (LCLI-261 orphans hierarchy, LCLI-262 rewrite-links text mismatch) never backported into the persisted harness | Done |
| LCLI-312 | Prepare and deliver npm 0.1.1 release metadata | Done |
| LCLI-313 | Publish Lore CLI 0.1.1 from qualified release artifacts | Done |
| LCLI-320 | Prepare and deliver Lore CLI 0.2.0 release metadata | Done |
| LCLI-321 | Publish Lore CLI 0.2.0 from qualified release artifacts | Done |
| LCLI-327 | docker/e2e/run-e2e.sh writes a repo-local git identity, leaking "lore e2e <e2e@lore.test>" into real commits on dev | Done |
| LCLI-332 | Release the Lore Backlog knowledge-adoption contract | Done |
| LCLI-336 | Prepare Lore CLI 0.3.1 patch release metadata | Done |
| LCLI-337 | Fix packaged Lore Backlog isolation in release qualification | Done |
| LCLI-338 | Prepare Lore CLI 0.3.2 patch release metadata | Done |
<!-- lore:tasks:end -->

## Notes

Read [Lore CLI release truth](../reference/lore-cli-release-truth.md) before
the [Release publishing](../runbooks/release-publishing.md) procedure. The
procedure describes how to release; it is not evidence that release occurred.
