# Handover — LCLI-24 (`lore link`/`unlink`) PR #35 open, 2nd code-review pass pending a fix decision

**Date**: 2026-07-05 | **Grounded against**: `feat/lore-24-link-unlink`@`5caec0c` (dev@`5b8921a`, unmoved) | **Backlog**: LCLI-24 **In Progress** (both ACs checked, PR open, 2nd review triage recorded); LCLI-26 **To Do** (blocked on LCLI-24 merging+Done); LCLI-27 **To Do** (already unblocked, independent of LCLI-24)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Then re-verify PR #35's live state
(`gh pr view 35 --json state,mergeable,mergeStateStatus,reviews`) — as of this
handover it's OPEN, CLEAN/mergeable, no reviews, and the user (not the agent)
merges lore PRs.

This session ran a SECOND `/code-review max` pass on PR #35 (the first pass's 6
findings were already fixed in 20bf2f1, per the predecessor handover). The second
pass found 10 more distinct, independently-verified defects (0 refuted) — full
detail posted as a PR comment (github.com/jeremy-newhouse/lore/pull/35#issuecomment-4887108051)
and on LCLI-24's task notes. NONE of these 10 are fixed yet. The user was asked
"fix now vs. just record" and ended the session before answering — that decision
is the first thing to resolve.

If the user wants to fix: the two most severe are genuine data-integrity bugs,
prioritize those first —
  1. src/commands/link.ts:252 — runUnlink applies Backlog mutations BEFORE the
     doc-side tasks: frontmatter write (opposite of runLink's order) — a doc-write
     failure strands already-applied Backlog changes with zero report. Fix: match
     runLink's order (write the doc first), or make the two writes recoverable/
     reported independently.
  2. src/commands/link.ts:314 — backRefLabel() lowercases the concept id, so two
     concepts differing only by case collide on one Backlog label and unlinking one
     can strip the other's real back-reference. Fix: likely needs case-preserving
     label encoding, or a documented constraint that concept ids must be
     case-distinct (check idFromPath/buildGraph for existing case-collision
     handling before choosing).
  The other 8 (3 more correctness, 1 plausible race, 1 idempotency/no-op gap, 3
  cleanup/DRY) are listed in full on the PR comment and LCLI-24's notes — don't
  re-derive them, read those.

If the user wants to just record and ship as-is: no further action needed this
session beyond what's already posted; when the user merges #35, proceed straight
to the standard finalize path (git pull --ff-only on dev, mark LCLI-24 Done, pick
LCLI-26 or LCLI-27 next — see predecessor context below, still accurate).

If #35 is now merged: run the standard finalize shorthand — sync dev via
`git pull --ff-only` (never --reset --hard, [[dev-sync-reset-wipes-backlog-edits]]),
mark LCLI-24 Done (`chore(LCLI-24): mark Done (delivered via #35)`), then pick up
LCLI-26 (`lore sync`, now unblocked) or LCLI-27 (`lore check`, already independently
unblocked). Locked decision to carry into LCLI-26 (already confirmed with the user,
do not re-ask): src/config.ts's `[reconcile.overrides]` has no consumer and no
ADR-0009 semantics yet — implement it + amend ADR-0009 §3 as part of LCLI-26's work.
Design the override semantics (bypass statusFlow position entirely for the matched
status? target added to the flow only for override purposes?) before wiring
reconcileStatus into `lore sync`.
```

## State

| Item | Status |
| --- | --- |
| PR #35 (`feat/lore-24-link-unlink` → `dev`) | **Open**, `CLEAN`/mergeable, 0 reviews. Not merged — awaiting the user. |
| **LCLI-24** (`lore link`/`unlink`) | **In Progress** (not Done — mark Done only after #35 merges+promotes). Both ACs checked; 1st-pass review (6 findings, fixed) and 2nd-pass review (10 findings, **not yet fixed**) both recorded on task notes. |
| **LCLI-26** (`lore sync`) | To Do, dep LCLI-22/23 (Done) + **LCLI-24** (blocks until #35 lands) |
| **LCLI-27** (`lore check` drift gate) | To Do, dep LCLI-22/23 (Done) — **already unblocked independent of #35** |
| 2nd `/code-review max` pass on PR #35 | Ran; 10 confirmed findings (0 refuted, 1 of the 10 is PLAUSIBLE-confidence not CONFIRMED), posted as a PR comment and on task notes. **Awaiting a fix-now-vs-ship-as-is decision from the user.** |

## Next steps

1. Resolve the pending decision: fix the 10 new findings on this branch before merge, or ship #35 as-is (findings are already durably recorded either way) — ask the user if not already answered.
2. If fixing: prioritize the two data-integrity bugs (write-order strand, case-collision label) — see paste-ready prompt above for specifics; re-run `/code-review max` on PR #35 afterward to verify the fixes and check nothing new was introduced (matches the precedent set by the 1st-pass fix-then-reverify cycle).
3. Once #35 merges: `git pull --ff-only` on `dev`, mark LCLI-24 Done, pick LCLI-26 or LCLI-27.
4. For LCLI-26 specifically: resolve the `reconcile.overrides` design question (locked decision above) before wiring `reconcileStatus` in.
5. LCLI-26 needs a way to read `backlog/config.yml`'s `statuses:` into a `StatusFlow` — no adapter method reads Backlog config yet; decide whether that's a new `BacklogAdapter` method or a command-layer YAML read (js-yaml already pinned, [[lore-serialization-invariants]]).

## Critical context / traps

- **The 2nd-pass findings are all still live in the code** — nothing in this session's review changed `link.ts`. Do not assume `20bf2f1` covers them; that commit only fixed the 1st pass's 6 findings.
- **`src/commands/link.ts` is the new proven shape for a Backlog-adapter-driven write command**: thin over `loadBundle` + `BacklogAdapter`, advisories flushed once, per-task Backlog subprocess calls run concurrently via `Promise.allSettled` (LCLI-26/27 will process every linked task per Story too — same resilience pattern almost certainly applies).
- **`toRefList`** (`src/core/bundle.ts`, exported) is the shared, tolerant frontmatter-list reader — reuse for any future command reading a frontmatter list field.
- **Exit code `6` (`drift`) on partial back-ref failure** is already correctly implemented (1st-pass fix) — the 2nd-pass write-order finding (link.ts:252) is a *different* failure mode (doc-write failure after Backlog succeeded, not a Backlog failure).
- **Reads are JSON-only**; no adapter method yet reads `backlog/config.yml` — [[backlog-fork-checkout]] [[backlog-dependency-grep-trap]].
- **Post-merge sync**: `git pull --ff-only`, never `git reset --hard` — [[dev-sync-reset-wipes-backlog-edits]].
- **lore's finalize shorthand** ("state, commit, push, admin merge, prune, prompt to main /handover") is pre-authorized when the user says it verbatim — [[lore-finalize-shorthand]]. Not invoked yet — PR #35 hasn't been reviewed/merged by the user.

## Do not repeat

- Nothing new failed this session — the review found defects but no approach taken by the agent this session was itself wrong. (Predecessor handover's "do not repeat" items — double `WarningCollector.flush()`, throw-on-first-failure loops — are already fixed in `20bf2f1` and don't need repeating here.)

## System of record updated

- **LCLI-24** → 2nd-pass `/code-review max` triage (10 findings) appended via `--append-notes`.
- **PR #35** — 2nd-pass triage posted as a PR comment (github.com/jeremy-newhouse/lore/pull/35#issuecomment-4887108051), matching the 1st-pass precedent.
- **Predecessor handover** `HANDOVER-2026-07-04-LCLI-24-pr35-open.md` (superseded by this one, same topic) → archived to `archive/handovers/` this session.
