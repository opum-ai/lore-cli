# Handover — Start LORE-16 (`src/core/bundle.ts`): walk docs/, build the concept + cross-link graph

**Date**: 2026-06-24 | **Grounded against**: `dev`=`8424d4a` (== origin/dev) · no open PRs · clean tree | **Backlog**: LORE-15 **Done** (merged via PR #12 `a6b3e64`); LORE-16 **To Do** (next)

## Paste-ready prompt for the next session

```
Continue building lore (OKF-native docs CLI, Bun+TS). On `dev` (8424d4a): M0 + core-infra DONE
(errors/config/output + scaffolding/CI). LORE-15 DONE and merged (PR #12) — src/core/concept.ts
+ src/core/schema.ts are on dev: frontmatter parse/serialize (byte-stable) + Zod per-type schemas,
199 tests green. NO open PRs, working tree clean.

START LORE-16 (src/core/bundle.ts): walk docs/, build the in-memory concept model + cross-link
graph (cross-links + frontmatter refs), generate byte-stable index/log, token estimates.
  1. Claim: backlog task edit LORE-16 -s "In Progress" -a @claude
  2. Branch off fresh dev: git checkout dev && git checkout -b feat/lore-16-bundle
  3. READ FIRST (don't code from memory):
     - docs/specs/lore-design.md §2.1 (BundleGraph/loadBundle/generateIndexes signatures),
       §6 (generated index.md/log.md are byte-stable too), §9
     - docs/adr/0010 (multi-consumer docs layer; relative, .md-suffixed, URL-encoded, no-wikilink
       cross-links)
     - okf-conformance (reserved index.md/log.md; only ROOT index.md carries okf_version)
     - docs/reference/architecture.md (LORE-16's linked doc)
  ACs: #1 Bundle model lists all concepts with types and links; #2 graph deterministic + cycle-tolerant.

REUSE from dev (do NOT reinvent):
- concept.ts: parseConcept(path,raw,{warnings?}) -> Concept {readonly id,path,type; frontmatter,body};
  serializeConcept(c) byte-stable + re-validates. CANONICAL_KEY_ORDER + declaredKnownFields +
  validateFrontmatter (returns resolved type) exported from schema.ts.
- errors.ts: LoreError(type,msg,hint?,input?); WarningCollector; deriveMessage/singleLine/asText.
- core/ PURITY (design §2.1): return typed objects or throw LoreError; never print/exit/read flags.
- READ memory [[lore-serialization-invariants]] before emitting index/log: js-yaml pinned EXACT
  4.1.0 (NOT 5.x); gray-matter PARSE-ONLY (compose the fence + js-yaml dump yourself); JSON_SCHEMA
  keeps timestamps as strings; byte-stable = fixpoint over canonical form, NOT byte-identity.

GATES: export PATH="$HOME/.bun/bin:$PATH" FIRST. bun test ; bun run lint (lint:fix to format) ;
bun run typecheck. Foundational module ⇒ budget 3-4 /code-review max passes. PR into dev; Jeremy
reviews/merges (NO self-merge unless explicitly told — this session he said "admin-merge" for #12).
Backlog via CLI only (never hand-edit backlog/**).
```

## State

| Item | Status |
| --- | --- |
| `dev` | `8424d4a` (== origin/dev). Has full LORE-15 concept layer + Done flip + archived handover |
| PR #12 (LORE-15) | **MERGED** (squash `a6b3e64`), branch `feat/lore-15-concept` deleted local+remote |
| LORE-15 (concept.ts + schema.ts) | **Done** (chore `8f5a04b`) |
| LORE-16 (bundle.ts) | **To Do** — next, dep LORE-15 satisfied. Not started |
| LORE-17 (`lore init`) | To Do — dep 15+16. Also owns deferred-from-LORE-15 work: emit Zod→JSON-Schema files + above-fence editor modeline |
| M2 / Backlog-adapter (LORE-21+) | Blocked on BJP (the Backlog.md `--json` fork) |

## Next steps

1. Start **LORE-16** (`src/core/bundle.ts`) per the paste-ready prompt → PR into dev.
2. Then **LORE-17** (`lore init`) — dep 15+16; also lands the two LORE-15 deferrals (JSON-Schema emit + editor modeline).

## Critical context / traps

- **ssh-agent is DOWN** (`ssh-add -l` → no agent; plain `git fetch`/`push` over SSH fail with "Permission denied (publickey)"). Use the gh-token HTTPS route:
  `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>`.
  A URL push/fetch does NOT update local `origin/<ref>` — refresh with `git update-ref refs/remotes/origin/<ref> <sha>` (else a false "ahead"/"behind"). `gh`/`gh pr` work regardless of ssh-agent.
- **Squash-merge artifact**: merged feature branches show "not fully merged" to `git branch -d` (squash = new SHA). Use `git branch -D` after confirming the PR is MERGED via `gh pr view`.
- **`js-yaml` pinned EXACT 4.1.0, NOT ^5.x** — `bun add js-yaml` floats to 5.1.0 (no default export, mismatches @types@4.x, conflicts with gray-matter's bundled 3.x). gray-matter/js-yaml/zod all pinned exact (ADR-0011). Don't let `bun add`/`bun update` float them. ([[lore-serialization-invariants]])
- **External-volume EXDEV** (`/Volumes/external`): plain `bun add`/`bun install` only — `--linker=isolated` and `bun build --compile` fail **silently** (0-byte). Verify any compiled binary on `/tmp`. `/Users/jdnewhouse/repos/lore` is a symlink to the same tree.
- **bundle.ts must emit byte-stable index.md/log.md** the same way concept.ts serializes (design §6.1): compose the fence + pinned js-yaml dump yourself, fixpoint over canonical form — NOT gray-matter.stringify (it Object.assigns away `__proto__` and reflows the body).
- **core/ is pure** (design §2.1): bundle.ts returns typed objects or throws LoreError; no printing/exit/flag-reading (that's the CLI layer).

## Do not repeat

- **Don't self-merge by default** — Jeremy reviews/merges ([[lore-git-workflow]]). The #12 admin-merge happened only because he explicitly answered "admin-merge"; do not generalize it.
- **A single review pass is not enough for a foundational module** — LORE-15 took 4 /code-review max + 1 /review; budget the same for bundle.ts.
- **Don't trust gray-matter.stringify** for byte-stable output — compose the fence + pinned js-yaml dump yourself.

## System of record updated (this session)

- **LORE-15** → **Done** (chore `8f5a04b`, pushed to dev). Delivered via PR #12 (squash `a6b3e64`).
- **dev** (`8424d4a`): LORE-15 Done flip + consumed handover `HANDOVER-2026-06-24-lore-15-pr-open.md` archived to `archive/handovers/`.
- **Branch cleanup**: `feat/lore-15-concept` deleted local + remote.
- No new auto-memory or doc facts this session (merge/finalization only; LORE-16 not yet started).
