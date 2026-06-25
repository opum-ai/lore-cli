# Handover — start LORE-18 `lore new` (LORE-17 shipped & merged)

**Date**: 2026-06-25 | **Grounded against**: `dev`=`880b170` (==origin/dev) | **Backlog**: LORE-17 **Done**, LORE-18 **To Do**

## Paste-ready prompt for the next session

```
LORE-17 (`lore init`) is DONE and merged to dev (PR #14, squash a0f6815). dev is at 880b170
== origin/dev, clean tree, no open PRs. Start LORE-18: `lore new` with templates.

Per CLAUDE.md, FIRST run `backlog instructions overview`, then `backlog task view LORE-18 --plain`
and read docs/adr/0006-schema-types-templates.md (the task's Documentation pointer). Plan with
`backlog task edit LORE-18 --plan ...` before coding (task-execution workflow), confirm scope
with Jeremy if it widens.

LORE-18 = scaffold a typed concept from `.lore/templates/<type>.md` with {{placeholders}} + `--var
key=value`; inject the $schema modeline, a stub summary, and the required-section skeleton.
ACs: #1 new docs validate clean BY CONSTRUCTION (parse + loadBundle with 0 warnings, like init's
index); #2 user templates override bundled defaults (template in `.lore/templates/<type>.md` wins
over the built-in fallback).

REUSE these LORE-17 seams (don't reinvent):
  - src/core/concept.ts `serializeConceptWithModeline(concept, modeline)` — splices the modeline as
    the first line INSIDE the opening fence. Built precisely for this command; use it.
  - src/core/schema.ts: `schemaModeline(docPath, type)`, `schemaFileName(type)`, `SCHEMAS_DIR`,
    `KNOWN_TYPES`/`KnownType`, `jsonSchemaFor` — the modeline/type vocabulary.
  - `.lore/templates/` dir already exists (init writes `templates/.gitkeep`); LORE-18 OWNS the
    per-type template CONTENT (`.lore/templates/<type>.md`) + built-in fallbacks + override-if-present.
  - Command pattern = commands/init.ts: thin layer over a PURE core renderer; injectable
    streams/clock; `emit()` a `Renderable` (output.ts); LoreError taxonomy. `lore new` writes a NEW
    doc — make it never-clobber (write-if-absent → `conflict` if the target exists), mirroring init's
    `createIfAbsent`.

Gates: bun test + lint + typecheck + coverage → `/code-review max` → feature branch + PR into dev.
DEFAULT = do NOT self-merge; hand back the open PR (Jeremy reviews/merges; he says "admin-merge"
when ready). All commits end with the `Co-Authored-By: Claude Opus 4.8 (1M context)` trailer.
```

## State

| Item | Status |
| --- | --- |
| LORE-17 | **Done** — `lore init` delivered via PR #14 (squash `a0f6815`); final summary recorded |
| LORE-18 | **To Do** — `lore new with templates`, deps LORE-15 (satisfied). Doc: docs/adr/0006-schema-types-templates.md |
| `dev` | `880b170` == origin/dev (merge + `chore: mark Done` + archived handover). Clean tree |
| feature branch | none (feat/lore-17-init deleted, remote + local) |

## Next steps

1. `backlog instructions overview` → `backlog task view LORE-18 --plain` → read docs/adr/0006-schema-types-templates.md.
2. Branch `feat/lore-18-new` off `dev`. Plan via `backlog task edit LORE-18 --plan`.
3. Design point — **`--var key=value` parsing**: cli.ts `parseArgs` only recognizes the global
   flags (`--json/--plain/--version/--help`) and collects everything else `-`-prefixed into
   `unknownFlags` (→ usage error). `lore new` needs `--var` (repeatable) + positionals (the type,
   maybe a slug/path). Decide: extend the global parser, or parse command-local flags inside
   `dispatch`/the command. Keep it Commander-free (ADR-0001). `--` terminator + bare `-` are already
   handled (src/cli.ts:58-83).
4. Build pure template rendering in `core/` ({{placeholder}} substitution, required-section skeleton),
   I/O in `commands/new.ts`; add `new` to the `dispatch` switch (src/cli.ts:149).
5. Gates → PR into dev → hand back (no self-merge).

## Critical context / traps

- **ssh-agent is DOWN** (`ssh-add -l` → no agent; SSH push → `Permission denied (publickey)`). Route
  git via the gh token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>` then `git update-ref refs/remotes/origin/<branch> <sha>`. `gh`/`gh pr`/`gh api` work regardless. See [[lore-git-workflow]].
- **`gh pr merge --delete-branch` gotcha (ssh down)**: the API merge succeeds but gh then checks out
  local `dev` and can't ff it over SSH — you land on a STALE local dev with the feature branch already
  deleted (edits look "reverted" but are safe on the remote merge commit). Recover: gh-token `fetch`
  the branch + `git merge --ff-only FETCH_HEAD`. Hit on PR #14; recorded in [[lore-git-workflow]].
- **Modeline goes INSIDE the fence** (parseConcept needs `---` at byte 0). `serializeConceptWithModeline`
  already does this; don't re-derive the splice or place it above the fence.
- **core/ stays PURE** (lore-design §2.1): no fs/print/flags/process.exit in core; injected clock/streams.
- **No Commander** (EXDEV / CI isolated-linker traps, [[external-volume-bun-exdev-traps]]).
- **On `/Volumes/external`**: `bun build --compile` can silently emit a 0-byte binary; CI compiles on
  Linux where it's fine. Don't chase a "broken binary" that's really the external-volume trap.

## Do not repeat

- **Don't self-merge** unless Jeremy explicitly says merge/admin-merge ([[lore-git-workflow]]).
- **Don't bare `git push`/`git fetch`** while ssh is down — gh-token route from the start.
- **Don't put the modeline above the fence** — breaks parseConcept/loadBundle.

## System of record updated (this session)

- **LORE-17** → **Done**: final summary + notes capture both `/code-review max` rounds (pre- and
  post-PR), the conflict-classification fix, `serializeConceptWithModeline` extraction, and the
  deferrals (root-only okf_version → LORE-26; template content → LORE-18). PR #14 merged `a0f6815`.
- **dev** → `880b170`: merge + `chore(LORE-17): mark Done` + archived prior handover.
- **auto-memory** [[lore-git-workflow]] → added the `gh pr merge --delete-branch` + ssh-down recovery.
- **Prior handover** `HANDOVER-2026-06-25-lore-17-pr-open.md` → archived to `archive/handovers/` (consumed).
