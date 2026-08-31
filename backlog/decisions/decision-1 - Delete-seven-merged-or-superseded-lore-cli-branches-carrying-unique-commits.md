---
id: decision-1
title: Delete seven merged-or-superseded lore-cli branches carrying unique commits
date: '2026-08-31 18:58'
status: accepted
---
## Context

A fleet-wide branch-sprawl cleanup (opum-agent request, 2026-08-31) flagged lore-cli branches for
triage. opum-agent's `sdlc-audit` measured unique-commit counts via
`git rev-list --count origin/dev..<ref>` and split findings into "provably merged" (0 unique) and
"carry unique commits, triage each" (do not delete blind). This record is the trace for the
`git log` fetch, and reflog/object retention on GitHub is not indefinite. Each entry below names
the exact evidence checked, at the pre-deletion commit hash, so the reasoning survives even though
`git log` on the branch no longer does.

## Decision

Delete all seven, having independently verified each one's unique content already exists on
`origin/dev` in some other form (not merely trusting the commit count):

1. **`chore/opum-no-checks-green`** (local+origin, 1 commit, `245e25c` "docs(claude): OpenCode is
   retired, reversing an earlier ruling") — its full diff to `CLAUDE.md` is present verbatim in
   dev's current `CLAUDE.md` (the "Treehouse, Codex and OpenCode are all retired..." paragraph),
   landed via the fleet operating-block sync mechanism under a different commit.

2. **`chore/opum-ownership-025cbab2`** local copy (1 commit, `f19453b` "docs(claude): treat a
   branch with no required checks as green") — its full diff is present verbatim in dev's current
   `CLAUDE.md` ("A branch with no required checks configured counts as green..."). The origin copy
   of this same branch name was separately confirmed 0-unique and deleted as provably merged; only
   the local copy had diverged with this one unpushed commit.

3. **`origin/chore/lcli-360-363-notes`** (1 commit, `ed5e009` "chore(backlog): record the LCLI-360
   approach and the 0.3.5 publish mechanics") — its Phase A/Phase B dist-tag notes for LCLI-363 are
   present verbatim in dev's current `backlog/tasks/lcli-363 - ...md` (checked line-for-line: the
   `npm dist-tag add ... --otp=<code>` block and EOTP fail-closed language match exactly).

4. **`origin/docs/odoc-55-4-1-authority-sweep`** (3 commits from 2026-08-13: `e4446e9` "docs:
   consolidate Lore authority routes", plus `44047a5`/`e34ac66` backlog syncs) — `e4446e9`'s exact
   table-row diff to `docs/reference/lore-cli-documentation-ownership.md` (the "Lore authority
   surface" / "Quest external routing and provenance" links) is present verbatim in dev's current
   file. The two backlog-sync commits touched `backlog/tasks/lcli-327` and campaign `doc-18`;
   LCLI-327 is now `status: Done` after many further sync commits ending in "chore(backlog): settle
   LCLI-327", and `doc-18` no longer exists (campaign closed). This branch is also the direct
   superset parent of `retain/legacy-primary-dev-44047a5` (verified via
   `git merge-base --is-ancestor`), which carried only its first two commits (`e34ac66`, `44047a5`).
   **This parent branch is now deleted.** `retain/legacy-primary-dev-44047a5` is therefore the only
   ref anywhere still holding those two commit objects — see the note under Consequences below.

5. **`origin/feat/lcli-364-codex-drift-gate`** (3 commits: `0ecedef`, `3b38d9e`, `2778e34`) — this
   is the pre-squash working history for LCLI-364. The same feature landed on dev as squash-merged
   PRs #460 (`3d7efdd`, "feat(agents): gate the codex bridge too, where one exists (LCLI-364)") and
   #461 (`e01ad3b`, evidence/closeout); both confirmed ancestors of `origin/dev` via
   `git merge-base --is-ancestor`.

6. **`origin/fix/lcli-360-false-coverage-comment`** (1 commit, `04d57e4` "fix(e2e): correct a
   comment that claimed coverage the case does not provide") — its exact corrected comment text
   ("COMMENT CORRECTED (LCLI-360)...") is present verbatim in dev's current
   `docker/e2e/run-e2e.sh`, landed via PR #463 (`d91ac8e`).

7. **`feat/lcli-315-4-adapter-tests`** (local only, never pushed; 5 commits ending `8159281` "feat:
   qualify Quest 0.2 workspace", last touched 2026-08-17) — this is early Quest-adapter work from
   the LCLI-315.4 era. Dev's current `src/adapters/quest.ts` has since moved to a
   `MIN_QUEST_VERSION` floor check (`atLeast(reported, MIN_QUEST_VERSION)`), replacing the exact
   exact-match-allowlist approach this branch predates and that later broke on Quest 0.2.9
   (see CLAUDE.md's Quest-versioning trap). LCLI-315.4's own backlog task is now recorded as
   blocked/renamed, confirming this branch's target was superseded rather than merely stale.

Two branches that also carried unique commits — `retain/legacy-primary-dev-44047a5` and
`retain/primary-untracked-estate-20260828` — were traced with the same rigor (every file each one
preserved was found already superseded on dev: a stale pre-completion snapshot of LCLI-333.1 vs.
dev's `Done` version with full AC/implementation notes, `.lore/agents/*.toml` fixtures that are
gitignored local scratch, and an `opencode.jsonc` intentionally removed under the OpenCode
retirement ruling). That evidence is recorded here for completeness, but those two branches were
**not deleted** — the question of whether to act on this trace is with the user directly per
opum-agent, unanswered as of this record.

**This changes what keeping `retain/legacy-primary-dev-44047a5` means.** Before this cleanup, it
was a redundant duplicate of two commits also reachable through
`origin/docs/odoc-55-4-1-authority-sweep`. That parent is now deleted (item 4 above), so
`retain/legacy-primary-dev-44047a5` is currently the *only* ref anywhere holding `e34ac66` and
`44047a5`. If those two commits are ever deleted from this branch too, they become unreachable and
eligible for GC — permanently, not "recoverable from another branch." The content itself is still
judged superseded (LCLI-327 is Done via many later commits); this note is about what deleting the
*ref* would mean, not a reversal of that judgment.

## Consequences

The seven branches above are gone from both local and `origin` as of 2026-08-31. Their commit
objects may still be recoverable via `git cat-file -p <sha>` until GitHub/local GC prunes
unreachable objects, but `git log` on the branch name no longer works — this record, and the
commit hashes named above, are the durable trace of why each deletion was safe.

## Addendum, 2026-08-31: the two retain/* branches, deleted on the user's direct ruling

The two branches traced above but left untouched — `retain/legacy-primary-dev-44047a5`
(`44047a5`, "chore(backlog): sync task changes") and `retain/primary-untracked-estate-20260828`
(`9a314cb`, "chore: preserve primary-checkout untracked estate before dev sync") — were both
local-only (no `origin` counterpart; reconfirmed via `git fetch --prune` immediately before
deletion). The user ruled directly, later the same day, to delete both. That ruling is what
authorized this addendum; it did not change the underlying evidence, which stands as traced above
and in the Context section: every file either branch preserved was independently confirmed already
superseded on dev.

What this addendum changes is the fact named in item 4 and in the paragraph above it:
`retain/legacy-primary-dev-44047a5` was, at time of writing, the *only* ref anywhere still holding
commits `e34ac66` and `44047a5` — its named superset parent
(`origin/docs/odoc-55-4-1-authority-sweep`) had already been deleted in this same pass. Deleting
this branch is therefore not "one more redundant copy removed" — it is the literal last reachable
path to those two commit objects. After this deletion they become unreachable and eligible for GC,
recoverable only via `git cat-file -p e34ac66` / `44047a5` until that happens, and not at all after.
A future reader who wants those two commits back needs to know that window exists and is closing,
not open-ended — that is exactly what this addendum is for.

Both branches are gone as of this addendum.

