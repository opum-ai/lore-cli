# Handover — start LCLI-17 (`lore init`) on a clean `dev` (LCLI-16 merged & Done)

**Date**: 2026-06-25 | **Grounded against**: `dev`=`6fd305c` (== origin/dev, clean tree, **no open PRs**) | **Backlog**: LCLI-16 **Done** (PR #13 merged `08411e3`); LCLI-17 **To Do**, deps LCLI-15+16 satisfied

## Paste-ready prompt for the next session

```
Continue building lore (OKF-native docs CLI, Bun+TS). LCLI-16 (src/core/bundle.ts) is
MERGED into dev (squash 08411e3) and Done; dev is at 6fd305c == origin/dev, clean, no open
PRs. bundle.ts/concept.ts/schema.ts are ALL on dev now — reuse them, don't reinvent.

START LCLI-17 (`lore init`). FIRST: `backlog task view LCLI-17 --plain` (ACs: #1 init
produces a conformant empty OKF bundle; #2 re-running init is idempotent). Then plan via
`backlog instructions task-execution`, branch feat/lore-17-init off dev, implement, PR into
dev. Jeremy reviews/merges (he delegated the #13 merge to me as a one-off — default is still
NO self-merge; ask before merging).

WHAT LCLI-17 DELIVERS:
  - `lore init` scaffolds .lore/{config.toml, schemas/*.schema.json, templates/<type>.md,
    cache/} AND writes a minimal docs/index.md carrying okf_version: "0.1" — index.md is the
    ONLY file that carries okf_version (reserved-root discipline, see okf-conformance).
  - Idempotent re-run (AC#2): re-running init must not clobber user edits / must converge.
  - ALSO owns the two items DEFERRED from LCLI-15:
      1. emit Zod→JSON-Schema files (z.toJSONSchema per KNOWN_TYPES) into .lore/schemas/
      2. the above-fence editor modeline (`# yaml-language-server: $schema=…`) on emitted docs
  - bundle.ts's generateIndexes() was DEFERRED from LCLI-16 (graph-only scope, Jeremy's call;
    confirmed NOT present in src/). LCLI-17/M2 is where the byte-stable index/log format gets
    pinned against a real consumer — decide with Jeremy whether index/log emission lands here
    or in M2 `sync` before building it.

