# Handover — Backlog campaign session 4: LORE-63 (docker/e2e reconciliation never value-asserted; custom status flows + .lore/config.toml surface never run)

**Date**: 2026-07-20 | **Grounded against**: `dev @ bf3b641`, clean (only pre-existing untracked `docs/.obsidian/`), 1 commit ahead of `origin/dev` (this session's archive commit — will be pushed as the final step of this handover's own write-up) | **Tracker**: doc-1 (`backlog doc view doc-1 --plain`)

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1
(`backlog doc view doc-1 --plain`). Cursor: LORE-63 — docker/e2e reconciliation
never value-asserted: (1) check's clean-bundle gates only prove sync wrote
something SELF-CONSISTENT, never that reconciled status/managed-block rows
match concrete literals; the first post-mutation sync only asserts
backlogCommit.committed, not filesChanged >= 1, which makes the later
idempotency check trivially satisfiable; (2) only frontmatter drift is
induced, never managed-BLOCK BODY drift (e.g. a corrupted rendered status
cell); (3) reconciliation only ever runs against the three DEFAULT statuses
— a custom status flow written to backlog/config.yml the way the real
binary writes it, and parseStatusFlow's validation-6 fail-loud branches
(src/adapters/backlog.ts:841-877), are never exercised; (4) the
.lore/config.toml [reconcile.overrides] surface + its malformed-TOML
fail-loud path are never exercised. Queue order (63, 64, 65, 66 remaining)
confirmed by the user on 2026-07-19; do not re-ask. Merge gate: self-merge
(gh pr merge --rebase --delete-branch into dev) confirmed by the user on
2026-07-19 — the PR is an audit trail, not an approval gate.

