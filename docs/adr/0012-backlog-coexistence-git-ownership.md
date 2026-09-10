---
type: ADR
title: "ADR-0012: Backlog operational coexistence & git ownership"
description: How lore coexists on disk with Backlog.md without fighting it for control of the working tree and git — lore is the sole committer of backlog/, Backlog runs with auto_commit/check_active_branches/remote_operations all false, writes are single-writer with only ID allocation locked, and task .md files are never written directly.
tags: [adr, backlog, git, auto-commit, branches, locking, determinism, coexistence]
summary: lore exclusively commits backlog files using deterministic current-branch Backlog settings and serialized CLI-managed writes.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0012: Backlog operational coexistence & git ownership

## Status

Accepted — 2026-06-21

## Context

`lore` couples repo-resident OKF docs to Backlog.md tasks
([ADR-0002](0002-backlog-integration-json-only.md)). That coupling assumes a
simple, deterministic relationship between three things: the bytes on disk under
`backlog/`, what the `backlog` CLI reports, and what git has committed. By
default, Backlog.md breaks all three assumptions in ways that are invisible until
they corrupt a `lore sync` run, a CI drift gate, or an agent edit loop.

We verified the following behaviors against the Backlog.md source (the same
codebase `lore` consumes as a `--json`-capable fork, see
[the patch runbook](../runbooks/backlog-json-patch.md)):

1. **`auto_commit: true` makes Backlog the committer — of *everything*.** With
   `auto_commit` enabled, every mutating Backlog operation (`task create`,
   `task edit`, status changes) runs `git add backlog/` over the **whole
   directory** and commits. That stage is not scoped to the single task file
   Backlog just touched: it sweeps up *any* uncommitted change anywhere under
   `backlog/`. So an in-flight, not-yet-committed `lore` edit — a managed-block
   regeneration in progress, a half-applied batch — gets silently captured into a
   Backlog-authored commit with a Backlog commit message, splitting one logical
   change across two committers and producing commits `lore` did not author and
   cannot reason about.

2. **Cross-branch reads disagree with current-branch reads.** Backlog.md has a
   "cross-branch" mode (`check_active_branches`) in which `task <id>` /
   `task view` and `search` consult task state across *other* git branches, not
   just the checked-out one. The result: `backlog task view task-42` (cross-branch)
   can report a status or even an existence that does **not** match
   `backlog task list` and the actual files in the current working tree. For a
   tool whose entire job is reconciling doc status against task status
   ([ADR-0008](0008-managed-block-remark-ast.md)), "the same task has two
   answers depending on which command asked" is fatal: drift detection becomes
   nondeterministic and depends on the state of branches `lore` never looked at.

3. **`remote_operations: true` lets reads/writes touch the network.** Backlog
   can perform git remote operations (fetch/pull-ish behavior to populate
   cross-branch state) as a side effect of ordinary commands. That introduces
   network latency, non-determinism, and failure modes into what `lore` needs to
   be a pure, offline, local-filesystem read.

4. **`backlog/.locks/` is operational, not source.** Backlog uses lock files
   under `backlog/.locks/` for concurrency control. These are transient runtime
   artifacts, not content; committing them produces noisy diffs and spurious
   merge conflicts.

`lore` is built to be **agent/CI-safe**: deterministic, non-interactive,
idempotent, with semantic exit codes. Every one of the four behaviors above
violates determinism — the same `lore` command can produce different results, or
different commit graphs, depending on `auto_commit` timing, other branches, or
the network. The fix is to take Backlog out of the driver's seat for git and
branches, and make `lore` the single, predictable owner of the `backlog/`
working tree.

This ADR is about **operational coexistence on disk and in git**; the *data
channel* (JSON envelope, write commands, label back-references) is
[ADR-0002](0002-backlog-integration-json-only.md). The two are complementary:
ADR-0002 governs *what* `lore` reads and writes; this ADR governs *who commits
it and on which branch*.

## Decision

**`lore` is the sole committer of `backlog/`. Backlog.md is configured for pure,
current-branch, offline, local determinism, and `lore` performs all git
operations on task files itself. Writes are single-writer (serialized); only ID
allocation is locked, and concurrent edits are last-write-wins.**

Concretely, in every `lore`-managed project:

1. **`auto_commit: false` — `lore` is the sole committer of `backlog/`.**
   Backlog.md never runs `git add`/`git commit`. After a write
   (`backlog task create` / `backlog task edit`, performed per
   [ADR-0002](0002-backlog-integration-json-only.md)), `lore` itself stages
   **only the specific task file(s) it intended to change** and commits them.
   Because Backlog no longer does a blanket `git add backlog/`, an in-flight
   `lore` edit elsewhere in `backlog/` can never be swept into a foreign commit.
   One logical change → one committer → one commit, authored by `lore`.

2. **`check_active_branches: false` — current-branch only.** Backlog reads only
   the checked-out branch's task state. `task view`/`task list`/`search` and the
   files on disk now agree by construction: on-disk state **equals** CLI state
   **equals** current-branch state. This is the property the drift gate
   ([ADR-0008](0008-managed-block-remark-ast.md)) depends on — a single,
   authoritative answer per task.

3. **`remote_operations: false` — offline, no network side effects.** Backlog
   performs no git remote operations as a side effect of any command. `lore`'s
   reads are pure local-filesystem reads: no fetch, no latency, no network
   failure mode, fully reproducible in an air-gapped CI runner.

4. **`backlog/.locks/` is gitignored.** Backlog's lock files are operational
   artifacts and are excluded from version control so they never pollute diffs or
   cause merge conflicts. (`lore init` writes/ensures this `.gitignore` entry.)

5. **Single-writer, serialized writes; only ID allocation is locked.** `lore`
   does not run concurrent mutating Backlog commands. Writes are serialized
   within a `lore` invocation. The one genuinely contended resource is **new task
   ID allocation** — two creates must not be handed the same ID — so that step is
   guarded (Backlog's own create path allocates the next ID; `lore` serializes
   creates so the allocation is observed atomically and captures the ID from the
   `Created task <ID>` stdout line per [ADR-0002](0002-backlog-integration-json-only.md)).
   Everything else is **last-write-wins**: `lore` does not attempt
   optimistic-locking or three-way-merge semantics on individual task-field
   edits. The cost of a lost concurrent field edit is low and recoverable; the
   complexity of a distributed write protocol is not worth it for a single-user,
   single-process CLI.

6. **Never write `backlog/tasks/*.md` directly.** All task mutation goes through
   the Backlog CLI (`task create` / `task edit`), as established in
   [ADR-0002](0002-backlog-integration-json-only.md). `lore`'s *only* direct
   filesystem action against `backlog/` is the **git staging/commit** of files
   Backlog itself wrote — never authoring or rewriting task content by hand.

`lore init` sets keys (1)–(4) in `backlog/config.yml` when it adopts a project,
and `lore check` includes a configuration-drift assertion: if a managed
project's Backlog config has drifted back to `auto_commit: true`,
`check_active_branches: true`, or `remote_operations: true`, `lore check` reports
it as drift (validation/drift exit code `6`) so the determinism guarantees cannot
silently regress. The exact config keys and commands are documented in the
[Backlog.md CLI contract](../reference/backlog-cli-contract.md); the data-channel
rules they sit alongside are in [ADR-0002](0002-backlog-integration-json-only.md)
and the [lore design spec](../specs/lore-design.md).

## Consequences

### Positive

- **Deterministic by construction.** On-disk state, CLI output, and the current
  branch always agree (keys 2–3), and the same `lore` command produces the same
  result on any machine, offline, regardless of other branches or the network.
  This is the precondition for the [drift gate](0008-managed-block-remark-ast.md)
  to be sound.
- **Clean, attributable git history.** With Backlog out of the committer role
  (key 1), every `backlog/` commit is authored by `lore`, scoped to the files of
  one logical change, with a message `lore` controls. No more split commits, no
  surprise Backlog-authored commits sweeping in unrelated in-flight edits.
- **Safe agent/CI loops.** An agent's edit → sync → commit cycle cannot be
  interrupted by Backlog auto-committing mid-edit, cannot stall or fail on a
  network call, and cannot get a different drift answer because some other branch
  moved. Combined with byte-identical managed-block output
  ([ADR-0008](0008-managed-block-remark-ast.md)), a no-op sync is a true no-op.
- **No lock-file noise.** Gitignoring `backlog/.locks/` keeps diffs and merges
  clean (key 4).
- **Minimal, simple write model.** Single-writer + last-write-wins (key 5) keeps
  `lore` small: no merge engine, no optimistic-locking protocol, just serialized
  CLI writes plus a guarded ID allocation.
- **Self-healing guarantee.** `lore check` flags config regressions, so the
  coexistence contract is enforced continuously rather than assumed.

