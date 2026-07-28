---
id: LCLI-36
title: 'lore agents: SKILL.md + CLAUDE.md nudge'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:22'
labels:
  - cmd
  - agent-api
milestone: m-5
dependencies:
  - LCLI-37
documentation:
  - docs/adr/0004-cli-first-skill-bridge-mcp-deferred.md
  - docs/runbooks/agent-onboarding.md
priority: high
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generate .claude/skills/lore/SKILL.md (when-to-use + canonical loop) and a tiny marker-delimited CLAUDE.md nudge; idempotent with --check for CI. AGENTS.md via @import shim deferred.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Re-running makes no changes (idempotent)
- [x] #2 SKILL.md stays small and points at lore instructions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core/agent-bridge.ts (pure): buildSkillDoc() -> SKILL.md bytes (curated, live-source-grounded teacher: command surface, --json/exit-code contract, canonical loop, points at 'lore instructions <topic>'); nudge body; marker consts <!-- lore:agents:begin/end -->; pure planner(currentBytes|absent, force) -> desired bytes + per-file status (created/unchanged/updated/would-overwrite).
2. core/managed-block.ts: add NET-NEW upsertManagedBlock(content,{begin,end,body}) reusing the mdast marker-location primitive (insert-if-absent, update-if-present). Do NOT refactor shipped regenerateTaskBlock.
3. commands/agents.ts (thin, mirrors init.ts): resolve root, readFileIfPresent SKILL.md + CLAUDE.md, call planner, apply writes via fswrite unless --check, emit agents.result Renderable, return exit code.
4. cli.ts: register 'agents' in dispatch switch + USAGE; parse --force/--check via parseCommandArgs; wire kind into output taxonomy.
5. Contract: no positional args; --force overwrites a differing SKILL.md (default protects it, exit 0 with 'run --force' note); CLAUDE.md block always refreshes; --check writes nothing, exit 6 on any out-of-date state else 0; kind agents.result; exit 2 usage.
6. Content guardrails (grounded in src/, not the runbook): NO 'lore tasks' (unshipped LCLI-25); sync.result not sync.summary; managed-block errors are validation/exit6 (no exit-4 denied); no claim that 'lore check' gates bridge drift.
7. Tests test/agents.test.ts + core: idempotency (byte-identical re-run, AC#1); insert into CLAUDE.md w/o clobbering Backlog block; upsert refresh; --check exit6/0; --force overwrite; --json envelope kind=agents.result; guard test: SKILL.md names only real subcommands.
8. Dogfood 'lore agents' in-repo (commits .claude/skills/lore/SKILL.md + CLAUDE.md lore block); CHANGELOG Unreleased; bun test + bun run smoke; PR into dev.
Out of scope (follow-ups): lore check gating bridge drift; AGENTS.md @import shim; registry-driven SKILL.md generation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented lore agents (LCLI-36) to the cli-surface.md contract. Two artifacts: generated .claude/skills/lore/SKILL.md (whole lore-owned file) + a marker-delimited CLAUDE.md nudge (<!-- lore:agents:begin/end -->). Grounded ALL content in live source (cli.ts/output.ts/errors.ts/core-instructions.ts OVERVIEW), never the runbook -- names no unshipped command (no 'lore tasks'). Architecture: pure core/agent-bridge.ts (buildSkillDoc/buildNudgeBody/LORE_COMMANDS/planBridge) + thin commands/agents.ts (mirrors init.ts). The nudge splice reuses a NET-NEW additive upsertManagedBlock in core/managed-block.ts (insert-or-update sibling of regenerateTaskBlock; shipped tasks-block engine untouched). Contract: no positionals; --force overwrites a differing (hand-edited) SKILL.md while default leaves it 'protected'; the CLAUDE.md managed block always refreshes (lore owns only its bytes); --check writes nothing and exits 6 (drift) when stale, else 0; kind agents.result; exit 2 usage. AC#1 idempotent: byte-identical re-run + --check 0/6 gate. AC#2: SKILL.md small, points at 'lore instructions'. Tests: test/agents.test.ts (planner+command+rendering+usage+malformed) and upsertManagedBlock unit tests in managed-block.test.ts; lockstep guard runs each advertised command through the real router (guards the LCLI-37 phantom-command trap). Dogfooded in-repo (generated the actual SKILL.md + CLAUDE.md block; lore agents --check exits 0). Full suite 1330+ green, typecheck + biome clean. Out of scope (follow-ups): wiring lore check to gate bridge drift; AGENTS.md @import shim; registry-driven SKILL.md generation.

Ran high-effort workflow-backed /code-review (16 agents). 7 findings verified, all fixed + regression-tested: (1) [correctness] --check force-planned the bridge, misreporting a hand-edited SKILL.md as 'updated'/drift with an inert 'run lore agents' remedy and a self-contradicting force:false+action:updated payload -> now plans with the real force flag; protected+force:false, --force remedy in the trailer. (2) [correctness] upsertManagedBlock insert appended at EOF, so an unterminated code fence / <!-- comment swallowed the markers -> re-run duplicated the block -> now verify-after-insert re-locates the pair and fails loud (validation/exit6). (3) [correctness] non-atomic multi-file write could truncate the user's CLAUDE.md on crash -> switched to writeFileAtomic (temp+rename). (4) [cleanup] normalizeOnDisk only mapped CRLF -> broadened to strip leading BOM + lone CR (line-ending half of concept.ts normalizeInput), fixing false drift; comment corrected. (5) [correctness] insert stripped trailing whitespace (bytes outside the block) -> now preserves existing content byte-for-byte, adding only the blank-line separation. (6) [cleanup] locateLabeledMarkers duplicated findMarkers' scan -> extracted shared collectMarkerSpans (both call it; tasks-block behavior unchanged, full suite green). (7) [cleanup] labeledMarkerError duplicated markerError -> markerError now delegates. 1 finding refuted (renderTrailer predicate recompute, no divergence). Full suite 1333 pass; each fix smoke-verified end-to-end.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped `lore agents` via PR #40 (squash-merged to dev as 75faacb, promoted to main). Generates .claude/skills/lore/SKILL.md (a small, live-source-grounded teacher that points at 'lore instructions' -- AC#2) plus a marker-delimited CLAUDE.md nudge; idempotent, byte-identical re-run with a --check drift gate (exit 6 stale / 0 current) -- AC#1. Pure core/agent-bridge.ts + thin commands/agents.ts; the nudge upserts via a net-new upsertManagedBlock sharing a new collectMarkerSpans scanner with the shipped tasks-block engine. --force overwrites a hand-edited SKILL.md, else protected; atomic multi-file writes. Ran a high-effort workflow-backed code review (16 agents); all 7 findings fixed + regression-tested. Dogfooded in-repo. Full suite 1333 green; CI green on macos/ubuntu/windows + compile smoke.
<!-- SECTION:FINAL_SUMMARY:END -->
