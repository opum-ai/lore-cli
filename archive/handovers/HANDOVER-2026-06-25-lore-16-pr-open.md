# Handover — LCLI-16 (`src/core/bundle.ts`) delivered as PR #13, awaiting review/merge

**Date**: 2026-06-25 | **Grounded against**: `feat/lore-16-bundle`=`dc2dda5` (pushed, == origin); `dev`=`8970ca2` (== origin/dev, has the archived kickoff handover) | **Backlog**: LCLI-16 In Progress (both ACs checked, delivered via #13) | **PR #13**: OPEN, `mergeable: CLEAN`, CI green ×3 OS

## Paste-ready prompt for the next session

```
Continue building lore (OKF-native docs CLI, Bun+TS). LCLI-16 (src/core/bundle.ts — the
bundle graph layer) is DONE and delivered as PR #13 into dev (CI green: lint·typecheck·test
on ubuntu/macos/windows + compile smoke; mergeable). Branch feat/lore-16-bundle @ 52b5fad.

FIRST: check if Jeremy merged #13.
  gh pr view 13 --json state,mergedAt,mergeCommit
- If MERGED: 
    1) backlog task edit LCLI-16 -s Done
    2) git checkout dev && git -c credential.helper='!gh auth git-credential' fetch https://github.com/jeremy-newhouse/lore.git dev && git reset --hard <merge-sha> (or pull)
       (ssh-agent is DOWN — use the gh-token HTTPS route for every fetch/push; see traps)
    3) git update-ref refs/remotes/origin/dev <merge-sha>
    4) git branch -D feat/lore-16-bundle ; delete remote branch via gh
    5) Archive this handover: mkdir -p archive/handovers && mv .claude/handovers/HANDOVER-2026-06-25-lore-16-pr-open.md archive/handovers/ ; commit on dev "docs: archive consumed handover lore-16-pr-open (PR #13 merged, LCLI-16 Done)"
- If still OPEN with review comments: address them on feat/lore-16-bundle, push via gh-token route, re-check CI.

THEN START LCLI-17 (`lore init`): backlog task view LCLI-17 --plain. Deps 15+16 satisfied.
  - lore init scaffolds .lore/{config.toml, schemas/*.schema.json, templates/<type>.md, cache/}
    and writes a minimal docs/index.md carrying okf_version: "0.1" (the ONLY file with that key).
  - LCLI-17 ALSO owns the two deferred-from-LCLI-15 items: emit Zod→JSON-Schema files
    (z.toJSONSchema per known type) + the above-fence editor modeline (# yaml-language-server: …).
  - bundle.ts's generateIndexes() was DEFERRED from LCLI-16 (graph-only scope, Jeremy's call) —
    LCLI-17/M2 is where the byte-stable index/log format gets pinned against a real consumer.
  - READ FIRST: docs/specs/lore-design.md §3.1 (init flow), docs/adr/0006 (schema/types/templates),
    docs/adr/0013 (.lore/ state dir), okf-conformance (reserved index.md / okf_version discipline).

REUSE from dev once #13 lands (do NOT reinvent):
- bundle.ts: loadBundle(root,{warnings?}) -> BundleGraph {concepts: ReadonlyMap<id,Concept>,
  edges: Edge[], tokenEstimate(id?)}; buildGraph(concepts) pure. Edge = {from,to|null,target,kind}.
- concept.ts: parseConcept / tryParseConcept (null = non-concept, throw = malformed mapping) /
  serializeConcept (byte-stable) / idFromPath (POSIX-normalizes, case-insensitive .md). schema.ts:
  validateFrontmatter, CANONICAL_KEY_ORDER, KNOWN_TYPES, z (zod 4). errors.ts: LoreError, errnoCode,
  WarningCollector, deriveMessage.
- core/ is PURE (design §2.1): return typed objects or throw LoreError; never print/exit/read flags.
- READ memory [[lore-serialization-invariants]] before emitting any frontmatter/index bytes.

GATES: export PATH="$HOME/.bun/bin:$PATH" FIRST. bun test ; bun run lint (lint:fix to format) ;
bun run typecheck ; bun run test:coverage. Foundational module ⇒ budget /code-review max passes
(Workflow code-review, not inline). PR into dev; Jeremy reviews/merges (NO self-merge).
Backlog via CLI only (never hand-edit backlog/**).
```

## State

| Item | Status |
| --- | --- |
| PR #13 (LCLI-16) | **OPEN** into dev, **CI green** (lint·typecheck·test on ubuntu/macos/windows + compile smoke), `mergeStateStatus: CLEAN`. Awaiting Jeremy's review/merge |
| `feat/lore-16-bundle` | `dc2dda5` (pushed, == origin). Commits: `0bf2c59` feat(bundle.ts) + `52b5fad` fix(@types/mdast direct devDep) + `dc2dda5` chore(task notes) |
| LCLI-16 | In Progress; both ACs checked; delivered via #13. Flip to Done **after** merge |
| `dev` | `8970ca2` (== origin/dev) — advanced one commit this session: archived the consumed lore-16-kickoff handover (`docs:` housekeeping, not part of #13) |
| LCLI-17 (`lore init`) | To Do — next; deps 15+16 satisfied; also lands the 2 LCLI-15 deferrals (JSON-Schema emit + modeline) |
| `generateIndexes()` | Deferred from LCLI-16 (graph-only); belongs with LCLI-17/M2 |

## Next steps

1. Check `gh pr view 13` — if merged, finalize (Done + branch cleanup + archive this handover); if review comments, address on the branch.
2. Start **LCLI-17** (`lore init`) per the paste-ready prompt.

## Critical context / traps

- **ssh-agent is DOWN** (`ssh-add -l` → "Error connecting to agent"). Use the gh-token HTTPS route for every fetch/push: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>`. A URL push does NOT update local `origin/<ref>` — refresh with `git update-ref refs/remotes/origin/<ref> <sha>`. `gh`/`gh pr` work regardless.
- **`@types/mdast` MUST stay a direct devDependency** — bundle.ts does `import type { Nodes } from "mdast"`; under CI's `bun install --linker=isolated` a transitive @types pkg is NOT resolvable (TS2307). This bit us once on PR #13 (green only after `52b5fad`). Same class of trap lives in [[external-volume-bun-exdev-traps]] — can't test isolated-linker locally on `/Volumes/external` (EXDEV), so CI is the verifier for resolution/packaging.
- **Body-link extraction uses a real CommonMark parser** (`mdast-util-from-markdown@2.0.3`, pinned exact), NOT regex — links in code excluded, linked-images/reference-links handled. The AST walk is **iterative** (a deep nested body overflows a recursive walk). Reference-style links resolve via their definition; orphan definitions are NOT edges.
- **tryParseConcept null vs throw** (concept.ts): a non-mapping/empty `---` fence (incl. a doc opening with a `---` thematic break) → `null` (non-concept, skip+warn); a frontmatter *mapping* that fails the profile → throws `validation`. This is a deliberate loader-tolerance choice (don't crash the bundle on a stray HR); `lore validate` will be the loud per-file gate.
- **Resolution is exact-case + lowercase-`.md` walk** — deliberate for cross-platform determinism (a case-insensitive walk admits `Foo.md`+`Foo.MD` as one folded id → spurious conflict on Linux). A case-mismatched link dangles (correct signal). Documented in code.
- **core/ stays pure** (design §2.1); bundle.ts's one side effect is reading the filesystem.

## Do not repeat

- **Don't import a bare module from a transitive @types package** — declare it as a direct devDep, or CI's isolated linker fails with TS2307 (cost a CI round on #13).
- **Don't hand-roll markdown link extraction with regex** — the first bundle.ts draft did, and `/code-review max` round 1 found ~8 correctness bugs (indented/unterminated/nested code fences, inline-backtick imbalance, linked-images, angle/space destinations). The mdast rewrite resolved them at the root. Use the parser.
- **Don't over-promise in docstrings** — round 2/3 flagged a `tokenEstimate` "only not_found" claim and a buildGraph re-validation that double-validated AND didn't fix post-build mutation; reverted to honest snapshot docs + validation only at the parse boundary.
- **Don't self-merge** — Jeremy reviews/merges ([[lore-git-workflow]]).

## System of record updated (this session)

- **LCLI-16** → both ACs checked; plan + 4 rounds of review notes + PR #13 link recorded (Backlog CLI). Status In Progress (Done after merge).
- **dev docs**: fixed invalid-YAML frontmatter in `docs/adr/0009` + `docs/specs/lore-design` (unquoted colon-space) — shipped inside PR #13.
- **Auto-memory updated**: appended the @types/mdast isolated-linker trap (declare every bare import as a *direct* dep; transitive `@types` fails `TS2307` only under CI's `--linker=isolated`, unreproducible locally on `/Volumes/external`) to [[external-volume-bun-exdev-traps]] + its MEMORY.md index hook. [[lore-serialization-invariants]], [[lore-git-workflow]] still accurate.
