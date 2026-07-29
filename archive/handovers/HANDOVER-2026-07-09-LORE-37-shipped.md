# Handover — LCLI-37 (`lore instructions` — layered agent guides) shipped, dev/main synced

**Date**: 2026-07-09 | **Grounded against**: `dev`/`main` @ `1916d43` | **Backlog**: LCLI-37 Done (shipped)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. LCLI-37 (lore instructions -- layered
agent guides) shipped via PR #39, squash-merged into `dev` as `7bdfb15` and
promoted to `main` (both branches identical at `1916d43`, which also includes a
follow-up `chore: mark Done` commit). No work is in flight; no PR is open.

No Backlog item is currently in progress. LCLI-36 (High priority: agents
SKILL.md + CLAUDE.md nudge) is now unblocked (its only dependency, LCLI-37, is
Done) and is the natural next pick. LCLI-25 (lore tasks) is also worth
considering: LCLI-37's own guide content had to explicitly tell agents "there
is no live-rollup command yet" because `lore tasks` isn't shipped -- building
it would let a future `lore instructions linking` stop caveating around a gap.
Ask the user which to pick, or check `backlog task list --plain --status "To
Do"` for the full backlog if neither fits.
```

## State

| Item | Status |
| --- | --- |
| PR #39 | Merged (squash) as `7bdfb15`; feature branch deleted (local + remote) |
| `dev` | `1916d43` (`7bdfb15` + a follow-up `chore: mark Done` commit) |
| `main` | `1916d43` (fast-forwarded to match `dev`, in two ff pushes) |
| LCLI-37 | Done |
| LCLI-36 | To Do, unblocked (was blocked on LCLI-37) — natural next pick |
| LCLI-25 | To Do — `lore tasks`, referenced as a known gap by LCLI-37's own shipped content |

## Next steps

1. Pick the next Backlog item with the user (LCLI-36 or LCLI-25 are the surfaced candidates above) — nothing is in progress.

## Critical context / traps

- **`/code-review max` on PR #39 found 12 CONFIRMED findings, all in the new guide *content* (`core/instructions.ts`), not the command plumbing.** Root cause: the first-pass prose was grounded in `docs/runbooks/agent-onboarding.md` — which describes lore's *full planned* agent loop, including the not-yet-shipped `lore tasks` (LCLI-25) — instead of being verified against live source. All 12 fixed in commit `9612834` on the (now-deleted) feature branch, folded into the squash-merge. **Lesson for any future `lore instructions`-style "teach an agent how the CLI behaves" content**: ground every factual claim (JSON `kind` values, exit codes, error_type mappings, severity tiers) in a direct `grep`/read of the actual source file that implements it — never trust an existing runbook/ADR/spec doc secondhand, even one that reads as authoritative, since those docs can (and did, here) describe aspirational/future state alongside current state without a visible seam between the two.
- **A specific, reusable trap confirmed this session**: `docs/reference/cli-contract.md`'s exit-code table documents `check`'s exit `6` as `error_type: drift` — but `check`'s own report-failure path *never throws a `LoreError` at all* (see `commands/check.ts`'s `exitFor`, a plain `report.errorCount > 0 ? EXIT_CODES.validation : EXIT_OK` return). So there is **no `--json` error envelope, and no literal `error_type` field, on check's exit-6 path** — the `drift` label in the contract table is a documentation category, not a runtime value an agent can branch on. Only `check`'s genuine `usage`/`not_found` cases (bad flag / bad root path) actually throw and carry an error envelope. Any future work describing `check`'s contract needs to preserve this distinction.
- **`git checkout -b <feature> dev` silently pulls in whatever is on local `dev` at that moment, even if unpushed.** This session's PR #39 unintentionally bundled a small unrelated commit (archiving a consumed handover file) into its squash-merge, because the feature branch was cut from local `dev` *after* that commit was made locally but *before* it was ever pushed to `origin/dev`. Harmless here (the bundled content was itself a trivial, wanted change), but it's why `git rebase origin/dev` on local `dev` afterward reported "patch contents already upstream" and dropped the commit as a no-op rather than duplicating it — that's the *expected*, correct resolution for this exact shape of divergence, not a sign of data loss. **Prefer pushing (or at least noting) any handover-restore-time commits made directly on `dev` *before* branching a new feature off it**, so a PR's diff never accidentally includes housekeeping unrelated to its own Backlog item.
- Two-step `main` fast-forward this session: `main` was pushed to `7bdfb15` first (matching the PR merge), then a second `chore: mark Done` commit landed on `dev` and `main` was fast-forwarded again to `1916d43`. If a future session finds `dev`/`main` one commit apart right after a "mark Done" edit, that's expected transient state until the ff-and-push follow-up runs — not drift to investigate.

## Do not repeat

- Don't ground agent-facing "how the CLI actually behaves" guidance in a narrative runbook/spec doc without also `grep`ing the implementing source file for each specific factual claim (kind strings, exit codes, severity tiers, which command commits what) — this is what produced all 12 review findings this session.

## System of record updated

- **LCLI-37** → Done, shipped via PR #39; full implementation + review-fix notes (what was wrong, what was fixed, verification evidence for both passes) recorded on the task via `backlog task edit --append-notes`/`--final-summary`.
- **dev/main** → both synced to `1916d43`; the feature branch (`feat/lore-37-instructions`) deleted (local + remote, plus a stale remote-tracking ref pruned).
- No new auto-memory this session — the "lore finalize shorthand" and "repro script import resolution"-style memories don't apply; the one genuinely reusable lesson (verify agent-facing guidance content against live source, not secondhand docs) is captured above and in the task notes, and is narrow enough to a single command's content that it doesn't yet warrant a standalone memory file — revisit if the same failure mode recurs on a future `lore instructions` topic addition.
