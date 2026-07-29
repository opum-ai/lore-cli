# Handover — LCLI-24 (`lore link`/`unlink`) shipped, PR #35 awaiting review

**Date**: 2026-07-04 | **Grounded against**: `feat/lore-24-link-unlink`@`68250bf` (dev@`5b8921a`, unmoved) | **Backlog**: LCLI-24 **In Progress** (both ACs checked, plan+notes recorded, PR open); LCLI-26 **To Do** (blocked on LCLI-24 merging+Done); LCLI-27 **To Do** (already unblocked, independent of LCLI-24)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Then re-verify PR #35's live state
(`gh pr view 35 --json state,mergeable,mergeStateStatus,reviews`) — as of this
handover it's OPEN, CLEAN/mergeable, all 4 CI checks green, no reviews yet, and
the user (not the agent) merges lore PRs.

If #35 is now merged: run the standard finalize shorthand — sync dev via
`git pull --ff-only` (never --reset --hard, [[dev-sync-reset-wipes-backlog-edits]]),
mark LCLI-24 Done (`chore(LCLI-24): mark Done (delivered via #35)`), then pick up
the next unblocked task. LCLI-26 (`lore sync`) is now unblocked (deps LCLI-22/23/24
all Done) and is the natural next step — it's the first command that actually
WIRES reconcile.ts + managed-block.ts in. LCLI-27 (`lore check` drift gate) is
ALSO already independently unblocked (deps only LCLI-22/23) and doesn't need #35
merged at all, so it's a valid alternative if you'd rather not wait.

If #35 is still open/unreviewed: tell the user its state and ask whether to wait,
or (if they want to keep moving) start scoping LCLI-26/27 read-only (view the
tasks, re-read the relevant ADRs) without touching cli.ts/committing until #35's
fate is clear — LCLI-26 depends on this PR's `src/commands/link.ts` merging.

