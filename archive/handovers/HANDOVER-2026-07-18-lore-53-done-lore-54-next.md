# Handover — LCLI-53 done (probe migrated to upstream); LCLI-54 next; nothing committed yet (LCLI-53, LCLI-54, LCLI-5)

**Date**: 2026-07-18 | **Grounded against**: `dev` @ `d12dbd3` (7 files modified, uncommitted; 5 commits ahead of `origin/dev`, unrelated/pre-existing; no open PRs) | **Backlog**: LCLI-53 Done; LCLI-54 To Do (now unblocked); LCLI-5 In Progress (umbrella, unchanged)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`.

Context: last session implemented and verified LCLI-53 (migrate lore's Backlog.md
capability probe from this fork's --json shape to upstream's real shape, PR #790)
end-to-end, including a real clone-and-run of upstream's pinned commit — but did
NOT commit anything. 7 files sit modified in the working tree on `dev` directly
(no feature branch created):
  src/adapters/backlog.ts, test/backlog-adapter.test.ts, test/backlog-probe.test.ts,
  test/helpers.ts, docs/reference/backlog-cli-contract.md,
  docs/runbooks/backlog-json-patch.md, and the LCLI-53 task file itself
  (backlog/tasks/lore-53 - ....md, updated via the backlog CLI).

STOP AND ASK FIRST (asked once already last session, session ended before the user
answered): does the user want this committed as a feature branch + PR (the
project's normal pattern for real code changes — see [[lore-git-workflow]] memory),
or directly to dev? Do not assume or proceed with either without confirmation.

Once that's resolved and committed: LCLI-54 (rewrite src/adapters/backlog.ts's
EnvelopeSchema/parseEnvelope/listTasks/viewTask/searchTasks against upstream's real
--json contract, recapture golden fixtures, rewrite backlog-json-schema.md §1-7) is
now unblocked (LCLI-53 is its only dependency, and it's Done). Read
`backlog task view LCLI-54 --plain` for full ACs, and re-read
docs/reference/backlog-json-schema.md §8 plus the now-updated
docs/reference/backlog-cli-contract.md §5 and docs/runbooks/backlog-json-patch.md
§8.1 before touching code — they describe exactly what changed in LCLI-53 and what
LCLI-54 still owns.

Expect the same kind of scope-tracing work LCLI-53 needed: before editing
src/adapters/backlog.ts, grep every call site of EXPECTED_SCHEMA_VERSION, the
EnvelopeSchema Zod union's kind literals, and the `data` payload key across both
src/ and test/ — LCLI-53 found that the probe and a real listTasks() read hit the
identical `task list --json` subprocess call, so a naive shared-constant change
would have silently broken already-passing tests. LCLI-54's blast radius is much
larger (the actual read/write adapter, not just the probe), so budget real time
for this tracing step.
```

## State

| Item | Status |
| --- | --- |
| `dev` | `d12dbd3`, **7 files modified, uncommitted**, no feature branch created; still 5 commits ahead of `origin/dev` (pre-existing from before this session, unrelated to LCLI-53) |
| LCLI-53 | **Done** — probe migrated to upstream's real envelope shape, verified against a real locally-built copy of the pinned commit |
| LCLI-54 | To Do, **now unblocked** (its only dependency, LCLI-53, is Done) |
| LCLI-5 | In Progress; umbrella, unchanged this session |
| No open PRs, no feature branch | LCLI-53's implementation sits as uncommitted working-tree changes directly on `dev` — the user was asked whether to branch+PR or commit direct and had not answered before this handover was written |

## Next steps

1. **Ask the user first** (unanswered from last session): commit LCLI-53 as a feature branch + PR, or directly to `dev`? Don't proceed with either without confirmation.
2. Once committed: start LCLI-54 — `backlog task edit LCLI-54 -s "In Progress"`, read its full plain view, re-read `docs/reference/backlog-json-schema.md` §8 and the now-updated `docs/reference/backlog-cli-contract.md` §5 / `docs/runbooks/backlog-json-patch.md` §8.1 first.
3. Trace every call site of `EXPECTED_SCHEMA_VERSION`, the `EnvelopeSchema` Zod union's `kind` literals (`"taskList"`/`"task"`/`"searchResult"`), and the `data` payload key across `src/` and `test/` before editing — same discipline LCLI-53 needed, at a larger scale (this is the real read/write adapter, not just the probe).
4. Recapture golden fixtures (`test/support/record-backlog-goldens.ts`) against a real pinned-upstream build once the adapter itself is rewritten — the real-binary verification technique below (§ Critical context) is proven and reusable for this.

