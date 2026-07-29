# Handover — build core LCLI-10 → LCLI-12 (errors.ts merged on dev)

**Date**: 2026-06-23 | **Grounded against**: `dev`=`11946f5` (== origin/dev, clean tree) | **Backlog**: LCLI-11 Done; LCLI-10/12 To Do (m-1)

## Paste-ready prompt for the next session

```
Continue building lore (OKF-native docs CLI, Bun+TS). Read docs/runbooks/dev-kickoff.md + docs/specs/lore-design.md (§2 module tree, §4 error model, §5 output layer) + docs/reference/cli-contract.md for constraints.

STATE: PR #9 (LCLI-11 shared error model) is MERGED into dev (squash commit 11946f5). src/errors.ts + test/errors.test.ts (52 tests) ARE on dev. The "land #9 first" blocker is GONE — LCLI-10 and LCLI-12 both `import` src/errors.ts and can now be branched straight off dev. dev == origin/dev, working tree clean.

BUILD ORDER (verified m-1): LCLI-10 first, then LCLI-12. One feature branch + PR into dev per task, off current dev.

LCLI-10 — .lore config loader (src/config.ts or similar): parse .lore/config.toml with Bun NATIVE TOML (Bun.TOML / import attributes — do NOT add a TOML dep; tech-stack §10 "use the runtime, don't duplicate it"), overlay env (LORE_CONFLUENCE_TOKEN is read from env and NEVER persisted/written back). Throw LoreError (type "usage" for malformed flags, "validation" for bad config) from src/errors.ts. ADR-0013 (state dir layout), tech-stack §8. AC#1: config.toml is committed + cache/ is gitignored. AC#2: reconcile rules + link options are configurable. Claim first: backlog task edit LCLI-10 -s "In Progress" -a @claude.

LCLI-12 — output layer (src/output.ts): resolve mode (--json > --plain > pretty; plain auto-selected when stdout is non-TTY), success envelope {schemaVersion,kind,data} on stdout, pretty/plain renderers, NO_COLOR + TTY handling, truncation hints (total/shown/truncated/hint). DEFINE OutputMode = "json"|"plain"|"pretty" HERE (errors.ts is deliberately mode-agnostic and does NOT define it). Wire errors.ts: derive {json,color} from the resolved mode and pass to reportError()/WarningCollector.flush(). AC#1: JSON uses the {schemaVersion,kind,data} envelope. AC#2: non-TTY auto-plain, --json overrides.

errors.ts PUBLIC API on dev (build on this, do NOT reinvent): LoreError(type,message,hint?,input?); ErrorType = usage|not_found|denied|conflict|validation|drift; EXIT_OK=0, EXIT_UNCAUGHT=1, EXIT_CODES (2/3/4/5/6; validation+drift→6, frozen); exitCodeFor(unknown); toErrorEnvelope(err) → {error_type,message,hint?,input?} (coerces message/hint to SINGLE-LINE strings, omits empty hint, echoes only a non-null NON-ARRAY object input); formatErrorText(err,{color}) (single-line); reportError(err,{json,color,stderr?}) → exit code (returns exitCodeFor(err); crash-safe — safeStringify→toJsonSafe honors toJSON WITH the property key, builds via Object.create(null) so a __proto__ data key survives, handles cycles/BigInt/throwing getters; an empty-message thrown object no longer leaks its other fields); WarningCollector(add/count/isEmpty/list/flush — flush is non-draining); Writer interface. errors.ts resolves NO mode/TTY/NO_COLOR and never writes stdout — the caller (output.ts) passes a resolved {json,color}.

TOOLCHAIN: Bun 1.2.23 at ~/.bun/bin/bun; PATH is NOT persisted across Bash calls — prefix every bun cmd: export PATH="$HOME/.bun/bin:$PATH". Gates (all must pass before PR): bun test, bun run lint (Biome; lint:fix to auto-format), bun run typecheck (tsc strict). EXTERNAL-VOLUME TRAP: repo on /Volumes/external — `bun install --linker=isolated` and `bun build --compile` fail SILENTLY (0-byte binary); use plain `bun install`, verify any compiled binary on /tmp (auto-memory: external-volume-bun-exdev-traps). `bunx .` does not work; use `bun .` / `bun run lore`.

WORKFLOW: feature task = feature branch + PR into dev. The user reviews/merges; admin-merge ONLY on explicit "admin-merge" say-so (the user did authorize it for #9 — squash, matching the #5/#7/#8 convention). Backlog: lore is sole committer, CLI ONLY (backlog task edit …), never hand-edit backlog/**; claim -s "In Progress" -a @claude, finish -s Done --check-ac N --append-notes --final-summary, update CHANGELOG (Unreleased). Housekeeping (archived handovers) commits DIRECTLY to dev — NOT bundled into a feature PR. For rigorous review use /code-review max or ultra (NOT /review), and budget ≥2 passes for a foundational module (auto-memory: code-review-vs-review-command).
```

