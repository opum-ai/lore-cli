---
id: LCLI-284
title: Migrate CLI argument parsing and routing to Commander
status: To Do
assignee: []
created_date: '2026-07-30 14:25'
updated_date: '2026-07-30 14:40'
labels:
  - cli
  - argument-parsing
  - commander
  - developer-experience
milestone: m-13
dependencies:
  - LCLI-283.1.1
references:
  - src/cli.ts
  - src/commands/args.ts
documentation:
  - docs/reference/tech-stack.md
  - docs/reference/cli-contract.md
  - docs/reference/cli-surface.md
priority: medium
type: chore
ordinal: 387500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace Lore’s hand-rolled global router and duplicated command-level option parsing with Commander as the declarative CLI entrypoint. The migration must reduce parser/help duplication without changing Lore’s established command behavior, deterministic machine contracts, thin-command/core boundary, or compiled-binary distribution. This is an M6 preparation lane: start it after the LadybugDB schema and lifecycle contract is frozen, and finish it before graph, query, and context are routed through indexed retrieval. It does not move the M7 graph explorer ahead of the stable LadybugDB projection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A single declarative command and option definition drives subcommand dispatch, global and command flags, positional arguments, end-of-options handling, and generated help without duplicated hand-written tokenizers
- [ ] #2 All documented CLI behavior remains compatible, including global flags in supported positions, --flag=value forms, repeatable options, the literal -- terminator, unknown-option handling, help, and version output
- [ ] #3 Commander never terminates the process or bypasses Lore’s injected writers; stdout/stderr separation, JSON error envelopes, output-mode precedence, semantic exit codes, TTY behavior, and NO_COLOR behavior remain unchanged
- [ ] #4 Existing CLI, command, golden, and end-to-end tests pass, with parity tests covering parser edge cases and any Commander-specific failure paths
- [ ] #5 Bun source execution, compiled binaries, supported platform packaging, startup behavior, and dependency/license checks pass without regressing the published package contract
- [ ] #6 Architecture, tech-stack, CLI-surface, and contributor documentation no longer describe the router as hand-rolled and accurately record Commander’s role and constraints
<!-- AC:END -->
