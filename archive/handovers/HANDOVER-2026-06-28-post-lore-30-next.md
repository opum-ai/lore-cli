# Handover — LCLI-30 merged & Done; pick the next ready task (LCLI-35 recommended)

**Date**: 2026-06-28 | **Grounded against**: `dev`=`c15a3d0` (==origin, clean tree, checked out) | **Backlog**: LCLI-30 **Done** (delivered #21), LCLI-48 **To Do** (follow-up), LCLI-28 **Done**

## Paste-ready prompt for the next session

```
State: dev is c15a3d0 (== origin), clean tree, no open PRs. LCLI-30 (`lore check`: link/anchor +
portability lint) is DONE — squash-merged as #21 (96a69bc); the mark-Done chore (c15a3d0) is on dev.
The feat/lore-30-check branch is deleted everywhere. ON dev now: src/core/check.ts (checkBundle —
membership-set link resolution incl reserved index.md/log.md, GitHub slugger + anchor validation,
Obsidian-ism portability scan), src/commands/check.ts (lore check, registered in cli.ts), and the
hardened src/core/links.ts (validateLink + the 8 fixed classifier defects + the /code-review max
follow-ups). nodeText is now exported from bundle.ts; normalizeInput exported from concept.ts.

Task: PICK THE NEXT READY TASK. The LCLI-28 → LCLI-30 link/check thread is complete. Recommended next
is LCLI-35 (lore replace/rename/supersede) — it is the OTHER LCLI-28 consumer: links.ts names
`rewriteInbound(graph, from, to)` (composes normalizeLink) as the LCLI-35 piece, so it directly
continues this thread. Other READY tasks (deps satisfied — verify with the CLI): LCLI-31 (lore graph,
dep LCLI-16 ✓), LCLI-33 (lore query, dep LCLI-16 ✓), LCLI-34 (lore context, dep LCLI-16 ✓ + LCLI-28 ✓),
LCLI-20 (lore schema export, dep LCLI-15 ✓). All read the loadBundle graph (bundle.ts) — pure core +
thin command, the established split.

FIRST run `backlog instructions overview`, then `backlog task view LCLI-35 --plain` (or whichever you
pick) and CONFIRM its Dependencies with the CLI (raw grep lies — [[backlog-dependency-grep-trap]]).

Do NOT pick: the backlog-fork cluster stays BLOCKED behind the LCLI-1 fork chain — LCLI-1/2/3/4/5
(fork + --json), LCLI-21 (backlog.ts adapter), LCLI-22/23/24/25/26 (managed-block/reconcile/link/
tasks/sync), LCLI-27 (lore check's status-recon + managed-block-drift passes — the OTHER half of
`lore check`, gated on the adapter+sync), and LCLI-32 (lore orphans, dep LCLI-21). LCLI-48 is the
LCLI-30 follow-up (deferred lint items) — low priority, not blocking.

Per-task workflow: feature branch off dev → implement → gates (bun test + bunx biome check src/ test/ +
bunx tsc --noEmit + bun test --coverage, core 100% line/func) → `/code-review max` (workflow-backed,
folds verified findings) → PR into dev via gh-token. Jeremy reviews+merges himself; admin-merge ONLY
when he explicitly says "admin-merge". ssh is DOWN: route every git network op through the gh token
(see traps).
```

## State

| Item | Status |
| --- | --- |
| **LCLI-30** (`lore check` link/anchor + portability) | **Done** — squash-merged **#21** (`96a69bc`); branch deleted everywhere |
| `dev` | `c15a3d0` == origin; clean; **checked out**; green (651 tests, biome, tsc; core/check+links+concept 100%) |
| Open PRs | **none** |
| **LCLI-48** (lore check follow-ups) | **To Do**, dep LCLI-30 (satisfied); deferred lint items (block-ref, colon-filename, trailing-slash policy, finding-model, IO-errno helper) — low priority |
| **LCLI-35 / 31 / 33 / 34 / 20** | **To Do, READY** (deps satisfied) — recommended next is LCLI-35 |
| LCLI-27 (`lore check` drift passes) + the LCLI-1/21/26 chain | **Blocked** behind the LCLI-1 fork (backlog `--json` adapter + sync) |

## Next steps

1. `backlog instructions overview`; pick a ready task; `backlog task view LORE-N --plain` and confirm Dependencies via CLI.
2. Feature branch off dev (`feat/lore-NN-…`). Mirror the validate/check split: pure core engine (string/graph in, typed findings/results out, like `core/validate.ts`/`core/check.ts`) + a thin command (glob/read/exit, like `commands/check.ts`). Reuse `loadBundle`/`walkMdast`/`nodeText`/`extractLinkTargets` (bundle.ts), `normalizeLink`/`pathPart` (links.ts), `normalizeInput` (concept.ts).
3. Gates (bun test + biome + tsc + coverage core 100%) → `/code-review max` → PR into dev (gh-token push). Leave the merge to Jeremy.

## Critical context / traps

- **ssh-agent is DOWN** (SSH push/fetch → `Permission denied (publickey)`). Route ALL git writes via the gh token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>:<branch>`, then `git update-ref refs/remotes/origin/<branch> <sha>`. ff dev: gh-token `fetch …/lore.git dev` → `git merge --ff-only FETCH_HEAD` → `update-ref`. `gh`/`gh pr`/`gh api` work regardless. [[lore-git-workflow]]
- **Admin-merge sequence (used for #21):** on a CLEAN dev — `gh pr merge <n> --squash --admin --subject "feat(LORE-N): … (#n)" --body "…"` → ff local dev (gh-token) → delete branch manually (`gh api -X DELETE …/git/refs/heads/<branch>` + `git branch -D` + `git update-ref -d` tracking). Only admin-merge when Jeremy says so.
- **core/ stays PURE** (lore-design §2.1): string/graph in, typed out; no fs/print/flags/exit. The command layer owns IO. **ubuntu CI is case-SENSITIVE**; external-volume Bun has EXDEV/isolated-install traps. [[external-volume-bun-exdev-traps]]
- **Dependency check: use the CLI, not grep.** `backlog task view LORE-N --plain` shows real `Dependencies:`. [[backlog-dependency-grep-trap]]
- **Merge convention = SQUASH** → one `feat(LORE-N): … (#NN)` on dev; post-merge chores are SEPARATE `chore(LORE-N):`/`docs:` commits. Stacked branches conflict on `CHANGELOG.md` only (every branch adds under `## [Unreleased]`) — resolution is "keep both entries."
- **`/code-review max` is workflow-backed and billed** — Jeremy triggers reviews; it returns verified findings to fold. (For #21 it found 18 distinct defects; all confirmed bugs were folded before merge.)

## Do not repeat

- **Don't checkout/switch branches with a dirty tree** — `backlog task edit` writes tracked `backlog/tasks/*.md`; commit the post-merge note edits as the `chore(LORE-N):` first, or you abort `git checkout`.
- **Don't pull `remark-validate-links`/`unified` into `lore check`** — LCLI-30 built link/anchor on the existing `mdast-util-from-markdown` + `walkMdast` (zero-config bunx; dodges the external-volume install traps). Keep that path.
- **Don't trust `grep dependencies backlog/tasks/*.md`** — use `backlog task view --plain`.

## System of record updated (this session)

- **LCLI-30** → **Done**; both ACs checked; notes record the implementation, the folded #21 `/code-review max` fixes, and "delivered via #21 / 96a69bc".
- **LCLI-48** created (dep LCLI-30): deferred `lore check` lint items + the parked PR #19/#21 review minors.
- **CHANGELOG.md** (dev) → LCLI-30 Added entries (`lore check`, the `validateLink` classifier hardening, the max-review fold), coexisting with LCLI-28/29/47.
- **Code on dev** (`96a69bc`): `src/core/check.ts` + `src/commands/check.ts` (new), `src/cli.ts` (check registered), hardened `src/core/links.ts`, `bundle.ts` (`extractLinkTargets`+`nodeText` exported), `concept.ts` (`normalizeInput` exported), `validate.ts` (shared `nodeText`), 2 dogfood doc fixes (`backlog-cli-contract.md`, `adr/0008`), `test/check.test.ts` (new) + `test/links.test.ts`.
- Archived consumed handover `HANDOVER-2026-06-27-lore-30-next.md` (LCLI-30 delivered + merged).