## State

| Item | Status |
| --- | --- |
| `dev` | `11946f5` (== origin/dev, clean) — contains `src/errors.ts` + `test/errors.test.ts` |
| PR #9 — `feat(LCLI-11)` → `dev` | **MERGED** (squash `11946f5`, 2026-06-23T13:14:32Z); branch deleted (local+remote) |
| LCLI-11 — shared error model | **Done** (on dev; ACs #1/#2; round-1/2/3/4 notes + summary recorded) |
| PR #6 — ECK⇄Lore alignment (`eck-alignment`) | **OPEN** — coordination thread; lore side complete (untouched this session) |
| LCLI-10 — `.lore` config loader | **To Do — NEXT** (m-1); buildable off dev now |
| LCLI-12 — output layer | **To Do — after LCLI-10** (m-1); wires `reportError`/`WarningCollector`, defines `OutputMode` |

## Next steps

1. Build **LCLI-10** (`.lore` config loader) → PR into dev. Claim via `backlog task edit LCLI-10 -s "In Progress" -a @claude` first.
2. Build **LCLI-12** (output layer `src/output.ts`) → PR into dev; define `OutputMode`, wire `errors.ts` via a resolved `{json,color}`.
3. (When relevant) the user reviews/merges each PR; `admin-merge` only on explicit say-so.

## Critical context / traps

- **`errors.ts` is on dev and is the foundation** — LCLI-10/12 import it; do not reinvent its surface. It is **mode-agnostic by design** (never resolves TTY/`NO_COLOR`/mode, never writes stdout). LCLI-12 owns mode resolution + defines `OutputMode` and passes `{json,color}` down. Do not add mode logic to `errors.ts`.
- **RESOLVED (was deferred):** the cli-contract §5.2 "single-line message" decision. Round-4 enforced it — `toErrorEnvelope`/`formatErrorText`/uncaught path collapse newlines in `message`/`hint` to a single line (a `singleLine()` helper); `input` is exempt (echoed structured data, newlines preserved/escaped). No open error-model decision remains.
- **Session was once renamed "lore-22"** — but **LCLI-22** (`managed-block.ts`, m-3) is gated by **LCLI-21** (`backlog.ts`, m-2) and is NOT next. Verified build order is **LCLI-10 → LCLI-12** (m-1). Confirm with the user before jumping to LCLI-21/22.
- **External-volume EXDEV** + **PATH-not-persisted** traps — see paste-ready prompt / auto-memory.
- **`backlog` CLI only** (never hand-edit `backlog/**`; config keeps check_active_branches/remote_operations/auto_commit = false, ADR-0012).

## Do not repeat

- **A single `/code-review max` pass is not exhaustive.** On PR #9, a round-4 `/code-review max` (34 agents) found **9 real defects** after round-3's max pass had already been applied — incl. an info-leak (empty-`message` object dumped whole), a breaking `error_type` rename un-propagated to the agent runbook, an array under a contract-`object` field, and `__proto__`/`toJSON`-key serialization divergences. For a foundational module budget ≥2 passes; treat "passed a max review once" as necessary-not-sufficient (auto-memory: `code-review-vs-review-command`).
- **A handover label is not proof of rigor** — verify *which* review actually ran (`/code-review` vs `/review`) before trusting a "reviewed" claim.
- **`safeStringify`:** the shipped version is a recursive `toJsonSafe` (ancestor-Set cycle detection, honors `toJSON` **with the property key**, `Object.create(null)` so `__proto__` survives, per-field `[Unserializable]`). Don't reintroduce a WeakSet replacer + `String(value)` fallback (drops `error_type`, mislabels diamonds).
- **Don't bundle housekeeping into a feature PR** — archived handovers go directly to dev (precedent: 9511d27, 03aeb31, d70bfe6).

## System of record updated (this session)

- **Backlog (LCLI-11):** round-4 `/code-review max` review note appended (9 findings + fixes); already Done with ACs #1/#2 checked.
- **Repo (dev, via merged PR #9 squash `11946f5`):** `src/errors.ts` + `test/errors.test.ts` (52 tests), `CHANGELOG.md` (Unreleased, refined for single-line message/hint + non-array input), `docs/runbooks/agent-onboarding.md` (`validation_or_drift` → `validation`/`drift`), plus the round-1..3 doc syncs (cli-contract §5.1, lore-design §4.1).
- **Auto-memory:** updated `code-review-vs-review-command` (single max pass not exhaustive; ≥2 passes for core).
- **Repo (dev, direct housekeeping):** this handover supersedes the pre-merge `HANDOVER-2026-06-23-lore-10-12-core.md`, archived to `archive/handovers/` on dev.
