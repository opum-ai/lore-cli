# Handover — LORE-46 (declarative profile) landed & merged; next up an m-2 task (LORE-46 Done)

**Date**: 2026-06-25 | **Grounded against**: `dev`=`987e0df` (==origin/dev) | **Backlog**: LORE-46 **Done**; next = LORE-20 or LORE-47 (both **To Do**, m-2)

## Paste-ready prompt for the next session

```
LORE-46 (declarative `.lore/profile.toml`) is DONE and merged to dev (PR #17, squash 61d5b73;
task-state 0ee8785; handover-archive 987e0df). dev is at 987e0df == origin/dev, clean tree, no
open PRs. The OKF type system is now DATA-DRIVEN: src/core/profile.ts loads+compiles a profile
into validators + editor JSON Schemas; zero-config falls back to the built-in story convention.

Per CLAUDE.md, FIRST run `backlog instructions overview`. Then pick the next task — DO NOT start
coding before confirming scope with Jeremy:

  RECOMMENDED next (both unblocked, m-2, MEDIUM; dep LORE-15 is Done):
    • LORE-20 — `lore schema export` (Zod→JSON Schema + modeline). LORE-46 ALREADY emits
      .lore/schemas/<slug>.schema.json at `lore init` from the profile's CompiledType.jsonSchema
      (scaffold.ts). So LORE-20 is now likely a thin standalone `lore schema export/sync` that
      RE-EMITS those schemas (e.g. after a profile edit) + the yaml.schemas snippet — confirm what
      it OWNS vs what init already does before scoping.
    • LORE-47 — GitAdapter seam + git-history log.md + `resource_base` stamping. DIRECTLY consumes
      LORE-46: `resource_base` is parsed/validated/exposed on Profile (profile.resourceBase), but
      `lore new` does NOT yet stamp the `resource` frontmatter — that stamping is LORE-47's AC#4
      (value = resource_base + concept repo-rel path; one slash; URL-encoded segments; .md kept;
      empty base omits; never on index/sub-index). Also introduces GitAdapter as the 3rd injectable
      seam (ADR-0014) for log.md.

  Ask Jeremy which to take. Then `backlog task view LORE-N --plain`, read its Documentation
  pointers, branch feat/lore-N-<slug> off dev, plan via `backlog task edit LORE-N --plan`,
  implement, gate, PR into dev, hand back (no self-merge unless Jeremy says "admin-merge").

Gates: bun test + biome (`bunx biome check src/ test/`) + tsc (`bunx tsc --noEmit`) + coverage
(`bun test --coverage`) → `/code-review max` → PR into dev. All commits end with
`Co-Authored-By: Claude Opus 4.8 (1M context)`.
```

## State

