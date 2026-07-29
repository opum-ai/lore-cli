# Handover — LCLI-15 concept layer delivered as PR #12 (reviewed, awaiting merge); LCLI-16 next

**Date**: 2026-06-24 | **Grounded against**: `dev`=`5a4857c` (== origin/dev) · PR #12 head `cfc6e3d` (mergeable=CLEAN) | **Backlog**: LCLI-15 **In Progress** (both ACs checked, final summary written) — Done on merge

## Paste-ready prompt for the next session

```
Continue building lore (OKF-native docs CLI, Bun+TS). M0 + core-infra are DONE on dev
(errors/config/output + scaffolding/CI). LCLI-15 (src/core/concept.ts + src/core/schema.ts —
frontmatter parse/serialize + Zod per-type schemas) is delivered as PR #12 into dev, hardened
across FOUR /code-review max passes (21→17→10→2, converged) PLUS a /review pass (8 angles, 4
precision findings resolved in cfc6e3d). Both ACs checked. 199 tests + lint + typecheck green.

FIRST, check PR #12 state:
  gh pr view 12 --json state,mergeStateStatus,reviewDecision
- If MERGED: mark LCLI-15 Done via a DIRECT-TO-DEV chore commit (LCLI-10/12 precedent), NOT a PR:
    git checkout dev && (fetch/pull dev)
    backlog task edit LCLI-15 -s Done
    git add backlog/ && git commit -m "chore(LCLI-15): mark Done (delivered via #12)" \
      --trailer "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
    push dev via the gh-token HTTPS route (see traps), then git update-ref refs/remotes/origin/dev <sha>.
    Then archive THIS handover (mv to archive/handovers/, commit directly to dev).
- If still OPEN with review comments: address on feat/lore-15-concept, push, don't self-merge.

THEN start LCLI-16 (src/core/bundle.ts): walk docs/, build the concept graph (cross-links +
frontmatter refs), generate index/log, token estimates. Dep = LCLI-15 (consume parseConcept/
serializeConcept + the Concept type from src/core/concept.ts). Claim: backlog task edit LCLI-16
-s "In Progress" -a @claude. Read docs/specs/lore-design.md §2.1 (BundleGraph/loadBundle/
generateIndexes signatures) + §6 (generated index/log artifacts are byte-stable too) + §9;
ADR-0010 (multi-consumer docs layer + relative/.md-suffixed/URL-encoded/no-wikilink cross-links);
okf-conformance (reserved index.md/log.md; only root index.md carries okf_version).

REUSE (all land on dev when #12 merges; do NOT reinvent):
- concept.ts: parseConcept(path,raw,{warnings?}) -> Concept {readonly id,path,type; frontmatter,body};
  serializeConcept(c) byte-stable + re-validates (write/read symmetry). CANONICAL_KEY_ORDER +
  declaredKnownFields exported from schema.ts; validateFrontmatter returns the resolved type.
- errors.ts: LoreError(type,msg,hint?,input?); WarningCollector; deriveMessage/singleLine/asText.
- core/ purity (design §2.1): return typed objects or throw LoreError; never print/exit/read flags.
- READ THE MEMORY [[lore-serialization-invariants]] before serializing: js-yaml pinned 4.1.0 (NOT
  5.x); gray-matter for PARSE ONLY (its stringify drops __proto__ + reflows body — compose the
  fence yourself); JSON_SCHEMA keeps timestamps as strings; byte-stable = fixpoint over canonical.

GATES: export PATH="$HOME/.bun/bin:$PATH" FIRST. bun test ; bun run lint (lint:fix to format) ;
bun run typecheck. Foundational module ⇒ budget 3-4 /code-review max passes (each round finds
defects in the prior round's fixes; a finding repeated across rounds = act). PR into dev; Jeremy
reviews/merges (NO self-merge). Backlog via CLI only.
```

## State

| Item | Status |
| --- | --- |
| `dev` | `5a4857c` (== origin/dev; consumed kickoff handover archived). No LCLI-15 code yet — it's in PR #12 |
| PR #12 (feat/lore-15-concept → dev) | **OPEN** at `cfc6e3d`, mergeable=CLEAN, no reviews yet. 199 tests + lint + typecheck green |
| LCLI-15 (concept.ts + schema.ts) | **In Progress** — both ACs checked, final summary + 4-round review + /review-resolution notes recorded. Done ON MERGE |
| LCLI-16 (bundle.ts) | To Do — **next**, dep LCLI-15 (then LCLI-17 `lore init`, dep 15+16) |
| M2 / Backlog-adapter (LCLI-21+) | Blocked on BJP (the Backlog.md `--json` fork) |

