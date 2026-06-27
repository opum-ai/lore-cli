# Handover — LORE-29 merged; PR #19 (LORE-28) open but CHANGELOG-conflicting; LORE-30 next (LORE-29, LORE-28, LORE-30)

**Date**: 2026-06-27 | **Grounded against**: `dev`=`f5221f0` (==origin, clean tree, checked out); PR #19 head=`c38448e` | **Backlog**: LORE-29 **Done**, LORE-28 in PR #19, LORE-30 To Do (carries #19 follow-ups)

## Paste-ready prompt for the next session

```
State: LORE-29 (index.md generation) is DONE — merged as squash #20 (875ee62) into dev; dev is now
f5221f0 (== origin), clean tree. The feat/lore-29-index-log branch is pruned (local + remote).

The one open thing is PR #19 (LORE-28, feat/lore-28-links → dev, head c38448e). It is now
CONFLICTING/DIRTY against dev. The ONLY conflict is CHANGELOG.md: both LORE-28 and LORE-29 added
entries under `## [Unreleased]` / `### Added`. Every other file is non-overlapping (links.ts is new;
bundle.ts/template.ts changed only on #19; indexes.ts/scaffold.ts/test changed only on dev). Trivial
resolution: keep BOTH changelog entries (LORE-29's indexes.ts entry is already on dev; re-add LORE-28's
links.ts entry above/below it). Do NOT self-merge — Jeremy reviews+merges.

FIRST run `backlog instructions overview`. Then `gh pr view 19 --json state,mergeable`.

A) IF #19 STILL OPEN: the decision is whether to clear its CHANGELOG conflict for Jeremy. If asked to,
   rebase the branch on dev (NOT merge), resolve CHANGELOG.md by keeping both entries, re-run gates
   (bun test + bunx biome check src/ test/ + bunx tsc --noEmit), and force-push via the gh-token route
   (ssh is DOWN — see traps). Otherwise leave it for Jeremy and don't nag.
   PR #19's /code-review max findings are ALREADY folded into LORE-30's notes (committed f5221f0) — see
   `backlog task view LORE-30 --plain`. The one SHIPPING bug among them is the resourceFor resource-drift
   regression (template.ts:67 over-encodes ()!'* → validate.ts:299 actual===expected emits false
   "resource stale" on upgrade, fails `lore validate --strict`); it belongs on #19 or a LORE-28 follow-up,
   NOT LORE-30. Offer to fix it on the #19 branch if Jeremy wants.

B) IF #19 MERGED (squash → one feat(LORE-28)…(#19) on dev): post-merge chores mirroring LORE-29
   (commits 27542a0 + f5221f0 pattern): ff dev via gh-token, `backlog task edit LORE-28 -s Done` +
   "delivered via #19" note, then START LORE-30 — now unblocked (links.ts is on dev) and the natural
   continuation: it composes LORE-28's validateLink into the whole-bundle portability lint and OWNS the
   folded review findings (validateLink classifier bugs) + the deferred validateLinks(graph)+anchors
   (remark-validate-links) + body-text Obsidian/MDX scan. When wiring validateLink, FIX the folded
   classifier defects (missing-extension false neg/pos + wrong-case .MD, fragment/query unscanned,
   over-encoded misclassified, double-slash, encoded-path divergence) and have lore check's link gate
   treat reserved index.md/log.md link targets as RESOLVED (LORE-29's root hubs link to frontmatter-free
   sub-indexes that aren't graph concepts → they'd otherwise all report as broken).

