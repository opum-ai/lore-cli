# Handover — LCLI-22: managed-block.ts (DELIVERED via PR #33, awaiting user merge)

**Date**: 2026-07-02 | **Grounded against**: branch `feat/lore-22-managed-block`=`94709e2` (pushed); `dev`=`f722eab` | **Backlog**: LCLI-22 **In Progress** (both ACs checked), delivered via **PR #33** (open, base `dev`)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Then check whether PR #33 (LCLI-22,
feat/lore-22-managed-block → dev) has been merged (`gh pr view 33`).

IF MERGED (the user merges/promotes himself — ASK before doing it for him):
  1. Finalize LCLI-22 the standard lore way (mirror how LCLI-21/#32 closed):
     `backlog task edit LCLI-22 -s Done` (ACs #1/#2 already checked; plan/notes/
     final-summary already recorded). Re-apply the task edits if a post-merge
     `git reset --hard` to sync dev wiped them ([[dev-sync-reset-wipes-backlog-edits]]).
     Commit `chore(LCLI-22): mark Done (delivered via #33)` on dev.
  2. Archive THIS handover: `mv .claude/handovers/HANDOVER-2026-07-02-LCLI-22-managed-block.md
     archive/handovers/` + `docs: archive consumed handover lore-22-managed-block`.
  3. Next unblocked work: LCLI-23 (reconcile.ts status rollup) and LCLI-24
     (lore link/unlink) — both dep LCLI-21 (Done), sequence after 22. LCLI-24 is
     where managed-block.ts finally gets wired into cli.ts (sync/check).

IF NOT MERGED: address any PR review comments on #33; do not self-merge.
```

## State

| Item | Status |
| --- | --- |
| **PR #33** (`feat/lore-22-managed-block` → `dev`) | **OPEN** — commit `94709e2`; awaiting user review/merge |
| **LCLI-22** | **In Progress**; ACs #1 + #2 checked; plan/notes/final-summary recorded |
| `src/core/managed-block.ts` + `test/managed-block.test.ts` | delivered (19 tests, all green) |
| ADR-0008 | **amended** in the PR (user decision) — records the frozen-string-splice / no-serializer mechanism |
| lore `dev` / `main` | `f722eab` (unchanged this session) |
| LCLI-23 / LCLI-24 | To Do; unblocked (dep LCLI-21 Done); sequence after 22 |

## What shipped (verified)

- **`regenerateTaskBlock(content, rows, {docPath})`** — pure engine. Parses full raw bytes via `mdast-util-from-markdown`, locates the two **top-level `html`** marker nodes structurally (a sentinel in a code fence/blockquote is not top-level → never matched, ADR-0008 §1), validates one balanced `begin<end` pair (else `LoreError` validation/exit 6, §2), builds a **frozen table string** and **splices** `[beginEnd, endStart)` with `\n{table}\n` — frontmatter/modeline/prose preserved byte-for-byte.
- **AC#1** byte-identical fixpoint (regenerate-over-generated `===`). **AC#2** links via `normalizeLink(docPath, row.file)` from repo-relative `filePathRelative` → `../../backlog/tasks/lore-42%20-%20Bulk%20archive.md` (upper-cased id, lower-cased file; never reconstructed). Null file tolerated → id as plain text. Cell hardening: `singleLine` + escape `|` + neutralize `<!--`/`-->`; link text also escapes `[`/`]`.
- Gates: typecheck, biome lint (3 pre-existing infos), `bun test` 1071 pass, `lore validate` 0 errors, `lore check` 0 errors/0 warnings. New-file coverage 100% funcs / 97.78% lines (one uncovered line = `noUncheckedIndexedAccess`-forced unreachable guard, idiomatic per rewrite.ts).

## Critical context / traps

- **No markdown serializer in lore** — the engine follows the `rewrite.ts`/`indexes.ts` parse-to-locate + string-splice pattern, NOT ADR-0008's `remark-stringify` (now amended). [[lore-no-md-serializer]] [[rewriteinbound-shared-engine-traps]]
- **Fixpoint mechanics**: the begin `html` node ends just after `-->` (its trailing `\n` is not part of the node); splicing `\n{table}\n` between `beginEnd` and `endStart` reproduces `<!-- begin -->\n{table}\n<!-- end -->`. Uses plain `fromMarkdown` — **no GFM table extension needed** (the table between markers is discarded by offset; only the two comment nodes matter; the end marker interrupts the preceding paragraph as CommonMark HTML-block type 2).
- **Engine only** — deliberately NOT wired into `cli.ts`; `link`/`unlink`/`sync` are LCLI-24+.
- **Adapter read surface** unchanged: `createBacklogAdapter(spawn).viewTask(id)` per linked id; use `task.file` (= `filePathRelative`). [[backlog-fork-checkout]]

## Do not repeat

- Don't add a markdown serializer dep (`remark-stringify`/`mdast-util-to-markdown`) — splice, don't stringify.
- Don't wire coupling commands into `cli.ts` under LCLI-22 — that's LCLI-24+.
- Don't self-merge #33 — the user reviews/merges/promotes.

## System of record updated (this session)

- **LCLI-22** → In Progress, ACs #1/#2 checked; plan, implementation notes, and final-summary recorded via `backlog task edit`.
- **ADR-0008** amended (Status note + §Decision item 3 + the "Format coupling" tradeoff) to record the no-serializer string-splice mechanism.
- **CHANGELOG.md** (Unreleased/Added) — the `core/managed-block.ts` entry.
- **PR #33** opened into `dev` with full description.
