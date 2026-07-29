# Handover — LCLI-36 (`lore agents` — agent bridge) shipped, dev/main synced

**Date**: 2026-07-09 | **Grounded against**: `dev`/`main` @ `a3cb4d4` | **Backlog**: LCLI-36 Done (shipped via PR #40)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. LCLI-36 (lore agents — the Claude Code
agent bridge) shipped via PR #40, squash-merged into `dev` as `75faacb` and
promoted to `main`; both branches are identical at `a3cb4d4` (which includes a
follow-up `chore: mark Done` commit). No work is in flight; no PR is open; the
feature branch is pruned (local + remote).

No Backlog item is currently in progress. Natural next picks:
- LCLI-38 (lore help --json capability manifest) — completes the agent-facing
  surface (agents/instructions/help); a machine-readable command manifest that
  could later BACK the SKILL.md command list `lore agents` currently hardcodes in
  core/agent-bridge.ts's LORE_COMMANDS (turning that curated list registry-driven —
  a follow-up this task deliberately deferred).
- LCLI-25 (lore tasks) — the recurring gap both `lore instructions` and `lore
  agents` had to caveat around ("no live-rollup command yet"); building it lets
  future agent-facing content stop hedging.
- LCLI-32 (lore orphans), LCLI-49 (retrofit link/unlink/rename to commit backlog/
  via state.ts) are also open.
Ask the user which to pick, or `backlog task list --plain --status "To Do"`.
```

## State

| Item | Status |
| --- | --- |
| PR #40 | Merged (squash) as `75faacb`; feature branch `feat/lore-36-agents` deleted (local + remote) |
| `dev` | `a3cb4d4` (`75faacb` + a follow-up `chore(LCLI-36): mark Done` commit) |
| `main` | `a3cb4d4` (fast-forwarded to match `dev`) |
| LCLI-36 | Done (both ACs checked; final-summary recorded) |
| CI on #40 | All 4 green before merge: lint·typecheck·test on macos/ubuntu/windows + compile-smoke ubuntu |

## Next steps

1. Pick the next Backlog item with the user (LCLI-38 / LCLI-25 surfaced above) — nothing is in progress.

## Critical context / traps

- **`lore agents` is now dogfooded in-repo**: the repo carries `.claude/skills/lore/SKILL.md` (a tracked, generated file) and a `<!-- lore:agents:begin/end -->` managed block appended to `CLAUDE.md`. If you ever change the generated content in `src/core/agent-bridge.ts` (`buildSkillDoc`/`buildNudgeBody`/`LORE_COMMANDS`), you MUST re-run `lore agents --force` in the repo to refresh the committed bridge — otherwise `lore agents --check` (the drift gate, exit 6 stale / 0 current) goes red. A hand-edited `SKILL.md` is left `protected` and needs `--force`, not a plain run.
- **New shared managed-block engine** (`src/core/managed-block.ts`): LCLI-36 added the generic `upsertManagedBlock(content, {label, body})` — the **insert-or-update** sibling of `regenerateTaskBlock`. Both now share one `collectMarkerSpans` scanner. For any future lore-owned block in a **user-authored** file (e.g. AGENTS.md `@import`), reuse `upsertManagedBlock`, NOT `regenerateTaskBlock` (which requires an author-placed pair and throws if absent). See [[lore-no-md-serializer]].
- **Do not remove the verify-after-insert guard** in `upsertManagedBlock`: it re-locates the pair in the inserted result and throws `validation` if an unterminated code fence / `<!--` comment at EOF swallowed the appended markers — without it, a re-run silently *duplicates* the block. This was a CONFIRMED /code-review finding.
- The SKILL.md content is grounded in **live source, not the runbook** (names only real commands — no unshipped `lore tasks`), enforced by a lockstep test in `test/agents.test.ts` that drives each advertised command through the real router. Any future agent-facing content must keep that discipline (the LCLI-37 phantom-command trap).

## Do not repeat

- First-pass `lore agents` planned the bridge with `force: true` under `--check`, which broke the gate: a hand-edited (`protected`) SKILL.md was misreported as `updated`+drift with an inert "run `lore agents`" remedy (permanently-red CI) and a self-contradicting `force:false`+`action:updated` payload. Fixed pre-merge (plan with the real flag; report `protected`; remedy says `--force`). Lesson for any `--check`/drift gate over a "protected differing file" discipline: **do not force the plan — report the real action** so the payload and remedy stay honest.

## System of record updated

- **LCLI-36** → Done, shipped via PR #40; full implementation + code-review-fix notes (7 findings, itemized) + final-summary recorded on the task.
- **CHANGELOG.md** → `## [Unreleased] → Added` entry for `lore agents` (landed in the squash-merge).
- **dev/main** → both synced to `a3cb4d4`; feature branch pruned (local + remote).
- **Auto-memory** → updated [[lore-no-md-serializer]] with the generic `upsertManagedBlock`/`collectMarkerSpans` engine, the verify-after-insert guard, and the dogfooded-bridge state.
