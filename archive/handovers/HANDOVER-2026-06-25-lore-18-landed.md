# Handover — LORE-18 `lore new` landed; next up LORE-19 `lore validate` (LORE-18 Done / LORE-19 To Do)

**Date**: 2026-06-25 | **Grounded against**: `dev`=`11f908a` (==origin/dev) | **Backlog**: LORE-18 **Done**, LORE-19 **To Do**

## Paste-ready prompt for the next session

```
LORE-18 (`lore new`) is DONE and merged to dev (PR #15, squash 9d46955). dev is at
11f908a == origin/dev, clean tree, no open PRs. Start LORE-19: `lore validate` — tiered
per-type validation.

Per CLAUDE.md, FIRST run `backlog instructions overview`, then `backlog task view LORE-19
--plain` and read its Documentation pointers: docs/adr/0007-validation-and-coherence.md
and docs/reference/okf-conformance.md. Plan with `backlog task edit LORE-19 --plan ...`
before coding (task-execution workflow); confirm scope with Jeremy if it widens.

LORE-19 = a `lore validate [PATHS]` command. The validation ENGINE largely exists — REUSE it,
don't reinvent:
  - src/core/schema.ts `validateFrontmatter(fm, {warnings, path})` already implements the
    OKF tiers: ERROR (missing/empty type, mistyped known field) throws a `validation`
    LoreError (exit 6); WARNING (unknown type, extra key on a known type, missing/over-long
    summary) is recorded on a WarningCollector. AC#1 ("unknown types do not fail validation")
    is ALREADY the behavior — assert it, then build the command around it.
  - src/core/bundle.ts `loadBundle(docsRoot, {warnings})` walks docs/, parses every concept
    (tryParseConcept), and returns a graph; dangling links are `to: null`, not errors.
  - src/core/concept.ts `parseConcept` throws on malformed frontmatter; the WarningCollector
    (errors.ts) flushes `warning:` lines to stderr and never changes the exit code by itself.
  - NEW for LORE-19 (per ADR-0007): per-type REQUIRED SECTIONS (body headings) as an ERROR
    tier, and "frontmatter quote-safety" — these are not yet implemented. AC#2 = `validate
    [PATHS]` supports a staged-only pre-commit run (accept explicit paths; validate only those).

Command pattern = commands/init.ts / commands/new.ts: a thin layer over PURE core; inject
streams/clock; `emit()` a Renderable (output.ts); LoreError taxonomy (errors.ts); a gate
command exits 6 when warnings/errors warrant (it INSPECTS WarningCollector.count). For the
CLI router + arg parsing, follow the conventions LORE-18 established (see traps below).

Gates: bun test + lint (biome) + typecheck (tsc) + coverage -> `/code-review max` -> feature
branch `feat/lore-19-validate` + PR into dev. DEFAULT = do NOT self-merge; hand back the open
PR (Jeremy reviews/merges; he says "admin-merge" when ready). All commits end with the
`Co-Authored-By: Claude Opus 4.8 (1M context)` trailer.
```

## State

| Item | Status |
| --- | --- |
| LORE-18 | **Done** — `lore new` delivered via PR #15 (squash `9d46955`); both ACs checked, review fixes landed |
| LORE-19 | **To Do** — `lore validate`, deps LORE-15 (satisfied). Docs: docs/adr/0007-validation-and-coherence.md, docs/reference/okf-conformance.md |
| `dev` | `11f908a` == origin/dev (merge + `chore(LORE-18) mark Done` + archived kickoff handover). Clean tree |
| feature branch | none (feat/lore-18-new deleted, remote + local) |

## Next steps

1. `backlog instructions overview` → `backlog task view LORE-19 --plain` → read ADR-0007 + okf-conformance.md.
2. Branch `feat/lore-19-validate` off `dev`. Plan via `backlog task edit LORE-19 --plan`.
3. Confirm what LORE-19 OWNS vs what exists: the `validateFrontmatter` engine + `loadBundle`
   are built; LORE-19 adds the **command**, **per-type required-section** checks, and
   **PATHS/staged** selection (AC#2). Decide the exit-code policy for a gate (errors → 6;
   warnings alone → 0 unless a `--strict`/config promotes them — check ADR-0007/0010).
4. Build pure section/validation logic in `core/`, the I/O + path selection in
   `commands/validate.ts`; add `validate` to the `dispatch` switch + USAGE in src/cli.ts.
5. Gates → PR into dev → hand back (no self-merge).

## Critical context / traps

