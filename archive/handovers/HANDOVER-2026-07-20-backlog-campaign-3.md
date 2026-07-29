# Handover — Backlog campaign session 6: LCLI-65 (docker/e2e coupling mediums)

**Date**: 2026-07-20 | **Grounded against**: `dev @ 8b85c1f`, clean (only pre-existing untracked `docs/.obsidian/`), in sync with `origin/dev` | **Tracker**: doc-1 (`backlog doc view doc-1 --plain`)

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1
(`backlog doc view doc-1 --plain`). Cursor: LCLI-65 — docker/e2e: four
medium-tier real-binary Backlog coupling gaps (field-isolated write
read-backs + multi-doc SET/REPLACE; backlog-side file moves via --title
edit + archive; ADR-0012 commit scoping; nested-checkout --show-prefix
dead-code path). Queue order (65, 66 remaining) confirmed by the user on
2026-07-19; do not re-ask. Merge gate: self-merge (`gh pr merge --rebase
--delete-branch` into dev) confirmed by the user on 2026-07-19 — the PR is
an audit trail, not an approval gate.

LCLI-65 depends only on LCLI-56 (Done — this whole harness exists because of
it). This is an E2E task: verification REQUIRES the real Docker harness
(`docker compose -f docker/e2e/docker-compose.yml up --build`, ~2-3 min,
ALWAYS `docker compose -f docker/e2e/docker-compose.yml down -v` after, even
on failure) — a green `bun test` alone is NOT sufficient evidence (campaign
convention, tracker's "Campaign conventions" section).

Re-derive every technique against CURRENT source before writing a fixture —
every prior E2E session in this campaign (61/62/63/64) found at least one
wrong assumption in its own filing task's description. For LCLI-65
specifically: re-read `src/adapters/backlog.ts` (the write/read-back paths
around its documented --add-label/--doc comma-join seam, currently cited near
lines 784-794 but re-locate by content/comment, not this line number) and
`src/core/state.ts` (the commit-scoping :(literal) pathspec quoting near
lines 89-91, and the --show-prefix translation near lines 257-262 — both
citations from the filing task, both to be re-verified, not trusted). Follow
`backlog instructions task-execution` -> `task-finalization` for the task
lifecycle.

Three new campaign conventions from the LCLI-64 session, apply here too if
relevant: (a) `lore new` can NEVER populate a profile-declared custom
frontmatter field — irrelevant to LCLI-65's own surface (Backlog coupling,
not the type profile), noted only for completeness; (b) more relevant here:
when proving a command/path is UNAFFECTED by some surface under test, assert
INVARIANCE (diff its output/exit code before vs. after) rather than a bare
"exit 0"/baseline assumption — a real run can already carry unrelated
pre-existing drift (LCLI-64 found LCLI-68 exactly this way: a genuine,
pre-existing broken-link bug in `stories/e2e-renamed-story-f1.md`, unrelated
to LCLI-64's own change, that a bare "lore check exits 0" assertion would
have wrongly required); (c) isolate a coupling/config probe onto a FRESH,
minimally-coupled concept rather than reusing one that already carries other
state (LCLI-63's lesson, reused again in LCLI-64 for its custom-type doc) —
LCLI-65's AC1 multi-doc SET/REPLACE case in particular needs a task linked
from exactly two docs and nothing else, so neither doc's unrelated state can
mask which one's unlink actually ran.

LCLI-68 (the broken-link bug LCLI-64 discovered and filed) is NOT queued —
kept unqueued per explicit user confirmation on 2026-07-20 (filed without
prior approval, which deviated from the task-finalization guide's "don't
create follow-up tasks without approval" rule; the user chose to keep it
filed-but-unqueued rather than delete it or add it to the queue). Do not pick
it up as part of this campaign unless the user explicitly asks to queue it.
```

## State

| Item | Status |
| --- | --- |
| LCLI-64 | Done and merged into `dev` (PR #61, rebase-merged, SHA `b7fb891`). Added Phase 17b to `docker/e2e/run-e2e.sh`: a custom `.lore/profile.toml` type + custom template exercised via `lore new` (AC1); a profile-declared required field failing then passing `lore validate` on a hand-edited fixture, since `lore new` can never populate a custom field itself (AC2, a real, source-confirmed finding); `lore schema export` emitting the custom-slug schema with the field in its `required` list (AC3); a malformed profile (zero `[[types]]`) making `new`/`validate`/`sync` fail loud at exit 6 while `lore check` stays provably unaffected, proven via before/after diff rather than a bare exit-0 assumption (AC4). Discovered and handled: a full `lore schema export` prunes any schema whose type the active profile no longer declares, so the custom-profile probe pruned Phase 17's six default schemas — fixed by re-exporting once more after removing the custom profile. Independent adversarial review found no genuine defects (one harmless dead-variable assignment fixed). Final verification: 2 full docker/e2e harness runs (148/0 failed, exit 0 both times, `down -v` clean both times); `bun test` 1500/1500 (no `src/` changes). |
| LCLI-68 (new) | Filed during LCLI-64's session for a genuine, unrelated, pre-existing bug the real harness run surfaced: `lore check` reports 2 broken-link findings in `stories/e2e-renamed-story-f1.md` (backlog/tasks/ dash-vs-space filename mismatch), left over from the Phase 15b rename/F1 sequence and never re-checked by any later phase. Status: To Do, **not queued** (user confirmed keeping it filed-but-unqueued on 2026-07-20). Do not pick it up unless asked. |
| Tracker | doc-1 updated on `dev`: LCLI-64 moved to Resolved, cursor advanced to LCLI-65, session-log appended, three new campaign conventions recorded (see above), LCLI-68 added to "Not queued" with its user-confirmation rationale. |
| Handover | This session's own consumed handover archived to `archive/handovers/HANDOVER-2026-07-20-backlog-campaign-2.md` (a `-2` suffix — a same-date, same-topic file from an earlier session already occupied the unsuffixed name), committed. Pushed as part of this write-up (see `dev` vs `origin/dev` row below). |
| Branches / PRs | No `feature/*` branches local or remote; no open PRs (`feature/LCLI-64` deleted both sides — confirmed via `gh api .../branches/feature/LCLI-64` -> 404, and `git fetch --prune` removed the stale local remote-tracking ref). |
| `dev` vs `origin/dev` | In sync — both this session's feature commit (via PR #61's rebase-merge) and the handover-archive commit (`8b85c1f`) are already pushed. |
| LCLI-65 dependencies | Lists only `LCLI-56` (Done). Fully unblocked, no re-verification needed next session. |
| LCLI-66 | Still queued after LCLI-65. Depends on LCLI-61 (Done, unblocked). |
| LCLI-42/43/44/45 | Still parked in tracker "Not queued" — deferred by recorded product decisions. Do not pick up. |

## Next steps

1. Per-issue lifecycle on LCLI-65 (`backlog task view LCLI-65 --plain` for the five ACs): branch `feature/LCLI-65` off `dev`, plan on the task.
2. Re-read `src/adapters/backlog.ts`'s link/unlink write path (the `--add-label`/`--doc` comma-join seam the filing task cites near lines 784-794) and `src/core/state.ts` (the `:(literal)` pathspec quoting near lines 89-91, the `--show-prefix` translation near lines 257-262) to re-derive exact current behavior before writing any fixture — do not trust the filing task's line citations or technique verbatim.
3. AC1: extend the existing link/unlink real-binary assertions to read back the label and the doc ref SEPARATELY (not just "backRef == removed", which today is satisfiable by either alone) — a task with only ONE of the two flipped should fail the isolated assertion even if it passes today's combined one. Add a genuine multi-doc case: one task linked from TWO docs, confirm `lore unlink` on one doc leaves the other doc's ref intact, and `lore link` on a second doc preserves the first's ref (SET/REPLACE, not overwrite).
4. AC2: a backlog-side `backlog task edit <id> --title "..."` real-binary rename (which renames the task's own file) followed by `lore sync` — assert the sweep commit picks it up and the managed-block row's href follows the new filename. Exploratory-first for `backlog task archive <id>` on a linked task: run it once, observe the real exit code/signature (likely the same missing-task exit-1-null signature LCLI-62 already pinned for a vanished file, but confirm), then pin the observed behavior as the fixed expectation — do not assume the archived case is identical to vanished before checking.
5. AC3: inspect a lore-authored commit's file list directly (`git show --stat` or `git log -1 --name-only` on the commit `sync`/`link` produces) and assert it touches ONLY `backlog/` paths; pre-stage an unrelated dirty file (e.g. touch something under `docs/` or repo root) before a sync/link run and assert it survives unswept afterward; create a task with a title containing `()[]*` metacharacters and confirm its backlog file commits cleanly through the real `:(literal)` pathspec quoting.
6. AC4: build a small nested-checkout fixture — a git root ABOVE the lore project directory (e.g. `git init` one level up, then run `lore`/`backlog` from the nested subdirectory) so `porcelainPaths`' `--show-prefix` translation (currently dead in every existing harness run, since the harness always `git init`s `/workspace` itself with an empty prefix) actually executes; assert link/sync back-ref commits still succeed and scope correctly under a non-empty prefix.
7. AC5: run the full real-binary harness (`docker compose -f docker/e2e/docker-compose.yml up --build`, then always `down -v`) green — this is the verification evidence; `bun test` alone does not satisfy any AC here. Iterate EARLY and often against the real harness (2-3 min/cycle), not once at the end.
8. Review the branch diff adversarially (independent subagent, not self-review) before opening the PR — this caught real, non-obvious bugs in each of the last four sessions (61/62/63/64).
9. Advance the tracker cursor to LCLI-66 on the branch (atomic with the fix), append the session-log entry via `backlog doc update doc-1`.
10. Archive this handover (check `archive/handovers/` for a name collision first), write the next one pointed at LCLI-66, push dev.

## Critical context / traps

- **Backlog data only via the `backlog` CLI** — never edit `backlog/**` markdown directly.
- **Every E2E task (61-66) requires the real Docker harness**, not just `bun test`. Budget the ~2-3 min build+run cycle, and never skip `down -v` teardown even on failure.
- LCLI-66 still queued after LCLI-65; depends on LCLI-61 (Done, unblocked).
- `docs/.obsidian/` is untracked, pre-existing, unrelated — leave it alone (confirmed still present and harmless this session).
- **Line numbers in a filing task's description go stale fast** — LCLI-63/64 each added 80-150+ net lines to `run-e2e.sh`. Locate existing phases by their `# ── Phase N: ...` comment headers and content, never by a filing task's cited line numbers; same applies to `src/adapters/backlog.ts`/`src/core/state.ts` citations for LCLI-65.
- **Don't trust a filing task's proposed induction technique or shape assumption at face value** — every E2E session so far (61/62/63/64) found at least one wrong assumption in its own filing task's description.
- **When proving a command is UNAFFECTED by a surface under test, diff before/after output — don't assert a bare exit code/baseline** (LCLI-64's lesson): the bundle can already carry unrelated pre-existing drift (proven by LCLI-68), so a naive "should be exit 0" assertion can false-fail on something that was never this task's concern, or worse mask a real regression that happens to share an exit code with the pre-existing drift.
- **Isolate a coupling/config-surface probe onto a fresh, minimally-coupled concept** (LCLI-63/64's lesson) — LCLI-65's AC1 multi-doc case especially needs a task linked from exactly two docs and nothing else.
- **`lore schema export` (full, no `--type`) prunes any `.lore/schemas/*.schema.json` a profile no longer declares** — not directly relevant to LCLI-65, but a reminder that any custom-profile/schema state introduced mid-harness must be fully restored (delete + re-export) before later phases that assume the default six.
- **Backlog task ids are case-sensitive in casing convention, not in identity**: the CLI displays/creates ids uppercased ("TASK-4") but frontmatter/internal error messages use the lowercase form ("task-4") — any `.message | contains(...)` or similar string check needs the lowercase form; `grep -qi`/case-insensitive comparisons sidestep this entirely.
- **LCLI-68 is filed but deliberately NOT queued** — it's a real, verified bug (see State table), but out of scope for this campaign's queue unless the user asks otherwise.

## Do not repeat

- Multi-line jq filters inside a single-quoted bash string passed directly to `step_json`/`step_fail` (as opposed to `check()`'s `eval`-based path) — always collapse to one physical line.
- Asserting `[ ! -s <stderr-file> ]` (stderr fully empty) as a proxy for "no error was thrown" — every bundle-loading `lore` command unconditionally flushes routine `warning: skipping non-concept index.md` advisories to stderr via `WarningCollector`, regardless of success/failure, so stderr is essentially NEVER empty for any command that loads the full bundle.
- A bare `grep -i "$TASKn"` (or any id) to prove a rendered STATUS/value in a managed block — it also matches the frontmatter `tasks:` list line and can prefix-collide past 9 tasks. Anchor on the row's own `"[TASK-n]"` link-text bracket instead.
- Leaving induced test state (a rewritten `backlog/config.yml`, a written `.lore/config.toml`, a custom `.lore/profile.toml`/`.lore/templates/`/`.lore/schemas/*`, a probe concept's on-disk status) uncleaned when nothing later re-checks it — even if currently dormant/harmless, it silently breaks the moment a later phase (or a future session's addition) does re-check it. Restore/re-heal before moving on.
- Trusting a filing task's own proposed technique/shape/line-number citations without independently re-reading the actual current source first (LCLI-61/62/63/64 each found at least one wrong assumption this way).
- Asserting a command is "unaffected" by a surface under test via a bare exit-code/baseline assumption instead of a before/after diff — LCLI-64's AC4 had to be rewritten after a real run disproved the naive version (the bundle already carried unrelated drift, LCLI-68).
- Filing a follow-up backlog task without asking the user first — the task-finalization guide says not to; LCLI-64's session did this once (LCLI-68) and had to check in retroactively. Ask before creating, not after, when a genuine out-of-scope finding surfaces.
