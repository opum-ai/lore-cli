# Handover — LORE-35.3 `lore supersede` (frontmatter wiring + optional inbound rewrite)

**Date**: 2026-06-28 | **Grounded against**: `dev`=`main`=`b4e5912` (== origin, clean tree, checked out dev) | **Backlog**: LORE-35.2 **Done** (#23); LORE-35.3 **To Do** (supersede, READY)

## Paste-ready prompt for the next session

```
State: dev == main == b4e5912 (== origin), clean tree, no open PRs. LORE-35 (replace/rename/
supersede) split into LORE-35.1/.2/.3. .1 (lore replace) Done (#22). .2 (lore rename) Done (#23,
squash d85fd2c) — it shipped the shared pure engine core/rewrite.ts `rewriteInbound`. NEXT and LAST:
LORE-35.3 = `lore supersede` (LORE-35 AC: supersession wired both ways + --rewrite-links). FIRST run
`backlog instructions overview`, then `backlog task view LORE-35.3 --plain`.

Spec (docs/reference/cli-surface.md §supersede, already authored — match it exactly):
  lore supersede <oldId> <newId> [--rewrite-links] [--dry-run]
  - Wire BOTH ways, byte-stably (serializeConcept): on OLD set status:"superseded" + superseded_by:newId;
    on NEW set supersedes:oldId. PRESERVE the old file (no move/delete — unlike rename).
  - --rewrite-links: repoint inbound links to the successor via the EXISTING engine
    rewriteInbound(graph, oldId, newId, {move:false}) — already built+tested in PR #23 (test
    "move=false repoints inbound references without relocating").
  - Output kind: supersede.result (frontmatter changes + any link rewrites). 
  - Exit 0 ok · 3 either id not found · 5 oldId already superseded.

Build commands/supersede.ts (thin) — REUSE everything PR #23/#22 landed; do NOT add to core/rewrite.ts
unless genuinely shared:
  - parse <oldId> <newId> + --rewrite-links + --dry-run (mirror commands/rename.ts parseRenameArgs:
    idFromPath both; -- terminator; reject same-id as usage).
  - loadBundle(docs/). Validate IN THE COMMAND (engine's move:false does NOT check toId exists — it
    only requires fromId): both ids must be concepts → else not_found (exit 3); if OLD already
    superseded (old.frontmatter.status === "superseded" OR superseded_by already names newId) →
    conflict (exit 5).
  - Frontmatter wiring on the two concepts, cloned not mutated (graph is a snapshot), via
    serializeConcept (concept.ts) for byte-stable bytes:
      OLD.frontmatter.status = "superseded"; OLD.frontmatter.superseded_by = newId (bare id).
      NEW.frontmatter.supersedes = APPEND newId... no — append OLDid to NEW.supersedes, PRESERVING any
      existing entries (a concept may supersede several; supersedes is string|list per profile.ts:547).
      Normalize to a list when adding a second; don't clobber a pre-existing supersedes.
  - If --rewrite-links: plan = rewriteInbound(graph, oldId, newId, {move:false}); MERGE its writes with
    the two frontmatter-wired files (like rename.ts merged index writes over plan writes): a file that
    is BOTH an inbound-link file AND old/new must get its body-link rewrite AND its frontmatter wiring —
    compose by applying the wiring to the rewriteInbound output bytes (re-parse → set field → serialize),
    or set the field on the concept BEFORE computing edits. Pick one and test the overlap.
  - Write all (overwrite in place via fswrite.writeFileOverwriting; NO moveFile/relocation; NO old-file
    delete). Unless --dry-run. NO index regeneration needed (nothing moves; listings unchanged).
  - emit supersede.result; advisories.flush. Register in cli.ts (USAGE line + dispatch case + import).

Per-task workflow (same as #22/#23): feature branch off dev (feat/lore-35.3-supersede) → implement →
gates: `bun test` + `bunx biome check src/ test/` + `bunx tsc --noEmit` + `bun test --coverage` (core
100% func; biome wants NON-interpolated template literals as plain "..." strings in tests — run
`bunx biome check --write` to autofix) → `/code-review max` (workflow-backed; FOLD verified findings —
it found 11 real bugs in #22 and 15 in #23, all data-loss-grade; budget for a real fold pass) → PR into
dev via gh token. Jeremy reviews; admin-merge ONLY when he says "admin-merge".
```

## State

| Item | Status |
| --- | --- |
| **LORE-35.1** (`lore replace`) | **Done** — #22 (`89330e4`) |
| **LORE-35.2** (`lore rename`) | **Done** — squash-merged **#23** (`d85fd2c`); chore `b4e5912`; branch deleted everywhere |
| `dev` / `main` | both `b4e5912` == origin; clean; **dev checked out**; main promoted to dev this session (== dev) |
| Open PRs | **none** |
| **LORE-35.3** (`lore supersede`) | **To Do, READY** — reuses `rewriteInbound(move:false)`; last LORE-35 subtask |
| LORE-48 | **To Do** — `lore check` follow-ups (unrelated, low priority) |
| backlog-fork cluster (LORE-1/21/22/26/27/32…) | **Blocked** behind the LORE-1 fork chain |

## Next steps

1. `backlog instructions overview` → `backlog task view LORE-35.3 --plain` (deps: LORE-28 ✓, and now the LORE-35.2 engine ✓).
2. Branch `feat/lore-35.3-supersede` off `dev` (`b4e5912`).
3. Implement `commands/supersede.ts` per the paste-ready prompt; register in `cli.ts`; add `test/supersede.test.ts`; `CHANGELOG.md` Added entry.
4. Gates → `/code-review max` → fold → PR into `dev`.

## Critical context / traps

- **`rewriteInbound(move:false)` already exists and is tested** (`core/rewrite.ts`, shipped in #23). It repoints inbound links+refs `oldId`→`newId`, returns `rename:null`, does NOT relocate, and does NOT check `toId` exists (the conflict guard is move-only). So **supersede's command layer owns all validation**: both ids exist (`not_found`/3), oldId not already superseded (`conflict`/5).
- **supersede PRESERVES the old file** — no `moveFile`, no relocation, no old-file delete, and **no index regeneration** (nothing moves; `index.md` listings list by basename/title, both unchanged). This makes supersede strictly simpler than rename; don't copy rename's index-merge/relocation machinery.
- **Byte-stable frontmatter wiring** via `serializeConcept` (concept.ts) — clone the concept (`{...concept, frontmatter:{...}}`), never mutate the graph snapshot. `supersedes`/`superseded_by` are `string | list-of-strings` (profile.ts:546-562); **append, don't clobber** a pre-existing `supersedes`.
- **Compose wiring + `--rewrite-links`**: a file can be both an inbound-link file (rewriteInbound rewrites its body) AND the old/new concept (needs frontmatter wiring). Merge them the way `commands/rename.ts mergeIndexWrites` merged index writes over plan writes — apply the frontmatter field on top of the rewriteInbound bytes (or set the field on the concept before `serializeConcept`), and **add a test for the overlap**.
- **Self-link edge case**: for `move:false`, the OLD concept is in `affected` if it self-links (an edge `old→old`); rewriteInbound (isMoved always false here) would then repoint the old concept's self-links to newId. Decide whether supersede wants that (a self-reference in the superseded doc) and test the chosen behavior.
- **ssh-agent is DOWN** (publickey denied). Route ALL git network ops via the gh token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>:<branch>`, then `git update-ref refs/remotes/origin/<branch> <sha>`. ff: gh-token `fetch …/lore.git <ref>` → `git merge --ff-only FETCH_HEAD` → `update-ref`. `gh`/`gh pr`/`gh api` work regardless. [[lore-git-workflow]]
- **Admin-merge sequence (used for #22 and #23):** on a CLEAN dev — `gh pr merge <n> --squash --admin --subject "feat(LORE-35.3): … (#n)" --body "…"` → ff local dev (gh-token) → delete branch (`gh api -X DELETE repos/jeremy-newhouse/lore/git/refs/heads/<branch>` + `git branch -D` + `git update-ref -d` tracking) → `chore(LORE-35.3): mark Done` → optionally promote `main` (ff) when asked. Only when Jeremy says "admin-merge". This session promoted main→dev, so **dev==main now**; don't assume they stay synced.
- **Merge convention = SQUASH** → one `feat(LORE-N): … (#NN)` on dev; post-merge chores are separate `chore(LORE-N):`. Stacked branches conflict on `CHANGELOG.md` (each adds under `## [Unreleased]`) and on `cli.ts` (USAGE + dispatch) — resolution is "keep both."

## Do not repeat

- **Don't re-implement bundle resolvers in the engine** — `rewrite.ts` now imports `bundle.ts`'s exported `resolveRef`/`internalTarget`/`resolvePath`/`REF_FIELDS`. If supersede needs resolution, reuse those (the #23 review flagged the original duplication as drift that *caused* a trim bug).
- **Don't write-new-then-delete a file** (the #23 data-loss bug) — but supersede doesn't move files anyway, so just overwrite in place. No `moveFile` needed (that was rename's case-only-rename fix).
- **Don't clobber an existing `supersedes` list** on the new concept — append, preserving prior entries.
- **Don't skip `/code-review max`** — it found data-loss-grade bugs in *both* prior PRs (#22: 11, #23: 15). The first cut will have similar gaps (frontmatter-already-superseded detection, list-append, the wiring∩rewrite overlap, byte-stability). Budget a real fold pass.
- **biome**: non-interpolated template literals in tests are errors; write plain `"...\n..."` strings (or `bunx biome check --write`).

## System of record updated (this session)

- **LORE-35.2** → **Done**; all 3 ACs checked; notes record the surgical-splice implementation + the folded #23 `/code-review max` fixes (15, data-loss cluster) + "delivered via #23 / d85fd2c".
- **CHANGELOG.md** (on dev/main) → `lore rename` Added entry incl. the review-fold hardening paragraph.
- **Code on dev/main** (`d85fd2c`): NEW `core/rewrite.ts` (`rewriteInbound`, pure, 100% func) + `commands/rename.ts`; `core/bundle.ts` exported `resolveRef`/`internalTarget`/`resolvePath`/`REF_FIELDS`; `commands/fswrite.ts` added `moveFile` (replaced the never-used `removeFile`); `cli.ts` registered `rename`; `test/rename.test.ts`.
- **main** promoted to `dev` (ff) at Jeremy's request → `main`==`dev`==`b4e5912`.
- This handover **supersedes** the consumed `HANDOVER-2026-06-28-lore-35-rename-supersede.md` (its rename half is delivered; its supersede half is carried forward here, refreshed with the now-shipped engine).
