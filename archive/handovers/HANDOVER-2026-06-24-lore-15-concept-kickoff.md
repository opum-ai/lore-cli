# Handover — core library kickoff: build LORE-15 concept.ts (LORE-12 output layer DONE)

**Date**: 2026-06-24 | **Grounded against**: `dev`=`8c797f9` (== origin/dev, clean tree; **no open PRs**) | **Backlog**: M0 + core-infra Done (LORE-6/7/8/10/11/12); **LORE-15 is next, unblocked** (dep LORE-11 Done)

## Paste-ready prompt for the next session

```
Continue building lore (OKF-native docs CLI, Bun+TS). The infra layer is DONE on dev — errors.ts
(LORE-11), config.ts (LORE-10), output.ts (LORE-12), plus M0 scaffolding/CI. NO open PRs; dev clean.

NEXT = LORE-15 (src/core/concept.ts): a single .md file ⇄ a typed Concept, with byte-stable
serialization. Unblocked (dep LORE-11 Done). Claim first:
  backlog task edit LORE-15 -s "In Progress" -a @claude

READ before coding: docs/specs/lore-design.md §2.1 (Concept interface + parseConcept/serializeConcept
signatures), §6 (idempotency / byte-stable serialization), §9 (testing: unit + GOLDEN byte-exact +
round-trip fixpoint); docs/adr/0011-frontmatter-serialization-stability.md; docs/reference/
portable-markdown.md + okf-conformance.md (OKF tolerance: unknown types/keys pass through); ADR-0010
(cross-link rules: relative, URL-encoded, .md-suffixed, no leading slash, no wikilinks). Also
docs/runbooks/dev-kickoff.md for the non-negotiables.

LORE-15 scope (confirm via `backlog task view LORE-15 --plain`): Concept {id, path, type, frontmatter,
body}; parseConcept(path, raw) via gray-matter + Zod (validate known types, passthrough unknown —
OKF-tolerant); serializeConcept(c) DETERMINISTIC bytes (fixed canonical key order for known keys,
stable insertion order for passthrough; quote-safety; ISO dates; no incidental flow/block flips);
parse→serialize→parse is a FIXPOINT; "no write when bytes unchanged". Bad frontmatter →
throw LoreError("validation") (exit 6) — REUSE errors.ts, don't invent. core/ is a pure library:
returns typed objects or throws LoreError; never prints, reads flags, or calls process.exit (design
§2.1). schema.ts (Zod source of truth) may be split out — check the design module tree; LORE-15's
title bundles "Zod per-type schemas".

NEW DEPS: gray-matter + zod (first runtime deps). On /Volumes/external use plain `bun add gray-matter
zod` (NOT --linker=isolated — it fails silently here; see traps).

BUILD ON (all on dev, do NOT reinvent):
- errors.ts: LoreError(type,message,hint?,input?); throw LoreError("validation", …) for bad frontmatter.
- output.ts: a future command renders a Concept via emit(); concept.ts itself stays render-free.

GATES (all pass before PR): export PATH="$HOME/.bun/bin:$PATH" FIRST (PATH not persisted per Bash call).
bun test ; bun run lint (Biome; lint:fix to auto-format) ; bun run typecheck (tsc strict,
noUncheckedIndexedAccess, verbatimModuleSyntax → `import type`). Golden tests pin exact bytes (§9.2).

WORKFLOW: feature branch feat/lore-15-concept + PR into dev; Jeremy reviews/merges (NO self-merge;
admin-merge / merge ONLY on explicit say-so — this session he said "proceed with merge"). Backlog via
CLI ONLY (never hand-edit backlog/**); claim In Progress @claude; on finish check ACs + --final-summary;
mark Done ON MERGE via a direct-to-dev chore commit (LORE-10/12 precedent). CHANGELOG (Unreleased).
For a foundational module (concept.ts qualifies — serialization surface) use /code-review max (NOT
/review) and budget 3-4 passes (see traps). Archived handovers commit DIRECTLY to dev, not in the PR.
```

