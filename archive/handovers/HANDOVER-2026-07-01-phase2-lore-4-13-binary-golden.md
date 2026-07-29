# Handover — LCLI-4 (compile fork binary + capability probe) & LCLI-13 (golden fixtures) — finish the BJP/m-0 milestone

**Date**: 2026-07-01 | **Grounded against**: lore `dev`=`origin/dev`=`70f340a`; fork `jeremy-newhouse/Backlog.md` `tasks/back-510-json-output`=`origin/...`=`a80b7a1`; both working trees clean | **Backlog**: LCLI-1/2/3 **Done**; LCLI-4 **To Do** (dep LCLI-2 ✓); LCLI-13 **To Do** (no deps); LCLI-5 **parked**

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Master plan (approved, 4 phases):
/Users/jdnewhouse/.claude/plans/review-entire-backlog-of-mutable-origami.md

State to trust (verify SHAs anyway): Phase 2 --json fork is BUILT and GREEN.
lore dev==70f340a. Fork branch tasks/back-510-json-output==a80b7a1 (commits:
28e0755 = --json impl [LCLI-2], a80b7a1 = fork task marked Done). LCLI-1/2/3 all
Done. --json works on all three read commands (task list/view/<id>/search),
emitting { schemaVersion:"1", kind, data }. Verified: bunx tsc 0 errors, biome
clean, bun test 1341 pass / 1 PRE-EXISTING unrelated fail (cli-doc-search
"Query is required" — fails on baseline too, IGNORE it).