Confirm dep status with `backlog task view LORE-N --plain` (CLI shows real Dependencies; a raw
`grep dependencies backlog/tasks/*.md` returns false "none"). LORE-30 dep = LORE-28 (so it's blocked
until #19 merges). LORE-26 lore-sync is still blocked behind the LORE-1 fork chain.

Per-task workflow: feature branch off dev → implement → gates (bun test + bunx biome check src/ test/ +
bunx tsc --noEmit + bun test --coverage, core 100%) → `/code-review max` (workflow-backed) → PR into dev.
Jeremy reviews+merges himself; the #20/#18 admin-merges were one-time, explicitly authorized.
```

## State

| Item | Status |
| --- | --- |
| **LORE-29** (index.md generation) | **Done** — merged as squash **#20** (`875ee62`) into `dev`; marked Done (`27542a0`) |
| `dev` | `f5221f0` == origin; clean tree; **checked out** (no feature branch open) |
| `feat/lore-29-index-log` | **pruned** (local + remote deleted) |
| **PR #19** (`feat(LORE-28): links.ts`) | **OPEN** → `dev`, head `c38448e`, **CONFLICTING/DIRTY** — `CHANGELOG.md` only |
| LORE-28 review (15 findings) | **folded into LORE-30 notes** (`f5221f0`) |
| **LORE-30** (lore check) | **To Do**, dep **LORE-28** (blocked until #19 merges); now carries the #19 follow-ups |
| LORE-1 / LORE-26 | LORE-1 To Do (unblocks the LORE-26 adapter chain); LORE-26 still blocked behind the LORE-1 fork |

## Next steps

1. `backlog instructions overview`; `gh pr view 19 --json state,mergeable` → branch on A/B above.
2. If #19 open & asked: rebase on dev, resolve `CHANGELOG.md` (keep both entries), re-gate, force-push via gh-token. Else leave for Jeremy.
3. If #19 merged: ff dev (gh-token), mark LORE-28 Done, then start **LORE-30** addressing the folded `validateLink` defects + the reserved-index-link-gate exclusion.
4. Optionally fix the resourceFor resource-drift shipping bug on the #19 branch (see LORE-30 notes for the exact mechanism).

## Critical context / traps

- **ssh-agent is DOWN** (SSH push/fetch → `Permission denied (publickey)`). Route ALL git writes via the
  gh token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>:<branch>`, then `git update-ref refs/remotes/origin/<branch> <sha>`. ff dev: gh-token
  `fetch …/lore.git dev` → `git merge --ff-only FETCH_HEAD` → update-ref. `gh`/`gh pr`/`gh api` work
  regardless (used for the #20 admin-merge and the remote-branch delete via `gh api -X DELETE …/git/refs/heads/<branch>`). `git remote prune origin` fails on ssh — delete the tracking ref with `git update-ref -d` instead. [[lore-git-workflow]]
- **CHANGELOG conflicts are structural between stacked feature branches**: every branch adds under
  `## [Unreleased]`, so the second to merge leaves earlier open PRs conflicting on `CHANGELOG.md` only.
  Resolution is always "keep both entries." (This is why #19 went DIRTY the moment #20 merged.)
- **Merge convention = SQUASH** → one `feat(LORE-N): … (#NN)` commit on dev; all branch commits collapse.
  Post-merge chores (mark Done, notes) are SEPARATE `chore(LORE-N):` commits on dev (e.g. `27542a0`, `f5221f0`).
- **Dependency check: use the CLI, not grep.** `backlog task view LORE-N --plain` shows real `Dependencies:`.
- **core/ stays PURE** (lore-design §2.1): no fs/print/flags/exit. `indexes.ts` is string-in/bytes-out, pure;
  its existing-index bytes enter via an injected `existing` seam (like `log.ts`'s GitAdapter). **ubuntu CI is
  case-SENSITIVE**; external-volume Bun has EXDEV/isolated-install traps. [[external-volume-bun-exdev-traps]]
- **LORE-29 managed-region design (locked, user-chosen):** index.md = hand-authored doc with ONE
  machine-owned `<!-- lore:index:begin -->…<!-- lore:index:end -->` block, string-spliced into raw bytes
  (never round-tripped through serializeConcept, which drops the root modeline). Splice converges to a
  fixpoint from truncated/duplicate blocks (first-begin→last-end; truncated→EOF). The remark/mdast
  unification of all managed regions is **LORE-22**; the temp local path-segment encoder swaps for
  `links.ts`'s `encodePathSegments` once #19 lands.

## Do not repeat

- **Don't `gh pr merge --delete-branch` from a dirty working tree** — the local checkout/branch-delete step
  aborts ("local changes would be overwritten") AFTER the GitHub-side merge already happened. The merge
  still lands; you then clean up manually (discard the stray file, ff dev, delete branch, `gh api -X DELETE`
  the remote ref). Commit/stash the tree first next time.
- **Don't pass a link destination into normalizeLink as toPath** (LORE-28 trap) and **don't re-roll the
  path-segment encoder** — reuse `encodePathSegments` once it's on dev.
- **Don't trust `grep dependencies backlog/tasks/*.md`** — use `backlog task view --plain`.

## System of record updated (this session)

- **LORE-29** → **Done**, both ACs checked, full impl + `/code-review max` disposition + "delivered via #20"
  recorded in task notes. Code on dev: `src/core/indexes.ts` (+ `test/indexes.test.ts`, `scaffold.ts`
  cross-ref fix, CHANGELOG entry), squash `875ee62`.
- **LORE-30** → PR #19's 15 review findings folded into task notes (`f5221f0`): validateLink classifier
  defects (LORE-30 scope) + resourceFor drift (LORE-28/validate) + normalizeLink cwd-determinism + reuse
  cleanups, each with ownership noted.
- **CHANGELOG.md** (dev) → LORE-29 `core/indexes.ts` Unreleased/Added entry incl. the review-hardening note.
- Archived consumed handovers: `HANDOVER-2026-06-27-lore-28-pr-open.md` (superseded by this) and
  `HANDOVER-2026-06-26-post-lore-47-next.md` (its "pick+deliver next task" goal consumed by LORE-29).
