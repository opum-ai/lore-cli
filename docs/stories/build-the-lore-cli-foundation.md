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
| [LCLI-1](../../.quest/tasks/LCLI-1.json) | Fork Backlog.md and create the --json tracking task | Done |
| [LCLI-2](../../.quest/tasks/LCLI-2.json) | Implement shared task-json serializer and --json on read commands | Done |
| [LCLI-6](../../.quest/tasks/LCLI-6.json) | Scaffold package.json, tsconfig, and pinned Bun toolchain | Done |
| [LCLI-7](../../.quest/tasks/LCLI-7.json) | Set up lint, format, and Bun test harness with coverage | Done |
| [LCLI-8](../../.quest/tasks/LCLI-8.json) | GitHub Actions CI: lint, typecheck, test, build | Done |
| [LCLI-10](../../.quest/tasks/LCLI-10.json) | Implement .lore config loader (native TOML + env overlay) | Done |
| [LCLI-11](../../.quest/tasks/LCLI-11.json) | Shared error model, exit codes, and warning collector | Done |
| [LCLI-12](../../.quest/tasks/LCLI-12.json) | Output layer: --plain, --json, and pretty modes | Done |
| [LCLI-15](../../.quest/tasks/LCLI-15.json) | concept.ts: frontmatter parse/serialize + Zod per-type schemas | Done |
| [LCLI-16](../../.quest/tasks/LCLI-16.json) | bundle.ts: walk docs/ and build the model + cross-link graph | Done |
| [LCLI-17](../../.quest/tasks/LCLI-17.json) | lore init | Done |
| [LCLI-18](../../.quest/tasks/LCLI-18.json) | lore new with templates | Done |
| [LCLI-19](../../.quest/tasks/LCLI-19.json) | lore validate: tiered per-type validation | Done |
| [LCLI-21](../../.quest/tasks/LCLI-21.json) | backlog.ts adapter: JSON-only read + CLI writes | Done |
| [LCLI-22](../../.quest/tasks/LCLI-22.json) | managed-block.ts: remark/mdast task block | Done |
| [LCLI-23](../../.quest/tasks/LCLI-23.json) | reconcile.ts: status rollup | Done |
| [LCLI-24](../../.quest/tasks/LCLI-24.json) | lore link / unlink | Done |
| [LCLI-26](../../.quest/tasks/LCLI-26.json) | lore sync | Done |
| [LCLI-27](../../.quest/tasks/LCLI-27.json) | lore check (drift gate) | Done |
| [LCLI-28](../../.quest/tasks/LCLI-28.json) | links.ts: portable cross-link resolution and rewriting | Done |
| [LCLI-30](../../.quest/tasks/LCLI-30.json) | lore check: link/anchor + portability lint | Done |
| [LCLI-36](../../.quest/tasks/LCLI-36.json) | lore agents: SKILL.md + CLAUDE.md nudge | Done |
| [LCLI-46](../../.quest/tasks/LCLI-46.json) | Declarative .lore profile: per-project type vocabulary, schemas & templates | Done |
| [LCLI-3](../../.quest/tasks/LCLI-3.json) | Add --json tests and help-schema docs to the fork | Done |
| [LCLI-4](../../.quest/tasks/LCLI-4.json) | Build the patched binary and wire lore capability probe | Done |
| [LCLI-5](../../.quest/tasks/LCLI-5.json) | Open the upstream --json PR and migrate lore on release | Done |
| [LCLI-9](../../.quest/tasks/LCLI-9.json) | Release pipeline: compiled binaries + dual-artifact npm publish | Done |
| [LCLI-13](../../.quest/tasks/LCLI-13.json) | Test fixtures and golden outputs | Done |
| [LCLI-20](../../.quest/tasks/LCLI-20.json) | lore schema export (Zod to JSON Schema + modeline) | Done |
| [LCLI-25](../../.quest/tasks/LCLI-25.json) | lore tasks | Done |
| [LCLI-29](../../.quest/tasks/LCLI-29.json) | index.md and log.md generation | Done |
| [LCLI-31](../../.quest/tasks/LCLI-31.json) | lore graph | Done |
| [LCLI-32](../../.quest/tasks/LCLI-32.json) | lore orphans | Done |
| [LCLI-33](../../.quest/tasks/LCLI-33.json) | lore query (full-text + frontmatter filters) | Done |
| [LCLI-34](../../.quest/tasks/LCLI-34.json) | lore context (token-budgeted graph expansion) | Done |
| [LCLI-35](../../.quest/tasks/LCLI-35.json) | lore replace / rename / supersede | Done |
| [LCLI-37](../../.quest/tasks/LCLI-37.json) | lore instructions (layered agent guides) | Done |
| [LCLI-38](../../.quest/tasks/LCLI-38.json) | lore help --json capability manifest | Done |
| [LCLI-39](../../.quest/tasks/LCLI-39.json) | lore scaffold mkdocs | Done |
| [LCLI-40](../../.quest/tasks/LCLI-40.json) | lore scaffold docusaurus + build smoke test | Done |
| [LCLI-47](../../.quest/tasks/LCLI-47.json) | GitAdapter seam: git-history log.md + resource_base stamping | Done |
| [LCLI-49](../../.quest/tasks/LCLI-49.json) | retrofit link/unlink/rename to commit backlog/ via state.ts | Done |
| [LCLI-53](../../.quest/tasks/LCLI-53.json) | Pin lore's Backlog.md dependency to upstream's --json commit (interim) | Done |
| [LCLI-54](../../.quest/tasks/LCLI-54.json) | Rewrite src/adapters/backlog.ts against upstream's real --json contract | Done |
| [LCLI-417](../../.quest/tasks/LCLI-417.json) | obsidian scaffold: rollback leaves docs/ behind on a never-initialized repo | Done |
| [LCLI-420](../../.quest/tasks/LCLI-420.json) | obsidian scaffold: published CLI docs (cli-surface.md / cli-contract.md) still say it is pending | Done |
| [LCLI-423](../../.quest/tasks/LCLI-423.json) | obsidian scaffold: OBSIDIAN_GUIDANCE_NOTES is a shared mutable array, not copied per plan | Done |
| [LCLI-14](../../.quest/tasks/LCLI-14.json) | Bun compile compatibility spike | Done |
| [LCLI-41](../../.quest/tasks/LCLI-41.json) | lore scaffold obsidian | Done |
| [LCLI-50](../../.quest/tasks/LCLI-50.json) | dedupe multi-root check reconciliation: shared task ids + config validation across bundle roots | Done |
| [LCLI-51](../../.quest/tasks/LCLI-51.json) | Dedup task-summary row type + aligned-row renderer across tasks/orphans | Done |
| [LCLI-52](../../.quest/tasks/LCLI-52.json) | Reconcile stale remark/unified doc references across ADRs and specs | Done |
| [LCLI-421](../../.quest/tasks/LCLI-421.json) | obsidian scaffold: never-silent-clobber preflight cannot detect a conflict on docs/ itself | Done |
| [LCLI-422](../../.quest/tasks/LCLI-422.json) | consumer-scaffold.ts module docstring: "docs/ is never mutated" invariant is now false | Done |
| [LCLI-424](../../.quest/tasks/LCLI-424.json) | obsidian scaffold: stale JSDoc still names the old enumerated .gitignore patterns | Done |
| [LCLI-425](../../.quest/tasks/LCLI-425.json) | consumer-scaffold.test.ts: "mkdocs/docusaurus" notes test never actually exercises docusaurus | Done |
| [LCLI-426](../../.quest/tasks/LCLI-426.json) | consumer-scaffold.test.ts: obsidian rendering test's ordering claim is not actually verified | Done |
| [LCLI-427](../../.quest/tasks/LCLI-427.json) | scaffold.ts: KNOWN_TARGETS/IMPLEMENTED_TARGETS are now identical sets, leaving a dead, untested branch | Done |
| [LCLI-418](../../.quest/tasks/LCLI-418.json) | consumer-scaffold.ts: ConsumerScaffoldOptions doc comment omits obsidian as a consumer | Done |
| [LCLI-419](../../.quest/tasks/LCLI-419.json) | scaffold.ts: module docstring's opening line still names only two of the three builders | Done |
| [LCLI-60](../../.quest/tasks/LCLI-60.json) | ADR-0002 overstates the capability-probe exit code: says missing/too-old/incapable backlog all map to exit 6, but a missing binary is really exit 3 | Done |
| [LCLI-408](../../.quest/tasks/LCLI-408.json) | lore replace (managed-region-safe find/replace) | Done |
| [LCLI-409](../../.quest/tasks/LCLI-409.json) | lore rename (graph-aware inbound link/ref rewrite) | Done |
| [LCLI-410](../../.quest/tasks/LCLI-410.json) | lore supersede (frontmatter wiring + inbound rewrite) | Done |
| [LCLI-48](../../.quest/tasks/LCLI-48.json) | lore check follow-ups: --external liveness, MDX/filename portability rules | Done |
| [LCLI-55](../../.quest/tasks/LCLI-55.json) | Fix LCLI-41 / PR #50 code-review findings | Done |
| [LCLI-56](../../.quest/tasks/LCLI-56.json) | Docker E2E test harness: lore dev build + pinned upstream Backlog.md | Done |
| [LCLI-57](../../.quest/tasks/LCLI-57.json) | editTask sends --json to backlog task edit, which doesn't support it — breaks link/unlink/rename back-ref writes | Done |
| [LCLI-58](../../.quest/tasks/LCLI-58.json) | `lore link`/`unlink` --json emits a full success-shaped envelope on stdout even when exiting nonzero, violating the stdout/stderr contract | Done |
| [LCLI-59](../../.quest/tasks/LCLI-59.json) | lore new Story doesn't scaffold the lore:tasks managed block, so a fresh Story can't be lore synced | Done |
| [LCLI-304](../../.quest/tasks/LCLI-304.json) | lore link accepts task-coupling on concept types without a tasks schema field (e.g. Runbook); sync then hard-fails and unlink cannot fully clean up | Done |
| [LCLI-305](../../.quest/tasks/LCLI-305.json) | lore sync doesn't regenerate a Story's managed tasks block when its linked-task count transitions from 1+ to 0 (unlink to empty) | Done |
| [LCLI-306](../../.quest/tasks/LCLI-306.json) | lore new accepts an unrecognized concept type (exit 0); lore check --strict doesn't catch it even though validate --strict does | Done |
| [LCLI-307](../../.quest/tasks/LCLI-307.json) | lore scaffold obsidian still hard-errors on re-run (exit 5, conflict) instead of being idempotent like scaffold mkdocs | Done |
| [LCLI-314](../../.quest/tasks/LCLI-314.json) | Support OKF 0.2 | Done |
| [LCLI-316](../../.quest/tasks/LCLI-316.json) | lore sync embeds raw commit subjects into log.md, which lore check --strict then rejects | Done |
| [LCLI-319](../../.quest/tasks/LCLI-319.json) | lore init's backlog --json-capability probe misattributes cause of failure -- tells users to reinstall backlog when the real issue is an uninitialized Backlog.md project | Done |
| [LCLI-326](../../.quest/tasks/LCLI-326.json) | docs/log.md carries 174 duplicate entries that lore sync cannot heal, because the log is appended rather than derived from git history | Done |
<!-- lore:tasks:end -->

## Notes

Start with the [lore design](../specs/lore-design.md),
[Architecture](../reference/architecture.md), and the controlling
[runtime and distribution ADR](../adr/0001-runtime-build-distribution.md).
The live publication boundary is recorded in
[Lore CLI release truth](../reference/lore-cli-release-truth.md).