### Negative / tradeoffs

- **`lore` must reliably do the committing.** Responsibility for committing
  `backlog/` moves to `lore`; if a `lore` write succeeds but its subsequent
  `git add`/`commit` fails (e.g. a dirty index, a pre-commit hook rejection),
  the project can be left with an uncommitted Backlog change. `lore` must surface
  that clearly (semantic exit code) rather than leaving it silent; this is a real
  edge it now owns that Backlog's `auto_commit` used to paper over.
- **Reconfiguring users' Backlog projects.** Adopting `lore` forces three config
  changes (`auto_commit`, `check_active_branches`, `remote_operations`) on an
  existing Backlog setup. Users who relied on Backlog's auto-commit or
  cross-branch features in those repos lose them in the `lore`-managed flow. This
  is intentional and documented, but it is a behavioral change imposed on the
  host project.
- **Cross-branch task views are gone.** Disabling `check_active_branches` means
  `lore` (and `backlog` while configured this way) cannot answer "what is this
  task's status on another branch." That is the correct tradeoff for
  determinism, but teams that used cross-branch awareness lose it within the
  `lore`-managed workflow.
- **Last-write-wins can drop a concurrent edit.** Two overlapping edits to the
  same task field will not be merged; the later write wins. For the single-user,
  single-process CLI this targets the risk is low, but it is a deliberate
  non-guarantee, not an oversight.
- **Offline-only by design.** With `remote_operations: false`, any workflow that
  expected Backlog to fetch/sync remote branch state automatically must do that
  via plain git outside `lore`.

## Alternatives considered

1. **Leave `auto_commit: true` and let Backlog commit.** Rejected: the blanket
   `git add backlog/` sweeps in-flight `lore` edits into Backlog-authored
   commits, splitting one logical change across two committers and producing
   commits `lore` neither authored nor controls. Incompatible with clean,
   attributable history and with multi-step `lore sync` operations that touch
   several files before committing once.

2. **Keep `check_active_branches: true` and reconcile across branches in
   `lore`.** Rejected: it makes `task view`/`search` disagree with
   `task list` and on-disk state, so the same task has two answers depending on
   which command asks and which branches exist. The drift gate
   ([ADR-0008](0008-managed-block-remark-ast.md)) cannot be deterministic on top
   of that, and `lore` would have to model every branch it never checked out.

3. **Allow `remote_operations: true` for richer cross-branch/remote state.**
   Rejected: introduces network latency, nondeterminism, and failure modes into
   what must be a pure offline local read; defeats reproducible CI and air-gapped
   use.

4. **Hand-edit `backlog/tasks/*.md` directly and commit, bypassing Backlog
   entirely.** Rejected per [ADR-0002](0002-backlog-integration-json-only.md):
   Backlog normalizes field types/metadata through its own commands, drops
   unknown frontmatter on edit, and manages `backlog/.locks/`; direct writes
   desynchronize Backlog's model and corrupt task state.

5. **Full concurrent writes with optimistic locking / three-way merge on task
   fields.** Rejected: large complexity for a single-user, single-process CLI.
   Serialized single-writer plus guarded ID allocation and last-write-wins
   captures the only contention that actually matters (ID collisions) at a tiny
   fraction of the cost.

6. **Commit `backlog/.locks/`.** Rejected: lock files are transient operational
   artifacts; versioning them produces noise and spurious merge conflicts.
   Gitignoring them is the only sensible choice.

## Related

- [ADR-0002: Backlog.md integration — JSON-only via `--json`](0002-backlog-integration-json-only.md)
  — the data channel (envelope, write commands, `Created task <ID>` capture,
  `doc:<conceptId>` label back-references) this ADR's git/branch rules sit
  alongside.
- [ADR-0008: Managed task block via remark/mdast AST](0008-managed-block-remark-ast.md)
  — the byte-identical drift gate that depends on the determinism this ADR
  guarantees.
- [Backlog.md CLI contract](../reference/backlog-cli-contract.md) — exact config
  keys (`auto_commit`, `check_active_branches`, `remote_operations`), commands,
  and exit codes.
- [Backlog.md JSON schema](../reference/backlog-json-schema.md) — the read
  envelope `lore` parses.
- [Backlog.md `--json` patch runbook](../runbooks/backlog-json-patch.md) — the
  fork whose source these behaviors were verified against.
- [lore design spec](../specs/lore-design.md).
