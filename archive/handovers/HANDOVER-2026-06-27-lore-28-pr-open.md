# Handover — LORE-28 links.ts delivered as open PR #19 (awaiting Jeremy's review/merge)

**Date**: 2026-06-27 | **Grounded against**: branch `feat/lore-28-links`=`c38448e` (==origin, clean tree); `dev`=`ad8c5fe` (==origin, unchanged) | **Backlog**: LORE-28 **In Progress** (both ACs checked)

## Paste-ready prompt for the next session

```
LORE-28 (core/links.ts — portable cross-link normalize + validate) is COMPLETE and shipped as
OPEN PR #19 into dev (https://github.com/jeremy-newhouse/lore/pull/19). Branch feat/lore-28-links
= c38448e == origin, clean tree, all 4 CI checks GREEN (macos/ubuntu/windows + compile smoke).
dev = ad8c5fe (unchanged — PR not merged). LORE-28 is In Progress with BOTH ACs checked; it stays
In Progress until the PR merges.

NOTHING is in flight code-wise. The decision point is: has Jeremy merged PR #19?

FIRST run `backlog instructions overview`. Then check PR #19 state (gh pr view 19 --json state).

A) IF PR #19 IS MERGED (squash → one feat(LORE-28) commit on dev): do the post-merge chores,
   mirroring the LORE-47 pattern (commits 3f5423a + 987e0df):
   1. ff dev locally (ssh is DOWN — use gh-token route, see traps).
   2. `backlog task edit LORE-28 -s Done` and add a "delivered via #19" note.
   3. Archive consumed handovers on dev (separate `docs:`/`chore:` commit, NOT on a feature branch):
      mkdir -p archive/handovers && move BOTH
      .claude/handovers/HANDOVER-2026-06-26-post-lore-47-next.md (its goal "pick+deliver next task"
      is consumed by LORE-28) AND this file into archive/handovers/, then commit + push via gh-token.
   4. Pick the next task (see B's task menu).

B) IF PR #19 IS NOT MERGED: do not nag. Either address any review comments Jeremy left on #19, or
   start the NEXT task off dev. Per the dependency graph (verified this session via the CLI, NOT the
   frontmatter grep which mis-parses): LORE-26 lore-sync is STILL BLOCKED — its chain is
   LORE-26 → {22,23,24} → 21 → 5 → the Backlog --json fork (LORE-1). Genuinely-unblocked HIGH work:
   - LORE-30 lore check (drift gate + link/anchor + portability lint) — the NATURAL next: it
     COMPOSES this PR's validateLink (per-link) into the whole-bundle portability lint, and owns the
     deferred validateLinks(graph)+anchors (remark-validate-links) and the body-text Obsidian/MDX
     scan. Best continuation of LORE-28.
   - LORE-29 index.md/log.md generation (dep LORE-47 Done) — also unblocked; consumes normalizeLink.
   - LORE-1 (fork Backlog --json) — the only path that eventually unblocks LORE-26/the adapter track.
   Ask Jeremy which; don't assume. Confirm dep status with `backlog task view LORE-N --plain` (the
   CLI shows real Dependencies; a raw `grep dependencies backlog/tasks/*.md` returns false "none").

Per-task workflow: feature branch off dev → implement → gates (bun test + `bunx biome check
src/ test/` + `bunx tsc --noEmit` + `bun test --coverage`) → `/code-review max` (workflow-backed)
→ PR into dev. Jeremy reviews+merges himself; DO NOT self-merge (the #18 admin-merge was one-time).
```

## State

| Item | Status |
| --- | --- |
| **PR #19** (`feat(LORE-28): links.ts`) | **OPEN** into `dev`, **MERGEABLE**, all 4 CI checks **pass** (head `c38448e`) |
| Branch `feat/lore-28-links` | `c38448e` == origin; clean tree; checked out |
| `dev` | `ad8c5fe` == origin (unchanged; PR unmerged) |
| LORE-28 | **In Progress** — AC#1 ✔ AC#2 ✔; full notes recorded; → **Done** only after #19 merges |
| Consumed handover `HANDOVER-2026-06-26-post-lore-47-next.md` | still in `.claude/handovers/` — **archive on dev post-merge** (not done: tracked-file commit, keep out of the PR diff) |
| LORE-26 lore sync | still **blocked** (chain bottoms at LORE-1 fork) |
| LORE-30 / LORE-29 / LORE-1 | **To Do**, unblocked — candidate next tasks |

## Next steps

1. `backlog instructions overview`; `gh pr view 19 --json state` → branch on merged vs not (paste prompt A/B).
2. If merged: ff dev (gh-token), mark LORE-28 Done + "delivered via #19", archive both consumed handovers on dev, pick next.
3. If not merged: address #19 review comments, or start LORE-30 (composes this PR's `validateLink`) / LORE-29 / LORE-1 — ask Jeremy.

## Critical context / traps

- **ssh-agent is DOWN** (SSH push/fetch → `Permission denied (publickey)`). Route ALL git writes via
  the gh token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>:<branch>`
  then `git update-ref refs/remotes/origin/<branch> <sha>`. ff dev: gh-token `fetch …/lore.git dev`,
  `git merge --ff-only FETCH_HEAD`, update-ref. `gh`/`gh pr`/`gh api` work regardless. [[lore-git-workflow]]
- **Merge convention = SQUASH** → one `feat(LORE-28): … (#19)` commit on dev; ALL branch commits
  (feat/fix/chore/docs) collapse into it. Post-merge chores (mark Done, archive handovers) are
  SEPARATE commits on dev, mirroring LORE-47's `3f5423a`/`987e0df`. [[lore-git-workflow]]
- **Dependency check: use the CLI, not grep.** `backlog task view LORE-N --plain` shows real
  `Dependencies:`; a raw frontmatter `grep` over `backlog/tasks/*.md` falsely reports "none" (it
  mis-parses the stored format). This session's "everything unblocked" grep was wrong; the CLI is truth.
- **core/ stays PURE** (lore-design §2.1): no fs/print/flags/exit; links.ts is string-in/finding-out,
  never throws. **ubuntu CI is case-SENSITIVE**; external-volume Bun has EXDEV/isolated-install traps.
  [[external-volume-bun-exdev-traps]]
- **LORE-28 scope was deliberately thin**: it ships the per-link primitives only. The graph-wide
  `validateLinks(g)`+anchors (remark-validate-links) → **LORE-30**; `rewriteInbound(g,from,to)` (composes
  `normalizeLink`) → **LORE-35**; body-text wikilink/Obsidian/MDX scan → **LORE-30**. Don't re-scope these
  into a links.ts follow-up — they belong to their consumer tasks.
- **Don't self-merge** PRs — Jeremy reviews+merges.

## Do not repeat

- **Don't trust `grep dependencies backlog/tasks/*.md`** — it returned "all unblocked" (false). Use
  `backlog task view LORE-N --plain`. LORE-26 is genuinely blocked behind the LORE-1 fork chain.
- **Don't equate `encodeURIComponent` output with a portable markdown link** — it leaves `! ' ( ) *`
  raw (a `)` truncates the destination on CommonMark/MkDocs) and emits UPPERCASE hex (lowercase `%c3`
  is valid and must not be flagged). Fixed this PR via `encodePathSegment` + case-insensitive lint;
  any future link code must reuse `encodePathSegments`, not re-roll the encoder.
- **Don't pass a link *destination* back into `normalizeLink` as `toPath`** — its inputs are file
  *paths* in the same coordinate space, no `#`/`?` (split the anchor into the 3rd param). It is
  deterministic, NOT idempotent-on-its-own-output.

## System of record updated (this session)

- **LORE-28** Backlog: status In Progress, **AC#1 + AC#2 checked**, plan recorded, full impl + the
  10-finding `/code-review max` disposition appended as notes.
- **CHANGELOG.md** (Unreleased / LORE-28): added the `core/links.ts` entry incl. the `resourceFor`
  resource-URL encoding ripple (now escapes `! ' ( ) *`). Commit `c38448e` on the PR branch.
- **Code** → PR #19 (`c98dbb0` feat, `740c689` review fixes, `e223591` AC chore, `c38448e` CHANGELOG):
  `src/core/links.ts` (normalizeLink/validateLink/encodePathSegments + moved classifiers), `bundle.ts`
  re-imports the classifiers, `template.ts` resourceFor shares the encoder, +54 tests in
  `test/links.test.ts`. 560 pass; links.ts & template.ts 100% line/func.