## Critical context / traps

- **`EXPECTED_SCHEMA_VERSION` (string `"1"`, the full adapter's) and `PROBE_SCHEMA_VERSION` (number `1`, new, probe-only) are deliberately separate constants** in `src/adapters/backlog.ts`. Do not merge them until LCLI-54 actually rewrites `EnvelopeSchema`/`parseEnvelope` onto upstream's shape — reusing the shared constant for the probe alone (tried and rejected this session) breaks every real read plus the golden-fixture tests project-wide, since they still target this fork's string/`data`-key shape. Same split applies to `TASK_LIST_KIND` (now `"task-list"`, probe-only) vs. the still-fork-shaped `"taskList"` literal hardcoded in the `EnvelopeSchema` Zod union (untouched, LCLI-54's to fix).
- **`probeBacklog`'s dry-run and a real `listTasks()` read issue the identical `["task", "list", "--json"]` argv.** Any shared fake-spawn test harness must distinguish "first call = the probe's own memoized dry-run" from "a later call = a real read" — `test/backlog-adapter.test.ts`'s `defaultProbe()` now does this by call order (first match → upstream-shaped `PROBE_ENVELOPE`; later match → the old fork-shaped `TASK_LIST` golden). LCLI-54 will likely need the mirror-image fix once the real read's expected shape flips too.
- **Real-binary verification technique (worked, reusable for LCLI-54):** clone `MrLesk/Backlog.md`, checkout the pinned commit (`22a091b570d44c4f302ca47e7fd36fa28ad8bcb0`), `bun install`, then run **interpreted** (`bun src/cli.ts ...`) — not `bun build --compile`, which silently fails on this repo's external-volume checkout ([[external-volume-bun-exdev-traps]]). `--version` needs `cwd` = upstream's own checkout dir (its `getVersion()` falls back to reading `package.json` from `cwd` when there's no build-time-embedded version) — a wrong `cwd` there silently returns whatever *that* directory's `package.json` says. First attempt this session ran `--version` with `cwd` = lore's own repo and got back lore's own `"0.0.0"`, which briefly looked like a real "the pinned commit reports an unreleased version below the floor" bug before the `cwd` mistake was caught; the corrected run (`cwd` = upstream's checkout) reported `1.48.0`, well above the floor. `task list --json` needs `cwd` = the real target project (lore's own repo, to get real task data) — the two calls need *different* `cwd`s.
- **No `package.json` dependency was added** (explicit user decision this session: lore hasn't shipped, so a manually-built pinned-commit binary for dev/test is enough for now; real dependency wiring is deferred until a tagged upstream release ships). `docs/runbooks/backlog-json-patch.md` §8.1 step 2 has been rewritten to state this — don't reintroduce the old (never-implemented) "future git dependency" language.

## Do not repeat

- Don't reuse `EXPECTED_SCHEMA_VERSION` for the probe's own schema-version check — traced this mid-session, would have broken `parseEnvelope`/`listTasks`/`viewTask`/the golden tests (all still fork-shaped); introduced the separate `PROBE_SCHEMA_VERSION` instead.
- Don't verify a real-build acceptance criterion ("passes against a real build of the pinned commit") with fake-spawn unit tests alone — a genuine clone+build+run caught the `cwd`-dependent version-string issue above that unit tests alone would have missed entirely.
- Don't commit or push without asking — asked once this session (feature branch+PR vs. direct-to-`dev`) and the session ended before the user answered; the working tree is intentionally left uncommitted rather than guessed at.

## System of record updated

- **LCLI-53** → plan, both ACs (reworded mid-task to reflect the docs-only/no-package.json decision), full implementation notes (envelope-split rationale, real-binary verification steps, test-harness fix details), final summary; marked **Done**.
- **`docs/reference/backlog-cli-contract.md` §5** → capability-probe section rewritten to describe upstream's shape as the current, live behavior; `MIN_BACKLOG_VERSION` explicitly noted as unchanged/non-discriminating; the "no `package.json` dependency yet" decision recorded.
- **`docs/runbooks/backlog-json-patch.md` §8.1 step 2** → replaced the never-implemented "future git dependency" language with the actual decision (manual build/PATH convention only, no `package.json` entry).
- **Old handover archived**: `HANDOVER-2026-07-18-lore-5-upstream-adoption.md` → `archive/handovers/` (its plan was executed this session: LCLI-53 picked up and finished). Not yet committed — see the uncommitted-state note above; commit this move together with whatever the user decides for LCLI-53's code changes.