Locked decision to carry into LCLI-26 (already confirmed with the user, do not
re-ask): src/config.ts's `[reconcile.overrides]` has no consumer and no ADR-0009
semantics yet — the user chose "implement it + amend ADR-0009 §3" as part of
LCLI-26's work (not LCLI-24's — LCLI-24 never touched reconcile.ts). Design the
override semantics (does it bypass statusFlow position entirely for the matched
status? is the target added to the flow only for override purposes?) before
wiring reconcileStatus into `lore sync`.
```

## State

| Item | Status |
| --- | --- |
| PR #35 (`feat/lore-24-link-unlink` → `dev`) | **Open**, `CLEAN`/mergeable, 4/4 CI checks pass, 0 reviews. Not merged — awaiting the user. |
| **LCLI-24** (`lore link`/`unlink`) | **In Progress** (not Done — mark Done only after #35 merges+promotes). Both ACs checked; plan, implementation notes, and the full `/code-review max` triage recorded on the task. |
| **LCLI-26** (`lore sync`) | To Do, dep LCLI-22/23 (Done) + **LCLI-24** (blocks until #35 lands) |
| **LCLI-27** (`lore check` drift gate) | To Do, dep LCLI-22/23 (Done) — **already unblocked independent of #35** |
| `/code-review max` on PR #35 | Ran; 6 confirmed findings (0 refuted), all fixed in a follow-up commit (`20bf2f1`), triage posted as a PR comment and on the task notes |

## Next steps

1. Re-check PR #35's live state (see paste-ready prompt) — do not assume it's still exactly as this handover describes.
2. Once merged: `git pull --ff-only` on `dev`, mark LCLI-24 Done, pick LCLI-26 or LCLI-27 (either is a valid, independently-scoped next task).
3. For LCLI-26 specifically: resolve the `reconcile.overrides` design question (locked decision above — implement, don't re-ask) before wiring `reconcileStatus` in; also fold LCLI-22's still-outstanding deferred findings (`normalizeLink` throwing a bare `Error` on an absolute path instead of `LoreError`; the `offsetsOf`/`cell`/`escapeLinkText` DRY overlap across `rewrite.ts`/`indexes.ts`/`managed-block.ts`) if in scope.
4. LCLI-26 needs a way to read `backlog/config.yml`'s `statuses:` into a `StatusFlow` — no adapter method reads Backlog config yet; decide whether that's a new `BacklogAdapter` method or a command-layer YAML read (js-yaml already pinned, [[lore-serialization-invariants]]).

## Critical context / traps

- **`src/commands/link.ts` is the new proven shape for a Backlog-adapter-driven write command**: thin over `loadBundle` + `BacklogAdapter`, `prepare()` flushes advisories immediately after `loadBundle` (once, not twice — see "do not repeat" below), and — the pattern worth reusing for LCLI-26/27 — **per-task Backlog subprocess calls run concurrently via `Promise.allSettled`, catching each one's failure individually** rather than letting one bad task id abort the whole command. `lore sync`/`lore check` will process every linked task per Story too, so this same resilience pattern almost certainly applies there.
- **`toRefList`** (`src/core/bundle.ts`, now exported) is the shared, tolerant frontmatter-list reader (coerces a YAML scalar to a visible ref string rather than dropping it) — use it for any future command reading a frontmatter list field; don't write a second, less-tolerant copy.
- **Exit code `6` (`drift`) on partial back-ref failure**: `link`/`unlink` now exit non-zero if ANY per-task Backlog edit failed, even though the doc-side write and every other task's edit succeeded — the report (`kind: link.result`/`unlink.result`) names each task's actual outcome (`backRef: "added"|"already-present"|"removed"|"already-absent"|"skipped"|"failed"`, with an `error` string on `"failed"`).
- **Reads are JSON-only**; no adapter method yet reads `backlog/config.yml` — [[backlog-fork-checkout]] [[backlog-dependency-grep-trap]].
- **Post-merge sync**: `git pull --ff-only`, never `git reset --hard` — [[dev-sync-reset-wipes-backlog-edits]].
- **lore's finalize shorthand** ("state, commit, push, admin merge, prune, prompt to main /handover") is pre-authorized when the user says it verbatim — see [[lore-finalize-shorthand]] for the full decoded sequence. Not invoked yet this session since the user hadn't asked for it and PR #35 hasn't been reviewed.

## Do not repeat

- **Don't call `WarningCollector.flush()` more than once per command invocation** — it's non-draining by design (callers "flush exactly once"), so a second call double-prints every load advisory to stderr. This exact bug shipped in LCLI-24's first commit and was caught by `/code-review max`, not by the test suite (the tests never asserted on stderr *content*, only that things didn't throw) — the fix added a stderr-occurrence-count test specifically because this class of bug is otherwise invisible to a happy-path test suite.
- **Don't let a per-task loop over independent Backlog subprocess calls throw on the first failure when the caller processes N items** — the review's most-severe finding was exactly this shape (a mid-loop `editTask` throw aborting `runLink`/`runUnlink` with the rest silently unprocessed). Batch with `Promise.allSettled` and report per-item outcomes instead, from the start, rather than retrofitting it after review.

## System of record updated

- **LCLI-24** → both ACs checked; plan, implementation notes, and the full `/code-review max` triage recorded via `--append-notes` (not yet marked Done — that's a post-merge step).
- **PR #35** — code-review triage posted as a PR comment (matching the LCLI-22/23 precedent).
- **CHANGELOG.md** (Unreleased/Added) — the `lore link`/`lore unlink` entry, including the exit-6-on-partial-failure behavior added after the review fix.
- **`src/core/bundle.ts`** — `toRefList` exported (doc comment updated to note it's now shared with `link.ts`).
- **Predecessor handover** `HANDOVER-2026-07-02-LCLI-23-reconcile-shipped.md` (its LCLI-24 step now shipped as PR #35) → archived to `archive/handovers/` this session.