## Next steps

1. Resolve PR #12 (merge or address review). On merge → mark LCLI-15 Done via direct-to-dev chore commit; archive this handover.
2. Build **LCLI-16** (`src/core/bundle.ts`) off merged `dev` → PR into dev.
3. Then LCLI-17 (`lore init` — also emits the Zod→JSON-Schema files + the above-fence editor modeline, both **deferred from LCLI-15** to here).

## Critical context / traps

- **ssh-agent is DOWN** (`ssh-add -l` → no agent). Push over HTTPS with the gh token:
  `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>`.
  A URL push does NOT update local `origin/<branch>` — refresh with `git update-ref refs/remotes/origin/<branch> <sha>` (else a false "ahead"); `gh api` reads can also lag a force-push by a couple seconds. `gh`/`gh pr` work regardless.
- **`js-yaml` pinned EXACT 4.1.0, NOT ^5.x** — `bun add js-yaml` floats to 5.1.0 (no default export, mismatches @types@4.x, conflicts with gray-matter's bundled 3.x). gray-matter/js-yaml/zod all pinned exact (ADR-0011). Don't let `bun add`/`bun update` float them. (See [[lore-serialization-invariants]].)
- **External-volume EXDEV** (`/Volumes/external`): plain `bun add`/`bun install` only — `--linker=isolated` and `bun build --compile` fail **silently** (0-byte). Verify any compiled binary on `/tmp`. `/Users/jdnewhouse/repos/lore` is a symlink to the same tree.
- **Non-ASCII codepoints in TS source (U+FEFF/U+2028/U+2029):** the Edit tool can land them as literal codepoints (invisible) and swaps escapes↔literals when matching, so an Edit whose old_string contains a literal BOM may silently rewrite a `﻿` escape into a literal. Write the `\uXXXX` escape; for a literal already in a file, edit via a Python script using explicit `"\\uFEFF"` strings and sweep for stray codepoints after. concept.ts's BOM regex must read `/^﻿+/` (escape, strips ALL leading BOMs).
- **concept.ts serialize composes the fence directly** (NOT gray-matter.stringify) and re-runs `validateFrontmatter` for write/read symmetry. bundle.ts's generated index/log must be byte-stable the same way (design §6.1) — fixpoint over canonical form, not byte-identity.
- **Documented LCLI-15 limitations** (pathological, fixpoint-converging, pinned by tests): in-frontmatter YAML comments lost; `|+` trailing-newline scalar; integer-like keys reorder; large unquoted numbers lose precision. bundle.ts reads concepts, won't author exotic frontmatter, so won't hit these.

## Do not repeat

- **Don't trust gray-matter.stringify** for byte-stable output — it Object.assigns (drops `__proto__`) and reflows the body. Compose the fence + pinned js-yaml dump yourself.
- **Don't let a fix's own gap ship** — each /code-review max round found defects in the prior round's fixes (round-2's `.optional()`→null over-strictness, round-3's partial serialize floor). Re-review after every fix round; close the bug CLASS (serialize now re-runs the *same* validateFrontmatter, not a duplicate predicate).
- **Don't mark LCLI-15 Done at PR-open** — In Progress until #12 merges (LCLI-10/12 precedent).
- **Don't bundle this handover or the Done flip into the feature PR** — archived handovers + the Done chore commit go DIRECTLY to dev.
- **A single review pass is not enough for a foundational module** — LCLI-15 took 4 /code-review max + 1 /review.

## System of record updated (this session)

- **LCLI-15**: plan, ACs #1/#2 checked, notes for 4 /code-review max rounds + the /review pass (4 findings resolved in cfc6e3d: case-insensitive idFromPath, readonly id/path/type, dropped needless descriptor read, single-sourced Zod-issue projection), final summary, PR #12 link. Status In Progress (Done on merge).
- **PR #12** (`cfc6e3d`): body documents the 4 decisions + 4 limitations; a /review-resolution comment posted.
- **CHANGELOG (Unreleased)**: LCLI-15 entry (in the PR).
- **Auto-memory**: new [[lore-serialization-invariants]] (js-yaml pin, gray-matter parse-only, JSON_SCHEMA, fixpoint≠byte-identity) added to MEMORY.md.
- **dev (direct housekeeping)**: kickoff handover archived earlier (`5a4857c`). This pr-open handover refreshed in place (same topic) — superseding its pre-/review snapshot.