LORE-63 depends only on LORE-56 (Done) — unblocked. This is an E2E task:
verification REQUIRES the real Docker harness (`docker compose -f
docker/e2e/docker-compose.yml up --build`, ~2-3 min, ALWAYS `docker compose
-f docker/e2e/docker-compose.yml down -v` after, even on failure) — a green
`bun test` alone is NOT sufficient evidence (campaign convention, in the
tracker's "Campaign conventions" section).

Re-derive the exact current shape of docker/e2e/run-e2e.sh (the filing
task's own line-number references are from the 2026-07-19 audit at dev @
b8a4667 — re-verify against current HEAD; LORE-61 and LORE-62 both
confirmed prior sessions' line-number references stayed accurate but each
ALSO found at least one of the filing task's own technique/exit-code
assumptions was wrong — apply the same skepticism here, especially around
`backlog config set statuses` / how the real pinned binary actually writes
backlog/config.yml's `statuses:` key, and whatever `.lore/config.toml`'s
`[reconcile.overrides]` section actually looks like today in
src/config.ts). Follow backlog instructions task-execution ->
task-finalization for the task lifecycle.

Two NEW campaign conventions from the LORE-62 session, apply here too:
(a) when a jq assertion combines a boolean with an array generator inside
`and`/`or`, reduce the generator with `any(...)`/`all(...)` first — a bare
generator only leaves jq -e's exit status decided by the LAST emitted
item, which can pass BY COINCIDENCE rather than by testing the intended
condition (caught by adversarial review last session, not by the harness
itself); (b) every step_json/step_fail jq filter must stay on ONE physical
line — `jq -e "$filter"` receives `$filter` as a raw string with no bash
re-parsing, so a filter wrapped across lines inside a single-quoted bash
string embeds a literal backslash-newline that is a jq SYNTAX ERROR, not a
line continuation (this is different from `check()`'s `eval "$expr"`,
which correctly re-parses a backslash-continued multi-line expression as
fresh bash source). Iterate against the real docker harness EARLY and
often (2-3 min/cycle) rather than writing the whole diff blind — LORE-61
and LORE-62 both caught real bugs this way that pure code review missed
(LORE-62's first harness run surfaced 4 script-authoring bugs; the
independent adversarial review after that caught one MORE that both the
harness run and my own review had missed).
```

## State

| Item | Status |
| --- | --- |
| LORE-62 | Done and merged into `dev` (PR #59, rebase-merged). Three new real-binary E2E phases added (probe exit-6 stub binaries, missing-task signatures + lore-level consequences, linked-concept rename + F1 asymmetry). Independent adversarial review found and fixed one real issue (a jq `and`-with-generator construction that passed only by coincidence). Final verification: 3 full docker/e2e harness runs across the session, final run 108 passed/0 failed, exit 0; `bun test` 1500/1500 throughout. |
| Tracker | doc-1 updated on `dev`: LORE-62 moved to Resolved, cursor advanced to LORE-63, session-log appended, two new campaign conventions recorded (see above). |
| Handover | This session's own consumed handover archived to `archive/handovers/HANDOVER-2026-07-19-backlog-campaign-3.md` (note the `-3` suffix — two prior sessions already used this same date for their own archived handovers), committed. Not yet pushed — this session's remaining step. |
| Branches / PRs | No `feature/*` branches local or remote; no open PRs (`feature/LORE-62` deleted both sides — GitHub's own post-merge courtesy cleanup switched the local checkout back to `dev` and removed the local branch automatically, in addition to the remote `--delete-branch`). |
| LORE-63 dependencies | LORE-56 (Done) only — LORE-63 is unblocked. |
| LORE-64/65/66 | Still ahead in the queue after LORE-63. LORE-66 depends on LORE-61 (Done, unblocked). |
| LORE-42/43/44/45 | Still parked in tracker "Not queued" — deferred by recorded product decisions. Do not pick up. |

## Next steps

1. Per-issue lifecycle on LORE-63 (`backlog task view LORE-63 --plain` for the five ACs): branch `feature/LORE-63` off `dev`, plan on the task.
2. AC1: strengthen the first post-mutation `lore sync --json` assertion (run-e2e.sh's existing Phase 6, around the original L258-259 area — re-locate by content, not line number, since LORE-62 shifted every line number below Phase 5) to also assert `.data.filesChanged >= 1`, not just `.data.backlogCommit.committed == true` — the filing task's point is that today's assertion is satisfiable even if sync writes NOTHING new, which also makes the later idempotency check (`filesChanged == 0`) trivially true regardless of whether the FIRST sync actually did anything. Then value-assert the rendered managed-block rows: grep/jq the Story's managed `<!-- lore:tasks:begin -->` block content for the concrete status literals set in that phase (e.g. TASK1 → "In Progress", TASK2 → "Done"), not just structural markers.
3. AC2: induce managed-BLOCK BODY drift (not just the existing frontmatter `status:` sed) — corrupt a rendered status cell inside the `<!-- lore:tasks:... -->` markers directly (e.g. sed-replace a status word inside the table), then assert `lore check` catches it at exit 6 and `lore sync` heals it back to a clean `lore check` (exit 0).
4. AC3: write a CUSTOM (non-default) status flow to `backlog/config.yml`'s `statuses:` key the way the real pinned `backlog` binary actually writes it — verify the real shape first (`backlog config set` or whatever the pinned binary's own command is; do not assume the syntax, re-derive it against the running container) — then confirm reconciliation flows a task through the custom statuses end-to-end. Also drive `parseStatusFlow`'s validation-6 fail-loud branches (src/adapters/backlog.ts:841-877) with a malformed `statuses:` shape (not a list of strings) written directly to `backlog/config.yml`.
5. AC4: exercise `.lore/config.toml`'s `[reconcile.overrides]` surface — re-derive its exact current shape from `src/config.ts` before writing a fixture (don't assume the filing task's shape is exactly right, same discipline as LORE-61/62) — confirm an override is honored end-to-end via `lore sync`, and that a malformed TOML file at `.lore/config.toml` fails loud (this is the SAME malformed-config induction already used in Phase 24's existing exit-6-validation spot check — reuse that pattern rather than reinventing it, but this AC needs the override key exercised on the HAPPY path too, which the existing spot check does not cover).
6. AC5: run the full real-binary harness (`docker compose -f docker/e2e/docker-compose.yml up --build`, then always `down -v`) green — this is the verification evidence; `bun test` alone does not satisfy any AC here. Iterate EARLY and often against the real harness (2-3 min/cycle), not once at the end — this caught 5 real bugs across the LORE-61/62 sessions that pure code review alone missed.
7. Review the branch diff adversarially (independent subagent, not self-review) — this caught a real, non-obvious jq-construction bug in LORE-62 that both the harness run and self-review missed; keep using it.
8. Advance the tracker cursor to LORE-64 on the branch (atomic with the fix), append the session-log entry via `backlog doc update doc-1`.
9. Archive this handover (check `archive/handovers/` for a name collision first), write the next one pointed at LORE-64, push dev.

## Critical context / traps

- **Backlog data only via the `backlog` CLI** — never edit `backlog/**` markdown directly.
- **Every E2E task (61-66) requires the real Docker harness**, not just `bun test`. Budget the ~2-3 min build+run cycle, and never skip `down -v` teardown even on failure.
- LORE-64/65/66 still ahead in the queue after LORE-63; LORE-66 depends on LORE-61 (Done, unblocked).
- `docs/.obsidian/` is untracked, pre-existing, unrelated — leave it alone (confirmed still present and harmless this session).
- **Line numbers in the filing task's description are stale relative to current HEAD** — LORE-62 alone added ~150 lines to run-e2e.sh across three new phases inserted mid-file. Locate existing phases by their `# ── Phase N: ...` comment headers and content, never by the filing task's cited line numbers.
- **Don't trust a filing task's proposed induction technique or exit-code assumption at face value** — LORE-61 found `lore validate`'s exit 6 assumption was wrong; LORE-62 found the SAME discipline needed applying to check-vs-sync's stdout-emptiness asymmetry (an assumption I would have gotten wrong by analogy to `step_fail`'s "empty stdout" contract, had I not read `src/commands/check.ts` and `test/check.test.ts` directly first). Apply this to LORE-63's assumptions about how the real `backlog` binary writes `backlog/config.yml`'s `statuses:` key, and about `.lore/config.toml`'s exact `[reconcile.overrides]` shape — verify against `src/adapters/backlog.ts`/`src/config.ts` and a real container invocation before writing the assertion.
- **jq generator/`and`/`or` construction trap (new this session)**: `A and (.foo[]? | .bar == "x")` only checks the LAST emitted value from the generator, not "any" element — reduce with `any(...)`/`all(...)` first. Caught by adversarial review in LORE-62, not by the (green) harness run itself, because that specific test's data happened to make every element agree.
- **step_json/step_fail filters must be ONE physical line** — `jq -e "$filter"` gets the raw string with no bash re-parsing, so a backslash-continued multi-line filter embeds a literal backslash-newline that is a jq syntax error. (`check()`'s `eval "$expr"` does NOT have this problem — eval re-parses as fresh bash source, so backslash-continuation works there.)
- **Backlog task ids are case-sensitive in casing convention, not in identity**: the CLI displays/creates ids uppercased ("TASK-4") but frontmatter/internal error messages use the lowercase form ("task-4") — any `.message | contains(...)` or similar string check needs the lowercase form; `grep -qi`/case-insensitive comparisons sidestep this entirely.

## Do not repeat

- Multi-line jq filters inside a single-quoted bash string passed directly to `step_json`/`step_fail` (as opposed to `check()`'s `eval`-based path) — always collapse to one physical line.
- Asserting `[ ! -s <stderr-file> ]` (stderr fully empty) as a proxy for "no error was thrown" — every bundle-loading `lore` command unconditionally flushes routine `warning: skipping non-concept index.md` advisories to stderr via `WarningCollector`, regardless of success/failure, so stderr is essentially NEVER empty for any command that loads the full bundle. Use `step_fail`'s own idiom instead (check the LAST line of stderr for the specific envelope/absence expected), or don't assert stderr content at all when it isn't the actual signature under test.
- Hardcoding a directory/path name from memory or by analogy (typed "docs/spec" when the real directory is "docs/specs") — grep the actual `lore new <Type>` output or an existing successful reference in the same script before trusting a guessed path.
- Comparing an error message/field against a CLI-displayed-cased id string directly — always account for Backlog's internal lowercase convention (or use a case-insensitive comparison).
