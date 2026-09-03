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
| LCLI-1 | Fork Backlog.md and create the --json tracking task | Done |
| LCLI-2 | Implement shared task-json serializer and --json on read commands | Done |
| LCLI-6 | Scaffold package.json, tsconfig, and pinned Bun toolchain | Done |
| LCLI-7 | Set up lint, format, and Bun test harness with coverage | Done |
| LCLI-8 | GitHub Actions CI: lint, typecheck, test, build | Done |
| LCLI-10 | Implement .lore config loader (native TOML + env overlay) | Done |
| LCLI-11 | Shared error model, exit codes, and warning collector | Done |
| LCLI-12 | Output layer: --plain, --json, and pretty modes | Done |
| LCLI-15 | concept.ts: frontmatter parse/serialize + Zod per-type schemas | Done |
| LCLI-16 | bundle.ts: walk docs/ and build the model + cross-link graph | Done |
| LCLI-17 | lore init | Done |
| LCLI-18 | lore new with templates | Done |
| LCLI-19 | lore validate: tiered per-type validation | Done |
| LCLI-21 | backlog.ts adapter: JSON-only read + CLI writes | Done |
| LCLI-22 | managed-block.ts: remark/mdast task block | Done |
| LCLI-23 | reconcile.ts: status rollup | Done |
| LCLI-24 | lore link / unlink | Done |
| LCLI-26 | lore sync | Done |
| LCLI-27 | lore check (drift gate) | Done |
| LCLI-28 | links.ts: portable cross-link resolution and rewriting | Done |
| LCLI-30 | lore check: link/anchor + portability lint | Done |
| LCLI-36 | lore agents: SKILL.md + CLAUDE.md nudge | Done |
| LCLI-46 | Declarative .lore profile: per-project type vocabulary, schemas & templates | Done |
| LCLI-3 | Add --json tests and help-schema docs to the fork | Done |
| LCLI-4 | Build the patched binary and wire lore capability probe | Done |
| LCLI-5 | Open the upstream --json PR and migrate lore on release | Done |
| LCLI-9 | Release pipeline: compiled binaries + dual-artifact npm publish | Done |
| LCLI-13 | Test fixtures and golden outputs | Done |
| LCLI-20 | lore schema export (Zod to JSON Schema + modeline) | Done |
| LCLI-25 | lore tasks | Done |
| LCLI-29 | index.md and log.md generation | Done |
| LCLI-31 | lore graph | Done |
| LCLI-32 | lore orphans | Done |
| LCLI-33 | lore query (full-text + frontmatter filters) | Done |
| LCLI-34 | lore context (token-budgeted graph expansion) | Done |
| LCLI-35 | lore replace / rename / supersede | Done |
| LCLI-37 | lore instructions (layered agent guides) | Done |
| LCLI-38 | lore help --json capability manifest | Done |
| LCLI-39 | lore scaffold mkdocs | Done |
| LCLI-40 | lore scaffold docusaurus + build smoke test | Done |
| LCLI-47 | GitAdapter seam: git-history log.md + resource_base stamping | Done |
| LCLI-49 | retrofit link/unlink/rename to commit backlog/ via state.ts | Done |
| LCLI-53 | Pin lore's Backlog.md dependency to upstream's --json commit (interim) | Done |
| LCLI-54 | Rewrite src/adapters/backlog.ts against upstream's real --json contract | Done |
| LCLI-417 | obsidian scaffold: rollback leaves docs/ behind on a never-initialized repo | Done |
| LCLI-420 | obsidian scaffold: published CLI docs (cli-surface.md / cli-contract.md) still say it is pending | Done |
| LCLI-423 | obsidian scaffold: OBSIDIAN_GUIDANCE_NOTES is a shared mutable array, not copied per plan | Done |
| LCLI-14 | Bun compile compatibility spike | Done |
| LCLI-41 | lore scaffold obsidian | Done |
| LCLI-50 | dedupe multi-root check reconciliation: shared task ids + config validation across bundle roots | Done |
| LCLI-51 | Dedup task-summary row type + aligned-row renderer across tasks/orphans | Done |
| LCLI-52 | Reconcile stale remark/unified doc references across ADRs and specs | Done |
| LCLI-421 | obsidian scaffold: never-silent-clobber preflight cannot detect a conflict on docs/ itself | Done |
| LCLI-422 | consumer-scaffold.ts module docstring: "docs/ is never mutated" invariant is now false | Done |
| LCLI-424 | obsidian scaffold: stale JSDoc still names the old enumerated .gitignore patterns | Done |
| LCLI-425 | consumer-scaffold.test.ts: "mkdocs/docusaurus" notes test never actually exercises docusaurus | Done |
| LCLI-426 | consumer-scaffold.test.ts: obsidian rendering test's ordering claim is not actually verified | Done |
| LCLI-427 | scaffold.ts: KNOWN_TARGETS/IMPLEMENTED_TARGETS are now identical sets, leaving a dead, untested branch | Done |
| LCLI-418 | consumer-scaffold.ts: ConsumerScaffoldOptions doc comment omits obsidian as a consumer | Done |
| LCLI-419 | scaffold.ts: module docstring's opening line still names only two of the three builders | Done |
| LCLI-60 | ADR-0002 overstates the capability-probe exit code: says missing/too-old/incapable backlog all map to exit 6, but a missing binary is really exit 3 | Done |
| LCLI-408 | lore replace (managed-region-safe find/replace) | Done |
| LCLI-409 | lore rename (graph-aware inbound link/ref rewrite) | Done |
| LCLI-410 | lore supersede (frontmatter wiring + inbound rewrite) | Done |
| LCLI-48 | lore check follow-ups: --external liveness, MDX/filename portability rules | Done |
| LCLI-55 | Fix LCLI-41 / PR #50 code-review findings | Done |
| LCLI-56 | Docker E2E test harness: lore dev build + pinned upstream Backlog.md | Done |
| LCLI-57 | editTask sends --json to backlog task edit, which doesn't support it — breaks link/unlink/rename back-ref writes | Done |
| LCLI-58 | `lore link`/`unlink` --json emits a full success-shaped envelope on stdout even when exiting nonzero, violating the stdout/stderr contract | Done |
| LCLI-59 | lore new Story doesn't scaffold the lore:tasks managed block, so a fresh Story can't be lore synced | Done |
| LCLI-304 | lore link accepts task-coupling on concept types without a tasks schema field (e.g. Runbook); sync then hard-fails and unlink cannot fully clean up | Done |
| LCLI-305 | lore sync doesn't regenerate a Story's managed tasks block when its linked-task count transitions from 1+ to 0 (unlink to empty) | Done |
| LCLI-306 | lore new accepts an unrecognized concept type (exit 0); lore check --strict doesn't catch it even though validate --strict does | Done |
| LCLI-307 | lore scaffold obsidian still hard-errors on re-run (exit 5, conflict) instead of being idempotent like scaffold mkdocs | Done |
| LCLI-314 | Support OKF 0.2 | Done |
| LCLI-316 | lore sync embeds raw commit subjects into log.md, which lore check --strict then rejects | Done |
| LCLI-319 | lore init's backlog --json-capability probe misattributes cause of failure -- tells users to reinstall backlog when the real issue is an uninitialized Backlog.md project | Done |
| LCLI-326 | docs/log.md carries 174 duplicate entries that lore sync cannot heal, because the log is appended rather than derived from git history | Done |
<!-- lore:tasks:end -->

## Notes

Start with the [lore design](../specs/lore-design.md),
[Architecture](../reference/architecture.md), and the controlling
[runtime and distribution ADR](../adr/0001-runtime-build-distribution.md).
The live publication boundary is recorded in
[Lore CLI release truth](../reference/lore-cli-release-truth.md).