TWO next tasks, both ready (pick either; they're independent):

LCLI-4 (m-0, MEDIUM, dep LCLI-2 ✓) — build the patched fork as a compiled binary
for lore to consume as a git dependency, + a capability probe.
  ⚠️ CRITICAL TRAP: ~/repos/Backlog.md is a SYMLINK to /Volumes/external/repos/
  Backlog.md (EXTERNAL volume). `bun build --compile` on /Volumes/external
  SILENTLY produces a 0-byte binary, and isolated `bun install` hits EXDEV.
  So you MUST clone/copy the fork branch to a REAL INTERNAL-disk path first
  (e.g. git clone the fork to /Users/jdnewhouse/<somewhere-not-symlinked>, or
  `cp -R` deref), then `bun install` + `bun run build` there. Verify:
  realpath of your build dir must NOT contain /Volumes/external.
  Runbook: docs/runbooks/backlog-json-patch.md §6. Smoke-test:
  ./dist/backlog --version ; ./dist/backlog task list --json | head -c 400
  (must be one JSON object) ; task view <id> --json | grep -c '"status"'.
  AC#2 (probe fails loud on a non-json Backlog) is lore-side and OVERLAPS
  LCLI-21's adapter — decide with the user whether LCLI-4 ships only a minimal
  standalone probe or defers the probe wiring to LCLI-21. Contract:
  docs/reference/backlog-cli-contract.md.

LCLI-13 (m-1, MEDIUM, no deps) — golden fixtures: a sample OKF bundle (valid +
deliberately broken concepts) + recorded golden Backlog --json outputs; golden-
file idempotency + JSON-contract test scaffolding. Now unblocked because the fork
emits real --json to record goldens against. AC#1 fixture bundle exercises every
known type; AC#2 golden JSON-contract test runs against fork output. Lock the
goldens to docs/reference/backlog-json-schema.md (the contract of record).

Finalize each in the lore repo the LCLI-1/2/3 way: check ACs + notes + final
summary, mark Done via a chore(LORE-N) commit on dev, push. The user reviews;
these metadata-only finalizations have been direct dev chore commits (NOT PRs)
because the code lives in the fork.
```

## State

| Item | Status |
| --- | --- |
| **LCLI-1** | **Done** — fork + in-fork task `back-510` (18eb886) |
| **LCLI-2** | **Done** — `--json` serializer + flag; fork `28e0755`; lore `4059011` |
| **LCLI-3** | **Done** — tests + help-schema + CLI-INSTRUCTIONS **delivered inside the LCLI-2 fork commit**; lore `70f340a` |
| lore `dev` / `origin/dev` | both `70f340a`; clean; no open PRs |
| **Fork** branch `tasks/back-510-json-output` | pushed `a80b7a1` (28e0755 impl + a80b7a1 task-Done); back-510 task Done |
| **LCLI-4** (next) | **To Do**, Medium, m-0, dep LCLI-2 ✓ — compile binary + capability probe |
| **LCLI-13** (next) | **To Do**, Medium, m-1, no deps — golden fixtures + JSON-contract tests |
| **LCLI-5** | **parked** — upstream PR deferred |
| **LCLI-21** (adapter) | **To Do**, High, m-3; dep is **LCLI-5** (parked) — see trap re: dependency oddity |

## Next steps

1. **LCLI-4** — clone the fork branch to a **real internal-disk** path (NOT `~/repos/Backlog.md`, which symlinks to `/Volumes/external`), `bun install` + `bun run build`, smoke-test `backlog task list --json`. Wire lore's git-dep pin (`github:jeremy-newhouse/Backlog.md#tasks/back-510-json-output`) per runbook §6. Resolve the probe-scope overlap with LCLI-21 (ask user). Finalize LCLI-4 on dev.
2. **LCLI-13** — author the fixture OKF bundle (valid + broken concepts, every type) and record golden `--json` outputs from the live fork; add golden idempotency + JSON-contract test scaffolding pinned to `docs/reference/backlog-json-schema.md`. Finalize LCLI-13.
3. After m-0 closes (LCLI-4), the coupling/adapter phase (LCLI-21 → LCLI-22/23/24/26/27) begins — but reconcile the **LCLI-21 dep on parked LCLI-5** first (likely should be LCLI-4, not LCLI-5).

## Critical context / traps

- **BUILD ON REAL INTERNAL DISK — the fork path lies.** `~/repos/Backlog.md` is a **symlink to `/Volumes/external/repos/Backlog.md`** (verify: `realpath ~/repos/Backlog.md`). On `/Volumes/external`, `bun build --compile` silent-fails to a 0-byte binary and isolated `bun install` hits EXDEV. Everything ELSE (non-isolated `bun install`, `bun src/cli.ts`, `bunx tsc`, `biome check`, `bun test`) runs fine there — proven in LCLI-2. Only the **compile** step needs a non-symlinked internal path. [[external-volume-bun-exdev-traps]] [[backlog-fork-checkout]]
- **Pre-existing fork test failure**: `bun test` shows 1 fail, `cli-doc-search "Query is required"` — it fails on a clean baseline too (upstream error-message drift), NOT caused by our work. Do not chase it. [[backlog-fork-checkout]]
- **json-before-plain ordering** is the load-bearing correctness detail already shipped: the `--json` early-return precedes `isPlainRequested(options) || shouldAutoPlain` at all four sites (search/list/view/`<id>`), and each site's `usePlainOutput` gate now also enters on `isJsonRequested`. If you re-touch cli.ts, preserve this. The non-TTY pipe test is the guard.
- **Line numbers are v1.47.1 anchors** — re-grep after any upstream rebase.
- **`back-510` ID collision** still latent: upstream's unmerged `tasks/back-510-repeated-label-flags` reuses `back-510`. Safe today (upstream top = BACK-508 merged; highest ≤ 509). Renumber our task only if upstream merges theirs before we rebase. Runbook §8.
- **Backlog deps via `backlog task view --plain`, never grep.** [[backlog-dependency-grep-trap]]
- **LCLI-21 dependency oddity**: LCLI-21 (JSON-only adapter) lists dep **LCLI-5** (parked upstream PR), but the adapter actually needs LCLI-4 (compiled binary + probe). Flag to the user before starting the coupling phase; don't silently rewire deps.
- **Don't open an upstream PR** (LCLI-5 parked) and **don't merge/prune** `tasks/back-510-json-output`.

## Do not repeat

- **Don't `bun build --compile` inside `~/repos/Backlog.md`** — it's on the external volume via symlink; the compile silent-fails to a 0-byte binary. The prior memory/handover claiming it was "internal disk" was WRONG; corrected this session.
- **Don't re-implement LCLI-3** — its scope (cli-json-output.test.ts incl. the non-TTY pipe case, addHelpSchema, CLI-INSTRUCTIONS) already shipped in the LCLI-2 fork commit `28e0755` and LCLI-3 is marked Done.
- **Don't split tests from code again expecting a separate task** — LCLI-2 correctly bundled the tests+docs (LCLI-3's scope) with the serializer; that's why LCLI-3 was pre-satisfied.

## System of record updated (this session)

- **LCLI-2** → **Done** (ACs checked, notes, final summary); lore `dev` `4059011` `chore(LCLI-2): Done`.
- **LCLI-3** → **Done** (ACs checked, notes, final summary — delivered via LCLI-2); lore `dev` `70f340a` `chore(LCLI-3): Done`.
- **Fork** `back-510` task → **Done** (5 AC + 6 DoD checked, notes, final summary); fork `a80b7a1`.
- **Fork branch** pushed with `--json` implementation (`28e0755`) + tests + help docs.
- **Auto-memory**: corrected [[backlog-fork-checkout]] — `~/repos/Backlog.md` is a SYMLINK to `/Volumes/external` (was wrongly recorded as internal disk); recorded the pre-existing `cli-doc-search` test-baseline failure; noted LCLI-2/3 Done + fork HEAD `a80b7a1`. Updated MEMORY.md index line.
- **Prior handover** `HANDOVER-2026-07-01-phase2-lore-2-json-serializer.md` archived to `archive/handovers/` in `4059011`.
