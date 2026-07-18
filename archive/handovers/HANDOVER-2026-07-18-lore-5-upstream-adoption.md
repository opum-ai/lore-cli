# Handover — Adopt upstream's `--json` contract; LORE-53/54 opened for the engineering work (LORE-5, LORE-53, LORE-54)

**Date**: 2026-07-18 | **Grounded against**: `dev` @ `d12dbd3` (clean working tree, no open PRs, 5 commits ahead of `origin/dev`) | **Backlog**: LORE-5 In Progress (umbrella, unchanged scope going forward); LORE-53 To Do (ready, no deps); LORE-54 To Do (blocked on LORE-53)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`.

Context: MrLesk/Backlog.md (the upstream we'd been trying to open a --json PR
against, tracked on LORE-5) shipped its own independent --json implementation
— PR #790 (BACK-545), merged 2026-07-16, closing issue #784 before our fork's
prior-art reply even posted. The user decided: adopt upstream's contract
directly instead of upstreaming our own fork (jeremy-newhouse/Backlog.md).
That decision is fully flushed into the system of record (see below) and two
follow-up tasks are open for the actual engineering:

- LORE-53 (To Do, no deps, ready to start): pin lore's Backlog.md dependency
  to upstream's --json commit (interim git dependency at/past PR #790's merge
  commit 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0, since no tagged release
  contains it yet), and update the capability probe to recognize upstream's
  real envelope shape.
- LORE-54 (To Do, depends on LORE-53): rewrite src/adapters/backlog.ts's
  envelope parsing, Zod schemas, and probe against upstream's real contract;
  fix viewTask's missing-task detection (upstream now exits 1 on not-found,
  not the fork's exit-0-empty-stdout signal); recapture the golden test
  fixtures; rewrite docs/reference/backlog-json-schema.md §1-7 to describe
  upstream's shape as current once migrated.

Pick up LORE-53 first (it's unblocked). Read its full description/ACs via
`backlog task view LORE-53 --plain`, and read
docs/reference/backlog-json-schema.md §8 (the full envelope/kind/field
comparison table) before touching any code — it's the contract of record for
what LORE-53/54 are migrating to.

No code has been written yet for either task — this was a decision +
docs + task-creation session only, no implementation. Nothing is blocking
LORE-53 from starting immediately.

Also: 5 commits are sitting on `dev`, unpushed to `origin/dev` (all
docs/backlog bookkeeping, no code). Check with the user before pushing —
it wasn't asked for this session.
```

## State

