---
id: LCLI-281
title: Teach `lore init` to detect and configure Claude Code and Codex
status: Done
assignee:
  - '@codex'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - cli-ux
  - onboarding
  - agents
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
references:
  - src/commands/init.ts
  - src/commands/agents.ts
  - docs/adr/0017-interactive-init-wizard-tty-gated.md
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
modified_files:
  - src/commands/init.ts
  - src/commands/codex-bridge.ts
  - src/core/codex-bridge.ts
  - src/core/manifest.ts
  - test/init.test.ts
  - docs/runbooks/agent-onboarding.md
  - docs/reference/cli-surface.md
  - docs/log.md
  - docs/reference/index.md
priority: medium
type: enhancement
ordinal: 383000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When `lore init` runs interactively, detect whether Claude Code and Codex are installed. For each detected agent, offer to configure the repository-specific Lore bridge instead of treating agent setup as a single Claude-only choice. Preserve deterministic, prompt-free behavior for CI and scripts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On an interactive TTY, `lore init` detects Claude Code and Codex availability without failing when either executable is absent.
- [x] #2 Each detected agent is presented as an independent configuration choice; undetected agents are not offered as if available.
- [x] #3 Accepting Claude Code configuration creates or refreshes the Claude Lore bridge, and accepting Codex configuration creates or refreshes `AGENTS.md` plus `.codex/skills/lore/`.
- [x] #4 Explicit flags provide prompt-free control over Claude Code and Codex configuration, and non-TTY or JSON execution never blocks for input.
- [x] #5 Re-running setup is idempotent and protects hand-edited bridge files consistently for both agents.
- [x] #6 Automated tests cover Claude-only, Codex-only, both-installed, neither-installed, declined choices, and non-interactive execution; CLI help and onboarding documentation describe the behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the checked-in Codex bridge artifacts with the generator and add a lockstep regression test. 2. Update the CLI contract, CLI surface/error guidance, and [Unreleased] CHANGELOG for the additive codex output and new flags. 3. Run the focused and full suites, typecheck/lint, Lore sync/validation/check, and diff checks. 4. Push the reviewed fixes, require all PR checks green, then merge PR #263 and reconcile local dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented independent Claude/Codex availability choices and prompt-free flags. Added a Codex bridge writer for AGENTS.md plus .codex/skills/lore/SKILL.md with managed-block preservation, whole-file hand-edit protection, disk-style preservation, and idempotent results. Added matrix, declined-choice, non-interactive, re-run, and hand-edit tests; updated manifest help and onboarding/CLI docs.

Verification: full `bun test` passed (2,199 tests); focused `bun test test/init.test.ts` passed after the final preservation test (64 tests); `bun run typecheck`, `bun run lint`, and `git diff --check` passed. Lore checks passed: `lore validate --strict` reported 0 errors (pre-existing summary-length advisories only), and `lore check --strict` reported 0 errors/0 warnings. `lore sync` refreshed managed indexes/log and committed the Backlog task update.

2026-07-28 handoff re-verification: bun test passed 2,200/0; typecheck and Biome lint passed; lore check --strict passed 41 files with 0 errors/0 warnings; git diff --check passed. lore validate --strict reported 0 errors and 16 pre-existing summary-length warnings, so it exited 6 under strict warning policy; the earlier wording that strict validation 'passed' should be read as schema validation having no errors, not as an exit-0 strict gate. lore sync added the expected 6ceccfb documentation-history entries to generated docs/log.md.

PR #263 CI exposed a host-dependent router test: the end-to-end wizard test assumed Claude was installed on the runner, so availability detection correctly skipped bridge creation on Ubuntu CI. Fixing the test seam by threading injectable agentAvailability through RunContext and explicitly declaring Claude availability in that test.

CI follow-up fixed: RunContext now exposes and forwards the existing agentAvailability seam, and the router wizard test explicitly injects Claude-present/Codex-absent instead of depending on the host PATH. Verified with the exact Ubuntu CI command: bun test --isolate --timeout=10000 (2,200/0), focused cli suite (51/0), typecheck, and lint.

Review of PR #263 found four blocking inconsistencies: the checked-in .codex skill differs from buildCodexSkillDoc (missing generated footer, so self-setup reports protected); cli-contract.md's init envelope omits codex; the user-visible flags/behavior have no [Unreleased] CHANGELOG entry; and the closed-stdin usage hint omits --claude/--codex. Fixing in-scope before merge.

PR review fixes complete: reconciled the checked-in Codex skill with buildCodexSkillDoc and added a byte-lockstep test; documented the additive codex init result in cli-contract.md; added the [Unreleased] entry; updated README/CLI-surface agent wording; and corrected the EOF hint to advertise --claude/--codex. Verification: exact isolated full suite 2,201/0, focused init+CLI 116/0, typecheck clean, Biome clean (118 files), lore check --strict 41 files 0/0, git diff --check clean. lore validate --strict remains exit 6 only for 16 pre-existing summary-length warnings, with 0 errors.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and reviewed multi-agent onboarding for lore init, including deterministic Claude/Codex detection, protected Codex bridge generation, complete CLI/README/contract/CHANGELOG documentation, generator-artifact lockstep coverage, and host-independent router tests. Verified with 2,201 isolated tests, typecheck, lint, strict Lore coherence, and CI before merge.
<!-- SECTION:FINAL_SUMMARY:END -->
