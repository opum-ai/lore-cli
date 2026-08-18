# Worktree recovery and partial-removal procedure

Read this reference when Git, Treehouse, and physical paths disagree or when a removal reports an
error. Never continue a destructive retry from the original command's assumptions.

## Re-audit first

Capture fresh evidence:

```sh
git worktree list --porcelain
treehouse status --json
treehouse prune --verbose
git -C <absolute-candidate-path> status --porcelain=v2 --branch
du -sk <absolute-candidate-path>
lsof +D <absolute-candidate-path>
```

If `ps`, Treehouse process inspection, or the state lock returns `operation not permitted`, classify
lease/process state as unknown. Do not use an include-in-use or force option. Retain the candidate
for a host-side retry.

If the repository root or normalized remote changed, `treehouse status --json` may inspect a new
empty pool while Git still registers older Treehouse paths. Treat `[]` as current-pool evidence,
not a global cleanup result; classify each legacy pool path separately.

Before any deletion, preserve the exact HEAD and branch refs and prove the checkout is clean and
merged, patch-equivalent, or backed by a recovery branch. Inspect untracked files explicitly. A
branch may contain unique work even when its worktree registration is stale.

## Classify the three layers

| Git registration | Treehouse entry | Physical path | Safe next action |
| --- | --- | --- | --- |
| Valid | Consistent | Valid Git checkout | Use identity-fenced `return`, safe prune, or exact `destroy` after normal proofs. |
| Prunable | Absent or unrelated | Empty directory skeleton | Preserve branch refs, run `git worktree prune`, re-list, verify the exact path has no files or symlinks, then remove empty directories. |
| Absent after failed removal | Still listed | Valid or partial checkout | Treat as a partial failure. Do not retry blindly; preserve work, inspect Treehouse state, and prefer a tool-level repair or host-side retry. |
| Absent | Absent | Non-Git directory remains | Delete only after pre-removal evidence proves it was clean and landed and an exact-path inventory finds no unique state. |
| Any | Any | Dirty, unmerged, leased, in use, or unverifiable | Preserve and record an owner, reason, and cleanup condition. |

## Empty skeleton cleanup

After `git worktree prune`, confirm the candidate is no longer registered. Confirm its exact path is
not a repository root, home directory, Treehouse pool root, or broad temporary directory. Inventory
files and symlinks:

```sh
find <absolute-candidate-path> -mindepth 1 \( -type f -o -type l \) -print
du -sk <absolute-candidate-path>
```

If both checks prove a zero-content skeleton, remove only empty directories:

```sh
find <absolute-candidate-path> -depth -type d -empty -delete
```

## macOS stranded-directory cleanup

Use this only when Git has already unregistered the exact checkout, the pre-removal tree was clean
and landed, the branch or detached HEAD is preserved, and filesystem policy alone blocked removal.
Write the literal absolute candidate path into every command; do not use a glob or unresolved
variable. Stop before `sudo`.

```sh
chmod -RN <absolute-candidate-path>
chflags -R nouchg,noschg <absolute-candidate-path>
chmod -R u+rwX <absolute-candidate-path>
xattr -rc <absolute-candidate-path>
rm -rf -- <absolute-candidate-path>
```

If any normalization command fails, re-audit before continuing. After deletion, prove the path is
absent, Git and Treehouse no longer list it, and every branch/ref named before cleanup still exists
unless it received a separate approved disposition.

## Report completion

Record:

- pre/post Git worktree inventories;
- pre/post Treehouse status and classifier output;
- exact removed and retained paths;
- branch and commit preservation evidence;
- process/lease evidence or unresolved guard;
- reclaimed checkout size; and
- any operator-only retry command.