READ FIRST (all verified present on dev):
  - docs/specs/lore-design.md (init flow / module boundaries; core/ is PURE)
  - docs/adr/0006-schema-types-templates.md (schema/types/templates)
  - docs/adr/0013-lore-state-directory.md (.lore/ state dir layout)
  - docs/reference/okf-conformance.md (reserved index.md / okf_version discipline)
  - docs/reference/cli-surface.md (LCLI-17's Documentation pointer)

REUSE from dev (exports verified present — do NOT reimplement):
  - bundle.ts: loadBundle(root,{warnings?}) -> BundleGraph; buildGraph(concepts) pure; Edge.
  - concept.ts: parseConcept / tryParseConcept (null=non-concept, throw=malformed mapping) /
    serializeConcept (byte-stable) / idFromPath (POSIX-normalizes; case-insensitive .md).
  - schema.ts: validateFrontmatter, CANONICAL_KEY_ORDER, KNOWN_TYPES, z (zod 4).
  - errors.ts: LoreError, errnoCode, WarningCollector, deriveMessage.
  - core/ stays PURE (design §2.1): return typed objects or throw LoreError; never print/exit/
    read flags. Command layer (src/commands or cli) does I/O + output-mode.
  - READ memory [[lore-serialization-invariants]] BEFORE emitting any frontmatter/index/schema
    bytes (js-yaml 4.1.0 pinned, JSON_SCHEMA, fixpoint ≠ byte-identity).

GATES (run before PR): export PATH="$HOME/.bun/bin:$PATH" FIRST.
  bun test ; bun run lint (lint:fix to format) ; bun run typecheck ; bun run test:coverage.
  Foundational/command module ⇒ budget /code-review max. PR into dev. Backlog via CLI only
  (never hand-edit backlog/**).
```

## State

| Item | Status |
| --- | --- |
| PR #13 (LCLI-16) | **MERGED** into dev as squash `08411e3` (2026-06-25 10:48 UTC). Both ACs were checked |
| LCLI-16 | **Done**. Post-merge `/code-review max` = clean (no actionable bugs); notes recorded |
| `dev` | `6fd305c` == origin/dev — local + remote in sync, clean tree. (`08411e3` merge + `db96922` Done flip + `6fd305c` archive) |
| `feat/lore-16-bundle` | deleted (local gone; remote 422 = already deleted) |
| LCLI-17 (`lore init`) | **To Do** — next. Deps LCLI-15+16 satisfied. Branch off clean dev |
| LCLI-15 deferrals | JSON-Schema emit + above-fence modeline → land in LCLI-17 |
| `generateIndexes()` | Deferred from LCLI-16; confirmed NOT in src/. Decide LCLI-17 vs M2/sync with Jeremy |

## Next steps

1. `backlog task view LCLI-17 --plain`; read the 5 docs above; plan via `backlog instructions task-execution`.
2. Branch `feat/lore-17-init` off `dev` (@ `6fd305c`); implement `lore init` (scaffold .lore/ + docs/index.md w/ okf_version, JSON-Schema emit, modeline; idempotent re-run).
3. Gates (bun test/lint/typecheck/coverage) → `/code-review max` → PR into dev. Ask Jeremy before merging.

## Critical context / traps

- **ssh-agent is DOWN** (`ssh-add -l` → "Error connecting to agent"). Every git fetch/push to GitHub must use the gh-token HTTPS route: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>`. A URL push does NOT update local `origin/<ref>` — refresh with `git update-ref refs/remotes/origin/<ref> <sha>`. Plain `git fetch`/`git push` (SSH remote) fail with "Permission denied (publickey)". `gh`/`gh pr`/`gh api` work regardless.
- **`gh pr merge --admin --delete-branch` under the SSH outage**: the merge + remote-branch delete go through GitHub's API and SUCCEED, but the command also does LOCAL git ops (switch off the head branch, ff local base, delete local branch) and PRINTS the SSH "Permission denied" error from the failed local base-fetch. Don't trust the error — verify with `gh pr view <n> --json state,mergeCommit`, then finish the local `dev` ff via the gh-token route + `git update-ref`.
- **Default is NO self-merge** ([[lore-git-workflow]]): Jeremy reviews/merges. He delegated the #13 admin-merge to me explicitly this session — that was a one-off, not a standing change. Ask before merging the LCLI-17 PR.
- **core/ is PURE** (design §2.1) — `lore init` does real filesystem writes, so the write/scaffold logic is a COMMAND concern, not core/. Keep byte-emission helpers testable; route side effects through the command layer.
- **`@types/mdast` must stay a direct devDependency** and the EXDEV/isolated-linker traps still apply on `/Volumes/external` — see [[external-volume-bun-exdev-traps]]. CI is the verifier for isolated-linker resolution/packaging.
- **okf_version discipline**: only the root `docs/index.md` carries `okf_version`. Do not stamp it on type docs/templates.

## Do not repeat

- **Don't run a bare `git fetch`/`git push`** expecting SSH to work — it won't (agent down). Use the gh-token HTTPS route from the start.
- **Don't panic on the `gh pr merge` SSH error** — the merge already landed via API; only local cleanup failed. Verify state, then finish locally.
- **Don't `backlog task edit … -s <status>` while on the wrong/old SHA** — this session a stray Done-flip on dev@old-SHA blocked the ff-merge; discard, ff to the merge commit, THEN re-run the status edit and commit it.

## System of record updated (this session)

- **LCLI-16** → status **Done**; appended a note recording PR #13 merge SHA `08411e3`, the clean post-merge `/code-review max` disposition, and dev finalized at `6fd305c` (Backlog CLI).
- **dev** → finalized: `db96922` chore(LCLI-16): mark Done; `6fd305c` docs: archive consumed handover lore-16-pr-open. Pushed.
- **Prior handover** `HANDOVER-2026-06-25-lore-16-pr-open.md` → archived to `archive/handovers/` (consumed; PR #13 merged).
- **Auto-memory**: no change — [[lore-git-workflow]], [[external-volume-bun-exdev-traps]], [[lore-serialization-invariants]] still accurate; #13 merge delegation was a one-off, not a workflow change.
