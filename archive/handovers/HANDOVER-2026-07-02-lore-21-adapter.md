# Handover — LCLI-21: JSON-only backlog.ts adapter (typed reads + CLI writes)

**Date**: 2026-07-02 | **Grounded against**: lore `dev`=`main`=`f2c4c3e` (clean, pushed, no open PRs) | **Backlog**: LCLI-1/2/3/4/13 **Done**; LCLI-5 **parked**; **LCLI-21 To Do** (next, m-3, High)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Then plan+execute LCLI-21.

STEP 0 — reconcile the dependency BEFORE coding (ask the user):
  LCLI-21 lists Dependencies: LCLI-5, but LCLI-5 is the *parked* "open upstream
  --json PR + migrate on release" task (m-0). LCLI-21 actually needs LCLI-4 (the
  compiled/verified fork + probe, now DONE). Confirm with the user, then fix:
  `backlog task edit LCLI-21 --dep LCLI-4` (and drop LCLI-5) so the graph is honest.
  Do NOT block LCLI-21 on the parked upstream PR.

STEP 1 — LCLI-21 (m-3, High). Two ACs:
  AC#1 — the adapter NEVER parses `--plain` text: every read is `--json` +
    JSON.parse of the {schemaVersion, kind, data} envelope (ADR-0002, no text
    fallback).
  AC#2 — the capability probe refuses a non-`--json`-capable Backlog (already
    built in LCLI-4; wire it into the adapter's read path + cache per contract §7).

  EXTEND the EXISTING file src/adapters/backlog.ts — the design-spec §2.3/§8 *only
  backlog subprocess seam*, already carrying probeBacklog + the injectable
  BacklogSpawn seam + bunBacklogSpawn (LCLI-4). Do NOT create a second spawning
  module. Build the typed read/write surface ON TOP of that seam:
    - Reads: `task view <id> --json` (kind task), `task list [--status/--label …]
      --json` (kind taskList), `search <q> --json` (kind searchResult). Validate
      `data` against the per-kind Zod shape; unknown keys tolerated, missing
      required rejected; map into lore's internal BacklogTask type.
    - PROMOTE the Zod contract mirror: it already exists (test-only) in
      test/support/backlog-golden.ts (TaskSchema/TaskSummarySchema/SearchHitSchema/
      EnvelopeSchema, mirroring backlog-json-schema.md §1–§5). Move the schema of
      record INTO src/adapters/backlog.ts and retarget the test mirror to import it
      — don't leave two copies.
    - Prefer filePathRelative (never absolute filePath) for anything persisted;
      keep `id` as identity (never derive a filename from it); read the
      `doc:<conceptId>` back-reference out of labels[]; never anchor to an AC/DoD
      `index` (non-durable — match on text).
    - Writes: `task create/edit --json`; capture the new id from the
      `Created task <ID>` stdout line, NOT from JSON. Existence via edit/list,
      never `view`.
    - Do NOT wire coupling commands (link/unlink/tasks/orphans/sync) into cli.ts
      dispatch — those are LCLI-22+. LCLI-21 is the adapter layer only.

  Unit-test with the INJECTED BacklogSpawn fake (see test/backlog-probe.test.ts
  fakeSpawn) feeding the COMMITTED goldens under test/fixtures/backlog-json/
  {task,task-list,search-result}.json — ready-made real-fork envelopes. Match lore
  style: 2-space, double quotes, biome lineWidth 120, heavy JSDoc, LoreError-typed
  failures. Gates: bun run typecheck; bun run lint; bun test (keep all-green, was
  1026 pass); lore validate + lore check clean.

  Finalize the standard lore way: feature branch feat/lore-21-adapter off dev →
  feat(LCLI-21): … (Claude co-author + Claude-Session trailers) → PR into dev.
  The user landed #30 and #31 himself this session via admin-merge+promote; ASK
  whether to do the same for LCLI-21 or leave it for review — don't assume.