| Item | Status |
| --- | --- |
| `dev` | `d12dbd3`, clean, **5 commits ahead of `origin/dev`** (not pushed — wasn't requested) |
| LORE-5 | In Progress; re-scoped description + both ACs to "adopt upstream" framing; now depends on `LORE-3, LORE-4, LORE-53, LORE-54` |
| LORE-53 | **To Do, no dependencies — ready to start** (pin git dep to upstream's commit; update probe) |
| LORE-54 | To Do, depends on LORE-53 (rewrite the adapter against upstream's real contract) |
| Issue [MrLesk/Backlog.md#784](https://github.com/MrLesk/Backlog.md/issues/784) | Closed by MrLesk (`completed`) 2026-07-16, via PR #790 — no further upstream action pending from lore's side |
| No open PRs, no feature branch | All this session's work committed directly to `dev` (docs/backlog bookkeeping — matches this project's established direct-to-`dev` pattern for that kind of commit) |

## Next steps

1. Start LORE-53 (unblocked): wire the git dependency / build tooling to consume `MrLesk/Backlog.md` pinned at or past commit `22a091b570d44c4f302ca47e7fd36fa28ad8bcb0`, and update the capability probe's dry `task list --json` assertion to upstream's real envelope (`schemaVersion: 1` as a **number**, `kind: "task-list"`, a `tasks` array — not the fork's `kind:"taskList"`/`data`).
2. Then LORE-54: rewrite `src/adapters/backlog.ts` (envelope parsing, `EnvelopeSchema`/`TaskSchema`/`TaskSummarySchema`/`SearchHitSchema`, `probeBacklog`), fix `viewTask`'s missing-task detection (nonzero exit now, not empty-stdout), recapture `test/backlog-json-golden.test.ts`'s fixtures, and rewrite `docs/reference/backlog-json-schema.md` §1-7 once migrated (currently marked "what's shipped today," not final).
3. Before either: re-read `docs/reference/backlog-json-schema.md` §8 — it's the single place the full old-fork-vs-upstream contract diff lives (envelope shape, `schemaVersion` type, `kind` spelling, field differences, exit-code flip).
4. Confirm with the user before pushing `dev` to `origin/dev` (5 commits sitting local-only).

## Critical context / traps

- **`task edit --dep`/`--depends-on` is SET/REPLACE, not accumulate** — confirmed the hard way this session: `backlog task edit LORE-5 --dep LORE-53 --dep LORE-54` silently dropped LORE-5's existing `LORE-3, LORE-4` dependencies. Had to re-run with all four IDs together. Always pass the **full** desired dependency list on `edit`, never assume it's additive like `task create --dep` is.
- **Backlog's task-ID allocator reuses archived IDs.** Creating a new task this session got assigned `LORE-53` — the *same* ID as an already-archived-as-duplicate task from an earlier session (`Reconcile-stale-remark-unified-doc-references`, now in `backlog/archive/tasks/`). This is expected/safe (archived tasks don't collide with active ones for `--plain` lookups — verified no ambiguous-ID error), not a repeat of the earlier LORE-52/53 *active-vs-active* collision bug, but it reads confusingly in git history/memory if you don't know this.
- **`src/adapters/backlog.ts` as it stands today would fail its own capability probe against upstream's real `--json` output.** Not a partial-compat situation — wrong `kind` strings, no top-level `data` key to read at all. LORE-54 is a genuine rewrite, not a floor bump.
- **Upstream's PR #790 is merged to `main` but NOT in a tagged release** (latest tag `v1.48.0` predates the 2026-07-16 merge). LORE-53's pinned-commit approach is explicitly the *interim* step; watch for a new tag and switch to the real published package + bump the floor when one ships (noted as a natural extension of LORE-53, not a separate task).
- **No package.json git dependency exists yet** — the adapter currently just shells whatever `backlog` binary is on `PATH`; LORE-53 is greenfield wiring, not editing an existing dependency entry.

## Do not repeat

- Don't re-litigate the "should lore adopt upstream vs. keep pushing our own fork PR" decision — the user already decided this explicitly this session ("adopt the upstream, use their patched version for now until the commit lands in a release"). It's flushed into ADR-0002's amendment, the schema/CLI-contract docs' migration-notice banners, and the runbook's §8 rewrite. Treat it as settled.
- Don't assume `docs/reference/backlog-json-schema.md` §1-7 describes the target contract — it's explicitly marked (via the migration-notice banner added this session) as "what's shipped in code today" (the fork's shape). §8 is the target. This distinction matters for LORE-54: don't build against §1-7.

## System of record updated

- **LORE-5** → drift findings (issue #784 closure, PR #790 discovery), a full contract-comparison note, the adoption decision, and a re-scoped description + both ACs (old "open an upstream PR" framing retired). Dependencies updated to `LORE-3, LORE-4, LORE-53, LORE-54`.
- **LORE-53, LORE-54** → created fresh this session with full descriptions, ACs, labels, milestone `m-0`, and doc links; not yet started.
- **`docs/adr/0002-backlog-integration-json-only.md`** → amendment noting Decision items 1 (fork it ourselves) and 4 (upstream a PR) are superseded; rest of the ADR stands.
- **`docs/reference/backlog-json-schema.md`** → migration-notice banner + new §8 with the full envelope/`kind`/field/exit-code comparison table (fork vs. upstream PR #790) and the interim pinned-commit plan.
- **`docs/reference/backlog-cli-contract.md`** → migration-notice banner; §2.2 and §5 each flagged with the specific fact that flips once migrated.
- **`docs/runbooks/backlog-json-patch.md`** → top-of-file "Superseded" banner (§1-7 now historical record only); §8 rewritten into the concrete adoption plan (retire fork → pin upstream commit → rewrite adapter → switch to a real release later).
- **Stray/superseded handover cleanup**: archived `HANDOVER-2026-07-16-post-lore40-next-steps.md` (its "check issue #784" step was resolved and superseded by this session's work) — also caught and corrected an earlier session's partially-committed archive copy of the same file.
