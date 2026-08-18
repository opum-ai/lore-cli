---
name: treehouse-worktrees
description: Provision, lease, inspect, return, reconcile, and safely prune reusable Treehouse-managed Git worktrees. Use when Codex coordinates parallel agents in isolated worktrees, audits Treehouse or ordinary Git worktree state, handles stale registrations or partial removals, recovers stranded paths, or cleans pools without losing dirty, unmerged, leased, or in-use work.
---

# Treehouse Worktrees

Use Treehouse as reusable execution infrastructure, not as a campaign tracker. The coordinator owns
allocation, branch creation, integration, return, and cleanup. Workers receive one exact leased path
and never release or destroy it themselves.

Treat these as independent state layers:

1. Git's worktree registry and branch refs.
2. Treehouse's pool, lease, reservation, and process state.
3. Physical paths and their actual contents.

Never infer one layer from another. `available` means pool availability; it does not prove that an
entry is valid, merged, process-check-qualified, or disposable. Unknown state is unsafe. Worktree
cleanup never authorizes branch deletion.

## Start with a read-only audit

1. Run `treehouse --version` and `treehouse <command> --help` before version-sensitive operations.
2. Run the bundled `sh scripts/audit-worktrees.sh [repository] [integration-ref]` from the skill
   directory.
3. Also run `treehouse prune --verbose` when remote access and process inspection are available. It
   is a dry run by default, but may fetch the remote while classifying candidates.
4. Decide whether the intent is to retain a reusable pool or reclaim proven-disposable entries.
5. Record every candidate's path, HEAD, branch or detached state, cleanliness, lease, process
   result, merge or patch-equivalence proof, physical size, and intended disposition.

If `status`, `prune`, or `destroy` cannot inspect a process or acquire the pool-state lock, do not
override the guard. `lsof` or `fuser` may support diagnosis, but they do not replace Treehouse's
lease and reservation checks. Retain the entry and retry from an authorized host context.

## Keep pool identity stable

Prefer a repository `treehouse.toml` with an ignored repository-local root when agents must operate
inside a workspace sandbox:

```toml
max_trees = 3
root = ".treehouse"
```

The normalized remote participates in pool identity. If sandboxed SSH is unavailable, keep the
persistent remote unchanged and use one command-scoped transport convention for the campaign's Git
fetch and every Treehouse command:

```sh
env GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=url.https://github.com/.insteadOf \
  GIT_CONFIG_VALUE_0=git@github.com: treehouse <command>
```

Do not mix rewritten and non-rewritten invocations, edit `treehouse-state.json`, or combine pool
directories manually. Multiple pool identities require separate classification and disposition.
Changing `root` or remote normalization selects a different pool; an empty `status --json` then
describes only the newly selected pool. Cross-check Git's registry for older Treehouse paths and
classify each legacy pool with an exact `treehouse destroy <pool-path> --all` dry run.

## Acquire and dispatch

1. Pin the exact integration SHA before allocation.
2. Reconcile matching durable leases that lack a live task.
3. Allocate non-interactively with a unique task-and-role holder:

   ```sh
   treehouse get --lease --lease-holder <task-role-holder> --json
   ```

4. Record the returned path, immutable `lease_id`, holder, task, and pinned base.
5. Treehouse starts detached. Create the owned task branch at the pinned SHA before dispatch.
6. Give the worker the absolute path, task, base, branch, allowed paths, required checks, and the
   rule that integration and lease state remain coordinator-owned.

Never allocate one path to two workers. A durable lease survives without a running process.

## Settle and return

Require the worker's task, base and HEAD SHAs, changed paths, checks, findings, and risks. Before
returning a lease, prove one of these:

- the tree is clean and its work is integrated;
- its patch is equivalent to integrated work; or
- every unique change is preserved on an owned branch with an exact disposition.

Release with identity fencing:

```sh
treehouse return --if-lease-id <lease-id> --if-lease-holder <holder> <absolute-path>
```

Return resets the worktree. Never use `--force` merely because a tree is dirty or inconvenient.

## Prune and reconcile

Use repository-scoped dry runs first:

```sh
treehouse status --json
treehouse prune --verbose
```

Use `treehouse prune --yes` only after reviewing the exact candidates. Do not use global, orphan,
`--include-unlanded`, `--include-in-use`, or `--include-leased` cleanup under repository-scoped
authority.

After every removal attempt, immediately re-audit all three layers. A failure may be partial: Git
can unregister a worktree while Treehouse metadata or the physical directory remains. Read
`references/recovery.md` before handling a stale registration, stranded directory, process-probe
failure, or inconsistent Treehouse entry.

Delete a branch only after a separate merged or patch-equivalence proof. A missing path, a clean
worktree, or a successful Treehouse prune is not branch-disposition evidence.

## Required postconditions

- The primary checkout is clean or its pre-existing dirt is unchanged.
- Git lists only intentional worktrees.
- Treehouse lists the same managed paths or records an explicit retained exception.
- Removed physical paths are absent; retained paths have an owner and cleanup condition.
- Every unique commit or patch remains on an owned ref or the integration branch.
- Pre/post disk measurements distinguish checkout space from shared Git object storage.

Keep repository-specific build and release procedures in repository instructions or adjacent
skills, not in this shared lifecycle skill.
