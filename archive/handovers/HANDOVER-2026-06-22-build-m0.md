# Handover — M0 foundation merged + ECK alignment resolved; build M0 core (LORE-11→10→12) next

**Date**: 2026-06-22 | **Grounded against**: dev=`3500997` | **Backlog**: LORE-6/7/8 Done; LORE-11/10/12 next (m-1); LORE-45/46/47 tracked (ECK)

## Paste-ready prompt for the next session

```
Continue building lore (OKF-native docs CLI, Bun+TS). Read docs/runbooks/dev-kickoff.md + docs/specs/lore-design.md for constraints.

STATE: dev=3500997 (clean). M0 foundation (LORE-6/7/8: toolchain, Biome+test, CI) is MERGED. The ECK<->Lore alignment is RESOLVED on lore's side (all 10 decisions; see PR #6 thread + auto-memory eck-lore-alignment) — nothing there blocks lore's build.

BUILD NEXT — M0 core, in this order (one feature branch + PR into dev per task; you review/merge — NEVER self-merge unless the user says "admin-merge"):
- LORE-11: shared error model, exit codes (0/2/3/4/5/6), warning collector — ADR-0005, docs/reference/cli-contract.md
- LORE-10: .lore config loader (native Bun TOML + env overlay) — ADR-0013, tech-stack §8
- LORE-12: output layer (--plain / --json envelope {schemaVersion,kind,data} / pretty) — ADR-0004, ADR-0005
Claim each: backlog task edit LORE-N -s "In Progress" -a @claude. Finish: status Done + --final-summary + CHANGELOG (Unreleased). Keep core/ a library returning structured objects; commands thin (ADR-0004).

THEN M1 core (m-2): LORE-15 (concept.ts + per-type validators, now built FROM the declarative .lore/profile per LORE-46), LORE-16 (bundle.ts), LORE-17/18/19 (init/new/validate). LORE-46 (.lore/profile.toml grammar — FINALIZED, full spec in the task) and LORE-47 (GitAdapter log.md + resource_base) are m-2; LORE-45 (importable library) is DEFERRED (m-9) — lore stays a standalone CLI.

TOOLCHAIN: Bun 1.2.23 at ~/.bun/bin/bun; PATH not persisted across Bash calls — prefix every bun cmd: export PATH="$HOME/.bun/bin:$PATH". Gates: bun run lint (Biome), bun run typecheck (tsc), bun test. EXTERNAL-VOLUME TRAP: repo on /Volumes/external — both `bun install --linker=isolated` and `bun build --compile` fail SILENTLY (0-byte binary); use plain `bun install` locally and verify any compiled binary on /tmp (auto-memory: external-volume-bun-exdev-traps). BACKLOG: lore is the sole committer of backlog/; use the backlog CLI only; never hand-edit backlog/**.
```

## State

| Item | Status |
| --- | --- |
| `dev` | `3500997` (clean, nothing unpushed) |
| LORE-6 / LORE-7 / LORE-8 (M0 toolchain/test/CI) | **Done** |
| PRs #1–#5, #7, #8 | **Merged** |
| PR #6 — ECK⇄Lore alignment record (`eck-alignment`) | **OPEN** — coordination thread; ECK folding into its ADR-051; lore side complete |
| LORE-11 → LORE-10 → LORE-12 (M0 core) | **To Do — NEXT, in that order** (m-1) |
| LORE-46 — declarative `.lore/profile` (grammar FINALIZED in task) | To Do (m-2) |
| LORE-47 — GitAdapter `log.md` + `resource_base` | To Do (m-2) |
| LORE-45 — importable library | **Deferred** (m-9, low) — lore stays a standalone CLI |
| `archive/handovers/HANDOVER-2026-06-21-m0.md` | superseded by this file; moved (was untracked — UNCOMMITTED) |

## Next steps

1. Build **LORE-11 → LORE-10 → LORE-12** (feature branch + PR each; user reviews/merges).
2. Then M1 core (LORE-15/16/17/18/19). **LORE-15 builds validators FROM the `.lore/profile`** (LORE-46), not a hardcoded type table.
3. ECK: PR #6 is theirs to fold into ADR-051; lore owes nothing further unless ECK raises a new decision.
4. (Optional housekeeping) commit the archived m0 handover when convenient — it's an untracked move, not on a landing branch yet.

## Critical context / traps

- **External-volume EXDEV (high-value):** on `/Volumes/external`, `bun install --linker=isolated` AND `bun build --compile` silently produce broken/0-byte artifacts. Use plain `bun install` locally; verify compiled binaries on `/tmp`. (auto-memory: `external-volume-bun-exdev-traps`)
- **Do not self-merge** PRs — the user reviews/merges. Admin-merge only when explicitly authorized (this session: #1–#5, #7, #8 were admin-merged on explicit say-so).
- **Backlog:** lore is sole committer; CLI only; `backlog/config.yml` keeps `check_active_branches`/`remote_operations` = false (ADR-0012).
- **ECK alignment locked decisions** (auto-memory: `eck-lore-alignment`): lore is **standalone, NOT dependent on ECK**; D1 = declarative `.lore/profile` (config, **no code / no escape hatch**); D2 importable library **deferred**; ECK consumes lore via the **CLI + `--json` contract** + a `.lore/profile` it ships in **its own** repo.
- **LORE-46 grammar is FINALIZED** (full spec in the task): TOML at `.lore/profile.toml`; `[profile]` / `[base.fields]` / `[[types]]`; field-spec `{required, kind, enum, items, default}`; **`kind` not `type`**; lower-kebab **slug rule** for generated schema files (`QA Plan` → `qa-plan.json`). ADR-0006/0011/0013/0007 amendments are pending implementation (carried in LORE-46/47 ACs).

## Do not repeat

- `bunx .` does **not** work (Bun's bunx is registry-only); use `bun .` / `bun run lore`.
- Don't chase `bun install --frozen-lockfile --linker=isolated` failing locally — it's the external-volume EXDEV, not a config bug (CI passes).
- Don't bake ECK's profile into lore — it's a **consumer** artifact living in ECK's repo; lore ships only its built-in story-convention profile.
- Don't reuse the reserved `lore:tasks` marker for the CLAUDE.md nudge — use a distinct `lore:agents` marker (ADR-0008; LORE-36/D7).

## System of record updated (this session)

- **Backlog:** LORE-6/7/8 → Done (M0 stack merged); LORE-6 AC#3 checked. Created **LORE-45** (deferred library), **LORE-46** (declarative profile + finalized grammar), **LORE-47** (GitAdapter + `resource_base`); LORE-29 now depends on LORE-47.
- **Repo (merged to dev):** `backlog/config.yml` (`check_active_branches`/`remote_operations`→false, ADR-0012); `lore-spec.md` superseded `--plain`/MCP banner; `DEVELOPMENT.md` external-volume note; `.github/workflows/ci.yml` compile-smoke now asserts output.
- **Auto-memory:** `eck-lore-alignment.md` (new), `external-volume-bun-exdev-traps.md` (new), `MEMORY.md` index.
- **PR #6:** ECK alignment verdicts (D1–D10), gated-item resolutions, and the LORE-46 grammar finalization — all in the thread (handed back to ECK).
