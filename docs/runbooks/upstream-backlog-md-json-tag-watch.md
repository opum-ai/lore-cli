---
type: Runbook
title: Upstream Backlog.md --json tag watch
tags:
  - runbook
  - backlog
  - upstream
  - release
  - ci
  - watch
summary: How .github/workflows/upstream-backlog-watch.yml detects an upstream MrLesk/Backlog.md release that ships --json (commit 22a091b) and where that signal lands.
timestamp: 2026-07-25T02:31:28.530Z
---

# Upstream Backlog.md --json tag watch

## Purpose

lore's entire first-release gate hinges on one external event: MrLesk/Backlog.md
tagging a release **newer than v1.48.0** whose history contains commit
`22a091b570d44c4f302ca47e7fd36fa28ad8bcb0` (PR #790 / BACK-545 — stable `--json`
output on `task list`/`task view`/`search`, merged to `main` 2026-07-16). Until
that tag exists, **LCLI-253** ("Migrate backlog adapter to the released --json
Backlog.md...") is not startable, and neither is lore's own first npm release
(see [release-publishing.md](release-publishing.md)'s Prerequisites).

Nothing upstream notifies lore when that tag ships, so
[`.github/workflows/upstream-backlog-watch.yml`](../../.github/workflows/upstream-backlog-watch.yml)
polls for it on a daily schedule and surfaces the event automatically. This
runbook documents **where that signal lands and who acts on it** — the
maintainer-facing half of LCLI-254; the mechanism itself (and its regression
tests) live in
[`src/scripts/upstream-backlog-watch.ts`](../../src/scripts/upstream-backlog-watch.ts).

## How it works

1. **Schedule.** The workflow runs daily (`cron: "17 6 * * *"`, off the
   well-known GitHub Actions `:00` cron spike) and can also be run on demand via
   `workflow_dispatch`.
2. **Query.** It asks MrLesk/Backlog.md's Releases API for every published,
   non-draft release, newest first, bounded to releases published at/after
   2026-07-16 (the PR #790 merge date — anything older cannot possibly contain
   the commit, so the daily scan stays cheap indefinitely).
3. **Distinguish a real hit from a merely-newer tag.** For each candidate
   release it resolves the tag's commit SHA and asks GitHub's compare API
   (`/compare/22a091b...<sha>`) whether `22a091b` is an **ancestor** of that
   commit (`status` is `"identical"` or `"ahead"`). A release numbered higher
   than v1.48.0 that does *not* contain the commit — e.g. a patch tagged off an
   older branch — is correctly **not** treated as a match; only history
   containment counts. This is the check that AC#2 requires.
4. **Surface it, once.** The first time a qualifying release is found, the job
   opens a **GitHub issue in this repo** (`jeremy-newhouse/lore`) labeled
   `upstream-watch`, naming the tag, its commit, and the next step. Before doing
   any of the above, the job first checks whether an `upstream-watch`-labeled
   issue already exists (open **or** closed) and, if so, does nothing — this is
   a one-time signal, not a recurring nag: once `22a091b` is in some tag's
   history it is in the history of every later tag forever, so without this
   guard every subsequent daily run would open a fresh issue for whatever the
   newest release happens to be.

**Caveat.** GitHub automatically disables scheduled (`cron`) workflows after
~60 days without any activity in the repository (it emails a warning first).
If this repo goes quiet for that long, the daily scan silently stops running
while looking, from the workflow file, like it's still watching. Re-enable it
from the repo's Actions tab if that happens, or run it on demand via
`workflow_dispatch` as a manual fallback cadence.

## Where the signal lands

**A GitHub issue in this repository, labeled `upstream-watch`.** Its title is
`Upstream Backlog.md <tag> is --json-capable — LCLI-253 is unblocked`; the body
names the detected tag/commit and links back to this runbook and to LCLI-253.
Anyone watching this repo's issues (the default for the maintainer) sees it
through normal GitHub notifications — no separate channel (Slack, email, etc.)
is wired up.

## Who acts on it, and how

The **maintainer** (today, `jeremy-newhouse`):

1. Confirm the tag for real: `gh release view <tag> --repo MrLesk/Backlog.md`.
2. Start LCLI-253: `backlog task view LCLI-253 --plain`, then follow
   [backlog-json-patch.md §8.1 step 4](backlog-json-patch.md#8-migrate-to-upstream-on-release-and-bump-the-floor)
   to add a real `package.json` dependency on the published package and bump
   `MIN_BACKLOG_VERSION` in `src/adapters/backlog.ts`.
3. Close the tracking issue once LCLI-253 lands (or reference it from the PR
   that closes LCLI-253) — closing does **not** cause the workflow to reopen it
   later; per the one-time-signal design above, an `upstream-watch` issue in any
   state permanently satisfies the "already surfaced" check.

## Rollback / decommissioning

Once LCLI-253 has migrated the adapter off the interim pinned-commit build,
this watch has served its purpose. Delete
`.github/workflows/upstream-backlog-watch.yml` and
`src/scripts/upstream-backlog-watch.ts` (and this runbook, or mark it
superseded via `lore supersede`) in that same follow-up — leaving it running
afterward would be a harmless no-op (the tracking issue it already opened
satisfies the existing-issue check on every future run) but is dead weight.