```

## State

| Item | Status |
| --- | --- |
| lore `dev` / `main` | both `f2c4c3e`, identical, pushed; no open PRs; tree clean |
| **LCLI-21** (next) | **To Do**, High, m-3; dep listed as parked **LCLI-5** (should be LCLI-4) — reconcile first |
| **LCLI-4** | **Done** — probe + fork binary; delivered via PR #30 (squash `2ba86aa`) |
| **LCLI-13** | **Done** — golden fixtures + JSON-contract tests; delivered via PR #31 (squash `7a3548e`) |
| **LCLI-1/2/3** | **Done** (fork `--json`) |
| **LCLI-5** | **parked** — upstream PR deferred; do NOT open it |

## Next steps

1. Reconcile LCLI-21's dep (LCLI-5 → LCLI-4) with the user, then `backlog task edit`.
2. Extend `src/adapters/backlog.ts` with typed reads/writes over the existing `BacklogSpawn` seam; promote the Zod mirror out of `test/support/backlog-golden.ts` and retarget the test to import it.
3. Unit-test via injected `BacklogSpawn` fake + the committed `test/fixtures/backlog-json/*.json` goldens. PR into dev.

## Critical context / traps

- **Extend `src/adapters/backlog.ts`; it is the ONLY backlog subprocess seam** (design §2.3/§8). It already has `probeBacklog`, the `BacklogSpawn` interface, `bunBacklogSpawn`, `MIN_BACKLOG_VERSION`, `EXPECTED_SCHEMA_VERSION`. Don't add a second spawning module. [[backlog-fork-checkout]]
- **The Zod contract mirror already exists** in `test/support/backlog-golden.ts` (test-only) and the committed goldens in `test/fixtures/backlog-json/` are real fork output — reuse both. Move the schema into `src/` and import it back into the test (no duplicate). [[backlog-fork-checkout]]
- **Envelope facts (schema of record = `docs/reference/backlog-json-schema.md`)**: `schemaVersion` is the STRING `"1"`; `kind` is camelCase `task`/`taskList`/`searchResult`; `task view` omits `rawContent` (opt-in `--json-raw`) and `lastModified`; status is icon-free; list fields are always arrays; scalar-optionals are null. Prefer `filePathRelative`; read `doc:<id>` from `labels[]`; AC/DoD `index` is non-durable.
- **Writes capture the id from the `Created task <ID>` stdout line, not JSON** (backlog-cli-contract.md). Existence via `edit`/`list`, never `view`.
- **Fork can be run WITHOUT compiling**: `bun ~/repos/Backlog.md/src/cli.ts … --json` (branch `tasks/back-510-json-output` @ `a80b7a1`) works even on the external volume — only `bun build --compile` silent-fails there. Use it for ad-hoc integration checks; unit tests use the injected fake + goldens, not a live fork. [[external-volume-bun-exdev-traps]]
- **Reads via `backlog task view --plain`, never grep `backlog/tasks/*.md`** for task metadata. [[backlog-dependency-grep-trap]]
- **Post-merge `git reset --hard origin/dev` wipes uncommitted task edits** — re-apply before the `chore: mark Done` commit. [[dev-sync-reset-wipes-backlog-edits]]
- **`back-510` ID-collision** hazard still latent in the fork; safe today; renumber only if upstream merges its `back-510` before a rebase.

## Do not repeat

- **Don't create a second backlog-spawning module** — extend `src/adapters/backlog.ts`.
- **Don't parse `--plain`** anywhere in the adapter (AC#1; ADR-0002 has no text fallback).
- **Don't add the runbook §6 package.json git-dep pin** — the adapter shells `backlog` on PATH; lore on `/Volumes/external` hits the EXDEV/silent-compile trap for a compiling git-dep. Decided in LCLI-4.
- **Don't `bun build --compile` inside `~/repos/Backlog.md`** (external-volume symlink → 0-byte silent fail); clone to internal disk if a real binary is ever needed.
- **Don't open the upstream PR (LCLI-5 is parked); don't merge/prune the fork branch `tasks/back-510-json-output`.**

## System of record updated (this session)

- **LCLI-4** → Done (PR #30 merged; `chore(LCLI-4)` on dev; promoted to main).
- **LCLI-13** → Done (PR #31 merged; ACs checked + plan + notes + `--final-summary`; `chore(LCLI-13)` on dev; promoted to main). Delivered: `test/fixtures/okf-bundle/` + `test/okf-fixture.test.ts` (AC#1), `test/fixtures/backlog-json/*.json` + `test/support/backlog-golden.ts` + `test/support/record-backlog-goldens.ts` + `test/backlog-json-golden.test.ts` (AC#2).
- **Auto-memory** [[backlog-fork-checkout]] — LCLI-4/13 Done, dev==main==`073f9ba`→`f2c4c3e`, golden-harness locations, and the note to retarget the test-only Zod mirror onto LCLI-21's `src/adapters/backlog.ts` schema.
- **Predecessor handover** `HANDOVER-2026-07-01-lore-13-golden-fixtures.md` fully consumed (both LCLI-4 + LCLI-13 halves done) → archived to `archive/handovers/` (commit `f2c4c3e`).
