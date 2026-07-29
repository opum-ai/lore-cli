# Handover — start LCLI-30 (`lore check`: link/anchor + portability lint); LCLI-28 merged & clean (LCLI-30, LCLI-28)

**Date**: 2026-06-27 | **Grounded against**: `dev`=`36bf336` (==origin, clean tree, checked out) | **Backlog**: LCLI-28 **Done** (delivered #19), LCLI-30 **To Do** (now unblocked)

## Paste-ready prompt for the next session

```
State: dev is 36bf336 (== origin), clean tree, no open PRs. LCLI-28 (links.ts primitive) is DONE —
squash-merged as #19 (822592a); post-merge chores (2030f8f mark-Done, 36bf336 archive-handover) are
on dev. The feat/lore-28-links branch is deleted everywhere. links.ts (normalizeLink, validateLink,
encodePathSegments, the moved destination classifiers) is now ON dev.

Task: START LCLI-30 — `lore check`: whole-bundle internal cross-link + heading-anchor validation plus
a detection-only portability lint. Pure-JS (remark-validate-links family / mdast), internal by
default, external opt-in via --external. NO Rust/lychee runtime dep. ACs: (#1) anchor rot is detected
across files; (#2) wikilinks/embeds/callouts are flagged as warnings. Docs to honor:
docs/adr/0007-validation-and-coherence.md + docs/reference/portable-markdown.md.

FIRST run `backlog instructions overview`, then `backlog task view LCLI-30 --plain` — its
Implementation Notes carry the 8 CONFIRMED validateLink classifier defects (folded from #19's
/code-review max) that MUST be fixed as part of wiring validateLink into the lint (they are latent
today only because validateLink has no caller). They include: missing-extension false-neg on dotted
filenames + false-pos on dotfiles/dirs + wrong-CASE .MD accepted; fragment/query stripped before the
unencoded scan; over-encoded segment misclassified 'unencoded'; internal double-slash unflagged;
classifier runs on still-ENCODED path while the resolver decodeTarget()s first. Verify each defect's
line ref against the CURRENT dev links.ts (the notes' links.ts:234/238/247/285 were taken pre-merge;
content is identical post-squash but re-confirm).

Also (from LCLI-29, already noted as the link-gate follow-up): the link gate MUST treat reserved
index.md / log.md targets as RESOLVED — LCLI-29's generated root hubs link to frontmatter-free
sub-indexes that are not graph concepts, so a naive resolver reports them all broken.

Architecture: mirror the validate split (lore-design §2.1) — a PURE core lint engine (string/graph in,
typed findings out, like core/validate.ts) + a thin command layer that owns fs/glob/exit (like
commands/validate.ts). LCLI-30 is labeled cmd,ci so it has BOTH a `lore check` command surface and the
pure engine. Reuse the existing loadBundle graph + walkMdast (bundle.ts) for link/heading extraction
rather than re-parsing.

Per-task workflow: feature branch off dev → implement → gates (bun test + bunx biome check src/ test/ +
bunx tsc --noEmit + bun test --coverage, core 100% line/func) → `/code-review max` (workflow-backed) →
PR into dev via gh-token. Jeremy reviews+merges himself — do NOT self-merge unless he explicitly says
"admin-merge" (as he did for #19/#20). ssh is DOWN: route every git network op through the gh token
(see traps).

Confirm deps with `backlog task view LORE-N --plain` (CLI shows real Dependencies; raw grep lies).
LCLI-30 dep = LCLI-28 (satisfied). LCLI-26 lore-sync is still blocked behind the LCLI-1 fork chain —
don't pick it.
```

## State

| Item | Status |
| --- | --- |
| **LCLI-28** (links.ts primitive) | **Done** — squash-merged **#19** (`822592a`); branch deleted everywhere |
| `dev` | `36bf336` == origin; clean; **checked out**; green (580 tests, biome, tsc) |
| Open PRs | **none** |
| **LCLI-30** (`lore check` lint) | **To Do**, dep **LCLI-28 (satisfied)** → **unblocked**; carries the folded `validateLink` defects + reserved-index link-gate exclusion |
| LCLI-1 / LCLI-26 | LCLI-1 To Do (unblocks the LCLI-26 adapter chain); LCLI-26 still blocked behind the LCLI-1 fork |

## Next steps

1. `backlog instructions overview`; `backlog task view LCLI-30 --plain` (read the folded defect list in full).
2. Feature branch off dev (`feat/lore-30-check` or similar). Build the pure lint engine + `lore check` command: internal cross-link resolution over the bundle graph, heading-anchor (`#fragment`) validation (AC#1), wikilink/embed/callout detection as warnings (AC#2), detection-only portability lint, `--external` opt-in.
3. While wiring `validateLink`, FIX the 8 classifier defects (re-verify line refs against current `src/core/links.ts`) and make the link gate treat reserved `index.md`/`log.md` targets as resolved.
4. Gates (bun test + biome + tsc + coverage core 100%) → `/code-review max` → PR into dev (gh-token push). Leave the merge to Jeremy.

## Critical context / traps

- **ssh-agent is DOWN** (SSH push/fetch → `Permission denied (publickey)`). Route ALL git writes via the gh token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>:<branch>`, then `git update-ref refs/remotes/origin/<branch> <sha>`. ff dev: gh-token `fetch …/lore.git dev` → `git merge --ff-only FETCH_HEAD` → `update-ref`. `gh`/`gh pr`/`gh api` work regardless (used for the #19 admin-merge and the `gh api -X DELETE …/git/refs/heads/<branch>` remote-branch delete). `git remote prune origin` fails on ssh — drop a tracking ref with `git update-ref -d` instead. [[lore-git-workflow]]
- **core/ stays PURE** (lore-design §2.1): no fs/print/flags/exit in the lint engine — string/graph in, typed findings out (the `core/validate.ts` shape). The command layer (`commands/check.ts`) owns glob/read/exit. **ubuntu CI is case-SENSITIVE** (the `.MD` defect matters there); external-volume Bun has EXDEV/isolated-install traps. [[external-volume-bun-exdev-traps]]
- **The folded classifier line refs are PRE-MERGE** (`links.ts:234/238/247/285`). Post-squash the file content is identical, but re-confirm each against the current `src/core/links.ts` before editing.
- **Reserved-index link-gate exclusion (from LCLI-29):** generated root/sub `index.md` hubs link to frontmatter-free sub-indexes that are NOT graph concepts; `lore check` must resolve reserved `index.md`/`log.md` targets, or it reports every hub link broken.
- **Dependency check: use the CLI, not grep.** `backlog task view LORE-N --plain` shows real `Dependencies:`. [[backlog-dependency-grep-trap]]
- **Merge convention = SQUASH** → one `feat(LORE-N): … (#NN)` on dev; post-merge chores are SEPARATE `chore(LORE-N):`/`docs:` commits (pattern: `2030f8f`, `36bf336`). Stacked feature branches conflict on `CHANGELOG.md` only (every branch adds under `## [Unreleased]`) — resolution is always "keep both entries."

## Do not repeat

- **Don't checkout/switch branches with a dirty tree** — `backlog task edit` writes to tracked `backlog/tasks/*.md`, so post-merge note edits leave the tree dirty and abort `git checkout dev`. Either commit them as the post-merge chore first, or `git restore` and regenerate them on the target branch (what was done this session).
- **Don't `gh pr merge --delete-branch` from the branch being deleted or a dirty tree** — switch to a clean `dev` first, merge without `--delete-branch`, then ff dev (gh-token) and delete the branch manually (`gh api -X DELETE` remote + `git branch -D` + `git update-ref -d` tracking).
- **Don't trust `grep dependencies backlog/tasks/*.md`** — use `backlog task view --plain`.

## System of record updated (this session)

- **LCLI-28** → **Done**; both ACs checked; notes record the rebase-to-clear-CHANGELOG + the resourceFor decode-tolerant drift fix + "delivered via #19".
- **LCLI-30** → comment: unblocked by #19; the folded `[LCLI-28/validate, SHIPPING]` resourceFor-drift item is RESOLVED on #19; remaining scope = `validateLink` classifier defects + `validateLinks(graph)`+anchors + body-text Obsidian/MDX scan + reserved-index link-gate exclusion.
- **CHANGELOG.md** (dev) → LCLI-28 `core/links.ts` Unreleased/Added entry incl. the decode-tolerant drift-compare note (both LCLI-28 + LCLI-29 entries coexist post-merge).
- **Code on dev** (`822592a`): `src/core/links.ts` (+`test/links.test.ts`), `template.ts` resourceFor wired to `encodePathSegments`, classifiers moved out of `bundle.ts`, `validate.ts` decode-tolerant `resourceDriftFindings` (+test).
- Archived consumed handover `HANDOVER-2026-06-27-lore-29-done-pr19-conflict.md` (PR #19 delivered).
