# Handover — build LCLI-12 output layer (LCLI-10 config loader MERGED to dev)

**Date**: 2026-06-24 | **Grounded against**: `dev`=`4bb5cb7` (== origin/dev, clean tree; no open PRs) | **Backlog**: LCLI-10 & LCLI-11 Done (both on dev); LCLI-12 To Do (m-1)

## Paste-ready prompt for the next session

```
Continue building lore (OKF-native docs CLI, Bun+TS). Read docs/runbooks/dev-kickoff.md + docs/specs/lore-design.md (§2 module tree, §4 error model, §5 output layer) + docs/reference/cli-contract.md (§4–§5, normative) before coding.

STATE: src/errors.ts (LCLI-11) AND src/config.ts (LCLI-10) are both MERGED on dev (PR #10 squash b7395b1, LCLI-10 Done). PR #6 (ECK alignment) also merged (squash 4bb5cb7). dev == origin/dev == 4bb5cb7, clean tree, NO open PRs. Config loader hardened across four /code-review max passes (BOM strip, token scan across table/array shapes, symmetric parent_page_id, reserved-key rejection).

NEXT = LCLI-12 (output layer, src/output.ts). Branch straight off dev: it imports errors.ts AND config.ts (both on dev) and defines OutputMode itself. Output mode is resolved from CLI flags + TTY (NOT config.toml). Claim first: backlog task edit LCLI-12 -s "In Progress" -a @claude.

LCLI-12 — output layer (src/output.ts):
- DEFINE OutputMode = "json" | "plain" | "pretty" HERE. errors.ts is deliberately mode-agnostic and does NOT define it.
- Resolve mode with locked precedence --json > --plain > pretty; PLAIN is auto-selected when stdout is NOT a TTY (so piped/redirected output is deterministic without a flag); --json always overrides.
- Success envelope {schemaVersion, kind, data} on STDOUT only (additive-only versioning; consumers tolerate unknown keys). `kind` names the result type (query|graph|check|…) so a --json consumer dispatches on it.
- Renderers: pretty (color on a TTY) and plain (ANSI-free, stable). Honor NO_COLOR (degrade pretty→no color). stdout = data, stderr = diagnostics (progress/warnings/errors never touch stdout).
- Truncation hints for read-heavy output: {total, shown, truncated, hint} e.g. "showing 30 of 120 — narrow with --type story".
- WIRE errors.ts: from the resolved mode derive {json, color} and pass to reportError(err,{json,color,stderr?}) and WarningCollector.flush({color,stderr?}). Do NOT add TTY/NO_COLOR/mode logic to errors.ts — output.ts owns it and passes a resolved {json,color} DOWN.
- AC#1: JSON uses the {schemaVersion, kind, data} envelope. AC#2: non-TTY auto-selects plain, --json overrides.

errors.ts PUBLIC API on dev (build on this; do NOT reinvent): LoreError(type,message,hint?,input?); ErrorType = usage|not_found|denied|conflict|validation|drift; EXIT_OK=0, EXIT_UNCAUGHT=1, EXIT_CODES (frozen: usage2/not_found3/denied4/conflict5/validation6/drift6), exitCodeFor(unknown); toErrorEnvelope(err)→ErrorEnvelope{error_type,message,hint?,input?} (message/hint single-lined, empty hint omitted, only a non-null NON-ARRAY object input echoed); formatErrorText(err,{color}) (single-line, error:/hint: lines); reportError(err,{json,color,stderr?})→exit code (crash-safe safeStringify; returns exitCodeFor(err)); WarningCollector(add/get count/get isEmpty/list/flush({color?,stderr?}) — flush is NON-draining); Writer interface {write(s)}. errors.ts resolves NO mode/TTY/NO_COLOR and never writes stdout.

config.ts PUBLIC API (now on dev; LCLI-12 likely won't need it): loadConfig({root?,env?})→LoreConfig{reconcile{mode,overrides},validate{externalLinks,promotePortability},confluence{baseUrl?,space?,parentPageId?,format,token?}}. Zero-config defaults on missing file; token env-only ($LORE_CONFLUENCE_TOKEN); bad config → LoreError("validation").

TOOLCHAIN: Bun 1.2.23 at ~/.bun/bin/bun; PATH is NOT persisted across Bash calls — prefix every bun cmd: export PATH="$HOME/.bun/bin:$PATH". Gates (all pass before PR): bun test, bun run lint (Biome; lint:fix to auto-format), bun run typecheck (tsc strict). EXTERNAL-VOLUME TRAP: repo on /Volumes/external — `bun install --linker=isolated` and `bun build --compile` fail SILENTLY (0-byte binary); use plain `bun install`, verify any compiled binary on /tmp (auto-memory: external-volume-bun-exdev-traps). `bunx .` does not work; use `bun .` / `bun run lore`. For TTY tests, drive stdout/stderr through an injected Writer + an explicit isTTY flag rather than poking process.stdout, so tests stay deterministic.

WORKFLOW: feature task = feature branch (feat/lore-12-<slug>) + PR into dev. Jeremy reviews/merges himself — do NOT self-merge; admin-merge ONLY on explicit "admin-merge" say-so. Backlog tasks are left In Progress with the PR open and marked Done ON MERGE (LCLI-10/LCLI-11 precedent), via backlog CLI ONLY (never hand-edit backlog/**): claim -s "In Progress" -a @claude; on finish check ACs + --append-notes + --final-summary; update CHANGELOG (Unreleased). Housekeeping (archived handovers) commits DIRECTLY to dev — NOT bundled into a feature PR. For a foundational module use /code-review max or ultra (NOT /review) and budget ≥2 passes (auto-memory: code-review-vs-review-command).
```

