# Handover — LORE-24 (`lore link`/`unlink`/`rename --allow-missing`) PR #35 ready for merge

**Date**: 2026-07-06 | **Grounded against**: `feat/lore-24-link-unlink`@`5e7b8f6` (dev@`5b8921a`, unmoved) | **Backlog**: LORE-24 **In Progress** (both ACs checked, PR open + CI green, awaiting user merge); LORE-26 **To Do** (blocked on LORE-24 merging+Done); LORE-27 **To Do** (already unblocked, independent of LORE-24)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Then re-verify PR #35's live state:
`gh pr view 35 --json state,mergeable,mergeStateStatus,reviews` and `gh pr checks 35`.
As of this handover: OPEN, CLEAN/mergeable, 0 reviews, all 4 CI checks green
(ubuntu/macos/windows test jobs + compile smoke) — the user, not the agent, merges
lore PRs.

This session ran 10 rounds of workflow-backed `/code-review max` against PR #35,
each fixing what the prior round found, until round 10 came back with zero
findings across all 6 finder angles. Two scope expansions happened by explicit
user choice mid-loop (see `git log --oneline` on this branch for the full trail,
or LORE-24's task notes for the per-round triage):
  1. Round 6 found `lore rename` silently orphaned a renamed concept's Backlog
     doc: back-reference — the user chose to fix it now, so `lore rename` became
     Backlog-aware (moves `doc:<id>` + `--doc` for every linked task; async now;
     new `backRefs` field on `RenameReport`; exits `6` (drift) on a partial
     back-ref-move failure).
  2. Round 8 found a DIFFERENT gap: a concept relocated *outside* `lore rename`
     (git mv, hand edit) still left a permanently un-cleanable stale label — the
     user chose to fix this too, so `lore unlink <id> <taskId…> --allow-missing`
     now exists (unlink-only; tolerates `id` not resolving to a live concept,
     cleans up just the Backlog-side label/--doc, still guards against a case
     collision with a LIVE concept).
  3. Round 10 itself found ZERO findings (full convergence) — but checking live
     CI (not something the review workflow does) turned up a real Windows-only
     test failure: the round-6 `bunBacklogSpawn` cwd test spawned an external
     `pwd` binary, absent on Windows runners. Every local check this session ran
     on macOS, so this was invisible until CI actually ran on Windows. Fixed by
     spawning the current runtime binary (`process.execPath`) with an inline
     script instead — portable across all 3 CI platforms. Confirmed green after
     the fix (this handover's grounding SHA already includes it).

If PR #35 is STILL OPEN when you resume: there is no pending Claude-side work —
it's waiting on the user's review/merge. Do not re-run another review round
unless the user asks, or unless something material changed (a new commit landed,
someone else reviewed it, etc.) — re-verify drift first (stage below) rather than
assuming this handover is still accurate.

If #35 is now MERGED: run the standard finalize shorthand — sync dev via
`git pull --ff-only` (never `--reset --hard`, [[dev-sync-reset-wipes-backlog-edits]]),
mark LORE-24 Done (`chore(LORE-24): mark Done (delivered via #35)`), then pick up
LORE-26 (`lore sync`, now unblocked) or LORE-27 (`lore check`, already independently
unblocked). Locked decision to carry into LORE-26 (already confirmed with the user
in a PRIOR session, do not re-ask): `src/config.ts`'s `[reconcile.overrides]` has no
consumer and no ADR-0009 semantics yet — implement it + amend ADR-0009 §3 as part of
LORE-26's work. Design the override semantics (bypass statusFlow position entirely
for the matched status? target added to the flow only for override purposes?) before
wiring `reconcileStatus` into `lore sync`. LORE-26 will also need a way to read
`backlog/config.yml`'s `statuses:` into a `StatusFlow` — no adapter method reads
Backlog config yet; decide whether that's a new `BacklogAdapter` method or a
command-layer YAML read (js-yaml already pinned, [[lore-serialization-invariants]]).

Separately, worth a mention to the user (not yet a task): ADR-0009 §2 now documents
that recognizing (not just repairing) hand-relocation drift is `lore
orphans`/`lore check`'s job — i.e. LORE-26/27's territory, or a new follow-up task,
whichever the user prefers when that work starts.
```

## State

| Item | Status |
| --- | --- |
| PR #35 (`feat/lore-24-link-unlink` → `dev`) | **Open**, `CLEAN`/mergeable, 0 reviews, all CI green. Not merged — awaiting the user. |
| **LORE-24** (`lore link`/`unlink`/`rename` Backlog awareness) | **In Progress** (not Done — mark Done only after #35 merges+promotes). Both ACs checked. 10 rounds of `/code-review max` triage recorded on task notes, most-recent-first. |
| **LORE-26** (`lore sync`) | To Do, dep LORE-22/23 (Done) + **LORE-24** (blocks until #35 lands) |
| **LORE-27** (`lore check` drift gate) | To Do, dep LORE-22/23 (Done) — **already unblocked independent of #35** |
| 10th `/code-review max` pass | 0 findings — full convergence. |
| Live CI | All 4 checks green (verified this session, post Windows-cwd-test fix). |

## Next steps

1. Check PR #35's live state (drift check below) before doing anything — this handover assumes it's still open and green.
2. If still open: nothing pending from Claude's side; the ball is in the user's court. Only act if the user asks for changes or a new review round.
3. Once #35 merges: `git pull --ff-only` on `dev`, mark LORE-24 Done, pick LORE-26 or LORE-27 (see locked `reconcile.overrides` decision above for LORE-26).

## Critical context / traps

- **This branch has 21 commits**, alternating `fix(LORE-24): ...` and `docs(LORE-24): record the Nth code-review pass ...` — the task notes on LORE-24 have the full per-round finding/fix trail if you need historical detail; don't re-derive it from the diff.
- **`src/commands/link.ts` is now the single owner of the `doc:<conceptId>` Backlog-label contract** — `moveBackRefs`, `assertNoLabelCaseCollision`, `assertNoCommaInId`, `dedupeTaskIds`, and `defaultAdapter` are all exported from there and consumed by `commands/rename.ts`. Any future command touching this coupling (e.g. `lore sync`/`orphans`) should likely go through the same module rather than re-deriving the label rules.
- **Local test runs on this machine are macOS-only** — the Windows CI failure this session only surfaced on a real Windows runner. If you add a new test that spawns a subprocess, prefer `process.execPath` (the current runtime) over an external binary like `pwd`/`ls`/etc. unless you've confirmed it's on PATH on all 3 CI platforms.
- **Case-insensitive-filesystem constraint on tests**: several guards this session (case-collision detection) can't be integration-tested via two real on-disk files on mac/Windows (they'd collide as the same path) — the established workaround is unit-testing the exported guard function directly against an in-memory `buildGraph`/`parseConcept` graph (see `assertNoLabelCaseCollision`'s tests in `test/link.test.ts`), not trying to force a real-file reproduction.
- **`--allow-missing` is unlink-only** — `link` rejects it as an unknown flag (adding `tasks:` to a nonexistent concept file is meaningless).

## Do not repeat

- Don't assume a locally-green `bun test` run means CI will pass — this session shipped a Windows-only failure invisible on macOS for several rounds. If a test spawns an external process, check its cross-platform availability, not just correctness.
- Don't reuse case-insensitive `.includes()`-style exact-string matching for a value that was *reconstructed/guessed* (like `--allow-missing`'s `docPath`) rather than read from a live source of truth — round 9 found this exact class of bug (label matching was already case-insensitive, doc-path matching wasn't, silently stranding data). When two related fields should agree on match semantics, make sure a fix to one didn't leave the other behind.

## System of record updated

- **LORE-24** → every one of the 10 review-round triages appended via `--append-notes`, plus the Backlog-awareness and `--allow-missing` design decisions.
- **PR #35** — rounds 1–2's triage posted as PR comments (matching original precedent); later rounds recorded on task notes only (comment volume would have been excessive at this depth) — task notes are the complete record.
- **`docs/adr/0009-story-task-coupling-reconciliation.md`** § 2 — amended three times this session as the design evolved: case-preserving label + collision guard, `lore rename`'s actual back-ref-moving behavior, and finally `--allow-missing`'s recovery path for hand-relocated concepts.
- **`docs/reference/cli-surface.md`** — `link`/`unlink`/`rename` sections updated with accurate exit-code tables (closing pre-existing gaps predating this session) and the new `--allow-missing` flag.
- **`CHANGELOG.md`** (Unreleased) — the LORE-24 bullet amended incrementally to describe the final shipped behavior (link/unlink guards, rename's Backlog awareness, `--allow-missing`).
- **Predecessor handover** `HANDOVER-2026-07-05-LORE-24-pr35-open.md` (superseded by this one, same topic) → archived to `archive/handovers/` this session.
