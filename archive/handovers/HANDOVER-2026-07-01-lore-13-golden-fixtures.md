# Handover — LCLI-13 (golden fixtures + JSON-contract tests) & merge-close LCLI-4 (PR #30)

**Date**: 2026-07-01 | **Grounded against**: lore `dev`=`origin/dev`=`70f340a`; branch `feat/lore-4-backlog-probe`=`f8c2df2` (clean, pushed); PR #30 OPEN→dev, MERGEABLE, all 4 CI checks green | **Backlog**: LCLI-1/2/3 **Done**; LCLI-4 **In Progress** (shipped via PR #30, awaiting merge); LCLI-13 **To Do** (no deps); LCLI-5 **parked**

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Master plan (approved, 4 phases):
/Users/jdnewhouse/.claude/plans/review-entire-backlog-of-mutable-origami.md

STEP 0 — close out LCLI-4 (only if PR #30 has been merged; check `gh pr view 30
--json state,mergedAt`). PR #30 = feat(LCLI-4): backlog capability probe +
verified compiled fork binary, base dev, all CI green as of handover.
  - If MERGED: on dev, `git fetch && git reset --hard origin/dev`
    (⚠️ this wipes uncommitted backlog task edits — re-apply after; see
    [[dev-sync-reset-wipes-backlog-edits]]), then mark LCLI-4 Done:
    `backlog task edit LCLI-4 -s Done`, and commit
    `chore(LCLI-4): mark Done (delivered via #30)` on dev, push. (This is the
    LCLI-31/33/34/48 finalize pattern.)
  - If NOT merged: leave LCLI-4 In Progress; do LCLI-13 on its own branch off dev.

STEP 1 — LCLI-13 (m-1, MEDIUM, no deps). Two ACs:
  AC#1 — a sample OKF bundle fixture exercising EVERY known concept type (valid +
    deliberately broken concepts). "Known types" = the OKF types lore's schema.ts
    validates (ADR/Reference/Runbook/Spec/Story/Decision/etc. — enumerate from
    src/core/schema.ts, don't guess). Broken concepts must trip representative
    `lore validate`/`lore check` findings (bad frontmatter, dangling link,
    non-portable syntax, missing summary).
  AC#2 — a golden JSON-contract test that runs against the FORK's real `--json`
    output and locks it to docs/reference/backlog-json-schema.md (the schema of
    record). Record goldens from the compiled fork binary (recipe in "traps"),
    plus golden-file idempotency scaffolding (re-generate == byte-identical).

  Fixtures live under test/ (see existing test/helpers.ts + the *.test.ts layout).
  Study how current tests build bundles (bundle.test.ts, check.test.ts,
  validate.test.ts) and reuse helpers.ts rather than inventing a new harness.
  Match lore style: 2-space indent, double quotes, biome lineWidth 120, heavy
  JSDoc, LoreError-typed assertions. Gates before finalizing: bun run typecheck;
  bun run lint; bun test (must stay all-green — was 990 pass/0 fail); lore
  validate + lore check clean.

  Finalize LCLI-13 the standard lore way (it adds real test code, NOT metadata-
  only): feature branch feat/lore-13-golden-fixtures off dev → commit
  feat(LCLI-13): … (Claude co-author + Claude-Session trailers) → PR into dev →
  the USER reviews/merges (do NOT self-merge) → post-merge chore(LCLI-13) marks
  Done. Check ACs + append notes + --final-summary as you go.

After m-0 (LCLI-4) + m-1 (LCLI-13) close, the coupling/adapter phase begins:
LCLI-21 (JSON-only adapter) EXTENDS src/adapters/backlog.ts (the probe seam this
session seeded) with typed reads/writes. BEFORE starting LCLI-21, resolve its
dependency oddity with the user: LCLI-21 lists dep LCLI-5 (parked upstream PR)
but actually needs LCLI-4 (now delivered) — likely a mis-wired dep.
```

## State

| Item | Status |
| --- | --- |
| lore `dev` / `origin/dev` | both `70f340a`; unchanged this session |
| **PR #30** (`feat/lore-4-backlog-probe` → dev) | **OPEN**, MERGEABLE, all 4 CI checks **green** (ubuntu/macos/windows lint·typecheck·test + ubuntu compile-smoke); HEAD `f8c2df2` |
| **LCLI-4** | **In Progress** — code shipped in PR #30; both ACs checked; Done follows merge via `chore(LCLI-4)` |
| **LCLI-13** (next) | **To Do**, Medium, m-1, no deps — golden fixtures + JSON-contract tests |
| **LCLI-1/2/3** | **Done** (fork `--json`; delivered in fork commit `28e0755` / fork HEAD `a80b7a1`) |
| **LCLI-5** | **parked** — upstream PR deferred |
| **LCLI-21** (adapter) | **To Do**, High, m-3; dep listed as parked **LCLI-5** (should be LCLI-4) — reconcile with user |

## Next steps

1. **Close LCLI-4** once PR #30 merges: mark Done + `chore(LCLI-4): mark Done (delivered via #30)` on dev (see STEP 0 trap about `reset --hard` wiping task edits).
2. **LCLI-13** on `feat/lore-13-golden-fixtures` off dev: fixture bundle (every OKF type + broken concepts) → AC#1; golden fork `--json` outputs + idempotency + JSON-contract test pinned to `docs/reference/backlog-json-schema.md` → AC#2. PR into dev; user merges.
3. **Then LCLI-21**: extend `src/adapters/backlog.ts`; first reconcile its LCLI-5-vs-LCLI-4 dep with the user.

## Critical context / traps

- **Recording goldens needs the compiled fork binary. Build it on REAL INTERNAL disk** — `~/repos/Backlog.md` is a SYMLINK to `/Volumes/external`, where `bun build --compile` silent-fails to a 0-byte binary. Proven recipe this session: `git clone --branch tasks/back-510-json-output --single-branch /Volumes/external/repos/Backlog.md <scratchpad>/backlog-build` (the session scratchpad `/private/tmp/...` resolves to `/dev/disk3s5` = internal; verify `realpath` has no `/Volumes/external`), then `bun install` + `bun run build` → `dist/backlog` (~66MB Mach-O, non-zero). Run its `backlog … --json` from a backlog project to capture goldens. [[external-volume-bun-exdev-traps]] [[backlog-fork-checkout]]
- **Real `--json` envelope shape (schema of record)**: `schemaVersion` is the **string** `"1"`; `kind` is **camelCase** `task`/`taskList`/`searchResult`; `task view` omits `rawContent` and `lastModified`; status is icon-free. The CLI-contract doc's old `"task-list"`/numeric prose was a slip — FIXED this session in `docs/reference/backlog-cli-contract.md` §1/§5. Lock LCLI-13 goldens to `docs/reference/backlog-json-schema.md`.
- **The probe lives at `src/adapters/backlog.ts`** — the design-spec §2.3/§8 *only backlog subprocess seam*, seeded with just the probe over an injectable `BacklogSpawn`. LCLI-21 EXTENDS this file (don't make a second spawning module). The adapter shells `backlog` on PATH (contract §5), not an npm dep.
- **Reads via `backlog task view --plain`, never grep `backlog/tasks/*.md`.** [[backlog-dependency-grep-trap]]
- **`reset --hard origin/dev` after merge wipes uncommitted task plan/notes/AC edits** — re-apply before the `chore: mark Done` commit. [[dev-sync-reset-wipes-backlog-edits]]
- **`back-510` ID collision** still latent in the fork; safe today; renumber only if upstream merges its `back-510` before a rebase.
- Don't open an upstream PR (LCLI-5 parked); don't merge/prune the fork branch `tasks/back-510-json-output`.

## Do not repeat

- **Don't add the runbook §6 package.json git-dep pin to lore.** Decided this session: the adapter shells `backlog` on PATH (contract §5), and lore on `/Volumes/external` hits the EXDEV/silent-compile trap for a compiling github git-dep. LCLI-4 built+verified+documented the binary instead. Flagged in PR #30 for the user; don't silently re-add it.
- **Don't `bun build --compile` inside `~/repos/Backlog.md`** — external-volume symlink → 0-byte silent fail. Clone to internal disk first.
- **Don't re-implement the probe or re-open LCLI-1/2/3** — probe shipped (PR #30, 16 tests); LCLI-1/2/3 Done.

## System of record updated (this session)

- **LCLI-4** → both ACs checked, plan + implementation notes + `--final-summary` + a "ready for review, PR #30" comment; status **In Progress** (Done deferred to post-merge). All committed on `feat/lore-4-backlog-probe`.
- **Code** (in PR #30): `src/adapters/backlog.ts` (probe + `BacklogSpawn` seam + `bunBacklogSpawn`), `test/backlog-probe.test.ts` (16 tests), doc fix to `docs/reference/backlog-cli-contract.md`.
- **Auto-memory**: updated [[backlog-fork-checkout]] + MEMORY.md index — LCLI-4 shipped as PR #30, probe at `src/adapters/backlog.ts` (LCLI-21 extends), adapter shells PATH, git-dep pin skipped, scratchpad is a valid internal-disk compile location.
- **Predecessor handover** `HANDOVER-2026-07-01-phase2-lore-4-13-binary-golden.md` superseded by this one (LCLI-4 half consumed; LCLI-13 carried forward) → archived to `archive/handovers/`.