## State

| Item | Status |
| --- | --- |
| `dev` | `4bb5cb7` (== origin/dev, clean; no open PRs) — `src/errors.ts` (LCLI-11) + `src/config.ts` (LCLI-10) + `ECK-ALIGNMENT.md` (PR #6) |
| PR #10 — `feat(LCLI-10)` config loader | **MERGED** (squash `b7395b1`, 2026-06-24T00:50:34Z); branch deleted (local+remote) |
| LCLI-10 — `.lore` config loader | **Done** (on dev; ACs #1/#2; 4 `/code-review max` rounds recorded). `src/config.ts` + `test/config.test.ts` (88 tests) + committed `.lore/config.toml` |
| LCLI-11 — shared error model | **Done** (on dev) |
| PR #6 — ECK⇄Lore alignment | **MERGED** (squash `4bb5cb7`) — `ECK-ALIGNMENT.md` on dev; D10 config-drift fixed (flags now false). ECK hand-back (D1/D2/D5 Discuss items) is Jeremy's |
| LCLI-12 — output layer | **To Do — NEXT** (m-1); buildable off dev now |

## Next steps

1. Build **LCLI-12** (`src/output.ts`) off `dev` → PR into dev. Claim via `backlog task edit LCLI-12 -s "In Progress" -a @claude` first. Define `OutputMode`; wire `errors.ts` via a resolved `{json,color}`.
2. Jeremy reviews/merges each PR; `admin-merge` only on explicit say-so.

## Critical context / traps

- **`errors.ts` is mode-agnostic by design** — it never resolves TTY/`NO_COLOR`/mode and never writes stdout. **LCLI-12 owns mode resolution, defines `OutputMode`, and passes `{json,color}` DOWN** to `reportError`/`WarningCollector.flush`. Do not push mode logic into `errors.ts`.
- **`config.ts` (LCLI-10) is now on dev** (`loadConfig({root?,env?})→LoreConfig`). LCLI-12 does not need it (output mode comes from flags + TTY, not config), but it is available if useful.
- **ssh-agent was DOWN at the end of this session** (`ssh-add -l` → no agent; `git push` over SSH fails `Permission denied (publickey)`). Pushes were routed through the gh token over HTTPS: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>`. Check `ssh-add -l` at session start; if down, restart the agent (`eval "$(ssh-agent -s)" && ssh-add`) or use the gh-credential HTTPS push. `gh pr merge --admin` works regardless (token auth).
- **Don't reinvent the `errors.ts` surface** — the paste-ready prompt lists it; build on it.
- **External-volume EXDEV** + **PATH-not-persisted** traps — see paste-ready prompt / auto-memory `external-volume-bun-exdev-traps`.
- **`backlog` CLI only** (never hand-edit `backlog/**`; config keeps check_active_branches/remote_operations/auto_commit = false, ADR-0012).

## Do not repeat

- **A single `/code-review max` pass is not exhaustive** — on PR #9 a round-4 max pass found 9 real defects after round-3's max pass was applied. For a foundational module (output.ts qualifies) budget ≥2 passes (auto-memory: `code-review-vs-review-command`).
- **A handover/“reviewed” label is not proof of rigor** — verify *which* review actually ran (`/code-review` vs `/review`).
- **Don't bundle housekeeping into a feature PR** — archived handovers go directly to dev (precedent: 9511d27, 03aeb31, d70bfe6, and this session's archival of `lore-10-12-core`).
- **Don't mark a Backlog task Done at PR-open** — leave it In Progress until the PR merges (LCLI-10 is the live example).

## System of record updated (this session)

- **Backlog (LCLI-10):** claimed In Progress; plan recorded; ACs #1/#2 checked; implementation notes + final summary + a PR-#10 link comment appended. (Done deferred to merge.)
- **Repo (PR #10, branch `feat/lore-10-config-loader` @ `e632578`):** `src/config.ts` + `test/config.test.ts` (18 tests) + committed `.lore/config.toml`; `CHANGELOG.md` (Unreleased); `docs/specs/lore-design.md` §2 module tree + §2.4 (records `config.ts`, state.ts consumes it).
- **Repo (dev, direct housekeeping):** this handover supersedes `HANDOVER-2026-06-23-lore-10-12-core.md`, archived to `archive/handovers/` (as `…-core-2.md` — a `…-core.md` predecessor already exists there).