- **ssh-agent is DOWN** (`ssh-add -l` → no agent; SSH push → `Permission denied (publickey)`).
  Route git writes via the gh token: `git -c credential.helper='!gh auth git-credential' push
  https://github.com/jeremy-newhouse/lore.git <branch>:<branch>` then `git update-ref
  refs/remotes/origin/<branch> <sha>`. `gh`/`gh pr`/`gh api` work regardless. See [[lore-git-workflow]].
- **Admin-merge recovery (ssh down)**: `gh pr merge --squash --admin` (no `--delete-branch` — that
  triggers a local `dev` ff over SSH and strands you on stale local dev). After merge: gh-token
  `fetch …/lore.git dev`, `git checkout dev`, `git merge --ff-only FETCH_HEAD`, `git update-ref
  refs/remotes/origin/dev <sha>`, then delete the remote branch via `gh api -X DELETE
  repos/jeremy-newhouse/lore/git/refs/heads/<branch>`. (Used cleanly on #15 this session.)
- **CLI arg-model convention (set by LORE-18 in src/cli.ts)**: global flags (`--json/--plain/
  -v/--version/-h/--help`) are stripped in any position; the FIRST positional is the command;
  everything after it (positionals + the command's own flags + a forwarded `--`) goes to
  `commandArgs` for the COMMAND to parse. A value-taking command flag must refuse a following
  flag-looking token as its value. The version/help/no-command short-circuit calls
  `rejectStrayCommandFlags` so a post-command typo'd flag isn't swallowed. A command that takes
  no args uses `rejectCommandArgs` (skips `--`). Follow this when adding `validate`.
- **lore owns frontmatter, the author owns the body** (LORE-18 lesson, now in template.ts /
  ADR-0006): never build YAML by string-substitution into `key: {{value}}` — a `:`/`#`/leading-`-`
  in a value corrupts it. Build the mapping structurally and serialize through concept.ts.
  "frontmatter quote-safety" in LORE-19 is about VALIDATING author-written frontmatter, not lore's
  own output (lore's is already safe).
- **core/ stays PURE** (lore-design §2.1): no fs/print/flags/process.exit in core; inject
  clock/streams. **No Commander** (EXDEV / CI isolated-linker traps, [[external-volume-bun-exdev-traps]]).
- **On `/Volumes/external`**: `bun build --compile` can silently emit a 0-byte binary; CI compiles
  on Linux where it's fine. Don't chase a "broken binary" that's really the external-volume trap.
- **Case-sensitivity (CI is Linux)**: file lookups must not assume case-insensitive FS. LORE-18's
  template lookup tries the name as-given then lower-cased; CI (ubuntu) now guards this.

## Do not repeat

- **Don't self-merge** unless Jeremy explicitly says merge/admin-merge ([[lore-git-workflow]]).
- **Don't bare `git push`/`git fetch`** while ssh is down — gh-token route from the start.
- **Don't refactor the shared CLI parser without re-running the full cli.test suite** — LORE-18's
  parser change introduced a regression (`init --bogus --version` silently exited 0) that only
  `/code-review max` caught; it's now covered by tests, but the parser is shared by every command.
- **Don't build frontmatter by string substitution** — see the structural-frontmatter trap above.

## Deferred from LORE-18 (not lost — pick up when relevant)

- **Coupling flags `--epic`/`--story`/`--resource`** for `lore new` → deferred to the story-task
  coupling work (ADR-0009 / LORE-23/24). Recorded in LORE-18 notes.
- **Output-`kind` naming drift**: `lore init`/`lore new` emit `kind: "init"`/`"new"`, while
  cli-surface.md §init/§new document `init.result`/`new.result`. Both shipped commands use the
  short form; reconcile (code or spec) in a later pass — consider a small task if it accrues.

## System of record updated (this session)

- **LORE-18** → **Done**: ACs #1/#2 checked; notes capture the two-commit delivery (4f48345 +
  e157573), the full `/code-review max` disposition (15 findings fixed, 1 accepted), and the
  deferrals. Delivered via PR #15 (squash `9d46955`).
- **dev** → `11f908a`: squash merge + `chore(LORE-18): mark Done` + archived kickoff handover.
- **CHANGELOG.md** (Unreleased) → `lore new` entry (structural frontmatter, body templates,
  flags, confinement, never-clobber).
- **Prior handover** `HANDOVER-2026-06-25-lore-18-kickoff.md` → archived to `archive/handovers/`
  (consumed; committed in 11f908a).