## State

| Item | Status |
| --- | --- |
| `dev` | `8c797f9` (== origin/dev, clean; no open PRs). Has errors.ts + config.ts + output.ts + M0 |
| LORE-12 — output layer | **Done** (merged via PR #11, squash `01d3eb4`; Done `cd9c10e`). No follow-up |
| LORE-10 / LORE-11 | **Done** (config.ts / errors.ts on dev) |
| LORE-15 — concept.ts | **To Do — NEXT** (unblocked; dep LORE-11 Done; milestone m-2) |
| LORE-16 (bundle.ts) → LORE-17 (lore init) | To Do, **blocked** behind LORE-15 (then LORE-16) |

## Next steps

1. Build **LORE-15** (`src/core/concept.ts`) off `dev` → PR into dev. Claim first; read design §2.1/§6/§9 + ADR-0011.
2. Then LORE-16 (`bundle.ts`, dep LORE-15), then LORE-17 (`lore init`, dep 15+16). M2/Backlog-adapter tasks (LORE-21+) stay blocked on BJP (the Backlog.md `--json` fork).

## Critical context / traps

- **ssh-agent is DOWN** (`ssh-add -l` → no agent; SSH push/fetch → `Permission denied (publickey)`). Route pushes through the gh token over HTTPS: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>`. `gh` (API), `gh pr merge`, and `git update-ref refs/remotes/origin/dev <sha>` all work regardless. NOTE: pushing via the explicit URL does NOT update the local `origin/dev` tracking ref — refresh it with `git update-ref` (or it shows a false "ahead").
- **External-volume EXDEV** (`/Volumes/external`): `bun install --linker=isolated` and `bun build --compile` fail **silently** (0-byte binary). Use plain `bun install` / `bun add`; verify any compiled binary on `/tmp`. `/Users/jdnewhouse/repos/lore` is a **symlink to the same tree** (code-review ran against that path — same files).
- **Editing TS source with non-ASCII line terminators (U+2028/U+2029):** the Edit tool can land them as **literal codepoints** (invisible). Write the `  ` **escape text** and verify with a sweep using Python `\u` escapes **in the script**. Do NOT paste codepoints into a Bash/Python heredoc — they degraded to spaces this session and a `replace("  ", …)` rewrote every double-space, **corrupting src/output.ts** (recovered via `git checkout src/output.ts` + redo).
- **/code-review max needs 3-4 passes to converge** on a foundational module — LORE-12 took FOUR (each round found defects in the prior round's fixes; a finding repeated across rounds = act, don't re-defend). Decline latent/no-caller-yet findings with written rationale. Auto-memory: `code-review-vs-review-command`.
- **core/ purity (design §2.1):** concept.ts returns typed objects or throws LoreError — no printing, no flag reads, no process.exit. Rendering is output.ts's job, invoked later by a command.

## Do not repeat

- **Don't paste raw U+2028/U+2029 codepoints into a heredoc replace** (greedy double-space corruption of output.ts; only `git checkout` saved it) — use `\u` escapes in the script.
- **Don't mark a Backlog task Done at PR-open** — In Progress until merge (LORE-10/12 precedent).
- **Don't bundle housekeeping (archived handovers) into a feature PR** — commit directly to dev.
- **A single /code-review max pass is not exhaustive**; verify *which* review ran (/code-review vs /review).

## System of record updated (this session)

- **LORE-12 fully recorded and complete** — plan, ACs #1/#2, implementation + declined-findings notes, final summary, PR #11 link; status Done. CHANGELOG (Unreleased) entry merged to dev. Nothing pending.
- **Auto-memory:** `code-review-vs-review-command` gained the LORE-12 4-pass-convergence data point.
- **dev (direct housekeeping):** consumed handovers `lore-12-output-layer` (a83baf5) and `lore-12-pr-open` (8c797f9) archived. This handover is forward-looking (LORE-12 work is closed; it kicks off LORE-15).