| Item | Status |
| --- | --- |
| LORE-46 | **Done** — declarative profile delivered via PR #17 (squash `61d5b73`); 8/8 ACs; full review disposition + 4 deferred items in task notes |
| `dev` | `987e0df` == origin/dev (squash #17 + `chore(LORE-46) Done` `0ee8785` + handover-archive `987e0df`). Clean tree |
| feature branch | none (feat/lore-46-declarative-profile deleted, local + remote) |
| LORE-20 | **To Do** (MEDIUM, m-2, dep LORE-15 ✓) — schema export; LORE-46 already emits schemas at init |
| LORE-47 | **To Do** (MEDIUM, m-2) — GitAdapter + resource stamping; consumes LORE-46's `resource_base` |
| m-3 (LORE-21/27 …) | **Blocked** on the Backlog.md fork (LORE-1..5) + adapter/managed-block/reconcile |

## Next steps

1. `backlog instructions overview` → confirm next task with Jeremy (LORE-20 vs LORE-47) → `backlog task view LORE-N --plain` + read its docs.
2. Branch `feat/lore-N-<slug>` off `dev`. Plan via `backlog task edit LORE-N --plan` before coding.
3. Build pure logic in `core/`, thin I/O in `commands/`, wire into the `dispatch` switch + USAGE in `src/cli.ts` (the init/new/validate pattern).
4. Gates → `/code-review max` → fix findings → PR into dev → hand back (no self-merge).

## Critical context / traps

- **The profile is threaded as an explicit param** defaulting to the memoized `defaultProfile()`.
  `loadProfile({root})` (profile.ts) is called ONCE per command (init/new/validate) and passed
  down; pure-core fns (`validateFrontmatter`, `serializeConcept`, `requiredSectionsFor`,
  `validateFiles`, `buildScaffold`, `buildNewConcept`) take it via options. **A new command that
  reads concepts MUST `loadProfile` and thread it** — `core/bundle.ts` `loadBundle`/`estimateConcept`
  do NOT yet (deferred; latent — wire the active profile when LORE-31/34 consume loadBundle).
- **`supersedes`/`superseded_by` are lore-reserved coupling fields** (RESERVED_FIELDS in profile.ts)
  with a built-in `string|list` union validator — NOT declared in the profile grammar (the §5 summary
  heuristic is similarly a built-in). They emit LAST in the canonical key order (after per-type fields)
  to keep concept serialization byte-stable (ADR-0011).
- **Schema filename = `<LOWER-KEBAB slug>.schema.json`** (`schemaFileName` in schema.ts), NOT `<slug>.json` —
  single-word story types unchanged (`reference.schema.json`); `QA Plan` → `qa-plan.schema.json`. Don't
  rename to `.json`: it breaks every committed modeline in `docs/`.
- **ssh-agent is DOWN** (SSH push → `Permission denied (publickey)`). Route git writes via the gh
  token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>:<branch>`
  then `git update-ref refs/remotes/origin/<branch> <sha>`. `gh`/`gh pr`/`gh api` work regardless. [[lore-git-workflow]].
- **Admin-merge recipe (ssh down)** — used cleanly on #17 this session: `gh pr merge <n> --squash --admin`
  (NO `--delete-branch` — it triggers a local `dev` ff over SSH and strands you on stale local dev).
  After merge: STASH any uncommitted `backlog/**` first, then gh-token `fetch …/lore.git dev`,
  `git checkout dev`, `git merge --ff-only FETCH_HEAD`, `git update-ref refs/remotes/origin/dev <sha>`,
  mark task Done, commit task-state, push dev, delete remote branch via `gh api -X DELETE
  repos/jeremy-newhouse/lore/git/refs/heads/<branch>`, archive the consumed handover.
- **ubuntu CI is case-SENSITIVE** (mac/win are not): a file lookup that case-folds passes locally but
  fails the ubuntu test job. A path lookup must try canonical-case AND lower-case (`templateCandidates`);
  never quietly lowercase a name used as a path segment. [[external-volume-bun-exdev-traps]].
- **core/ stays PURE** (lore-design §2.1): no fs/print/flags/process.exit; inject clock/streams/root/profile.
  **No Commander** (EXDEV / CI isolated-linker, [[external-volume-bun-exdev-traps]]).
- **LORE-46 deferred items** (in its task notes, for follow-up): (a) non-Latin type names slug to `""`
  and are rejected (loud error; ASCII required); (b) `loadBundle` profile threading (above); (c) config.ts
  ⇄ profile.ts duplicate the hand-rolled TOML-shape validators (DRY, touches config.ts); (d) `CompiledType.jsonSchema`
  built eagerly though only `init` uses it (negligible).

## Do not repeat

- **A profile with no `[[types]]` must error** (it silently emptied the gate so `lore validate` passed a
  failing bundle — top `/code-review max` finding). An empty/commented profile is fine (→ default); a
  populated-but-typeless one is a load error.
- **Don't let an empty/commented `profile.toml` shadow `profile.json`** — fall through to the JSON form.
- **The reserved root index (`docs/index.md`) serializes against the DEFAULT profile**, never the active
  one — else a custom `Reference` type with a required field crashes `lore init`.
- **`VALID_TYPE` (new.ts) must NOT block profile-declared multi-word types** (it blocked the feature's own
  `QA Plan` example). Allow `isKnownType(type, profile)` past it; `typeDirectory` uses the slug.
- **Don't set `template` on the default story-convention profile types** — they use built-in CODE bodies
  (BUILTIN_TEMPLATES); a declared lowercase template broke the canonical-case `Reference.md` lookup on
  ubuntu CI (case-sensitive). A declared `template` is for CUSTOM profiles shipping their own files.
- **Don't bare `git push`/`git fetch`** while ssh is down — gh-token route from the start.
- **Don't self-merge** unless Jeremy explicitly says "admin-merge"/"merge" ([[lore-git-workflow]]).

## System of record updated (this session)

- **LORE-46** → **Done** (`0ee8785`): 8/8 ACs; notes capture delivery (3 commits: feature `6bd7bdc` +
  review-fixes `120c14a` + CI case-sensitivity `d03aad3`, squashed to `61d5b73`), the full
  `/code-review max` disposition (7 fixed findings), and 4 deferred items.
- **dev** → `987e0df`: squash merge of #17 + Done task-state + archived `HANDOVER-2026-06-25-lore-19-landed`.
- **ADR-0006/0007/0011/0013** → amended (declarative profile is source of truth; required sections + key
  order + `.lore/profile.toml` profile-driven). **CHANGELOG.md** (Unreleased) → LORE-46 entry.
- **Auto-memory** → `external-volume-bun-exdev-traps` extended with the ubuntu CI case-sensitivity corollary.
