# Handover — LORE-11 done (PR #9 green, awaiting review); build M0 core LORE-10 → LORE-12 next

**Date**: 2026-06-22 | **Grounded against**: origin/dev=`9511d27`, feat branch `4a713c5` (PR #9) | **Backlog**: LORE-11 Done; LORE-10/12 To Do (m-1)

## Paste-ready prompt for the next session

```
Continue building lore (OKF-native docs CLI, Bun+TS). Read docs/runbooks/dev-kickoff.md + docs/specs/lore-design.md (§2 module tree, §4 error model, §5 output layer) + docs/reference/cli-contract.md for constraints.

STATE: origin/dev=9511d27 (clean). LORE-11 (shared error model: src/errors.ts) is DONE and shipped as PR #9 (feat/lore-11-error-model → dev), ALL CI GREEN, mergeable. The user reviews/merges — do NOT self-merge unless told "admin-merge".

FIRST: confirm PR #9 status (gh pr view 9 / gh pr checks 9). If MERGED → git switch dev && git pull, then proceed. If still OPEN → either wait, or (only if user says) admin-merge. The user chose to let #9 land before building dependents (LORE-10/12 both import errors.ts).

THERE IS A PENDING DECISION: a max-effort review of #9 produced 4 findings (see "Review findings" below). The user had NOT yet decided whether to apply finding #1 (safe-stringify on the error path — recommended) before merge when they ran /handover. Resolve this first: ask, or apply #1 + the doc nits as a small follow-up.

THEN build M0 core in this order — one feature branch + PR into dev per task, off freshly-merged dev:
- LORE-10: .lore config loader (native Bun TOML via `Bun.TOML`/import, + env overlay) — ADR-0013, tech-stack §8. Throws LoreError (usage/validation) from src/errors.ts; load .lore/config.toml from state dir.
- LORE-12: output layer src/output.ts — resolve mode (--json > --plain > pretty; plain auto on non-TTY), success envelope {schemaVersion,kind,data} on stdout, pretty/plain renderers, NO_COLOR + TTY handling, truncation hints (total/shown/truncated/hint). Wire errors.ts: derive {json, color} from the resolved mode and pass to reportError() / WarningCollector.flush(). Define `OutputMode = "json"|"plain"|"pretty"` here (errors.ts deliberately does NOT know modes).

errors.ts PUBLIC API to build on (do not reinvent): LoreError(type,message,hint?,input?); ErrorType = usage|not_found|denied|conflict|validation|drift; EXIT_OK=0, EXIT_UNCAUGHT=1, EXIT_CODES (2/3/4/5/6; validation+drift→6); exitCodeFor(unknown); toErrorEnvelope; formatErrorText(err,{color}); reportError(err,{json,color,stderr?})→exit code; WarningCollector(add/count/isEmpty/list/flush); Writer interface.

TOOLCHAIN: Bun 1.2.23 at ~/.bun/bin/bun; PATH NOT persisted across Bash calls — prefix every bun cmd: export PATH="$HOME/.bun/bin:$PATH". Gates (all must pass before PR): bun test, bun run lint (Biome; run `bun run lint:fix` to auto-format), bun run typecheck (tsc strict). EXTERNAL-VOLUME TRAP: repo on /Volumes/external — `bun install --linker=isolated` and `bun build --compile` fail SILENTLY (0-byte binary); use plain `bun install`, verify any compiled binary on /tmp (auto-memory: external-volume-bun-exdev-traps).

WORKFLOW: feature task work = feature branch + PR into dev (user reviews/merges). Backlog: lore is sole committer; CLI only (backlog task edit …), never hand-edit backlog/**; claim with `-s "In Progress" -a @claude`, finish `-s Done --check-ac N --append-notes --final-summary`, update CHANGELOG (Unreleased). Pure housekeeping (archived handovers) is committed DIRECTLY to dev (precedent: 0dffdb5, 9511d27) — do NOT bundle it into a feature PR.
```

## State

| Item | Status |
| --- | --- |
| `origin/dev` | `9511d27` (clean; archived m0 handover landed here this session) |
| LORE-11 — shared error model (`src/errors.ts`) | **Done** — both ACs checked, notes + final summary recorded |
| PR #9 — `feat(LORE-11)` → `dev` (`4a713c5`) | **OPEN, all 4 CI checks green, mergeable** — awaiting user review/merge |
| LORE-11 review (max effort) | Done — **approve-with-nits**; 4 findings, decision on #1 PENDING (see below) |
| PR #6 — ECK⇄Lore alignment (`eck-alignment`) | **OPEN** — coordination thread; lore side complete (unchanged) |
| LORE-10 — `.lore` config loader | **To Do — NEXT after #9 merges** (m-1) |
| LORE-12 — output layer | **To Do — after LORE-10** (m-1); wires `reportError` from #9 |
| Archived: `archive/handovers/HANDOVER-2026-06-22-build-m0.md` | this session's predecessor; committed status — see "Do not repeat" |

## Next steps

1. Check PR #9 (`gh pr checks 9`); if merged, `git switch dev && git pull`.
2. **Resolve the pending review decision** on #9 (apply finding #1 + doc nits, or defer — ask the user).
3. Build **LORE-10** (`.lore` config loader) → PR into dev. Claim: `backlog task edit LORE-10 -s "In Progress" -a @claude`.
4. Build **LORE-12** (output layer) → PR into dev; wire `errors.ts` `reportError`/`WarningCollector` via a resolved `{json,color}`.
5. Optional (flagged at session start, not done): triage the 57 unprocessed tool failures in `.claude/error-history.jsonl` — capture any recurring fix as a Backlog note or auto-memory (likely the known PATH/EXDEV traps, already in auto-memory).

## Review findings on PR #9 (PENDING — not yet applied)

1. **(Recommended before merge)** `reportError` → `JSON.stringify(toErrorEnvelope(err))` serializes `err.input` (`unknown`); a **circular** or unbounded `input` makes `JSON.stringify` throw on the last-resort error path. Fix: wrap in a `safeStringify` fallback + add a circular-`input` test. Minimum: document that `LoreError.input` must be JSON-serializable.
2. `error_type: "uncaught"` (non-LoreError JSON branch) is **not in cli-contract §5** — either document the exit-1 envelope shape in `docs/reference/cli-contract.md`, or treat it as an internal safety net the M1 top-level handler owns.
3. `WarningCollector.flush` is **non-draining** (double-flush double-emits; the color test relies on this). Add a docstring ("does not clear") or switch to drain semantics.
4. Doc-sync (trivial): `docs/specs/lore-design.md` §4.1 `ErrorType` snippet lists **5** types; the implementation has **6** (added `drift` to honor the normative cli-contract §5.3, validation+drift→6). Update the design snippet.

## Critical context / traps

- **`errors.ts` is mode-agnostic by design.** It never resolves TTY/`NO_COLOR`/mode and never writes stdout. LORE-12 owns mode resolution and passes `{json,color}` down. Do not add mode logic to `errors.ts`.
- **`drift` is a 6th `ErrorType`** sharing exit `6` with `validation` (per cli-contract §5.3, NOT the 5-type design snippet). Use `validation` for `lore validate` ERROR tier, `drift` for `lore check` drift/broken-link/stale-managed-block.
- **External-volume EXDEV (high-value):** on `/Volumes/external`, isolated install + `bun build --compile` silently produce broken/0-byte artifacts. Plain `bun install`; verify compiled binaries on `/tmp` (auto-memory: `external-volume-bun-exdev-traps`).
- **PATH not persisted** across Bash calls — prefix every bun command with `export PATH="$HOME/.bun/bin:$PATH"`. `backlog` is on PATH already.
- **Do not self-merge** PRs — user reviews/merges. Admin-merge only on explicit say-so.
- **Backlog:** lore is sole committer; CLI only; `backlog/config.yml` keeps `check_active_branches`/`remote_operations`/`auto_commit` = false (ADR-0012).

## Do not repeat

- `bunx .` does **not** work (Bun's bunx is registry-only); use `bun .` / `bun run lore`.
- Don't chase isolated-install/`--linker=isolated` failures locally — it's external-volume EXDEV, not a config bug (CI passes).
- **Don't bundle housekeeping into a feature PR.** This session's archived-handover commit (`9511d27`) went **directly to dev** (and was pushed) to keep PR #9 clean. The predecessor handover `archive/handovers/HANDOVER-2026-06-22-build-m0.md` is being committed the same way (this session, on dev). Feature branches carry only their task's code + that task's backlog metadata + CHANGELOG.
- Don't append review-feedback notes to a Done task's PR mid-review (pollutes the diff under review) — findings live in this handover until the user decides.

## System of record updated (this session)

- **Backlog:** LORE-11 → **Done**; AC#1 + AC#2 checked; implementation notes (full surface + design decisions + validation results) and final summary recorded. No other task touched.
- **Repo (PR #9, feat branch):** `src/errors.ts` (new), `test/errors.test.ts` (new, 12 tests), `CHANGELOG.md` (Unreleased → LORE-11 entry).
- **Repo (dev, direct):** `9511d27` archived the previous (2026-06-21) m0 handover; this handover's predecessor archived + committed on dev this session.
- **Auto-memory:** no change (existing `external-volume-bun-exdev-traps`, `lore-git-workflow`, `eck-lore-alignment` still current).
