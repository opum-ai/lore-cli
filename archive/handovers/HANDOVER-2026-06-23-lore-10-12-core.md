# Handover — PR #9 (LCLI-11) review-complete & merge-ready; build core LCLI-10 → LCLI-12 next

**Date**: 2026-06-23 | **Grounded against**: origin/dev=`03aeb31`, feat/lore-11-error-model=`be81f5e` (PR #9, == origin) | **Backlog**: LCLI-11 Done; LCLI-10/12 To Do (m-1)

## Paste-ready prompt for the next session

```
Continue building lore (OKF-native docs CLI, Bun+TS). Read docs/runbooks/dev-kickoff.md + docs/specs/lore-design.md (§2 module tree, §4 error model, §5 output layer) + docs/reference/cli-contract.md for constraints.

STATE: PR #9 (feat/lore-11-error-model → dev, HEAD be81f5e) is OPEN, MERGEABLE, ALL 4 CI CHECKS GREEN, and has had THREE review rounds applied (manual round-1; real multi-agent crash-safety round-2; official /code-review max round-3). It is merge-ready. origin/dev=03aeb31 (does NOT yet contain src/errors.ts). The user reviews/merges — do NOT self-merge unless told "admin-merge".

FIRST: gh pr view 9 --json state,mergeable / gh pr checks 9.
- If MERGED → git switch dev && git pull, then build LCLI-10.
- If OPEN → it is fully reviewed & mergeable; either wait for the user to merge, or (only on explicit say-so) admin-merge. LCLI-10 and LCLI-12 BOTH `import` src/errors.ts, so they must be branched off dev AFTER #9 merges (don't build them on a stack unless the user redirects — the user chose to let #9 land first).

THEN build core in this order — one feature branch + PR into dev per task, off freshly-merged dev:
- LCLI-10: .lore config loader (native Bun TOML, + env overlay; LORE_CONFLUENCE_TOKEN never persisted) — ADR-0013, tech-stack §8. Throws LoreError (usage/validation) from src/errors.ts. AC#1 config.toml committed + cache/ gitignored; AC#2 reconcile rules + link options configurable. Claim: backlog task edit LCLI-10 -s "In Progress" -a @claude.
- LCLI-12: output layer src/output.ts — resolve mode (--json > --plain > pretty; plain auto on non-TTY), success envelope {schemaVersion,kind,data} on stdout, pretty/plain renderers, NO_COLOR + TTY handling, truncation hints (total/shown/truncated/hint). Wire errors.ts: derive {json,color} from the resolved mode and pass to reportError()/WarningCollector.flush(). Define OutputMode = "json"|"plain"|"pretty" HERE (errors.ts is deliberately mode-agnostic). AC#1 JSON uses the envelope; AC#2 non-TTY auto-plain, --json overrides.

errors.ts PUBLIC API to build on (shipped in PR #9, do not reinvent): LoreError(type,message,hint?,input?); ErrorType = usage|not_found|denied|conflict|validation|drift; EXIT_OK=0, EXIT_UNCAUGHT=1, EXIT_CODES (2/3/4/5/6; validation+drift→6, frozen); exitCodeFor(unknown); toErrorEnvelope (omits empty hint; echoes only a non-null object input); formatErrorText(err,{color}); reportError(err,{json,color,stderr?})→exit code (crash-safe: safeStringify honors toJSON, handles cycles/BigInt/throwing-getter; uncaught path surfaces a thrown object's detail, never "[object Object]"); WarningCollector(add/count/isEmpty/list/flush — flush is non-draining); Writer interface.

TOOLCHAIN: Bun 1.2.23 at ~/.bun/bin/bun; PATH NOT persisted across Bash calls — prefix every bun cmd: export PATH="$HOME/.bun/bin:$PATH". Gates (all must pass before PR): bun test, bun run lint (Biome; lint:fix to auto-format), bun run typecheck (tsc strict). EXTERNAL-VOLUME TRAP: repo on /Volumes/external — `bun install --linker=isolated` and `bun build --compile` fail SILENTLY (0-byte binary); use plain `bun install`, verify any compiled binary on /tmp (auto-memory: external-volume-bun-exdev-traps).

WORKFLOW: feature task = feature branch + PR into dev (user reviews/merges). Backlog: lore is sole committer; CLI only (backlog task edit …), never hand-edit backlog/**; claim with -s "In Progress" -a @claude, finish -s Done --check-ac N --append-notes --final-summary, update CHANGELOG (Unreleased). Housekeeping (archived handovers) is committed DIRECTLY to dev — NOT bundled into a feature PR. For rigorous review use /code-review max or ultra (NOT /review — auto-memory: code-review-vs-review-command).
```

## State

| Item | Status |
| --- | --- |
| `origin/dev` | `03aeb31` (clean; does NOT contain `src/errors.ts` until #9 merges) |
| PR #9 — `feat(LCLI-11)` → `dev` (`be81f5e`) | **OPEN, MERGEABLE, all 4 CI checks green** — 3 review rounds applied; awaiting user merge |
| LCLI-11 — shared error model (`src/errors.ts`) | **Done** (on branch; ACs #1/#2 checked, round-1/2/3 notes + summary recorded) |
| PR #6 — ECK⇄Lore alignment (`eck-alignment`) | **OPEN** — coordination thread; lore side complete (untouched this session) |
| LCLI-10 — `.lore` config loader | **To Do — NEXT after #9 merges** (m-1) |
| LCLI-12 — output layer | **To Do — after LCLI-10** (m-1); wires `reportError`/`WarningCollector` |

## Next steps

1. `gh pr checks 9` / `gh pr view 9`; if merged → `git switch dev && git pull`.
2. Build **LCLI-10** (`.lore` config loader) → PR into dev (claim via backlog CLI first).
3. Build **LCLI-12** (output layer `src/output.ts`) → PR into dev; wire `errors.ts` via a resolved `{json,color}`.
4. **Resolve the one deferred review decision** (below) when convenient — small, non-blocking.

## Critical context / traps

- **LCLI-10/12 depend on `src/errors.ts`**, which lands on `dev` only when PR #9 merges. Build them off freshly-merged dev, not before. (`dev`=`03aeb31` has no errors.ts yet.)
- **`errors.ts` is mode-agnostic by design** — it never resolves TTY/`NO_COLOR`/mode and never writes stdout. LCLI-12 owns mode resolution and passes `{json,color}` down. Do not add mode logic to `errors.ts`.
- **DEFERRED DECISION (yours):** cli-contract §5.2 says `message` is single-line, but `errors.ts` passes it verbatim (a multi-line message spills across stderr lines in text mode; a test even codifies multi-line as accepted). Options: enforce single-line (collapse newlines, lossy) / drop the "single-line" claim from §5.2 / leave it to callers. Recorded in LCLI-11 notes.
- **Session was renamed "lore-22"** — but **LCLI-22** (`managed-block.ts`) is an **m-3** task gated by LCLI-21, NOT the next step. The verified build order is LCLI-10 → LCLI-12 (m-1). Confirm with the user before jumping to LCLI-22.
- **External-volume EXDEV** + **PATH-not-persisted** traps — see paste-ready prompt / auto-memory.
- **Do not self-merge** PRs; **`backlog` CLI only** (never hand-edit `backlog/**`; config keeps check_active_branches/remote_operations/auto_commit = false, ADR-0012).

## Do not repeat

- **A handover label is not proof of rigor.** This session a prior handover claimed PR #9 had a "max-effort review"; it was actually `/review max` (single-context, no subagents). A real `/code-review max` found 2 major bugs. Verify which review actually ran (auto-memory: `code-review-vs-review-command`).
- **`safeStringify` history:** round-1 used a WeakSet replacer + `String(value)` fallback — both wrong (dropped `error_type` on a throwing `toJSON`; mislabeled diamond refs `[Circular]`). The shipped version is a recursive `toJsonSafe` (ancestor-Set cycle detection, honors `toJSON`, per-field `[Unserializable]`). Don't reintroduce the replacer approach.
- **Don't bundle housekeeping into a feature PR** — archived handovers go directly to dev (precedent: 9511d27, 03aeb31). PR #9 carries only LCLI-11 code + that task's backlog metadata + CHANGELOG.
- `bunx .` does not work (Bun's bunx is registry-only); use `bun .` / `bun run lore`. Don't chase isolated-install failures locally — it's external-volume EXDEV, not a config bug (CI passes).

## System of record updated (this session)

- **Backlog (LCLI-11, on branch):** round-1/2/3 review notes appended; Done + ACs #1/#2 checked; final summary recorded. No other task touched.
- **Repo (PR #9 branch):** `src/errors.ts` + `test/errors.test.ts` (45 tests), `CHANGELOG.md` (Unreleased), `docs/reference/cli-contract.md` (§5.1 uncaught envelope; exit-6 label `validation`/`drift`), `docs/specs/lore-design.md` (§4.1 six ErrorTypes). Commits `7e24f70` (round-1), `52bb372` (round-2 crash-safety), `be81f5e` (round-3 /code-review max polish).
- **Auto-memory:** added `code-review-vs-review-command` (+ MEMORY.md index).
- **Repo (dev, direct housekeeping):** this handover supersedes `HANDOVER-2026-06-22-build-m0.md`, archived to `archive/handovers/` on dev.
